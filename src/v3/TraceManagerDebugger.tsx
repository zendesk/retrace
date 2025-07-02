import { useEffect, useMemo, useRef, useState } from 'react'
import * as React from 'react'
import {
  formatMatcher,
  formatMs,
  getComputedResults,
  getConfigSummary,
  isSuppressedError,
} from './debugUtils'
import type { SpanAndAnnotation } from './spanAnnotationTypes'
import {
  type AllPossibleTraces,
  type FinalTransition,
  isTerminalState,
  type TraceStates,
} from './Trace'
import type { TraceManager } from './TraceManager'
import { CSS_STYLES, getDynamicStateStyle } from './TraceManagerDebuggerStyles'
import type {
  ComputedRenderSpan,
  ComputedSpan,
  TraceRecording,
} from './traceRecordingTypes'
import type {
  InterruptionReasonPayload,
  RelationSchemasBase,
  TraceContext,
  TraceDefinitionModifications,
} from './types'

// Constants to avoid magic numbers
const MAX_STRING_LENGTH = 20
const LONG_STRING_THRESHOLD = 25
const NAME = 'Retrace Debugger'

// Helper function to organize traces into parent-child hierarchy
function organizeTraces<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
>(traces: TraceInfo<RelationSchemasT>[]): TraceInfo<RelationSchemasT>[] {
  const organized: TraceInfo<RelationSchemasT>[] = []
  const traceMap = new Map<string, TraceInfo<RelationSchemasT>>()

  // Create a map for quick lookup
  for (const trace of traces) {
    traceMap.set(trace.traceId, trace)
  }

  // First pass: collect all parent traces
  const parentTraces = traces.filter(
    (trace) => !trace.traceContext?.input.parentTraceId,
  )

  // Recursive function to add children
  function addTraceWithChildren(trace: TraceInfo<RelationSchemasT>) {
    organized.push(trace)

    // Find and add children
    const children = traces.filter(
      (childTrace) =>
        childTrace.traceContext?.input.parentTraceId === trace.traceId,
    )

    // Sort children by start time
    children.sort((a, b) => a.startTime - b.startTime)

    for (const child of children) {
      addTraceWithChildren(child)
    }
  }

  // Sort parent traces by start time (newest first)
  parentTraces.sort((a, b) => b.startTime - a.startTime)

  // Add each parent and its children
  for (const parent of parentTraces) {
    addTraceWithChildren(parent)
  }

  return organized
}

// Helper function to check if a trace is a child trace
function isChildTrace<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
>(trace: TraceInfo<RelationSchemasT>): boolean {
  return !!trace.traceContext?.input.parentTraceId
}

// Helper function to find parent trace
function findParentTrace<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
>(
  trace: TraceInfo<RelationSchemasT>,
  allTraces: Map<string, TraceInfo<RelationSchemasT>>,
): TraceInfo<RelationSchemasT> | undefined {
  const parentId = trace.traceContext?.input.parentTraceId
  return parentId ? allTraces.get(parentId) : undefined
}

interface RequiredSpan {
  name: string
  isMatched: boolean
  definition?: Record<string, unknown>
}

interface TraceInfo<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
> {
  traceId: string
  traceName: string
  variant: string
  state: TraceStates
  requiredSpans: RequiredSpan[]
  attributes?: Record<string, unknown>
  lastRequiredSpanOffset?: number
  completeSpanOffset?: number
  cpuIdleSpanOffset?: number
  interruption?: InterruptionReasonPayload<RelationSchemasT>
  startTime: number
  relatedTo?: Record<string, unknown>
  // Store the trace context to be able to generate trace recordings later
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  traceContext?: TraceContext<any, RelationSchemasT, any>
  finalTransition?: FinalTransition<RelationSchemasT>
  liveDuration?: number
  totalSpanCount?: number
  hasErrorSpan?: boolean
  hasSuppressedErrorSpan?: boolean
  definitionModifications?: TraceDefinitionModifications<
    keyof RelationSchemasT,
    RelationSchemasT,
    string
  >[]
  computedSpans?: string[]
  computedValues?: string[]
}

const TRACE_HISTORY_LIMIT = 15

function getFromRecord<T>(
  record: Record<string, T> | undefined,
  key: string,
): T | undefined {
  return record && Object.hasOwn(record, key) ? record[key] : undefined
}

function TraceAttributes({
  attributes,
}: {
  attributes?: Record<string, unknown>
}) {
  if (!attributes || Object.keys(attributes).length === 0) return null

  return (
    <div className="tmdb-section">
      <div className="tmdb-section-title">Attributes</div>
      <div className="tmdb-def-chip-container">
        {Object.entries(attributes).map(([key, value]) => (
          // eslint-disable-next-line @typescript-eslint/no-use-before-define
          <DefinitionChip
            key={key}
            keyName={key}
            value={value}
            variant="default"
          />
        ))}
      </div>
    </div>
  )
}

type ChipVariant = 'default' | 'pending' | 'missing' | 'success' | 'error'

function DefinitionChip({
  keyName,
  value,
  variant = 'default',
}: {
  keyName: string
  value: unknown
  variant?: ChipVariant
}) {
  const valueIsComplex =
    value !== null &&
    (typeof value === 'object' ||
      (typeof value === 'string' && value.length > LONG_STRING_THRESHOLD))
  const stringValue =
    typeof value === 'object' ? JSON.stringify(value) : String(value)
  const needsTooltip =
    valueIsComplex || keyName.length + stringValue.length > MAX_STRING_LENGTH

  const displayValue =
    stringValue.length > MAX_STRING_LENGTH
      ? `${stringValue.slice(0, MAX_STRING_LENGTH)}...`
      : stringValue

  const getVariantClass = () => {
    switch (variant) {
      case 'pending':
        return 'tmdb-def-chip-pending'
      case 'missing':
        return 'tmdb-def-chip-missing'
      case 'success':
        return 'tmdb-def-chip-success'
      case 'error':
        return 'tmdb-def-chip-error'
      default:
        return ''
    }
  }

  const chipClassName = `tmdb-def-chip ${getVariantClass()} ${
    needsTooltip ? 'tmdb-def-chip-hoverable' : ''
  }`
  const popoverId = `tooltip-${keyName}-${Math.random()
    .toString(36)
    .slice(2, 9)}`

  return (
    <div className={chipClassName}>
      <button popoverTarget={popoverId} className="tmdb-tooltip-trigger">
        {keyName}: <span className="tmdb-def-chip-value">{displayValue}</span>
      </button>
      {needsTooltip && (
        <div
          id={popoverId}
          role="tooltip"
          popover="auto"
          className="tmdb-tooltip"
        >
          {typeof value === 'object'
            ? JSON.stringify(value, null, 2)
            : String(value)}
        </div>
      )}
    </div>
  )
}

