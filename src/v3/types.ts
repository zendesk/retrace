import type { CPUIdleProcessorOptions } from './firstCPUIdle'
import type { SpanMatch, SpanMatcherFn } from './matchSpan'
import type { SpanAndAnnotation } from './spanAnnotationTypes'
import type {
  ActiveTraceInput,
  Attributes,
  DraftTraceInput,
  Span,
  SpanStatus,
} from './spanTypes'
import type { AllPossibleTraces, FinalTransition } from './Trace'
import type { TraceRecording } from './traceRecordingTypes'
import type {
  ArrayWithAtLeastOneElement,
  MapTuple,
  UnionToIntersection,
  UnionToTuple,
} from './typeUtils'

export interface Timestamp {
  // absolute count of ms from epoch
  epoch: number
  // performance.now() time
  now: number
}

export type RelationSchemaValue =
  | StringConstructor
  | NumberConstructor
  | BooleanConstructor
  | readonly (string | number | boolean)[]

export type MapSchemaToTypesBase<T> = keyof T extends never
  ? Record<string, never>
  : {
      [K in keyof T]: T[K] extends StringConstructor
        ? string
        : T[K] extends NumberConstructor
        ? number
        : T[K] extends BooleanConstructor
        ? boolean
        : T[K] extends readonly (infer U)[]
        ? U
        : never
    }

export type MapSchemaToTypes<RelationSchemasT> =
  RelationSchemasT extends RelationSchemasT
    ? MapSchemaToTypesBase<RelationSchemasT>
    : never

// a span can have any combination of relations
export type RelationsOnASpan<RelationSchemasT> = Partial<
  MapSchemaToTypes<
    UnionToIntersection<RelationSchemasT[keyof RelationSchemasT]>
  >
>

export type RelatedTo<RelationSchemasT> = MapSchemaToTypes<
  RelationSchemasT[keyof RelationSchemasT]
>

/**
 * Reverse of MapSchemaToTypes:
 *   - boolean => BooleanConstructor
 *   - string => StringConstructor (if it's the wide string)
 *   - number => NumberConstructor (if it's the wide number)
 *   - union of string/number *literals* => a readonly tuple of those literals
 *   - otherwise => never
 */
export type MapTypesToSchema<T> = {
  [K in keyof T]: T[K] extends boolean // 1) If it's (wide) boolean or effectively boolean => BooleanConstructor
    ? BooleanConstructor
    : T[K] extends string | number | boolean
    ? string extends T[K]
      ? StringConstructor
      : number extends T[K]
      ? NumberConstructor
      : boolean extends T[K]
      ? BooleanConstructor
      : readonly [...UnionToTuple<T[K]>]
    : never
}

export type RelationSchemasBase<RelationSchemasT> = {
  [SchemaNameT in keyof RelationSchemasT]: {
    [K in keyof RelationSchemasT[SchemaNameT]]: RelationSchemaValue
  }
}

/**
 * for now this is always 'operation', but in the future we could also implement tracing 'process' types
 */
export type TraceType = 'operation'

export type TraceStatus = SpanStatus | 'interrupted'

// trace interruptions that we consider 'invalid'
export const INVALID_TRACE_INTERRUPTION_REASONS = [
  'timeout',
  'draft-cancelled',
  'invalid-state-transition',
  'parent-interrupted',
  'child-interrupted',
  'child-timeout',
] as const

export type TraceInterruptionReasonForInvalidTraces =
  (typeof INVALID_TRACE_INTERRUPTION_REASONS)[number]

export const TRACE_REPLACE_INTERRUPTION_REASONS = [
  'another-trace-started',
  // if definition changes, we need to recreate the Trace instance and replay the spans
  'definition-changed',
] as const

export type TraceReplaceInterruptionReason =
  (typeof TRACE_REPLACE_INTERRUPTION_REASONS)[number]

