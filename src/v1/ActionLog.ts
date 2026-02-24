/* eslint-disable no-underscore-dangle */
/**
 * Copyright Zendesk, Inc.
 *
 * Use of this source code is governed under the Apache License, Version 2.0
 * found at http://www.apache.org/licenses/LICENSE-2.0.
 */

import type { DependencyList } from 'react'
import {
  ACTION_TYPE,
  DEFAULT_DEBOUNCE_MS,
  DEFAULT_LOADING_STAGES,
  DEFAULT_TIMEOUT_MS,
  ERROR_STAGES,
  INFORMATIVE_STAGES,
  MARKER,
  OBSERVER_SOURCE,
} from './constants'
import type { DebounceOptionsRef, FlushReason } from './debounce'
import { debounce, TimeoutReason } from './debounce'
import { performanceMark, performanceMeasure } from './performanceMark'
import type {
  Action,
  ActionWithStateMetadata,
  DynamicActionLogOptions,
  ReportArguments,
  ReportFnV1,
  ShouldResetOnDependencyChange,
  SpanAction,
  StageChangeAction,
  StaticActionLogOptions,
  WithOnInternalError,
} from './types'
import type { DistributiveOmit } from './typescriptHelpers'
import {
  every,
  getCurrentBrowserSupportForNonResponsiveStateDetection,
  noop,
} from './utilities'

const NO_IMMEDIATE_SEND_STAGES = [] as const
const NO_FINAL_STAGES = [] as const

export class ActionLog<CustomMetadata extends Record<string, unknown>> {
  private actions: ActionWithStateMetadata[] = []
  private onActionAddedCallback:
    | ((actionLog: ActionLog<CustomMetadata>) => void)
    | undefined = undefined

  private lastStage: string = INFORMATIVE_STAGES.INITIAL
  private lastStageUpdatedAt = performance.now()

  private get lastStageEntry(): PerformanceEntry | undefined {
    const lastStageChangeEntry = this.lastStageChange?.entry
    if (lastStageChangeEntry) return lastStageChangeEntry
    const lastRenderEntry = this.actions.find(
      (action) => action.type === ACTION_TYPE.RENDER,
    )?.entry
    return lastRenderEntry?.startMark ?? lastRenderEntry
  }
  private lastStageBySource: Map<string, string> = new Map()

  finalStages: readonly string[] = NO_FINAL_STAGES
  loadingStages: readonly string[] = DEFAULT_LOADING_STAGES
  immediateSendReportStages: readonly string[] = NO_IMMEDIATE_SEND_STAGES

  private dependenciesBySource: Map<string, DependencyList> = new Map()
  private hasReportedAtLeastOnce = false
  private flushUponDeactivation = false

  customMetadataBySource: Map<string, CustomMetadata> = new Map()
  reportedErrors: WeakSet<object> = new WeakSet()

  /**
   * Returns the PerformanceEntry from the last render, or undefined if no render has completed.
   * Enables verifying whether timing beacons have rendered even outside the scope of the timingHook.
   */
  getLastRenderedActionEntry(): PerformanceEntry | undefined {
    return this.actions.find((action) => action.type === ACTION_TYPE.RENDER)
      ?.entry
  }

  getActions(): ActionWithStateMetadata[] {
    return this.actions
  }

  /**
   * Clear performance marks that were added by this ActionLog instance.
   */
  private clearPerformanceMarks(): void {
    this.actions.forEach((action) => {
      if (!action.entry.name) return
      try {
        if (action.entry instanceof PerformanceMeasure) {
          performance.clearMeasures(action.entry.name)
        }
      } catch {
        // ignore
      }
    })
  }

  /**
   * Clear parts of the internal state, so it's ready for the next measurement.
   */
  clear(): void {
    if (this.willFlushTimeout) {
      clearTimeout(this.willFlushTimeout)
      this.willFlushTimeout = undefined

      // flush immediately
      this.debouncedTrigger.flush('clear')
    } else {
      this.debouncedTrigger.cancel()
    }
    this.stopObserving()
    this.clearPerformanceMarks()
    this.actions = []
    this.lastStage = INFORMATIVE_STAGES.INITIAL
    this.lastStageUpdatedAt = performance.now()
    this.lastStageBySource.clear()
  }

  /**
   * Complete reset of internal state,
   * except for configuration options which are always updated on render.
   */
  reset(): void {
    this.debouncedTrigger.reset()
    this.clear()
    this.ensureReporting()
    this.hasReportedAtLeastOnce = false
    this.placementsCurrentlyRenderable.clear()
  }

  private reportFn: ReportFnV1<CustomMetadata> = noop

