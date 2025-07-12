import { ensureMatcherFn } from './ensureMatcherFn'
import type { SpanMatch } from './matchSpan'
import type { Span } from './spanTypes'
import type { DraftTraceContext, RelationSchemasBase } from './types'

/**
 * Finds the first span matching the provided SpanMatch in the parent hierarchy
 * of the given Span, starting with the span itself and traversing up
 * through its parents.
 */
export function findAncestor<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
>(
  span: Span<RelationSchemasT>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  spanMatch: SpanMatch<keyof RelationSchemasT, RelationSchemasT, any>,
  traceContext?: DraftTraceContext<
    keyof RelationSchemasT,
    RelationSchemasT,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any
  >,
): Span<RelationSchemasT> | undefined {
  // Convert SpanMatch to a matcher function if needed
  const matcherFn = ensureMatcherFn<
    keyof RelationSchemasT,
    RelationSchemasT,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any
  >(spanMatch)

  // Start with the current span
  let currentSpanAndAnnotation = traceContext?.recordedItems.get(span.id) ?? {
    span,
  }

  while (currentSpanAndAnnotation) {
    // Check if current span matches
    if (matcherFn(currentSpanAndAnnotation, traceContext)) {
      return currentSpanAndAnnotation.span
    }

    const parentSpan = currentSpanAndAnnotation.span.getParentSpan(
      {
        traceContext,
        thisSpanAndAnnotation: currentSpanAndAnnotation,
      },
      true,
    )

    // If no parent span ID, we've reached the top of the known hierarchy
    if (!parentSpan) {
      break
    }

    // Get the parent span
    currentSpanAndAnnotation = traceContext?.recordedItems.get(
      parentSpan.id,
    ) ?? { span: parentSpan }
  }

  return undefined
}