export const VALID_TRACE_INTERRUPTION_REASONS = [
  'waiting-for-interactive-timeout',
  'aborted',
  'idle-component-no-longer-idle',
  'matched-on-interrupt',
  'matched-on-required-span-with-error',
  ...TRACE_REPLACE_INTERRUPTION_REASONS,
] as const

export type TraceInterruptionReasonForValidTraces =
  (typeof VALID_TRACE_INTERRUPTION_REASONS)[number]

export type TraceInterruptionReason =
  | TraceInterruptionReasonForInvalidTraces
  | TraceInterruptionReasonForValidTraces

export type PublicTraceInterruptionReason =
  | 'aborted'
  | 'another-trace-started'
  | 'parent-interrupted'
  | 'draft-cancelled'
  | 'definition-changed'

// New payload types for different interruption reasons
export interface AnotherTraceStartedInterruptionPayload<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
> {
  readonly reason: 'another-trace-started'

  readonly anotherTrace: {
    readonly id: string
    readonly name: string
  }
}

export interface GenericInterruptionPayload {
  readonly reason: Exclude<TraceInterruptionReason, 'another-trace-started'>
}

// Union type for all possible interruption payloads
export type InterruptionReasonPayload<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
> =
  | AnotherTraceStartedInterruptionPayload<RelationSchemasT>
  | GenericInterruptionPayload

// Internal interruption payloads that include all possible reasons
export interface InternalAnotherTraceStartedInterruptionPayload<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  VariantsT extends string,
> {
  reason: 'another-trace-started'
  anotherTraceContext: TraceContext<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  >
}

export interface InternalGenericInterruptionPayload {
  reason: Exclude<TraceInterruptionReason, 'another-trace-started'>
}

export type InternalInterruptionReasonPayload<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  VariantsT extends string,
> =
  | InternalAnotherTraceStartedInterruptionPayload<
      SelectedRelationNameT,
      RelationSchemasT,
      VariantsT
    >
  | InternalGenericInterruptionPayload

export type SingleTraceReportFn<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  VariantsT extends string,
> = (
  trace: TraceRecording<SelectedRelationNameT, RelationSchemasT>,
  context: TraceContext<SelectedRelationNameT, RelationSchemasT, VariantsT>,
) => void

export type AnyPossibleReportFn<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
> = <SelectedRelationNameT extends keyof RelationSchemasT>(
  trace: TraceRecording<SelectedRelationNameT, RelationSchemasT>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: TraceContext<SelectedRelationNameT, RelationSchemasT, any>,
) => void

export type PartialPossibleTraceContext<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
> = Partial<AllPossibleTraceContexts<RelationSchemasT, string>>

export type ReportErrorFn<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
> = (
  error: Error,
  currentTraceContext?: PartialPossibleTraceContext<RelationSchemasT>,
) => void

export type GenerateIdFn = (kind: 'span' | 'tick' | 'trace') => string

export interface TraceManagerConfig<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
> {
  reportFn: AnyPossibleReportFn<RelationSchemasT>

  generateId: GenerateIdFn

  relationSchemas: RelationSchemasT

  /**
   * IMPLEMENTATION TODO: The span types that should be omitted from the trace report. Or maybe a more general way to filter spans?
   */
  // spanTypesOmittedFromReport?: SpanType[]

  /**
   * Strategy for deduplicating performance entries.
   * If not provided, no deduplication will be performed.
   */
  getPerformanceEntryDeduplicationStrategy?: () => SpanDeduplicationStrategy<RelationSchemasT>

  reportErrorFn: ReportErrorFn<RelationSchemasT>
  reportWarningFn: ReportErrorFn<RelationSchemasT>

  /**
   * Whether to track tickId on spans.
   * Useful for grouping spans that were recorded in the same event loop tick.
   * If true, the tickId will be set on the span.
   * This enables finding the parent relative to the event-loop tick,
   * when using the `getParentSpan` function or the `parentSpanMatcher`.
   * Useful for creating hierarchies from React components or hooks, or attributing and propagating errors.
   */
  enableTickTracking?: boolean

  /**
   * Sometimes a span is processed after the trace has started.
   * This setting defines how much older than the trace the span can be, and still be accepted into the trace.
   * Defaults to 100ms.
   */
  acceptSpansStartedBeforeTraceStartThreshold?: number

  /**
   * A list of span attributes that should be inherited by
   * the children spans (propagated downwards).
   * This is useful for ensuring that certain attributes are available on all children spans,
   * for example, to ensure that `team` ownership information is available on descendant spans,
   * even if they didn't explicitly define it.
   * Note that a children span only inherits the attribute if it doesn't already have them defined.
   *
   * This inheritance occurs only after a trace is completed,
   * or when manually requested, once the parent spans are resolved.
   */
  heritableSpanAttributes?: readonly string[]
}

