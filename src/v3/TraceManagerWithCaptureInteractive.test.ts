import './testUtility/asciiTimelineSerializer'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vitest as jest,
} from 'vitest'
import { DEFAULT_INTERACTIVE_TIMEOUT_DURATION } from './constants'
import { createQuietWindowDurationCalculator } from './getDynamicQuietWindowDuration'
import * as matchSpan from './matchSpan'
import { type TicketIdRelationSchemasFixture } from './testUtility/fixtures/relationSchemas'
import {
  Check,
  getSpansFromTimeline,
  LongTask,
  Render,
} from './testUtility/makeTimeline'
import { processSpans } from './testUtility/processSpans'
import { TraceManager } from './TraceManager'
import type { AnyPossibleReportFn } from './types'

const GOOGLES_QUIET_WINDOW_DURATION = 2_000
const GOOGLES_CLUSTER_PADDING = 1_000
const GOOGLES_HEAVY_CLUSTER_THRESHOLD = 250

const cpuIdleProcessorOptions = {
  getQuietWindowDuration: () => GOOGLES_QUIET_WINDOW_DURATION,
  clusterPadding: GOOGLES_CLUSTER_PADDING,
  heavyClusterThreshold: GOOGLES_HEAVY_CLUSTER_THRESHOLD,
}

