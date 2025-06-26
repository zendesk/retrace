import type { Observable } from 'rxjs'
import { Subject } from 'rxjs'
import { FALLBACK_ANNOTATION } from './constants'
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
import { findMatchingSpan, fromDefinition, type SpanMatch } from './matchSpan'
import type {
  ProcessedSpan,
  SpanAndAnnotation,
  SpanAnnotationRecord,
} from './spanAnnotationTypes'
import type {
  ComponentRenderSpan,
  ConvenienceSpan,
  ErrorSpan,
  ErrorSpanInput,
  GetParentSpanIdFn,
  PerformanceEntrySpan,
  PerformanceEntrySpanInput,
  RenderSpanInput,
  Span,
  SpanUpdateFunction,
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

  #processSpan<SpanT extends Span<RelationSchemasT>>(
    span: SpanT,
  ): ProcessedSpan<RelationSchemasT, SpanT> {
    if (span.id === undefined) {
      this.utilities.reportWarningFn(
        new Error(
          'Span ID for provided span was undefined, generating a new one.',
        ),
        this.currentTraceContext,
      )
      // note: mutating span on purpose to preserve object identity
      // eslint-disable-next-line no-param-reassign
      span.id = this.utilities.generateId('span')
    }
    const tickMeta = this.tickParentResolver?.addSpanToCurrentTick(span)
    // eslint-disable-next-line prefer-destructuring
    const currentTrace = this.currentTrace
    const annotations = currentTrace?.processSpan(span, tickMeta)
    const thisSpanAndAnnotation = currentTrace?.recordedItems.get(span.id)

    const resolveParent = ():
      | SpanAndAnnotation<RelationSchemasT>
      | undefined => {
      if (currentTrace && thisSpanAndAnnotation) {
        // eslint-disable-next-line prefer-destructuring
        let parentSpanId = span.parentSpanId
        if (parentSpanId === undefined && span.getParentSpanId) {
          parentSpanId = span.getParentSpanId({
            traceContext: currentTrace,
            thisSpanAndAnnotation,
          })
          // update span if parent found, so we don't have to call getParentSpanId again:
          // eslint-disable-next-line no-param-reassign
          span.parentSpanId = parentSpanId
        }
        if (parentSpanId) {
          return currentTrace.recordedItems.get(parentSpanId)
        }
      }
      return undefined
    }

    const updateSpan: SpanUpdateFunction<RelationSchemasT, SpanT> = (
      spanUpdates,
    ) => {
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
        // eslint-disable-next-line no-param-reassign
        span[key] = value as never
      }
      // re-process the span
      currentTrace.processSpan(span, tickMeta)
    }

    const findSpanInParentHierarchy = (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      spanMatch: SpanMatch<keyof RelationSchemasT, RelationSchemasT, any>,
    ): SpanAndAnnotation<RelationSchemasT> | undefined => {
      if (!currentTrace) return undefined
      return currentTrace.findSpanInParentHierarchy(span, spanMatch)
    }

    return {
      span,
      annotations,
      tickMeta,
      resolveParent,
      updateSpan,
      findSpanInParentHierarchy,
    }
  }

  processSpan(span: Span<RelationSchemasT>): SpanAnnotationRecord | undefined {
    return this.#processSpan(span).annotations
  }

  ensureCompleteSpan<SpanT extends Span<RelationSchemasT>>({
    parentSpanMatcher,
    ...partialSpan
  }: ConvenienceSpan<RelationSchemasT, SpanT>): SpanT {
    const id = partialSpan.id ?? this.utilities.generateId('span')
    // eslint-disable-next-line prefer-destructuring
    let getParentSpanId: GetParentSpanIdFn<RelationSchemasT> | undefined =
      partialSpan.getParentSpanId
    if (parentSpanMatcher && !getParentSpanId) {
      // let's create a function that resolves the parent span ID based on the matcher:
      getParentSpanId = (context): string | undefined => {
        if (partialSpan.parentSpanId) {
          return partialSpan.parentSpanId
        }
        // check if parent was set after the span was created:
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        if (span.parentSpanId) {
          // eslint-disable-next-line @typescript-eslint/no-use-before-define
          return span.parentSpanId
        }
        const spanAndAnnotations =
          parentSpanMatcher.search === 'current-tick'
            ? context.thisSpanAndAnnotation.tickMeta?.spansInCurrentTick.map(
                (sp) =>
                  context.traceContext.recordedItems.get(sp.id) ?? {
                    span: sp,
                    // this should never happen, but we provide a fallback annotation to satisfy types / in case of a bug:
                    annotation: FALLBACK_ANNOTATION,
                    tickMeta: undefined,
                  },
              ) ?? []
            : // TODO: we could optimize this to not iterate over the entire array for every span by providing it in context
              [...context.traceContext.recordedItems.values()]

        // TODO: consider memoizing the matchFn
        const parentSpanMatchFn =
          typeof parentSpanMatcher.match === 'object'
            ? fromDefinition(parentSpanMatcher.match)
            : parentSpanMatcher.match

        const thisSpanIndex =
          parentSpanMatcher.search === 'current-tick'
            ? context.thisSpanAndAnnotation.tickMeta
                ?.thisSpanInCurrentTickIndex ?? -1
            : spanAndAnnotations.findIndex(
                (spanAndAnnotation) => spanAndAnnotation.span.id === id,
              )

        if (thisSpanIndex === -1) {
          // invalid
          return undefined
        }

        const found = findMatchingSpan(
          parentSpanMatchFn,
          spanAndAnnotations,
          context.traceContext,
          {
            ...(parentSpanMatcher.searchDirection === 'after-self' && {
              matchingIndex: 0,
              startFromIndex: thisSpanIndex + 1,
            }),
            ...(parentSpanMatcher.searchDirection === 'before-self' && {
              matchingIndex: -1,
              endAtIndex: thisSpanIndex - 1,
            }),
          },
        )

        if (found) {
          // eslint-disable-next-line @typescript-eslint/no-use-before-define
          span.parentSpanId = found.span.id
        }
        return found?.span.id
      }
    }

    // ensure the span has an ID, and a startTime
    const span = {
      ...partialSpan,
      id,
      startTime: ensureTimestamp(partialSpan.startTime),
      attributes: partialSpan.attributes ?? {},
      duration: partialSpan.duration ?? 0,
      getParentSpanId,
    }
    return span as SpanT
  }

  // helper functions to create and process spans that have a start event and an end event
  endSpan<SpanT extends Span<RelationSchemasT>>(
    startSpan: SpanT,
    endSpanAttributes: Partial<ConvenienceSpan<RelationSchemasT, SpanT>> = {},
  ): ProcessedSpan<RelationSchemasT, SpanT> {
    const endSpan = this.ensureCompleteSpan<SpanT>({
      // all properties from startSpan:
      ...startSpan,
      type: startSpan.type === 'mark' ? 'measure' : startSpan.type,
      // all overriding properties from endSpan:
      ...endSpanAttributes,
      // merge attributes:
      attributes: {
        ...startSpan.attributes,
        ...endSpanAttributes.attributes,
      },
      // calculate duration if not provided:
      duration:
        endSpanAttributes.duration ??
        performance.now() - startSpan.startTime.now,
      // a new id, if not provided
      id: endSpanAttributes.id ?? this.utilities.generateId('span'),
      // a reference to the startSpan:
      startSpanId: startSpan.id,
    })

    return this.#processSpan(endSpan)
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
    return this.#processSpan(span)
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

  startRenderSpan(
    startSpanInput: Omit<RenderSpanInput<RelationSchemasT>, 'type'>,
  ) {
    return this.createAndProcessSpan<ComponentRenderSpan<RelationSchemasT>>({
      ...startSpanInput,
      type: 'component-render-start',
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
      type: 'component-render',
    })
  }

  /**
   * Finds the first span matching the provided SpanMatch in the parent hierarchy
   * of the given Span, starting with the span itself and traversing up
   * through its parents.
   */
  findSpanInParentHierarchy<
    SpanT extends Partial<Span<RelationSchemasT>> & { id: string },
    SelectedRelationNameT extends keyof RelationSchemasT = keyof RelationSchemasT,
    VariantsT extends string = string,
  >(
    span: SpanT,
    spanMatch: SpanMatch<SelectedRelationNameT, RelationSchemasT, VariantsT>,
  ): SpanAndAnnotation<RelationSchemasT> | undefined {
    const { currentTrace } = this
    if (!currentTrace) {
      return undefined
    }

    return currentTrace.findSpanInParentHierarchy(span, spanMatch)
  }
}