export interface TraceManagerUtilities<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
> extends TraceManagerConfig<RelationSchemasT> {
  /**
   * interrupts the active trace (if any) and replaces it with a new one
   */
  replaceCurrentTrace: (
    newTrace: AllPossibleTraces<RelationSchemasT>,
    reason: TraceReplaceInterruptionReason,
  ) => void
  onTraceEnd: (
    trace: AllPossibleTraces<RelationSchemasT>,
    finalTransition: FinalTransition<RelationSchemasT>,
    traceRecording:
      | TraceRecording<keyof RelationSchemasT, RelationSchemasT>
      | undefined,
  ) => void
  getCurrentTrace: () => AllPossibleTraces<RelationSchemasT> | undefined
  onTraceConstructed: (trace: AllPossibleTraces<RelationSchemasT>) => void
  acceptSpansStartedBeforeTraceStartThreshold: number
}

export interface TraceUtilities<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
> extends TraceManagerUtilities<RelationSchemasT> {
  performanceEntryDeduplicationStrategy?: SpanDeduplicationStrategy<RelationSchemasT>
}

export interface TraceDefinitionModifications<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  VariantsT extends string,
> {
  additionalRequiredSpans?: readonly SpanMatch<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  >[]
  additionalInterruptOnSpans?: readonly SpanMatch<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  >[]
  additionalDebounceOnSpans?: readonly SpanMatch<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  >[]
}

export interface TraceModifications<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  VariantsT extends string,
> extends TraceDefinitionModifications<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  > {
  relatedTo: MapSchemaToTypes<RelationSchemasT[SelectedRelationNameT]>
  attributes?: Attributes
}

type ErrorBehavior = 'error' | 'error-and-continue' | 'warn-and-continue'

export interface TransitionDraftOptions {
  previouslyActivatedBehavior?: ErrorBehavior
  invalidRelatedToBehavior?: ErrorBehavior
}

export interface CaptureInteractiveConfig extends CPUIdleProcessorOptions {
  /**
   * How long to wait for CPU Idle before giving up and interrupting the trace.
   */
  timeout?: number
}

export type LabelMatchingInputRecord<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  VariantsT extends string,
> = Record<
  string,
  SpanMatch<SelectedRelationNameT, RelationSchemasT, VariantsT>
>

export type LabelMatchingFnsRecord<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  VariantsT extends string,
> = Record<
  string,
  SpanMatcherFn<SelectedRelationNameT, RelationSchemasT, VariantsT>
>

export interface TraceVariant<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  VariantsT extends string,
> extends TraceDefinitionModifications<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  > {
  /**
   * How long before we give up and cancel the trace if the required spans have not been seen
   * In milliseconds.
   */
  timeout: number
}

export interface PromoteSpanAttributesDefinition<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  VariantsT extends string,
> {
  span: SpanMatch<SelectedRelationNameT, RelationSchemasT, VariantsT>
  attributes: string[]
}

