import type { SpanAnnotation } from './spanAnnotationTypes'
import type { Attributes, Span, SpanStatus, SpanType } from './spanTypes'
import type { RecordedSpan } from './traceRecordingTypes'
import type {
  DraftTraceContext,
  MapSchemaToTypes,
  RelationSchemasBase,
  TraceContext,
} from './types'
import type { UnionToIntersection } from './typeUtils'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const INACTIVE_CONTEXT: DraftTraceContext<any, any, any> = {
  definition: {
    computedSpanDefinitions: {},
    computedValueDefinitions: {},
    name: 'NO_TRACE_ACTIVE',
    relationSchema: {},
    relationSchemaName: 'NONE',
    requiredSpans: [],
    variants: { none: { timeout: 0 } },
  },
  input: {
    id: 'NO_TRACE_ACTIVE',
    relatedTo: {},
    startTime: { now: 0, epoch: 0 },
    variant: 'none',
  },
  recordedItems: new Map(),
  recordedItemsByLabel: {},
}

export interface PublicSpanMatcherTags {
  /**
   * Only applicable for 'requiredSpans' list: it will opt-out of the default behavior,
   * which interrupts the trace if the requiredSpan has an error status.
   */
  continueWithErrorStatus?: boolean

  /**
   * If multiple matches are found, this specifies which match to use.
   * It can be set to a negative number to match from the end of the operation (backwards, with syntax like Array.prototype.slice()).
   * This only has an effect on matchers that run when the recording is complete,
   * e.g. in startSpan and endSpan for defining computed spans.
   */
  nthMatch?: number

  /**
   * Do not consider entries before this index.
   * This only has an effect on matchers that run when the recording is complete.
   */
  lowestIndexToConsider?: number

  /**
   * Index of last entry to consider. Will stop considering entries beyond this index.
   * This only has an effect on matchers that run when the recording is complete.
   */
  highestIndexToConsider?: number
}

export interface SpanMatcherTags extends PublicSpanMatcherTags {
  /**
   * @internal
   * Enables the idle-regression check.
   * Only has an effect in for component-lifecycle entries in 'requiredSpans' matchers list.
   */
  idleCheck?: boolean

  /**
   * @internal
   */
  requiredSpan?: boolean
}

export interface SpanAndAnnotationForMatching<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
> {
  span: Span<RelationSchemasT> | RecordedSpan<RelationSchemasT>
  annotation?: SpanAnnotation
}

/**
 * Function type for matching performance entries.
 */
export interface SpanMatcherFn<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  VariantsT extends string,
> extends SpanMatcherTags {
  (
    spanAndAnnotation: SpanAndAnnotationForMatching<RelationSchemasT>,
    context:
      | DraftTraceContext<SelectedRelationNameT, RelationSchemasT, VariantsT>
      | undefined,
  ): boolean

  /** source definition object for debugging (if converted from object) */
  fromDefinition?: SpanMatchDefinition<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  >
}

export type NameMatcher<RelationSchemaT> =
  | string
  | RegExp
  | ((
      name: string,
      inputRelation: MapSchemaToTypes<RelationSchemaT> | undefined,
    ) => boolean)

export interface SpanMatchDefinition<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  VariantsT extends string,
> extends PublicSpanMatcherTags {
  name?: NameMatcher<RelationSchemasT[SelectedRelationNameT]>
  performanceEntryName?: NameMatcher<RelationSchemasT[SelectedRelationNameT]>
  type?: SpanType
  status?: SpanStatus
  attributes?: Attributes
  matchingRelations?:
    | (keyof UnionToIntersection<RelationSchemasT[SelectedRelationNameT]>)[]
    | boolean
  /** The index of the reoccurrence within the span, calculated based on the span's type+name combination */
  occurrence?: number | ((occurrence: number) => boolean)
  isIdle?: boolean
  label?: string
  renderCount?: number
  fn?: SpanMatcherFn<SelectedRelationNameT, RelationSchemasT, VariantsT>
  oneOf?: SpanMatchDefinition<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  >[]
  not?: SpanMatchDefinition<SelectedRelationNameT, RelationSchemasT, VariantsT>
}

export type SpanMatch<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  VariantsT extends string,
> =
  | SpanMatcherFn<SelectedRelationNameT, RelationSchemasT, VariantsT>
  | SpanMatchDefinition<SelectedRelationNameT, RelationSchemasT, VariantsT>

