import type { SpanAndAnnotation, SpanAnnotation } from '../spanAnnotationTypes'
import type { Span } from '../spanTypes'
import type { RelationSchemasBase, Timestamp } from '../types'

const EPOCH_START = 1_000

export const createTimestamp = (now: number): Timestamp => ({
  epoch: EPOCH_START + now,
  now,
})

export type AnyRelation = RelationSchemasBase<Record<string, unknown>>

export const createAnnotation = (
  span: Span<AnyRelation>,
  traceStartTime: Timestamp,
  partial: Partial<SpanAnnotation> = {},
): SpanAnnotation => ({
  id: 'test-id',
  operationRelativeStartTime: span.startTime.now - traceStartTime.now,
  operationRelativeEndTime:
    span.startTime.now + span.duration - traceStartTime.now,
  occurrence: 1,
  recordedInState: 'active',
  labels: [],
  ...partial,
})

export const createMockSpan = <TSpan extends Span<AnyRelation>>(
  startTimeNow: number,
  partial: Partial<TSpan>,
): TSpan =>
  (partial.type === 'component-render'
    ? {
        name: 'test-component',
        type: 'component-render',
        relatedTo: {},
        startTime: createTimestamp(startTimeNow),
        duration: 100,
        attributes: {},
        isIdle: true,
        renderCount: 1,
        renderedOutput: 'content',
        ...partial,
      }
    : {
        name: 'test-span',
        type: 'mark',
        startTime: createTimestamp(startTimeNow),
        duration: 100,
        attributes: {},
        ...partial,
      }) as TSpan

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const createMockSpanAndAnnotation = <TSpan extends Span<any>>(
  startTimeNow: number,
  spanPartial: Partial<TSpan> = {},
  annotationPartial: Partial<SpanAnnotation> = {},
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): [string, SpanAndAnnotation<any>] => {
  const span = createMockSpan<TSpan>(startTimeNow, spanPartial)
  span.id = `test-${startTimeNow}`
  return [
    span.id,
    {
      span,
      annotation: createAnnotation(span, createTimestamp(0), annotationPartial),
    },
  ] as const
}