/**
 * Definition of a trace that includes conditions on when to end, debounce, and interrupt.
 * The "input" version will be transformed into the standardized version internally,
 * converting all matchers into functions.
 */
export interface TraceDefinition<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  VariantsT extends string,
  ComputedValueDefinitionsT extends {
    [K in keyof ComputedValueDefinitionsT]: ComputedValueDefinitionInput<
      NoInfer<SelectedRelationNameT>,
      RelationSchemasT,
      NoInfer<VariantsT>,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      any
    >
  },
> {
  /**
   * The name of the trace.
   */
  name: string

  type?: TraceType

  relationSchemaName: SelectedRelationNameT

  // TypeScript TODO: typing this so that the span labels are inferred?
  labelMatching?: LabelMatchingInputRecord<
    NoInfer<SelectedRelationNameT>,
    RelationSchemasT,
    VariantsT
  >

  /**
   * A list of trace names that instead of interrupting the current trace,
   * will be adopted as children of this trace.
   */
  adoptAsChildren?: readonly string[]

  /**
   * This may include renders spans of components that have to be rendered with all data
   * to consider the operation as visually complete
   * this is close to the idea of "Largest Contentful Paint"
   * but rather than using "Largest" as a shorthand,
   * we're giving the power to the engineer to manually define
   * which parts of the product are "critical" or most important
   */
  requiredSpans: ArrayWithAtLeastOneElement<
    SpanMatch<NoInfer<SelectedRelationNameT>, RelationSchemasT, VariantsT>
  >
  debounceOnSpans?: ArrayWithAtLeastOneElement<
    SpanMatch<NoInfer<SelectedRelationNameT>, RelationSchemasT, VariantsT>
  >
  interruptOnSpans?: ArrayWithAtLeastOneElement<
    SpanMatch<NoInfer<SelectedRelationNameT>, RelationSchemasT, VariantsT>
  >

  /**
   * How long should we wait after the last required span (or debounced span).
   * in anticipation of more spans
   * @default DEFAULT_DEBOUNCE_DURATION (500)
   */
  debounceWindow?: number

  /**
   * variants are used to describe slightly different versions of the same tracer
   * e.g. if a trace is started due to cold boot navigation, it may have a different timeout
   * than if it was started due to a user click
   * the trace might also lead to different places in the app
   * due to different conditions / options related to the action that the user is taking,
   * which is something that might be reflected by providing additional span requirements to that variant.
   * The key is the name of the variant, and the value is the configuration for that variant.
   *
   * We recommend naming the variant by using the following descriptor:
   * - `on_XYZ` - what caused the trace to start, or where it was started
   * - `till_XYZ` - where we ended up, or what else happened that led to the end of the trace
   *
   * You can do either one, or both.
   * Add variants whenever you want to be able to distinguish the trace data
   * based on different triggers or different contexts.
   *
   * For example:
   * - `on_submit_press`
   * - `on_cold_boot`
   * - `till_navigated_home`
   * - `till_logged_in`
   * - `on_submit_press_till_reloaded`
   * - `on_search_till_results`
   */
  variants: {
    [VariantName in VariantsT]: TraceVariant<
      SelectedRelationNameT,
      RelationSchemasT,
      VariantsT
    >
  }

  /**
   * Indicates the operation should continue capturing events after the trace is complete,
   * until the page is considered fully interactive.
   * Provide 'true' for defaults, or a custom configuration object.
   */
  captureInteractive?: boolean | CaptureInteractiveConfig

  /**
   * A list of span matchers that will suppress error status propagation to the trace level.
   * If a span with `status: error` matches any of these matchers,
   * its error status will not affect the overall trace status.
   */
  suppressErrorStatusPropagationOnSpans?: readonly SpanMatch<
    NoInfer<SelectedRelationNameT>,
    RelationSchemasT,
    VariantsT
  >[]

  /**
   * A record of computed span definitions that will be converted to their final form.
   * The key is the name of the computed span. You can add more computed spans later using tracer.defineComputedSpan().
   */
  computedSpanDefinitions?: Record<
    string,
    ComputedSpanDefinitionInput<
      NoInfer<SelectedRelationNameT>,
      RelationSchemasT,
      VariantsT
    >
  >

  /**
   * A record of computed value definitions that will be converted to their final form.
   * The key is the name of the computed value. You can add more computed values later using tracer.defineComputedValue().
   */
  computedValueDefinitions?: ComputedValueDefinitionsT

  /**
   * Define attributes that should be promoted from the span to the trace level, along with the matchers for the spans.
   * In case of conflicts, last attribute wins.
   */
  promoteSpanAttributes?: PromoteSpanAttributesDefinition<
    NoInfer<SelectedRelationNameT>,
    RelationSchemasT,
    VariantsT
  >[]
}

