/* eslint-disable jest/no-conditional-in-test */
/**
 * Copyright Zendesk, Inc.
 *
 * Use of this source code is governed under the Apache License, Version 2.0
 * found at http://www.apache.org/licenses/LICENSE-2.0.
 */

import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import * as React from 'react'
import type { ReactTestRenderer } from 'react-test-renderer'
import { act, create } from 'react-test-renderer'
import { ActionLog } from './ActionLog'
import { DEFAULT_STAGES, INFORMATIVE_STAGES } from './constants'
import { generateReport, type Report } from './generateReport'
import * as performanceMock from './performanceMark'
import type { ReportFnV1 } from './types'
import { useTimingMeasurement } from './useTimingMeasurement'
import { resetMemoizedCurrentBrowserSupportForNonResponsiveStateDetection } from './utilities'

jest.mock('./performanceMark', () => ({
  performanceMark: jest.fn(),
  performanceMeasure: jest.fn(),
}))

const performanceMarkMock =
  performanceMock.performanceMark as jest.MockedFunction<
    typeof performanceMock.performanceMark
  >
const performanceMeasureMock =
  performanceMock.performanceMeasure as jest.MockedFunction<
    typeof performanceMock.performanceMeasure
  >

type Assert = (condition: unknown, message?: string) => asserts condition
const assert: Assert = (condition, message) => {
  if (!condition) {
    throw new Error(message)
  }
}

interface SimplifiedPerformanceEntry {
  readonly duration: number
  readonly entryType: string
  readonly name: string
  readonly startTime: number
  toJSON: () => string
}

const createPerfObserverEntryList = (
  entryList: SimplifiedPerformanceEntry[],
): PerformanceObserverEntryList => ({
  getEntries: () => entryList,
  getEntriesByName: () => [],
  getEntriesByType: () => [],
})

