/* eslint-disable no-continue */
import { INHERIT_FROM_PARENT } from './constants'
import {
  ensureMatcherFn,
  ensureMatcherFnOrSpecialToken,
} from './ensureMatcherFn'
import { findMatchingSpan } from './matchSpan'
import type { SpanAndAnnotation } from './spanAnnotationTypes'
import {
  type ActiveTraceInput,
  type DraftTraceInput,
  PARENT_SPAN,
  type Span,
} from './spanTypes'
import type { FinalTransition } from './Trace'
import type {
  RecordedSpanAndAnnotation,
  TraceRecording,
} from './traceRecordingTypes'
import type {
  PromoteSpanAttributesDefinition,
  RelationSchemasBase,
  SpecialEndToken,
  SpecialStartToken,
  TraceContext,
} from './types'

/**
 * ### Deriving SLIs and other metrics from a trace
 *
 * ℹ️ It is our recommendation that the primary way of creating duration metrics would be to derive them from data in the trace.
 *
 * Instead of the traditional approach of capturing isolated metrics imperatively in the code,
 * the **trace** model allows us the flexibility to define and compute any number of metrics from the **trace recording**.
 *
 * We can distinguish the following types of metrics:
 *
 * 1. **Duration of a Computed Span** — the time between any two **spans** that appeared in the **trace**. For example:
 *    1. _time between the user’s click on a ticket_ and _everything in the ticket page has fully rendered with content_ (duration of the entire operation)
 *    2. _time between the user’s click on a ticket_ and _the moment the first piece of the ticket UI was displayed_ (duration of a segment of the operation)
 *
 * 2. **Computed Values** — any numerical value derived from the **spans** or their attributes. For example:
 *    1. _The total number of times the log component re-rendered while loading the ticket_
 *    2. _The total number of requests made while loading the ticket_
 *    3. _The total number of iframe apps were initialized while loading the ticket_
 */
export function getComputedValues<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  const VariantsT extends string,
>(
  context: TraceContext<SelectedRelationNameT, RelationSchemasT, VariantsT>,
): TraceRecording<SelectedRelationNameT, RelationSchemasT>['computedValues'] {
  const computedValues: TraceRecording<
    SelectedRelationNameT,
    RelationSchemasT
  >['computedValues'] = {}

  for (const [name, computedValueDefinition] of Object.entries(
    context.definition.computedValueDefinitions,
  )) {
    const { matches, computeValueFromMatches } = computedValueDefinition

    // Initialize arrays to hold matches for each matcher
    const matchingEntriesByMatcher: SpanAndAnnotation<RelationSchemasT>[][] =
      Array.from({ length: matches.length }, () => [])

    // Single pass through recordedItems
    for (const item of context.recordedItems.values()) {
      // TODO: refactor findMatchingSpan to be a generator function
      // that returns multiple matches and use it here
      matches.forEach((doesSpanMatch, index) => {
        if (doesSpanMatch(item, context)) {
          matchingEntriesByMatcher[index]!.push(item)
        }
      })
    }

    const value = computeValueFromMatches(...matchingEntriesByMatcher)
    if (value !== undefined) {
      computedValues[name] = value
    }
  }
  return computedValues
}

