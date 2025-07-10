import {
  findMatchingSpan,
  fromDefinition,
  type ParentSpanMatcher,
} from './matchSpan'
import { type GetParentSpanFn, PARENT_SPAN, type Span } from './spanTypes'
import { TICK_META, TICK_META_END } from './TickParentResolver'
import type { RelationSchemasBase } from './types'

export function createParentSpanResolver<
  const RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  SpanT extends Span<RelationSchemasT>,
>(
  span: SpanT,
  parentSpanMatcher: ParentSpanMatcher<
    keyof RelationSchemasT,
    RelationSchemasT,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any
  >,
): GetParentSpanFn<RelationSchemasT> {
  return (context) => {
    if (span[PARENT_SPAN]) {
      return span[PARENT_SPAN]
    }
    const tickSource =
      parentSpanMatcher.search === 'span-created-tick' || !context.traceContext
        ? context.thisSpanAndAnnotation.span[TICK_META]
        : parentSpanMatcher.search === 'span-ended-tick'
        ? context.thisSpanAndAnnotation.span[TICK_META_END]
        : undefined

    const spanAndAnnotations = tickSource
      ? tickSource?.spansInCurrentTick.map(
          (sp) =>
            context.traceContext?.recordedItems.get(sp.id) ?? { span: sp },
        ) ?? []
      : // note: parentSpanMatcher.search === 'entire-recording' only works if the traceContext is available
        [...context.traceContext!.recordedItems.values()]

    const parentSpanMatchFn =
      typeof parentSpanMatcher.match === 'object'
        ? fromDefinition(parentSpanMatcher.match)
        : parentSpanMatcher.match

    // memoize the matcher function to avoid re-creating it on every call
    // eslint-disable-next-line no-param-reassign
    parentSpanMatcher.match = parentSpanMatchFn

    const thisSpanIndex =
      parentSpanMatcher.search === 'entire-recording'
        ? spanAndAnnotations.findIndex(
            (spanAndAnnotation) => spanAndAnnotation.span.id === span.id,
          )
        : tickSource?.thisSpanInCurrentTickIndex ?? -1

    if (thisSpanIndex === -1) {
      // invalid
      return undefined
    }

    const found = findMatchingSpan(
      parentSpanMatchFn,
      spanAndAnnotations,
      context.traceContext,
      {
        ...(parentSpanMatcher.searchDirection === 'after-self' && {
          nthMatch: 0,
          lowestIndexToConsider: thisSpanIndex + 1,
        }),
        ...(parentSpanMatcher.searchDirection === 'before-self' && {
          nthMatch: -1,
          highestIndexToConsider: thisSpanIndex - 1,
        }),
      },
    )

    if (found) {
      // cache the found parent span on the span itself
      // so we don't have to search for it again
      // eslint-disable-next-line no-param-reassign
      span[PARENT_SPAN] = found.span
    }
    return found?.span
  }
}
