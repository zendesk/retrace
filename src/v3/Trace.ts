/* eslint-disable @typescript-eslint/consistent-indexed-object-style */
/* eslint-disable max-classes-per-file */
import type { Observable } from 'rxjs'
import { Subject } from 'rxjs'
import {
  DEADLINE_BUFFER,
  DEFAULT_DEBOUNCE_DURATION,
  DEFAULT_INTERACTIVE_TIMEOUT_DURATION,
} from './constants'
import type {
  AddSpanToRecordingEvent,
  DefinitionModifiedEvent,
  RequiredSpanSeenEvent,
  StateTransitionEvent,
} from './debugTypes'
import { convertMatchersToFns } from './ensureMatcherFn'
import { ensureTimestamp } from './ensureTimestamp'
import {
  type CPUIdleLongTaskProcessor,
  createCPUIdleProcessor,
  isLongTask,
  type PerformanceEntryLike,
} from './firstCPUIdle'
import { getSpanKey } from './getSpanKey'
import {
  requiredSpanWithErrorStatus,
  type SpanMatcherFn,
  withAllConditions,
} from './matchSpan'
import { createTraceRecording } from './recordingComputeUtils'
import type {
  SpanAndAnnotation,
  SpanAnnotation,
  SpanAnnotationRecord,
} from './spanAnnotationTypes'
import type { ActiveTraceConfig, DraftTraceInput, Span } from './spanTypes'
import type { TraceRecording } from './traceRecordingTypes'
import type {
  CompleteTraceDefinition,
  DraftTraceContext,
  RelationSchemasBase,
  ReportErrorFn,
  TraceContext,
  TraceDefinitionModifications,
  TraceInterruptionReason,
  TraceInterruptionReasonForInvalidTraces,
  TraceModifications,
  TraceUtilities,
  TransitionDraftOptions,
} from './types'
import {
  INVALID_TRACE_INTERRUPTION_REASONS,
  TRACE_REPLACE_INTERRUPTION_REASONS,
} from './types'
import type {
  DistributiveOmit,
  MergedStateHandlerMethods,
  StateHandlerPayloads,
} from './typeUtils'
import { validateAndCoerceRelatedToAgainstSchema } from './validateRelatedTo'

const isInvalidTraceInterruptionReason = (
  reason: TraceInterruptionReason,
): reason is TraceInterruptionReasonForInvalidTraces =>
  (
    INVALID_TRACE_INTERRUPTION_REASONS as readonly TraceInterruptionReason[]
  ).includes(reason)

const INITIAL_STATE = 'draft'
type InitialTraceState = typeof INITIAL_STATE
export type NonTerminalTraceStates =
  | InitialTraceState
  | 'active'
  | 'debouncing'
  | 'waiting-for-interactive'
  | 'waiting-for-children'
export const TERMINAL_STATES = ['interrupted', 'complete'] as const
type TerminalTraceStates = (typeof TERMINAL_STATES)[number]
export type TraceStates = NonTerminalTraceStates | TerminalTraceStates

export const isTerminalState = (
  state: TraceStates,
): state is TerminalTraceStates =>
  (TERMINAL_STATES as readonly TraceStates[]).includes(state)

export const isEnteringTerminalState = <
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
>(
  onEnterState: OnEnterStatePayload<RelationSchemasT>,
): onEnterState is FinalTransition<RelationSchemasT> =>
  isTerminalState(onEnterState.transitionToState)

export const shouldPropagateChildInterruptToParent = (
  childTraceInterruptionReason: TraceInterruptionReason,
) =>
  !(
    TRACE_REPLACE_INTERRUPTION_REASONS as readonly TraceInterruptionReason[]
  ).includes(childTraceInterruptionReason)

interface OnEnterActive {
  transitionToState: 'active'
  transitionFromState: NonTerminalTraceStates
}

interface OnEnterInterrupted<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
> {
  transitionToState: 'interrupted'
  transitionFromState: NonTerminalTraceStates
  interruptionReason: TraceInterruptionReason
  lastRelevantSpanAndAnnotation: SpanAndAnnotation<RelationSchemasT> | undefined
}

interface OnEnterComplete<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
> {
  transitionToState: 'complete'
  transitionFromState: NonTerminalTraceStates
  interruptionReason?: TraceInterruptionReason
  cpuIdleSpanAndAnnotation: SpanAndAnnotation<RelationSchemasT> | undefined
  completeSpanAndAnnotation: SpanAndAnnotation<RelationSchemasT> | undefined
  lastRequiredSpanAndAnnotation: SpanAndAnnotation<RelationSchemasT> | undefined
  lastRelevantSpanAndAnnotation: SpanAndAnnotation<RelationSchemasT> | undefined
}

export type FinalTransition<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
> = OnEnterInterrupted<RelationSchemasT> | OnEnterComplete<RelationSchemasT>

interface OnEnterWaitingForInteractive {
  transitionToState: 'waiting-for-interactive'
  transitionFromState: NonTerminalTraceStates
}

interface OnEnterWaitingForChildren {
  transitionToState: 'waiting-for-children'
  transitionFromState: NonTerminalTraceStates
}

interface OnEnterDebouncing {
  transitionToState: 'debouncing'
  transitionFromState: NonTerminalTraceStates
}

export type OnEnterStatePayload<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
> =
  | OnEnterActive
  | OnEnterInterrupted<RelationSchemasT>
  | OnEnterComplete<RelationSchemasT>
  | OnEnterDebouncing
  | OnEnterWaitingForInteractive
  | OnEnterWaitingForChildren

export type Transition<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
> = DistributiveOmit<
  OnEnterStatePayload<RelationSchemasT>,
  'transitionFromState'
>

export type States<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  VariantsT extends string,
> = TraceStateMachine<
  SelectedRelationNameT,
  RelationSchemasT,
  VariantsT
>['states']

interface StateHandlersBase<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
> {
  [handler: string]: (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    payload: any,
  ) =>
    | void
    | undefined
    | (Transition<RelationSchemasT> & { transitionFromState?: never })
}

interface ChildEndEvent<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
> {
  childTrace: AllPossibleTraces<RelationSchemasT>
  terminalState: 'complete' | 'interrupted'
  interruptionReason?: TraceInterruptionReason
}

type StatesBase<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
> = Record<TraceStates, StateHandlersBase<RelationSchemasT>>

interface TraceStateMachineSideEffectHandlers<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
> {
  readonly addSpanToRecording: (
    spanAndAnnotation: SpanAndAnnotation<RelationSchemasT>,
  ) => void
  readonly onTerminalStateReached: (
    transition: FinalTransition<RelationSchemasT>,
  ) => void
}

type EntryType<RelationSchemasT extends RelationSchemasBase<RelationSchemasT>> =
  PerformanceEntryLike & {
    entry: SpanAndAnnotation<RelationSchemasT>
  }

interface StateMachineContext<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  VariantsT extends string,
> extends DraftTraceContext<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  > {
  sideEffectFns: TraceStateMachineSideEffectHandlers<RelationSchemasT>
  children: ReadonlySet<AllPossibleTraces<RelationSchemasT>>
  terminalStateChildren: ReadonlySet<AllPossibleTraces<RelationSchemasT>>
  eventSubjects: {
    'state-transition': Subject<
      StateTransitionEvent<SelectedRelationNameT, RelationSchemasT, VariantsT>
    >
    'required-span-seen': Subject<
      RequiredSpanSeenEvent<SelectedRelationNameT, RelationSchemasT, VariantsT>
    >
    'add-span-to-recording': Subject<
      AddSpanToRecordingEvent<
        SelectedRelationNameT,
        RelationSchemasT,
        VariantsT
      >
    >
    'definition-modified': Subject<
      DefinitionModifiedEvent<
        SelectedRelationNameT,
        RelationSchemasT,
        VariantsT
      >
    >
  }
}

type DeadlineType = 'global' | 'debounce' | 'interactive' | 'next-quiet-window'

