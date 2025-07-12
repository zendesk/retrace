import type { ErrorInfo } from 'react'
import type { BeaconConfig } from './hooksTypes'
import type {
  ParentSpanMatcher,
  SpanAndAnnotationForMatching,
} from './matchSpan'
import type { TICK_META, TICK_META_END, TickMeta } from './TickParentResolver'
import type { TraceRecording } from './traceRecordingTypes'
import type {
  DraftTraceContext,
  MapSchemaToTypes,
  RelationSchemasBase,
  RelationsOnASpan,
  Timestamp,
} from './types'
import type { OpenPick, Prettify } from './typeUtils'

export type NativePerformanceEntryType =
  | 'element'
  | 'event'
  | 'first-input'
  | 'largest-contentful-paint'
  | 'layout-shift'
  | 'long-animation-frame'
  | 'longtask'
  | 'mark'
  | 'measure'
  | 'navigation'
  | 'paint'
  | 'resource'
  | 'taskattribution'
  | 'visibility-state'

export type ComponentLifecycleSpanType =
  | 'component-render-start'
  | 'component-render'
  | 'component-unmount'
  | 'hook-render-start'
  | 'hook-render'
  | 'hook-unmount'

export interface DraftTraceConfig<RelationSchemaT, VariantsT extends string> {
  id?: string
  parentTraceId?: string
  startTime?: Partial<Timestamp>
  variant: VariantsT
  /**
   * any attributes that are relevant to the entire trace
   */
  attributes?: Attributes
  relatedTo: MapSchemaToTypes<RelationSchemaT> | undefined
  /**
   * Any additional data that can be used by the tooling to identify the trace
   * It will *not* be a part of the trace recording.
   */
  // TODO: add typing
  baggage?: unknown
}

export interface StartTraceConfig<RelationSchemaT, VariantsT extends string>
  extends DraftTraceConfig<RelationSchemaT, VariantsT> {
  relatedTo: MapSchemaToTypes<RelationSchemaT>
}

export interface DraftTraceInput<RelationSchemaT, VariantsT extends string>
  extends DraftTraceConfig<RelationSchemaT, VariantsT> {
  id: string
  startTime: Timestamp
}

export interface ActiveTraceInput<RelationSchemaT, VariantsT extends string>
  extends DraftTraceInput<RelationSchemaT, VariantsT> {
  relatedTo: MapSchemaToTypes<RelationSchemaT>
}

export interface ActiveTraceConfig<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT,
  VariantsT extends string,
> extends DraftTraceInput<RelationSchemasT[SelectedRelationNameT], VariantsT> {
  relatedTo: MapSchemaToTypes<RelationSchemasT[SelectedRelationNameT]>
}

// eslint-disable-next-line @typescript-eslint/consistent-indexed-object-style
export interface Attributes {
  [key: string]: unknown
}
export type SpanStatus = 'ok' | 'error'

export type GetParentSpanFn<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
> = (
  context: GetParentSpanContext<RelationSchemasT>,
  /**
   * Whether to attempt to resolve parents recursively.
   * Enabling this "bakes-in" the PARENT_SPAN reference onto the span
   */
  recursive?: boolean,
) => Span<RelationSchemasT> | undefined

export const PARENT_SPAN = Symbol('parentSpan')

export interface SpanBase<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
> {
  /**
   * providing an id is optional, but it will always be present in the recording
   * if not provided, it will be generated automatically
   */
  id: string

  // TODO: allow defining custom spans that extend this SpanBase
  type: SpanType | (string & {})

  /**
   * The common name of the span.
   * If converted from a PerformanceEntry, this is a sanitized version of the name.
   */
  name: string

  startTime: Timestamp

  // for non performance entries, relatedTo is set explicitly in the span, something like ticket id or user id
  // performance entries can derive relatedTo based using `deriveRelationFromPerformanceEntry`
  relatedTo?: RelationsOnASpan<RelationSchemasT>

  attributes: Attributes

  /**
   * The duration of this span.
   * If this span is just an event (a point in time), this will be 0.
   * On the other hand, spans will have duration > 0.
   */
  duration: number

  /**
   * Status of the span ('error' or 'ok').
   */
  status?: SpanStatus

  /**
   * The original PerformanceEntry from which the Span was created
   */
  performanceEntry?: PerformanceEntry

  /**
   * if status is error, optionally provide the Error object with additional metadata
   */
  error?: ErrorLike

  /**
   * Optional parent span, if known.
   * Non-enumerable (symbol).
   */
  [PARENT_SPAN]?: Span<RelationSchemasT>

  /**
   * Resolve parentSpanId after the Trace is completed, or on demand.
   * Set internally.
   */
  getParentSpan: GetParentSpanFn<RelationSchemasT>

  /**
   * The ID of the tick in which the span was created.
   * This is used to group spans created in the same event loop tick.
   */
  tickId?: string

  /**
   * Metadata about the tick in which the span was created (if tick-tracking functionality enabled).
   * Not enumerable (symbol).
   * This is used to resolve parent spans across ticks.
   */
  [TICK_META]?: TickMeta<RelationSchemasT>
  /**
   * Metadata about the tick in which the span was ended (if tick-tracking functionality enabled).
   * Not enumerable (symbol).
   * This is used to resolve parent spans across ticks.
   */
  [TICK_META_END]?: TickMeta<RelationSchemasT>

  /**
   * If true, this span will only be present for matching while the trace is being recorded,
   * but will not be included in the final trace recording, unless it is a parent of another span.
   * This is useful for internal spans that are not relevant to the final trace.
   */
  internalUse?: boolean
}

