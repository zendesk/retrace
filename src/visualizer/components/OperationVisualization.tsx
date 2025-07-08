import * as React from 'react'
import { useEffect, useMemo, useState } from 'react'
import { Axis } from '@visx/axis'
import { Brush } from '@visx/brush'
import type { BrushHandleRenderProps } from '@visx/brush/lib/BrushHandle'
import type { Bounds } from '@visx/brush/lib/types'
import { Grid } from '@visx/grid'
import { Group } from '@visx/group'
import { LegendItem, LegendLabel, LegendOrdinal } from '@visx/legend'
import { PatternLines } from '@visx/pattern'
import { scaleBand, scaleLinear, scaleOrdinal } from '@visx/scale'
import { useTooltip } from '@visx/tooltip'
import {
  BAR_FILL_COLOR,
  DETAILS_PANEL_WIDTH,
  type FilterOption,
} from '../constants'
import { useSpanExpansion } from '../hooks/useSpanExpansion'
import type {
  HierarchicalOperation,
  HierarchicalSpanAndAnnotation,
} from '../types'
import { FilterGroup } from './FilterGroup'
import InteractiveSpan from './InteractiveSpan'
import { LegendGroup } from './Legend'
import SpanDetails from './SpanDetails'
import {
  Container,
  Footer,
  FooterContent,
  Header,
  ScrollContainer,
  StyledRect,
  StyledTooltip,
  Title,
  TooltipContent,
  TooltipTitle,
} from './styled'

const DEFAULT_MARGIN = { top: 50, left: 200, right: 20, bottom: 0 }

const GROUP_HEIGHT = 20
const FOOTER_HEIGHT = 100
const FOOTER_SCALE_HEIGHT = 30
const MINIMAP_HEIGHT = 25

export interface OperationVisualizationProps {
  width: number
  operation: HierarchicalOperation
  setDisplayOptions: React.Dispatch<
    React.SetStateAction<Record<FilterOption, boolean>>
  >
  displayOptions: Record<FilterOption, boolean>
  margin?: { top: number; right: number; bottom: number; left: number }
}

// Define a custom handle component
function BrushHandle({ x, height, isBrushActive }: BrushHandleRenderProps) {
  const pathWidth = 8
  const pathHeight = 15
  if (!isBrushActive) {
    return null
  }
  return (
    <Group left={x + pathWidth / 2} top={(height - pathHeight) / 2}>
      <path
        fill="#f2f2f2"
        d="M -4.5 0.5 L 3.5 0.5 L 3.5 15.5 L -4.5 15.5 L -4.5 0.5 M -1.5 4 L -1.5 12 M 0.5 4 L 0.5 12"
        stroke="#999999"
        strokeWidth="1"
        style={{ cursor: 'ew-resize' }}
      />
    </Group>
  )
}

