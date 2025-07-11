import { INHERIT_FROM_PARENT } from './constants'
import {
  findMatchingSpan,
  fromDefinition,
  type ParentSpanMatcher,
} from './matchSpan'
import { type GetParentSpanFn, PARENT_SPAN, type Span } from './spanTypes'
import { TICK_META, TICK_META_END } from './TickParentResolver'
import type { RelationSchemasBase } from './types'

export function ensureSpanHasInheritedAttributes<
  const RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  SpanT extends Span<RelationSchemasT>,
>(span: SpanT, heritableSpanAttributes?: readonly string[]): boolean {
  let allRequestedAttributesInheritedFromLineage = true

  for (const [key, value] of Object.entries(span.attributes)) {
    const inheritanceType =
      value === INHERIT_FROM_PARENT
        ? 'span-request'
        : heritableSpanAttributes?.includes(key)
        ? 'always-requested'
        : undefined

    if (!inheritanceType) {
      // eslint-disable-next-line no-continue
      continue
    }

    allRequestedAttributesInheritedFromLineage = false

    let ancestorSpan: Span<RelationSchemasT> | undefined = span
    const lineageRequiringAttributes: Span<RelationSchemasT>[] = []
    // eslint-disable-next-line no-cond-assign
    while ((ancestorSpan = ancestorSpan[PARENT_SPAN])) {
      if (
        ancestorSpan.attributes[key] === INHERIT_FROM_PARENT ||
        inheritanceType === 'always-requested'
      ) {
        // parent also requests inheritance, so we need to keep going
        lineageRequiringAttributes.push(ancestorSpan)
      } else if (ancestorSpan.attributes[key] !== undefined) {
        // found an ancestor with the attribute, let's assign it
        // eslint-disable-next-line no-param-reassign
        span.attributes[key] = ancestorSpan.attributes[key]
        // let's also assign it to all the intermediary ancestors that requested inheritance
        // as a performance optimization (less work to do later)
        for (const ancestor of lineageRequiringAttributes) {
          ancestor.attributes[key] = ancestorSpan.attributes[key]
        }
        allRequestedAttributesInheritedFromLineage = true
        break
      }
    }
  }
  return allRequestedAttributesInheritedFromLineage
}

export function createParentSpanResolver<
  const RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  SpanT extends Span<RelationSchemasT>,
>(
  span: SpanT,
  parentSpanMatcher?: ParentSpanMatcher<
    keyof RelationSchemasT,
    RelationSchemasT,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any
  >,
  heritableSpanAttributes?: readonly string[],
): GetParentSpanFn<RelationSchemasT> {
  let shouldAttemptToResolveParentAgain = true
  let inheritedRequestedAttributes = false

  return (context, recursive) => {
    const getParentSpan = () => {
      if (span[PARENT_SPAN] || !parentSpanMatcher) {
        // short-circuit if we have the parent span, or if there is nowhere to search for it
        return span[PARENT_SPAN]
      }
      if (!shouldAttemptToResolveParentAgain) {
        return undefined
      }
      const tickSource =
        parentSpanMatcher.search === 'span-created-tick' ||
        !context.traceContext
          ? context.thisSpanAndAnnotation.span[TICK_META]
          : parentSpanMatcher.search === 'span-ended-tick'
          ? context.thisSpanAndAnnotation.span[TICK_META_END]
          : undefined

      if (tickSource?.spansInCurrentTick.tickCompleted) {
        // do not attempt to resolve parent span again - if we haven't found in this iteration,
        // we will not find it, because now more data will be added to the tick
        shouldAttemptToResolveParentAgain = false
      }

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

        return found.span
      }

      return undefined
    }

    const parentSpan = getParentSpan()
    if (parentSpan) {
      if (recursive) {
        parentSpan.getParentSpan?.(
          {
            traceContext: context.traceContext,
            thisSpanAndAnnotation: context.traceContext?.recordedItems.get(
              parentSpan.id,
            ) ?? { span: parentSpan },
          },
          recursive,
        )
      }
      if (!inheritedRequestedAttributes) {
        inheritedRequestedAttributes = ensureSpanHasInheritedAttributes<
          RelationSchemasT,
          SpanT
        >(span, heritableSpanAttributes)
      }
    }
    return parentSpan
  }
}
