import { ensureMatcherFn } from './ensureMatcherFn'
import { ensureTimestamp } from './ensureTimestamp'
import type { SpanMatch, SpanMatcherFn } from './matchSpan'
import type { SpanAndAnnotation } from './spanAnnotationTypes'
import type { DraftTraceConfig, StartTraceConfig } from './spanTypes'
import { type AllPossibleTraces, Trace } from './Trace'
import {
  type AllPossibleTraceContexts,
  type CompleteTraceDefinition,
  type ComputedSpanDefinitionInput,
  type ComputedValueDefinitionInput,
  type DraftTraceContext,
  type RelationSchemasBase,
  type TraceDefinitionModifications,
  type TraceManagerUtilities,
  type TraceModifications,
  type TraceUtilities,
  type TransitionDraftOptions,
} from './types'

/**
 * Look for an adopting parent for the given trace definition
 */
function lookForAdoptingParent<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  VariantsT extends string,
>(
  tracerDef: CompleteTraceDefinition<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  >,
  globalUtils: TraceManagerUtilities<RelationSchemasT>,
): AllPossibleTraces<RelationSchemasT> | undefined {
  const maybeParent = globalUtils.getCurrentTrace()
  if (!maybeParent) return undefined

  // First check if the immediate parent can adopt
  if (maybeParent.canAdoptChild(tracerDef.name)) {
    return maybeParent
  }

  // Breadth-first search through children
  const queue: AllPossibleTraces<RelationSchemasT>[] = [...maybeParent.children]

  while (queue.length > 0) {
    const current = queue.shift()!

    if (current.canAdoptChild(tracerDef.name)) {
      return current
    }

    // Add current trace's children to the end of the queue for breadth-first traversal
    queue.push(...current.children)
  }

  return undefined
}

/**
 * Build child-scoped trace utilities that delegate getCurrentTrace and replaceCurrentTrace
 * to work properly with child traces while maintaining parent-child relationships
 */
function buildChildUtilities<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
>(
  getChildTrace: () => AllPossibleTraces<RelationSchemasT> | undefined,
  parent: AllPossibleTraces<RelationSchemasT>,
): TraceUtilities<RelationSchemasT> {
  return {
    // reporting and errors continue to use the original functions
    ...parent.traceUtilities,

    // redirect "current trace" queries to return the itself when asked
    getCurrentTrace: getChildTrace,

    onTraceEnd: (trace, finalTransition, recording) => {
      parent.onChildEnd(trace, finalTransition, recording)
    },

    // handle replacing the current trace in the context of parent-child relationships
    replaceCurrentTrace: (newTrace, reason) => {
      switch (reason) {
        case 'another-trace-started': {
          // as a child, starting another trace doesn't actually replace it,
          // only adds a sibiling to the parent
          parent.adoptChild(newTrace)
          return
        }
        case 'definition-changed': {
          // For other reasons, interrupt the current child and adopt the new one
          const currentChild = getChildTrace()
          if (currentChild) {
            currentChild.interrupt({ reason })
          }
          parent.adoptChild(newTrace) // adds to children
          return
        }
        default: {
          parent.traceUtilities.reportErrorFn(
            new Error(
              `Unexpected reason for replacing current trace: ${reason}`,
            ),
            { definition: newTrace.sourceDefinition } as Partial<
              AllPossibleTraceContexts<RelationSchemasT, string>
            >,
          )
        }
      }
    },
  }
}

/**
 * Recursively search for a child trace with the specified definition
 */
function findChildWithDefinition<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  VariantsT extends string,
>(
  trace: AllPossibleTraces<RelationSchemasT>,
  targetDefinition: CompleteTraceDefinition<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  >,
): Trace<SelectedRelationNameT, RelationSchemasT, VariantsT> | undefined {
  // TOOD: switch to breadth-first
  for (const child of trace.children) {
    if (child.sourceDefinition === targetDefinition) {
      return child as Trace<SelectedRelationNameT, RelationSchemasT, VariantsT>
    }

    // Recursively search in grandchildren
    const found = findChildWithDefinition(child, targetDefinition)
    if (found) {
      return found
    }
  }

  return undefined
}

/**
 * Tracer can create draft traces and start traces
 */
export class Tracer<
  const SelectedRelationNameT extends keyof RelationSchemasT,
  const RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  const VariantsT extends string,
