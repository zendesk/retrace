import type { Observable } from 'rxjs'
import { Subject } from 'rxjs'
import { createParentSpanResolver } from './createParentSpanResolver'
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
import { ensureTimestamp } from './ensureTimestamp'
import { findSpanInParentHierarchy } from './findSpanInParentHierarchy'
import { type SpanMatch } from './matchSpan'
import type { ProcessedSpan } from './spanAnnotationTypes'
import {
  type ComponentRenderSpan,
  type ConvenienceSpan,
  type ErrorSpan,
  type ErrorSpanInput,
  PARENT_SPAN,
  type PerformanceEntrySpan,
  type PerformanceEntrySpanInput,
  type RenderSpanInput,
  type Span,
  type SpanUpdateFunction,
} from './spanTypes'
import { TickParentResolver } from './TickParentResolver'
import type { AllPossibleTraces } from './Trace'
import { Tracer } from './Tracer'
import type {
  AllPossibleTraceContexts,
  CompleteTraceDefinition,
  ComputedValueDefinitionInput,
  DraftTraceContext,
  RelationSchemasBase,
  ReportErrorFn,
  TraceDefinition,
  TraceManagerConfig,
  TraceManagerUtilities,
} from './types'

const START_TO_END_SPAN_TYPES = {
  'component-render-start': 'component-render',
  'hook-render-start': 'hook-render',
  mark: 'measure',
} as const

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

  get currentTraceContext():
    | AllPossibleTraceContexts<RelationSchemasT, string>
    | undefined {
    if (!this.currentTrace) return undefined
    return this.currentTrace
  }

  tickParentResolver: TickParentResolver<RelationSchemasT> | undefined

  constructor({
    enableTickTracking = true,
    ...configInput
  }: Omit<TraceManagerConfig<RelationSchemasT>, 'reportWarningFn'> & {
    reportWarningFn?: ReportErrorFn<RelationSchemasT>
  }) {
    this.utilities = {
      // by default noop for warnings
      reportWarningFn: () => {},
      enableTickTracking,
      acceptSpansStartedBeforeTraceStartThreshold: 100,
      ...configInput,
      replaceCurrentTrace: (newTrace, reason) => {
        if (this.currentTrace) {
          if (reason === 'another-trace-started') {
            this.currentTrace.interrupt({
              reason: 'another-trace-started',
              anotherTrace: {
                id: newTrace.input.id,
                name: newTrace.definition.name,
              },
            })
          } else {
            this.currentTrace.interrupt({ reason })
          }
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
    this.tickParentResolver = enableTickTracking
      ? new TickParentResolver(this.utilities)
      : undefined
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
          `A tracer cannot adopt its own traces as children. Please remove "${traceDefinition.name}" from the adoptAsChildren array.`,
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

  processSpan<SpanT extends Span<RelationSchemasT>>(
    inputSpan: SpanT,
    isEndingSpan = false,
  ): ProcessedSpan<RelationSchemasT, SpanT> {
    if (inputSpan.id === undefined) {
      this.utilities.reportWarningFn(
        new Error(
          'Span ID for provided span was undefined, generating a new one.',
        ),
        this.currentTraceContext,
      )
      // note: mutating span on purpose to preserve object identity
      // eslint-disable-next-line no-param-reassign
      inputSpan.id = this.utilities.generateId('span')
    }
    this.tickParentResolver?.addSpanToCurrentTick(inputSpan, isEndingSpan)
    // eslint-disable-next-line prefer-destructuring
    const currentTrace = this.currentTrace
    const maybeProcessed = currentTrace?.processSpan(inputSpan)

    const { spanAndAnnotation: thisSpanAndAnnotation, annotationRecord } =
      maybeProcessed ?? {}

    // processing might have swapped (deduplicated) the instance of span
    const span = (thisSpanAndAnnotation?.span as SpanT | undefined) ?? inputSpan

    const resolveParent = (): Span<RelationSchemasT> | undefined => {
      let parentSpan = span[PARENT_SPAN]
      if (parentSpan === undefined && span.getParentSpan) {
        parentSpan = span.getParentSpan({
          traceContext: currentTrace,
          thisSpanAndAnnotation: thisSpanAndAnnotation ?? { span },
        })
        // cache span if parent found, so we don't have to call getParentSpan again:
        span[PARENT_SPAN] = parentSpan
      }
      return parentSpan
    }

    const updateSpan: SpanUpdateFunction<RelationSchemasT, SpanT> = ({
      reprocess = true,
      ...spanUpdates
    }) => {
      if (!currentTrace || currentTrace !== this.currentTrace) {
        // ignore updates if the trace has changed
        return
      }
      for (const [k, value] of Object.entries(spanUpdates)) {
        const key = k as keyof SpanT
        if (
          typeof value === 'object' &&
          typeof span[key] === 'object' &&
          value !== null
        ) {
          // merge objects, such as attributes or relatedTo:
          Object.assign(span[key] as object, value)
          // eslint-disable-next-line no-continue
          continue
        }
        // for other properties, just assign the value to the new one:

        span[key] = value as never
      }
      if (reprocess) {
        // re-process the span
        currentTrace.processSpan(span)
      }
    }

    return {
      span,
      annotations: annotationRecord,
      resolveParent,
      updateSpan,
      findSpanInParentHierarchy: (spanMatch) =>
        findSpanInParentHierarchy(span, spanMatch, currentTrace),
    }
  }

  ensureCompleteSpan<SpanT extends Span<RelationSchemasT>>({
    parentSpan,
    parentSpanMatcher,
    ...partialSpan
  }: ConvenienceSpan<RelationSchemasT, SpanT>): SpanT {
    const id = partialSpan.id ?? this.utilities.generateId('span')

    // ensure the span has an ID, and a startTime
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    const span = {
      ...partialSpan,
      id,
      startTime: ensureTimestamp(partialSpan.startTime),
      attributes: partialSpan.attributes ?? {},
      duration: partialSpan.duration ?? 0,
      [PARENT_SPAN]: parentSpan,
    } as SpanT

    // convert the convenience matcher to a getParentSpan function if needed::
    if (parentSpanMatcher && !partialSpan.getParentSpan) {
      // let's create a function that resolves the parent span ID based on the matcher:
      span.getParentSpan = createParentSpanResolver<RelationSchemasT, SpanT>(
        span,
        parentSpanMatcher,
      )
    }

    return span
  }

  // helper functions to create and process spans that have a start event and an end event
  endSpan<SpanT extends Span<RelationSchemasT>>(
    startSpan: SpanT,
    {
      parentSpanMatcher,
      getParentSpan,
      parentSpan,
      ...endSpanAttributes
    }: Partial<Omit<ConvenienceSpan<RelationSchemasT, SpanT>, 'id'>> = {},
  ): ProcessedSpan<RelationSchemasT, SpanT> {
    // startTime cannot be updated, but if provided will extend the duration to encompass the time from start to end:
    const duration =
      typeof endSpanAttributes.startTime?.now === 'number' &&
      typeof endSpanAttributes.duration === 'number'
        ? endSpanAttributes.duration +
          Math.max(0, endSpanAttributes.startTime.now - startSpan.startTime.now)
        : endSpanAttributes.duration ??
          performance.now() - startSpan.startTime.now

    const originalGetParentSpan = startSpan.getParentSpan

    Object.assign(startSpan, {
      type:
        endSpanAttributes.type ??
        START_TO_END_SPAN_TYPES[
          startSpan.type as keyof typeof START_TO_END_SPAN_TYPES
        ] ??
        startSpan.type,
      // all overriding properties from endSpan:
      ...endSpanAttributes,
      // merge attributes:
      attributes: {
        ...startSpan.attributes,
        ...endSpanAttributes.attributes,
      },
      duration,
      // always keep id and startTime of the original span:
      startTime: startSpan.startTime,
      id: startSpan.id,
      [PARENT_SPAN]: parentSpan ?? startSpan[PARENT_SPAN],
    })

    // convert the convenience matcher to a getParentSpan function if needed::
    if (parentSpanMatcher && !getParentSpan) {
      // let's create a function that resolves the parent span ID based on the matcher:
      const parentSpanResolver = createParentSpanResolver<
        RelationSchemasT,
        SpanT
      >(startSpan, parentSpanMatcher)
      // try both parent span resolvers, endSpanResolver first, then originalGetParentSpan:
      // eslint-disable-next-line no-param-reassign
      startSpan.getParentSpan = (context) =>
        parentSpanResolver(context) ?? originalGetParentSpan?.(context)
    }

    return this.processSpan(startSpan)
  }

  processErrorSpan(
    partialSpan: ErrorSpanInput<RelationSchemasT>,
  ): ProcessedSpan<RelationSchemasT, ErrorSpan<RelationSchemasT>> {
    return this.createAndProcessSpan({
      name: partialSpan.error.name,
      status: 'error',
      type: 'error',
      ...partialSpan,
    })
  }

  createAndProcessSpan<SpanT extends Span<RelationSchemasT>>(
    partialSpan: ConvenienceSpan<RelationSchemasT, SpanT>,
  ): ProcessedSpan<RelationSchemasT, SpanT> {
    const span = this.ensureCompleteSpan<SpanT>(partialSpan)
    return this.processSpan(span)
  }

  makePerformanceEntrySpan(
    partialSpan: PerformanceEntrySpanInput<RelationSchemasT>,
  ): PerformanceEntrySpan<RelationSchemasT> {
    return this.ensureCompleteSpan<PerformanceEntrySpan<RelationSchemasT>>(
      partialSpan,
    )
  }

  makeRenderSpan(
    partialSpan: RenderSpanInput<RelationSchemasT>,
  ): ComponentRenderSpan<RelationSchemasT> {
    return this.ensureCompleteSpan<ComponentRenderSpan<RelationSchemasT>>(
      partialSpan,
    )
  }

  startRenderSpan({
    kind,
    ...startSpanInput
  }: Omit<RenderSpanInput<RelationSchemasT>, 'type'> & {
    kind?: 'component' | 'hook'
  }) {
    return this.createAndProcessSpan<ComponentRenderSpan<RelationSchemasT>>({
      ...startSpanInput,
      type: kind === 'hook' ? 'hook-render-start' : 'component-render-start',
    })
  }

  endRenderSpan(
    startSpan: ComponentRenderSpan<RelationSchemasT>,
    endSpanAttributes?: Partial<ComponentRenderSpan<RelationSchemasT>> & {
      duration: number
    },
  ) {
    return this.endSpan<ComponentRenderSpan<RelationSchemasT>>(startSpan, {
      ...endSpanAttributes,
      type:
        startSpan.type === 'hook-render-start'
          ? 'hook-render'
          : 'component-render',
    })
  }

  /**
   * Finds the first span matching the provided SpanMatch in the parent hierarchy
   * of the given Span, starting with the span itself and traversing up
   * through its parents.
   */
  findSpanInParentHierarchy(
    span: Span<RelationSchemasT>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    spanMatch: SpanMatch<keyof RelationSchemasT, RelationSchemasT, any>,
  ): Span<RelationSchemasT> | undefined {
    return findSpanInParentHierarchy(span, spanMatch, this.currentTrace)
  }
}
