/* eslint-disable no-magic-numbers */
/* eslint-disable import/no-extraneous-dependencies */

import * as React from 'react'
import styled, { useTheme } from 'styled-components'
import { Annotation, Label } from '@visx/annotation'
import { localPoint } from '@visx/event'
import { Bar, Line } from '@visx/shape'
import type { BarProps } from '@visx/shape/lib/shapes/Bar'
import type { LineProps } from '@visx/shape/lib/shapes/Line'
import type { AddSVGProps } from '@visx/shape/lib/types'
import { Text } from '@visx/text'
import type { WithTooltipProvidedProps } from '@visx/tooltip/lib/enhancers/withTooltip'
import type { ScaleBand, ScaleLinear } from '@visx/vendor/d3-scale'
import { getColor } from '@zendeskgarden/react-theming'
import { BAR_FILL_COLOR } from '../constants'
import type { HierarchicalSpanAndAnnotation } from '../types'

const interactiveStyles = `
  cursor: pointer;
  transition: all 0.2s ease-in-out;

  &:hover {
    filter: brightness(1.2);
  }
`

const MIN_SPAN_WIDTH = 10 // minimum width in pixels for any span bar

const StyledLine = styled(Line)`
  ${interactiveStyles}

  &:hover {
    stroke-opacity: 0.8;
    stroke-width: 3.5px;
  }
`

interface StyledBarProps {
  $isTiny?: boolean
  $fill?: string
}

const StyledBar = styled(Bar)<StyledBarProps>`
  ${interactiveStyles}

  &:hover {
    opacity: 0.7 !important;
    stroke: #fff;
    stroke-width: 2px;
  }

  ${(props) =>
    props.$isTiny &&
    `
    stroke: ${props.$fill};
    stroke-width: 2px;
    rx: 4px;

    &:hover {
      stroke-width: 3px;
      filter: brightness(1.3);
    }
  `}
`

interface SharedAnnotationProps {
  xScale: ScaleLinear<number, number, never>
  yScale: ScaleBand<string>
  yMax: number
  titleColor?: string
  title?: string
  annotateAt?: 'top'
  data: HierarchicalSpanAndAnnotation
  showTooltip: (
    data: Partial<WithTooltipProvidedProps<HierarchicalSpanAndAnnotation>>,
  ) => void
  hideTooltip: () => void
}

interface InteractiveLineSpanProps
  extends SharedAnnotationProps,
    Omit<AddSVGProps<LineProps, SVGLineElement>, 'ref'> {
  type: 'line'
  onClick: () => void
  scrollContainerRef: React.RefObject<HTMLDivElement>
}

interface InteractiveBarSpanProps
  extends SharedAnnotationProps,
    Omit<AddSVGProps<BarProps, SVGRectElement>, 'ref'> {
  type: 'bar'
  onClick: () => void
  scrollContainerRef: React.RefObject<HTMLDivElement>
}

type InteractiveSpanProps = InteractiveLineSpanProps | InteractiveBarSpanProps

const InteractiveSpan: React.FC<InteractiveSpanProps> = (props) => {
  const {
    xScale,
    yScale,
    yMax,
    data,
    showTooltip,
    hideTooltip,
    onClick,
    scrollContainerRef,
    titleColor: color,
    title,
    annotateAt,
    ...restProps
  } = props
  let tooltipTimeout: number

  const theme = useTheme()

  const handleMouseLeave = () => {
    // prevent tooltip flickering
    tooltipTimeout = window.setTimeout(() => {
      hideTooltip()
    }, 300)
  }

  const handleMouseMove = (event: React.MouseEvent<SVGElement>) => {
    if (tooltipTimeout) clearTimeout(tooltipTimeout)
    if (!('ownerSVGElement' in event.target)) return

    const coords = localPoint(event.target.ownerSVGElement as Element, event)
    if (coords && scrollContainerRef.current) {
      const { scrollTop } = scrollContainerRef.current
      showTooltip({
        tooltipLeft: coords.x + 20,
        tooltipTop: coords.y + 10 - scrollTop,
        tooltipData: data,
      })
    }
  }

  const handleClick = (event: React.MouseEvent) => {
    event.stopPropagation() // Prevent click from bubbling to container
    onClick()
  }
  let element: React.ReactNode
  if (restProps.type === 'line') {
    element = (
      <StyledLine
        {...restProps}
        from={{
          x: xScale(data.annotation.operationRelativeEndTime),
          y: 0,
        }}
        to={{
          x: xScale(data.annotation.operationRelativeEndTime),
          y: yMax,
        }}
        stroke={BAR_FILL_COLOR[data.type]}
        strokeOpacity={0.3}
        strokeWidth={2.5}
        strokeDasharray="8,4"
        strokeLinecap="round"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
      />
    )
  } else {
    /* Calculate if span is tiny based on scaled width */
    const scaledWidth =
      xScale(data.annotation.operationRelativeEndTime) -
      xScale(data.annotation.operationRelativeStartTime)
    const isTiny = scaledWidth < MIN_SPAN_WIDTH
    const width = isTiny ? MIN_SPAN_WIDTH : scaledWidth
    const fill =
      data.span.status === 'error'
        ? getColor({ theme, variable: 'background.dangerEmphasis' })
        : BAR_FILL_COLOR[data.type]

    const height = isTiny ? yScale.bandwidth() / 2 : yScale.bandwidth()
    const y =
      (yScale(data.groupName) ?? 0) + (isTiny ? yScale.bandwidth() / 4 : 0)

    element = (
      <>
        {
          <StyledBar
            {...restProps}
            data-status={data.span.status}
            x={xScale(data.annotation.operationRelativeStartTime)}
            y={y}
            width={width}
            height={height}
            fill={fill}
            rx={2}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onClick={handleClick}
          />
        }
        {data.span.status === 'error' && (
          <Text
            x={
              (xScale(data.annotation.operationRelativeStartTime) +
                xScale(data.annotation.operationRelativeEndTime)) /
              2
            }
            y={yScale(data.groupName)! + yScale.bandwidth() / 2}
            dy=".33em"
            fontSize={12}
            textAnchor="middle"
            fill={getColor({ theme, variable: 'background.danger' })}
            style={{ pointerEvents: 'none' }}
          >
            ❌
          </Text>
        )}
      </>
    )
  }

  const xCoordinate = xScale(data.annotation.operationRelativeEndTime)

  return (
    <>
      {element}
      {annotateAt === 'top' && (
        <Annotation
          x={xCoordinate + 15}
          y={-2}
          dx={0} // x offset of label from subject
          dy={0} // y offset of label from subject
        >
          <Label
            fontColor={color}
            title={title}
            titleFontSize={13}
            subtitle={`${data.annotation.operationRelativeEndTime.toFixed(
              2,
            )} ms`}
            showAnchorLine={false}
            backgroundFill={getColor({
              theme,
              variable: 'background.success',
            })}
            titleProps={{
              width: 200,
              color: getColor({ theme, variable: 'foreground.primary' }),
            }}
            backgroundProps={{
              opacity: 1,
              rx: 5,
              width: 160,
            }}
          />
        </Annotation>
      )}
    </>
  )
}

// eslint-disable-next-line import/no-default-export
export default InteractiveSpan
