import type { ProcessedSpan } from '../spanAnnotationTypes'
import type { Span } from '../spanTypes'
import { TraceManager } from '../TraceManager'
import type { RelationSchemasBase } from '../types'

export function processSpans<
  const RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
>(
  spans: Span<RelationSchemasT>[],
  traceManager: TraceManager<RelationSchemasT>,
) {
  const startSpansByKey = new Map<
    string,
    ProcessedSpan<RelationSchemasT, Span<RelationSchemasT>>
  >()

  spans.forEach((span, i) => {
    const spanKey = `${span.type.replace(/-start$/, '')}|${span.name}`
    const existing = startSpansByKey.get(spanKey)
    if (existing) {
      // span.duration += (existing.span.startTime.now - span.startTime.now)
      traceManager.endSpan(existing.span, span)
      startSpansByKey.delete(spanKey)
      return
    }
    const processed = traceManager.createAndProcessSpan(span)
    if (span.type.endsWith('-start')) {
      startSpansByKey.set(spanKey, processed)
    }
  })
}