  private shouldResetOnDependencyChangeFnBySource: Map<
    string,
    ShouldResetOnDependencyChange
  > = new Map()

  private id = 'default'

  wasImported = false

  onInternalError: Required<
    WithOnInternalError<CustomMetadata>
  >['onInternalError'] =
    // only a default, to be overridden in usage
    // eslint-disable-next-line no-console
    console.error

  private minimumExpectedSimultaneousBeacons?: number

  private placementsCurrentlyRenderable = new Set<string>()

  private waitForBeaconActivation: readonly string[] = []

  get isInUse(): boolean {
    return this.placementsCurrentlyRenderable.size > 0
  }

  getId(): string {
    return this.id
  }

  constructor(options: StaticActionLogOptions<string, CustomMetadata>) {
    this.updateStaticOptions(options)
  }

  updateStaticOptions({
    debounceMs,
    timeoutMs,
    finalStages,
    loadingStages,
    immediateSendReportStages,
    minimumExpectedSimultaneousBeacons,
    waitForBeaconActivation,
    flushUponDeactivation,
    reportFn,
    onActionAddedCallback,
    onInternalError,
  }: StaticActionLogOptions<string, CustomMetadata>): void {
    if (typeof minimumExpectedSimultaneousBeacons === 'number') {
      this.minimumExpectedSimultaneousBeacons =
        minimumExpectedSimultaneousBeacons
    }
    if (onInternalError) this.onInternalError = onInternalError
    if (reportFn) this.reportFn = reportFn
    if (onActionAddedCallback) {
      this.onActionAddedCallback = onActionAddedCallback
    }

    this.debounceOptionsRef.debounceMs = debounceMs ?? DEFAULT_DEBOUNCE_MS
    this.debounceOptionsRef.timeoutMs = timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.finalStages = finalStages ?? NO_FINAL_STAGES
    this.loadingStages = loadingStages ?? DEFAULT_LOADING_STAGES
    this.immediateSendReportStages =
      immediateSendReportStages ?? NO_IMMEDIATE_SEND_STAGES
    this.flushUponDeactivation = flushUponDeactivation ?? false
    this.waitForBeaconActivation = waitForBeaconActivation ?? []
  }

  /**
   * Use to import internal state from another ActionLog instance.
   */
  importState(otherLog: ActionLog<CustomMetadata>): void {
    this.hasReportedAtLeastOnce =
      this.hasReportedAtLeastOnce || otherLog.hasReportedAtLeastOnce
    if (this.reportFn === noop) this.reportFn = otherLog.reportFn
    if (!this.onInternalError) this.onInternalError = otherLog.onInternalError
    if (
      otherLog.lastStage !== INFORMATIVE_STAGES.INITIAL &&
      otherLog.lastStageUpdatedAt > this.lastStageUpdatedAt
    ) {
      this.lastStage = otherLog.lastStage
      this.lastStageUpdatedAt = otherLog.lastStageUpdatedAt
    }
    otherLog.lastStageBySource.forEach((stage, source) => {
      this.lastStageBySource.set(source, stage)
    })
    otherLog.dependenciesBySource.forEach((dependencies, source) => {
      this.dependenciesBySource.set(source, dependencies)
    })
    otherLog.placementsCurrentlyRenderable.forEach((placement) => {
      this.placementsCurrentlyRenderable.add(placement)
    })
    otherLog.shouldResetOnDependencyChangeFnBySource.forEach(
      (shouldResetOnDependencyChangeFn, source) => {
        this.shouldResetOnDependencyChangeFnBySource.set(
          source,
          shouldResetOnDependencyChangeFn,
        )
      },
    )
    otherLog.actions.forEach((action) => {
      this.insertActionInOrder(action)
    })
    this.onActionAdded()
    otherLog.setAsImported()
  }

  setAsImported(): void {
    this.wasImported = true
    this.debouncedTrigger.reset()
    this.clear()
    this.disableReporting()
    this.dispose()
  }

  updateOptions(
    {
      id,
      reportFn,
      shouldResetOnDependencyChangeFn,
      onInternalError,
      onActionAddedCallback,
    }: DynamicActionLogOptions<CustomMetadata>,
    source: string,
  ): void {
    // any source can change the ID
    this.id = id

    if (onInternalError) this.onInternalError = onInternalError
    if (reportFn) this.reportFn = reportFn

    if (shouldResetOnDependencyChangeFn) {
      this.shouldResetOnDependencyChangeFnBySource.set(
        source,
        shouldResetOnDependencyChangeFn,
      )
    }
    if (onActionAddedCallback) {
      this.onActionAddedCallback = onActionAddedCallback
    }
  }

