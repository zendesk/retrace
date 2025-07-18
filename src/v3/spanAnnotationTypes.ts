/* eslint-disable @typescript-eslint/consistent-indexed-object-style */
import type { SpanMatch } from './matchSpan'
import type { Span, SpanUpdateFunction } from './spanTypes'
import type { TraceStates } from './Trace'
import type { RelationSchemasBase } from './types'

export interface SpanAnnotation {
  /**
   * The ID of the operation the event belongs to.
   */
  id: string
  /**
   * The occurrence of the span with the same name and type within the operation.
   * Usually 1 (first span)
   */
  occurrence: number
  /**
   * Offset from the start of the operation to the start of the event.
   * aka operationStartOffset or operationStartToEventStart
   */
  operationRelativeStartTime: number
  /**
   * Relative end time of the event within the operation.
   */
  operationRelativeEndTime: number
  /**
   * The state the event was recorded in.
   */
  recordedInState: TraceStates
  /**
   * If true, this is the first required span after having met all the required span criteria of the operation.
   * e.g. if the operation requires 3 spans, this will be true for that 3rd span.
   */
  markedRequirementsMet?: boolean
  /**
   * After all the required span criteria are met, and we completed debouncing.
   * If true, this is the last span of the operation (before page interactive capturing).
   * This span is used to calculate the duration of the entire trace.
   */
  markedComplete?: boolean
  /**
   * If true, this is the span was used to calculate the point at which the page became interactive.
   */
  markedPageInteractive?: boolean
  /**
   * Labels for the span based on label definitions from the Tracer. Empty if the span didn't match any of the label match definitions.
   */
  labels: string[]

  /**
   * If true, this span is a "ghost" span - it's only present because it is a parent of another span.
   * It is not part of the trace.
   */
  isGhost?: boolean
}

export interface SpanAnnotationRecord {
  [operationName: string]: SpanAnnotation
}

export interface SpanAndAnnotation<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
> {
  span: Span<RelationSchemasT>
  annotation: SpanAnnotation
}

export interface ProcessedSpan<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  SpanT extends Span<RelationSchemasT>,
> {
  readonly span: SpanT
  /**
   * Only present if the span was processed by at least one active trace.
   */
  readonly annotations: SpanAnnotationRecord | undefined
  /**
   * Resolves the parent span of the current span, based on the parent span matcher.
   * This will work even if the span wasn't processed by any active trace.
   */
  readonly resolveParent: (
    recursiveAncestors?: boolean,
  ) => Span<RelationSchemasT> | undefined
  /**
   * While not usually needed, you can use this function
   * to update some of the span's attributes AFTER it has been processed.
   * Note that this will only work if the trace is still in progress.
   * Object properties (such as attributes) are merged onto the original span,
   * so if you want to remove a property, set it to `undefined`.
   *
   * This will re-process the span, so if, for example,
   * your trace has a `requiredToEndSpan` matcher on an attribute
   * that wasn't present in the span when it was processed, and you update the span
   * to include that attribute, calling this function will trigger re-evaluation of the matchers.
   */
  readonly updateSpan: SpanUpdateFunction<RelationSchemasT, SpanT>
  /**
   * Finds an ancestor of the span that matches the given SpanMatch.
   * This will traverse the parent hierarchy of the span,
   * starting with the span itself and moving up through its parents,
   * resolving them if necessary.
   * If no matching ancestor is found, returns undefined.
   */
  readonly findAncestor: (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    spanMatch: SpanMatch<keyof RelationSchemasT, RelationSchemasT, any>,
  ) => Span<RelationSchemasT> | undefined
}
