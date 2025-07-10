import './testUtility/asciiTimelineSerializer'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vitest,
} from 'vitest'
import {
  ticketAndUserAndGlobalRelationSchemasFixture,
  type TicketIdRelationSchemasFixture,
} from './testUtility/fixtures/relationSchemas'
import { shouldCompleteAndHaveInteractiveTime } from './testUtility/fixtures/shouldCompleteAndHaveInteractiveTime'
import { shouldNotEndWithInteractiveTimeout } from './testUtility/fixtures/shouldNotEndWithInteractiveTimeout'
import { ticketActivatedDefinition } from './testUtility/fixtures/ticket.activated'
import { TraceManager } from './TraceManager'
import type { AnyPossibleReportFn, GenerateIdFn } from './types'

interface TicketIdRelation {
  ticketId: {
    ticketId: StringConstructor
  }
}

describe('TraceManager with Fixtures', () => {
  let reportFn: jest.Mock
  let generateId: Mock<GenerateIdFn>
  let reportErrorFn: jest.Mock

  vitest.useFakeTimers({
    now: 0,
  })

  let idPerType = {
    span: 0,
    trace: 0,
    tick: 0,
  }

  beforeEach(() => {
    idPerType = {
      span: 0,
      trace: 0,
      tick: 0,
    }
    generateId = vitest.fn((type) => {
      const seq = idPerType[type]++
      return type === 'span'
        ? `id-${seq}`
        : type === 'trace'
        ? `trace-${seq}`
        : `tick-${seq}`
    })
    reportFn = vitest.fn<AnyPossibleReportFn<TicketIdRelation>>()
    reportErrorFn = vitest.fn()
  })

  afterEach(() => {
    vitest.clearAllMocks()
    vitest.clearAllTimers()
  })

  it('should complete with interactive time without interruption', () => {
    const traceManager = new TraceManager({
      relationSchemas: ticketAndUserAndGlobalRelationSchemasFixture,
      reportFn,
      generateId,
      reportErrorFn,
    })
    const fixtureEntries = shouldCompleteAndHaveInteractiveTime

    const relatedToEntry = fixtureEntries.find(
      (entry) => 'relatedTo' in entry.span,
    )!
    const relatedTo = {
      ticketId: relatedToEntry.span.relatedTo!.ticketId!,
    }

    const tracer = traceManager.createTracer(ticketActivatedDefinition)
    tracer.start({
      relatedTo,
      startTime: fixtureEntries[0]!.span.startTime,
      variant: 'cold_boot',
    })

    for (const entry of fixtureEntries) {
      traceManager.processSpan(entry.span)
    }

    expect(reportFn).toHaveBeenCalled()
    const {
      entries,
      ...report
    }: Parameters<AnyPossibleReportFn<TicketIdRelationSchemasFixture>>[0] =
      reportFn.mock.calls[0][0]

    expect(report).toMatchInlineSnapshot(`
      {
        "additionalDurations": {
          "completeTillInteractive": 0,
          "startTillInteractive": 1504.4000000059605,
          "startTillRequirementsMet": 1500.5999999940395,
        },
        "attributes": {},
        "computedRenderBeaconSpans": {
          "ConversationPane": {
            "firstRenderTillContent": 1021.7000000178814,
            "firstRenderTillData": 911.5,
            "firstRenderTillLoading": 134,
            "renderCount": 6,
            "startOffset": 482.69999998807907,
            "sumOfRenderDurations": 347.5,
          },
          "OmniComposer": {
            "firstRenderTillContent": 343.80000001192093,
            "firstRenderTillData": 127.80000001192093,
            "firstRenderTillLoading": 0,
            "renderCount": 8,
            "startOffset": 689.1999999880791,
            "sumOfRenderDurations": 346.60000002384186,
          },
          "OmniLog": {
            "firstRenderTillContent": 1009.2999999970198,
            "firstRenderTillData": 905.8999999910593,
            "firstRenderTillLoading": 112.19999998807907,
            "renderCount": 7,
            "startOffset": 491.29999999701977,
            "sumOfRenderDurations": 290.2000000178814,
          },
        },
        "computedSpans": {},
        "computedValues": {},
        "duration": 1504.4000000059605,
        "error": undefined,
        "id": "trace-0",
        "interruption": undefined,
        "name": "ticket.activated",
        "parentTraceId": undefined,
        "relatedTo": {
          "ticketId": "74",
        },
        "startTime": {
          "epoch": 1732230167488.4,
          "now": 298438.60000000894,
        },
        "status": "ok",
        "type": "operation",
        "variant": "cold_boot",
      }
    `)
    expect(report.duration).toBeCloseTo(1_504.4)
    expect(report.interruption).toBeUndefined()
    expect(report.additionalDurations.startTillInteractive).toBeCloseTo(1_504.4)
  })

  it('should not end with interruption', () => {
    const traceManager = new TraceManager({
      relationSchemas: ticketAndUserAndGlobalRelationSchemasFixture,
      reportFn,
      generateId,
      reportErrorFn,
    })
    const fixtureEntries = shouldNotEndWithInteractiveTimeout
    const relatedToEntry = fixtureEntries.find(
      (entry) => 'relatedTo' in entry.span,
    )!
    const relatedTo = {
      ticketId: relatedToEntry.span.relatedTo!.ticketId!,
    }
    const tracer = traceManager.createTracer(ticketActivatedDefinition)
    tracer.start({
      relatedTo,
      startTime: {
        ...fixtureEntries[0]!.span.startTime,
        now:
          fixtureEntries[0]!.span.startTime.now -
          fixtureEntries[0]!.annotation.operationRelativeStartTime,
      },
      variant: 'cold_boot',
    })

    for (const entry of fixtureEntries) {
      traceManager.processSpan(entry.span)
    }

    expect(reportFn).toHaveBeenCalled()
    const {
      entries,
      ...report
    }: Parameters<AnyPossibleReportFn<TicketIdRelationSchemasFixture>>[0] =
      reportFn.mock.calls[0][0]

    expect(report).toMatchInlineSnapshot(`
      {
        "additionalDurations": {
          "completeTillInteractive": 0,
          "startTillInteractive": 1302.3999999910593,
          "startTillRequirementsMet": 1285.6000000089407,
        },
        "attributes": {},
        "computedRenderBeaconSpans": {
          "ConversationPane": {
            "firstRenderTillContent": 831.2999999821186,
            "firstRenderTillData": 753.5,
            "firstRenderTillLoading": 138.59999999403954,
            "renderCount": 5,
            "startOffset": 459.1000000089407,
            "sumOfRenderDurations": 283.0999999791384,
          },
          "OmniComposer": {
            "firstRenderTillContent": 211.99999998509884,
            "firstRenderTillData": 97.20000000298023,
            "firstRenderTillLoading": 0,
            "renderCount": 8,
            "startOffset": 640.4000000059605,
            "sumOfRenderDurations": 258.3999999910593,
          },
          "OmniLog": {
            "firstRenderTillContent": 815.9000000059605,
            "firstRenderTillData": 746.5,
            "firstRenderTillLoading": 113.2000000178814,
            "renderCount": 9,
            "startOffset": 469.70000000298023,
            "sumOfRenderDurations": 255.90000002086163,
          },
        },
        "computedSpans": {},
        "computedValues": {},
        "duration": 1302.3999999910593,
        "error": undefined,
        "id": "trace-0",
        "interruption": undefined,
        "name": "ticket.activated",
        "parentTraceId": undefined,
        "relatedTo": {
          "ticketId": "74",
        },
        "startTime": {
          "epoch": 1732236012113.3,
          "now": 34982.5,
        },
        "status": "ok",
        "type": "operation",
        "variant": "cold_boot",
      }
    `)
    expect(report.duration).toBeCloseTo(1_302.4)
    expect(report.interruption).toBeUndefined()
    expect(report.additionalDurations.startTillInteractive).toBeCloseTo(1_302.4)
  })
})
