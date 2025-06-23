import { getPerformanceEntryHash } from './getPerformanceEntryHash'
import type { SpanAndAnnotation } from './spanAnnotationTypes'
import type { Span } from './spanTypes'
import type { RelationSchemasBase, SpanDeduplicationStrategy } from './types'

export function createDefaultPerformanceEntryDeduplicationStrategy<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
>(): SpanDeduplicationStrategy<RelationSchemasT> {
  let processedPerformanceEntries = new WeakMap<
    PerformanceEntry,
    SpanAndAnnotation<RelationSchemasT>
  >()
  const processedPerformanceEntriesByHash = new Map<
    string,
    SpanAndAnnotation<RelationSchemasT>
  >()

  return {
    findDuplicate(
      span: Span<RelationSchemasT>,
    ): SpanAndAnnotation<RelationSchemasT> | undefined {
      if (!span.performanceEntry) {
        return undefined
      }

      const existing = processedPerformanceEntries.get(span.performanceEntry)
      if (existing) {
        return existing
      }

      if (span.performanceEntry.entryType === 'resource') {
        const hash = getPerformanceEntryHash(span.performanceEntry)
        return processedPerformanceEntriesByHash.get(hash)
      }

      return undefined
    },

    recordSpan(
      span: Span<RelationSchemasT>,
      spanAndAnnotation: SpanAndAnnotation<RelationSchemasT>,
    ): void {
      if (!span.performanceEntry) {
        return
      }

      processedPerformanceEntries.set(span.performanceEntry, spanAndAnnotation)

      if (span.performanceEntry.entryType === 'resource') {
        const hash = getPerformanceEntryHash(span.performanceEntry)
        processedPerformanceEntriesByHash.set(hash, spanAndAnnotation)
      }
    },

    reset(): void {
      processedPerformanceEntries = new WeakMap()
      processedPerformanceEntriesByHash.clear()
    },

    selectPreferredSpan(
      existingSpan: Span<RelationSchemasT>,
      newSpan: Span<RelationSchemasT>,
    ): Span<RelationSchemasT> {
      // Default behavior: use the new span
      return newSpan
    },
  }
}
