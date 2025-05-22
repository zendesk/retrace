import type { SpanAndAnnotation } from './spanAnnotationTypes'
import type { Attributes, SpanStatus, SpanType } from './spanTypes'
import type { DraftTraceContext, MapSchemaToTypes } from './types'
import type { UnionToIntersection } from './typeUtils'

export interface SpanMatcherTags {
  idleCheck?: boolean
  continueWithErrorStatus?: boolean
  requiredSpan?: boolean
  matchingIndex?: number
}

/**
 * Function type for matching performance entries.
 */
export interface SpanMatcherFn<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT,
  VariantsT extends string,
> extends SpanMatcherTags {
  (
    spanAndAnnotation: SpanAndAnnotation<RelationSchemasT>,
    context: DraftTraceContext<
      SelectedRelationNameT,
      RelationSchemasT,
      VariantsT
    >,
  ): boolean

  /** source definition object for debugging (if converted from object) */
  fromDefinition?: SpanMatchDefinitionCombinator<
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

export interface SpanMatchDefinitionCombinator<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT,
  VariantsT extends string,
> {
  name?: NameMatcher<RelationSchemasT[SelectedRelationNameT]>
  performanceEntryName?: NameMatcher<RelationSchemasT[SelectedRelationNameT]>
  type?: SpanType
  status?: SpanStatus
  attributes?: Attributes
  matchingRelations?:
    | (keyof UnionToIntersection<RelationSchemasT[SelectedRelationNameT]>)[]
    | boolean
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
  /**
   * This only has an effect on startSpan and endSpan for defining computed spans
   * It must be defined on the top level matcher definition
   * */
  matchingIndex?: number
}

export type SpanMatchDefinition<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT,
  VariantsT extends string,
> = SpanMatchDefinitionCombinator<
  SelectedRelationNameT,
  RelationSchemasT,
  VariantsT
>

export type SpanMatch<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT,
  VariantsT extends string,
> =
  | SpanMatcherFn<SelectedRelationNameT, RelationSchemasT, VariantsT>
  | SpanMatchDefinition<SelectedRelationNameT, RelationSchemasT, VariantsT>

/**
 * The common name of the span to match. Can be a string, RegExp, or function.
 */
export function withName<
  const SelectedRelationNameT extends keyof RelationSchemasT,
  const RelationSchemasT,
  const VariantsT extends string,
>(
  value: NameMatcher<RelationSchemasT[SelectedRelationNameT]>,
): SpanMatcherFn<SelectedRelationNameT, RelationSchemasT, VariantsT> {
  const matcher: SpanMatcherFn<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  > = ({ span }, { input: { relatedTo } }) => {
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
  const RelationSchemasT,
  const VariantsT extends string,
>(
  value: string,
): SpanMatcherFn<SelectedRelationNameT, RelationSchemasT, VariantsT> {
  const matcher: SpanMatcherFn<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  > = ({ annotation }) => annotation.labels?.includes(value) ?? false
  matcher.fromDefinition = { label: value }
  return matcher
}

/**
 * The PerformanceEntry.name of the entry to match. Can be a string, RegExp, or function.
 */
export function withPerformanceEntryName<
  const SelectedRelationNameT extends keyof RelationSchemasT,
  const RelationSchemasT,
  const VariantsT extends string,
>(
  value: NameMatcher<RelationSchemasT[SelectedRelationNameT]>,
): SpanMatcherFn<SelectedRelationNameT, RelationSchemasT, VariantsT> {
  const matcher: SpanMatcherFn<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  > = ({ span }, { input: { relatedTo } }) => {
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
  const RelationSchemasT,
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
  const RelationSchemasT,
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
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT,
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
      ([key, value]) => span.attributes![key] === value,
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
  const RelationSchemasT,
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
    { input: { relatedTo: r }, definition: { relationSchema } },
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
 * The occurrence of the span with the same name within the operation.
 */
export function withOccurrence<
  const SelectedRelationNameT extends keyof RelationSchemasT,
  const RelationSchemasT,
  const VariantsT extends string,
>(
  value: number | ((occurrence: number) => boolean),
): SpanMatcherFn<SelectedRelationNameT, RelationSchemasT, VariantsT> {
  const matcher: SpanMatcherFn<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  > = ({ annotation }) => {
    if (typeof value === 'number') return annotation.occurrence === value
    return value(annotation.occurrence)
  }
  matcher.fromDefinition = { occurrence: value }
  return matcher
}

export function withComponentRenderCount<
  const SelectedRelationNameT extends keyof RelationSchemasT,
  const RelationSchemasT,
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
  const RelationSchemasT,
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
 * Only applicable for 'requiredSpans' list: it will opt-out of the default behavior,
 * which interrupts the trace if the requiredSpan has an error status.
 */
export function continueWithErrorStatus<
  const SelectedRelationNameT extends keyof RelationSchemasT,
  const RelationSchemasT,
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
  const RelationSchemasT,
  const VariantsT extends string,
>(
  ...matchers: SpanMatcherFn<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  >[]
): SpanMatcherFn<SelectedRelationNameT, RelationSchemasT, VariantsT> {
  const tags: SpanMatcherTags = {}
  const definition: SpanMatchDefinitionCombinator<
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
  const RelationSchemasT,
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
  const RelationSchemasT,
  const VariantsT extends string,
>(
  matcher: SpanMatcherFn<SelectedRelationNameT, RelationSchemasT, VariantsT>,
): SpanMatcherFn<SelectedRelationNameT, RelationSchemasT, VariantsT> {
  // since not is a negation, we don't carry over tags
  return (...args) => !matcher(...args)
}

export function fromDefinition<
  const SelectedRelationNameT extends keyof RelationSchemasT,
  const RelationSchemasT,
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
  } else {
    combined = withAllConditions(...matchers)
  }

  combined.fromDefinition = definition

  if (typeof definition.matchingIndex === 'number') {
    combined.matchingIndex = definition.matchingIndex
  }

  return combined
}