export interface ParentSpanMatcher<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  VariantsT extends string,
> {
  /**
   * Define the scope of the search for the parent span.
   * 'span-created-tick' will only search for spans created in the current tick,
   * while 'entire-recording' will search through all recorded spans
   * in the trace that was running when the span was created.
   *
   * Note that search === 'entire-recording' only works
   * when running the matcher when traceContext is available
   * (i.e. before Trace is disposed - while it's active, and when first creating the recording)
   */
  search: 'span-created-tick' | 'span-ended-tick' | 'entire-recording'
  searchDirection: 'after-self' | 'before-self'
  match: SpanMatch<SelectedRelationNameT, RelationSchemasT, VariantsT>
}

/**
 * The common name of the span to match. Can be a string, RegExp, or function.
 */
export function withName<
  const SelectedRelationNameT extends keyof RelationSchemasT,
  const RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  const VariantsT extends string,
>(
  value: NameMatcher<RelationSchemasT[SelectedRelationNameT]>,
): SpanMatcherFn<SelectedRelationNameT, RelationSchemasT, VariantsT> {
  const matcher: SpanMatcherFn<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  > = ({ span }, { input: { relatedTo } } = INACTIVE_CONTEXT) => {
    if (typeof value === 'string') return span.name === value
    if (value instanceof RegExp) return value.test(span.name)
    return value(span.name, relatedTo)
  }
  matcher.fromDefinition = { name: value }
  return matcher
}

// DRAFT TODO: make test case if one doesnt exist yet
// withName((name, relatedTo) => !relatedTo ? false : name === `OmniLog/${relatedTo.ticketId}`)

export function withLabel<
  const SelectedRelationNameT extends keyof RelationSchemasT,
  const RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  const VariantsT extends string,
>(
  value: string,
): SpanMatcherFn<SelectedRelationNameT, RelationSchemasT, VariantsT> {
  const matcher: SpanMatcherFn<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  > = ({ annotation }) => annotation?.labels?.includes(value) ?? false
  matcher.fromDefinition = { label: value }
  return matcher
}

/**
 * The PerformanceEntry.name of the entry to match. Can be a string, RegExp, or function.
 */
export function withPerformanceEntryName<
  const SelectedRelationNameT extends keyof RelationSchemasT,
  const RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  const VariantsT extends string,
>(
  value: NameMatcher<RelationSchemasT[SelectedRelationNameT]>,
): SpanMatcherFn<SelectedRelationNameT, RelationSchemasT, VariantsT> {
  const matcher: SpanMatcherFn<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  > = ({ span }, { input: { relatedTo } } = INACTIVE_CONTEXT) => {
    const entryName = span.performanceEntry?.name
    if (!entryName) return false
    if (typeof value === 'string') return entryName === value
    if (value instanceof RegExp) return value.test(entryName)
    return value(entryName, relatedTo)
  }
  matcher.fromDefinition = { performanceEntryName: value }
  return matcher
}

export function withType<
  const SelectedRelationNameT extends keyof RelationSchemasT,
  const RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  const VariantsT extends string,
>(
  value: SpanType,
): SpanMatcherFn<SelectedRelationNameT, RelationSchemasT, VariantsT> {
  const matcher: SpanMatcherFn<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  > = ({ span }) => span.type === value
  matcher.fromDefinition = { type: value }
  return matcher
}

export function withStatus<
  const SelectedRelationNameT extends keyof RelationSchemasT,
  const RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  const VariantsT extends string,
>(
  value: SpanStatus,
): SpanMatcherFn<SelectedRelationNameT, RelationSchemasT, VariantsT> {
  const matcher: SpanMatcherFn<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  > = ({ span }) => span.status === value
  matcher.fromDefinition = { status: value }
  return matcher
}

/**
 * The subset of attributes (metadata) to match against the span.
 */
export function withAttributes<
  const SelectedRelationNameT extends keyof RelationSchemasT,
  const RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  const VariantsT extends string,
>(
  attrs: Attributes,
): SpanMatcherFn<SelectedRelationNameT, RelationSchemasT, VariantsT> {
  const matcher: SpanMatcherFn<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  > = ({ span }) => {
    if (!span.attributes) return false
    return Object.entries(attrs).every(
      ([key, value]) => span.attributes[key] === value,
    )
  }
  matcher.fromDefinition = { attributes: attrs }
  return matcher
}