export function getComputedSpans<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  const VariantsT extends string,
>(
  context: TraceContext<SelectedRelationNameT, RelationSchemasT, VariantsT>,
  finalState?: {
    completeSpanAndAnnotation?: SpanAndAnnotation<RelationSchemasT>
    cpuIdleSpanAndAnnotation?: SpanAndAnnotation<RelationSchemasT>
  },
): TraceRecording<SelectedRelationNameT, RelationSchemasT>['computedSpans'] {
  const computedSpans: TraceRecording<
    SelectedRelationNameT,
    RelationSchemasT
  >['computedSpans'] = {}
  const recordedItemsArray = [...context.recordedItems.values()]

  for (const [name, computedSpanDefinition] of Object.entries(
    context.definition.computedSpanDefinitions,
  )) {
    // Create matchers from the span definitions
    const startSpanMatcher = ensureMatcherFnOrSpecialToken<
      SelectedRelationNameT,
      RelationSchemasT,
      VariantsT,
      SpecialStartToken
    >(computedSpanDefinition.startSpan)

    const endSpanMatcher = ensureMatcherFnOrSpecialToken<
      SelectedRelationNameT,
      RelationSchemasT,
      VariantsT,
      SpecialEndToken
    >(computedSpanDefinition.endSpan)

    // Find matching start entry
    let matchingStartEntry:
      | SpanAndAnnotation<RelationSchemasT>
      | 'operation-start'
      | undefined =
      startSpanMatcher === 'operation-start' ? 'operation-start' : undefined

    if (typeof startSpanMatcher === 'function') {
      matchingStartEntry = findMatchingSpan(
        startSpanMatcher,
        recordedItemsArray,
        context,
      )
    }

    // Find matching end entry
    let matchingEndEntry: SpanAndAnnotation<RelationSchemasT> | undefined

    if (typeof endSpanMatcher === 'function') {
      matchingEndEntry = findMatchingSpan(
        endSpanMatcher,
        recordedItemsArray,
        context,
      )
    } else if (endSpanMatcher === 'operation-end') {
      matchingEndEntry = finalState?.completeSpanAndAnnotation
    } else if (endSpanMatcher === 'interactive') {
      matchingEndEntry = finalState?.cpuIdleSpanAndAnnotation
    }

    // Calculate timing values
    const matchingStartTime =
      matchingStartEntry === 'operation-start'
        ? context.input.startTime.now
        : matchingStartEntry?.span.startTime.now

    const matchingEndTime = matchingEndEntry
      ? matchingEndEntry.span.startTime.now + matchingEndEntry.span.duration
      : undefined

    // Create computed span if both start and end times are found
    if (
      typeof matchingStartTime === 'number' &&
      typeof matchingEndTime === 'number'
    ) {
      computedSpans[name] = {
        duration: matchingEndTime - matchingStartTime,
        startOffset: matchingStartTime - context.input.startTime.now,

        // DECISION: After considering which events happen first and which one is defined as the start
        // the start offset is always going to be anchored to the start span.
        // cases:
        // -----S------E (computed val is positive)
        // -----E------S (computed val is negative)
        // this way the `endOffset` can be derived as follows:
        // endOffset = computedSpan.startOffset + computedSpan.duration
      }
    }
  }

  return computedSpans
}

function getComputedRenderBeaconSpans<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  const VariantsT extends string,
>(
  recordedItems: readonly SpanAndAnnotation<RelationSchemasT>[],
  input: ActiveTraceInput<RelationSchemasT[SelectedRelationNameT], VariantsT>,
): TraceRecording<
  SelectedRelationNameT,
  RelationSchemasT