/**
 * Trace Definition with added fields and converting all matchers into functions.
 * Used internally by the TraceManager.
 */
export interface CompleteTraceDefinition<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  VariantsT extends string,
> extends Omit<
    TraceDefinition<SelectedRelationNameT, RelationSchemasT, VariantsT, {}>,
    | 'computedSpanDefinitions'
    | 'computedValueDefinitions'
    | 'requiredSpans'
    | 'debounceOnSpans'
    | 'interruptOnSpans'
  > {
  computedSpanDefinitions: Record<
    string,
    ComputedSpanDefinition<
      NoInfer<SelectedRelationNameT>,
      RelationSchemasT,
      VariantsT
    >
  >
  computedValueDefinitions: Record<
    string,
    ComputedValueDefinition<
      NoInfer<SelectedRelationNameT>,
      RelationSchemasT,
      VariantsT
    >
  >

  relationSchema: NoInfer<RelationSchemasT[SelectedRelationNameT]>

  labelMatching?: LabelMatchingFnsRecord<
    NoInfer<SelectedRelationNameT>,
    RelationSchemasT,
    VariantsT
  >

  requiredSpans: readonly SpanMatcherFn<
    NoInfer<SelectedRelationNameT>,
    RelationSchemasT,
    VariantsT
  >[]

  debounceOnSpans?: readonly SpanMatcherFn<
    NoInfer<SelectedRelationNameT>,
    RelationSchemasT,
    VariantsT
  >[]

  interruptOnSpans?: readonly SpanMatcherFn<
    NoInfer<SelectedRelationNameT>,
    RelationSchemasT,
    VariantsT
  >[]

  suppressErrorStatusPropagationOnSpans?: readonly SpanMatcherFn<
    NoInfer<SelectedRelationNameT>,
    RelationSchemasT,
    VariantsT
  >[]
}

/**
 * Strategy for deduplicating performance entries
 */
export interface SpanDeduplicationStrategy<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
> {
  /**
   * Returns an existing span annotation if the span should be considered a duplicate
   */
  findDuplicate: (
    span: Span<RelationSchemasT>,
    recordedItems: Map<string, SpanAndAnnotation<RelationSchemasT>>,
  ) => SpanAndAnnotation<RelationSchemasT> | undefined

  /**
   * Called when a span is recorded to update deduplication state
   */
  recordSpan: (spanAndAnnotation: SpanAndAnnotation<RelationSchemasT>) => void

  /**
   * Called when trace recording is complete to clean up any deduplication state
   */
  reset: () => void

  /**
   * Selects which span should be used when a duplicate is found.
   * @returns the span that should be used in the annotation
   */
  selectPreferredSpan: (
    existingSpan: Span<RelationSchemasT>,
    newSpan: Span<RelationSchemasT>,
  ) => Span<RelationSchemasT>
}

export type SpecialStartToken = 'operation-start'
export type SpecialEndToken = 'operation-end' | 'interactive'
export type SpecialToken = SpecialStartToken | SpecialEndToken

/**
 * Definition of custom spans
 */