/**
 * A list of keys of trace's relations to match against the span's.
 */
export function withMatchingRelations<
  const SelectedRelationNameT extends keyof RelationSchemasT,
  const RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  const VariantsT extends string,
>(
  keys:
    | NoInfer<
        keyof UnionToIntersection<RelationSchemasT[SelectedRelationNameT]>
      >[]
    | true = true,
): SpanMatcherFn<SelectedRelationNameT, RelationSchemasT, VariantsT> {
  const matcher: SpanMatcherFn<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  > = (
    { span },
    {
      input: { relatedTo: r },
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      definition: { relationSchema },
    } = INACTIVE_CONTEXT,
  ) => {
    // DRAFT TODO: add test case when relatedTo is missing
    // if the relatedTo isn't set on the trace yet, we can't match against it, so we return early
    // similarly, if the span doesn't have any relatedTo set
    const relatedToInput: Record<string, unknown> | undefined = r
    if (!span.relatedTo || !relatedToInput) return false
    const spanRelatedTo: Record<string, unknown> = span.relatedTo
    const resolvedKeys =
      typeof keys === 'boolean' && keys
        ? Object.keys(relationSchema as object)
        : (keys as string[])

    if (!resolvedKeys) return false
    return resolvedKeys.every(
      (key) =>
        key in spanRelatedTo && spanRelatedTo[key] === relatedToInput[key],
    )
  }
  matcher.fromDefinition = { matchingRelations: keys }
  return matcher
}

/**
 * The occurrence of the span with the same name and type within the operation.
 */
export function withOccurrence<
  const SelectedRelationNameT extends keyof RelationSchemasT,
  const RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  const VariantsT extends string,
>(
  value: number | ((occurrence: number) => boolean),
): SpanMatcherFn<SelectedRelationNameT, RelationSchemasT, VariantsT> {
  const matcher: SpanMatcherFn<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  > = ({ annotation }) => {
    if (!annotation) return false
    if (typeof value === 'number') return annotation.occurrence === value
    return value(annotation.occurrence)
  }
  matcher.fromDefinition = { occurrence: value }
  return matcher
}

export function withComponentRenderCount<
  const SelectedRelationNameT extends keyof RelationSchemasT,
  const RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  const VariantsT extends string,
>(
  name: NameMatcher<RelationSchemasT[SelectedRelationNameT]>,
  renderCount: number,
): SpanMatcherFn<SelectedRelationNameT, RelationSchemasT, VariantsT> {
  const nameMatcher = withName<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  >(name)

  const matcher: SpanMatcherFn<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  > = (spanAndAnnotation, context) => {
    if (!('renderCount' in spanAndAnnotation.span)) return false
    return (
      nameMatcher(spanAndAnnotation, context) &&
      spanAndAnnotation.span.renderCount === renderCount
    )
  }

  matcher.fromDefinition = { name, renderCount }
  return matcher
}

/**
 * only applicable for component-lifecycle entries
 */
export function whenIdle<
  const SelectedRelationNameT extends keyof RelationSchemasT,
  const RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  const VariantsT extends string,
>(
  value = true,
): SpanMatcherFn<SelectedRelationNameT, RelationSchemasT, VariantsT> {
  const matcherFn: SpanMatcherFn<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  > = ({ span }) => ('isIdle' in span ? span.isIdle === value : false)
  const result = Object.assign(
    matcherFn,
    // add a tag to the function if set to true
    value ? ({ idleCheck: value } satisfies SpanMatcherTags) : {},
  )
  result.fromDefinition = { isIdle: value }
  return result
}

/**
 * @internal
 * tag matcher with a special, internal matcher tag, and match on span.status === 'error'
 */
export function requiredSpanWithErrorStatus<
  const SelectedRelationNameT extends keyof RelationSchemasT,
  const RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  const VariantsT extends string,
>(): SpanMatcherFn<SelectedRelationNameT, RelationSchemasT, VariantsT> {
  const matcherFn: SpanMatcherFn<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  > = ({ span }) => span.status === 'error'
  const result = Object.assign(
    matcherFn,
    // add a tag to the function if set to true
    { requiredSpan: true } satisfies SpanMatcherTags,
  )
  return result
}

/**
 * Only applicable for 'requiredSpans' list: it will opt-out of the default behavior,
 * which interrupts the trace if the requiredSpan has an error status.
 */