  /**
   * Inserts an action while maintaining order
   * @returns {boolean} true when inserted at the very end of actions
   */
  private insertActionInOrder(action: ActionWithStateMetadata): boolean {
    const insertBeforeIndex = this.actions.findIndex(
      (a) => a.timestamp > action.timestamp,
    )
    // do not insert unresponsive tasks as first in order, cause they could have started before the actual render
    const index =
      action.type === ACTION_TYPE.UNRESPONSIVE && insertBeforeIndex === 0
        ? 1
        : insertBeforeIndex

    this.actions.splice(index === -1 ? this.actions.length : index, 0, action)

    return index === -1
  }

  addSpan(info: DistributiveOmit<SpanAction, 'timestamp' | 'marker'>): void {
    this.addAction(
      {
        ...info,
        marker: MARKER.START,
        timestamp: info.entry.startTime,
      },
      {
        ...info,
        marker: MARKER.END,
        timestamp: info.entry.startTime + info.entry.duration,
      },
    )
  }

  addAction(...actions: Action[]): void {
    if (!this.isCapturingData) return
    actions.forEach((action) => {
      this.insertActionInOrder({
        ...action,
        mountedPlacements: [...this.placementsCurrentlyRenderable],
        timingId: this.id,
      })
    })
    this.onActionAdded()
  }

  private addStageChange(
    info: Omit<StageChangeAction, 'type' | 'marker' | 'entry' | 'timestamp'>,
    previousStage: string = INFORMATIVE_STAGES.INITIAL,
  ) {
    const { stage, renderEntry } = info
    const previousStageEntry = this.lastStageEntry
    const measureName = previousStageEntry
      ? `${this.id}/${info.source}/${previousStage}-till-${stage}`
      : `${this.id}/${info.source}/start-${stage}`

    const entry = previousStageEntry
      ? performanceMeasure(measureName, previousStageEntry, renderEntry)
      : performanceMark(measureName, { startTime: renderEntry?.startTime })

    this.addAction({
      ...info,
      type: ACTION_TYPE.STAGE_CHANGE,
      marker: MARKER.POINT,
      entry: Object.assign(entry, { startMark: previousStageEntry }),
      timestamp: entry.startTime + entry.duration,
    })
  }

  private willFlushTimeout?: ReturnType<typeof setTimeout>

  private onActionAdded(): void {
    this.onActionAddedCallback?.(this)
    if (this.isInImmediateSendStage) {
      this.stopObserving()
      if (this.willFlushTimeout) return
      // we want to wait till the next frame in case the render completes
      // if an error is thrown, the component will unmount and we have a more complete picture
      this.willFlushTimeout = setTimeout(() => {
        this.willFlushTimeout = undefined
        this.debouncedTrigger.flush('immediate send')
      }, 0)
    } else {
      this.observe()
      this.debouncedTrigger()
    }
  }

  get lastStageChange(): StageChangeAction | undefined {
    for (let i = this.actions.length - 1; i >= 0; i--) {
      const action = this.actions[i]

      if (action && action.type === ACTION_TYPE.STAGE_CHANGE) return action
    }

    return undefined
  }

  markStage(
    info: Omit<StageChangeAction, 'type' | 'marker' | 'timestamp' | 'entry'>,
  ): void {
    const { stage, source } = info

    const previousStageForThisSource = this.lastStageBySource.get(source)

    // we don't want different beacons racing with one another with re-renders and switching stages
    if (previousStageForThisSource === stage) return

    const previousStage = this.lastStage

    this.lastStage = stage
    this.lastStageUpdatedAt = performance.now()
    this.lastStageBySource.set(source, stage)

    if (!this.isInFinalStage) {
      // we might have just moved back from a final stage to a non-final one
      // in such case, ensure reporting is enabled and reset state:
      this.ensureReporting()
    }

    if (!this.isCapturingData) return

    if (previousStage !== stage || this.actions.length === 0) {
      this.addStageChange(
        info,
        this.actions.length === 0 ? INFORMATIVE_STAGES.INITIAL : previousStage,
      )
    }
  }

  private _shouldReport = true

  get shouldReport(): boolean {
    return this._shouldReport
  }

  ensureReporting(): void {
    if (this._shouldReport) return

    // should enable reporting if not in final stage!
    this._shouldReport = true
    // and starting from scratch:
    this.clear()
  }

  disableReporting(): void {
    this._shouldReport = false
  }