export class TraceStateMachine<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  const VariantsT extends string,
> {
  constructor(
    context: StateMachineContext<
      SelectedRelationNameT,
      RelationSchemasT,
      VariantsT
    >,
  ) {
    this.#context = context
    this.emit('onEnterState', undefined)
  }

  readonly successfullyMatchedRequiredSpanMatchers = new Set<
    SpanMatcherFn<SelectedRelationNameT, RelationSchemasT, VariantsT>
  >()

  readonly #context: StateMachineContext<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  >
  get sideEffectFns() {
    return this.#context.sideEffectFns
  }
  currentState: TraceStates = INITIAL_STATE
  /** the span that ended at the furthest point in time */
  lastRelevant: SpanAndAnnotation<RelationSchemasT> | undefined
  lastRequiredSpan: SpanAndAnnotation<RelationSchemasT> | undefined
  /** it is set once the LRS value is established */
  completeSpan: SpanAndAnnotation<RelationSchemasT> | undefined
  cpuIdleLongTaskProcessor:
    | CPUIdleLongTaskProcessor<EntryType<RelationSchemasT>>
    | undefined
  #lastLongTaskEndTime: number | undefined
  #debounceDeadline: number = Number.POSITIVE_INFINITY
  #interactiveDeadline: number = Number.POSITIVE_INFINITY
  #timeoutDeadline: number = Number.POSITIVE_INFINITY

  nextDeadlineRef: ReturnType<typeof setTimeout> | undefined

  setDeadline(
    deadlineType: Exclude<DeadlineType, 'global'>,
    deadlineEpoch: number,
  ) {
    if (deadlineType === 'debounce') {
      this.#debounceDeadline = deadlineEpoch
    } else if (deadlineType === 'interactive') {
      this.#interactiveDeadline = deadlineEpoch
    }

    // which type of deadline is the closest and what kind is it?
    const closestDeadline =
      deadlineEpoch > this.#timeoutDeadline
        ? 'global'
        : deadlineType === 'next-quiet-window' &&
          deadlineEpoch > this.#interactiveDeadline
        ? 'interactive'
        : deadlineType

    const rightNowEpoch = Date.now()
    const timeToDeadlinePlusBuffer =
      deadlineEpoch - rightNowEpoch + DEADLINE_BUFFER

    if (this.nextDeadlineRef) {
      clearTimeout(this.nextDeadlineRef)
    }

    this.nextDeadlineRef = setTimeout(() => {
      this.emit('onDeadline', closestDeadline)
    }, Math.max(timeToDeadlinePlusBuffer, 0))
  }

  setGlobalDeadline(deadline: number) {
    this.#timeoutDeadline = deadline

    const rightNowEpoch = Date.now()
    const timeToDeadlinePlusBuffer = deadline - rightNowEpoch + DEADLINE_BUFFER

    if (!this.nextDeadlineRef) {
      // this should never happen
      this.nextDeadlineRef = setTimeout(() => {
        this.emit('onDeadline', 'global')
      }, Math.max(timeToDeadlinePlusBuffer, 0))
    }
  }

  clearDeadline() {
    if (this.nextDeadlineRef) {
      clearTimeout(this.nextDeadlineRef)
      this.nextDeadlineRef = undefined
    }
  }

  /**
   * while debouncing, we need to buffer any spans that come in so they can be re-processed
   * once we transition to the 'waiting-for-interactive' state
   * otherwise we might miss out on spans that are relevant to calculating the interactive
   *
   * if we have long tasks before FMP, we want to use them as a potential grouping post FMP.
   */
  debouncingSpanBuffer: SpanAndAnnotation<RelationSchemasT>[] = []
  #draftBuffer: SpanAndAnnotation<RelationSchemasT>[] = []

  // eslint-disable-next-line consistent-return
  #processDraftBuffer(): Transition<RelationSchemasT> | void {
    // process items in the buffer (stick the relatedTo in the entries) (if its empty, well we can skip this!)
    let span: SpanAndAnnotation<RelationSchemasT> | undefined
    // eslint-disable-next-line no-cond-assign
    while ((span = this.#draftBuffer.shift())) {
      const transition = this.emit('onProcessSpan', span)
      if (transition) return transition
    }
  }

  readonly states = {
    draft: {
      onEnterState: () => {
        this.setGlobalDeadline(
          this.#context.input.startTime.epoch +
            this.#context.definition.variants[this.#context.input.variant]!
              .timeout,
        )
      },

      onMakeActive: () => ({
        transitionToState: 'active',
      }),

      onProcessSpan: (
        spanAndAnnotation: SpanAndAnnotation<RelationSchemasT>,
      ) => {
        const spanEndTimeEpoch =
          spanAndAnnotation.span.startTime.epoch +
          spanAndAnnotation.span.duration

        if (
          isLongTask(spanAndAnnotation.span.performanceEntry) &&
          spanEndTimeEpoch > (this.#lastLongTaskEndTime ?? 0)
        ) {
          this.#lastLongTaskEndTime = spanEndTimeEpoch
        }

        if (spanEndTimeEpoch > this.#timeoutDeadline) {
          // we consider this interrupted, because of the clamping of the total duration of the operation
          // as potential other events could have happened and prolonged the operation
          // we can be a little picky, because we expect to record many operations
          // it's best to compare like-to-like
          return {
            transitionToState: 'interrupted',
            interruptionReason: 'timeout',
            lastRelevantSpanAndAnnotation: undefined,
          }
        }

        // add into span buffer
        this.#draftBuffer.push(spanAndAnnotation)

        // if the entry matches any of the interruptOnSpans criteria,
        // transition to interrupted state with the correct interruptionReason
        if (this.#context.definition.interruptOnSpans) {
          for (const doesSpanMatch of this.#context.definition
            .interruptOnSpans) {
            if (doesSpanMatch(spanAndAnnotation, this.#context)) {
              return {
                transitionToState: 'interrupted',
                interruptionReason: doesSpanMatch.requiredSpan
                  ? 'matched-on-required-span-with-error'
                  : 'matched-on-interrupt',
                lastRelevantSpanAndAnnotation: undefined,
              }
            }
          }
        }

        return undefined
      },

      onInterrupt: (reason: TraceInterruptionReason) => ({
        transitionToState: 'interrupted',
        interruptionReason: reason,
        lastRelevantSpanAndAnnotation: undefined,
      }),

      onDeadline: (deadlineType: DeadlineType) => {
        if (deadlineType === 'global') {
          return {
            transitionToState: 'interrupted',
            interruptionReason: 'timeout',
            lastRelevantSpanAndAnnotation: undefined,
          }
        }
        // other cases should never happen
        return undefined
      },

      onChildEnd: (event: ChildEndEvent<RelationSchemasT>) => {
        // Check if child was interrupted and handle accordingly
        if (event.terminalState === 'interrupted' && event.interruptionReason) {
          if (
            !shouldPropagateChildInterruptToParent(event.interruptionReason)
          ) {
            // no transition - ignore child interruption
            return undefined
          }

          // Interrupt parent based on child interruption
          const parentInterruptionReason =
            event.interruptionReason === 'timeout'
              ? 'child-timeout'
              : 'child-interrupted'

          return {
            transitionToState: 'interrupted',
            interruptionReason: parentInterruptionReason,
            lastRelevantSpanAndAnnotation: undefined,
          }
        }

        return undefined
      },
    },

    active: {
      onEnterState: (_transition: OnEnterActive) => {
        const nextTransition = this.#processDraftBuffer()
        if (nextTransition) return nextTransition

        return undefined
      },

      onProcessSpan: (
        spanAndAnnotation: SpanAndAnnotation<RelationSchemasT>,
      ) => {
        const spanEndTimeEpoch =
          spanAndAnnotation.span.startTime.epoch +
          spanAndAnnotation.span.duration

        if (
          isLongTask(spanAndAnnotation.span.performanceEntry) &&
          spanEndTimeEpoch > (this.#lastLongTaskEndTime ?? 0)
        ) {
          this.#lastLongTaskEndTime = spanEndTimeEpoch
        }

        if (spanEndTimeEpoch > this.#timeoutDeadline) {
          // we consider this interrupted, because of the clamping of the total duration of the operation
          // as potential other events could have happened and prolonged the operation
          // we can be a little picky, because we expect to record many operations
          // it's best to compare like-to-like
          return {
            transitionToState: 'interrupted',
            interruptionReason: 'timeout',
            lastRelevantSpanAndAnnotation: this.lastRelevant,
          }
        }

        // does span satisfy any of the "interruptOnSpans" definitions
        if (this.#context.definition.interruptOnSpans) {
          for (const doesSpanMatch of this.#context.definition
            .interruptOnSpans) {
            if (doesSpanMatch(spanAndAnnotation, this.#context)) {
              // still record the span that interrupted the trace
              this.sideEffectFns.addSpanToRecording(spanAndAnnotation)
              return {
                transitionToState: 'interrupted',
                interruptionReason: doesSpanMatch.requiredSpan
                  ? 'matched-on-required-span-with-error'
                  : 'matched-on-interrupt',
                lastRelevantSpanAndAnnotation: this.lastRelevant,
              }
            }
          }
        }

        for (const doesSpanMatch of this.#context.definition.requiredSpans) {
          if (this.successfullyMatchedRequiredSpanMatchers.has(doesSpanMatch)) {
            // we previously successfully matched using this matcher
            // eslint-disable-next-line no-continue
            continue
          }

          if (doesSpanMatch(spanAndAnnotation, this.#context)) {
            // now that we've seen it, we add it to the list
            this.successfullyMatchedRequiredSpanMatchers.add(doesSpanMatch)

            // Emit required span seen event for debugging
            this.#context.eventSubjects['required-span-seen'].next({
              traceContext: this.#context,
              spanAndAnnotation,
              matcher: doesSpanMatch,
            })

            // Sometimes spans are processed out of order, we update the lastRelevant if this span ends later
            if (
              !this.lastRelevant ||
              spanAndAnnotation.annotation.operationRelativeEndTime >
                (this.lastRelevant?.annotation.operationRelativeEndTime ?? 0)
            ) {
              this.lastRelevant = spanAndAnnotation
            }
          }
        }

        this.sideEffectFns.addSpanToRecording(spanAndAnnotation)

        if (
          this.successfullyMatchedRequiredSpanMatchers.size ===
          this.#context.definition.requiredSpans.length
        ) {
          return { transitionToState: 'debouncing' }
        }
        return undefined
      },

      onInterrupt: (reason: TraceInterruptionReason) => ({
        transitionToState: 'interrupted',
        interruptionReason: reason,
        lastRelevantSpanAndAnnotation: this.lastRelevant,
      }),

      onDeadline: (deadlineType: DeadlineType) => {
        if (deadlineType === 'global') {
          return {
            transitionToState: 'interrupted',
            interruptionReason: 'timeout',
            lastRelevantSpanAndAnnotation: this.lastRelevant,
          }
        }
        // other cases should never happen
        return undefined
      },

      onChildEnd: (event: ChildEndEvent<RelationSchemasT>) => {
        // Check if child was interrupted and handle accordingly
        if (event.terminalState === 'interrupted' && event.interruptionReason) {
          if (
            !shouldPropagateChildInterruptToParent(event.interruptionReason)
          ) {
            // no transition - ignore child interruption
            return undefined
          }

          // Interrupt parent based on child interruption
          const parentInterruptionReason =
            event.interruptionReason === 'timeout'
              ? 'child-timeout'
              : 'child-interrupted'

          return {
            transitionToState: 'interrupted',
            interruptionReason: parentInterruptionReason,
            lastRelevantSpanAndAnnotation: this.lastRelevant,
          }
        }

        return undefined
      },
    },

    // we enter the debouncing state once all requiredSpans entries have been seen
    // it is necessary due to the nature of React rendering,
    // as even once we reach the visually complete state of a component,
    // the component might continue to re-render
    // and change the final visual output of the component
    // we want to ensure the end of the operation captures
    // the final, settled state of the component
    debouncing: {
      onEnterState: (_payload: OnEnterDebouncing) => {
        if (!this.lastRelevant) {
          // this should never happen
          return {
            transitionToState: 'interrupted',
            interruptionReason: 'invalid-state-transition',

            lastRelevantSpanAndAnnotation: this.lastRelevant,
          }
        }

        this.lastRequiredSpan = this.lastRelevant
        this.lastRequiredSpan.annotation.markedRequirementsMet = true

        if (!this.#context.definition.debounceOnSpans) {
          return { transitionToState: 'waiting-for-interactive' }
        }
        // set the first debounce deadline
        this.setDeadline(
          'debounce',
          this.lastRelevant.span.startTime.epoch +
            this.lastRelevant.span.duration +
            (this.#context.definition.debounceWindow ??
              DEFAULT_DEBOUNCE_DURATION),
        )

        return undefined
      },

      onDeadline: (deadlineType: DeadlineType) => {
        if (deadlineType === 'global') {
          return {
            transitionToState: 'interrupted',
            interruptionReason: 'timeout',
            lastRelevantSpanAndAnnotation: this.lastRelevant,
          }
        }
        if (deadlineType === 'debounce') {
          // Check if we have children before transitioning to complete
          if (this.#context.children.size > 0) {
            return {
              transitionToState: 'waiting-for-children',
            }
          }
          return {
            transitionToState: 'waiting-for-interactive',
          }
        }
        // other cases should never happen
        return undefined
      },

      onProcessSpan: (
        spanAndAnnotation: SpanAndAnnotation<RelationSchemasT>,
      ) => {
        const spanEndTimeEpoch =
          spanAndAnnotation.span.startTime.epoch +
          spanAndAnnotation.span.duration

        if (
          isLongTask(spanAndAnnotation.span.performanceEntry) &&
          spanEndTimeEpoch > (this.#lastLongTaskEndTime ?? 0)
        ) {
          this.#lastLongTaskEndTime = spanEndTimeEpoch
        }

        if (spanEndTimeEpoch > this.#timeoutDeadline) {
          // we consider this interrupted, because of the clamping of the total duration of the operation
          // as potential other events could have happened and prolonged the operation
          // we can be a little picky, because we expect to record many operations
          // it's best to compare like-to-like
          return {
            transitionToState: 'interrupted',
            interruptionReason: 'timeout',
            lastRelevantSpanAndAnnotation: this.lastRelevant,
          }
        }

        // The debouncing buffer will be used to correctly group the spans into clusters when calculating the cpu idle in the waiting-for-interactive state
        // We record the spans here as well, so that they are included even if we never make it out of the debouncing state
        this.debouncingSpanBuffer.push(spanAndAnnotation)
        this.sideEffectFns.addSpanToRecording(spanAndAnnotation)

        if (spanEndTimeEpoch > this.#debounceDeadline) {
          // done debouncing
          return { transitionToState: 'waiting-for-interactive' }
        }

        const { span } = spanAndAnnotation

        // even though we satisfied all the requiredSpans conditions in the recording state,
        // if we see a previously required render span that was requested to be idle, but is no longer idle,
        // our trace is deemed invalid and should be interrupted
        const isSpanNonIdleRender = 'isIdle' in span && !span.isIdle
        // we want to match on all the conditions except for the "isIdle: true"
        // for this reason we have to pretend to the matcher about "isIdle" or else our matcher condition would never evaluate to true
        const idleRegressionCheckSpan = isSpanNonIdleRender && {
          ...spanAndAnnotation,
          span: { ...span, isIdle: true },
        }
        if (idleRegressionCheckSpan) {
          for (const doesSpanMatch of this.#context.definition.requiredSpans) {
            if (
              doesSpanMatch(idleRegressionCheckSpan, this.#context) &&
              doesSpanMatch.idleCheck
            ) {
              // Sometimes spans are processed out of order, we update the lastRelevant if this span ends later
              if (
                spanAndAnnotation.annotation.operationRelativeEndTime >
                (this.lastRelevant?.annotation.operationRelativeEndTime ?? 0)
              ) {
                this.lastRelevant = spanAndAnnotation
              }
              // check if we regressed on "isIdle", and if so, transition to interrupted with reason
              return {
                transitionToState: 'interrupted',
                interruptionReason: 'idle-component-no-longer-idle',
                lastRelevantSpanAndAnnotation: this.lastRelevant,
              }
            }
          }
        }

        // does span satisfy any of the "debouncedOn" and if so, restart our debounce timer
        if (this.#context.definition.debounceOnSpans) {
          for (const doesSpanMatch of this.#context.definition
            .debounceOnSpans) {
            if (doesSpanMatch(spanAndAnnotation, this.#context)) {
              // Sometimes spans are processed out of order, we update the lastRelevant if this span ends later
              if (
                spanAndAnnotation.annotation.operationRelativeEndTime >
                (this.lastRelevant?.annotation.operationRelativeEndTime ?? 0)
              ) {
                this.lastRelevant = spanAndAnnotation

                // update the debounce timer relative from the time of the span end
                // (not from the time of processing of the event, because it may be asynchronous)
                this.setDeadline(
                  'debounce',
                  this.lastRelevant.span.startTime.epoch +
                    this.lastRelevant.span.duration +
                    (this.#context.definition.debounceWindow ??
                      DEFAULT_DEBOUNCE_DURATION),
                )
              }

              return undefined
            }
          }
        }
        return undefined
      },

      onInterrupt: (reason: TraceInterruptionReason) => ({
        transitionToState: 'interrupted',
        interruptionReason: reason,
        lastRelevantSpanAndAnnotation: this.lastRelevant,
      }),

      onChildEnd: (event: ChildEndEvent<RelationSchemasT>) => {
        // Check if child was interrupted and handle accordingly
        if (event.terminalState === 'interrupted' && event.interruptionReason) {
          if (
            !shouldPropagateChildInterruptToParent(event.interruptionReason)
          ) {
            // no transition - ignore child interruption
            return undefined
          }

          // Interrupt parent based on child interruption
          const parentInterruptionReason =
            event.interruptionReason === 'timeout'
              ? 'child-timeout'
              : 'child-interrupted'

          return {
            transitionToState: 'interrupted',
            interruptionReason: parentInterruptionReason,
            lastRelevantSpanAndAnnotation: this.lastRelevant,
          }
        }

        return undefined
      },
    },

    'waiting-for-interactive': {
      onEnterState: (_payload: OnEnterWaitingForInteractive) => {
        if (!this.lastRelevant) {
          // this should never happen
          return {
            transitionToState: 'interrupted',
            interruptionReason: 'invalid-state-transition',
            lastRelevantSpanAndAnnotation: this.lastRelevant,
          }
        }

        this.completeSpan = this.lastRelevant
        const interactiveConfig = this.#context.definition.captureInteractive
        if (!interactiveConfig) {
          // nothing to do in this state, check if we have children
          if (this.#context.children.size > 0) {
            return {
              transitionToState: 'waiting-for-children',
            }
          }
          return {
            transitionToState: 'complete',
            completeSpanAndAnnotation: this.completeSpan,
            cpuIdleSpanAndAnnotation: undefined,
            lastRequiredSpanAndAnnotation: this.lastRequiredSpan,
            lastRelevantSpanAndAnnotation: this.lastRelevant,
          }
        }

        const interruptMillisecondsAfterLastRequiredSpan =
          (typeof interactiveConfig === 'object' &&
            interactiveConfig.timeout) ||
          DEFAULT_INTERACTIVE_TIMEOUT_DURATION

        const lastRequiredSpanEndTimeEpoch =
          this.completeSpan.span.startTime.epoch +
          this.completeSpan.span.duration

        this.setDeadline(
          'interactive',
          lastRequiredSpanEndTimeEpoch +
            interruptMillisecondsAfterLastRequiredSpan,
        )

        this.cpuIdleLongTaskProcessor = createCPUIdleProcessor<
          EntryType<RelationSchemasT>
        >(
          {
            entryType: this.completeSpan.span.type,
            startTime: this.completeSpan.span.startTime.now,
            duration: this.completeSpan.span.duration,
            entry: this.completeSpan,
          },
          typeof interactiveConfig === 'object' ? interactiveConfig : {},
          { lastLongTaskEndTime: this.#lastLongTaskEndTime },
        )

        // DECISION: sort the buffer before processing. sorted by end time (spans that end first should be processed first)
        this.debouncingSpanBuffer.sort(
          (a, b) =>
            a.span.startTime.now +
            a.span.duration -
            (b.span.startTime.now + b.span.duration),
        )

        // process any spans that were buffered during the debouncing phase
        while (this.debouncingSpanBuffer.length > 0) {
          const span = this.debouncingSpanBuffer.shift()!
          const transition = this.emit(
            'onProcessSpan',
            span,
            // below cast is necessary due to circular type reference
          ) as Transition<RelationSchemasT> | undefined
          if (transition) {
            return transition
          }
        }

        return undefined
      },

      onDeadline: (deadlineType: DeadlineType) => {
        if (deadlineType === 'global') {
          // a global timeout will interrupt any children traces
          return {
            transitionToState: 'complete',
            interruptionReason: 'timeout',
            completeSpanAndAnnotation: this.completeSpan,
            lastRequiredSpanAndAnnotation: this.lastRequiredSpan,
            lastRelevantSpanAndAnnotation: this.lastRelevant,
            cpuIdleSpanAndAnnotation: undefined,
          }
        }
        if (
          deadlineType === 'interactive' ||
          deadlineType === 'next-quiet-window'
        ) {
          const quietWindowCheck =
            this.cpuIdleLongTaskProcessor!.checkIfQuietWindowPassed(
              performance.now(),
            )

          const cpuIdleMatch =
            'firstCpuIdle' in quietWindowCheck && quietWindowCheck.firstCpuIdle

          const cpuIdleTimestamp =
            cpuIdleMatch &&
            cpuIdleMatch.entry.span.startTime.epoch +
              cpuIdleMatch.entry.span.duration

          if (cpuIdleTimestamp && cpuIdleTimestamp <= this.#timeoutDeadline) {
            // if we match the interactive criteria, transition to complete
            // reference https://docs.google.com/document/d/1GGiI9-7KeY3TPqS3YT271upUVimo-XiL5mwWorDUD4c/edit
            return {
              transitionToState: 'complete',
              lastRequiredSpanAndAnnotation: this.lastRequiredSpan,
              completeSpanAndAnnotation: this.completeSpan,
              cpuIdleSpanAndAnnotation: cpuIdleMatch.entry,
              lastRelevantSpanAndAnnotation: this.lastRelevant,
            }
          }
          if (deadlineType === 'interactive') {
            // we consider this complete, because we have a complete trace
            // it's just missing the bonus data from when the browser became "interactive"
            return {
              interruptionReason: 'timeout',
              transitionToState: 'complete',
              lastRequiredSpanAndAnnotation: this.lastRequiredSpan,
              completeSpanAndAnnotation: this.completeSpan,
              lastRelevantSpanAndAnnotation: this.lastRelevant,
              cpuIdleSpanAndAnnotation: undefined,
            }
          }

          if ('nextCheck' in quietWindowCheck) {
            // check in the next quiet window
            const nextCheckIn = quietWindowCheck.nextCheck - performance.now()
            this.setDeadline('next-quiet-window', Date.now() + nextCheckIn)
          }
        }
        // other cases should never happen
        return undefined
      },

      onProcessSpan: (
        spanAndAnnotation: SpanAndAnnotation<RelationSchemasT>,
      ) => {
        this.sideEffectFns.addSpanToRecording(spanAndAnnotation)

        const quietWindowCheck =
          this.cpuIdleLongTaskProcessor!.processPerformanceEntry({
            entryType: spanAndAnnotation.span.type,
            startTime: spanAndAnnotation.span.startTime.now,
            duration: spanAndAnnotation.span.duration,
            entry: spanAndAnnotation,
          })

        const cpuIdleMatch =
          'firstCpuIdle' in quietWindowCheck && quietWindowCheck.firstCpuIdle

        const cpuIdleTimestamp =
          cpuIdleMatch &&
          cpuIdleMatch.entry.span.startTime.epoch +
            cpuIdleMatch.entry.span.duration

        if (cpuIdleTimestamp && cpuIdleTimestamp <= this.#timeoutDeadline) {
          // check if we have children
          if (this.#context.children.size > 0) {
            return {
              transitionToState: 'waiting-for-children',
            }
          }
          // if we match the interactive criteria, transition to complete
          // reference https://docs.google.com/document/d/1GGiI9-7KeY3TPqS3YT271upUVimo-XiL5mwWorDUD4c/edit
          return {
            transitionToState: 'complete',
            lastRequiredSpanAndAnnotation: this.lastRequiredSpan,
            completeSpanAndAnnotation: this.completeSpan,
            cpuIdleSpanAndAnnotation: cpuIdleMatch.entry,
            lastRelevantSpanAndAnnotation: this.lastRelevant,
          }
        }

        const spanEndTimeEpoch =
          spanAndAnnotation.span.startTime.epoch +
          spanAndAnnotation.span.duration
        if (spanEndTimeEpoch > this.#timeoutDeadline) {
          // we consider this complete, but check if we have children
          if (this.#context.children.size > 0) {
            return {
              transitionToState: 'waiting-for-children',
              interruptionReason: 'timeout',
            }
          }
          // we consider this complete, because we have a complete trace
          // it's just missing the bonus data from when the browser became "interactive"
          return {
            transitionToState: 'complete',
            interruptionReason: 'timeout',
            lastRequiredSpanAndAnnotation: this.lastRequiredSpan,
            completeSpanAndAnnotation: this.completeSpan,
            lastRelevantSpanAndAnnotation: this.lastRelevant,
            cpuIdleSpanAndAnnotation: undefined,
          }
        }

        if (spanEndTimeEpoch > this.#interactiveDeadline) {
          // check if we have children
          if (this.#context.children.size > 0) {
            return {
              transitionToState: 'waiting-for-children',
              interruptionReason: 'waiting-for-interactive-timeout',
            }
          }
          // we consider this complete, because we have a complete trace
          // it's just missing the bonus data from when the browser became "interactive"
          return {
            transitionToState: 'complete',
            interruptionReason: 'waiting-for-interactive-timeout',
            lastRequiredSpanAndAnnotation: this.lastRequiredSpan,
            completeSpanAndAnnotation: this.completeSpan,
            lastRelevantSpanAndAnnotation: this.lastRelevant,
            cpuIdleSpanAndAnnotation: undefined,
          }
        }

        // if the entry matches any of the interruptOnSpans criteria,
        // transition to complete state with the 'matched-on-interrupt' interruptionReason
        if (this.#context.definition.interruptOnSpans) {
          for (const doesSpanMatch of this.#context.definition
            .interruptOnSpans) {
            if (doesSpanMatch(spanAndAnnotation, this.#context)) {
              // Check if we have children before transitioning to complete
              if (this.#context.children.size > 0) {
                return {
                  transitionToState: 'waiting-for-children',
                  interruptionReason: doesSpanMatch.requiredSpan
                    ? 'matched-on-required-span-with-error'
                    : 'matched-on-interrupt',
                }
              }
              return {
                transitionToState: 'complete',
                interruptionReason: doesSpanMatch.requiredSpan
                  ? 'matched-on-required-span-with-error'
                  : 'matched-on-interrupt',
                lastRequiredSpanAndAnnotation: this.lastRequiredSpan,
                completeSpanAndAnnotation: this.completeSpan,
                lastRelevantSpanAndAnnotation: this.lastRelevant,
                cpuIdleSpanAndAnnotation: undefined,
              }
            }
          }
        }

        if ('nextCheck' in quietWindowCheck) {
          // check in the next quiet window
          const nextCheckIn = quietWindowCheck.nextCheck - performance.now()
          this.setDeadline('next-quiet-window', Date.now() + nextCheckIn)
        }

        return undefined
      },

      onInterrupt: (reason: TraceInterruptionReason) =>
        // we captured a complete trace, however the interactive data is missing
        ({
          transitionToState: 'complete',
          interruptionReason: reason,
          lastRequiredSpanAndAnnotation: this.lastRequiredSpan,
          completeSpanAndAnnotation: this.completeSpan,
          lastRelevantSpanAndAnnotation: this.lastRelevant,
          cpuIdleSpanAndAnnotation: undefined,
        }),
      onChildEnd: (event: ChildEndEvent<RelationSchemasT>) => {
        // Check if child was interrupted and handle accordingly
        if (event.terminalState === 'interrupted' && event.interruptionReason) {
          if (
            !shouldPropagateChildInterruptToParent(event.interruptionReason)
          ) {
            // no transition - ignore child interruption
            return undefined
          }

          // Interrupt parent based on child interruption
          const parentInterruptionReason =
            event.interruptionReason === 'timeout'
              ? 'child-timeout'
              : 'child-interrupted'

          return {
            transitionToState: 'interrupted',
            interruptionReason: parentInterruptionReason,
            lastRelevantSpanAndAnnotation: this.lastRelevant,
          }
        }

        return undefined
      },
    },

    'waiting-for-children': {
      onEnterState: (_payload: OnEnterWaitingForChildren) => {
        // If we have no children, transition to complete immediately
        if (this.#context.children.size === 0) {
          return {
            transitionToState: 'complete',
            completeSpanAndAnnotation: this.completeSpan,
            cpuIdleSpanAndAnnotation: undefined,
            lastRequiredSpanAndAnnotation: this.lastRequiredSpan,
            lastRelevantSpanAndAnnotation: this.lastRelevant,
          }
        }
        // Otherwise, wait for children to complete
        return undefined
      },

      onChildEnd: (event: ChildEndEvent<RelationSchemasT>) => {
        // Check if child was interrupted and handle accordingly
        if (event.terminalState === 'interrupted' && event.interruptionReason) {
          if (
            !shouldPropagateChildInterruptToParent(event.interruptionReason)
          ) {
            // no transition - ignore child interruption
            return undefined
          }

          // Interrupt parent based on child interruption
          const parentInterruptionReason =
            event.interruptionReason === 'timeout'
              ? 'child-timeout'
              : 'child-interrupted'

          return {
            transitionToState: 'interrupted',
            interruptionReason: parentInterruptionReason,
            lastRelevantSpanAndAnnotation: this.lastRelevant,
          }
        }

        // If all children are done, transition to complete
        if (this.#context.children.size === 0) {
          return {
            transitionToState: 'complete',
            completeSpanAndAnnotation: this.completeSpan,
            cpuIdleSpanAndAnnotation: undefined,
            lastRequiredSpanAndAnnotation: this.lastRequiredSpan,
            lastRelevantSpanAndAnnotation: this.lastRelevant,
          }
        }

        return undefined
      },

      onProcessSpan: (
        spanAndAnnotation: SpanAndAnnotation<RelationSchemasT>,
      ) => {
        this.sideEffectFns.addSpanToRecording(spanAndAnnotation)

        return undefined
      },

      onInterrupt: (reason: TraceInterruptionReason) => ({
        transitionToState: 'interrupted',
        interruptionReason: reason,
        lastRelevantSpanAndAnnotation: this.lastRelevant,
      }),

      onDeadline: (deadlineType: DeadlineType) => {
        if (deadlineType === 'global') {
          return {
            transitionToState: 'interrupted',
            interruptionReason: 'timeout',
            lastRelevantSpanAndAnnotation: this.lastRelevant,
          }
        }
        return undefined
      },
    },

    // terminal states:
    interrupted: {
      onEnterState: (transition: OnEnterInterrupted<RelationSchemasT>) => {
        // depending on the reason, if we're coming from draft, we want to flush the buffer:
        if (
          transition.transitionFromState === 'draft' &&
          !isInvalidTraceInterruptionReason(transition.interruptionReason)
        ) {
          let span: SpanAndAnnotation<RelationSchemasT> | undefined
          // eslint-disable-next-line no-cond-assign
          while ((span = this.#draftBuffer.shift())) {
            this.sideEffectFns.addSpanToRecording(span)
          }
        }

        // terminal state
        this.clearDeadline()
      },
    },

    complete: {
      onEnterState: (transition: OnEnterComplete<RelationSchemasT>) => {
        // terminal state

        this.clearDeadline()

        const { completeSpanAndAnnotation, cpuIdleSpanAndAnnotation } =
          transition

        // Tag the span annotations:
        if (completeSpanAndAnnotation) {
          // mutate the annotation to mark the span as complete
          completeSpanAndAnnotation.annotation.markedComplete = true
        }
        if (cpuIdleSpanAndAnnotation) {
          // mutate the annotation to mark the span as interactive
          cpuIdleSpanAndAnnotation.annotation.markedPageInteractive = true
        }
      },
    },
  } satisfies StatesBase<RelationSchemasT>

  /**
   * @returns the last OnEnterState event if a transition was made
   */
  emit<
    EventName extends keyof StateHandlerPayloads<
      SelectedRelationNameT,
      RelationSchemasT,
      VariantsT
    >,
  >(
    event: EventName,
    payload: StateHandlerPayloads<
      SelectedRelationNameT,
      RelationSchemasT,
      VariantsT
    >[EventName],
  ): OnEnterStatePayload<RelationSchemasT> | undefined {
    const currentStateHandlers = this.states[this.currentState] as Partial<
      MergedStateHandlerMethods<
        SelectedRelationNameT,
        RelationSchemasT,
        VariantsT
      >
    >
    const transitionPayload = currentStateHandlers[event]?.(payload)
    if (transitionPayload) {
      const transitionFromState = this.currentState as NonTerminalTraceStates
      this.currentState = transitionPayload.transitionToState
      const onEnterStateEvent: OnEnterStatePayload<RelationSchemasT> = {
        ...transitionPayload,
        transitionFromState,
      }

      // Emit state transition event
      this.#context.eventSubjects['state-transition'].next({
        traceContext: this.#context,
        stateTransition: onEnterStateEvent,
      })

      const settledTransition =
        this.emit('onEnterState', onEnterStateEvent) ?? onEnterStateEvent

      // Complete all event observables when reaching a terminal state
      if (isEnteringTerminalState(onEnterStateEvent)) {
        this.#context.sideEffectFns.onTerminalStateReached(onEnterStateEvent)
      }

      return settledTransition
    }
    return undefined
  }
}

export class Trace<
  const SelectedRelationNameT extends keyof RelationSchemasT,
  const RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  const VariantsT extends string,
> implements TraceContext<SelectedRelationNameT, RelationSchemasT, VariantsT>
{
  readonly sourceDefinition: CompleteTraceDefinition<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  >
  /** the source-of-truth - local copy of a final, mutable definition of this specific trace */
  definition: CompleteTraceDefinition<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  >
  wasActivated = false
  get activeInput(): ActiveTraceConfig<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  > {
    if (!this.input.relatedTo) {
      this.traceUtilities.reportErrorFn(
        new Error(
          "Tried to access trace's activeInput, but the trace was never provided a 'relatedTo' input value",
        ),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this as Trace<any, RelationSchemasT, any>,
      )
    }
    return this.input as ActiveTraceConfig<
      SelectedRelationNameT,
      RelationSchemasT,
      VariantsT
    >
  }
  set activeInput(
    value: ActiveTraceConfig<
      SelectedRelationNameT,
      RelationSchemasT,
      VariantsT
    >,
  ) {
    this.input = value
  }

  input: DraftTraceInput<RelationSchemasT[SelectedRelationNameT], VariantsT>
  readonly traceUtilities: TraceUtilities<RelationSchemasT>

  get isDraft() {
    return this.stateMachine.currentState === INITIAL_STATE
  }

  recordedItems: Map<string, SpanAndAnnotation<RelationSchemasT>> = new Map()
  occurrenceCounters = new Map<string, number>()
  processedPerformanceEntries: WeakMap<
    PerformanceEntry,
    SpanAndAnnotation<RelationSchemasT>
  > = new WeakMap()
  persistedDefinitionModifications: Set<
    TraceDefinitionModifications<
      SelectedRelationNameT,
      RelationSchemasT,
      VariantsT
    >
  > = new Set()
  readonly recordedItemsByLabel: {
    [label: string]: SpanAndAnnotation<RelationSchemasT>[]
  }

  stateMachine: TraceStateMachine<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  >

  // Child trace management
  children: Set<AllPossibleTraces<RelationSchemasT>> = new Set()
  terminalStateChildren: Set<AllPossibleTraces<RelationSchemasT>> = new Set()

  // Child trace management methods
  adoptChild(childTrace: AllPossibleTraces<RelationSchemasT>): void {
    // Add child to the children set
    this.children.add(childTrace)
  }

  onChildEnd(
    childTrace: AllPossibleTraces<RelationSchemasT>,
    stateTransition: FinalTransition<RelationSchemasT>,
    childRecording:
      | TraceRecording<keyof RelationSchemasT, RelationSchemasT>
      | undefined,
  ): void {
    // Remove child from active children
    this.children.delete(childTrace)
    this.terminalStateChildren.add(childTrace)

    const terminalState = stateTransition.transitionToState
    const interruptionReason =
      terminalState === 'interrupted' && 'interruptionReason' in stateTransition
        ? stateTransition.interruptionReason
        : undefined

    if (
      typeof childRecording?.duration === 'number' &&
      childRecording.status !== 'interrupted'
    ) {
      // TODO: should this be sent to TraceManager, or just this Trace (parent)?
      this.processSpan({
        ...childRecording,
        parentSpanId: this.input.id,
        // these below just to satisfy TS, they're already in ...childRecording:
        duration: childRecording.duration,
        status: childRecording.status,
        relatedTo: { ...childRecording.relatedTo },
      })
    }

    // Notify the state machine about the child end
    this.stateMachine.emit('onChildEnd', {
      childTrace,
      terminalState,
      interruptionReason,
    })
  }

  // Method to check if this trace can adopt a child with the given name
  canAdoptChild(childTraceName: string): boolean {
    return this.definition.adoptAsChildren?.includes(childTraceName) ?? false
  }

  // debugging observables
  eventSubjects = {
    'state-transition': new Subject<
      StateTransitionEvent<SelectedRelationNameT, RelationSchemasT, VariantsT>
    >(),
    'required-span-seen': new Subject<
      RequiredSpanSeenEvent<SelectedRelationNameT, RelationSchemasT, VariantsT>
    >(),
    'add-span-to-recording': new Subject<
      AddSpanToRecordingEvent<
        SelectedRelationNameT,
        RelationSchemasT,
        VariantsT
      >
    >(),
    'definition-modified': new Subject<
      DefinitionModifiedEvent<
        SelectedRelationNameT,
        RelationSchemasT,
        VariantsT
      >
    >(),
  }

  when(
    event: 'state-transition',
  ): Observable<
    StateTransitionEvent<SelectedRelationNameT, RelationSchemasT, VariantsT>
  >
  when(
    event: 'required-span-seen',
  ): Observable<
    RequiredSpanSeenEvent<SelectedRelationNameT, RelationSchemasT, VariantsT>
  >
  when(
    event: 'add-span-to-recording',
  ): Observable<
    AddSpanToRecordingEvent<SelectedRelationNameT, RelationSchemasT, VariantsT>
  >
  when(
    event: 'definition-modified',
  ): Observable<
    DefinitionModifiedEvent<SelectedRelationNameT, RelationSchemasT, VariantsT>
  >
  when(
    event:
      | 'required-span-seen'
      | 'state-transition'
      | 'add-span-to-recording'
      | 'definition-modified',
  ):
    | Observable<
        StateTransitionEvent<SelectedRelationNameT, RelationSchemasT, VariantsT>
      >
    | Observable<
        RequiredSpanSeenEvent<
          SelectedRelationNameT,
          RelationSchemasT,
          VariantsT
        >
      >
    | Observable<
        AddSpanToRecordingEvent<
          SelectedRelationNameT,
          RelationSchemasT,
          VariantsT
        >
      >
    | Observable<
        DefinitionModifiedEvent<
          SelectedRelationNameT,
          RelationSchemasT,
          VariantsT
        >
      > {
    return this.eventSubjects[event].asObservable()
  }

  constructor(
    data:
      | {
          definition: CompleteTraceDefinition<
            SelectedRelationNameT,
            RelationSchemasT,
            VariantsT
          >
          input: DraftTraceInput<
            RelationSchemasT[SelectedRelationNameT],
            VariantsT
          >
          definitionModifications?: TraceDefinitionModifications<
            SelectedRelationNameT,
            RelationSchemasT,
            VariantsT
          >
          traceUtilities: TraceUtilities<RelationSchemasT>
        }
      | {
          importFrom: Trace<SelectedRelationNameT, RelationSchemasT, VariantsT>
          definitionModifications: TraceDefinitionModifications<
            SelectedRelationNameT,
            RelationSchemasT,
            VariantsT
          >
        },
  ) {
    const { input, traceUtilities, definition, definitionModifications } =
      'importFrom' in data
        ? {
            input: data.importFrom.input,
            traceUtilities: data.importFrom.traceUtilities,
            // we use the sourceDefinition and we will re-apply all
            // subsequent modifications to it later in the constructor
            definition: data.importFrom.sourceDefinition,
            definitionModifications: data.definitionModifications,
          }
        : data

    this.traceUtilities = {
      ...traceUtilities,
      // every trace gets its own deduplication strategy instance:
      performanceEntryDeduplicationStrategy:
        traceUtilities.getPerformanceEntryDeduplicationStrategy?.(),
    }

    this.sourceDefinition = definition

    // any change or addition to any of the mutable properties of definition *must* update the copy here:
    this.definition = {
      ...definition,

      // below props are potentially mutable elements of the definition, let's make local copies:
      requiredSpans: [...definition.requiredSpans],
      computedSpanDefinitions: { ...definition.computedSpanDefinitions },
      computedValueDefinitions: { ...definition.computedValueDefinitions },

      interruptOnSpans: definition.interruptOnSpans
        ? [...definition.interruptOnSpans]
        : undefined,
      debounceOnSpans: definition.debounceOnSpans
        ? [...definition.debounceOnSpans]
        : undefined,
      captureInteractive: definition.captureInteractive
        ? typeof definition.captureInteractive === 'boolean'
          ? definition.captureInteractive
          : { ...definition.captureInteractive }
        : undefined,
      suppressErrorStatusPropagationOnSpans:
        definition.suppressErrorStatusPropagationOnSpans
          ? [...definition.suppressErrorStatusPropagationOnSpans]
          : undefined,
    }

    if (input.parentTraceId) {
      // never capture interactive in a child trace, it doesn't make sense
      this.definition.captureInteractive = undefined
    }

    // all requiredSpans implicitly interrupt the trace if they error, unless explicitly ignored
    // creates interruptOnSpans for the source definition of requiredSpans
    const interruptOnRequiredErrored =
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      mapRequiredSpanMatchersToInterruptOnMatchers(
        this.definition.requiredSpans,
      )

    // Verify that the variant value is valid
    const variant = definition.variants[input.variant]

    if (variant) {
      this.applyDefinitionModifications(variant, false)
    } else {
      this.traceUtilities.reportErrorFn(
        new Error(
          `Invalid variant value: ${
            input.variant
          }. Must be one of: ${Object.keys(definition.variants).join(', ')}`,
        ),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this as Trace<any, RelationSchemasT, any>,
      )
    }

    this.input = {
      ...input,
      startTime: ensureTimestamp(input.startTime),
    }

    this.definition.interruptOnSpans = [
      ...(this.definition.interruptOnSpans ?? []),
      ...interruptOnRequiredErrored,
    ] as typeof definition.interruptOnSpans

    if ('importFrom' in data) {
      for (const mod of data.importFrom.persistedDefinitionModifications) {
        // re-apply any previously done modifications (in case this isn't the first time we're importing)
        this.applyDefinitionModifications(mod)
      }
    }

    if (definitionModifications) {
      this.applyDefinitionModifications(definitionModifications)
    }

    this.recordedItemsByLabel = Object.fromEntries(
      Object.keys(this.definition.labelMatching ?? {}).map((label) => [
        label,
        [] as SpanAndAnnotation<RelationSchemasT>[],
      ]),
    )

    // definition is now set, we can initialize the state machine
    // note that TraceStateMachine constructor is being called with `this` for a reason
    // we pass in the `Trace` object, which is a partial of the `StateMachineContext` interface
    this.stateMachine = new TraceStateMachine(this)

    if ('importFrom' in data) {
      if (data.importFrom.wasActivated) {
        this.transitionDraftToActive({
          relatedTo: data.importFrom.activeInput.relatedTo,
        })
      }
      // replay the recorded items from the imported trace and copy over cache state
      this.replayItems(data.importFrom.recordedItems)
      this.occurrenceCounters = data.importFrom.occurrenceCounters
      this.processedPerformanceEntries =
        data.importFrom.processedPerformanceEntries

      // transplant children:
      for (const child of data.importFrom.children) {
        this.adoptChild(child)
      }
      // transplant the record of terminal state children:
      this.terminalStateChildren = data.importFrom.terminalStateChildren
    }

    this.traceUtilities.onTraceConstructed(this)
  }

  // lets make sure it serializes well
  toJSON() {
    return {
      input: this.input,
      definition: {
        name: this.definition.name,
      },
    }
  }

  sideEffectFns: TraceStateMachineSideEffectHandlers<RelationSchemasT> = {
    addSpanToRecording: (spanAndAnnotation) => {
      if (!this.recordedItems.has(spanAndAnnotation.span.id)) {
        this.recordedItems.set(spanAndAnnotation.span.id, spanAndAnnotation)
        for (const label of spanAndAnnotation.annotation.labels) {
          this.recordedItemsByLabel[label]?.push(spanAndAnnotation)
        }
        this.eventSubjects['add-span-to-recording'].next({
          spanAndAnnotation,
          traceContext: this,
        })
      }
    },
    onTerminalStateReached: (transition) => {
      this.postProcessSpans()

      let traceRecording:
        | TraceRecording<SelectedRelationNameT, RelationSchemasT>
        | undefined
      // we never report after definition-changed;
      // it just means the Trace object has just been recreated
      if (transition.interruptionReason !== 'definition-changed') {
        // this is an actual interruption:
        // interrupt all children
        for (const child of this.children) {
          child.interrupt('parent-interrupted')
        }
        traceRecording = createTraceRecording(
          // we don't want to pass 'this' but select the relevant properties
          // to avoid circular references
          {
            definition: this.definition,
            recordedItems: this.recordedItems,
            input: this.input,
            recordedItemsByLabel: this.recordedItemsByLabel,
          },
          transition,
        )
        this.traceUtilities.reportFn(traceRecording, this)
      }

      this.traceUtilities.onTraceEnd(this, transition, traceRecording)

      // close all event subjects, no more events can be sent by this trace
      for (const subject of Object.values(this.eventSubjects)) {
        subject.complete()
      }
      // memory clean-up in case something retains the Trace instance
      this.recordedItems = new Map()
      this.occurrenceCounters = new Map()
      this.processedPerformanceEntries = new WeakMap()
      // @ts-expect-error memory cleanup force override the otherwise readonly property
      this.recordedItemsByLabel = {}

      // Clear child references for garbage collection
      this.children.clear()
      this.terminalStateChildren.clear()
      this.traceUtilities.performanceEntryDeduplicationStrategy?.reset()
    },
  }

  private postProcessSpans() {
    // assigns parentSpanId to spans that have it defined in getParentSpanId
    for (const spanAndAnnotation of this.recordedItems.values()) {
      if (
        !spanAndAnnotation.span.parentSpanId &&
        typeof spanAndAnnotation.span.getParentSpanId === 'function'
      ) {
        spanAndAnnotation.span.parentSpanId =
          spanAndAnnotation.span.getParentSpanId({
            thisSpanAndAnnotation: spanAndAnnotation,
            traceContext: this,
            // these two will be overwritten if tick tracking is enabled:
            spansInCurrentTick: [],
            thisSpanInCurrentTickIndex: -1,
          })
        spanAndAnnotation.span.getParentSpanId = undefined
      }
    }
  }

  // this is public API only and should not be called internally
  interrupt(reason: TraceInterruptionReason) {
    this.stateMachine.emit('onInterrupt', reason)
  }

  transitionDraftToActive(
    inputAndDefinitionModifications: TraceModifications<
      SelectedRelationNameT,
      RelationSchemasT,
      VariantsT
    >,
    {
      previouslyActivatedBehavior = 'warn-and-continue',
      invalidRelatedToBehavior = 'warn-and-continue',
    }: TransitionDraftOptions = {},
  ): void {
    const { isDraft } = this
    let reportPreviouslyActivated: ReportErrorFn<RelationSchemasT>
    let overwriteDraft = true
    switch (previouslyActivatedBehavior) {
      case 'error':
        reportPreviouslyActivated = this.traceUtilities.reportErrorFn
        overwriteDraft = false
        break
      case 'error-and-continue':
        reportPreviouslyActivated = this.traceUtilities.reportErrorFn
        break
      default:
        reportPreviouslyActivated = this.traceUtilities.reportWarningFn
        break
    }

    // this is an already initialized active trace, do nothing:
    if (!isDraft) {
      reportPreviouslyActivated(
        new Error(
          `You are trying to activate a trace that has already been activated before (${this.definition.name}).`,
        ),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this as Trace<any, RelationSchemasT, any>,
      )
      if (!overwriteDraft) {
        return
      }
    }

    let reportValidationError: ReportErrorFn<RelationSchemasT>
    let useInvalidRelatedTo = true
    switch (invalidRelatedToBehavior) {
      case 'error':
        reportValidationError = this.traceUtilities.reportErrorFn
        useInvalidRelatedTo = false
        break
      case 'error-and-continue':
        reportValidationError = this.traceUtilities.reportErrorFn
        break
      default:
        reportValidationError = this.traceUtilities.reportWarningFn
        break
    }

    const { attributes } = this.input

    const { relatedTo, errors } = validateAndCoerceRelatedToAgainstSchema(
      inputAndDefinitionModifications.relatedTo,
      this.definition.relationSchema,
    )

    if (errors.length > 0) {
      reportValidationError(
        new Error(
          `Invalid relatedTo value: ${JSON.stringify(
            inputAndDefinitionModifications.relatedTo,
          )}. ${errors.join(', ')}`,
        ),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this as Trace<any, RelationSchemasT, any>,
      )
      if (!useInvalidRelatedTo) {
        return
      }
    }

    this.activeInput = {
      ...this.input,
      relatedTo,
      attributes: {
        ...this.input.attributes,
        ...attributes,
      },
    }

    this.applyDefinitionModifications(inputAndDefinitionModifications)

    this.wasActivated = true

    if (isDraft) {
      // we might already be active in which case we would have issued a warning earlier in this method
      this.stateMachine.emit('onMakeActive', undefined)
    }
  }

  /**
   * The additions to the definition may come from either the variant at transition from draft to active
   * @param definitionModifications
   */
  private applyDefinitionModifications(
    definitionModifications: TraceDefinitionModifications<
      SelectedRelationNameT,
      RelationSchemasT,
      VariantsT
    >,
    /** set to false if the sourceDefinition contains the modification, like in the case of a variant */
    persist = true,
  ) {
    if (persist) {
      this.persistedDefinitionModifications.add(definitionModifications)
    }

    const { definition } = this
    const additionalRequiredSpans = convertMatchersToFns<
      SelectedRelationNameT,
      RelationSchemasT,
      VariantsT
    >(definitionModifications.additionalRequiredSpans)

    const additionalInterruptOnSpans = convertMatchersToFns<
      SelectedRelationNameT,
      RelationSchemasT,
      VariantsT
    >(definitionModifications.additionalInterruptOnSpans)

    const additionalDebounceOnSpans = convertMatchersToFns<
      SelectedRelationNameT,
      RelationSchemasT,
      VariantsT
    >(definitionModifications.additionalDebounceOnSpans)

    if (additionalRequiredSpans?.length) {
      definition.requiredSpans = [
        ...definition.requiredSpans,
        ...additionalRequiredSpans,
      ]
      definition.interruptOnSpans = [
        ...(definition.interruptOnSpans ?? []),
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        ...mapRequiredSpanMatchersToInterruptOnMatchers(
          additionalRequiredSpans,
        ),
      ]
    }

    if (additionalInterruptOnSpans?.length) {
      definition.interruptOnSpans = [
        ...(definition.interruptOnSpans ?? []),
        ...additionalInterruptOnSpans,
      ]
    }

    if (additionalDebounceOnSpans?.length) {
      definition.debounceOnSpans = [
        ...(definition.debounceOnSpans ?? []),
        ...additionalDebounceOnSpans,
      ]
    }

    // Emit definition-modified event
    this.eventSubjects['definition-modified'].next({
      modifications: definitionModifications,
      traceContext: this,
    })
  }

  /**
   * This is used for importing spans when recreating a Trace from another Trace
   * if the definition was modified
   */
  private replayItems(
    spanAndAnnotations: Map<string, SpanAndAnnotation<RelationSchemasT>>,
  ) {
    // replay the spans in the order they were processed
    for (const spanAndAnnotation of spanAndAnnotations.values()) {
      const transition = this.stateMachine.emit(
        'onProcessSpan',
        spanAndAnnotation,
      )
      if (transition && isTerminalState(transition.transitionToState)) {
        return
      }
    }
  }

  processSpan(span: Span<RelationSchemasT>): SpanAnnotationRecord | undefined {
    const spanEndTime = span.startTime.now + span.duration
    // check if valid for this trace:
    if (spanEndTime < this.input.startTime.now) {
      // TODO: maybe we should actually keep events that happened right before the trace started, e.g. 'event' spans for clicks?
      // console.log(
      //   `# span ${span.type} ${span.name} is ignored because it started before the trace started at ${this.input.startTime.now}`,
      // )
      return undefined
    }
    // TODO: also ignore events that started a long long time before the trace started

    // check if the performanceEntry has already been processed
    // a single performanceEntry can have Spans created from it multiple times
    // we allow this in case the Span comes from different contexts
    // currently the version of the Span wins,
    // but we could consider creating some customizable logic
    // re-processing the same span should be safe
    const existingAnnotation =
      (span.performanceEntry &&
        this.processedPerformanceEntries.get(span.performanceEntry)) ??
      this.traceUtilities.performanceEntryDeduplicationStrategy?.findDuplicate(
        span,
        this.recordedItems,
      )

    let spanAndAnnotation: SpanAndAnnotation<RelationSchemasT>

    if (existingAnnotation) {
      spanAndAnnotation = existingAnnotation
      // update the span in the recording using the strategy's selector
      spanAndAnnotation.span =
        this.traceUtilities.performanceEntryDeduplicationStrategy?.selectPreferredSpan(
          existingAnnotation.span,
          span,
        ) ?? span
    } else {
      const spanKey = getSpanKey(span)
      const occurrence = this.occurrenceCounters.get(spanKey) ?? 1
      this.occurrenceCounters.set(spanKey, occurrence + 1)

      const annotation: SpanAnnotation = {
        id: this.input.id,
        operationRelativeStartTime:
          span.startTime.now - this.input.startTime.now,
        operationRelativeEndTime:
          span.startTime.now - this.input.startTime.now + span.duration,
        occurrence,
        recordedInState: this.stateMachine
          .currentState as NonTerminalTraceStates,
        labels: [],
      }

      spanAndAnnotation = {
        span,
        annotation,
      }

      this.traceUtilities.performanceEntryDeduplicationStrategy?.recordSpan(
        span,
        spanAndAnnotation,
      )
    }

    // make sure the labels are up-to-date
    spanAndAnnotation.annotation.labels = this.getSpanLabels(spanAndAnnotation)

    const transition = this.stateMachine.emit(
      'onProcessSpan',
      spanAndAnnotation,
    )

    const annotationRecord: SpanAnnotationRecord = {}
    // Forward span to all still-running children (F-7), and merge result into annotation record
    for (const child of this.children) {
      Object.assign(annotationRecord, child.processSpan(span))
    }

    const shouldRecord =
      !transition || transition.transitionToState !== 'interrupted'

    if (shouldRecord) {
      // the return value is used for reporting the annotation externally (e.g. to the RUM agent)
      return {
        ...annotationRecord,
        [this.definition.name]: spanAndAnnotation.annotation,
      }
    }

    return undefined
  }

  private getSpanLabels(span: SpanAndAnnotation<RelationSchemasT>): string[] {
    const labels: string[] = []
    if (!this.definition.labelMatching) return labels

    for (const [label, doesSpanMatch] of Object.entries(
      this.definition.labelMatching,
    )) {
      if (doesSpanMatch(span, this)) {
        labels.push(label)
      }
    }

    return labels
  }
}

export type AllPossibleTraces<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
> = Trace<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  RelationSchemasT,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any
>

/**
 * all requiredSpans implicitly interrupt the trace if they error, unless explicitly ignored
 */
function mapRequiredSpanMatchersToInterruptOnMatchers<
  const SelectedRelationNameT extends keyof RelationSchemasT,
  const RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  const VariantsT extends string,
>(
  requiredSpans: readonly SpanMatcherFn<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  >[],
): readonly SpanMatcherFn<
  SelectedRelationNameT,
  RelationSchemasT,
  VariantsT
>[] {
  return requiredSpans.flatMap((matcher) =>
    matcher.continueWithErrorStatus
      ? []
      : withAllConditions<SelectedRelationNameT, RelationSchemasT, VariantsT>(
          matcher,
          requiredSpanWithErrorStatus<
            SelectedRelationNameT,
            RelationSchemasT,
            VariantsT
          >(),
        ),
  )
}

// TODO: if typescript gets smarter in the future, this would be a better representation of AllPossibleTraces:
// {
//   [SchemaNameT in keyof RelationSchemasT]: Trace<
//     SchemaNameT,
//     RelationSchemasT,
//     VariantsT
//   >
// }[keyof RelationSchemasT]