describe('TraceManager with Capture Interactivity', () => {
  let reportFn: jest.Mock
  let generateId: jest.Mock
  let reportErrorFn: jest.Mock
  const DEFAULT_COLDBOOT_TIMEOUT_DURATION = 45_000

  jest.useFakeTimers({
    now: 0,
  })

  let id = 0
  beforeEach(() => {
    reportFn = jest.fn<AnyPossibleReportFn<TicketIdRelationSchemasFixture>>()
    id = 0
    generateId = jest.fn(() => `id-${id++}`)
    reportErrorFn = jest.fn()
  })

  afterEach(() => {
    jest.clearAllMocks()
    jest.clearAllTimers()
  })

  it('correctly captures trace while waiting the long tasks to settle', () => {
    const traceManager = new TraceManager({
      relationSchemas: { ticket: { ticketId: String } },
      reportFn,
      generateId,
      reportErrorFn,
    })
    const tracer = traceManager.createTracer({
      name: 'ticket.operation',
      type: 'operation',
      relationSchemaName: 'ticket',
      requiredSpans: [{ name: 'end' }],
      captureInteractive: cpuIdleProcessorOptions,
      variants: {
        cold_boot: {
          timeout: DEFAULT_COLDBOOT_TIMEOUT_DURATION,
        },
      },
    })

    tracer.start({
      relatedTo: { ticketId: '1' },
      variant: 'cold_boot',
    })

    // prettier-ignore
    const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
      Events: ${Render('start', 0)}-----${Render('end', 0)}-----${LongTask(50)}------<===5s===>---------${Check}
      Time:   ${0}                      ${2_000}                ${2_001}                                ${2_001 + DEFAULT_INTERACTIVE_TIMEOUT_DURATION}
    `
    processSpans(spans, traceManager)
    expect(reportFn).toHaveBeenCalled()

    const report: Parameters<
      AnyPossibleReportFn<TicketIdRelationSchemasFixture>
    >[0] = reportFn.mock.calls[0][0]
    expect(
      report.entries.map(
        (spanAndAnnotation) => spanAndAnnotation.span.performanceEntry,
      ),
    ).toMatchInlineSnapshot(`
        events    | start         end
        timeline  | |-<⋯ +2000 ⋯>-|
        time (ms) | 0             2000
      `)
    expect(report.name).toBe('ticket.operation')
    expect(report.duration).toBe(2_000)
    expect(report.additionalDurations.startTillInteractive).toBe(2_000)
    expect(report.status).toBe('ok')
    expect(report.interruptionReason).toBeUndefined()
  })

  it('completes the trace with waiting-for-interactive-timeout', () => {
    const traceManager = new TraceManager({
      relationSchemas: { ticket: { ticketId: String } },
      reportFn,
      generateId,
      reportErrorFn,
    })
    const interactiveTimeout = 5_000
    const tracer = traceManager.createTracer({
      name: 'ticket.operation',
      type: 'operation',
      relationSchemaName: 'ticket',
      requiredSpans: [{ name: 'end' }],
      captureInteractive: {
        ...cpuIdleProcessorOptions,
        timeout: interactiveTimeout,
      },
      variants: {
        cold_boot: {
          timeout: DEFAULT_COLDBOOT_TIMEOUT_DURATION,
        },
      },
    })
    tracer.start({
      relatedTo: {
        ticketId: '1',
      },
      variant: 'cold_boot',
    })

    // prettier-ignore
    const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
      Events: ${Render('start', 0)}-----${Render('end', 0)}-----${LongTask(interactiveTimeout)}
      Time:   ${0}                      ${2_000}                ${2_050}
      `
    processSpans(spans, traceManager)
    expect(reportFn).toHaveBeenCalled()

    const report: Parameters<
      AnyPossibleReportFn<TicketIdRelationSchemasFixture>
    >[0] = reportFn.mock.calls[0][0]
    expect(
      report.entries.map(
        (spanAndAnnotation) => spanAndAnnotation.span.performanceEntry,
      ),
    ).toMatchInlineSnapshot(`
        events    | start         end
        timeline  | |-<⋯ +2000 ⋯>-|
        time (ms) | 0             2000
      `)
    expect(report.name).toBe('ticket.operation')
    expect(report.duration).toBe(2_000)
    expect(report.interruptionReason).toBe('waiting-for-interactive-timeout')
    expect(report.additionalDurations.startTillInteractive).toBeNull()
    expect(report.status).toBe('ok')
  })

  it('completes the trace when interrupted during waiting for capture interactive to finish', () => {
    const traceManager = new TraceManager({
      relationSchemas: { ticket: { ticketId: String } },
      reportFn,
      generateId,
      reportErrorFn,
    })
    const tracer = traceManager.createTracer({
      name: 'ticket.interrupt-during-long-task-operation',
      type: 'operation',
      relationSchemaName: 'ticket',
      requiredSpans: [matchSpan.withName('end')],
      interruptOnSpans: [matchSpan.withName('interrupt')],
      captureInteractive: cpuIdleProcessorOptions,
      variants: {
        cold_boot: {
          timeout: DEFAULT_COLDBOOT_TIMEOUT_DURATION,
        },
      },
    })
    tracer.start({
      relatedTo: {
        ticketId: '1',
      },
      variant: 'cold_boot',
    })

    // prettier-ignore
    const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
      Events: ${Render('start', 0)}---------${Render('end', 0)}---------${Render('interrupt', 0)}--${LongTask(100)}--${Check}
      Time:   ${0}                          ${200}                      ${201}                     ${300}            ${5_000}
      `

    processSpans(spans, traceManager)
    expect(reportFn).toHaveBeenCalled()

    const report: Parameters<
      AnyPossibleReportFn<TicketIdRelationSchemasFixture>
    >[0] = reportFn.mock.calls[0][0]
    expect(
      report.entries.map(
        (spanAndAnnotation) => spanAndAnnotation.span.performanceEntry,
      ),
    ).toMatchInlineSnapshot(`
        events    | start        end
        timeline  | |-<⋯ +200 ⋯>-|
        time (ms) | 0            200
      `)
    expect(report.name).toBe('ticket.interrupt-during-long-task-operation')
    expect(report.duration).toBe(200)
    expect(report.additionalDurations.startTillInteractive).toBeNull()
    expect(report.status).toBe('ok')
    expect(report.interruptionReason).toBe('matched-on-interrupt')
  })

  it('timeouts the trace while deboucing AND the last span is past the timeout duration', () => {
    const traceManager = new TraceManager({
      relationSchemas: { ticket: { ticketId: String } },
      reportFn,
      generateId,
      reportErrorFn,
    })
    const tracer = traceManager.createTracer({
      name: 'ticket.debounce-then-interrupted-operation',
      type: 'operation',
      relationSchemaName: 'ticket',
      requiredSpans: [{ name: 'end' }],
      debounceOnSpans: [{ name: 'debounce' }],
      captureInteractive: cpuIdleProcessorOptions,
      debounceWindow: 300,
      variants: {
        cold_boot: {
          timeout: DEFAULT_COLDBOOT_TIMEOUT_DURATION,
        },
      },
    })
    tracer.start({
      relatedTo: {
        ticketId: '1',
      },
      variant: 'cold_boot',
    })

    // prettier-ignore
    const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
      Events: ${Render('start', 0)}-----${Render('end', 0)}-----${Render('debounce', 0)}------${Check}
      Time:   ${0}                      ${50}                   ${100}                        ${DEFAULT_COLDBOOT_TIMEOUT_DURATION + 100}
      `
    processSpans(spans, traceManager)
    expect(reportFn).toHaveBeenCalled()

    const report: Parameters<
      AnyPossibleReportFn<TicketIdRelationSchemasFixture>
    >[0] = reportFn.mock.calls[0][0]
    expect(
      report.entries.map(
        (spanAndAnnotation) => spanAndAnnotation.span.performanceEntry,
      ),
    ).toMatchInlineSnapshot(`
          events    | start       end         debounce
          timeline  | |-<⋯ +50 ⋯>-|-<⋯ +50 ⋯>-|
          time (ms) | 0           50          100
        `)
    expect(report.name).toBe('ticket.debounce-then-interrupted-operation')
    expect(report.status).toBe('interrupted')
    expect(report.duration).toBeNull()
    expect(report.interruptionReason).toBe('timeout')
    expect(report.additionalDurations.startTillInteractive).toBeNull()
  })

  it('completes the trace when debouncing is done AND is waiting for capture interactive to finish', () => {
    const traceManager = new TraceManager({
      relationSchemas: { ticket: { ticketId: String } },
      reportFn,
      generateId,
      reportErrorFn,
    })
    const CUSTOM_CAPTURE_INTERACTIVE_TIMEOUT = 300
    const tracer = traceManager.createTracer({
      name: 'ticket.debounce-then-interrupted-operation',
      type: 'operation',
      relationSchemaName: 'ticket',
      requiredSpans: [{ name: 'end' }],
      debounceOnSpans: [{ name: 'debounce' }],
      captureInteractive: {
        ...cpuIdleProcessorOptions,
        timeout: CUSTOM_CAPTURE_INTERACTIVE_TIMEOUT,
      },
      debounceWindow: 100,
      variants: {
        cold_boot: {
          timeout: DEFAULT_COLDBOOT_TIMEOUT_DURATION,
        },
      },
    })
    tracer.start({
      relatedTo: {
        ticketId: '1',
      },
      variant: 'cold_boot',
    })

    // prettier-ignore
    const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
      Events: ${Render('start', 0)}-----${Render('end', 0)}---------------------${Render('debounce', 100)}------------------${Check}
      Time:   ${0}                      ${DEFAULT_COLDBOOT_TIMEOUT_DURATION - 500}       ${DEFAULT_COLDBOOT_TIMEOUT_DURATION - 499}           ${DEFAULT_COLDBOOT_TIMEOUT_DURATION + 1}
      `
    processSpans(spans, traceManager)
    expect(reportFn).toHaveBeenCalled()

    const report: Parameters<
      AnyPossibleReportFn<TicketIdRelationSchemasFixture>
    >[0] = reportFn.mock.calls[0][0]
    expect(
      report.entries.map(
        (spanAndAnnotation) => spanAndAnnotation.span.performanceEntry,
      ),
    ).toMatchInlineSnapshot(`
        events    | start          end
        timeline  | |-<⋯ +44500 ⋯>-|
        time (ms) | 0              44500
      `)
    expect(report.name).toBe('ticket.debounce-then-interrupted-operation')
    expect(report.duration).toBe(44_500)
    expect(report.additionalDurations.startTillInteractive).toBeNull()
    expect(report.status).toBe('ok')
    expect(report.interruptionReason).toBe('timeout')
  })

  it('uses getQuietWindowDuration from capture interactive config', () => {
    const traceManager = new TraceManager({
      relationSchemas: { ticket: { ticketId: String } },
      reportFn,
      generateId,
      reportErrorFn,
    })
    const CUSTOM_QUIET_WINDOW_DURATION = 2_000
    const TRACE_DURATION = 1_000
    const getQuietWindowDuration = jest
      .fn()
      .mockReturnValue(CUSTOM_QUIET_WINDOW_DURATION)
    const tracer = traceManager.createTracer({
      name: 'ticket.operation',
      type: 'operation',
      relationSchemaName: 'ticket',
      requiredSpans: [{ name: 'end' }],
      captureInteractive: {
        ...cpuIdleProcessorOptions,
        timeout: 100,
        getQuietWindowDuration,
      },
      variants: {
        cold_boot: {
          timeout: DEFAULT_COLDBOOT_TIMEOUT_DURATION,
        },
      },
    })
    tracer.start({
      relatedTo: {
        ticketId: '1',
      },
      variant: 'cold_boot',
    })

    // prettier-ignore
    const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
      Events: ${Render('start', 0)}-----${Render('end', 0)}-----${LongTask(5)}------------${LongTask(5)}-----${Check}
      Time:   ${0}                      ${TRACE_DURATION}       ${1_001}                  ${1_050}           ${1_200}
      `

    processSpans(spans, traceManager)
    expect(reportFn).toHaveBeenCalled()
    const report: Parameters<
      AnyPossibleReportFn<TicketIdRelationSchemasFixture>
    >[0] = reportFn.mock.calls[0][0]

    expect(
      report.entries.map(
        (spanAndAnnotation) => spanAndAnnotation.span.performanceEntry,
      ),
    ).toMatchInlineSnapshot(`
        events    | start         end
        timeline  | |-<⋯ +1000 ⋯>-|
        time (ms) | 0             1000
      `)
    expect(report.name).toBe('ticket.operation')
    expect(report.duration).toBe(TRACE_DURATION)
    expect(report.additionalDurations.startTillInteractive).toBeNull()
    expect(report.status).toBe('ok')
    expect(report.interruptionReason).toBe('waiting-for-interactive-timeout')
    expect(getQuietWindowDuration).toHaveBeenCalled()
    expect(getQuietWindowDuration).toHaveBeenCalledWith(1_055, TRACE_DURATION)
  })

  it('uses createQuietWindowDurationCalculator for getQuietWindowDuration in capture interactive config', () => {
    const traceManager = new TraceManager({
      relationSchemas: { ticket: { ticketId: String } },
      reportFn,
      generateId,
      reportErrorFn,
    })
    const TRACE_DURATION = 1_000

    const tracer = traceManager.createTracer({
      name: 'ticket.operation',
      type: 'operation',
      relationSchemaName: 'ticket',
      requiredSpans: [{ name: 'end' }],
      captureInteractive: {
        ...cpuIdleProcessorOptions,
        timeout: 1_000,
        getQuietWindowDuration: createQuietWindowDurationCalculator(),
      },
      variants: {
        cold_boot: {
          timeout: DEFAULT_COLDBOOT_TIMEOUT_DURATION,
        },
      },
    })
    tracer.start({
      relatedTo: {
        ticketId: '1',
      },
      variant: 'cold_boot',
    })

    // prettier-ignore
    const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
      Events: ${Render('start', 0)}-----${Render('end', 0)}-----------${LongTask(5)}----------------${LongTask(50)}---${Check}
      Time:   ${0}                      ${TRACE_DURATION}             ${1_001}                      ${1_945}          ${2_001}
      `

    processSpans(spans, traceManager)
    expect(reportFn).toHaveBeenCalled()
    const report: Parameters<
      AnyPossibleReportFn<TicketIdRelationSchemasFixture>
    >[0] = reportFn.mock.calls[0][0]

    expect(
      report.entries.map(
        (spanAndAnnotation) => spanAndAnnotation.span.performanceEntry,
      ),
    ).toMatchInlineSnapshot(`
        events    | start         end
        timeline  | |-<⋯ +1000 ⋯>-|
        time (ms) | 0             1000
      `)
    expect(report.name).toBe('ticket.operation')
    expect(report.duration).toBe(TRACE_DURATION)
    expect(report.additionalDurations.startTillInteractive).toBeNull()
    expect(report.status).toBe('ok')
    expect(report.interruptionReason).toBe('waiting-for-interactive-timeout')
  })

  it('No long tasks after FMP, FirstCPUIdle immediately after FMP + quiet window', () => {
    const traceManager = new TraceManager({
      relationSchemas: { ticket: { ticketId: String } },
      reportFn,
      generateId,
      reportErrorFn,
    })
    const tracer = traceManager.createTracer({
      name: 'ticket.operation',
      type: 'operation',
      relationSchemaName: 'ticket',
      requiredSpans: [{ name: 'end' }],
      captureInteractive: cpuIdleProcessorOptions,
      variants: {
        cold_boot: {
          timeout: DEFAULT_COLDBOOT_TIMEOUT_DURATION,
        },
      },
    })
    tracer.start({
      relatedTo: {
        ticketId: '1',
      },
      variant: 'cold_boot',
    })

    // prettier-ignore
    const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
      Events: ${Render('start', 0)}-----${Render('end', 0)}----------${LongTask(400)}-----${Check}
      Time:   ${0}                      ${200}                       ${4_600}             ${5_000}
      `

    processSpans(spans, traceManager)
    expect(reportFn).toHaveBeenCalled()

    const report: Parameters<
      AnyPossibleReportFn<TicketIdRelationSchemasFixture>
    >[0] = reportFn.mock.calls[0][0]
    expect(
      report.entries.map(
        (spanAndAnnotation) => spanAndAnnotation.span.performanceEntry,
      ),
    ).toMatchInlineSnapshot(`
        events    | start        end
        timeline  | |-<⋯ +200 ⋯>-|
        time (ms) | 0            200
      `)

    expect(report.name).toBe('ticket.operation')
    expect(report.duration).toBe(200)
    expect(report.additionalDurations.startTillInteractive).toBe(200)
    expect(report.status).toBe('ok')
    expect(report.interruptionReason).toBeUndefined()
  })

  it('One light cluster after FMP, FirstCPUIdle at FMP', () => {
    const traceManager = new TraceManager({
      relationSchemas: { ticket: { ticketId: String } },
      reportFn,
      generateId,
      reportErrorFn,
    })
    const tracer = traceManager.createTracer({
      name: 'ticket.operation',
      type: 'operation',
      relationSchemaName: 'ticket',
      requiredSpans: [{ name: 'end' }],
      captureInteractive: cpuIdleProcessorOptions,
      variants: {
        cold_boot: {
          timeout: DEFAULT_COLDBOOT_TIMEOUT_DURATION,
        },
      },
    })
    tracer.start({
      relatedTo: {
        ticketId: '1',
      },
      variant: 'cold_boot',
    })

    // prettier-ignore
    const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
      Events: ${Render('start', 0)}-----${Render('end', 0)}----------${LongTask(50)}------${LongTask(50)}-----${LongTask(50)}---------${Check}
      Time:   ${0}                      ${200}                       ${300}               ${400}              ${450}                  ${3_050}
      `

    processSpans(spans, traceManager)
    expect(reportFn).toHaveBeenCalled()

    const report: Parameters<
      AnyPossibleReportFn<TicketIdRelationSchemasFixture>
    >[0] = reportFn.mock.calls[0][0]
    expect(
      report.entries.map(
        (spanAndAnnotation) => spanAndAnnotation.span.performanceEntry,
      ),
    ).toMatchInlineSnapshot(`
        events    | start        end
        timeline  | |-<⋯ +200 ⋯>-|
        time (ms) | 0            200
      `)

    expect(report.name).toBe('ticket.operation')
    expect(report.duration).toBe(200)
    expect(report.additionalDurations.startTillInteractive).toBe(200)
    expect(report.status).toBe('ok')
    expect(report.interruptionReason).toBeUndefined()
  })

  it('One heavy cluster after FMP, FirstCPUIdle after the cluster', () => {
    const traceManager = new TraceManager({
      relationSchemas: { ticket: { ticketId: String } },
      reportFn,
      generateId,
      reportErrorFn,
    })
    const tracer = traceManager.createTracer({
      name: 'ticket.operation',
      type: 'operation',
      relationSchemaName: 'ticket',
      requiredSpans: [{ name: 'end' }],
      captureInteractive: cpuIdleProcessorOptions,
      variants: {
        cold_boot: {
          timeout: DEFAULT_COLDBOOT_TIMEOUT_DURATION,
        },
      },
    })
    tracer.start({
      relatedTo: {
        ticketId: '1',
      },
      variant: 'cold_boot',
    })

    // prettier-ignore
    const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
      Events: ${Render('start', 0)}-----${Render('end', 0)}--${LongTask(50)}}-${LongTask(200)}-----${LongTask(50)}-----------${Check}
      Time:   ${0}                      ${200}               ${300}           ${400}                ${650}                   ${3_200}
      `

    processSpans(spans, traceManager)
    expect(reportFn).toHaveBeenCalled()

    const report: Parameters<
      AnyPossibleReportFn<TicketIdRelationSchemasFixture>
    >[0] = reportFn.mock.calls[0][0]
    expect(
      report.entries.map(
        (spanAndAnnotation) => spanAndAnnotation.span.performanceEntry,
      ),
    ).toMatchInlineSnapshot(`
        events    | start        end         task(50)    task(200)                      task(50)
        timeline  | |-<⋯ +200 ⋯>-|-----------[++++]------[+++++++++++++++++++++++]------[++++]-
        time (ms) | 0            200         300         400                            650
      `)

    expect(report.name).toBe('ticket.operation')
    expect(report.duration).toBe(200)
    expect(report.additionalDurations.startTillInteractive).toBe(700)
    // TESTING TODO: are we testing enough of first idle time?
    expect(report.additionalDurations.completeTillInteractive).toBe(500)
    expect(report.status).toBe('ok')
    expect(report.interruptionReason).toBeUndefined()
  })

  it('Multiple heavy clusters, FirstCPUIdle updated to end of last cluster', () => {
    const traceManager = new TraceManager({
      relationSchemas: { ticket: { ticketId: String } },
      reportFn,
      generateId,
      reportErrorFn,
    })
    const tracer = traceManager.createTracer({
      name: 'ticket.operation',
      type: 'operation',
      relationSchemaName: 'ticket',
      requiredSpans: [{ name: 'end' }],
      captureInteractive: cpuIdleProcessorOptions,
      variants: {
        cold_boot: {
          timeout: DEFAULT_COLDBOOT_TIMEOUT_DURATION,
        },
      },
    })
    tracer.start({
      relatedTo: {
        ticketId: '1',
      },
      variant: 'cold_boot',
    })

    // prettier-ignore
    const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
      Events: ${Render('start', 0)}-----${Render('end', 0)}-----${LongTask(200)}-----${LongTask(200)}-----${LongTask(200)}-----${Check}
      Time:   ${0}                      ${200}                 ${300}              ${900}              ${1_500}             ${3_800}
      `

    processSpans(spans, traceManager)
    expect(reportFn).toHaveBeenCalled()

    const report: Parameters<
      AnyPossibleReportFn<TicketIdRelationSchemasFixture>
    >[0] = reportFn.mock.calls[0][0]
    expect(
      report.entries.map(
        (spanAndAnnotation) => spanAndAnnotation.span.performanceEntry,
      ),
    ).toMatchInlineSnapshot(`
        events    | start        end    task(200)                 task(200)                task(200)
        timeline  | |------------|------[+++++++++++]-<⋯ +400 ⋯>--[+++++++++++]-<⋯ +400 ⋯>-[+++++++++++]
        time (ms) | 0            200    300                       900                      1500
      `)

    const lastLongTask = spans.at(-2)!
    const expectedResult = lastLongTask.startTime.now + lastLongTask.duration

    expect(report.name).toBe('ticket.operation')
    expect(report.duration).toBe(200)
    expect(report.additionalDurations.startTillInteractive).toBe(expectedResult)
    expect(report.status).toBe('ok')
    expect(report.interruptionReason).toBeUndefined()
  })

  it('Checking before the quiet window has passed - no long tasks processed, FirstCPUIdle not found', () => {
    const traceManager = new TraceManager({
      relationSchemas: { ticket: { ticketId: String } },
      reportFn,
      generateId,
      reportErrorFn,
    })
    const tracer = traceManager.createTracer({
      name: 'ticket.operation',
      type: 'operation',
      relationSchemaName: 'ticket',
      requiredSpans: [{ name: 'end' }],
      captureInteractive: cpuIdleProcessorOptions,
      variants: {
        cold_boot: {
          timeout: DEFAULT_COLDBOOT_TIMEOUT_DURATION,
        },
      },
    })
    tracer.start({
      relatedTo: {
        ticketId: '1',
      },
      variant: 'cold_boot',
    })

    // prettier-ignore
    const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
      Events: ${Render('start', 0)}-----${Render('end', 0)}-----${Check}
      Time:   ${0}                      ${200}                  ${2_400}
      `

    processSpans(spans, traceManager)
    expect(reportFn).toHaveBeenCalled()

    const report: Parameters<
      AnyPossibleReportFn<TicketIdRelationSchemasFixture>
    >[0] = reportFn.mock.calls[0][0]
    expect(
      report.entries.map(
        (spanAndAnnotation) => spanAndAnnotation.span.performanceEntry,
      ),
    ).toMatchInlineSnapshot(`
        events    | start        end
        timeline  | |-<⋯ +200 ⋯>-|
        time (ms) | 0            200
      `)

    expect(report.name).toBe('ticket.operation')
    expect(report.duration).toBe(200)
    expect(report.additionalDurations.startTillInteractive).toBe(200)
    expect(report.status).toBe('ok')
    expect(report.interruptionReason).toBeUndefined()
  })

  it('completes the trace with one heavy cluster followed by two light clusters, value is after 1st heavy cluster', () => {
    const traceManager = new TraceManager({
      relationSchemas: { ticket: { ticketId: String } },
      reportFn,
      generateId,
      reportErrorFn,
    })
    const tracer = traceManager.createTracer({
      name: 'ticket.operation',
      type: 'operation',
      relationSchemaName: 'ticket',
      requiredSpans: [{ name: 'end' }],
      captureInteractive: cpuIdleProcessorOptions,
      variants: {
        cold_boot: {
          timeout: DEFAULT_COLDBOOT_TIMEOUT_DURATION,
        },
      },
    })
    tracer.start({
      relatedTo: {
        ticketId: '1',
      },
      variant: 'cold_boot',
    })

    // prettier-ignore
    const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
      Events: ${Render('start', 0)}-----${Render('end', 0)}-----${LongTask(200)}-----${LongTask(100)}-----${LongTask(200)}-----${LongTask(200)}-----${Check}
      Time:   ${0}                      ${200}                  ${300}               ${600}               ${1_700}             ${2_900}             ${4_650}
        }
    `

    processSpans(spans, traceManager)
    expect(reportFn).toHaveBeenCalled()

    const report: Parameters<
      AnyPossibleReportFn<TicketIdRelationSchemasFixture>
    >[0] = reportFn.mock.calls[0][0]
    expect(
      report.entries.map(
        (spanAndAnnotation) => spanAndAnnotation.span.performanceEntry,
      ),
    ).toMatchInlineSnapshot(`
        events    | start        end         task(200)                            task(100)
        timeline  | |-<⋯ +200 ⋯>-|-----------[+++++++++++++++++++++++]------------[++++++++++]-
        time (ms) | 0            200         300                                  600
      `)

    const lastHeavyClusterLongTask = spans.at(3)!
    const expectedResult =
      lastHeavyClusterLongTask.startTime.now + lastHeavyClusterLongTask.duration

    expect(report.name).toBe('ticket.operation')
    expect(report.duration).toBe(200)
    expect(report.additionalDurations.startTillInteractive).toBe(expectedResult)
    expect(report.status).toBe('ok')
    expect(report.interruptionReason).toBeUndefined()
  })

  it('completes the trace with continuous heavy clusters', () => {
    const traceManager = new TraceManager({
      relationSchemas: { ticket: { ticketId: String } },
      reportFn,
      generateId,
      reportErrorFn,
    })
    const tracer = traceManager.createTracer({
      name: 'ticket.operation',
      type: 'operation',
      relationSchemaName: 'ticket',
      requiredSpans: [{ name: 'end' }],
      captureInteractive: cpuIdleProcessorOptions,
      variants: {
        cold_boot: {
          timeout: DEFAULT_COLDBOOT_TIMEOUT_DURATION,
        },
      },
    })
    tracer.start({
      relatedTo: {
        ticketId: '1',
      },
      variant: 'cold_boot',
    })

    // prettier-ignore
    const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
      Events: ${Render('start', 0)}-----${Render('end', 0)}-----${LongTask(300)}-----${LongTask(300)}-----${LongTask(300)}-----${LongTask(300)}-----${LongTask(300)}-----${LongTask(300)}-----${LongTask(300)}-----${LongTask(300)}-----${LongTask(300)}-----${LongTask(300)}-----${LongTask(300)}-----${LongTask(300)}-----${LongTask(300)}-----${LongTask(300)}-----${Check}
      Time:   ${0}                      ${200}                  ${550}               ${900}               ${1_250}             ${1_600}             ${1_950}             ${2_300}             ${2_650}             ${3_000}             ${3_350}             ${3_700}             ${4_050}             ${4_400}             ${4_750}             ${5_100}             ${7_450}
      `

    processSpans(spans, traceManager)
    expect(reportFn).toHaveBeenCalled()

    const report: Parameters<
      AnyPossibleReportFn<TicketIdRelationSchemasFixture>
    >[0] = reportFn.mock.calls[0][0]
    expect(
      report.entries.map(
        (spanAndAnnotation) => spanAndAnnotation.span.performanceEntry,
      ),
    ).toMatchInlineSnapshot(`
        events    |   end        task(300) task(300) task(300) task(300) task(300) task(300) task(300)
        events    | start   task(300) task(300) task(300) task(300) task(300) task(300) task(300)
        timeline  | |-|-----[++]-[++]-[++]-[++]-[++]-[++]-[++]-[++]-[++]-[++]-[++]-[++]-[++]-[++]-
        time (ms) | 0 200   550  900  1250 1600 1950 2300 2650 3000 3350 3700 4050 4400 4750 5100
      `)

    expect(report.name).toBe('ticket.operation')
    expect(report.duration).toBe(200)
    expect(report.additionalDurations.startTillInteractive).toBe(5_400)
    expect(report.status).toBe('ok')
    expect(report.interruptionReason).toBeUndefined()
  })

  it('completes the trace with a light cluster followed by a heavy cluster a second later, FirstCPUIdle updated', () => {
    const traceManager = new TraceManager({
      relationSchemas: { ticket: { ticketId: String } },
      reportFn,
      generateId,
      reportErrorFn,
    })
    const tracer = traceManager.createTracer({
      name: 'ticket.operation',
      type: 'operation',
      relationSchemaName: 'ticket',
      requiredSpans: [{ name: 'end' }],
      captureInteractive: cpuIdleProcessorOptions,
      variants: {
        cold_boot: {
          timeout: DEFAULT_COLDBOOT_TIMEOUT_DURATION,
        },
      },
    })
    tracer.start({
      relatedTo: {
        ticketId: '1',
      },
      variant: 'cold_boot',
    })

    // prettier-ignore
    const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
      Events: ${Render('start', 0)}-----${Render('end', 0)}-----${LongTask(50)}----------${LongTask(50)}----------${LongTask(50)}--------${LongTask(50)}---------${LongTask(200)}-------${LongTask(200)}--------${Check}
      Time:   ${0}                      ${200}                 ${300}                    ${350}                   ${1_450}               ${1_550}                ${1_650}               ${1_900}                ${4_150}
      `

    processSpans(spans, traceManager)
    expect(reportFn).toHaveBeenCalled()

    const report: Parameters<
      AnyPossibleReportFn<TicketIdRelationSchemasFixture>
    >[0] = reportFn.mock.calls[0][0]
    expect(
      report.entries.map(
        (spanAndAnnotation) => spanAndAnnotation.span.performanceEntry,
      ),
    ).toMatchInlineSnapshot(`
        events    |                          task(50)            task(50)
        events    | start        end    task(50)            task(50)   task(200)       task(200)
        timeline  | |------------|------[+]--[+]-<⋯ +1050 ⋯>[+]--[+]---[+++++++++++]---[+++++++++++]-
        time (ms) | 0            200    300  350            1450 1550  1650            1900
      `)

    const lastLongTask = spans.at(-2)!
    const expectedResult = lastLongTask.startTime.now + lastLongTask.duration

    expect(report.name).toBe('ticket.operation')
    expect(report.duration).toBe(200)
    expect(report.additionalDurations.startTillInteractive).toBe(expectedResult)
    expect(report.status).toBe('ok')
    expect(report.interruptionReason).toBeUndefined()
  })

  it('completes the trace with a long task overlapping FMP, FirstCPUIdle after the long task', () => {
    const traceManager = new TraceManager({
      relationSchemas: { ticket: { ticketId: String } },
      reportFn,
      generateId,
      reportErrorFn,
    })
    const tracer = traceManager.createTracer({
      name: 'ticket.operation',
      type: 'operation',
      relationSchemaName: 'ticket',
      requiredSpans: [{ name: 'end' }],
      captureInteractive: cpuIdleProcessorOptions,
      variants: {
        cold_boot: {
          timeout: DEFAULT_COLDBOOT_TIMEOUT_DURATION,
        },
      },
    })
    tracer.start({
      relatedTo: {
        ticketId: '1',
      },
      variant: 'cold_boot',
    })

    // prettier-ignore
    const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
      Events: ${Render('start', 0)}----------${LongTask(110, { start: 150 })}----${Render('end', 0)}-----${Check}
      Time:   ${0}                           ${150}                              ${200}                  ${2_500}
      `

    processSpans(spans, traceManager)
    expect(reportFn).toHaveBeenCalled()

    const report: Parameters<
      AnyPossibleReportFn<TicketIdRelationSchemasFixture>
    >[0] = reportFn.mock.calls[0][0]
    expect(
      report.entries.map(
        (spanAndAnnotation) => spanAndAnnotation.span.performanceEntry,
      ),
    ).toMatchInlineSnapshot(`
        events    | start        end
        timeline  | |-<⋯ +200 ⋯>-|
        time (ms) | 0            200
      `)

    const lastLongTask = spans.at(-2)!
    const expectedResult = lastLongTask.startTime.now + lastLongTask.duration

    expect(report.name).toBe('ticket.operation')
    expect(report.duration).toBe(200)
    expect(report.additionalDurations.startTillInteractive).toBe(expectedResult)
    expect(report.status).toBe('ok')
    expect(report.interruptionReason).toBeUndefined()
  })
})