function RequiredSpansList<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
>({
  requiredSpans,
  traceComplete,
}: {
  requiredSpans: RequiredSpan[]
  traceComplete: boolean
}) {
  return (
    <div className="tmdb-section">
      <div className="tmdb-section-title">
        Required Spans ({requiredSpans.filter((s) => s.isMatched).length}/
        {requiredSpans.length})
      </div>
      <div>
        {requiredSpans.map((span, i) => (
          <div
            key={i}
            className={`tmdb-required-item ${
              span.isMatched
                ? 'tmdb-required-item-matched'
                : 'tmdb-required-item-unmatched'
            }`}
          >
            <div className="tmdb-item-content">
              <span
                className={`tmdb-matched-indicator ${
                  span.isMatched
                    ? 'tmdb-matched-indicator-matched'
                    : 'tmdb-matched-indicator-unmatched'
                }`}
                title={span.isMatched ? 'Matched' : 'Pending'}
              />
              {span.definition ? (
                <div className="tmdb-def-chip-container">
                  <DefinitionChip
                    key={i}
                    keyName={String(i)}
                    value={span.name}
                    variant={
                      span.isMatched
                        ? 'default'
                        : traceComplete
                        ? 'missing'
                        : 'pending'
                    }
                  />
                </div>
              ) : (
                span.name
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function RenderComputedSpan({ value }: { value: ComputedSpan }) {
  if (!value) return null
  return (
    <span
      style={{
        marginLeft: 'var(--tmdb-space-m)',
        color: 'var(--tmdb-color-link-primary)',
      }}
    >
      start: {value.startOffset.toFixed(2)}ms, duration:{' '}
      {value.duration.toFixed(2)}ms
    </span>
  )
}
// Define our timeline point type with all the properties we need
interface TimelinePoint {
  name: string
  time: number
  color: string
  absoluteTime: number
  relativeTime?: number
  previousEvent?: string
}

const assignLanesToPoints = (
  pointsToAssign: readonly TimelinePoint[],
  currentScale: number,
  separationPercent: number,
): {
  pointData: TimelinePoint
  lane: number
}[] => {
  if (pointsToAssign.length === 0) return []

  const sortedPoints = [...pointsToAssign].sort((a, b) => a.time - b.time)
  const assignments: {
    pointData: TimelinePoint
    lane: number
  }[] = []
  const laneLastOccupiedX: Record<number, number> = {}

  for (const currentPoint of sortedPoints) {
    const currentPointLeftPercent = currentPoint.time * currentScale
    for (let l = 0; ; l++) {
      const lastXInLane = laneLastOccupiedX[l]
      if (
        lastXInLane === undefined ||
        currentPointLeftPercent - lastXInLane >= separationPercent
      ) {
        assignments.push({ pointData: currentPoint, lane: l })
        laneLastOccupiedX[l] = currentPointLeftPercent
        break
      }
    }
  }
  return assignments
}

function RenderBeaconTimeline({
  value,
  name,
}: {
  value: ComputedRenderSpan
  name: string
}) {
  if (!value) return null

  const {
    firstRenderTillLoading: loading,
    firstRenderTillData: data,
    firstRenderTillContent: content,
    startOffset,
  } = value

  const LABEL_ALIGN_LOW_THRESHOLD = 1
  const LABEL_ALIGN_HIGH_THRESHOLD = 99
  const MARKER_LINE_ALIGN_LOW_THRESHOLD = 0.1
  const MARKER_LINE_ALIGN_HIGH_THRESHOLD = 99.9
  const MIN_SEGMENT_WIDTH_PRODUCT_THRESHOLD = 0.001
  const MIN_TEXT_SEPARATION_PERCENT = 8
  const TIMELINE_MIDDLE_THRESHOLD = 50

  const timePointsForDisplay: TimelinePoint[] = []

  // Add start point with the startOffset value
  timePointsForDisplay.push({
    name: 'start',
    time: 0,
    absoluteTime: startOffset,
    color: 'var(--tmdb-timeline-start-marker)',
  })

  if (typeof loading === 'number')
    timePointsForDisplay.push({
      name: 'loading',
      time: loading,
      absoluteTime: startOffset + loading,
      relativeTime: loading,
      previousEvent: 'start',
      color: 'var(--tmdb-timeline-loading-marker)',
    })

  if (typeof data === 'number')
    timePointsForDisplay.push({
      name: 'data',
      time: data,
      absoluteTime: startOffset + data,
      relativeTime: typeof loading === 'number' ? data - loading : data,
      previousEvent: typeof loading === 'number' ? 'loading' : 'start',
      color: 'var(--tmdb-timeline-data-marker)',
    })

  if (typeof content === 'number')
    timePointsForDisplay.push({
      name: 'content',
      time: content,
      absoluteTime: startOffset + content,
      relativeTime:
        typeof data === 'number'
          ? content - data
          : typeof loading === 'number'
          ? content - loading
          : content,
      previousEvent:
        typeof data === 'number'
          ? 'data'
          : typeof loading === 'number'
          ? 'loading'
          : 'start',
      color: 'var(--tmdb-timeline-content-marker)',
    })

  const allRelevantTimes = [0, loading, data, content].filter(
    (t): t is number => typeof t === 'number',
  )
  const maxTime =
    allRelevantTimes.length > 0 ? Math.max(...allRelevantTimes) : 0
  const scale = maxTime > 0 ? 100 / maxTime : 0

  // Determine how many lanes we need for top and bottom areas
  const topPoints = timePointsForDisplay.filter((_, index) => index % 2 === 0)
  const bottomPoints = timePointsForDisplay.filter(
    (_, index) => index % 2 !== 0,
  )

  // Cast the TimelinePoint arrays to the type expected by assignLanesToPoints
  const processedTopPointsForDisplay = assignLanesToPoints(
    topPoints,
    scale,
    MIN_TEXT_SEPARATION_PERCENT,
  )
  const processedBottomPointsForDisplay = assignLanesToPoints(
    bottomPoints,
    scale,
    MIN_TEXT_SEPARATION_PERCENT,
  )

  const topLanes =
    processedTopPointsForDisplay.length > 0
      ? Math.max(...processedTopPointsForDisplay.map((item) => item.lane)) + 1
      : 1

  const bottomLanes =
    processedBottomPointsForDisplay.length > 0
      ? Math.max(...processedBottomPointsForDisplay.map((item) => item.lane)) +
        1
      : 1

  // Set up the bar segments
  const barSegments: {
    start: number
    end: number
    color: string
    key: string
  }[] = []
  let currentSegmentTime = 0
  if (typeof loading === 'number') {
    if (loading > currentSegmentTime) {
      barSegments.push({
        start: currentSegmentTime,
        end: loading,
        color: 'var(--tmdb-timeline-loading-segment-bg)',
        key: 'segment-to-loading',
      })
    }
    currentSegmentTime = Math.max(currentSegmentTime, loading)
  }
  if (typeof data === 'number') {
    if (data > currentSegmentTime) {
      barSegments.push({
        start: currentSegmentTime,
        end: data,
        color: 'var(--tmdb-timeline-data-segment-bg)',
        key: 'segment-to-data',
      })
    }
    currentSegmentTime = Math.max(currentSegmentTime, data)
  }
  if (typeof content === 'number' && content > currentSegmentTime) {
    barSegments.push({
      start: currentSegmentTime,
      end: content,
      color: 'var(--tmdb-timeline-content-segment-bg)',
      key: 'segment-to-content',
    })
  }
  if (barSegments.length === 0 && maxTime > 0) {
    let singleSegmentColor = 'var(--tmdb-timeline-default-segment-bg)'
    if (typeof content === 'number' && content === maxTime)
      singleSegmentColor = 'var(--tmdb-timeline-content-segment-bg)'
    else if (typeof data === 'number' && data === maxTime)
      singleSegmentColor = 'var(--tmdb-timeline-data-segment-bg)'
    else if (typeof loading === 'number' && loading === maxTime)
      singleSegmentColor = 'var(--tmdb-timeline-loading-segment-bg)'
    barSegments.push({
      start: 0,
      end: maxTime,
      color: singleSegmentColor,
      key: 'single-segment-fallback',
    })
  }
  const validBarSegments = barSegments.filter(
    (seg) =>
      seg.end > seg.start &&
      (seg.end - seg.start) * scale > MIN_SEGMENT_WIDTH_PRODUCT_THRESHOLD,
  )

  const uniqueTimesForLines = [
    ...new Set(timePointsForDisplay.map((p) => p.time)),
  ].sort((a, b) => a - b)

  // Calculate the height for each row based on lane count
  const TEXT_AREA_HEIGHT = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue(
      '--tmdb-timeline-text-area-height',
    ) || '22',
  )

  const TIMELINE_PADDING_BETWEEN_AREAS = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue(
      '--tmdb-timeline-padding-between-areas',
    ) || '2',
  )

  const BAR_HEIGHT_VALUE = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue(
      '--tmdb-timeline-bar-height',
    ) || '25',
  )

  const topAreaHeight = topLanes * TEXT_AREA_HEIGHT
  const bottomAreaHeight = bottomLanes * TEXT_AREA_HEIGHT

  // Function to generate display text with relative timing
  const getDisplayText = (point: TimelinePoint) => {
    if (point.name === 'start') {
      return `${point.name} @ ${startOffset.toFixed(0)}ms`
    }
    if (point.relativeTime !== undefined) {
      return `${point.name} +${point.relativeTime.toFixed(0)}ms`
    }
    return `${point.name} @ ${point.time.toFixed(0)}ms`
  }

  return (
    <div style={{ width: '100%' }}>
      <div
        style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}
      >
        <div className="tmdb-render-beacon-timeline-name">{name}</div>
        <div className="tmdb-render-stats-group">
          <span className="tmdb-render-stats-label">Renders</span>
          <span className="tmdb-render-stats-value">{value.renderCount}</span>
        </div>
        <div className="tmdb-render-stats-group">
          <span className="tmdb-render-stats-label">
            Sum of Render Durations
          </span>
          <span className="tmdb-render-stats-value">
            {value.sumOfRenderDurations.toFixed(0)}ms
          </span>
        </div>
      </div>

      {/* Timeline container using flexbox */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          position: 'relative', // For absolute positioned markers
        }}
      >
        {/* Top labels area */}
        <div
          style={{
            minHeight: topAreaHeight,
            width: '100%',
            position: 'relative',
            marginBottom: '2px',
          }}
        >
          {processedTopPointsForDisplay.map(
            ({ pointData: point, lane: currentLane }, index) => {
              const leftPercent = point.time * scale

              // Determine text positioning based on which half of the timeline it's on
              let transform = 'translateX(-50%)'

              if (leftPercent < LABEL_ALIGN_LOW_THRESHOLD) {
                transform = 'translateX(0%)'
              } else if (leftPercent > LABEL_ALIGN_HIGH_THRESHOLD) {
                transform = 'translateX(-100%)'
              } else if (leftPercent < TIMELINE_MIDDLE_THRESHOLD) {
                transform = 'translateX(5px)' // Add a small offset to the right
              } else {
                transform = 'translateX(calc(-100% - 5px))' // Offset to the left
              }

              return (
                <div
                  key={`${point.name}-combined-${point.time}`}
                  className="tmdb-timeline-point-label"
                  style={{
                    position: 'absolute',
                    top:
                      TIMELINE_PADDING_BETWEEN_AREAS +
                      currentLane * TEXT_AREA_HEIGHT,
                    left: `${leftPercent}%`,
                    transform,
                    color: point.color,
                    lineHeight: `var(--tmdb-timeline-text-height)`,
                    [leftPercent < TIMELINE_MIDDLE_THRESHOLD
                      ? 'borderLeft'
                      : 'borderRight']: `2px solid ${point.color}`,
                  }}
                >
                  {getDisplayText(point)}
                </div>
              )
            },
          )}
        </div>

        {/* Timeline bar area */}
        <div
          className="tmdb-timeline-bar"
          style={{
            height: BAR_HEIGHT_VALUE,
            position: 'relative', // Changed from absolute to relative
          }}
        >
          {validBarSegments.map((seg) => {
            const segmentWidthPercent = (seg.end - seg.start) * scale
            const segmentLeftPercent = seg.start * scale
            if (segmentWidthPercent <= 0) return null
            return (
              <div
                key={seg.key}
                className="tmdb-timeline-segment"
                style={{
                  left: `${segmentLeftPercent}%`,
                  width: `${segmentWidthPercent}%`,
                  background: seg.color,
                }}
                title={`${seg.key} (${seg.end - seg.start}ms)`}
              />
            )
          })}
        </div>

        {/* Bottom labels area */}
        <div
          style={{
            minHeight: bottomAreaHeight,
            width: '100%',
            position: 'relative',
            marginTop: '2px',
          }}
        >
          {processedBottomPointsForDisplay.map(
            ({ pointData: point, lane: currentLane }, index) => {
              const leftPercent = point.time * scale

              // Determine text positioning based on which half of the timeline it's on
              let transform = 'translateX(-50%)'

              if (leftPercent < LABEL_ALIGN_LOW_THRESHOLD) {
                transform = 'translateX(0%)'
              } else if (leftPercent > LABEL_ALIGN_HIGH_THRESHOLD) {
                transform = 'translateX(-100%)'
              } else if (leftPercent < TIMELINE_MIDDLE_THRESHOLD) {
                transform = 'translateX(5px)' // Add a small offset to the right
              } else {
                transform = 'translateX(calc(-100% - 5px))' // Offset to the left
              }

              return (
                <div
                  key={`${point.name}-combined-${point.time}`}
                  className="tmdb-timeline-point-label"
                  style={{
                    position: 'absolute',
                    top:
                      TIMELINE_PADDING_BETWEEN_AREAS +
                      currentLane * TEXT_AREA_HEIGHT,
                    left: `${leftPercent}%`,
                    transform,
                    color: point.color,
                    lineHeight: `var(--tmdb-timeline-text-height)`,
                    [leftPercent < TIMELINE_MIDDLE_THRESHOLD
                      ? 'borderLeft'
                      : 'borderRight']: `2px solid ${point.color}`,
                  }}
                >
                  {getDisplayText(point)}
                </div>
              )
            },
          )}
        </div>

        {/* Marker lines - positioned absolutely with correct direction */}
        {uniqueTimesForLines.map((timeVal) => {
          const pointConfig =
            timePointsForDisplay.find((p) => p.time === timeVal) ??
            timePointsForDisplay[0]!
          const leftPercent = timeVal * scale
          let lineLeftPositionStyle = `${leftPercent}%`
          let lineTransformStyle = 'translateX(-50%)'
          const markerLineWidth = Number.parseFloat(
            getComputedStyle(document.documentElement).getPropertyValue(
              '--tmdb-timeline-marker-line-width',
            ) || '2',
          )

          if (leftPercent < MARKER_LINE_ALIGN_LOW_THRESHOLD) {
            lineLeftPositionStyle = '0%'
            lineTransformStyle = 'translateX(0)'
          } else if (leftPercent > MARKER_LINE_ALIGN_HIGH_THRESHOLD) {
            lineLeftPositionStyle = `calc(100% - ${markerLineWidth}px)`
            lineTransformStyle = 'translateX(0)'
          }

          // Determine if this marker needs top line, bottom line, or both
          const pointIndex = timePointsForDisplay.findIndex(
            (p) => p.time === timeVal,
          )
          const needsTopLine = pointIndex % 2 === 0 // Even indexes (0, 2) are in top area
          const needsBottomLine = pointIndex % 2 !== 0 // Odd indexes (1, 3) are in bottom area

          return (
            <React.Fragment key={`line-${timeVal}`}>
              {needsTopLine && (
                <div
                  className="tmdb-timeline-marker-line"
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 'auto',
                    left: lineLeftPositionStyle,
                    transform: lineTransformStyle,
                    borderColor: pointConfig.color,
                    height: `calc(${topAreaHeight}px + 2px)`, // Extend to timeline bar with overlap
                    borderRight: 'none',
                    borderBottom: 'none',
                    borderTop: 'none',
                  }}
                />
              )}
              {needsBottomLine && (
                <div
                  className="tmdb-timeline-marker-line"
                  style={{
                    position: 'absolute',
                    top: `calc(${topAreaHeight}px + ${BAR_HEIGHT_VALUE}px - 2px)`, // Start slightly inside the bar
                    bottom: 0,
                    left: lineLeftPositionStyle,
                    transform: lineTransformStyle,
                    borderColor: pointConfig.color,
                    height: `calc(${bottomAreaHeight}px + 4px)`, // Extended height to ensure it covers full area
                    borderRight: 'none',
                    borderBottom: 'none',
                    borderTop: 'none',
                  }}
                />
              )}
            </React.Fragment>
          )
        })}
      </div>
    </div>
  )
}