> {
  private definition: CompleteTraceDefinition<
    SelectedRelationNameT,
    RelationSchemasT,
    VariantsT
  >
  private rootTraceUtilities: TraceManagerUtilities<RelationSchemasT>

  constructor(
    definition: CompleteTraceDefinition<
      SelectedRelationNameT,
      RelationSchemasT,
      VariantsT
    >,
    rootTraceUtilities: TraceManagerUtilities<RelationSchemasT>,
  ) {
    this.definition = definition
    this.rootTraceUtilities = rootTraceUtilities
  }

  /**
   * @returns The ID of the trace.
   */
  start = (
    input: StartTraceConfig<RelationSchemasT[SelectedRelationNameT], VariantsT>,
    definitionModifications?: TraceDefinitionModifications<
      SelectedRelationNameT,
      RelationSchemasT,
      VariantsT
    >,
  ): string | undefined => {
    const trace = this.createDraftInternal(input)

    trace?.transitionDraftToActive({
      relatedTo: input.relatedTo,
      ...definitionModifications,
    })

    return trace?.input.id
  }

  createDraft = (
    input: Omit<
      DraftTraceConfig<RelationSchemasT[SelectedRelationNameT], VariantsT>,
      'relatedTo'
    >,
    definitionModifications?: TraceDefinitionModifications<
      SelectedRelationNameT,
      RelationSchemasT,
      VariantsT
    >,
  ): string | undefined =>
    this.createDraftInternal(input, definitionModifications)?.input.id

  private createDraftInternal = (
    input: Omit<
      DraftTraceConfig<RelationSchemasT[SelectedRelationNameT], VariantsT>,
      'relatedTo'
    >,
    definitionModifications?: TraceDefinitionModifications<
      SelectedRelationNameT,
      RelationSchemasT,
      VariantsT
    >,
  ): Trace<SelectedRelationNameT, RelationSchemasT, VariantsT> | undefined => {
    const id = input.id ?? this.rootTraceUtilities.generateId('trace')

    // Look for an adopting parent according to the nested proposal
    const parent = lookForAdoptingParent(
      this.definition,
      this.rootTraceUtilities,
    )

    let trace: Trace<SelectedRelationNameT, RelationSchemasT, VariantsT>

    if (parent) {
      // Create child utilities with a getter function that will return the child trace
      let childTrace:
        | Trace<SelectedRelationNameT, RelationSchemasT, VariantsT>
        | undefined
      const getChildTrace = () => childTrace
      const utilities = buildChildUtilities(getChildTrace, parent)

      // Create the trace with child utilities
      trace = new Trace<SelectedRelationNameT, RelationSchemasT, VariantsT>({
        definition: this.definition,
        input: {
          ...input,
          // relatedTo will be overwritten later during initialization of the trace
          relatedTo: undefined,
          startTime: ensureTimestamp(input.startTime),
          id,
          parentTraceId: parent.input.id,
        },
        definitionModifications,
        traceUtilities: utilities,
      })

      // Store reference for the getter function
      childTrace = trace

      parent.adoptChild(trace) // F-1/F-2 behaviour
      // we do not replace the singleton currentTrace in TraceManager
    } else {
      // Create the trace with normal utilities
      trace = new Trace<SelectedRelationNameT, RelationSchemasT, VariantsT>({
        definition: this.definition,
        input: {
          ...input,
          // relatedTo will be overwritten later during initialization of the trace
          relatedTo: undefined,
          startTime: ensureTimestamp(input.startTime),
          id,
        },
        definitionModifications,
        traceUtilities: this.rootTraceUtilities,
      })

      this.rootTraceUtilities.replaceCurrentTrace(
        trace,
        'another-trace-started',
      )
    }

    return trace
  }

  interrupt = ({ error }: { error?: Error } = {}) => {
    const trace = this.getCurrentTraceOrWarn()
    if (!trace) return
    if (error) {
      trace.processSpan({
        id: this.rootTraceUtilities.generateId('span'),
        name: error.name,
        startTime: ensureTimestamp(),
        type: 'error',
        status: 'error',
        relatedTo: { ...trace.input.relatedTo },
        attributes: {},
        duration: 0,
        error,
        getParentSpan: () => undefined,
      })
      trace.interrupt({ reason: 'aborted' })
      return
    }

    if (trace.isDraft) {
      trace.interrupt({ reason: 'draft-cancelled' })
      return
    }

    trace.interrupt({ reason: 'aborted' })
  }

  /**
   * Adds additional required spans or debounce spans to the current trace *only*.
   * Note: This recreates the Trace instance with the modified definition and replays all the spans.
   */
  addRequirementsToCurrentTraceOnly = (
    definitionModifications: TraceDefinitionModifications<
      SelectedRelationNameT,
      RelationSchemasT,
      VariantsT
    >,
  ): void => {
    const trace = this.getCurrentTraceOrWarn()
    if (!trace) return

    // Create a new trace with the updated definition, importing state from the existing trace
    const newTrace = new Trace<
      SelectedRelationNameT,
      RelationSchemasT,
      VariantsT
    >({
      importFrom: trace,
      definitionModifications,
    })

    // Replace the current trace with the new one
    trace.traceUtilities.replaceCurrentTrace(newTrace, 'definition-changed')
  }

  // can have config changed until we move into active
  // from input: relatedTo (required), attributes (optional, merge into)
  // from definition, can add items to: requiredSpans (additionalRequiredSpans), debounceOnSpans (additionalDebounceOnSpans)
  // documentation: interruption still works and all the other events are buffered
  transitionDraftToActive = (
    inputAndDefinitionModifications: TraceModifications<
      SelectedRelationNameT,
      RelationSchemasT,
      VariantsT
    >,
    opts?: TransitionDraftOptions,
  ): void => {
    const trace = this.getCurrentTraceOrWarn()
    if (!trace) return

    trace.transitionDraftToActive(inputAndDefinitionModifications, opts)
  }

  private getCurrentTraceInternal = ():
    | Trace<SelectedRelationNameT, RelationSchemasT, VariantsT>
    | undefined => {
    const rootTrace = this.rootTraceUtilities.getCurrentTrace()
    if (!rootTrace) {
      return undefined
    }

    // verify that trace is the same definition as the Tracer's definition
    if (rootTrace.sourceDefinition === this.definition) {
      return rootTrace
    }

    const foundChild = findChildWithDefinition(rootTrace, this.definition)
    if (foundChild) {
      return foundChild
    }

    return undefined
  }

  /**
   * @returns The current Trace's context if it exists anywhere in the trace tree,
   * and matches the Tracer's definition.
   */
  getCurrentTrace = ():
    | DraftTraceContext<SelectedRelationNameT, RelationSchemasT, VariantsT>
    | undefined => this.getCurrentTraceInternal()

  // same as getCurrentTrace, but with a warning if no trace or a different trace is found
  private getCurrentTraceOrWarn = ():
    | Trace<SelectedRelationNameT, RelationSchemasT, VariantsT>
    | undefined => {
    const trace = this.getCurrentTraceInternal()

    if (trace) {
      return trace
    }

    const rootTrace = this.rootTraceUtilities.getCurrentTrace()
    if (!rootTrace) {
      // No active trace at all
      this.rootTraceUtilities.reportWarningFn(
        new Error(
          `No current active trace when initializing a trace. Call tracer.start(...) or tracer.createDraft(...) beforehand.`,
        ),
        { definition: this.definition } as Partial<
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          DraftTraceContext<any, RelationSchemasT, any>
        >,
      )
      return undefined
    }

    this.rootTraceUtilities.reportWarningFn(
      new Error(
        `Trying to find an active '${this.definition.name}' trace, however the started root trace (${rootTrace.sourceDefinition.name}) has a different definition`,
      ),
      { definition: this.definition } as Partial<
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        DraftTraceContext<any, RelationSchemasT, any>
      >,
    )
    return undefined
  }

  /**
   * Dynamically add a computed span to the trace definition.
   * Will apply to any trace created *after* calling this function.
   */
  defineComputedSpan = (
    definition: ComputedSpanDefinitionInput<
      SelectedRelationNameT,
      RelationSchemasT,
      VariantsT
    > & { name: string },
  ): void => {
    this.definition.computedSpanDefinitions[definition.name] = {
      startSpan:
        typeof definition.startSpan === 'string'
          ? definition.startSpan
          : ensureMatcherFn<SelectedRelationNameT, RelationSchemasT, VariantsT>(
              definition.startSpan,
            ),
      endSpan:
        typeof definition.endSpan === 'string'
          ? definition.endSpan
          : ensureMatcherFn<SelectedRelationNameT, RelationSchemasT, VariantsT>(
              definition.endSpan,
            ),
    }
  }

  /**
   * Dynamically add a computed value to the trace definition.
   * Will apply to any trace created *after* calling this function.
   */
  defineComputedValue = <
    const MatchersT extends SpanMatch<
      SelectedRelationNameT,
      RelationSchemasT,
      VariantsT
    >[],
  >(
    definition: ComputedValueDefinitionInput<
      SelectedRelationNameT,
      RelationSchemasT,
      VariantsT,
      MatchersT
    > & { name: string },
  ): void => {
    const convertedMatches = definition.matches.map<
      SpanMatcherFn<SelectedRelationNameT, RelationSchemasT, VariantsT>
    >((m) => ensureMatcherFn(m))

    this.definition.computedValueDefinitions[definition.name] = {
      matches: convertedMatches,
      computeValueFromMatches: definition.computeValueFromMatches as (
        ...matches: (readonly SpanAndAnnotation<RelationSchemasT>[])[]
      ) => number | string | boolean | undefined,
    }
  }
}
