import {
  fromDefinition,
  type SpanMatch,
  type SpanMatcherFn,
  type SpanMatcherTags,
} from './matchSpan'
import type {
  LabelMatchingFnsRecord,
  LabelMatchingInputRecord,
  RelationSchemasBase,
} from './types'
import type { ArrayWithAtLeastOneElement } from './typeUtils'

export function applyDefaultTags<
  const SelectedRelationNameT extends keyof RelationSchemasT,
  const RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  const VariantsT extends string,
>(
  matcherFn: SpanMatcherFn<SelectedRelationNameT, RelationSchemasT, VariantsT>,
  defaultTags?: SpanMatcherTags,
): SpanMatcherFn<SelectedRelationNameT, RelationSchemasT, VariantsT> {
  if (!defaultTags) {
    return matcherFn
  }
  for (const key of Object.keys(defaultTags)) {
    const k = key as keyof SpanMatcherTags
    // only add default tags to matcher if they are not already defined
    if (!(k in matcherFn)) {
      // @ts-expect-error hard to type
      // eslint-disable-next-line no-param-reassign
      matcherFn[k] = defaultTags[k]
    }
  }
  return matcherFn
}

export function ensureMatcherFn<
  const SelectedRelationNameT extends keyof RelationSchemasT,
  const RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  const VariantsT extends string,
  const MatcherInputT extends SpanMatch<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  > = SpanMatch<SelectedRelationNameT, RelationSchemasT, VariantsT>,
>(
  matcherFnOrDefinition: MatcherInputT,
  defaultTags?: SpanMatcherTags,
): SpanMatcherFn<SelectedRelationNameT, RelationSchemasT, VariantsT> {
  return applyDefaultTags(
    typeof matcherFnOrDefinition === 'function'
      ? matcherFnOrDefinition
      : fromDefinition<SelectedRelationNameT, RelationSchemasT, VariantsT>(
          matcherFnOrDefinition,
        ),
    defaultTags,
  )
}

function arrayHasAtLeastOneElement<T>(
  arr: readonly T[],
): arr is ArrayWithAtLeastOneElement<T> {
  return arr.length > 0
}

export function convertMatchersToFns<
  const SelectedRelationNameT extends keyof RelationSchemasT,
  const RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  const VariantsT extends string,
>(
  matchers:
    | readonly SpanMatch<SelectedRelationNameT, RelationSchemasT, VariantsT>[]
    | undefined,
):
  | ArrayWithAtLeastOneElement<
      SpanMatcherFn<SelectedRelationNameT, RelationSchemasT, VariantsT>
    >
  | undefined {
  const mapped = matchers?.map<
    SpanMatcherFn<SelectedRelationNameT, RelationSchemasT, VariantsT>
  >((m) => ensureMatcherFn(m))

  if (mapped && arrayHasAtLeastOneElement(mapped)) {
    return mapped
  }
  return undefined
}

export function convertLabelMatchersToFns<
  const SelectedRelationNameT extends keyof RelationSchemasT,
  const RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  const VariantsT extends string,
>(
  definitionLabelMatchers: LabelMatchingInputRecord<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  >,
): LabelMatchingFnsRecord<SelectedRelationNameT, RelationSchemasT, VariantsT> {
  const matchers: LabelMatchingFnsRecord<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  > = {}
  for (const key in definitionLabelMatchers) {
    // eslint-disable-next-line no-continue
    if (!definitionLabelMatchers?.[key]) continue
    matchers[key] = ensureMatcherFn<
      SelectedRelationNameT,
      RelationSchemasT,
      VariantsT
    >(definitionLabelMatchers[key])
  }
  return matchers
}

/**
 * Helper function to ensure that the matcher is a function or a special token
 */
export function ensureMatcherFnOrSpecialToken<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  VariantsT extends string,
  SpecialToken extends string,
>(
  spanMatcher:
    | SpanMatch<SelectedRelationNameT, RelationSchemasT, VariantsT>
    | SpecialToken,
):
  | SpanMatcherFn<SelectedRelationNameT, RelationSchemasT, VariantsT>
  | SpecialToken
  | undefined {
  // Handle string types (special matchers)
  if (typeof spanMatcher === 'string') {
    return spanMatcher
  }

  return ensureMatcherFn(spanMatcher)
}