  private observer =
    typeof PerformanceObserver !== 'undefined' &&
    new PerformanceObserver((entryList: PerformanceObserverEntryList) => {
      if (!this.isCapturingData) return

      const entries = entryList.getEntries()

      for (const entry of entries) {
        this.addSpan({
          type: ACTION_TYPE.UNRESPONSIVE,
          source: OBSERVER_SOURCE,
          entry,
        })
      }
    })

  private _isObserving = false

  get isObserving(): boolean {
    return this._isObserving
  }

  private observe(): void {
    // this is a no-op on browsers that don't support 'longtask',
    // but let's guard anyway:
    if (
      this.observer &&
      getCurrentBrowserSupportForNonResponsiveStateDetection() &&
      !this.isObserving
    ) {
      this.observer.observe({ entryTypes: ['longtask'] })
      this._isObserving = true
    }
  }

  stopObserving(): void {
    if (!this._isObserving || !this.observer) return
    this.observer.disconnect()
    this._isObserving = false
  }

  private isCapturingDataBySource: Map<string, boolean> = new Map()

  onBeaconRemoved(source: string): void {
    this.isCapturingDataBySource.delete(source)
    this.dependenciesBySource.delete(source)
    this.shouldResetOnDependencyChangeFnBySource.delete(source)
    this.placementsCurrentlyRenderable.delete(source)
    if (!this.isInUse) this.dispose()
  }

  private dispose() {
    this.onDisposeCallbacks.forEach((callback) => void callback())
  }

  private onDisposeCallbacks = new Map<string, () => void>()

  /**
   * schedule action to be called once the ActionLog is no longer used
   * @param callback
   */
  onDispose(name: string, callback: () => void): void {
    this.onDisposeCallbacks.set(name, callback)
  }

  get isCapturingData(): boolean {
    // if at least one source is inactive, all of reporting is inactive
    return (
      this.shouldReport &&
      this.isCapturingDataBySource.size > 0 &&
      this.waitForBeaconActivation.every((placement) =>
        this.placementsCurrentlyRenderable.has(placement),
      ) &&
      every(this.isCapturingDataBySource.values(), Boolean)
    )
  }

  setActive(active: boolean, source: string): void {
    this.placementsCurrentlyRenderable.add(source)
    const wasActive = this.isCapturingData
    const newlyDeactivated = wasActive !== active && !active

    if (
      this.flushUponDeactivation &&
      newlyDeactivated &&
      this.lastStage !== INFORMATIVE_STAGES.INITIAL
    ) {
      // flush any previous measurements
      this.debouncedTrigger.flush('deactivation')
    }

    this.isCapturingDataBySource.set(source, active)
    const { isCapturingData } = this

    const newlyActivated = wasActive !== isCapturingData && isCapturingData

    if (newlyActivated) {
      // clear state upon activation
      this.clear()
    }
  }

  get isInFinalStage(): boolean {
    return (
      this.finalStages.every((stage) => ERROR_STAGES.includes(stage)) ||
      this.finalStages.includes(this.lastStage)
    )
  }

  get isInImmediateSendStage(): boolean {
    return (
      ERROR_STAGES.includes(this.lastStage) ||
      this.immediateSendReportStages.includes(this.lastStage)
    )
  }

  private getRenderedCountBySource(sourceToFilterBy: string): number {
    return this.actions.filter(
      ({ type, marker, source }) =>
        source === sourceToFilterBy &&
        type === ACTION_TYPE.RENDER &&
        marker === MARKER.END,
    ).length
  }

  private get lastRenderAction(): ActionWithStateMetadata | undefined {
    return [...this.actions]
      .reverse()
      .find(({ type }) => type === ACTION_TYPE.RENDER)
  }

  private markDependencyChange(mark: PerformanceMark, source: string): void {
    this.addAction({
      type: ACTION_TYPE.DEPENDENCY_CHANGE,
      entry: mark,
      timestamp: mark.startTime,
      marker: MARKER.POINT,
      source,
    })
  }

  onExternalDependenciesChange(
    newDependencies: DependencyList,
    timestamp: PerformanceMark,
    source: string,
  ): void {
    // any dependency change should re-enable reporting:
    this.ensureReporting()

    const oldDependencies = this.dependenciesBySource.get(source) ?? []

    this.dependenciesBySource.set(source, newDependencies)

    // the first time this runs we wouldn't have captured anything
    if (this.getRenderedCountBySource(source) === 0) return

    const shouldResetFn =
      this.shouldResetOnDependencyChangeFnBySource.get(source)

    const shouldReset =
      (oldDependencies.length > 0 || newDependencies.length > 0) &&
      (!shouldResetFn || shouldResetFn(oldDependencies, newDependencies))

    this.markDependencyChange(timestamp, source)

    if (!shouldReset) return

    // we can flush previous measurement (if any) and completely reset
    this.debouncedTrigger.flush('dependency change')
    this.reset()
  }

