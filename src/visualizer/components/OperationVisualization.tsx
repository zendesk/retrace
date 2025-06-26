/* eslint-disable no-magic-numbers */
/* eslint-disable import/no-extraneous-dependencies */
import * as React from 'react'
import { useEffect, useMemo, useState } from 'react'
import { Axis, AxisLeft } from '@visx/axis'
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
import type { HierarchicalOperation, HierarchicalSpanAndAnnotation } from '../types'
import { flattenHierarchicalSpans } from '../utils/buildSpanHierarchy'
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
  // State for expansion management
  const [expandedSpanIds, setExpandedSpanIds] = useState<Set<string>>(
    operation.expandedSpanIds
  )
  
  // Toggle span expansion
  const toggleSpanExpansion = (spanId: string) => {
    setExpandedSpanIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(spanId)) {
        newSet.delete(spanId)
      } else {
        newSet.add(spanId)
      }
      return newSet
    })
  }
  
  const {
    // spanEvents,
    spanTypes,
    uniqueGroups,
  } = operation
  
  // Get visible spans based on expansion state
  const spans: HierarchicalSpanAndAnnotation[] = useMemo(
    () => flattenHierarchicalSpans(operation.spans, expandedSpanIds),
    [operation.spans, expandedSpanIds]
  )

  const [selectedSpan, setSelectedSpan] =
    useState<HierarchicalSpanAndAnnotation | null>(null)

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

  // Render proportions
  const height = uniqueGroups.length * GROUP_HEIGHT + margin.top + margin.bottom

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
        domain: uniqueGroups,
        range: [0, yMax],
        padding: 0.2,
      }),
    [uniqueGroups, yMax],
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
    // Handle expansion toggle for spans with children
    if (span.children.length > 0) {
      toggleSpanExpansion(span.span.id)
    }
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
                numTicksRows={uniqueGroups.length}
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
                    />
                  )}
                </React.Fragment>
              ))}
              {/* Force white background for y axis labels */}
              <rect
                x={-margin.left}
                y={-10}
                width={margin.left}
                height={yMax + 20}
                fill="white"
              />
              <AxisLeft
                scale={yScale}
                numTicks={uniqueGroups.length}
                tickLabelProps={{
                  fill: '#888',
                  fontSize: 10,
                  textAnchor: 'end',
                  dy: '0.33em',
                  width: 100,
                }}
                tickFormat={(value) => value}
              />
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
                  <div style={{ display: 'flex', flexDirection: 'row' }}>
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