export function continueWithErrorStatus<
  const SelectedRelationNameT extends keyof RelationSchemasT,
  const RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  const VariantsT extends string,
>(): SpanMatcherFn<SelectedRelationNameT, RelationSchemasT, VariantsT> {
  const matcherFn: SpanMatcherFn<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  > = () => true
  const result = Object.assign(
    matcherFn,
    // add a tag to the function if set to true
    { continueWithErrorStatus: true } satisfies SpanMatcherTags,
  )
  return result
}

// logical combinators:
// AND
export function withAllConditions<
  const SelectedRelationNameT extends keyof RelationSchemasT,
  const RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  const VariantsT extends string,
>(
  ...matchers: SpanMatcherFn<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  >[]
): SpanMatcherFn<SelectedRelationNameT, RelationSchemasT, VariantsT> {
  const tags: SpanMatcherTags = {}
  const definition: SpanMatchDefinition<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  > = {}
  for (const matcher of matchers) {
    // carry over tags from sub-matchers
    Object.assign(tags, matcher)
    if (matcher.fromDefinition) {
      // carry over definition from sub-matchers
      Object.assign(definition, matcher.fromDefinition)
    }
  }
  const matcherFn: SpanMatcherFn<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  > = (...args) => matchers.every((matcher) => matcher(...args))
  return Object.assign(matcherFn, tags, { fromDefinition: definition })
}

// OR
export function withOneOfConditions<
  const SelectedRelationNameT extends keyof RelationSchemasT,
  const RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  const VariantsT extends string,
>(
  ...matchers: SpanMatcherFn<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  >[]
): SpanMatcherFn<SelectedRelationNameT, RelationSchemasT, VariantsT> {
  const tags: SpanMatcherTags = {}
  for (const matcher of matchers) {
    // carry over tags from sub-matchers
    Object.assign(tags, matcher)
  }
  const matcherFn: SpanMatcherFn<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  > = (...args) => matchers.some((matcher) => matcher(...args))
  return Object.assign(matcherFn, tags, { fromDefinition: { oneOf: matchers } })
}

export function not<
  const SelectedRelationNameT extends keyof RelationSchemasT,
  const RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  const VariantsT extends string,
>(
  matcher: SpanMatcherFn<SelectedRelationNameT, RelationSchemasT, VariantsT>,
): SpanMatcherFn<SelectedRelationNameT, RelationSchemasT, VariantsT> {
  // Create a new matcher function that negates the input matcher
  const notMatcher: SpanMatcherFn<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  > = (...args) => !matcher(...args)

  // If the original matcher has a fromDefinition property, create a new one for the negated matcher
  if (matcher.fromDefinition) {
    notMatcher.fromDefinition = { not: matcher.fromDefinition }
  }

  return notMatcher
}

export function fromDefinition<
  const SelectedRelationNameT extends keyof RelationSchemasT,
  const RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  const VariantsT extends string,