export interface ComputedSpanDefinition<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  VariantsT extends string,
> {
  /**
   * the *first* span matching the condition that will be considered as the start of the computed span
   * if you want the *last* matching span, use `nthMatch: -1`
   */
  startSpan:
    | SpanMatcherFn<SelectedRelationNameT, RelationSchemasT, VariantsT>
    | SpecialStartToken
  /**
   * the *first* span matching the condition that will be considered as the end of the computed span
   * if you want the *last* matching span, use `nthMatch: -1`
   */
  endSpan:
    | SpanMatcherFn<SelectedRelationNameT, RelationSchemasT, VariantsT>
    | SpecialEndToken

  /**
   * If true, we will attempt to compute the span even if the trace was interrupted.
   * Alternatively, specify an array of InterruptionReasons in which the span should be computed.
   */
  // TODO: forceCompute: boolean | InterruptionReason[]
}

/**
 * Definition of custom values
 */
export interface ComputedValueDefinition<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  VariantsT extends string,
> {
  matches: SpanMatcherFn<SelectedRelationNameT, RelationSchemasT, VariantsT>[]
  /** if returns undefined, will not report the computed value */
  computeValueFromMatches: NoInfer<
    (
      ...matchers: (readonly SpanAndAnnotation<RelationSchemasT>[])[]
    ) => number | string | boolean | undefined
  >

  /**
   * If true, we will attempt to compute the span even if the trace was interrupted.
   * Alternatively, specify an array of InterruptionReasons in which the span should be computed.
   */
  // TODO: forceCompute: boolean | InterruptionReason[]
}

/**
 * Definition of custom spans input
 */
export interface ComputedSpanDefinitionInput<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  VariantsT extends string,
> {
  startSpan:
    | SpanMatch<SelectedRelationNameT, RelationSchemasT, VariantsT>
    | 'operation-start'
  endSpan:
    | SpanMatch<SelectedRelationNameT, RelationSchemasT, VariantsT>
    | 'operation-end'
    | 'interactive'
}

/**
 * Definition of custom values input
 */
export interface ComputedValueDefinitionInput<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  VariantsT extends string,
  MatchersT extends NoInfer<
    SpanMatch<SelectedRelationNameT, RelationSchemasT, VariantsT>
  >[],
> {
  matches: [...MatchersT]
  computeValueFromMatches: NoInfer<
    (
      ...matches: MapTuple<
        MatchersT,
        readonly SpanAndAnnotation<RelationSchemasT>[]
      >
    ) => number | string | boolean | undefined
  >
}

export type DeriveRelationsFromPerformanceEntryFn<RelationSchemasT> = (
  entry: PerformanceEntry,
) => RelationsOnASpan<RelationSchemasT> | undefined

export interface DraftTraceContext<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  VariantsT extends string,
> extends TraceContext<SelectedRelationNameT, RelationSchemasT, VariantsT> {
  readonly input: DraftTraceInput<
    RelationSchemasT[SelectedRelationNameT],
    VariantsT
  >
}

export type AllPossibleTraceContexts<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  VariantsT extends string,
> = {
  [SelectedRelationNameT in keyof RelationSchemasT]: DraftTraceContext<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  >
}[keyof RelationSchemasT]

export interface TraceContext<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  VariantsT extends string,
> {
  readonly definition: CompleteTraceDefinition<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  >
  readonly input:
    | ActiveTraceInput<RelationSchemasT[SelectedRelationNameT], VariantsT>
    | DraftTraceInput<RelationSchemasT[SelectedRelationNameT], VariantsT>
  // eslint-disable-next-line @typescript-eslint/consistent-indexed-object-style
  readonly recordedItemsByLabel: {
    readonly [label: string]: ReadonlySet<SpanAndAnnotation<RelationSchemasT>>
  }
  readonly recordedItems: ReadonlyMap<
    string,
    SpanAndAnnotation<RelationSchemasT>
  >
}
