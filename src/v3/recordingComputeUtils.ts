/* eslint-disable no-continue */
import {
  ensureMatcherFn,
  ensureMatcherFnOrSpecialToken,
} from './ensureMatcherFn'
import { type SpanMatcherFn } from './matchSpan'
import type { SpanAndAnnotation } from './spanAnnotationTypes'
import type { ActiveTraceInput, DraftTraceInput } from './spanTypes'
import type { FinalTransition } from './Trace'
import type { TraceRecording } from './traceRecordingTypes'
import type {
  PromoteSpanAttributesDefinition,
  SpecialEndToken,
  SpecialStartToken,
  TraceContext,
} from './types'

/**
 * Helper function to find matching spans according to a matcher and matching index
 */
function findMatchingSpan<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT,
  VariantsT extends string,
>(
  matcher: SpanMatcherFn<SelectedRelationNameT, RelationSchemasT, VariantsT>,
  recordedItemsArray: SpanAndAnnotation<RelationSchemasT>[],
  context: TraceContext<SelectedRelationNameT, RelationSchemasT, VariantsT>,
): SpanAndAnnotation<RelationSchemasT> | undefined {
  // For positive or undefined indices - find with specified index offset
  if (
    !('matchingIndex' in matcher) ||
    matcher.matchingIndex === undefined ||
    matcher.matchingIndex >= 0
  ) {
    let matchCount = 0
    for (const spanAndAnnotation of recordedItemsArray) {
      if (matcher(spanAndAnnotation, context)) {
        if (
          matcher.matchingIndex === undefined ||
          matcher.matchingIndex === matchCount
        ) {
          return spanAndAnnotation
        }
        matchCount++
      }
    }
    return undefined
  }

  // For negative indices - iterate from the end
  // If matchingIndex is -1, we need the last match
  // If matchingIndex is -2, we need the second-to-last match, etc.
  const targetIndex = Math.abs(matcher.matchingIndex) - 1
  let matchCount = 0

  // Iterate from the end of the array
  // TODO: I'm wondering if we should sort recordedItemsArrayReversed by the end time...?
  // For that matter, should recordedItemsArray be sorted by their start time?
  // If yes, it might be good to do this in createTraceRecording and pass in both recordedItemsArray and recordedItemsArrayReversed pre-sorted, so we don't sort every time we need to calculate a computed span.
  for (let i = recordedItemsArray.length - 1; i >= 0; i--) {
    const spanAndAnnotation = recordedItemsArray[i]!
    if (matcher(spanAndAnnotation, context)) {
      if (matchCount === targetIndex) {
        return spanAndAnnotation
      }
      matchCount++
    }
  }

  return undefined
}

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
  RelationSchemasT,
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
  RelationSchemasT,
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
  RelationSchemasT,
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
      })
    } else {
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
  for (const [beaconName, spanTimes] of renderSpansByBeacon) {
    if (!spanTimes.firstContentfulRenderEnd) continue
    computedRenderBeaconSpans[beaconName] = {
      startOffset: spanTimes.firstStart - input.startTime.now,
      firstRenderTillContent:
        spanTimes.firstContentfulRenderEnd - spanTimes.firstStart,
      firstRenderTillLoading: spanTimes.firstLoadingEnd
        ? spanTimes.firstLoadingEnd - spanTimes.firstStart
        : 0,
      firstRenderTillData: spanTimes.firstContentStart
        ? spanTimes.firstContentStart - spanTimes.firstStart
        : 0,
      renderCount: spanTimes.renderCount,
      sumOfRenderDurations: spanTimes.sumOfDurations,
    }
  }

  return computedRenderBeaconSpans
}

/**
 * Find and promote span attributes to trace attributes per promoteSpanAttributes definition.
 */
function promoteSpanAttributesForTrace<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT,
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
    if (matcher.matchingIndex === undefined) {
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

export function createTraceRecording<
  const SelectedRelationNameT extends keyof RelationSchemasT,
  const RelationSchemasT,
  const VariantsT extends string,
>(
  context: TraceContext<SelectedRelationNameT, RelationSchemasT, VariantsT>,
  transition: FinalTransition<RelationSchemasT>,
): TraceRecording<SelectedRelationNameT, RelationSchemasT> {
  const { definition, recordedItems, input } = context
  const { id, relatedTo, variant } = input
  const { name } = definition

  const {
    transitionToState,
    interruptionReason,
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

  // only keep items captured until the endOfOperationSpan or if not available, the lastRelevantSpan
  const recordedItemsArray = endOfOperationSpan
    ? [...recordedItems].filter(
        (item) =>
          item.span.startTime.now + item.span.duration <=
          endOfOperationSpan.span.startTime.now +
            endOfOperationSpan.span.duration,
      )
    : [...recordedItems.values()]

  // CODE CLEAN UP TODO: let's get this information (wasInterrupted) from up top (in FinalState)
  const wasInterrupted = transitionToState === 'interrupted'
  const computedSpans = !wasInterrupted
    ? getComputedSpans(context, {
        completeSpanAndAnnotation,
        cpuIdleSpanAndAnnotation,
      })
    : {}
  const computedValues = !wasInterrupted ? getComputedValues(context) : {}
  const computedRenderBeaconSpans =
    !wasInterrupted && isActiveTraceInput(input)
      ? getComputedRenderBeaconSpans(recordedItemsArray, input)
      : {}

  const anyNonSuppressedErrors = recordedItemsArray.some(
    (spanAndAnnotation) =>
      spanAndAnnotation.span.status === 'error' &&
      !definition.suppressErrorStatusPropagationOnSpans?.some((doesSpanMatch) =>
        doesSpanMatch(spanAndAnnotation, context),
      ),
  )

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
  return {
    id,
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
    status: wasInterrupted
      ? 'interrupted'
      : anyNonSuppressedErrors
      ? 'error'
      : 'ok',
    computedSpans,
    computedRenderBeaconSpans,
    computedValues,
    attributes: traceAttributes,
    interruptionReason,
    entries: recordedItemsArray,
  }
}