>(
  definition: SpanMatchDefinition<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  >,
): SpanMatcherFn<SelectedRelationNameT, RelationSchemasT, VariantsT> {
  const matchers: SpanMatcherFn<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  >[] = []

  // Handle special case: if both name and renderCount are present, use withComponentRenderCount
  // instead of separate withName and other matchers
  if (definition.renderCount !== undefined && definition.name) {
    matchers.push(
      withComponentRenderCount(definition.name, definition.renderCount),
    )
  } else if (definition.name) {
    matchers.push(
      withName<SelectedRelationNameT, RelationSchemasT, VariantsT>(
        definition.name,
      ),
    )
  }

  if (definition.performanceEntryName) {
    matchers.push(withPerformanceEntryName(definition.performanceEntryName))
  }
  if (definition.type) {
    matchers.push(withType(definition.type))
  }
  if (definition.status) {
    matchers.push(withStatus(definition.status))
  }
  if (definition.attributes) {
    matchers.push(withAttributes(definition.attributes))
  }
  if (definition.matchingRelations) {
    matchers.push(withMatchingRelations(definition.matchingRelations))
  }
  if (definition.occurrence) {
    matchers.push(withOccurrence(definition.occurrence))
  }
  if (definition.isIdle) {
    matchers.push(whenIdle(definition.isIdle))
  }
  if (definition.label) {
    matchers.push(withLabel(definition.label))
  }
  if (definition.fn) {
    matchers.push(definition.fn)
  }

  let combined: SpanMatcherFn<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  >

  // Check if definition has oneOf property
  if (definition.oneOf) {
    // Convert each definition in oneOf array to a matcher and combine with OR
    const oneOfMatchers = definition.oneOf.map((def) =>
      fromDefinition<SelectedRelationNameT, RelationSchemasT, VariantsT>(def),
    )
    combined = withAllConditions(
      ...matchers,
      withOneOfConditions(...oneOfMatchers),
    )
  } else if (definition.not) {
    // Handle the negation case
    const notMatcher = fromDefinition<
      SelectedRelationNameT,
      RelationSchemasT,
      VariantsT
    >(definition.not)
    // If there are other matchers, combine them with AND and then negate the result
    // eslint-disable-next-line unicorn/prefer-ternary
    if (matchers.length > 0) {
      combined = withAllConditions(...matchers, not(notMatcher))
    } else {
      // If there are no other matchers, just negate the single matcher
      combined = not(notMatcher)
    }
  } else {
    combined = withAllConditions(...matchers)
  }

  combined.fromDefinition = definition

  // add public tags:
  if (typeof definition.continueWithErrorStatus === 'boolean') {
    combined.continueWithErrorStatus = definition.continueWithErrorStatus
  }
  if (typeof definition.nthMatch === 'number') {
    combined.nthMatch = definition.nthMatch
  }
  if (typeof definition.lowestIndexToConsider === 'number') {
    combined.lowestIndexToConsider = definition.lowestIndexToConsider
  }
  if (typeof definition.highestIndexToConsider === 'number') {
    combined.highestIndexToConsider = definition.highestIndexToConsider
  }

  return combined
}

/**
 * Evaluates a span matcher against an entry array.
 * Respects matching index, lowestIndexToConsider, and highestIndexToConsider.
 */
export function findMatchingSpan<
  const SelectedRelationNameT extends keyof RelationSchemasT,
  const RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  const VariantsT extends string,
  const RecordedItem extends SpanAndAnnotationForMatching<RelationSchemasT>,
>(
  matcher: SpanMatcherFn<SelectedRelationNameT, RelationSchemasT, VariantsT>,
  recordedItemsArray: readonly RecordedItem[],
  context:
    | TraceContext<SelectedRelationNameT, RelationSchemasT, VariantsT>
    | undefined,
  /** config argument can be used to override tags from matcher: */
  {
    lowestIndexToConsider = matcher.lowestIndexToConsider ?? 0,
    highestIndexToConsider:
      highestIndexToConsiderInput = matcher.highestIndexToConsider,
    nthMatch = matcher.nthMatch,
  }: PublicSpanMatcherTags = {},
): RecordedItem | undefined {
  const highestIndexToConsider =
    highestIndexToConsiderInput === undefined
      ? recordedItemsArray.length - 1
      : Math.min(highestIndexToConsiderInput, recordedItemsArray.length - 1)

  let matchedCount = 0

  // For positive or undefined indices - find with specified index offset
  if (nthMatch === undefined || nthMatch >= 0) {
    for (let i = lowestIndexToConsider; i <= highestIndexToConsider; i++) {
      const spanAndAnnotation = recordedItemsArray[i]!
      if (matcher(spanAndAnnotation, context)) {
        if (nthMatch === undefined || nthMatch === matchedCount) {
          return spanAndAnnotation
        }
        matchedCount++
      }
    }
    // we didn't find a match with the specified index
    return undefined
  }

  // For negative indices - iterate from the end
  // If nthMatch is -1, we need the last match (index 0 from reverse)
  // If nthMatch is -2, we need the second-to-last match (index 1 from reverse), etc.
  const targetIndex = Math.abs(nthMatch) - 1

  // Iterate from the end of the array
  // TODO: I'm wondering if we should sort recordedItemsArrayReversed by the end time...?
  // For that matter, should recordedItemsArray be sorted by their start time?
  // If yes, it might be good to do this in createTraceRecording and pass in both recordedItemsArray and recordedItemsArrayReversed pre-sorted, so we don't sort every time we need to calculate a computed span.
  for (let i = highestIndexToConsider; i >= 0; i--) {
    const spanAndAnnotation = recordedItemsArray[i]!
    if (matcher(spanAndAnnotation, context)) {
      if (matchedCount === targetIndex) {
        return spanAndAnnotation
      }
      matchedCount++
    }
  }

  return undefined
}