describe('useTiming', () => {
  const mockObserve: jest.Mock = jest.fn<
    void,
    [options?: PerformanceObserverInit]
  >()
  const mockDisconnect: jest.Mock = jest.fn()
  const PerformanceObserverMock: jest.Mock<
    PerformanceObserver,
    [PerformanceObserverCallback]
  > = jest.fn().mockImplementation(() => ({
    observe: mockObserve,
    disconnect: mockDisconnect,
    takeRecords: jest.fn(),
  }))
  const mockGetSupportedEntryTypes = jest.fn<readonly string[], never>(() => [])

  // Set static property supportedEntryTypes on PerformanceObserver

  Object.defineProperty(PerformanceObserverMock, 'supportedEntryTypes', {
    get: mockGetSupportedEntryTypes,
    configurable: true,
  })

  const originalPerformanceObserver = window.PerformanceObserver

  const mockReportFn = jest.fn<void, Parameters<ReportFnV1<any>>>()

  const id = 'test-component'
  const timeIncrement = 100
  const debounceMs = 5 * timeIncrement
  const timeoutMs = 10 * timeIncrement

  const originalConsoleError = console.error
  const consoleErrorMock = jest.fn()

  const onInternalError = jest.fn()
  let currentTime: number

  let stageChangeDuration: number

  const originalTimeOrigin = performance.timeOrigin
  beforeAll(() => {
    performanceMarkMock.mockImplementation((name) => ({
      name,
      duration: 0,
      startTime: currentTime,
      entryType: 'mark',
      toJSON: () => `(toJSON:${name})`,
      detail: null,
    }))

    performanceMeasureMock.mockImplementation((name, startMark) => {
      if (name.includes('-till-') || name.includes('/start-'))
        currentTime += stageChangeDuration
      else if (!name.endsWith('timeout')) currentTime += timeIncrement

      return {
        name,
        duration: currentTime - startMark.startTime,
        startTime: startMark.startTime,
        entryType: 'measure',
        toJSON: () => `(toJSON:${name})`,
        detail: null,
      }
    })

    console.error = consoleErrorMock

    globalThis.PerformanceObserver = PerformanceObserverMock as never
    jest.useFakeTimers()
    Object.defineProperty(performance, 'timeOrigin', {
      configurable: true,
      enumerable: true,
      get() {
        return 0
      },
    })
  })
  afterAll(() => {
    jest.useRealTimers()

    console.error = originalConsoleError
    globalThis.PerformanceObserver = originalPerformanceObserver

    Object.defineProperty(performance, 'timeOrigin', {
      configurable: true,
      enumerable: true,
      get() {
        return originalTimeOrigin
      },
    })
  })

  beforeEach(() => {
    currentTime = 0
    stageChangeDuration = 0
  })

  afterEach(() => {
    jest.clearAllMocks()
    resetMemoizedCurrentBrowserSupportForNonResponsiveStateDetection()

    // For whatever reason, if this line isn't here, jest's timers go all wack-o
    // even though we're clearing them a line below
    // this one has to be run; otherwise if a test fails, subsequent tests will also fail.
    // Note that for some reason switching to useRealTimers() doesn't clear the timers 🤦‍
    jest.runOnlyPendingTimers()
    jest.clearAllTimers()
  })

  describe('without the beacon hook and stages', () => {
    it('should report metrics when ready', () => {
      const simulatedFirstRenderTimeMs = timeIncrement

      let renderer: ReactTestRenderer

      const actionLog = new ActionLog({
        reportFn: mockReportFn,
        debounceMs,
        timeoutMs,
        onInternalError,
      })

      const TimedTestComponent = () => {
        useTimingMeasurement(
          {
            id,
            placement: 'manager',
            actionLog,
          },
          [],
        )

        return <div>Hello!</div>
      }

      act(() => {
        renderer = create(<TimedTestComponent />)
      })

      // the hook shouldn't affect the contents being rendered:

      expect(renderer!.toJSON()).toMatchInlineSnapshot(`
        <div>
          Hello!
        </div>
      `)

      // we're simulating a browser that doesn't support observing frozen states:
      expect(mockObserve).not.toHaveBeenCalled()

      // exhaust React's next tick timer
      jest.advanceTimersToNextTimer()
      // jest.advanceTimersByTime(1);

      // report shouldn't have been called yet -- it's debounced:
      expect(mockReportFn).not.toHaveBeenCalled()

      // we should have timers for: debounce and timeoutMs
      expect(jest.getTimerCount()).toBe(2)

      jest.advanceTimersByTime(simulatedFirstRenderTimeMs)

      // we should *still* have timers for: debounce and timeoutMs
      expect(jest.getTimerCount()).toBe(2)

      // report shouldn't have been called yet -- it's debounced:
      expect(mockReportFn).not.toHaveBeenCalled()

      jest.advanceTimersByTime(debounceMs)

      // no more timers should be set by this time:
      expect(jest.getTimerCount()).toBe(0)

      expect(mockReportFn).toHaveBeenCalledTimes(1)

      const report: Report = {
        id,
        isFirstLoad: true,
        tti: null,
        ttr: simulatedFirstRenderTimeMs,
        lastStage: INFORMATIVE_STAGES.INITIAL,
        counts: {
          manager: 1,
        },
        durations: {
          manager: [timeIncrement],
        },
        timeSpent: {
          manager: timeIncrement,
        },
        spans: expect.anything(),
        loadingStagesDuration: 0,
        includedStages: [],
        hadError: false,
        handled: true,
        flushReason: 'debounce',
      }

      const reportArgs = mockReportFn.mock.calls.at(-1)?.[0]
      expect(reportArgs).toBeDefined()
      const generatedReport = generateReport(reportArgs!)
      expect(generatedReport).toEqual(report)
      expect(generatedReport.spans).toMatchInlineSnapshot(`
        Array [
          Object {
            "data": Object {
              "metadata": Object {},
              "mountedPlacements": Array [
                "manager",
              ],
              "source": "manager",
              "stage": "initial",
              "timingId": "test-component",
            },
            "description": "<manager> (1)",
            "endTime": 100,
            "relativeEndTime": 100,
            "startTime": 0,
            "type": "render",
          },
          Object {
            "data": Object {
              "dependencyChanges": 0,
              "mountedPlacements": Array [
                "manager",
              ],
              "previousStage": "initial",
              "stage": "rendered",
              "timeToStage": 100,
              "timingId": "test-component",
            },
            "description": "render",
            "endTime": 100,
            "relativeEndTime": 100,
            "startTime": 0,
            "type": "ttr",
          },
        ]
      `)

      renderer!.unmount()

      jest.runAllTimers()

      // an un-mount shouldn't change anything
      expect(mockReportFn).toHaveBeenCalledTimes(1)
      expect(jest.getTimerCount()).toBe(0)
    })

    it('should report new metrics after updating', () => {
      const simulatedFirstRenderTimeMs = timeIncrement

      let renderer: ReactTestRenderer

      const actionLog = new ActionLog({
        reportFn: mockReportFn,
        debounceMs,
        timeoutMs,
        onInternalError,
      })

      const TimedTestComponent = ({ action }: { action: string }) => {
        useTimingMeasurement(
          {
            id,
            placement: 'manager',
            actionLog,
          },
          [action],
        )

        return <div>Hello!</div>
      }

      act(() => {
        renderer = create(<TimedTestComponent action="mount" />)
      })

      // the hook shouldn't affect the contents being rendered:
      expect(renderer!.toJSON()).toMatchInlineSnapshot(`
        <div>
          Hello!
        </div>
      `)

      // we're simulating a browser that doesn't support observing frozen states:
      expect(mockObserve).not.toHaveBeenCalled()

      // exhaust React's (?) next tick timer
      jest.advanceTimersToNextTimer()

      // report shouldn't have been called yet -- it's debounced:
      expect(mockReportFn).not.toHaveBeenCalled()

      // we should have timers for: debounce and timeoutMs
      expect(jest.getTimerCount()).toBe(2)

      jest.advanceTimersByTime(simulatedFirstRenderTimeMs)

      // we should *still* have timers for: debounce and timeoutMs
      expect(jest.getTimerCount()).toBe(2)

      // report shouldn't have been called yet -- it's debounced:
      expect(mockReportFn).not.toHaveBeenCalled()

      jest.advanceTimersByTime(debounceMs)

      // no more timers should be set by this time:
      expect(jest.getTimerCount()).toBe(0)

      expect(mockReportFn).toHaveBeenCalledTimes(1)

      const report: Report = {
        id,
        isFirstLoad: true,
        tti: null,
        ttr: simulatedFirstRenderTimeMs,
        lastStage: INFORMATIVE_STAGES.INITIAL,
        counts: {
          manager: 1,
        },
        durations: {
          manager: [timeIncrement],
        },
        timeSpent: {
          manager: timeIncrement,
        },
        loadingStagesDuration: 0,
        spans: expect.anything(),
        includedStages: [],
        hadError: false,
        handled: true,
        flushReason: 'debounce',
      }

      expect(mockReportFn).toHaveBeenCalledTimes(1)
      const reportArgs = mockReportFn.mock.calls.at(-1)?.[0]
      expect(reportArgs).toBeDefined()
      const generatedReport = generateReport(reportArgs!)
      expect(generatedReport).toEqual(report)
      expect(generatedReport.spans).toMatchInlineSnapshot(`
        Array [
          Object {
            "data": Object {
              "metadata": Object {},
              "mountedPlacements": Array [
                "manager",
              ],
              "source": "manager",
              "stage": "initial",
              "timingId": "test-component",
            },
            "description": "<manager> (1)",
            "endTime": 100,
            "relativeEndTime": 100,
            "startTime": 0,
            "type": "render",
          },
          Object {
            "data": Object {
              "dependencyChanges": 0,
              "mountedPlacements": Array [
                "manager",
              ],
              "previousStage": "initial",
              "stage": "rendered",
              "timeToStage": 100,
              "timingId": "test-component",
            },
            "description": "render",
            "endTime": 100,
            "relativeEndTime": 100,
            "startTime": 0,
            "type": "ttr",
          },
        ]
      `)

      jest.runAllTimers()

      actionLog.disableReporting()

      act(() => {
        renderer.update(<TimedTestComponent action="update" />)
      })

      jest.advanceTimersByTime(debounceMs)

      // a new report should have been generated
      expect(mockReportFn).toHaveBeenCalledTimes(2)
    })

    it(`should keep debouncing and timeoutMs if the component keeps doing stuff for too long`, () => {
      expect(jest.getTimerCount()).toBe(0)
      let renderer: ReactTestRenderer
      let keepRerendering = true

      const actionLog = new ActionLog({
        debounceMs,
        timeoutMs,
      })

      const TimedTestComponentThatKeepsDoingStuffForever = ({
        children,
      }: {
        children: ReactNode
      }) => {
        useTimingMeasurement(
          {
            id,
            placement: 'manager',
            onInternalError,
            reportFn: mockReportFn,
            actionLog,
          },
          [],
        )

        const [state, setState] = useState(0)

        useEffect(() => {
          if (keepRerendering) {
            setTimeout(() => {
              setState(state + 1)
            }, timeIncrement)
          }
        })

        return (
          <div>
            {children}
            {state}
          </div>
        )
      }

      act(() => {
        renderer = create(
          <TimedTestComponentThatKeepsDoingStuffForever>
            Hello world! Your lucky number (re-render count) is:
          </TimedTestComponentThatKeepsDoingStuffForever>,
        )
      })

      // the hook shouldn't affect the contents being rendered:

      expect(renderer!.toJSON()).toMatchInlineSnapshot(`
        <div>
          Hello world! Your lucky number (re-render count) is:
          0
        </div>
      `)

      // exhaust React's next tick timer
      jest.advanceTimersToNextTimer()

      // report shouldn't have been called yet -- it's debounced:
      expect(mockReportFn).not.toHaveBeenCalled()

      // we should have timers for: debounce and timeoutMs, and the one from the component
      expect(jest.getTimerCount()).toBe(3)

      jest.advanceTimersByTime(timeoutMs - timeIncrement)

      // timeoutMs should still be going
      expect(jest.getTimerCount()).toBe(3)

      jest.advanceTimersByTime(timeIncrement)

      // by this time the timeoutMs should have executed and now the only timer is the one from the component
      expect(jest.getTimerCount()).toBe(1)

      // we should be after 9 re-renders at this point:
      expect(renderer!.toJSON()).toMatchInlineSnapshot(`
        <div>
          Hello world! Your lucky number (re-render count) is:
          9
        </div>
      `)

      expect(mockReportFn).toHaveBeenCalledTimes(1)

      const expectedRenderCount = timeoutMs / timeIncrement
      const startToEndTime = timeoutMs
      const report: Report = {
        id,
        isFirstLoad: true,
        tti: null,
        ttr: null,
        lastStage: INFORMATIVE_STAGES.TIMEOUT,
        counts: {
          manager: expectedRenderCount,
        },
        durations: {
          manager: Array.from({ length: expectedRenderCount }).map(
            () => timeIncrement,
          ),
        },
        spans: expect.anything(),
        timeSpent: {
          manager: startToEndTime,
        },
        loadingStagesDuration: 0,
        includedStages: [
          INFORMATIVE_STAGES.INITIAL,
          INFORMATIVE_STAGES.TIMEOUT,
        ],
        hadError: false,
        handled: false,
        flushReason: 'timeout',
      }

      expect(mockReportFn).toHaveBeenCalledTimes(1)
      const reportArgs = mockReportFn.mock.calls.at(-1)?.[0]
      expect(reportArgs).toBeDefined()
      const generatedReport = generateReport(reportArgs!)
      expect(generatedReport).toEqual(report)
      expect(generatedReport.spans).toMatchInlineSnapshot(`
        Array [
          Object {
            "data": Object {
              "metadata": Object {},
              "mountedPlacements": Array [
                "manager",
              ],
              "source": "manager",
              "stage": "initial",
              "timingId": "test-component",
            },
            "description": "<manager> (1)",
            "endTime": 100,
            "relativeEndTime": 100,
            "startTime": 0,
            "type": "render",
          },
          Object {
            "data": Object {
              "metadata": Object {},
              "mountedPlacements": Array [
                "manager",
              ],
              "source": "manager",
              "stage": "initial",
              "timingId": "test-component",
            },
            "description": "<manager> (2)",
            "endTime": 200,
            "relativeEndTime": 200,
            "startTime": 100,
            "type": "render",
          },
          Object {
            "data": Object {
              "metadata": Object {},
              "mountedPlacements": Array [
                "manager",
              ],
              "source": "manager",
              "stage": "initial",
              "timingId": "test-component",
            },
            "description": "<manager> (3)",
            "endTime": 300,
            "relativeEndTime": 300,
            "startTime": 200,
            "type": "render",
          },
          Object {
            "data": Object {
              "metadata": Object {},
              "mountedPlacements": Array [
                "manager",
              ],
              "source": "manager",
              "stage": "initial",
              "timingId": "test-component",
            },
            "description": "<manager> (4)",
            "endTime": 400,
            "relativeEndTime": 400,
            "startTime": 300,
            "type": "render",
          },
          Object {
            "data": Object {
              "metadata": Object {},
              "mountedPlacements": Array [
                "manager",
              ],
              "source": "manager",
              "stage": "initial",
              "timingId": "test-component",
            },
            "description": "<manager> (5)",
            "endTime": 500,
            "relativeEndTime": 500,
            "startTime": 400,
            "type": "render",
          },
          Object {
            "data": Object {
              "metadata": Object {},
              "mountedPlacements": Array [
                "manager",
              ],
              "source": "manager",
              "stage": "initial",
              "timingId": "test-component",
            },
            "description": "<manager> (6)",
            "endTime": 600,
            "relativeEndTime": 600,
            "startTime": 500,
            "type": "render",
          },
          Object {
            "data": Object {
              "metadata": Object {},
              "mountedPlacements": Array [
                "manager",
              ],
              "source": "manager",
              "stage": "initial",
              "timingId": "test-component",
            },
            "description": "<manager> (7)",
            "endTime": 700,
            "relativeEndTime": 700,
            "startTime": 600,
            "type": "render",
          },
          Object {
            "data": Object {
              "metadata": Object {},
              "mountedPlacements": Array [
                "manager",
              ],
              "source": "manager",
              "stage": "initial",
              "timingId": "test-component",
            },
            "description": "<manager> (8)",
            "endTime": 800,
            "relativeEndTime": 800,
            "startTime": 700,
            "type": "render",
          },
          Object {
            "data": Object {
              "metadata": Object {},
              "mountedPlacements": Array [
                "manager",
              ],
              "source": "manager",
              "stage": "initial",
              "timingId": "test-component",
            },
            "description": "<manager> (9)",
            "endTime": 900,
            "relativeEndTime": 900,
            "startTime": 800,
            "type": "render",
          },
          Object {
            "data": Object {
              "metadata": Object {},
              "mountedPlacements": Array [
                "manager",
              ],
              "source": "manager",
              "stage": "initial",
              "timingId": "test-component",
            },
            "description": "<manager> (10)",
            "endTime": 1000,
            "relativeEndTime": 1000,
            "startTime": 900,
            "type": "render",
          },
          Object {
            "data": Object {
              "dependencyChanges": 0,
              "metadata": Object {},
              "mountedPlacements": Array [
                "manager",
              ],
              "previousStage": "initial",
              "source": "timeout",
              "stage": "timeout",
              "timeToStage": 1000,
              "timingId": "test-component",
            },
            "description": "initial to timeout",
            "endTime": 1000,
            "relativeEndTime": 1000,
            "startTime": 0,
            "type": "stage-change",
          },
        ]
      `)

      jest.advanceTimersByTime(timeIncrement)

      // re-rendering should still be happening, even though we're not measuring anymore:
      expect(jest.getTimerCount()).toBe(1)

      expect(renderer!.toJSON()).toMatchInlineSnapshot(`
        <div>
          Hello world! Your lucky number (re-render count) is:
          10
        </div>
      `)

      keepRerendering = false

      jest.advanceTimersByTime(timeIncrement)

      // no more timers should be set by this time:
      expect(jest.getTimerCount()).toBe(0)

      // ...and we reported only once
      expect(mockReportFn).toHaveBeenCalledTimes(1)

      renderer!.unmount()
    })
  })

  describe('with stages, but without the beacon hook', () => {
    it('should report metrics when ready', () => {
      let renderer: ReactTestRenderer

      let setStage: (stage: string) => void

      const actionLog = new ActionLog({
        debounceMs,
        timeoutMs,
        finalStages: [DEFAULT_STAGES.READY],
      })

      const TimedTestComponent = () => {
        const [stage, _setStage] = useState<string>(INFORMATIVE_STAGES.INITIAL)

        setStage = _setStage

        useTimingMeasurement(
          {
            id,
            placement: 'manager',
            onInternalError,
            reportFn: mockReportFn,
            stage,
            actionLog,
          },
          [],
        )

        return <div>Hello! We are at stage:{stage}</div>
      }

      act(() => {
        renderer = create(<TimedTestComponent />)
      })

      // the hook shouldn't affect the contents being rendered:

      expect(renderer!.toJSON()).toMatchInlineSnapshot(`
        <div>
          Hello! We are at stage:
          initial
        </div>
      `)

      // we're simulating a browser that doesn't support observing frozen states:
      expect(mockObserve).not.toHaveBeenCalled()

      // exhaust React's next tick timer
      jest.advanceTimersToNextTimer()

      // report shouldn't have been called yet -- it's debounced:
      expect(mockReportFn).not.toHaveBeenCalled()

      // we should have timers for: debounce and timeoutMs
      expect(jest.getTimerCount()).toBe(2)

      jest.advanceTimersByTime(timeIncrement)

      // we should *still* have timers for: debounce and timeoutMs
      expect(jest.getTimerCount()).toBe(2)

      // still debounced:
      expect(mockReportFn).not.toHaveBeenCalled()

      setStage!(DEFAULT_STAGES.LOADING)

      // re-rendered with new data:

      expect(renderer!.toJSON()).toMatchInlineSnapshot(`
        <div>
          Hello! We are at stage:
          loading
        </div>
      `)

      // exhaust React's next tick timer
      jest.advanceTimersToNextTimer()

      // we should have timers for: debounce and timeoutMs
      expect(jest.getTimerCount()).toBe(2)

      jest.advanceTimersByTime(timeIncrement)

      setStage!(DEFAULT_STAGES.READY)

      // re-rendered with new data:

      expect(renderer!.toJSON()).toMatchInlineSnapshot(`
        <div>
          Hello! We are at stage:
          ready
        </div>
      `)

      // exhaust React's next tick timer
      jest.advanceTimersToNextTimer()

      // we should have timers for: debounce and timeoutMs
      expect(jest.getTimerCount()).toBe(2)

      // still debounced:
      expect(mockReportFn).not.toHaveBeenCalled()

      jest.advanceTimersByTime(debounceMs)

      expect(mockReportFn).toHaveBeenCalledTimes(1)

      const expectedRenderCount = 3
      const timeSpent = timeIncrement * expectedRenderCount

      const report: Report = {
        id,
        isFirstLoad: true,
        tti: null,
        ttr: timeIncrement * expectedRenderCount,
        lastStage: DEFAULT_STAGES.READY,
        counts: {
          manager: expectedRenderCount,
        },
        durations: {
          manager: [timeIncrement, timeIncrement, timeIncrement],
        },
        timeSpent: {
          manager: timeSpent,
        },
        spans: expect.anything(),
        loadingStagesDuration: timeIncrement,
        includedStages: [
          INFORMATIVE_STAGES.INITIAL,
          DEFAULT_STAGES.LOADING,
          DEFAULT_STAGES.READY,
        ],
        hadError: false,
        handled: true,
        flushReason: 'debounce',
      }

      expect(mockReportFn).toHaveBeenCalledTimes(1)
      const reportArgs = mockReportFn.mock.calls.at(-1)?.[0]
      expect(reportArgs).toBeDefined()
      const generatedReport = generateReport(reportArgs!)
      expect(generatedReport).toEqual(report)
      expect(generatedReport.spans).toMatchInlineSnapshot(`
        Array [
          Object {
            "data": Object {
              "metadata": Object {},
              "mountedPlacements": Array [
                "manager",
              ],
              "source": "manager",
              "stage": "initial",
              "timingId": "test-component",
            },
            "description": "<manager> (1)",
            "endTime": 100,
            "relativeEndTime": 100,
            "startTime": 0,
            "type": "render",
          },
          Object {
            "data": Object {
              "metadata": Object {},
              "mountedPlacements": Array [
                "manager",
              ],
              "source": "manager",
              "stage": "loading",
              "timingId": "test-component",
            },
            "description": "<manager> (2)",
            "endTime": 200,
            "relativeEndTime": 200,
            "startTime": 100,
            "type": "render",
          },
          Object {
            "data": Object {
              "metadata": Object {},
              "mountedPlacements": Array [
                "manager",
              ],
              "source": "manager",
              "stage": "ready",
              "timingId": "test-component",
            },
            "description": "<manager> (3)",
            "endTime": 300,
            "relativeEndTime": 300,
            "startTime": 200,
            "type": "render",
          },
          Object {
            "data": Object {
              "dependencyChanges": 0,
              "metadata": Object {},
              "mountedPlacements": Array [
                "manager",
              ],
              "previousStage": "initial",
              "source": "manager",
              "stage": "loading",
              "timeToStage": 100,
              "timingId": "test-component",
            },
            "description": "initial to loading",
            "endTime": 100,
            "relativeEndTime": 100,
            "startTime": 0,
            "type": "stage-change",
          },
          Object {
            "data": Object {
              "dependencyChanges": 0,
              "metadata": Object {},
              "mountedPlacements": Array [
                "manager",
              ],
              "previousStage": "loading",
              "source": "manager",
              "stage": "ready",
              "timeToStage": 100,
              "timingId": "test-component",
            },
            "description": "loading to ready",
            "endTime": 200,
            "relativeEndTime": 200,
            "startTime": 100,
            "type": "stage-change",
          },
          Object {
            "data": Object {
              "dependencyChanges": 0,
              "mountedPlacements": Array [
                "manager",
              ],
              "previousStage": "ready",
              "stage": "rendered",
              "timeToStage": 100,
              "timingId": "test-component",
            },
            "description": "render",
            "endTime": 300,
            "relativeEndTime": 300,
            "startTime": 0,
            "type": "ttr",
          },
        ]
      `)

      // no more timers should be set by this time:
      expect(jest.getTimerCount()).toBe(0)

      renderer!.unmount()

      jest.runAllTimers()

      // an un-mount shouldn't change anything
      expect(mockReportFn).toHaveBeenCalledTimes(1)
      expect(jest.getTimerCount()).toBe(0)
    })
  })

  describe('with stages, the beacon hook, custom activation from the beacon and non-responsive state detection', () => {
    it('should report metrics when ready', () => {
      let renderer: ReactTestRenderer

      // mock a browser that supports 'longtask' monitoring
      mockGetSupportedEntryTypes.mockReturnValue(['longtask'])

      interface BeaconState {
        stage: string
        isActive: boolean
      }

      let setBeaconState: (state: BeaconState) => void

      const actionLog = new ActionLog({
        finalStages: [DEFAULT_STAGES.READY, DEFAULT_STAGES.ERROR],
        debounceMs,
        timeoutMs,
      })

      const BeaconComponent = () => {
        const [{ stage, isActive }, _setState] = useState<BeaconState>({
          stage: INFORMATIVE_STAGES.INITIAL,
          isActive: false,
        })

        setBeaconState = _setState
        useTimingMeasurement(
          {
            id,
            placement: 'beacon',
            onInternalError,
            stage,
            isActive,
            actionLog,
          },
          [],
        )

        return (
          <>
            <div>We are at stage:{stage}</div>
            <div>We are:{isActive ? 'measuring' : 'not measuring'}</div>
          </>
        )
      }

      const TimedTestComponent = () => {
        useTimingMeasurement(
          {
            id,
            placement: 'manager',
            onInternalError,
            reportFn: mockReportFn,
            actionLog,
          },
          [],
        )

        return (
          <>
            <div>Hello!</div>
            <BeaconComponent />
          </>
        )
      }

      act(() => {
        renderer = create(<TimedTestComponent />)
      })

      // the hook shouldn't affect the contents being rendered:

      expect(renderer!.toJSON()).toMatchInlineSnapshot(`
        [
          <div>
            Hello!
          </div>,
          <div>
            We are at stage:
            initial
          </div>,
          <div>
            We are:
            not measuring
          </div>,
        ]
      `)

      // exhaust React's next tick timer
      jest.advanceTimersToNextTimer()

      // we're simulating a browser that does support observing frozen states
      expect(PerformanceObserverMock).toHaveBeenCalledTimes(1)
      expect(PerformanceObserverMock).toHaveBeenLastCalledWith(
        expect.any(Function),
      )

      // but we aren't active yet:
      expect(mockObserve).not.toHaveBeenCalled()

      assert(PerformanceObserverMock.mock.calls[0])

      const performanceObserverCallback =
        PerformanceObserverMock.mock.calls[0][0]

      // report shouldn't have been called yet -- we're inactive:
      expect(mockReportFn).not.toHaveBeenCalled()

      // no timers should be present
      expect(jest.getTimerCount()).toBe(0)

      setBeaconState!({ stage: DEFAULT_STAGES.LOADING, isActive: true })

      // re-rendered with new data:

      expect(renderer!.toJSON()).toMatchInlineSnapshot(`
        [
          <div>
            Hello!
          </div>,
          <div>
            We are at stage:
            loading
          </div>,
          <div>
            We are:
            measuring
          </div>,
        ]
      `)

      // exhaust React's next tick timer
      jest.advanceTimersToNextTimer()

      // now we're active!
      expect(mockObserve).toHaveBeenCalledTimes(1)
      expect(mockObserve).toHaveBeenLastCalledWith({ entryTypes: ['longtask'] })

      jest.advanceTimersByTime(timeIncrement)

      // report shouldn't have been called yet -- it's debounced:
      expect(mockReportFn).not.toHaveBeenCalled()

      // we should have timers for: debounce and timeoutMs
      expect(jest.getTimerCount()).toBe(2)

      jest.advanceTimersByTime(timeIncrement)

      // we should *still* have timers for: debounce and timeoutMs
      expect(jest.getTimerCount()).toBe(2)

      // still debounced:
      expect(mockReportFn).not.toHaveBeenCalled()

      setBeaconState!({ stage: DEFAULT_STAGES.READY, isActive: true })

      // re-rendered with new data:

      expect(renderer!.toJSON()).toMatchInlineSnapshot(`
        [
          <div>
            Hello!
          </div>,
          <div>
            We are at stage:
            ready
          </div>,
          <div>
            We are:
            measuring
          </div>,
        ]
      `)

      // exhaust React's next tick timer
      jest.advanceTimersToNextTimer()

      // we should have timers for: debounce and timeoutMs
      expect(jest.getTimerCount()).toBe(2)

      // still debounced:
      expect(mockReportFn).not.toHaveBeenCalled()

      const lagStartTime = currentTime + timeIncrement
      const lagDuration = timeIncrement * 5

      // simulate non-responsiveness for 500ms
      performanceObserverCallback(
        createPerfObserverEntryList([
          {
            duration: lagDuration,
            entryType: 'longtask',
            name: 'longtask',
            startTime: lagStartTime,
            toJSON: () => '',
          },
        ]),
        // the 2nd argument isn't used, but we need it to make TypeScript happy
        new PerformanceObserver(() => {
          /* noop */
        }),
      )

      jest.advanceTimersByTime(timeIncrement)

      // report shouldn't have been called yet -- it's debounced:
      expect(mockReportFn).not.toHaveBeenCalled()

      // we should have timers for: debounce and timeoutMs
      expect(jest.getTimerCount()).toBe(2)

      jest.advanceTimersByTime(timeIncrement)

      // we should *still* have timers for: debounce and timeoutMs
      expect(jest.getTimerCount()).toBe(2)

      // still debounced:
      expect(mockReportFn).not.toHaveBeenCalled()

      jest.advanceTimersByTime(debounceMs)

      expect(mockReportFn).toHaveBeenCalledTimes(1)
      // we should have disconnected now:
      expect(mockDisconnect).toHaveBeenCalledTimes(1)

      // we should only start counting renders AFTER we activate, that's why we only have 2 (loading and ready):
      const expectedBeaconRenderCount = 2
      const ttr = timeIncrement * expectedBeaconRenderCount
      const tti = ttr + timeIncrement + lagDuration
      const report: Report = {
        id,
        isFirstLoad: true,
        tti,
        ttr,
        lastStage: DEFAULT_STAGES.READY,
        counts: {
          beacon: expectedBeaconRenderCount,
          observer: 1,
          // manager wouldn't have re-rendered
        },
        durations: {
          beacon: [timeIncrement, timeIncrement],
          observer: [lagDuration],
        },
        timeSpent: {
          beacon: ttr,
          observer: lagDuration,
        },
        spans: expect.anything(),
        loadingStagesDuration: timeIncrement,
        includedStages: [DEFAULT_STAGES.LOADING, DEFAULT_STAGES.READY],
        hadError: false,
        handled: true,
        flushReason: 'debounce',
      }

      expect(mockReportFn).toHaveBeenCalledTimes(1)
      const reportArgs = mockReportFn.mock.calls.at(-1)?.[0]
      expect(reportArgs).toBeDefined()
      const generatedReport = generateReport(reportArgs!)
      expect(generatedReport).toEqual(report)
      expect(generatedReport.spans).toMatchInlineSnapshot(`
        Array [
          Object {
            "data": Object {
              "metadata": Object {},
              "mountedPlacements": Array [
                "manager",
                "beacon",
              ],
              "source": "beacon",
              "stage": "loading",
              "timingId": "test-component",
            },
            "description": "<beacon> (1)",
            "endTime": 300,
            "relativeEndTime": 100,
            "startTime": 200,
            "type": "render",
          },
          Object {
            "data": Object {
              "metadata": Object {},
              "mountedPlacements": Array [
                "manager",
                "beacon",
              ],
              "source": "beacon",
              "stage": "ready",
              "timingId": "test-component",
            },
            "description": "<beacon> (2)",
            "endTime": 400,
            "relativeEndTime": 200,
            "startTime": 300,
            "type": "render",
          },
          Object {
            "data": Object {
              "metadata": Object {},
              "mountedPlacements": Array [
                "manager",
                "beacon",
              ],
              "source": "observer",
              "stage": "ready",
              "timingId": "test-component",
            },
            "description": "unresponsive",
            "endTime": 1000,
            "relativeEndTime": 800,
            "startTime": 500,
            "type": "unresponsive",
          },
          Object {
            "data": Object {
              "dependencyChanges": 0,
              "metadata": Object {},
              "mountedPlacements": Array [
                "manager",
                "beacon",
              ],
              "previousStage": "loading",
              "source": "beacon",
              "stage": "ready",
              "timeToStage": 100,
              "timingId": "test-component",
            },
            "description": "loading to ready",
            "endTime": 300,
            "relativeEndTime": 100,
            "startTime": 200,
            "type": "stage-change",
          },
          Object {
            "data": Object {
              "dependencyChanges": 0,
              "mountedPlacements": Array [
                "manager",
                "beacon",
              ],
              "previousStage": "ready",
              "stage": "rendered",
              "timeToStage": 100,
              "timingId": "test-component",
            },
            "description": "render",
            "endTime": 400,
            "relativeEndTime": 200,
            "startTime": 200,
            "type": "ttr",
          },
          Object {
            "data": Object {
              "dependencyChanges": 0,
              "mountedPlacements": Array [
                "manager",
                "beacon",
              ],
              "previousStage": "rendered",
              "stage": "interactive",
              "timeToStage": 600,
              "timingId": "test-component",
            },
            "description": "interactive",
            "endTime": 1000,
            "relativeEndTime": 800,
            "startTime": 200,
            "type": "tti",
          },
        ]
      `)

      // no more timers should be set by this time:
      expect(jest.getTimerCount()).toBe(0)

      renderer!.unmount()

      jest.runAllTimers()

      // an un-mount shouldn't change anything
      expect(mockReportFn).toHaveBeenCalledTimes(1)
      expect(jest.getTimerCount()).toBe(0)
    })

    it('should wait until beacon is activated', () => {
      let renderer: ReactTestRenderer

      // mock a browser that supports 'longtask' monitoring
      mockGetSupportedEntryTypes.mockReturnValue(['longtask'])

      interface BeaconState {
        isActive: boolean
      }

      let setBeaconState: (state: BeaconState) => void

      const actionLog = new ActionLog({
        waitForBeaconActivation: ['beacon'],
        debounceMs,
        timeoutMs,
      })

      const BeaconComponent = () => {
        useTimingMeasurement(
          {
            id,
            placement: 'beacon',
            onInternalError,
            actionLog,
          },
          [],
        )

        return (
          <>
            <div>We are a beacon</div>
          </>
        )
      }

      const TimedTestComponent = () => {
        const [{ isActive }, _setState] = useState<BeaconState>({
          isActive: false,
        })

        setBeaconState = _setState
        useTimingMeasurement(
          {
            id,
            placement: 'manager',
            onInternalError,
            reportFn: mockReportFn,
            actionLog,
          },
          [],
        )

        return (
          <>
            <div>Hello!</div>
            {isActive && <BeaconComponent />}
          </>
        )
      }

      act(() => {
        renderer = create(<TimedTestComponent />)
      })

      // the hook shouldn't affect the contents being rendered:

      expect(renderer!.toJSON()).toMatchInlineSnapshot(`
        <div>
          Hello!
        </div>
      `)

      // exhaust React's next tick timer
      jest.advanceTimersToNextTimer()

      // we're simulating a browser that does support observing frozen states
      expect(PerformanceObserverMock).toHaveBeenCalledTimes(1)
      expect(PerformanceObserverMock).toHaveBeenLastCalledWith(
        expect.any(Function),
      )

      // but we aren't active yet:
      expect(mockObserve).not.toHaveBeenCalled()

      assert(PerformanceObserverMock.mock.calls[0])
      const performanceObserverCallback =
        PerformanceObserverMock.mock.calls[0][0]

      // report shouldn't have been called yet -- waitForBeaconActivation has not been satisfied:
      expect(mockReportFn).not.toHaveBeenCalled()

      // no timers should be present
      expect(jest.getTimerCount()).toBe(0)

      setBeaconState!({ isActive: true })

      // re-rendered with new data:

      expect(renderer!.toJSON()).toMatchInlineSnapshot(`
        [
          <div>
            Hello!
          </div>,
          <div>
            We are a beacon
          </div>,
        ]
      `)

      // exhaust React's next tick timer
      jest.advanceTimersToNextTimer()

      // now we're active!
      expect(mockObserve).toHaveBeenCalledTimes(1)
      expect(mockObserve).toHaveBeenLastCalledWith({ entryTypes: ['longtask'] })

      jest.advanceTimersByTime(timeIncrement)

      // report shouldn't have been called yet -- it's debounced:
      expect(mockReportFn).not.toHaveBeenCalled()

      // we should have timers for: debounce and timeoutMs
      expect(jest.getTimerCount()).toBe(2)

      const lagStartTime = currentTime + timeIncrement
      const lagDuration = debounceMs

      // simulate non-responsiveness for 500ms
      performanceObserverCallback(
        createPerfObserverEntryList([
          {
            duration: lagDuration,
            entryType: 'longtask',
            name: 'longtask',
            startTime: lagStartTime,
            toJSON: () => '',
          },
        ]),
        // the 2nd argument isn't used, but we need it to make TypeScript happy
        new PerformanceObserver(() => {
          /* noop */
        }),
      )

      jest.advanceTimersByTime(timeIncrement)

      // report shouldn't have been called yet -- it's debounced:
      expect(mockReportFn).not.toHaveBeenCalled()

      // we should have timers for: debounce and timeoutMs
      expect(jest.getTimerCount()).toBe(2)

      jest.advanceTimersByTime(timeIncrement)

      // we should *still* have timers for: debounce and timeoutMs
      expect(jest.getTimerCount()).toBe(2)

      // still debounced:
      expect(mockReportFn).not.toHaveBeenCalled()

      jest.advanceTimersByTime(debounceMs)

      expect(mockReportFn).toHaveBeenCalledTimes(1)
      // we should have disconnected now:
      expect(mockDisconnect).toHaveBeenCalledTimes(1)

      // we should only start counting renders AFTER we activate, that's why we only have 1:
      const expectedBeaconRenderCount = 1
      const ttr = 2 * timeIncrement * expectedBeaconRenderCount
      const tti = ttr + timeIncrement + lagDuration
      const report: Report = {
        id,
        isFirstLoad: true,
        tti,
        ttr,
        lastStage: INFORMATIVE_STAGES.INITIAL,
        counts: {
          beacon: expectedBeaconRenderCount,
          observer: 1,
          // manager is 1, even though it rendered 2 times in total,
          // because we only started counting after activation
          manager: 1,
        },
        durations: {
          beacon: [timeIncrement],
          manager: [2 * timeIncrement],
          observer: [lagDuration],
        },
        timeSpent: {
          beacon: timeIncrement,
          observer: lagDuration,
          manager: ttr,
        },
        spans: expect.anything(),
        loadingStagesDuration: 0,
        includedStages: [],
        hadError: false,
        handled: true,
        flushReason: 'debounce',
      }

      expect(mockReportFn).toHaveBeenCalledTimes(1)
      const reportArgs = mockReportFn.mock.calls.at(-1)?.[0]
      expect(reportArgs).toBeDefined()
      const generatedReport = generateReport(reportArgs!)
      expect(generatedReport).toEqual(report)
      expect(generatedReport.spans).toMatchInlineSnapshot(`
        [
          {
            "data": {
              "metadata": {},
              "mountedPlacements": [
                "manager",
                "beacon",
              ],
              "source": "beacon",
              "stage": "initial",
              "timingId": "test-component",
            },
            "description": "<beacon> (1)",
            "endTime": 400,
            "relativeEndTime": 100,
            "startTime": 300,
            "type": "render",
          },
          {
            "data": {
              "metadata": {},
              "mountedPlacements": [
                "manager",
                "beacon",
              ],
              "source": "manager",
              "stage": "initial",
              "timingId": "test-component",
            },
            "description": "<manager> (1)",
            "endTime": 500,
            "relativeEndTime": 200,
            "startTime": 300,
            "type": "render",
          },
          {
            "data": {
              "metadata": {},
              "mountedPlacements": [
                "manager",
                "beacon",
              ],
              "source": "observer",
              "stage": "initial",
              "timingId": "test-component",
            },
            "description": "unresponsive",
            "endTime": 1100,
            "relativeEndTime": 800,
            "startTime": 600,
            "type": "unresponsive",
          },
          {
            "data": {
              "dependencyChanges": 0,
              "mountedPlacements": [
                "manager",
                "beacon",
              ],
              "previousStage": "initial",
              "stage": "rendered",
              "timeToStage": 200,
              "timingId": "test-component",
            },
            "description": "render",
            "endTime": 500,
            "relativeEndTime": 200,
            "startTime": 300,
            "type": "ttr",
          },
          {
            "data": {
              "dependencyChanges": 0,
              "mountedPlacements": [
                "manager",
                "beacon",
              ],
              "previousStage": "rendered",
              "stage": "interactive",
              "timeToStage": 600,
              "timingId": "test-component",
            },
            "description": "interactive",
            "endTime": 1100,
            "relativeEndTime": 800,
            "startTime": 300,
            "type": "tti",
          },
        ]
      `)

      // no more timers should be set by this time:
      expect(jest.getTimerCount()).toBe(0)

      renderer!.unmount()

      jest.runAllTimers()

      // an un-mount shouldn't change anything
      expect(mockReportFn).toHaveBeenCalledTimes(1)
      expect(jest.getTimerCount()).toBe(0)
    })
  })

  describe('handles errors', () => {
    it('should report metrics immediately after reaching a terminal stage (encountering an error)', () => {
      let renderer: ReactTestRenderer

      interface BeaconState {
        stage: string
      }

      let setBeaconState: (state: BeaconState) => void

      const actionLog = new ActionLog({
        debounceMs,
        timeoutMs,
        finalStages: [DEFAULT_STAGES.READY, DEFAULT_STAGES.ERROR],
      })

      const BeaconComponent = () => {
        const [{ stage }, _setState] = useState<BeaconState>({
          stage: DEFAULT_STAGES.LOADING,
        })

        setBeaconState = _setState
        useTimingMeasurement(
          {
            id,
            placement: 'beacon',
            onInternalError,
            stage,
            actionLog,
          },
          [],
        )

        return (
          <>
            <div>We are at stage:{stage}</div>
          </>
        )
      }

      const TimedTestComponent = () => {
        useTimingMeasurement(
          {
            id,
            placement: 'manager',
            onInternalError,
            reportFn: mockReportFn,
            actionLog,
          },
          [],
        )

        return (
          <>
            <div>Hello!</div>
            <BeaconComponent />
          </>
        )
      }

      expect(mockObserve).toHaveBeenCalledTimes(0)
      expect(mockDisconnect).toHaveBeenCalledTimes(0)

      // mock a browser that supports 'longtask' monitoring
      mockGetSupportedEntryTypes.mockReturnValue(['longtask'])

      act(() => {
        renderer = create(<TimedTestComponent />)
      })

      expect(renderer!.toJSON()).toMatchInlineSnapshot(`
        [
          <div>
            Hello!
          </div>,
          <div>
            We are at stage:
            loading
          </div>,
        ]
      `)

      // exhaust React's next tick timer
      jest.advanceTimersToNextTimer()

      // now we're active!
      expect(mockObserve).toHaveBeenCalledTimes(1)
      expect(mockObserve).toHaveBeenLastCalledWith({ entryTypes: ['longtask'] })
      expect(mockDisconnect).toHaveBeenCalledTimes(0)

      jest.advanceTimersByTime(timeIncrement)

      // report shouldn't have been called yet -- it's debounced:
      expect(mockReportFn).not.toHaveBeenCalled()

      // we should have timers for: debounce and timeoutMs
      expect(jest.getTimerCount()).toBe(2)

      jest.advanceTimersByTime(timeIncrement)

      // we should *still* have timers for: debounce and timeoutMs
      expect(jest.getTimerCount()).toBe(2)

      // still debounced:
      expect(mockReportFn).not.toHaveBeenCalled()

      // --- NEXT STAGE ---

      setBeaconState!({ stage: DEFAULT_STAGES.ERROR })

      // re-rendered with new data:

      expect(renderer!.toJSON()).toMatchInlineSnapshot(`
        [
          <div>
            Hello!
          </div>,
          <div>
            We are at stage:
            error
          </div>,
        ]
      `)

      // we should have timers for:
      // debounce, timeoutMs and willFlushTimeout + something from renderer
      expect(jest.getTimerCount()).toBe(4)

      // exhaust React's next tick timer
      jest.advanceTimersToNextTimer()

      // we shouldn't have any timers left
      expect(jest.getTimerCount()).toBe(0)

      expect(mockReportFn).toHaveBeenCalledTimes(1)
      // we should have disconnected now:
      expect(mockDisconnect).toHaveBeenCalledTimes(1)

      // we should only start counting renders AFTER we activate, that's why we only have 1 (error):
      const expectedBeaconRenderCount = 2
      const ttr = timeIncrement * 3
      const tti = null
      const report: Report = {
        id,
        isFirstLoad: true,
        tti,
        ttr,
        lastStage: DEFAULT_STAGES.ERROR,
        counts: {
          manager: 1,
          beacon: expectedBeaconRenderCount,
        },
        durations: {
          manager: [timeIncrement * 2],
          beacon: [100, 100],
        },
        timeSpent: {
          manager: timeIncrement * 2,
          beacon: 200,
        },
        spans: expect.anything(),
        loadingStagesDuration: 2 * timeIncrement,
        includedStages: [DEFAULT_STAGES.LOADING, DEFAULT_STAGES.ERROR],
        hadError: true,
        handled: true,
        flushReason: 'immediate send',
      }

      expect(mockReportFn).toHaveBeenCalledTimes(1)
      const reportArgs = mockReportFn.mock.calls.at(-1)?.[0]
      expect(reportArgs).toBeDefined()
      const generatedReport = generateReport(reportArgs!)
      expect(generatedReport).toEqual(report)
      expect(generatedReport.spans).toMatchInlineSnapshot(`
        Array [
          Object {
            "data": Object {
              "metadata": Object {},
              "mountedPlacements": Array [
                "manager",
                "beacon",
              ],
              "source": "beacon",
              "stage": "loading",
              "timingId": "test-component",
            },
            "description": "<beacon> (1)",
            "endTime": 100,
            "relativeEndTime": 100,
            "startTime": 0,
            "type": "render",
          },
          Object {
            "data": Object {
              "metadata": Object {},
              "mountedPlacements": Array [
                "manager",
                "beacon",
              ],
              "source": "manager",
              "stage": "loading",
              "timingId": "test-component",
            },
            "description": "<manager> (1)",
            "endTime": 200,
            "relativeEndTime": 200,
            "startTime": 0,
            "type": "render",
          },
          Object {
            "data": Object {
              "metadata": Object {},
              "mountedPlacements": Array [
                "manager",
                "beacon",
              ],
              "source": "beacon",
              "stage": "error",
              "timingId": "test-component",
            },
            "description": "<beacon> (2)",
            "endTime": 300,
            "relativeEndTime": 300,
            "startTime": 200,
            "type": "render",
          },
          Object {
            "data": Object {
              "dependencyChanges": 0,
              "metadata": Object {},
              "mountedPlacements": Array [
                "manager",
                "beacon",
              ],
              "previousStage": "loading",
              "source": "beacon",
              "stage": "error",
              "timeToStage": 200,
              "timingId": "test-component",
            },
            "description": "loading to error",
            "endTime": 200,
            "relativeEndTime": 200,
            "startTime": 0,
            "type": "stage-change",
          },
          Object {
            "data": Object {
              "dependencyChanges": 0,
              "mountedPlacements": Array [
                "manager",
                "beacon",
              ],
              "previousStage": "error",
              "stage": "rendered",
              "timeToStage": 100,
              "timingId": "test-component",
            },
            "description": "render",
            "endTime": 300,
            "relativeEndTime": 300,
            "startTime": 0,
            "type": "ttr",
          },
        ]
      `)

      renderer!.unmount()

      jest.runAllTimers()

      // an un-mount shouldn't change anything
      expect(mockReportFn).toHaveBeenCalledTimes(1)
      expect(jest.getTimerCount()).toBe(0)
    })

    it('should report metrics immediately after reaching a terminal stage, even when the component throws', () => {
      const didCatch = jest.fn<void, [Error, unknown]>()

      class TestErrorBoundary extends React.Component<{
        children: React.ReactNode
      }> {
        static getDerivedStateFromError() {
          // Update state so the next render will show the fallback UI.
          return { hasError: true }
        }

        constructor(props: { children: React.ReactNode }) {
          super(props)
          this.state = { hasError: false }
        }

        override state: { hasError: boolean }

        override componentDidCatch(error: Error, errorInfo: unknown) {
          didCatch(error, errorInfo)
        }

        override render() {
          const { hasError } = this.state

          if (hasError) {
            // You can render any custom fallback UI
            return <h1>Something went wrong.</h1>
          }

          const { children } = this.props

          return children
        }
      }

      let renderer: ReactTestRenderer

      interface BeaconState {
        stage: string
      }

      let setBeaconState: (state: BeaconState) => void

      const actionLog = new ActionLog({
        finalStages: [DEFAULT_STAGES.READY, DEFAULT_STAGES.ERROR],
        debounceMs,
        timeoutMs,
      })

      const BeaconComponent = () => {
        const [{ stage }, _setState] = useState<BeaconState>({
          stage: DEFAULT_STAGES.LOADING,
        })

        setBeaconState = _setState
        useTimingMeasurement(
          {
            id,
            placement: 'beacon',
            onInternalError,
            stage,
            actionLog,
          },
          [],
        )
        if (stage === DEFAULT_STAGES.ERROR) {
          throw new Error('Something went wrong.')
        }

        return (
          <>
            <div>We are at stage:{stage}</div>
          </>
        )
      }

      const TimedTestComponent = () => {
        useTimingMeasurement(
          {
            id,
            placement: 'manager',
            onInternalError,
            reportFn: mockReportFn,
            actionLog,
          },
          [],
        )

        return (
          <>
            <div>Hello!</div>
            <BeaconComponent />
          </>
        )
      }

      expect(mockObserve).toHaveBeenCalledTimes(0)
      expect(mockDisconnect).toHaveBeenCalledTimes(0)

      // mock a browser that supports 'longtask' monitoring
      mockGetSupportedEntryTypes.mockReturnValue(['longtask'])
      // try {
      act(() => {
        renderer = create(
          <TestErrorBoundary>
            <TimedTestComponent />
          </TestErrorBoundary>,
        )
      })

      expect(renderer!.toJSON()).toMatchInlineSnapshot(`
        [
          <div>
            Hello!
          </div>,
          <div>
            We are at stage:
            loading
          </div>,
        ]
      `)

      // exhaust React's next tick timer
      jest.advanceTimersToNextTimer()

      // now we're active!
      expect(mockObserve).toHaveBeenCalledTimes(1)
      expect(mockObserve).toHaveBeenLastCalledWith({ entryTypes: ['longtask'] })
      expect(mockDisconnect).toHaveBeenCalledTimes(0)

      jest.advanceTimersByTime(timeIncrement)

      // report shouldn't have been called yet -- it's debounced:
      expect(mockReportFn).not.toHaveBeenCalled()

      // we should have timers for: debounce and timeoutMs
      expect(jest.getTimerCount()).toBe(2)

      jest.advanceTimersByTime(timeIncrement)

      // we should *still* have timers for: debounce and timeoutMs
      expect(jest.getTimerCount()).toBe(2)

      // still debounced:
      expect(mockReportFn).not.toHaveBeenCalled()

      // --- NEXT STAGE ---

      setBeaconState!({ stage: DEFAULT_STAGES.ERROR })

      // re-rendered with new data:

      expect(renderer!.toJSON()).toMatchInlineSnapshot(`
        <h1>
          Something went wrong.
        </h1>
      `)

      // exhaust React's next tick timer
      jest.advanceTimersToNextTimer()

      // we shouldn't have timers for: debounce and timeoutMs
      expect(jest.getTimerCount()).toBe(0)

      expect(mockReportFn).toHaveBeenCalledTimes(1)
      // we should have disconnected now:
      expect(mockDisconnect).toHaveBeenCalledTimes(1)

      // we should only start counting renders AFTER we activate, that's why we only have 1 (error):
      const expectedBeaconRenderCount = 2
      const ttr = timeIncrement * expectedBeaconRenderCount
      const report: Report = {
        id,
        isFirstLoad: true,
        tti: null,
        ttr,
        lastStage: DEFAULT_STAGES.ERROR,
        counts: {
          manager: 1,
          // minus 1, because the throw would have caused the 2nd time not to render fully:
          beacon: expectedBeaconRenderCount - 1,
        },
        durations: {
          manager: [200],
          beacon: [100],
        },
        timeSpent: {
          manager: timeIncrement * 2,
          beacon: timeIncrement,
        },
        spans: expect.anything(),
        loadingStagesDuration: timeIncrement * 2,
        includedStages: [DEFAULT_STAGES.LOADING, DEFAULT_STAGES.ERROR],
        hadError: true,
        handled: false,
        flushReason: 'immediate send',
      }

      expect(mockReportFn).toHaveBeenCalledTimes(1)
      const reportArgs = mockReportFn.mock.calls.at(-1)?.[0]
      expect(reportArgs).toBeDefined()
      const generatedReport = generateReport(reportArgs!)
      expect(generatedReport).toEqual(report)
      expect(generatedReport.spans).toMatchInlineSnapshot(`
        Array [
          Object {
            "data": Object {
              "metadata": Object {},
              "mountedPlacements": Array [
                "manager",
                "beacon",
              ],
              "source": "beacon",
              "stage": "loading",
              "timingId": "test-component",
            },
            "description": "<beacon> (1)",
            "endTime": 100,
            "relativeEndTime": 100,
            "startTime": 0,
            "type": "render",
          },
          Object {
            "data": Object {
              "metadata": Object {},
              "mountedPlacements": Array [
                "manager",
                "beacon",
              ],
              "source": "manager",
              "stage": "loading",
              "timingId": "test-component",
            },
            "description": "<manager> (1)",
            "endTime": 200,
            "relativeEndTime": 200,
            "startTime": 0,
            "type": "render",
          },
          Object {
            "data": Object {
              "dependencyChanges": 0,
              "metadata": Object {},
              "mountedPlacements": Array [
                "manager",
                "beacon",
              ],
              "previousStage": "loading",
              "source": "beacon",
              "stage": "error",
              "timeToStage": 200,
              "timingId": "test-component",
            },
            "description": "loading to error",
            "endTime": 200,
            "relativeEndTime": 200,
            "startTime": 0,
            "type": "stage-change",
          },
          Object {
            "data": Object {
              "dependencyChanges": 0,
              "mountedPlacements": Array [
                "manager",
                "beacon",
              ],
              "previousStage": "error",
              "stage": "incomplete-render",
              "timeToStage": 0,
              "timingId": "test-component",
            },
            "description": "render",
            "endTime": 200,
            "relativeEndTime": 200,
            "startTime": 0,
            "type": "ttr",
          },
        ]
      `)

      renderer!.unmount()

      jest.runAllTimers()

      // an un-mount shouldn't change anything
      expect(mockReportFn).toHaveBeenCalledTimes(1)
      expect(jest.getTimerCount()).toBe(0)
    })
  })
})
