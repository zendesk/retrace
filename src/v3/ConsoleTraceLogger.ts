import type {
  AllPossibleRequiredSpanSeenEvents,
  AllPossibleStateTransitionEvents,
  AllPossibleTraceStartEvents,
} from './debugTypes'
import {
  extractTimingOffsets,
  formatMatcher,
  getConfigSummary,
  isSuppressedError,
} from './debugUtils'
import type { SpanMatcherFn } from './matchSpan'
import { createTraceRecording } from './recordingComputeUtils'
import type { FinalTransition, OnEnterStatePayload } from './Trace'
import { isTerminalState } from './Trace'
import type { TraceManager } from './TraceManager'
import type { DraftTraceContext, RelationSchemasBase } from './types'

// --- Basic ANSI Color Codes ---
const RESET = '\u001B[0m'
const YELLOW = '\u001B[33m' // Trace Start/End
const CYAN = '\u001B[36m' // State Changes
const MAGENTA = '\u001B[35m' // Span Matches
const GREEN = '\u001B[32m' // Success/Complete
const RED = '\u001B[31m' // Error/Interrupted
const GRAY = '\u001B[90m' // Timestamps, Verbose details

type SimpleLoggerFn = (message: string) => void
// Define a basic ConsoleLike interface for type checking
interface ConsoleLike {
  log: (...args: any[]) => void
  group: (...args: any[]) => void
  groupCollapsed: (...args: any[]) => void
  groupEnd: () => void
  // Add other console methods if needed (warn, error, etc.)
}

/**
 * Options for configuring the ConsoleTraceLogger
 */
export interface ConsoleTraceLoggerOptions {
  /**
   * The logging mechanism. Can be a console-like object (supporting .log, .group, etc.)
   * or a simple function that accepts a string message.
   * Defaults to the global `console` object.
   */
  logger?: ConsoleLike | SimpleLoggerFn
  /**
   * Whether to enable verbose logging with more details.
   * Defaults to false.
   */
  verbose?: boolean
  /**
   * Prefix added to all log messages.
   * Defaults to '[retrace]'.
   */
  prefix?: string
  /**
   * Maximum string length for attributes/relatedTo objects before truncation.
   * Defaults to 500.
   */
  maxObjectStringLength?: number
  /**
   * Enable console grouping (.group, .groupCollapsed, .groupEnd).
   * Only effective if the logger is a console-like object.
   * Defaults to true.
   */
  enableGrouping?: boolean
  /**
   * Enable ANSI color codes in the output.
   * Only effective if the logger is a console-like object.
   * Defaults to true.
   */
  enableColors?: boolean
}

const MAX_SERIALIZED_OBJECT_LENGTH = 500

/**
 * Information about an active or completed trace
 */
interface TraceInfo<_RelationSchemasT> {
  id: string
  name: string
  variant: string
  startTime: number
  attributes?: Record<string, unknown>
  relatedTo?: Record<string, unknown>
  requiredSpans: { name: string; isMatched: boolean; matcher: Function }[]
  parentTraceId?: string
  liveDuration: number
  totalSpanCount: number
  hasErrorSpan: boolean
  hasSuppressedErrorSpan: boolean
  definitionModifications: unknown[]
}

/**
 * Format timestamp to readable time
 */
const formatTimestamp = (timestamp: number): string =>
  new Date(timestamp).toISOString().split('T')[1]!.slice(0, -1)

/**
 * Check if two objects are different by comparing their JSON representation
 */
const objectsAreDifferent = (
  obj1?: Record<string, unknown>,
  obj2?: Record<string, unknown>,
): boolean => {
  if (!obj1 && !obj2) return false
  if (!obj1 || !obj2) return true
  // Simple comparison, consider deep equality for complex cases if needed
  try {
    return JSON.stringify(obj1) !== JSON.stringify(obj2)
  } catch {
    // Handle circular references or other stringify errors
    return true // Assume different if stringify fails
  }
}

/**
 * A utility for logging trace information
 */
