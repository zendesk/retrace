import type { Observable } from 'rxjs'
import { Subject } from 'rxjs'
import type {
  AllPossibleAddSpanToRecordingEvents,
  AllPossibleDefinitionModifiedEvents,
  AllPossibleRequiredSpanSeenEvents,
  AllPossibleStateTransitionEvents,
  AllPossibleTraceStartEvents,
} from './debugTypes'
import {
  convertLabelMatchersToFns,
  convertMatchersToFns,
  ensureMatcherFn,
} from './ensureMatcherFn'
import { type SpanMatch } from './matchSpan'
import type { SpanAnnotationRecord } from './spanAnnotationTypes'
import type { Span } from './spanTypes'
import type { AllPossibleTraces } from './Trace'
import { Tracer } from './Tracer'
import type {
  AllPossibleTraceContexts,
  CompleteTraceDefinition,
  ComputedValueDefinitionInput,
  DraftTraceContext,
  RelationSchemasBase,
  ReportErrorFn,
  SpanDeduplicationStrategy,
  TraceDefinition,
  TraceManagerConfig,
  TraceManagerUtilities,
} from './types'

/**
 * Class representing the centralized trace manager.
 * Usually you'll have a single instance of this class in your app.
 */
export class TraceManager<
  const RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
> {
  private currentTrace: AllPossibleTraces<RelationSchemasT> | undefined =
    undefined

  // Event subjects for all traces
  private eventSubjects = {
    'trace-start': new Subject<AllPossibleTraceStartEvents<RelationSchemasT>>(),
    'state-transition': new Subject<
      AllPossibleStateTransitionEvents<RelationSchemasT>
    >(),
    'required-span-seen': new Subject<
      AllPossibleRequiredSpanSeenEvents<RelationSchemasT>
    >(),
    'add-span-to-recording': new Subject<
      AllPossibleAddSpanToRecordingEvents<RelationSchemasT>
    >(),
    'definition-modified': new Subject<
      AllPossibleDefinitionModifiedEvents<RelationSchemasT>
    >(),
  }

  get currentTracerContext():
    | AllPossibleTraceContexts<RelationSchemasT, string>
    | undefined {
    if (!this.currentTrace) return undefined
    return this.currentTrace
  }

  constructor(
    configInput: Omit<
      TraceManagerConfig<RelationSchemasT>,
      'reportWarningFn'
    > & { reportWarningFn?: ReportErrorFn<RelationSchemasT> },
  ) {
    this.utilities = {
      // by default noop for warnings
      reportWarningFn: () => {},
      ...configInput,
      replaceCurrentTrace: (newTrace, reason) => {
        if (this.currentTrace) {
          this.currentTrace.interrupt(reason)
        }
        this.currentTrace = newTrace
      },
      onTraceConstructed: (newTrace) => {
        // Subscribe to the new trace's events and forward them to our subjects
        this.subscribeToTraceEvents(newTrace)
        // Emit trace-start event
        this.eventSubjects['trace-start'].next({
          traceContext: newTrace,
        })
      },
      onTraceEnd: (endedTrace) => {
        if (endedTrace === this.currentTrace) {
          this.currentTrace = undefined
        }
        // warn on miss?
      },
      getCurrentTrace: () => this.currentTrace,
    }
  }

  /**
   * Subscribe to events from a trace and forward them to the TraceManager subjects
   */
  private subscribeToTraceEvents(
    trace: AllPossibleTraces<RelationSchemasT>,
  ): void {
    // Forward state transition events
    trace.when('state-transition').subscribe((event) => {
      this.eventSubjects['state-transition'].next(event)
    })

    // Forward required span seen events
    trace.when('required-span-seen').subscribe((event) => {
      this.eventSubjects['required-span-seen'].next(event)
    })

    // Forward add-span-to-recording events
    trace.when('add-span-to-recording').subscribe((event) => {
      this.eventSubjects['add-span-to-recording'].next(event)
    })

    trace.when('definition-modified').subscribe((event) => {
      this.eventSubjects['definition-modified'].next(event)
    })
  }

  /**
   * Observable for events from all traces
   * @param event The event type to observe
   * @returns An Observable that emits events of the specified type from all traces
   */
  when(
    event: 'trace-start',
  ): Observable<AllPossibleTraceStartEvents<RelationSchemasT>>
  when(
    event: 'state-transition',
  ): Observable<AllPossibleStateTransitionEvents<RelationSchemasT>>
  when(
    event: 'required-span-seen',
  ): Observable<AllPossibleRequiredSpanSeenEvents<RelationSchemasT>>
  // New events
  when(
    event: 'add-span-to-recording',
  ): Observable<AllPossibleAddSpanToRecordingEvents<RelationSchemasT>>
  when(
    event: 'definition-modified',
  ): Observable<AllPossibleDefinitionModifiedEvents<RelationSchemasT>>
  when(
    event:
      | 'required-span-seen'
      | 'trace-start'
      | 'state-transition'
      | 'add-span-to-recording'
      | 'definition-modified',
  ):
    | Observable<AllPossibleTraceStartEvents<RelationSchemasT>>
    | Observable<AllPossibleStateTransitionEvents<RelationSchemasT>>
    | Observable<AllPossibleRequiredSpanSeenEvents<RelationSchemasT>>
    | Observable<AllPossibleAddSpanToRecordingEvents<RelationSchemasT>>
    | Observable<AllPossibleDefinitionModifiedEvents<RelationSchemasT>> {
    return this.eventSubjects[event].asObservable()
  }

  private utilities: TraceManagerUtilities<RelationSchemasT>

  createTracer<
    const SelectedRelationNameT extends keyof RelationSchemasT,
    const VariantsT extends string,
    const ComputedValueTuplesT extends {
      [K in keyof ComputedValueTuplesT]: SpanMatch<
        NoInfer<SelectedRelationNameT>,
        RelationSchemasT,
        NoInfer<VariantsT>
      >[]
    },
  >(
    traceDefinition: TraceDefinition<
      SelectedRelationNameT,
      RelationSchemasT,
      VariantsT,
      {
        [K in keyof ComputedValueTuplesT]: ComputedValueDefinitionInput<
          NoInfer<SelectedRelationNameT>,
          RelationSchemasT,
          NoInfer<VariantsT>,
          ComputedValueTuplesT[K]
        >
      }
    >,
  ): Tracer<SelectedRelationNameT, RelationSchemasT, VariantsT> {
    const requiredSpans = convertMatchersToFns<
      SelectedRelationNameT,
      RelationSchemasT,
      VariantsT
    >(traceDefinition.requiredSpans)

    const labelMatching = traceDefinition.labelMatching
      ? convertLabelMatchersToFns(traceDefinition.labelMatching)
      : undefined

    const debounceOnSpans = convertMatchersToFns<
      SelectedRelationNameT,
      RelationSchemasT,
      VariantsT
    >(traceDefinition.debounceOnSpans)

    const interruptOnSpans = convertMatchersToFns<
      SelectedRelationNameT,
      RelationSchemasT,
      VariantsT
    >(traceDefinition.interruptOnSpans)

    const suppressErrorStatusPropagationOnSpans = convertMatchersToFns<
      SelectedRelationNameT,
      RelationSchemasT,
      VariantsT
    >(traceDefinition.suppressErrorStatusPropagationOnSpans)

    const computedSpanDefinitions = Object.fromEntries(
      Object.entries(traceDefinition.computedSpanDefinitions ?? {}).map(
        ([name, def]) => [
          name,
          {
            startSpan:
              typeof def.startSpan === 'string'
                ? def.startSpan
                : ensureMatcherFn<
                    SelectedRelationNameT,
                    RelationSchemasT,
                    VariantsT
                  >(def.startSpan),
            endSpan:
              typeof def.endSpan === 'string'
                ? def.endSpan
                : ensureMatcherFn<
                    SelectedRelationNameT,
                    RelationSchemasT,
                    VariantsT
                  >(def.endSpan),
          } as const,
        ],
      ),
    )

    const computedValueDefinitionsInputEntries = Object.entries<
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ComputedValueDefinitionInput<any, any, any, any>
    >(traceDefinition.computedValueDefinitions ?? {})

    const computedValueDefinitions = Object.fromEntries(
      computedValueDefinitionsInputEntries.map(([name, def]) => [
        name,
        {
          ...def,
          matches: def.matches.map(
            (
              m: SpanMatch<SelectedRelationNameT, RelationSchemasT, VariantsT>,
            ) =>
              ensureMatcherFn<
                SelectedRelationNameT,
                RelationSchemasT,
                VariantsT
              >(m),
          ),
          computeValueFromMatches: def.computeValueFromMatches,
        } as const,
      ]),
    )

    const completeTraceDefinition: CompleteTraceDefinition<
      SelectedRelationNameT,
      RelationSchemasT,
      VariantsT
    > = {
      ...traceDefinition,
      requiredSpans:
        requiredSpans ??
        [
          // lack of requiredSpan is invalid, but we warn about it below
        ],
      debounceOnSpans,
      interruptOnSpans,
      suppressErrorStatusPropagationOnSpans,
      computedSpanDefinitions,
      computedValueDefinitions,
      labelMatching,
      relationSchema:
        this.utilities.relationSchemas[traceDefinition.relationSchemaName],
    }
    if (traceDefinition.adoptAsChildren?.includes(traceDefinition.name)) {
      this.utilities.reportErrorFn(
        new Error(
          `A tracer cannot adopt its own traces as a children. Please remove "${traceDefinition.name}" from the adoptAsChildren array.`,
        ),
        {
          definition: completeTraceDefinition as CompleteTraceDefinition<
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            any,
            RelationSchemasT,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            any
          >,
        } as Partial<AllPossibleTraceContexts<RelationSchemasT, string>>,
      )
      completeTraceDefinition.adoptAsChildren =
        completeTraceDefinition.adoptAsChildren!.filter(
          (childName) => childName !== traceDefinition.name,
        )
    }

    if (!requiredSpans) {
      this.utilities.reportErrorFn(
        new Error(
          'requiredSpans must be defined along with the trace, as a trace can only end in an interrupted state otherwise',
        ),
        { definition: completeTraceDefinition } as Partial<
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          DraftTraceContext<any, RelationSchemasT, any>
        >,
      )
    }

    return new Tracer(completeTraceDefinition, this.utilities)
  }

  processSpan(span: Span<RelationSchemasT>): SpanAnnotationRecord | undefined {
    // const spanWithId = span.id
    //   ? span
    //   : { id: this.utilities.generateId(), ...span }
    if (span.id === undefined) {
      // eslint-disable-next-line no-param-reassign
      span.id = this.utilities.generateId()
    }
    return this.currentTrace?.processSpan(span)
  }
}