>['computedRenderBeaconSpans'] {
  const renderSpansByBeacon = new Map<
    string,
    {
      firstStart: number
      firstContentfulRenderEnd: number | undefined
      firstLoadingEnd: number | undefined
      firstContentStart: number | undefined
      renderCount: number
      sumOfDurations: number
      lastRenderStartTime: number | undefined // Track the last render start time
      attributes: Record<string, unknown>
    }
  >()

  const relatedToKey = Object.keys(input.relatedTo)

  // Group render spans by beacon and compute firstStart and lastEnd
  for (const entry of recordedItems) {
    if (
      entry.span.type !== 'component-render' &&
      entry.span.type !== 'component-render-start'
    ) {
      continue
    }
    const {
      name,
      startTime,
      duration,
      relatedTo: r,
      renderedOutput,
    } = entry.span

    const relatedTo = r as Record<string, unknown> | undefined
    const inputRelatedTo: Record<string, unknown> = input.relatedTo

    const relationMatch = relatedToKey.every(
      (key) =>
        relatedTo?.[key] === undefined ||
        inputRelatedTo[key] === relatedTo[key],
    )
    if (!relationMatch) continue

    const start = startTime.now
    const contentfulRenderEnd =
      entry.span.type === 'component-render' && renderedOutput === 'content'
        ? start + duration
        : undefined

    const spanTimes = renderSpansByBeacon.get(name)

    if (!spanTimes) {
      renderSpansByBeacon.set(name, {
        firstStart: start,
        firstContentfulRenderEnd: contentfulRenderEnd,
        renderCount: entry.span.type === 'component-render' ? 1 : 0,
        sumOfDurations: duration,
        firstContentStart: renderedOutput === 'content' ? start : undefined,
        firstLoadingEnd:
          entry.span.type === 'component-render' && renderedOutput === 'loading'
            ? start + duration
            : undefined,
        lastRenderStartTime:
          entry.span.type === 'component-render-start' ? start : undefined,
        attributes: entry.span.attributes ?? {},
      })
    } else {
      // merge attributes:
      spanTimes.attributes = {
        ...spanTimes.attributes,
        ...entry.span.attributes,
      }
      spanTimes.firstStart = Math.min(spanTimes.firstStart, start)
      spanTimes.firstContentfulRenderEnd =
        contentfulRenderEnd && spanTimes.firstContentfulRenderEnd
          ? Math.min(spanTimes.firstContentfulRenderEnd, contentfulRenderEnd)
          : contentfulRenderEnd ?? spanTimes.firstContentfulRenderEnd

      if (entry.span.type === 'component-render') {
        spanTimes.renderCount += 1
        // React's concurrent rendering might pause and discard a render,
        // which would mean that an effect scheduled for that render does not execute because the render itself was not committed to the DOM.
        // we want to extend the the render span backwards, to first time that rendering was scheduled as the start time of rendering
        if (spanTimes.lastRenderStartTime !== undefined) {
          spanTimes.sumOfDurations +=
            start + duration - spanTimes.lastRenderStartTime
          spanTimes.lastRenderStartTime = undefined
        } else {
          spanTimes.sumOfDurations += duration
        }
      } else if (entry.span.type === 'component-render-start') {
        spanTimes.lastRenderStartTime = start
      }

      if (
        spanTimes.firstContentStart === undefined &&
        renderedOutput === 'content'
      ) {
        spanTimes.firstContentStart = start
      }
      if (
        spanTimes.firstLoadingEnd === undefined &&
        entry.span.type === 'component-render' &&
        renderedOutput === 'loading'
      ) {
        spanTimes.firstLoadingEnd = start + duration
      }
    }
  }

  const computedRenderBeaconSpans: TraceRecording<
    SelectedRelationNameT,
    RelationSchemasT
  >['computedRenderBeaconSpans'] = {}

  // Calculate duration and startOffset for each beacon
  for (const [beaconName, renderSummary] of renderSpansByBeacon) {
    if (!renderSummary.firstContentfulRenderEnd) continue
    computedRenderBeaconSpans[beaconName] = {
      startOffset: renderSummary.firstStart - input.startTime.now,
      firstRenderTillContent:
        renderSummary.firstContentfulRenderEnd - renderSummary.firstStart,
      firstRenderTillLoading: renderSummary.firstLoadingEnd
        ? renderSummary.firstLoadingEnd - renderSummary.firstStart
        : 0,
      firstRenderTillData: renderSummary.firstContentStart
        ? renderSummary.firstContentStart - renderSummary.firstStart
        : 0,
      renderCount: renderSummary.renderCount,
      sumOfRenderDurations: renderSummary.sumOfDurations,
      // TODO: potentially expose attributes; though this might duplicate the span attributes
      // ...(Object.keys(renderSummary.attributes).length > 0
      //   ? {
      //       attributes: renderSummary.attributes,
      //     }
      //   : {}),
    }
  }

  return computedRenderBeaconSpans
}

/**
 * Find and promote span attributes to trace attributes per promoteSpanAttributes definition.
 */