function RenderComputedRenderBeaconSpans({
  computedRenderBeaconSpans,
}: {
  computedRenderBeaconSpans: Record<string, ComputedRenderSpan>
}) {
  return (
    <div className="tmdb-section">
      <div className="tmdb-section-title">Computed Render Beacon Spans</div>
      <ul className="tmdb-no-style-list">
        {Object.entries(computedRenderBeaconSpans).map(([name, value]) => (
          <li
            key={name}
            className="tmdb-list-item"
            style={{ display: 'block' }}
          >
            {' '}
            {/* Allow block for timeline */}
            <RenderBeaconTimeline value={value} name={name} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function downloadTraceRecording<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
>(recording: TraceRecording<any, RelationSchemasT>) {
  try {
    const recordingJson = JSON.stringify(recording, null, 2)
    const blob = new Blob([recordingJson], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `trace-${recording.id}-${recording.name}.json`
    document.body.append(a)
    a.click()
    setTimeout(() => {
      a.remove()
      URL.revokeObjectURL(url)
    }, 0)
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to generate trace recording:', error)
  }
}

function TraceItem<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
>({
  trace,
  isExpanded,
  onToggleExpand,
  onDismiss,
  isCurrentTrace = false,
  allTraces,
}: {
  trace: TraceInfo<RelationSchemasT>
  isExpanded: boolean
  onToggleExpand: () => void
  onDismiss: () => void
  isCurrentTrace?: boolean
  allTraces: Map<string, TraceInfo<RelationSchemasT>>
}) {
  const [isDefinitionDetailsExpanded, setIsDefinitionDetailsExpanded] =
    useState(false)

  const canDownloadRecording =
    (trace.state === 'complete' || trace.state === 'interrupted') &&
    !!trace.traceContext &&
    !!trace.finalTransition

  const isChild = isChildTrace(trace)
  const parentTrace = isChild ? findParentTrace(trace, allTraces) : undefined

  const traceRecording = useMemo(() => {
    if (trace.traceContext && trace.finalTransition) {
      return getComputedResults(trace.traceContext, trace.finalTransition)
    }
    return undefined
  }, [trace.traceContext, trace.finalTransition])

  const handleDownloadClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (traceRecording) {
      downloadTraceRecording(traceRecording)
    }
  }

  const handleDismissClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onDismiss()
  }

  // Determine the appropriate border class based on trace state
  const getBorderClass = () => {
    if (isCurrentTrace) return 'tmdb-history-item-current'
    if (trace.hasErrorSpan) return 'tmdb-history-item-error-border'
    if (trace.state === 'complete') return 'tmdb-history-item-complete'
    if (trace.state === 'interrupted') return 'tmdb-history-item-interrupted'
    return 'tmdb-history-item-default'
  }

  return (
    <div
      className={`tmdb-history-item ${getBorderClass()} ${
        isChild ? 'tmdb-history-item-child' : ''
      } ${trace.hasErrorSpan ? 'tmdb-history-item-error' : ''}`}
      style={{
        marginLeft: isChild ? 'var(--tmdb-space-xl)' : '0',
        position: 'relative',
      }}
    >
      {isChild && (
        <div
          className="tmdb-child-trace-indicator"
          style={{
            position: 'absolute',
            left: 'calc(-1 * var(--tmdb-space-xl) + 8px)',
            top: '50%',
            transform: 'translateY(-50%)',
            width: 'calc(var(--tmdb-space-xl) - 16px)',
            height: '2px',
            backgroundColor: 'var(--tmdb-color-border-light)',
            zIndex: 1,
          }}
        />
      )}
      <div
        className={`tmdb-history-header ${
          isExpanded ? 'tmdb-history-header-sticky' : ''
        }`}
        onClick={onToggleExpand}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--tmdb-space-m)',
          }}
        >
          {isChild && (
            <span
              className="tmdb-child-trace-badge"
              title={`Child trace of ${
                parentTrace?.traceName ?? 'unknown parent'
              }`}
              style={{
                fontSize: 'var(--tmdb-font-size-s)',
                color: 'var(--tmdb-color-text-secondary)',
                fontWeight: 'normal',
                marginRight: 'var(--tmdb-space-s)',
              }}
            >
              ↳
            </span>
          )}
          <strong style={{ fontSize: 'var(--tmdb-font-size-l)' }}>
            {trace.traceName}
          </strong>
          <span className={getDynamicStateStyle(trace.state)}>
            {trace.state}
          </span>
          {canDownloadRecording && (
            <button
              className="tmdb-button tmdb-download-button"
              onClick={handleDownloadClick}
              title="Download trace recording as JSON"
            >
              <span className="tmdb-download-icon">🔽&nbsp;JSON</span>
            </button>
          )}
          {(trace.hasErrorSpan || trace.hasSuppressedErrorSpan) && (
            <span
              className="tmdb-error-indicator"
              title={
                trace.hasSuppressedErrorSpan
                  ? 'Suppressed error span(s) seen'
                  : 'Error span(s) seen'
              }
            >
              {trace.hasErrorSpan ? '🚨' : '⚠️'}
            </span>
          )}
          {trace.definitionModifications &&
            trace.definitionModifications.length > 0 && (
              <span
                className="tmdb-definition-modified-indicator"
                title="Definition modified"
              >
                🔧
              </span>
            )}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--tmdb-space-m)',
          }}
        >
          <span className="tmdb-time-display">
            ({formatMs(trace.liveDuration)})
          </span>
          <div className="tmdb-chip tmdb-id-chip" title="Trace ID">
            {trace.traceId}
          </div>
          <span className="tmdb-time-display">
            {new Date(trace.startTime).toLocaleTimeString()}
          </span>
          <button
            className="tmdb-dismiss-button"
            onClick={handleDismissClick}
            title="Dismiss this trace"
          >
            ✕
          </button>
        </div>
      </div>
      <div className="tmdb-trace-info-row">
        <div
          style={{
            display: 'flex',
            gap: 'var(--tmdb-space-m)',
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <div className="tmdb-chip-group tmdb-variant-group">
            <span className="tmdb-chip-group-label">Variant</span>
            <span className="tmdb-chip-group-value">{trace.variant}</span>
          </div>

          <div className="tmdb-chip-group tmdb-items-group">
            <span className="tmdb-chip-group-label">Required</span>
            <span className="tmdb-chip-group-value">
              {trace.requiredSpans.filter((s) => s.isMatched).length}/
              {trace.requiredSpans.length}
            </span>
          </div>

          {trace.relatedTo && Object.keys(trace.relatedTo).length > 0 && (
            <div className="tmdb-chip-group tmdb-related-group">
              <span className="tmdb-chip-group-label">Related</span>
              <div className="tmdb-related-items">
                {Object.entries(trace.relatedTo).map(([key, value]) => (
                  <span key={key} className="tmdb-related-item">
                    {key}: {JSON.stringify(value)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {trace.interruption && (
            <div className="tmdb-chip-group tmdb-reason-group">
              <span className="tmdb-chip-group-label">Reason</span>
              <span className="tmdb-chip-group-value">
                {trace.interruption.reason}
                {trace.interruption.reason === 'another-trace-started'
                  ? ` (${trace.interruption.anotherTrace.name})`
                  : ''}
              </span>
            </div>
          )}

          {trace.lastRequiredSpanOffset !== undefined && (
            <div
              className="tmdb-chip-group tmdb-fcr-group"
              title="First Contentful Render (Last Required Span)"
            >
              <span className="tmdb-chip-group-label">FCR</span>
              <span className="tmdb-chip-group-value">
                {formatMs(trace.lastRequiredSpanOffset)}
              </span>
            </div>
          )}

          {trace.completeSpanOffset !== undefined && (
            <div
              className="tmdb-chip-group tmdb-lcr-group"
              title="Last Contentful Render (Trace Complete)"
            >
              <span className="tmdb-chip-group-label">LCR</span>
              <span className="tmdb-chip-group-value">
                {formatMs(trace.completeSpanOffset)}
              </span>
            </div>
          )}

          {trace.cpuIdleSpanOffset !== undefined && (
            <div
              className="tmdb-chip-group tmdb-tti-group"
              title="Time To Interactive (CPU Idle Span)"
            >
              <span className="tmdb-chip-group-label">TTI</span>
              <span className="tmdb-chip-group-value">
                {formatMs(trace.cpuIdleSpanOffset)}
              </span>
            </div>
          )}

          <div className="tmdb-chip-group tmdb-item-count-group">
            <span className="tmdb-chip-group-label">Spans</span>
            <span className="tmdb-chip-group-value">
              {trace.totalSpanCount ?? 0}
            </span>
          </div>
        </div>

        <div
          className={`tmdb-expand-arrow ${
            isExpanded ? 'tmdb-expand-arrow-up' : 'tmdb-expand-arrow-down'
          }`}
          onClick={onToggleExpand}
        >
          ▼
        </div>
      </div>

      {isExpanded && (
        <div
          className="tmdb-expanded-history"
          onClick={(e) => {
            void e.stopPropagation()
          }}
        >
          {/* Error Details Section - Show at the top if trace has error */}
          {traceRecording?.status === 'error' && traceRecording?.error && (
            <div className="tmdb-section tmdb-error-section">
              <div className="tmdb-section-title tmdb-error-title">
                🚨 Error Details
              </div>
              <div className="tmdb-error-content">
                <pre className="tmdb-error-text">
                  {traceRecording.error instanceof Error
                    ? `${traceRecording.error.name}: ${
                        traceRecording.error.message
                      }\n\n${traceRecording.error.stack ?? ''}`
                    : JSON.stringify(traceRecording.error, null, 2)}
                </pre>
              </div>
            </div>
          )}

          <TraceAttributes attributes={trace.attributes} />
          <RequiredSpansList
            requiredSpans={trace.requiredSpans}
            traceComplete={trace.state === 'interrupted'}
          />
          {(trace.computedValues?.length ?? 0) > 0 && (
            <div className="tmdb-section">
              <div className="tmdb-section-title">Computed Values</div>
              <div className="tmdb-def-chip-container">
                {(trace.computedValues ?? []).map((name) => {
                  const value = getFromRecord(
                    traceRecording?.computedValues,
                    name,
                  )

                  // Determine variant and display value based on trace state and value availability
                  let variant: ChipVariant = 'default'
                  let displayValue: unknown

                  if (
                    trace.state === 'complete' ||
                    trace.state === 'interrupted'
                  ) {
                    if (value !== undefined) {
                      variant = 'success'
                      displayValue = value
                    } else {
                      variant = 'missing'
                      displayValue = 'N/A'
                    }
                  } else {
                    variant = 'pending'
                    displayValue = 'pending'
                  }

                  return (
                    <DefinitionChip
                      key={name}
                      keyName={name}
                      value={displayValue}
                      variant={variant}
                    />
                  )
                })}
              </div>
            </div>
          )}

          {(trace.computedSpans?.length ?? 0) > 0 && (
            <div className="tmdb-section">
              <div className="tmdb-section-title">Computed Spans</div>
              <ul className="tmdb-no-style-list">
                {(trace.computedSpans ?? []).map((name) => {
                  const value = getFromRecord(
                    traceRecording?.computedSpans,
                    name,
                  )
                  return (
                    <li key={name} className="tmdb-list-item">
                      {name}
                      {trace.state === 'complete' ||
                      trace.state === 'interrupted' ? (
                        value ? (
                          <RenderComputedSpan value={value} />
                        ) : (
                          <span className="tmdb-computed-item-missing">
                            missing
                          </span>
                        )
                      ) : (
                        <span className="tmdb-computed-item-pending">
                          pending
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
          {traceRecording?.computedRenderBeaconSpans ? (
            <RenderComputedRenderBeaconSpans
              computedRenderBeaconSpans={
                traceRecording.computedRenderBeaconSpans
              }
            />
          ) : null}
          <div
            className="tmdb-definition-details-toggle"
            onClick={(e) => {
              e.stopPropagation()
              setIsDefinitionDetailsExpanded((prev) => !prev)
            }}
          >
            <span>{isDefinitionDetailsExpanded ? '−' : '+'}</span>
            Definition Details
          </div>
          {isDefinitionDetailsExpanded && (
            <>
              <div className="tmdb-section">
                <div className="tmdb-section-title">Trace Definition</div>
                <div className="tmdb-def-chip-container">
                  {(() => {
                    const { timeout, debounce, interactive } =
                      trace.traceContext
                        ? getConfigSummary(trace.traceContext)
                        : {}
                    return (
                      <>
                        {timeout != null && (
                          <DefinitionChip
                            keyName="Timeout"
                            value={`${formatMs(timeout)}`}
                            variant="default"
                          />
                        )}
                        {debounce != null && (
                          <DefinitionChip
                            keyName="Debounce"
                            value={`${formatMs(debounce)}`}
                            variant="default"
                          />
                        )}
                        {interactive != null && (
                          <DefinitionChip
                            keyName="Interactive"
                            value={`${formatMs(interactive)}`}
                            variant="default"
                          />
                        )}
                      </>
                    )
                  })()}
                </div>
              </div>
              {trace.definitionModifications &&
                trace.definitionModifications.length > 0 && (
                  <div className="tmdb-section">
                    <div className="tmdb-section-title">
                      Trace Definition Modifications
                    </div>
                    <ul className="tmdb-no-style-list">
                      {trace.definitionModifications.map((mod, i) => (
                        <li key={i} className="tmdb-list-item">
                          {JSON.stringify(mod)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export interface TraceManagerDebuggerProps<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
> {
  traceManager: TraceManager<RelationSchemasT>
  float?: boolean
  traceHistoryLimit?: number
}

/**
 * A component that visualizes the current state of the TraceManager and its Traces
 */
// eslint-disable-next-line import/no-default-export
export default function TraceManagerDebugger<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
>({
  traceManager,
  float = false,
  traceHistoryLimit = TRACE_HISTORY_LIMIT,
}: TraceManagerDebuggerProps<RelationSchemasT>) {
  const [traces, setTraces] = useState<
    Map<string, TraceInfo<RelationSchemasT>>
  >(new Map())
  const [expandedTraceId, setExpandedTraceId] = useState<string | null>(null)

  const removeTrace = (traceId: string) => {
    setTraces((prev) => {
      const newTraces = new Map(prev)
      newTraces.delete(traceId)
      return newTraces
    })
  }

  const [position, setPosition] = useState({ x: 10, y: 10 })
  const isDraggingRef = useRef(false)
  const dragOffsetRef = useRef({ x: 0, y: 0 })
  const [isMinimized, setIsMinimized] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!containerRef.current) return
    e.preventDefault()
    isDraggingRef.current = true
    dragOffsetRef.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    }
  }

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDraggingRef.current) return
    e.preventDefault()
    requestAnimationFrame(() => {
      setPosition({
        x: e.clientX - dragOffsetRef.current.x,
        y: e.clientY - dragOffsetRef.current.y,
      })
    })
  }

  const handleMouseUp = (e: MouseEvent) => {
    if (isDraggingRef.current) {
      e.preventDefault()
    }
    isDraggingRef.current = false
    dragOffsetRef.current = { x: 0, y: 0 }
  }

  useEffect(() => {
    if (float) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
      return () => {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
      }
    }
    return undefined
  }, [float])

  useEffect(() => {
    const schedule = (fn: () => void) => void setTimeout(fn, 0)
    const traceEntriesMap = new Map<
      string,
      SpanAndAnnotation<RelationSchemasT>[]
    >()

    const startSub = traceManager.when('trace-start').subscribe((event) => {
      const trace = event.traceContext as AllPossibleTraces<RelationSchemasT>
      const traceId = trace.input.id
      traceEntriesMap.set(traceId, [])
      const traceInfo: TraceInfo<RelationSchemasT> = {
        traceId,
        traceName: trace.definition.name,
        variant: trace.input.variant as string,
        state: trace.stateMachine.currentState,
        startTime: trace.input.startTime.epoch,
        attributes: trace.input.attributes
          ? { ...trace.input.attributes }
          : undefined,
        relatedTo: trace.input.relatedTo
          ? { ...trace.input.relatedTo }
          : undefined,
        requiredSpans: trace.definition.requiredSpans.map((matcher, index) => {
          const name = formatMatcher(matcher, index)
          return {
            name,
            isMatched: false,
            definition:
              (matcher.fromDefinition as Record<string, unknown>) ?? undefined,
          }
        }),
        traceContext: {
          definition: trace.definition,
          input: trace.input,
          recordedItemsByLabel: trace.recordedItemsByLabel,
          recordedItems: new Map(trace.recordedItems),
        },
        liveDuration: 0,
        totalSpanCount: 0,
        hasErrorSpan: false,
        hasSuppressedErrorSpan: false,
        definitionModifications: [],
        computedSpans: Object.keys(
          trace.definition.computedSpanDefinitions ?? {},
        ),
        computedValues: Object.keys(
          trace.definition.computedValueDefinitions ?? {},
        ),
      }
      schedule(() => {
        setTraces((prev) => {
          const newTraces = new Map(prev)
          newTraces.set(traceId, traceInfo)
          // Keep only the most recent TRACE_HISTORY_LIMIT traces
          if (newTraces.size > traceHistoryLimit) {
            const entries = [...newTraces.entries()]
            const oldestEntries = entries.slice(
              0,
              newTraces.size - traceHistoryLimit,
            )
            for (const [oldTraceId] of oldestEntries) {
              newTraces.delete(oldTraceId)
            }
          }
          return newTraces
        })
      })
    })

    const stateSub = traceManager
      .when('state-transition')
      .subscribe((event) => {
        const trace = event.traceContext as AllPossibleTraces<RelationSchemasT>
        const transition = event.stateTransition
        const traceId = trace.input.id
        const partialNewTrace = {
          traceContext: {
            definition: trace.definition,
            input: trace.input,
            recordedItemsByLabel: trace.recordedItemsByLabel,
            recordedItems: new Map(trace.recordedItems),
          },
          state: transition.transitionToState,
          attributes: trace.input.attributes
            ? { ...trace.input.attributes }
            : undefined,
          relatedTo: trace.input.relatedTo
            ? { ...trace.input.relatedTo }
            : undefined,
        } as const
        schedule(() => {
          setTraces((prev) => {
            const existingTrace = prev.get(traceId)
            if (!existingTrace) return prev

            const newTraces = new Map(prev)
            const updatedTrace: TraceInfo<RelationSchemasT> = {
              ...existingTrace,
              ...partialNewTrace,
            }
            if ('interruption' in transition) {
              updatedTrace.interruption = transition.interruption
            }
            if (
              'lastRequiredSpanAndAnnotation' in transition &&
              transition.lastRequiredSpanAndAnnotation
            ) {
              updatedTrace.lastRequiredSpanOffset =
                transition.lastRequiredSpanAndAnnotation.annotation.operationRelativeEndTime
            }
            if (
              'completeSpanAndAnnotation' in transition &&
              transition.completeSpanAndAnnotation
            ) {
              updatedTrace.completeSpanOffset =
                transition.completeSpanAndAnnotation.annotation.operationRelativeEndTime
            }
            if (
              'cpuIdleSpanAndAnnotation' in transition &&
              transition.cpuIdleSpanAndAnnotation
            ) {
              updatedTrace.cpuIdleSpanOffset =
                transition.cpuIdleSpanAndAnnotation.annotation.operationRelativeEndTime
            }
            if (isTerminalState(transition.transitionToState)) {
              updatedTrace.finalTransition =
                transition as FinalTransition<RelationSchemasT>
            }

            newTraces.set(traceId, updatedTrace)
            return newTraces
          })
        })
      })

    const spanSeenSub = traceManager
      .when('required-span-seen')
      .subscribe((event) => {
        const trace = event.traceContext as AllPossibleTraces<RelationSchemasT>
        const traceId = trace.input.id
        schedule(() => {
          setTraces((prev) => {
            const existingTrace = prev.get(traceId)
            if (!existingTrace) return prev

            const newTraces = new Map(prev)
            const updatedRequiredSpans = [...existingTrace.requiredSpans]
            const matchedSpan = event.spanAndAnnotation
            trace.definition.requiredSpans.forEach((matcher, index) => {
              if (matcher(matchedSpan, trace)) {
                updatedRequiredSpans[index] = {
                  ...updatedRequiredSpans[index]!,
                  isMatched: true,
                }
              }
            })

            newTraces.set(traceId, {
              ...existingTrace,
              requiredSpans: updatedRequiredSpans,
            })
            return newTraces
          })
        })
      })
    const addSpanSub = traceManager
      .when('add-span-to-recording')
      .subscribe((event) => {
        const trace = event.traceContext
        const traceId = trace.input.id
        if (!traceEntriesMap.has(traceId)) {
          traceEntriesMap.set(traceId, [])
        }
        const entries = traceEntriesMap.get(traceId)!
        entries.push(event.spanAndAnnotation)
        schedule(() => {
          setTraces((prev) => {
            const existingTrace = prev.get(traceId)
            if (!existingTrace) return prev

            const newTraces = new Map(prev)
            const liveDuration =
              entries.length > 0
                ? Math.round(
                    Math.max(
                      ...entries.map(
                        (e) => e.span.startTime.epoch + e.span.duration,
                      ),
                    ) - trace.input.startTime.epoch,
                  )
                : 0
            const totalSpanCount = entries.length
            const hasErrorSpan = entries.some(
              (e) => e.span.status === 'error' && !isSuppressedError(trace, e),
            )
            const hasSuppressedErrorSpan = entries.some(
              (e) => e.span.status === 'error' && isSuppressedError(trace, e),
            )

            newTraces.set(traceId, {
              ...existingTrace,
              liveDuration,
              totalSpanCount,
              hasErrorSpan,
              hasSuppressedErrorSpan,
            })
            return newTraces
          })
        })
      })

    const defModSub = traceManager
      .when('definition-modified')
      .subscribe(
        ({ traceContext: trace, modifications: eventModifications }) => {
          const traceId = trace.input.id
          schedule(() => {
            setTraces((prev) => {
              const existingTrace = prev.get(traceId)
              if (!existingTrace) return prev

              const newTraces = new Map(prev)
              newTraces.set(traceId, {
                ...existingTrace,
                traceContext: {
                  definition: trace.definition,
                  input: trace.input,
                  recordedItemsByLabel: trace.recordedItemsByLabel,
                  recordedItems: new Map(trace.recordedItems),
                },
                definitionModifications: [
                  ...(existingTrace.definitionModifications ?? []),
                  eventModifications,
                ],
              })
              return newTraces
            })
          })
        },
      )

    return () => {
      startSub.unsubscribe()
      stateSub.unsubscribe()
      spanSeenSub.unsubscribe()
      addSpanSub.unsubscribe()
      defModSub.unsubscribe()
    }
  }, [traceManager, traceHistoryLimit])

  // Convert Map to array and organize with parent-child relationships
  const organizedTraces = organizeTraces([...traces.values()])

  // Determine which traces are currently running (not in terminal state)
  const runningTraces = organizedTraces.filter(
    (trace) => !isTerminalState(trace.state),
  )

  let content: JSX.Element

  // eslint-disable-next-line unicorn/prefer-ternary
  if (float && isMinimized) {
    content = (
      <div className="tmdb-debugger-root">
        <button
          className="tmdb-minimized-button"
          onClick={() => void setIsMinimized(false)}
        >
          Traces
        </button>
      </div>
    )
  } else {
    content = (
      <>
        {float && (
          <div className="tmdb-handle" onMouseDown={handleMouseDown}>
            <h3 className="tmdb-handle-title">{NAME}</h3>
            <div>
              <button
                className="tmdb-close-button"
                onClick={() => void setIsMinimized(true)}
              >
                −
              </button>
            </div>
          </div>
        )}

        {!float && (
          <div className="tmdb-header">
            <h2 className="tmdb-title">{NAME}</h2>
          </div>
        )}

        {/* Added a wrapper for padding when floating, as tmdb-floating-container itself has padding 0 */}
        <div className={float ? 'tmdb-floating-content-wrapper' : ''}>
          {organizedTraces.length > 0 ? (
            // Removed specific padding here, rely on tmdb-floating-content-wrapper or tmdb-container
            <div>
              <h3 className="tmdb-history-title">
                <div className="tmdb-history-title-left">
                  Traces ({organizedTraces.length})
                  <a
                    href="https://zendesk.github.io/retrace/iframe.html?globals=&id=stories-visualizer-viz--operation-visualizer-story&viewMode=story"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="tmdb-button tmdb-visualizer-link"
                  >
                    Trace Visualizer
                  </a>
                </div>
                <div className="tmdb-history-title-right">
                  <button
                    className="tmdb-button tmdb-clear-button"
                    onClick={() => {
                      setTraces(new Map())
                      setExpandedTraceId(null)
                    }}
                  >
                    Clear
                  </button>
                </div>
              </h3>
              {organizedTraces.map((trace) => (
                <TraceItem
                  key={trace.traceId}
                  trace={trace}
                  isExpanded={expandedTraceId === trace.traceId}
                  isCurrentTrace={runningTraces.includes(trace)}
                  allTraces={traces}
                  onToggleExpand={() =>
                    void setExpandedTraceId(
                      expandedTraceId === trace.traceId ? null : trace.traceId,
                    )
                  }
                  onDismiss={() => {
                    removeTrace(trace.traceId)
                    if (expandedTraceId === trace.traceId) {
                      setExpandedTraceId(null)
                    }
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="tmdb-no-trace">No traces running or completed</div>
          )}
        </div>
      </>
    )
  }

  // wrap
  // eslint-disable-next-line unicorn/prefer-ternary
  if (float) {
    content = (
      <div
        ref={containerRef}
        className="tmdb-floating-container tmdb-debugger-root" // Base styles from CSS
        style={{
          top: `${position.y}px`,
          left: `${position.x}px`,
          // padding: 0, // Explicitly set by tmdb-floating-container or its content wrapper
        }}
      >
        {content}
      </div>
    )
  } else {
    content = <div className="tmdb-container tmdb-debugger-root">{content}</div>
  }

  // Apply root class for CSS variables to take effect
  return (
    <>
      <style>{CSS_STYLES}</style>
      {content}
    </>
  )
}
