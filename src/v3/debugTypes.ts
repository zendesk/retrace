import type { SpanMatcherFn } from './matchSpan'
import type { SpanAndAnnotation } from './spanAnnotationTypes'
import type { OnEnterStatePayload } from './Trace'
import type {
  DraftTraceContext,
  RelationSchemasBase,
  TraceDefinitionModifications,
} from './types'

// Types for debugging/monitoring events
export interface AddSpanToRecordingEvent<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  VariantsT extends string,
> {
  spanAndAnnotation: SpanAndAnnotation<RelationSchemasT>
  traceContext: DraftTraceContext<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  >
}

export interface DefinitionModifiedEvent<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  VariantsT extends string,
> {
  modifications: TraceDefinitionModifications<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  >
  traceContext: DraftTraceContext<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  >
}

export interface TraceStartEvent<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  VariantsT extends string,
> {
  traceContext: DraftTraceContext<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  >
}
export interface StateTransitionEvent<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  VariantsT extends string,
> {
  traceContext: DraftTraceContext<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  >
  stateTransition: OnEnterStatePayload<RelationSchemasT>
}
export interface RequiredSpanSeenEvent<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  VariantsT extends string,
> {
  traceContext: DraftTraceContext<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  >
  spanAndAnnotation: SpanAndAnnotation<RelationSchemasT>
  matcher: SpanMatcherFn<SelectedRelationNameT, RelationSchemasT, VariantsT>
}

export type AllPossibleTraceStartEvents<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
> = {
  [SelectedRelationNameT in keyof RelationSchemasT]: TraceStartEvent<
    SelectedRelationNameT,
    RelationSchemasT,
    string
  >
}[keyof RelationSchemasT]

export type AllPossibleStateTransitionEvents<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
> = {
  [SelectedRelationNameT in keyof RelationSchemasT]: StateTransitionEvent<
    SelectedRelationNameT,
    RelationSchemasT,
    string
  >
}[keyof RelationSchemasT]

export type AllPossibleRequiredSpanSeenEvents<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
> = {
  [SelectedRelationNameT in keyof RelationSchemasT]: RequiredSpanSeenEvent<
    SelectedRelationNameT,
    RelationSchemasT,
    string
  >
}[keyof RelationSchemasT]

export type AllPossibleAddSpanToRecordingEvents<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
> = {
  [SelectedRelationNameT in keyof RelationSchemasT]: AddSpanToRecordingEvent<
    SelectedRelationNameT,
    RelationSchemasT,
    string
  >
}[keyof RelationSchemasT]

export type AllPossibleDefinitionModifiedEvents<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
> = {
  [SelectedRelationNameT in keyof RelationSchemasT]: DefinitionModifiedEvent<
    SelectedRelationNameT,
    RelationSchemasT,
    string
  >
}[keyof RelationSchemasT]

export type DebugEventType =
  | 'trace-start'
  | 'state-transition'
  | 'required-span-seen'
  | 'add-span-to-recording'
  | 'definition-modified'