function promoteSpanAttributesForTrace<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  VariantsT extends string,
>(
  definition: {
    promoteSpanAttributes?: PromoteSpanAttributesDefinition<
      SelectedRelationNameT,
      RelationSchemasT,
      VariantsT
    >[]
  },
  recordedItemsArray: SpanAndAnnotation<RelationSchemasT>[],
  context: TraceContext<SelectedRelationNameT, RelationSchemasT, VariantsT>,
): Record<string, unknown> {
  if (!definition.promoteSpanAttributes) return {}
  const promoted: Record<string, unknown> = {}
  for (const rule of definition.promoteSpanAttributes) {
    const matcher = ensureMatcherFn<
      SelectedRelationNameT,
      RelationSchemasT,
      VariantsT
    >(rule.span)
    if (matcher.nthMatch === undefined) {
      // if no specific index is provided, we accumulate attributes from all matches
      // last one wins
      for (const spanAnn of recordedItemsArray) {
        if (matcher(spanAnn, context)) {
          const attrs = spanAnn.span.attributes
          if (attrs) {
            for (const key of rule.attributes) {
              if (key in attrs) promoted[key] = attrs[key]
            }
          }
        }
      }
    } else {
      const matchingSpan = findMatchingSpan(
        matcher,
        recordedItemsArray,
        context,
      )
      if (matchingSpan) {
        const attrs = matchingSpan.span.attributes
        if (attrs) {
          for (const key of rule.attributes) {
            if (key in attrs) promoted[key] = attrs[key]
          }
        }
      }
    }
  }
  return promoted
}

function isActiveTraceInput<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT,
  const VariantsT extends string,
>(
  input:
    | DraftTraceInput<RelationSchemasT[SelectedRelationNameT], VariantsT>
    | ActiveTraceInput<RelationSchemasT[SelectedRelationNameT], VariantsT>,
): input is ActiveTraceInput<
  RelationSchemasT[SelectedRelationNameT],
  VariantsT
> {
  return Boolean(input.relatedTo)
}

type ChildrenMap = Map<string, string[]>
type SpanMap<RelationSchemasT extends RelationSchemasBase<RelationSchemasT>> =
  ReadonlyMap<string, SpanAndAnnotation<RelationSchemasT>>

/**
 * @returns Map<parentId, childIds[]>
 */
function buildChildrenMap<
  const RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
>(spanMap: SpanMap<RelationSchemasT>): ChildrenMap {
  const kids = new Map<string, string[]>()

  for (const { span } of spanMap.values()) {
    const parent = span[PARENT_SPAN]
    if (!parent) continue

    const childrenIds = kids.get(parent.id) ?? []
    childrenIds.push(span.id)
    kids.set(parent.id, childrenIds)
  }
  return kids // O(n) time, O(n) memory
}

interface PropagationConfig<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
> {
  /** attribute keys that flow *downward* unless child overrides */
  heritableSpanAttributes?: readonly string[]
  /** stops errors bubbling *upward* if true */
  shouldSuppressErrorStatusPropagation: (
    spanAndAnnotation: SpanAndAnnotation<RelationSchemasT>,
  ) => boolean
}

export function propagateStatusAndAttributes<
  const RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
