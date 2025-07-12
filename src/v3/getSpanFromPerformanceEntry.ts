import { ensureTimestamp } from './ensureTimestamp'
import { getCommonUrlForTracing } from './getCommonUrlForTracing'
import type {
  Attributes,
  InitiatorType,
  NativePerformanceEntryType,
  PerformanceEntrySpan,
  ResourceSpan,
} from './spanTypes'
import type {
  DeriveRelationsFromPerformanceEntryFn,
  RelationSchemasBase,
  Timestamp,
} from './types'

/**
 * Maps Performance Entry to a Span
 * @returns The span.
 */
export function getSpanFromPerformanceEntry<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
>(
  inputEntry: PerformanceEntry,
  deriveRelationFromPerformanceEntry?: DeriveRelationsFromPerformanceEntryFn<RelationSchemasT>,
):
  | Omit<PerformanceEntrySpan<RelationSchemasT>, 'id' | 'getParentSpan'>
  | Omit<ResourceSpan<RelationSchemasT>, 'id' | 'getParentSpan'>
  | undefined {
  // react in dev mode generates hundreds of these marks, ignore them
  if (inputEntry.entryType === 'mark' && inputEntry.name.startsWith('--')) {
    return undefined
  }

  const attributes =
    'detail' in inputEntry &&
    typeof inputEntry.detail === 'object' &&
    inputEntry.detail !== null
      ? (inputEntry.detail as Attributes)
      : {}

  const type = inputEntry.entryType as NativePerformanceEntryType
  const relatedTo = deriveRelationFromPerformanceEntry?.(inputEntry)
  let { name } = inputEntry

  if (type === 'resource' || type === 'navigation') {
    const { commonUrl, query, hash } = getCommonUrlForTracing(inputEntry.name)
    name = commonUrl

    // write a function in lotus to extract from datadog's SDK rather than hardcoding the implementation
    if (type === 'resource') {
      const resourceTiming = inputEntry as PerformanceResourceTiming

      return {
        type: 'resource',
        name,
        startTime: ensureTimestamp({ now: inputEntry.startTime }),
        attributes,
        duration: inputEntry.duration,
        // status,
        performanceEntry: inputEntry,
        resourceDetails: {
          initiatorType: resourceTiming.initiatorType as InitiatorType,
          query,
          hash,
        },
        relatedTo,
      }
    }
  } else if (type !== 'mark' && type !== 'measure') {
    name = `${type}${
      inputEntry.name &&
      inputEntry.name !== 'unknown' &&
      inputEntry.name.length > 0 &&
      type !== inputEntry.name
        ? `/${inputEntry.name}`
        : ''
    }`
  }

  const timestamp: Partial<Timestamp> = {
    now: inputEntry.startTime,
  }

  const traceEntry: Omit<
    PerformanceEntrySpan<RelationSchemasT>,
    'id' | 'getParentSpan'
  > = {
    type,
    name,
    startTime: ensureTimestamp(timestamp),
    attributes,
    duration: inputEntry.duration,
    // status,
    performanceEntry: inputEntry,
    relatedTo,
  }

  return traceEntry
}
