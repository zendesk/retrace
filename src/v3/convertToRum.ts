/* eslint-disable @typescript-eslint/consistent-indexed-object-style */
import { getSpanKey } from './getSpanKey'
import type { SpanMatcherFn } from './matchSpan'
import type { SpanAndAnnotation } from './spanAnnotationTypes'
import type { ComponentRenderSpan, Span } from './spanTypes'
import type { TraceRecording, TraceRecordingBase } from './traceRecordingTypes'
import type { TraceContext } from './types'

export interface EmbeddedEntry {
  count: number
  totalDuration: number
  spans: {
    startOffset: number
    duration: number
    error?: true | undefined
  }[]
}

export interface SpanSummaryAttributes {
  [typeAndName: string]: {
    [attributeName: string]: unknown
  }
}

export interface RumTraceRecording<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT,
> extends TraceRecordingBase<RelationSchemasT[SelectedRelationNameT]> {
  // spans that don't exist as separate spans in the DB
  // useful for things like renders, which can repeat tens of times
  // during the same operation
  embeddedSpans: {
    [typeAndName: string]: EmbeddedEntry
  }

  // `typeAndName`s of spans that can be used to query
  // & aggregate average start offset and duration
  // 'resource|/apis/tickets/123.json'
  // 'resource|graphql/query/GetTickets'
  // 'component-render|OmniLog'
  // 'error|Something went wrong'
  // 'measure|ticket.fetch'
  nonEmbeddedSpans: string[]

  /**
   * Merged attributes of the spans with the same type and name.
   * If attributes changed, most recent ones overwrite older ones.
   */
  spanAttributes: SpanSummaryAttributes

  longestSpan:
    | (SpanAndAnnotation<RelationSchemasT> & { key: string })
    | undefined

  // allow for additional attributes to be added by the consumer
  [key: string]: unknown
}

export function isRenderEntry<RelationSchemasT>(
  entry: Span<RelationSchemasT>,
): entry is ComponentRenderSpan<RelationSchemasT> {
  return (
    entry.type === 'component-render' ||
    entry.type === 'component-render-start' ||
    entry.type === 'component-unmount'
  )
}

function updateEmbeddedEntry<RelationSchemasT>(
  embeddedEntry: EmbeddedEntry,
  spanAndAnnotation: SpanAndAnnotation<RelationSchemasT>,
): EmbeddedEntry {
  const { annotation, span } = spanAndAnnotation
  return {
    count: embeddedEntry.count + 1,
    totalDuration: embeddedEntry.totalDuration + span.duration,
    spans: [
      ...embeddedEntry.spans,
      {
        startOffset: annotation.operationRelativeStartTime,
        duration: span.duration,
      },
    ],
  }
}

function createEmbeddedEntry<RelationSchemasT>({
  span,
  annotation,
}: SpanAndAnnotation<RelationSchemasT>): EmbeddedEntry {
  return {
    count: 1,
    totalDuration: span.duration,
    spans: [
      {
        startOffset: annotation.operationRelativeStartTime,
        duration: span.duration,
      },
    ],
  }
}

export const defaultEmbedSpanSelector = <RelationSchemasT>(
  spanAndAnnotation: SpanAndAnnotation<RelationSchemasT>,
) => {
  const { span } = spanAndAnnotation
  return isRenderEntry(span)
}

export function getSpanSummaryAttributes<RelationSchemasT>(
  recordedItems: readonly SpanAndAnnotation<RelationSchemasT>[],
): SpanSummaryAttributes {
  // loop through recorded items, create a entry based on the name
  const spanAttributes: SpanSummaryAttributes = {}

  for (const { span } of recordedItems) {
    const { attributes, name } = span
    const existingAttributes = spanAttributes[name] ?? {}
    if (attributes && Object.keys(attributes).length > 0) {
      spanAttributes[name] = {
        ...existingAttributes,
        ...attributes,
      }
    }
  }

  return spanAttributes
}

export function findLongestSpan<RelationSchemasT>(
  spanAndAnnotations: readonly SpanAndAnnotation<RelationSchemasT>[],
  filter?: (spanAndAnnotation: SpanAndAnnotation<RelationSchemasT>) => boolean,
): SpanAndAnnotation<RelationSchemasT> | undefined {
  const filteredSpans = filter
    ? spanAndAnnotations.filter(filter)
    : spanAndAnnotations

  if (filteredSpans.length === 0) {
    return undefined
  }

  let longestSpanAndAnnotation = filteredSpans[0]!
  let maxDuration = filteredSpans[0]!.span.duration

  for (const spanAndAnnotation of filteredSpans) {
    if (spanAndAnnotation.span.duration > maxDuration) {
      maxDuration = spanAndAnnotation.span.duration
      longestSpanAndAnnotation = spanAndAnnotation
    }
  }

  return longestSpanAndAnnotation
}