const OperationVisualization: React.FC<OperationVisualizationProps> = ({
  width: containerWidth,
  operation,
  displayOptions,
  setDisplayOptions,
  margin = DEFAULT_MARGIN,
}) => {
  // Expansion state management using hook
  const expansionState = useSpanExpansion({
    initialExpandedSpans: operation.expandedSpanIds,
    persistKey: `operation-${operation.name}`,
  })

  const {
    // spanEvents,
    spanTypes,
    // uniqueGroups, // Now using visibleUniqueGroups for dynamic lane calculation
  } = operation

  // Get visible spans based on expansion state
  const spans: HierarchicalSpanAndAnnotation[] = useMemo(
    () => expansionState.getVisibleSpans(operation.spans),
    [operation.spans, expansionState],
  )

  // Calculate unique groups from visible spans for dynamic lane calculation
  const visibleUniqueGroups = useMemo(
    () => [...new Set(spans.map((span) => span.groupName))],
    [spans],
  )

  // Group spans by lane for easier processing
  const spansByLane = useMemo(() => {
    const laneMap = new Map<string, HierarchicalSpanAndAnnotation[]>()
    spans.forEach((span) => {
      if (!laneMap.has(span.groupName)) {
        laneMap.set(span.groupName, [])
      }
      laneMap.get(span.groupName)!.push(span)
    })
    return laneMap
  }, [spans])

  const [selectedSpan, setSelectedSpan] =
    useState<HierarchicalSpanAndAnnotation | null>(null)

  // Add new state to control zoom domain

  // Track zoom domain with state that can be overridden by brush interactions
  const [zoomOverride, setZoomOverride] = useState<[number, number] | null>(
    null,
  )

  // Derive zoom domain - use override if set, otherwise use full operation duration
  const zoomDomain = useMemo<[number, number]>(() => {
    const fullDomain: [number, number] = [0, operation.duration + 10]
    return zoomOverride ?? fullDomain
  }, [zoomOverride, operation.duration])

  // Adjust width when panel is open
  const width = selectedSpan
    ? containerWidth - DETAILS_PANEL_WIDTH
    : containerWidth

  // Render proportions - use visible groups for dynamic height calculation
  const height =
    visibleUniqueGroups.length * GROUP_HEIGHT + margin.top + margin.bottom

  const xMax = width - margin.left - margin.right
  const yMax = height - margin.bottom - margin.top

  // Brush scale for the minimap
  const xMinimapScale = useMemo(
    () =>
      scaleLinear({
        domain: [0, operation.duration + 10],
        range: [0, width - margin.left - margin.right],
      }),
    [operation.duration, width, margin.left, margin.right],
  )

  // Update domain on brush
  const handleMinimapBrushChange = (domain: Bounds | null) => {
    if (!domain) return
    setZoomOverride([domain.x0, domain.x1])
  }
  const handleMinimapReset = () => {
    setZoomOverride(null) // Reset to show full operation duration
  }

  // Make main xScale use zoomDomain
  const xScale = scaleLinear({
    domain: zoomDomain,
    range: [0, xMax],
  })

  const yScale = useMemo(
    () =>
      scaleBand({
        domain: visibleUniqueGroups,
        range: [0, yMax],
        padding: 0.2,
      }),
    [visibleUniqueGroups, yMax],
  )

  const colorScale = scaleOrdinal({
    domain: [...spanTypes],
    range: [...spanTypes].map((kind) => BAR_FILL_COLOR[kind]),
  })

  const {
    tooltipOpen,
    tooltipLeft,
    tooltipTop,
    tooltipData,
    hideTooltip,
    showTooltip,
  } = useTooltip<HierarchicalSpanAndAnnotation>()
  const handleSpanClick = (span: HierarchicalSpanAndAnnotation) => {
    // Just select the span - expansion is handled by lane headers
    setSelectedSpan(span)
  }

  const getBarOpacity = (entry: HierarchicalSpanAndAnnotation) => {
    if (
      selectedSpan &&
      selectedSpan.span.name === entry.span.name &&
      selectedSpan.span.startTime === entry.span.startTime
    ) {
      return 0.8 // Selected state
    }
    return 0.4 // Default state
  }

  // Add ref for scroll container
  const scrollContainerRef = React.useRef<HTMLDivElement>(null)

  // Handle escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && selectedSpan) {
        setSelectedSpan(null)
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => void document.removeEventListener('keydown', handleEscape)
  }, [selectedSpan])

  // Handle click outside
  const handleContainerClick = (event: React.MouseEvent) => {
    // Only handle clicks directly on the SVG or main container
    if (
      event.target === event.currentTarget ||
      (event.target as Element).tagName === 'svg'
    ) {
      setSelectedSpan(null)
    }
  }

  return (
    <Container>
      <ScrollContainer
        ref={scrollContainerRef}
        $isDetailsPanelOpen={selectedSpan !== null}
        onClick={selectedSpan ? handleContainerClick : undefined}
      >
        <Header>
          <Title>Operation: {operation.name}</Title>
        </Header>
        <main
          style={{
            marginTop: `-${Math.round(margin.top / 2)}px`,
          }}
        >
          <svg
            width={width}
            height={height}
            style={{ display: 'block' }}
            onClick={selectedSpan ? handleContainerClick : undefined}
          >
            <Group top={margin.top} left={margin.left}>
              <Grid
                xScale={xScale}
                yScale={yScale}
                width={xMax}
                height={yMax}
                numTicksRows={visibleUniqueGroups.length}
              />
              {/* {spanEvents.map((entry, index) => (
                <InteractiveSpan
                  key={`spanEvent-${index}`}
                  type="line"
                  data={entry}
                  xScale={xScale}
                  yScale={yScale}
                  yMax={yMax}
                  opacity={0.8}
                  showTooltip={showTooltip}
                  hideTooltip={hideTooltip}
                  onClick={() => void handleSpanClick(entry)}
                  scrollContainerRef={scrollContainerRef}
                />
              ))} */}

              {spans.map((entry, i) => (
                <React.Fragment key={`entry-${i}-${entry.span.id}`}>
                  <InteractiveSpan
                    type="bar"
                    data={entry}
                    xScale={xScale}
                    yScale={yScale}
                    yMax={yMax}
                    opacity={getBarOpacity(entry)}
                    showTooltip={showTooltip}
                    hideTooltip={hideTooltip}
                    onClick={() => void handleSpanClick(entry)}
                    scrollContainerRef={scrollContainerRef}
                    depth={entry.depth}
                    hasChildren={entry.children.length > 0}
                    isExpanded={expansionState.isSpanExpanded(entry.span.id)}
                    isVisible={true}
                  />
                  {(entry.annotation.markedComplete ||
                    entry.annotation.markedPageInteractive) && (
                    <InteractiveSpan
                      type="line"
                      data={entry}
                      xScale={xScale}
                      yScale={yScale}
                      yMax={yMax}
                      annotateAt="top"
                      title={
                        entry.annotation.markedComplete &&
                        entry.annotation.markedPageInteractive
                          ? 'complete & interactive'
                          : entry.annotation.markedPageInteractive
                          ? 'interactive'
                          : 'complete'
                      }
                      opacity={0.8}
                      showTooltip={showTooltip}
                      hideTooltip={hideTooltip}
                      onClick={() => void handleSpanClick(entry)}
                      scrollContainerRef={scrollContainerRef}
                      depth={entry.depth}
                      hasChildren={entry.children.length > 0}
                      isExpanded={expansionState.isSpanExpanded(entry.span.id)}
                      isVisible={true}
                    />
                  )}
                </React.Fragment>
              ))}
              {/* Custom lane headers with expansion controls */}
              {visibleUniqueGroups.map((groupName) => {
                const laneSpans = spansByLane.get(groupName) ?? []
                const parentSpans = laneSpans.filter(
                  (span) => span.children.length > 0,
                )
                const hasExpandableContent = parentSpans.length > 0
                const yPosition = yScale(groupName) ?? 0
                const textStartX = hasExpandableContent
                  ? -margin.left + 35
                  : -margin.left + 15
                const maxTextWidth = -textStartX

                // Simple character-based estimation for truncation
                // Using average character width of ~6px for 10px font
                const avgCharWidth = 6
                const maxChars = Math.floor(maxTextWidth / avgCharWidth)
                const displayText =
                  groupName.length > maxChars
                    ? `${groupName.slice(0, maxChars - 3)}...`
                    : groupName

                return (
                  <g key={`lane-header-${groupName}`}>
                    {/* Background for lane header */}
                    <rect
                      x={-margin.left}
                      y={yPosition}
                      width={margin.left - 10}
                      height={yScale.bandwidth()}
                      fill="transparent"
                    />

                    {/* Expansion control for lanes with expandable spans */}
                    {hasExpandableContent && (
                      <g>
                        <circle
                          cx={-margin.left + 15}
                          cy={yPosition + yScale.bandwidth() / 2}
                          r={8}
                          fill="#f0f0f0"
                          stroke="#ccc"
                          strokeWidth={1}
                          style={{ cursor: 'pointer' }}
                          onClick={() => {
                            // Toggle expansion for all parent spans in this lane
                            parentSpans.forEach((span) => {
                              expansionState.toggleSpanExpansion(span.span.id)
                            })
                          }}
                        />
                        <text
                          x={-margin.left + 15}
                          y={yPosition + yScale.bandwidth() / 2}
                          dy="0.33em"
                          textAnchor="middle"
                          fontSize={10}
                          fill="#666"
                          style={{ cursor: 'pointer', pointerEvents: 'none' }}
                        >
                          {parentSpans.every((span) =>
                            expansionState.isSpanExpanded(span.span.id),
                          )
                            ? '−'
                            : '+'}
                        </text>
                      </g>
                    )}

                    {/* Lane label */}
                    <text
                      x={textStartX}
                      y={yPosition + yScale.bandwidth() / 2}
                      dy="0.33em"
                      textAnchor="start"
                      fontSize={10}
                      fill="#888"
                    >
                      <title>{groupName}</title>
                      {displayText}
                    </text>
                  </g>
                )
              })}
              {/* <Axis scale={xScale} top={yMax} /> */}
            </Group>
          </svg>
        </main>
        <Footer
          width={width}
          height={FOOTER_HEIGHT + FOOTER_SCALE_HEIGHT + MINIMAP_HEIGHT}
        >
          <svg
            width={width}
            height={FOOTER_SCALE_HEIGHT + MINIMAP_HEIGHT}
            style={{ display: 'block' }}
          >
            <Axis scale={xScale} top={1} left={margin.left} />
            <Group top={FOOTER_SCALE_HEIGHT} left={margin.left}>
              <PatternLines
                id="brush_pattern"
                height={8}
                width={8}
                stroke="#f6acc8"
                strokeWidth={1}
                orientation={['diagonal']}
              />
              <Brush
                xScale={xMinimapScale}
                yScale={scaleLinear({
                  domain: [0, 1],
                  range: [MINIMAP_HEIGHT, 0],
                })}
                margin={{
                  left: margin.left,
                  right: margin.right,
                }}
                width={xMinimapScale.range()[1]}
                height={MINIMAP_HEIGHT}
                handleSize={8}
                selectedBoxStyle={{
                  fill: 'url(#brush_pattern)',
                  stroke: 'red',
                }}
                onChange={handleMinimapBrushChange}
                onClick={handleMinimapReset}
                resizeTriggerAreas={['left', 'right']}
                brushDirection="horizontal"
                useWindowMoveEvents
                renderBrushHandle={(props) => <BrushHandle {...props} />}
              />
            </Group>
          </svg>
          <FooterContent>
            <FilterGroup setState={setDisplayOptions} state={displayOptions} />
            <LegendGroup>
              <LegendOrdinal
                scale={colorScale}
                labelFormat={(label) => `${label.toUpperCase()}`}
              >
                {(labels) => (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                    }}
                  >
                    {labels.map((label, i) => (
                      <LegendItem key={`legend-${i}`} margin="0 5px">
                        <svg width={15} height={15}>
                          <StyledRect
                            fill={label.value}
                            width={15}
                            height={15}
                          />
                        </svg>
                        <LegendLabel align="left" margin="0 0 0 4px">
                          {label.text}
                        </LegendLabel>
                      </LegendItem>
                    ))}
                  </div>
                )}
              </LegendOrdinal>
            </LegendGroup>
          </FooterContent>
        </Footer>
        {tooltipOpen && tooltipData && (
          <StyledTooltip top={tooltipTop} left={tooltipLeft}>
            <div>
              <TooltipTitle>{tooltipData.span.name}</TooltipTitle>
              <TooltipContent>
                <div>kind: {tooltipData.type}</div>
                <div>occurrence: {tooltipData.annotation.occurrence}</div>
                <div>
                  start:{' '}
                  {tooltipData.annotation.operationRelativeStartTime.toFixed(2)}
                  ms
                </div>
                <div>duration: {tooltipData.span.duration.toFixed(2)}ms</div>
              </TooltipContent>
            </div>
          </StyledTooltip>
        )}
      </ScrollContainer>
      <SpanDetails
        span={selectedSpan}
        onClose={() => void setSelectedSpan(null)}
      />
    </Container>
  )
}

// eslint-disable-next-line import/no-default-export
export default OperationVisualization