>(
  idToSpanAndAnnotationMap: SpanMap<RelationSchemasT>,
  children: ChildrenMap,
  cfg: PropagationConfig<RelationSchemasT>,
): void {
  // 1. build parent-before-child topological order
  const roots: string[] = []

  for (const { span } of idToSpanAndAnnotationMap.values()) {
    if (
      !span[PARENT_SPAN] ||
      !idToSpanAndAnnotationMap.has(span[PARENT_SPAN].id)
    )
      roots.push(span.id)
  }

  const topo: string[] = [] // DFS stack build
  const stack: string[] = [...roots]

  while (stack.length > 0) {
    const id = stack.pop()!
    topo.push(id)

    const kids = children.get(id)
    if (kids) {
      for (const cid of kids) stack.push(cid)
    }
  }

  if (cfg.heritableSpanAttributes) {
    // 2. push selected attributes downward (pre-order)
    const inherited = new Map<string, Record<string, unknown>>() // id → merged bag

    for (const id of topo) {
      const node = idToSpanAndAnnotationMap.get(id)
      if (!node) continue

      const parentHeritableAttributes = node.span[PARENT_SPAN]
        ? inherited.get(node.span[PARENT_SPAN].id)
        : undefined

      if (!parentHeritableAttributes && !node.span.attributes) {
        // no parent and no attributes, nothing to inherit
        continue
      }

      const heritableAttributes: Record<string, unknown> = {}
      for (const key of cfg.heritableSpanAttributes) {
        // child attribute wins over parent if defined,
        // unless it is literally the INHERIT_FROM_PARENT placeholder
        const childValue = node.span.attributes?.[key]
        const parentValue = parentHeritableAttributes?.[key]
        const value =
          childValue === INHERIT_FROM_PARENT
            ? parentValue
            : childValue ?? parentValue

        if (value !== undefined) {
          heritableAttributes[key] = value
        }
      }

      inherited.set(id, heritableAttributes)

      if (Object.keys(heritableAttributes).length > 0) {
        node.span.attributes = {
          ...heritableAttributes,
          ...node.span.attributes,
        }
      }
    }
  }

  // 3. bubble errors upward (post-order)
  for (let i = topo.length - 1; i >= 0; --i) {
    const id = topo[i]!
    const node = idToSpanAndAnnotationMap.get(id)!
    if (cfg.shouldSuppressErrorStatusPropagation(node)) {
      // skip this node, it should not propagate (bubble up) errors
      continue
    }
    const ownError = node.span.error ?? node.span.status === 'error'
    if (ownError) {
      continue
    }

    let childError: boolean | Error = false
    const kids = children.get(id)
    if (kids) {
      for (const childId of kids) {
        const child = idToSpanAndAnnotationMap.get(childId)!
        childError = child.span.error ?? child.span.status === 'error'
        if (childError) {
          break
        }
      }
    }

    if (childError) {
      node.span.status = 'error'
      if (!node.span.error && typeof childError === 'object')
        node.span.error = childError
    }
  }
}

export function createTraceRecording<
  const SelectedRelationNameT extends keyof RelationSchemasT,
  const RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  const VariantsT extends string,