export interface WithParentSpanMatcher<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
> {
  /**
   * Optional parent span, if known. Takes precedence over getParentSpan.
   * Non-enumerable.
   */
  parentSpan?: Span<RelationSchemasT>

  /**
   * A matcher that can be used to find the parent span of this span after the trace is completed.
   */
  parentSpanMatcher?: ParentSpanMatcher<
    keyof RelationSchemasT,
    RelationSchemasT,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any
  >
}

export interface ConvenienceSpanProperties<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
> extends WithParentSpanMatcher<RelationSchemasT> {
  startTime?: Partial<Timestamp>
}

export interface GetParentSpanContext<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
> {
  thisSpanAndAnnotation: SpanAndAnnotationForMatching<RelationSchemasT>
  // TODO: improve types here by requiring SelectedRelationNameT and VariantsT:
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  traceContext: DraftTraceContext<any, RelationSchemasT, any> | undefined
}

export interface ComponentRenderSpan<
    RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  >
  // it would be more correct to use 'relatedTo' from BeaconConfig,
  // but we'd need to solve some type issues
  extends Omit<SpanBase<RelationSchemasT>, 'attributes'>,
    Omit<BeaconConfig<RelationSchemasT>, 'relatedTo'> {
  type: ComponentLifecycleSpanType
  isIdle: boolean
  errorInfo?: ErrorInfo
  renderCount: number
  attributes: NonNullable<BeaconConfig<RelationSchemasT>['attributes']>
}

export type InitiatorType =
  | 'audio'
  | 'beacon'
  | 'body'
  | 'css'
  | 'early-hint'
  | 'embed'
  | 'fetch'
  | 'frame'
  | 'iframe'
  | 'icon'
  | 'image'
  | 'img'
  | 'input'
  | 'link'
  | 'navigation'
  | 'object'
  | 'ping'
  | 'script'
  | 'track'
  | 'video'
  | 'xmlhttprequest'
  | 'other'

export interface ResourceSpan<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
> extends SpanBase<RelationSchemasT> {
  type: 'resource'
  resourceDetails: {
    initiatorType: InitiatorType
    query: Record<string, string | string[]>
    hash: string
  }
}

export interface PerformanceEntrySpan<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
> extends SpanBase<RelationSchemasT> {
  type: Exclude<NativePerformanceEntryType, 'resource'>
}

/**
 * Represents a child operation span within a trace.
 * The shape is the same as TraceRecording
 */
export interface ChildOperationSpan<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
> extends Omit<SpanBase<RelationSchemasT>, 'id'>,
    Omit<
      TraceRecording<keyof RelationSchemasT, RelationSchemasT>,
      // these come from the SpanBase type:
      'duration' | 'status' | 'relatedTo' | 'entries'
    > {
  type: 'operation'
}

export interface ErrorLike {
  message: string
  name?: string
  stack?: string
  cause?: unknown
}

export interface ErrorSpan<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
> extends SpanBase<RelationSchemasT> {
  type: 'error'
  error: ErrorLike
  status: 'error'
}

/**
 * All possible trace entries
 */
export type Span<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
> =
  | PerformanceEntrySpan<RelationSchemasT>
  | ComponentRenderSpan<RelationSchemasT>
  | ResourceSpan<RelationSchemasT>
  | ChildOperationSpan<RelationSchemasT>
  | ErrorSpan<RelationSchemasT>

export type SpanType =
  | NativePerformanceEntryType
  | ComponentLifecycleSpanType
  | 'operation'
  | 'error'

export type AutoAddedSpanProperties =
  | 'id'
  | 'startTime'
  | 'attributes'
  | 'duration'
  | 'getParentSpan'

export type ConvenienceSpan<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  SpanT extends Span<RelationSchemasT>,
> = Prettify<
  Omit<SpanT, AutoAddedSpanProperties> &
    Partial<Pick<SpanT, 'id' | 'attributes' | 'duration'>> &
    ConvenienceSpanProperties<RelationSchemasT>
>

export type ErrorSpanInput<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
> = Prettify<
  Omit<
    ErrorSpan<RelationSchemasT>,
    'status' | 'type' | 'name' | AutoAddedSpanProperties
  > &
    Partial<
      Pick<
        ErrorSpan<RelationSchemasT>,
        'type' | 'name' | 'id' | 'attributes' | 'duration'
      > & {
        startTime: Partial<Timestamp>
      }
    > &
    ConvenienceSpanProperties<RelationSchemasT>
>

export type PerformanceEntrySpanInput<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
> = Prettify<
  Omit<PerformanceEntrySpan<RelationSchemasT>, AutoAddedSpanProperties> &
    Partial<
      Pick<
        PerformanceEntrySpan<RelationSchemasT>,
        'id' | 'attributes' | 'duration'
      > & {
        startTime?: Partial<Timestamp>
      }
    > &
    ConvenienceSpanProperties<RelationSchemasT>
>

export type RenderSpanInput<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
> = Prettify<
  Omit<ComponentRenderSpan<RelationSchemasT>, AutoAddedSpanProperties> &
    Partial<
      Pick<
        ComponentRenderSpan<RelationSchemasT>,
        'id' | 'attributes' | 'duration'
      >
    > &
    ConvenienceSpanProperties<RelationSchemasT>
>

export type UpdatableSpanProperties =
  | 'attributes'
  | 'relatedTo'
  | 'renderedOutput'
  | 'isIdle'

export type SpanUpdateFunction<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  SpanT extends Span<RelationSchemasT>,
> = (
  spanUpdates: Partial<OpenPick<SpanT, UpdatableSpanProperties>> & {
    reprocess?: boolean
  },
) => void