type RoundFunction = (x: number) => number

function recursivelyRoundValues<T extends object>(
  obj: T,
  roundFunc: RoundFunction = (x) => Math.round(x),
): T {
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(obj as object)) {
    if (typeof value === 'number') {
      result[key] = roundFunc(value)
    } else if (Array.isArray(value)) {
      result[key] = value.map((item: number | T) =>
        typeof item === 'number'
          ? roundFunc(item)
          : // Keep strings intact - don't process them
          typeof item === 'string'
          ? item
          : recursivelyRoundValues(item, roundFunc),
      )
    } else if (value && typeof value === 'object') {
      result[key] = recursivelyRoundValues(value, roundFunc)
    } else {
      result[key] = value
    }
  }

  return result as T
}

export function convertTraceToRUM<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT,
  const VariantsT extends string,
>({
  traceRecording,
  context,
  embedSpanSelector = defaultEmbedSpanSelector,
  keepComputedRenderBeaconSpanAttributes,
}: {
  traceRecording: TraceRecording<SelectedRelationNameT, RelationSchemasT>
  context: TraceContext<SelectedRelationNameT, RelationSchemasT, VariantsT>
  embedSpanSelector?: SpanMatcherFn<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  >
  keepComputedRenderBeaconSpanAttributes?: string[] | false
}): RumTraceRecording<SelectedRelationNameT, RelationSchemasT> {
  const {
    entries,
    computedRenderBeaconSpans,
    ...otherTraceRecordingAttributes
  } = traceRecording
  const embeddedEntries: SpanAndAnnotation<RelationSchemasT>[] = []
  const nonEmbeddedSpans = new Set<string>()
  const spanAttributes = getSpanSummaryAttributes(traceRecording.entries)

  for (const spanAndAnnotation of entries) {
    const isEmbedded = embedSpanSelector(spanAndAnnotation, context)
    if (isEmbedded) {
      embeddedEntries.push(spanAndAnnotation)
    } else {
      nonEmbeddedSpans.add(getSpanKey(spanAndAnnotation.span))
    }
  }
  const embeddedSpans = new Map<string, EmbeddedEntry>()

  for (const spanAndAnnotation of embeddedEntries) {
    const { span } = spanAndAnnotation
    const typeAndName = getSpanKey(span)
    const existingEmbeddedEntry = embeddedSpans.get(typeAndName)

    if (existingEmbeddedEntry) {
      embeddedSpans.set(
        typeAndName,
        updateEmbeddedEntry(existingEmbeddedEntry, spanAndAnnotation),
      )
    } else {
      embeddedSpans.set(typeAndName, createEmbeddedEntry(spanAndAnnotation))
    }
  }

  // Filter out entries with zero duration
  for (const [key, value] of embeddedSpans) {
    if (value.totalDuration === 0) {
      embeddedSpans.delete(key)
    }
  }

  let computedRenderBeaconSpansTransformed: typeof computedRenderBeaconSpans =
    {}
  if (keepComputedRenderBeaconSpanAttributes !== undefined) {
    computedRenderBeaconSpansTransformed = Object.fromEntries(
      Object.entries(computedRenderBeaconSpans).map(
        ([key, { attributes, ...span }]) => {
          if (keepComputedRenderBeaconSpanAttributes === false || !attributes) {
            return [key, { ...span }]
          }
          const filteredAttributes: Record<string, unknown> = {}
          for (const attr of keepComputedRenderBeaconSpanAttributes) {
            if (attr in attributes) {
              filteredAttributes[attr] = attributes[attr]
            }
          }
          return [key, { ...span, attributes: filteredAttributes }]
        },
      ),
    )
  }

  const longestSpanAndAnnotation = findLongestSpan(
    entries,
    ({ span }) => span.type !== 'operation',
  )

  const result: RumTraceRecording<SelectedRelationNameT, RelationSchemasT> = {
    ...otherTraceRecordingAttributes,
    computedRenderBeaconSpans: computedRenderBeaconSpansTransformed,
    embeddedSpans: Object.fromEntries(embeddedSpans),
    nonEmbeddedSpans: [...nonEmbeddedSpans],
    spanAttributes,
    // this can be used to create a query like "list top 10 longest spans" for an operation
    longestSpan: longestSpanAndAnnotation && {
      ...longestSpanAndAnnotation,
      key: getSpanKey(longestSpanAndAnnotation.span),
    },
  }

  // we want to decrease precision to improve readability of the output, and decrease the payload size
  return recursivelyRoundValues(result)
}