  private trigger = (flushReason: FlushReason): boolean | undefined => {
    const firstAction = this.actions[0]
    const lastAction = this.actions[this.actions.length - 1]
    const { timeoutMs } = this.debounceOptionsRef

    // The second part or the OR is a workaround for the situation where someone puts their laptop to sleep
    // while a feature is in a non-final stage and then opens it many minutes/hours later.
    // Timer fires a looong long time after and may not be timed out.
    // For this reason we calculate the actual time that passed as an additional guard.
    const timedOut =
      flushReason === TimeoutReason ||
      (typeof timeoutMs === 'number' &&
        (lastAction?.timestamp ?? 0) - (firstAction?.timestamp ?? 0) >
          timeoutMs)

    const shouldContinue =
      timedOut || this.isInFinalStage || this.isInImmediateSendStage

    if (!shouldContinue) {
      // UI is not ready yet (probably data loading),
      // there's gonna be more renders soon...

      // return true to keep the timeout
      return true
    }

    if (this.actions.length === 0 || !firstAction || !lastAction) {
      // nothing to report:
      this.stopObserving()

      return undefined
    }

    const highestNumberOfActiveBeaconsCountAtAnyGivenTime =
      this.actions
        .map((action) => action.mountedPlacements.length)
        .sort()
        .reverse()[0] ?? 0

    const hadReachedTheRequiredActiveBeaconsCount =
      typeof this.minimumExpectedSimultaneousBeacons !== 'number' ||
      highestNumberOfActiveBeaconsCountAtAnyGivenTime >=
        this.minimumExpectedSimultaneousBeacons

    const { lastRenderAction } = this

    const metadataValues = [...this.customMetadataBySource.values()]
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const metadata: CustomMetadata = Object.assign({}, ...metadataValues)

    const detail = {
      metadata,
      timingId: this.id,
      isFirstLoad: !this.hasReportedAtLeastOnce,
      maximumActiveBeaconsCount:
        highestNumberOfActiveBeaconsCountAtAnyGivenTime,
      minimumExpectedSimultaneousBeacons:
        this.minimumExpectedSimultaneousBeacons,
      flushReason:
        typeof flushReason === 'symbol'
          ? (flushReason.description ?? 'manual')
          : flushReason,
    }

    let tti: PerformanceMeasure | undefined
    let ttr: PerformanceMeasure | undefined

    if (timedOut) {
      this.addStageChange(
        {
          stage: INFORMATIVE_STAGES.TIMEOUT,
          source: 'timeout',
        },
        this.lastStage,
      )
    } else if (lastRenderAction) {
      ttr = performanceMeasure(
        `${this.id}/ttr`,
        firstAction.entry.startMark ?? firstAction.entry,
        lastRenderAction.entry.endMark ?? lastRenderAction.entry,
        detail,
      )
      // add a measure so we can use it in Lighthouse runs
      tti = performanceMeasure(
        `${this.id}/tti`,
        firstAction.entry.startMark ?? firstAction.entry,
        lastAction.entry.endMark ?? lastAction.entry,
        detail,
      )
    }

    const reportArgs: ReportArguments<CustomMetadata> = {
      ...detail,
      actions: this.actions,
      loadingStages: this.loadingStages,
      finalStages: this.finalStages,
      immediateSendReportStages:
        this.immediateSendReportStages.length > 0
          ? [...ERROR_STAGES, ...this.immediateSendReportStages]
          : ERROR_STAGES,
      measures: { tti, ttr },
    }

    if (this.reportFn === noop) {
      this.onInternalError(
        new Error(
          `useTiming: reportFn was not set, please set it to a function that will be called with the timing report`,
        ),
        reportArgs,
      )
    }

    if (hadReachedTheRequiredActiveBeaconsCount) {
      this.reportFn(reportArgs)
    }

    // clear slate for next re-render (stop observing) and disable reporting
    this.clear()
    this.disableReporting()

    if (!timedOut && hadReachedTheRequiredActiveBeaconsCount) {
      this.hasReportedAtLeastOnce = true
    }

    return undefined
  }

  private debounceOptionsRef: DebounceOptionsRef<[]> = {
    fn: this.trigger,
    // these are just the defaults and can be overwritten by the options passed to the constructor:
    debounceMs: DEFAULT_DEBOUNCE_MS,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  }

  private debouncedTrigger = debounce(this.debounceOptionsRef)
}