>(
  context: TraceContext<SelectedRelationNameT, RelationSchemasT, VariantsT>,
  transition: FinalTransition<RelationSchemasT>,
): TraceRecording<SelectedRelationNameT, RelationSchemasT> {
  const { definition, recordedItems, input } = context
  const { id, relatedTo, variant, parentTraceId } = input
  const { name } = definition

  const {
    transitionToState,
    interruption,
    cpuIdleSpanAndAnnotation,
    completeSpanAndAnnotation,
    lastRequiredSpanAndAnnotation,
    lastRelevantSpanAndAnnotation,
  } = {
    cpuIdleSpanAndAnnotation: undefined,
    completeSpanAndAnnotation: undefined,
    lastRequiredSpanAndAnnotation: undefined,
    ...transition,
  }

  const endOfOperationSpan =
    (transitionToState === 'complete' &&
      (cpuIdleSpanAndAnnotation ?? completeSpanAndAnnotation)) ||
    lastRelevantSpanAndAnnotation

  const childrenMap = buildChildrenMap(recordedItems)

  const shouldSuppressErrorStatusPropagation = (
    spanAndAnnotation: SpanAndAnnotation<RelationSchemasT>,
  ) =>
    definition.suppressErrorStatusPropagationOnSpans?.some((doesSpanMatch) =>
      doesSpanMatch(spanAndAnnotation, context),
    ) ?? false

  // selected attributes (like `team`) should propagate to every child (unless set by the child)
  // and errors should bubble up to the parent (unless suppressed)
  propagateStatusAndAttributes(recordedItems, childrenMap, {
    heritableSpanAttributes: definition.heritableSpanAttributes,
    shouldSuppressErrorStatusPropagation,
  })

  const recordedItemsArray: SpanAndAnnotation<RelationSchemasT>[] = []
  const startSpanIdToFullDurationSpanMap = new Map<
    string,
    Span<RelationSchemasT>
  >()

  for (const item of recordedItems.values()) {
    if (item.span.startSpanId) {
      // if the item has a startSpan, it is the full span
      // we'll want to add the startSpan to the list, and exclude it from the recorded items
      // These startSpans are unnecessary, since the same information is present in the span that contains the duration
      startSpanIdToFullDurationSpanMap.set(item.span.startSpanId, item.span)
    }
    if (endOfOperationSpan) {
      // only keep items captured until the endOfOperationSpan or if not available, the lastRelevantSpan
      if (
        item.annotation.operationRelativeEndTime <=
        endOfOperationSpan.annotation.operationRelativeEndTime
      ) {
        recordedItemsArray.push(item)
      }
    } else {
      recordedItemsArray.push(item)
    }
  }

  // we need to re-parent any span that referred to a startSpanId that will be discarded
  for (const item of recordedItemsArray) {
    if (item.span[PARENT_SPAN]) {
      const newParent = startSpanIdToFullDurationSpanMap.get(
        item.span[PARENT_SPAN].id,
      )
      if (newParent) {
        item.span[PARENT_SPAN] = newParent
      }
    }
  }

  // CODE CLEAN UP TODO: let's get this information (wasInterrupted) from up top (in FinalState)
  const isIncompleteTrace = transitionToState === 'interrupted'
  const computedSpans = !isIncompleteTrace
    ? getComputedSpans(context, {
        completeSpanAndAnnotation,
        cpuIdleSpanAndAnnotation,
      })
    : {}
  const computedValues = !isIncompleteTrace ? getComputedValues(context) : {}
  const computedRenderBeaconSpans =
    !isIncompleteTrace && isActiveTraceInput(input)
      ? getComputedRenderBeaconSpans(recordedItemsArray, input)
      : {}

  let markTraceAsErrored = false
  let error: Error | undefined
  for (const spanAndAnnotation of recordedItemsArray) {
    if (
      spanAndAnnotation.span.status === 'error' &&
      !definition.suppressErrorStatusPropagationOnSpans?.some((doesSpanMatch) =>
        doesSpanMatch(spanAndAnnotation, context),
      )
    ) {
      markTraceAsErrored = true
      // eslint-disable-next-line prefer-destructuring
      error = spanAndAnnotation.span.error
      break
    }
  }

  // promote span attributes to trace attributes per configuration
  const promotedAttributes = promoteSpanAttributesForTrace(
    definition,
    recordedItemsArray,
    context,
  )
  const traceAttributes = { ...promotedAttributes, ...input.attributes }

  const duration =
    completeSpanAndAnnotation?.annotation.operationRelativeEndTime ?? null
  const startTillInteractive =
    cpuIdleSpanAndAnnotation?.annotation.operationRelativeEndTime ?? null
  const startTillRequirementsMet =
    lastRequiredSpanAndAnnotation?.annotation.operationRelativeEndTime ?? null

  const filteredRecordedItemsArray = recordedItemsArray.flatMap<
    RecordedSpanAndAnnotation<RelationSchemasT>
  >(
    // remove the currentTick attributes from the array
    ({ span: { getParentSpan: _, ...span }, annotation }) => {
      // exclude internalUse and spanIdsToDiscard
      const keep = !(
        // prettier-ignore
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        span.internalUse ||
          startSpanIdToFullDurationSpanMap.has(span.id)
      )
      // remove getParentSpan function

      if (keep) {
        return [
          {
            annotation,
            span: {
              ...span,
              // bake-in parentSpanId
              parentSpanId: span[PARENT_SPAN]?.id,
            },
          },
        ]
      }
      return []
    },
  )

  return {
    id,
    parentTraceId,
    name,
    startTime: input.startTime,
    relatedTo,
    type: 'operation',
    duration,
    variant,
    additionalDurations: {
      startTillRequirementsMet,
      startTillInteractive,
      // last entry until the tti?
      completeTillInteractive:
        startTillInteractive && duration
          ? startTillInteractive - duration
          : null,
    },
    // ?: If we have any error entries then should we mark the status as 'error'
    status: isIncompleteTrace
      ? 'interrupted'
      : markTraceAsErrored
      ? 'error'
      : 'ok',
    error,
    computedSpans,
    computedRenderBeaconSpans,
    computedValues,
    attributes: traceAttributes,
    interruption,
    entries: filteredRecordedItemsArray,
  }
}