export function createConsoleTraceLogger<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
>(
  traceManager: TraceManager<RelationSchemasT>,
  optionsInput: ConsoleTraceLoggerOptions = {},
) {
  // Use a mutable options object internally
  let options: Required<ConsoleTraceLoggerOptions> = {
    logger: console, // Default to global console
    verbose: false,
    prefix: '[retrace]',
    maxObjectStringLength: MAX_SERIALIZED_OBJECT_LENGTH,
    enableGrouping: true,
    enableColors: true,
    ...optionsInput, // Apply initial user options
  }

  // Determine logger type and capabilities based on current options
  let isConsoleLike =
    typeof options.logger !== 'function' && options.logger.group
  let canGroup = isConsoleLike && options.enableGrouping
  let canColor = isConsoleLike && options.enableColors

  // Keep track of active traces (Map allows multiple concurrent traces)
  const activeTraces = new Map<string, TraceInfo<RelationSchemasT>>()

  // Store subscriptions for cleanup
  const subscriptions: { unsubscribe: () => void }[] = []

  // --- Helper Functions ---

  /** Apply color codes if enabled */
  const colorize = (str: string, color: string): string =>
    canColor ? `${color}${str}${RESET}` : str

  /** Truncate objects to prevent huge logs */
  const truncateObject = (obj?: Record<string, unknown>): string => {
    if (!obj) return '{}' // Represent undefined/null as empty object string
    try {
      const str = JSON.stringify(obj)
      if (str.length <= options.maxObjectStringLength) return str
      return `${str.slice(
        0,
        Math.max(0, options.maxObjectStringLength - 3),
      )}...`
    } catch {
      return '{...}' // Indicate truncation due to error
    }
  }

  /** Log a message using the configured logger */
  const log = (
    message: string,
    level: 'log' | 'group' | 'groupCollapsed' | 'groupEnd' = 'log',
    ...args: unknown[]
  ) => {
    const fullMessage = `${options.prefix} ${message}`

    if (isConsoleLike) {
      const consoleLogger = options.logger as ConsoleLike
      switch (level) {
        case 'group':
          if (canGroup) consoleLogger.group(fullMessage, ...args)
          else consoleLogger.log(fullMessage, ...args)
          break
        case 'groupCollapsed':
          if (canGroup) consoleLogger.groupCollapsed(fullMessage, ...args)
          else consoleLogger.log(fullMessage, ...args)
          break
        case 'groupEnd':
          if (canGroup) consoleLogger.groupEnd()
          // No equivalent log message needed for simple loggers
          break
        default: // 'log'
          consoleLogger.log(fullMessage, ...args)
          break
      }
    } else {
      // Simple function logger
      const simpleLogger = options.logger as SimpleLoggerFn
      // Don't log the main message for groupEnd in simple mode
      if (!message.trim()) {
        // Avoid logging empty "[END GROUP]" lines
        return
      }
      simpleLogger(`${fullMessage}`)
    }
  }

  /** Format time relative to trace start */
  const formatRelativeTime = (offset?: number): string => {
    if (offset === undefined) return ''
    const formatted = `+${offset.toFixed(2)}ms`
    return colorize(formatted, GRAY)
  }

  /** Get string representation of required spans count */
  const getRequiredSpansCount = (
    traceInfo: TraceInfo<RelationSchemasT>,
  ): string => {
    const matched = traceInfo.requiredSpans.filter(
      (span) => span.isMatched,
    ).length
    const total = traceInfo.requiredSpans.length
    return `${matched}/${total}`
  }

  /** Create a required span entry from a matcher function */
  const createRequiredSpanEntry = (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    matcher: SpanMatcherFn<any, RelationSchemasT, any>,
    index: number,
  ): TraceInfo<RelationSchemasT>['requiredSpans'][0] => {
    // Use the utility if available, otherwise fallback
    const name = formatMatcher(matcher, index)
    return { name, matcher, isMatched: false }
  }

  /** Handle changes in attributes, relatedTo, or requiredSpans */
  const handleStateChanges = <K extends keyof RelationSchemasT>(
    trace: DraftTraceContext<K, RelationSchemasT, string>,
    traceInfo: TraceInfo<RelationSchemasT>,
  ): void => {
    const currentAttributes = trace.input.attributes
    if (objectsAreDifferent(currentAttributes, traceInfo.attributes)) {
      log(
        `   Attributes changed: ${colorize(
          truncateObject(currentAttributes),
          GRAY,
        )}`,
      )
      // eslint-disable-next-line no-param-reassign
      traceInfo.attributes = currentAttributes
        ? { ...currentAttributes }
        : undefined
    }

    const currentRelatedTo = trace.input.relatedTo
    if (objectsAreDifferent(currentRelatedTo, traceInfo.relatedTo)) {
      log(
        `   Related to changed: ${colorize(
          truncateObject(currentRelatedTo),
          GRAY,
        )}`,
      )
      // eslint-disable-next-line no-param-reassign
      traceInfo.relatedTo = currentRelatedTo
        ? { ...currentRelatedTo }
        : undefined
    }

    // Note: Required spans list doesn't change after trace start in current model
    // If variants could change requiredSpans, this would need updating.
  }

  /** Log timing information for a terminal state */
  const logTimingInfo = (
    transition: OnEnterStatePayload<RelationSchemasT>,
    traceInfo: TraceInfo<RelationSchemasT>,
  ) => {
    const { lastRequiredSpanOffset, completeSpanOffset, cpuIdleSpanOffset } =
      extractTimingOffsets(transition)

    const duration = completeSpanOffset ?? lastRequiredSpanOffset // Best guess at total duration
    if (duration !== undefined) {
      log(`   Duration: ${formatRelativeTime(duration)}`)
    }
    if (lastRequiredSpanOffset !== undefined) {
      log(
        `   Last required span: ${formatRelativeTime(lastRequiredSpanOffset)}`,
      )
    }
    if (
      completeSpanOffset !== undefined &&
      completeSpanOffset !== lastRequiredSpanOffset
    ) {
      // Only log if different from LRS
      log(`   Complete span: ${formatRelativeTime(completeSpanOffset)}`)
    }
    if (cpuIdleSpanOffset !== undefined) {
      log(`   CPU idle: ${formatRelativeTime(cpuIdleSpanOffset)}`)
    }

    log(`   Required spans: ${getRequiredSpansCount(traceInfo)} spans matched`)
  }

  // Event handlers
  // --------------

  /**
   * Handle trace start event
   */
  const handleTraceStart = (
    event: AllPossibleTraceStartEvents<RelationSchemasT>,
  ) => {
    const trace = event.traceContext
    const traceName = trace.definition.name
    const traceVariant = trace.input.variant
    const traceId = trace.input.id

    const requiredSpans = trace.definition.requiredSpans.map((matcher, index) =>
      createRequiredSpanEntry(matcher, index),
    )

    const traceInfo: TraceInfo<RelationSchemasT> = {
      id: traceId,
      name: traceName,
      variant: traceVariant,
      startTime: trace.input.startTime.epoch,
      attributes: trace.input.attributes
        ? { ...trace.input.attributes }
        : undefined,
      relatedTo: trace.input.relatedTo
        ? { ...trace.input.relatedTo }
        : undefined,
      requiredSpans,
      parentTraceId: trace.input.parentTraceId,
      liveDuration: 0,
      totalSpanCount: 0,
      hasErrorSpan: false,
      hasSuppressedErrorSpan: false,
      definitionModifications: [],
    }

    // Store the trace info
    activeTraces.set(traceId, traceInfo)

    const startTimeStr = formatTimestamp(traceInfo.startTime)
    const isChild = !!traceInfo.parentTraceId
    const tracePrefix = isChild ? '↳ Child trace started:' : '⏳ Trace started:'

    log(
      `${colorize(
        tracePrefix,
        YELLOW,
      )} ${traceName} (${traceVariant}) [${colorize(traceId, GRAY)}]${
        isChild ? ` parent: ${colorize(traceInfo.parentTraceId!, GRAY)}` : ''
      }`,
      'groupCollapsed', // Start collapsed for tidiness
    )
    log(`   Started at: ${colorize(startTimeStr, GRAY)}`)
    if (traceInfo.attributes && Object.keys(traceInfo.attributes).length > 0) {
      log(
        `   Attributes: ${colorize(
          truncateObject(traceInfo.attributes),
          GRAY,
        )}`,
      )
    }
    if (traceInfo.relatedTo && Object.keys(traceInfo.relatedTo).length > 0) {
      log(
        `   Related to: ${colorize(truncateObject(traceInfo.relatedTo), GRAY)}`,
      )
    }
    log(`   Required spans: ${requiredSpans.length}`)
    // Log config summary
    const { timeout, debounce, interactive } = getConfigSummary(trace)
    log(
      `   Config: Timeout=${timeout}ms, Debounce=${debounce}ms${
        interactive ? `, Interactive=${interactive}ms` : ''
      }`,
    )
    // Log computed definitions
    const computedSpans = Object.keys(
      trace.definition.computedSpanDefinitions ?? {},
    )
    const computedValues = Object.keys(
      trace.definition.computedValueDefinitions ?? {},
    )
    if (computedSpans.length > 0)
      log(`   Computed Spans: ${computedSpans.join(', ')}`)
    if (computedValues.length > 0)
      log(`   Computed Values: ${computedValues.join(', ')}`)
    log('', 'groupEnd') // Close the initial group immediately
  }

  /**
   * Handle state transition event
   */
  const handleStateTransition = (
    event: AllPossibleStateTransitionEvents<RelationSchemasT>,
  ) => {
    const { traceContext: trace, stateTransition: transition } = event
    const traceId = trace.input.id
    const traceInfo = activeTraces.get(traceId)

    if (!traceInfo) return // Should not happen if trace started

    const traceName = traceInfo.name
    const previousState = transition.transitionFromState
    const traceState = transition.transitionToState

    const groupLevel = options.verbose ? 'group' : 'groupCollapsed'
    // Add live duration, span count, and error indicator
    const liveInfo = [
      traceInfo.liveDuration ? `(+${traceInfo.liveDuration}ms elapsed)` : '',
      traceInfo.totalSpanCount ? `(Spans: ${traceInfo.totalSpanCount})` : '',
      traceInfo.hasErrorSpan
        ? colorize('❗', RED)
        : traceInfo.hasSuppressedErrorSpan
        ? colorize('❗(suppressed)', RED)
        : '',
      traceInfo.definitionModifications.length > 0
        ? colorize('🔧', MAGENTA)
        : '',
    ]
      .filter(Boolean)
      .join(' ')
    log(
      `${colorize(
        '↪️ Trace',
        CYAN,
      )} ${traceName} state changed: ${previousState} → ${colorize(
        traceState,
        CYAN,
      )} ${liveInfo}`,
      groupLevel,
    )

    // Log changes that occurred *during* this state
    handleStateChanges(trace, traceInfo)

    if (isTerminalState(traceState)) {
      // Create full trace recording to get comprehensive results
      let traceRecording
      try {
        traceRecording = createTraceRecording(
          trace,
          transition as FinalTransition<RelationSchemasT>,
        )
      } catch (error) {
        log(`   Failed to create trace recording: ${error}`)
      }

      if (traceState === 'complete') {
        log(
          colorize(
            `${
              traceRecording?.status === 'error' ? '❗' : '✅'
            } Trace ${traceName} complete`,
            traceRecording?.status === 'error' ? RED : GREEN,
          ),
        )

        // Show error if present
        if (traceRecording?.error) {
          log(`   ${colorize('Error:', RED)} %o`, 'log', traceRecording.error)
        }

        logTimingInfo(transition, traceInfo)

        // Log computed results from trace recording
        if (traceRecording) {
          const { computedValues, computedSpans, computedRenderBeaconSpans } =
            traceRecording

          if (computedValues && Object.keys(computedValues).length > 0) {
            log(
              `   Computed Values: ${Object.entries(computedValues)
                .map(([k, v]) => `${k}=${v}`)
                .join(', ')}`,
            )
          }

          if (computedSpans && Object.keys(computedSpans).length > 0) {
            log(
              `   Computed Spans: ${Object.entries(computedSpans)
                .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
                .join(', ')}`,
            )
          }

          if (
            computedRenderBeaconSpans &&
            Object.keys(computedRenderBeaconSpans).length > 0
          ) {
            log(`   Render Beacon Spans:`)
            Object.entries(computedRenderBeaconSpans).forEach(
              ([name, data]) => {
                log(
                  `     ${name}: ${
                    data.renderCount
                  } renders, ${data.firstRenderTillContent.toFixed(
                    2,
                  )}ms till content`,
                )
              },
            )
          }
        }
      } else {
        // interrupted
        const {
          interruption: { reason: interruptionReason, ...interruptionMeta },
        } = transition as Extract<typeof transition, { interruption: unknown }>

        const statusIndicator =
          traceRecording?.status === 'error'
            ? colorize('❌❗', RED) // Double error indicator
            : colorize('❌', RED)

        log(
          `${statusIndicator} Trace ${traceName} interrupted (${colorize(
            interruptionReason,
            RED,
          )}, %o)`,
          'log',
          interruptionMeta,
        )

        // Show trace error if present
        if (traceRecording?.error) {
          log(
            `   ${colorize('Trace Error:', RED)} %o`,
            'log',
            traceRecording.error,
          )
        }

        logTimingInfo(transition, traceInfo)

        // Log computed results from trace recording (even for interrupted traces)
        if (traceRecording) {
          const { computedValues, computedSpans, computedRenderBeaconSpans } =
            traceRecording

          if (computedValues && Object.keys(computedValues).length > 0) {
            log(
              `   Computed Values: ${Object.entries(computedValues)
                .map(([k, v]) => `${k}=${v}`)
                .join(', ')}`,
            )
          }

          if (computedSpans && Object.keys(computedSpans).length > 0) {
            log(
              `   Computed Spans: ${Object.entries(computedSpans)
                .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
                .join(', ')}`,
            )
          }

          if (
            computedRenderBeaconSpans &&
            Object.keys(computedRenderBeaconSpans).length > 0
          ) {
            log(`   Render Beacon Spans:`)
            Object.entries(computedRenderBeaconSpans).forEach(
              ([name, data]) => {
                log(
                  `     ${name}: ${
                    data.renderCount
                  } renders, ${data.firstRenderTillContent.toFixed(
                    2,
                  )}ms till content`,
                )
              },
            )
          }
        }
      }
      // Remove trace from active map on terminal state
      activeTraces.delete(traceId)
    }

    log('', 'groupEnd') // End the group for this transition
  }

  /**
   * Handle required span seen event
   */
  const handleRequiredSpanSeen = (
    event: AllPossibleRequiredSpanSeenEvents<RelationSchemasT>,
  ) => {
    const {
      traceContext: trace,
      spanAndAnnotation: matchedSpan,
      matcher,
    } = event
    const traceId = trace.input.id
    const traceInfo = activeTraces.get(traceId)

    if (!traceInfo) return

    // Find and update the matched span in our info
    const requiredSpanEntry = traceInfo.requiredSpans.find(
      (s) => s.matcher === matcher,
    )
    if (requiredSpanEntry && !requiredSpanEntry.isMatched) {
      requiredSpanEntry.isMatched = true
    }

    const name = requiredSpanEntry?.name ?? formatMatcher(matcher) // Use formatted name

    const groupLevel = options.verbose ? 'group' : 'log' // Only group if verbose
    log(
      `${colorize(
        '🔹 Matched required span:',
        MAGENTA,
      )} ${name} (${getRequiredSpansCount(traceInfo)} spans matched)`,
      groupLevel,
    )

    if (options.verbose) {
      const relativeTime = formatRelativeTime(
        matchedSpan.annotation.operationRelativeStartTime,
      )
      log(`   At time: ${relativeTime}`)
      if (matchedSpan.span.name) {
        log(
          `   Span name / type: ${matchedSpan.span.name} / ${matchedSpan.span.type}`,
        )
      }
      if (
        matchedSpan.span.attributes &&
        Object.keys(matchedSpan.span.attributes).length > 0
      ) {
        log(
          `   Span Attributes: ${colorize(
            truncateObject(matchedSpan.span.attributes),
            GRAY,
          )}`,
        )
      }
      if (
        matchedSpan.span.relatedTo &&
        Object.keys(matchedSpan.span.relatedTo).length > 0
      ) {
        log(
          `   Span RelatedTo: ${colorize(
            truncateObject(matchedSpan.span.relatedTo),
            GRAY,
          )}`,
        )
      }
      if (groupLevel === 'group') log('', 'groupEnd') // Close group if we opened one
    }
  }

  // Set up event subscriptions
  // --------------------------

  // Subscribe to trace start events
  const traceStartSubscription = traceManager
    .when('trace-start')
    .subscribe(handleTraceStart)
  subscriptions.push(traceStartSubscription)

  // Subscribe to state transition events
  const stateTransitionSubscription = traceManager
    .when('state-transition')
    .subscribe(handleStateTransition)
  subscriptions.push(stateTransitionSubscription)

  // Subscribe to required span seen events
  const spanSeenSubscription = traceManager
    .when('required-span-seen')
    .subscribe(handleRequiredSpanSeen)
  subscriptions.push(spanSeenSubscription)

  // Subscribe to add-span-to-recording events for live updates
  const addSpanSub = traceManager
    .when('add-span-to-recording')
    .subscribe((event) => {
      const trace = event.traceContext
      const traceId = trace.input.id
      const traceInfo = activeTraces.get(traceId)
      if (!traceInfo) return

      // Calculate live info from traceContext
      const entries = [...trace.recordedItems.values()]
      traceInfo.liveDuration =
        entries.length > 0
          ? Math.round(
              Math.max(
                ...entries.map((e) => e.span.startTime.epoch + e.span.duration),
              ) - trace.input.startTime.epoch,
            )
          : 0
      traceInfo.totalSpanCount = entries.length
      traceInfo.hasErrorSpan = entries.some(
        (e) => e.span.status === 'error' && !isSuppressedError(trace, e),
      )
      traceInfo.hasSuppressedErrorSpan = entries.some(
        (e) => e.span.status === 'error' && isSuppressedError(trace, e),
      )
      // Log error if this span is error
      if (event.spanAndAnnotation.span.status === 'error') {
        const suppressed = isSuppressedError(trace, event.spanAndAnnotation)

        log(
          `${colorize('❗ Error span', RED)} '${
            event.spanAndAnnotation.span.name
          }' seen${suppressed ? ' (suppressed)' : ''} %o`,
          'log',
          event.spanAndAnnotation,
        )
      }
    })
  subscriptions.push(addSpanSub)

  // Subscribe to definition-modified events
  const defModSub = traceManager
    .when('definition-modified')
    .subscribe((event) => {
      const trace = event.traceContext
      const traceId = trace.input.id
      const traceInfo = activeTraces.get(traceId)
      if (!traceInfo) return

      traceInfo.definitionModifications.push(event.modifications)
      log(
        `${colorize('🔧 Definition modified', MAGENTA)}: ${Object.keys(
          event.modifications,
        ).join(', ')}`,
      )
    })
  subscriptions.push(defModSub)

  // Return API for the logger
  return {
    getActiveTraces: () => new Map(activeTraces), // Return copy of active traces

    // Allow changing options
    setOptions: (newOptions: Partial<ConsoleTraceLoggerOptions>) => {
      // Update the internal mutable options object
      options = { ...options, ...newOptions }

      // Re-evaluate derived flags after updating options
      isConsoleLike =
        typeof options.logger !== 'function' && options.logger.group
      canGroup = isConsoleLike && options.enableGrouping
      canColor = isConsoleLike && options.enableColors
    },

    // Cleanup method to unsubscribe from all trace events
    cleanup: () => {
      subscriptions.forEach((subscription) => void subscription.unsubscribe())
      subscriptions.length = 0 // Clear the array
      activeTraces.clear() // Clear all active traces
      // Optional: Log cleanup only if verbose or specifically configured?
      // log('ConsoleTraceLogger unsubscribed from all events')
    },
  }
}
