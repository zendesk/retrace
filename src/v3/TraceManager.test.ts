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
import * as matchSpan from './matchSpan'
import {
  type TicketAndUserAndGlobalRelationSchemasFixture,
  ticketAndUserAndGlobalRelationSchemasFixture,
  type TicketIdRelationSchemasFixture,
} from './testUtility/fixtures/relationSchemas'
import { Check, getSpansFromTimeline, Render } from './testUtility/makeTimeline'
import { processSpans } from './testUtility/processSpans'
import { TraceManager } from './TraceManager'
import type { AnyPossibleReportFn, GenerateIdFn } from './types'

describe('TraceManager', () => {
  let reportFn: Mock<AnyPossibleReportFn<TicketIdRelationSchemasFixture>>
  // TS doesn't like that reportFn is wrapped in Mock<> type
  const getReportFn = () =>
    reportFn as AnyPossibleReportFn<TicketIdRelationSchemasFixture>
  let generateId: Mock<GenerateIdFn>
  let reportErrorFn: Mock
  const DEFAULT_COLDBOOT_TIMEOUT_DURATION = 45_000

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
    reportFn = vitest.fn()
    reportErrorFn = vitest.fn()
  })

  afterEach(() => {
    vitest.clearAllMocks()
    vitest.clearAllTimers()
  })

  it('tracks trace with minimal requirements', () => {
    const traceManager = new TraceManager({
      relationSchemas: { ticket: { ticketId: String } },
      reportFn: getReportFn(),
      generateId,
      reportErrorFn,
    })
    const tracer = traceManager.createTracer({
      name: 'ticket.basic-operation',
      type: 'operation',
      relationSchemaName: 'ticket',
      requiredSpans: [{ name: 'end' }],
      variants: {
        cold_boot: { timeout: DEFAULT_COLDBOOT_TIMEOUT_DURATION },
      },
    })
    const traceId = tracer.start({
      relatedTo: { ticketId: '1' },
      variant: 'cold_boot',
    })
    expect(traceId).toBe('trace-0')

    // prettier-ignore
    const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
    Events: ${Render('start', 0)}-----${Render('middle', 0)}-----${Render('end', 0)}---<===+2s===>----${Check}
    Time:   ${0}                      ${50}                      ${100}                               ${2_100}
    `

    processSpans(spans, traceManager)
    expect(reportFn).toHaveBeenCalled()

    const report = reportFn.mock.calls[0]![0]
    expect(report.entries).toMatchInlineSnapshot(`
      events    | start       middle      end
      timeline  | |-<⋯ +50 ⋯>-|-<⋯ +50 ⋯>-|
      time (ms) | 0           50          100
    `)
    expect(report.name).toBe('ticket.basic-operation')
    expect(report.duration).toBe(100)
    expect(report.status).toBe('ok')
    expect(report.interruption).toBeUndefined()
  })

  it('correctly calculates a computed span', () => {
    const traceManager = new TraceManager({
      relationSchemas: { ticket: { ticketId: String } },
      reportFn: getReportFn(),
      generateId,
      reportErrorFn,
    })
    const tracer = traceManager.createTracer({
      name: 'ticket.computed-span-operation',
      type: 'operation',
      relationSchemaName: 'ticket',
      requiredSpans: [{ name: 'end' }],
      variants: {
        cold_boot: { timeout: DEFAULT_COLDBOOT_TIMEOUT_DURATION },
      },
    })

    const computedSpanName = 'render-1-to-3'
    // Define a computed span
    tracer.defineComputedSpan({
      name: computedSpanName,
      startSpan: matchSpan.withName('render-1'),
      endSpan: matchSpan.withName('render-3'),
    })

    const traceId = tracer.start({
      relatedTo: { ticketId: '1' },
      variant: 'cold_boot',
    })

    // Start trace
    expect(traceId).toBe('trace-0')

    // prettier-ignore
    const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
    Events: ${Render('start', 0)}---${Render('render-1', 50)}----${Render('render-2', 50)}----${Render('render-3', 50)}--------${Render('end', 0)}
    Time:   ${0}                    ${50}                        ${100}                       ${150}                           ${200}
    `

    processSpans(spans, traceManager)
    expect(reportFn).toHaveBeenCalled()

    const report = reportFn.mock.calls[0]![0]
    expect(report.name).toBe('ticket.computed-span-operation')
    expect(report.duration).toBe(200)
    expect(report.status).toBe('ok')
    expect(report.interruption).toBeUndefined()
    expect(report.computedSpans[computedSpanName]?.startOffset).toBe(50)
    expect(report.computedSpans[computedSpanName]?.duration).toBe(150)
    expect(report.entries).toMatchInlineSnapshot(`
      events    | start       render-1(50)     render-2(50)     render-3(50)   end
      timeline  | |-<⋯ +50 ⋯>-[++++++++++++++]-[++++++++++++++]-[++++++++++++++|
      time (ms) | 0           50               100              150            200
    `)
  })

  it('correctly calculates a computed value', () => {
    const traceManager = new TraceManager({
      relationSchemas: { ticket: { ticketId: String } },
      reportFn: getReportFn(),
      generateId,
      reportErrorFn,
    })
    const tracer = traceManager.createTracer({
      name: 'ticket.computed-value-operation',
      type: 'operation',
      relationSchemaName: 'ticket',
      requiredSpans: [{ name: 'end' }],
      variants: {
        cold_boot: { timeout: DEFAULT_COLDBOOT_TIMEOUT_DURATION },
      },
    })

    // Define a computed value
    tracer.defineComputedValue({
      name: 'feature',
      matches: [{ name: 'feature' }],
      computeValueFromMatches: (feature) => feature.length,
    })

    const traceId = tracer.start({
      relatedTo: { ticketId: '1' },
      variant: 'cold_boot',
    })

    // Start trace
    expect(traceId).toBe('trace-0')

    // prettier-ignore
    const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
    Events: ${Render('start', 0)}--${Render('feature', 50)}--${Render('feature', 50)}-${Render('end', 0)}
    Time:   ${0}                   ${50}                     ${100}                    ${150}
    `

    processSpans(spans, traceManager)
    expect(reportFn).toHaveBeenCalled()
    const report = reportFn.mock.calls[0]![0]
    expect(report.name).toBe('ticket.computed-value-operation')
    expect(report.duration).toBe(150)
    expect(report.status).toBe('ok')
    expect(report.interruption).toBeUndefined()
    expect(report.computedValues).toEqual({
      feature: 2,
    })

    expect(report.entries).toMatchInlineSnapshot(`
      events    | start       feature(50)              feature(50)             end
      timeline  | |-<⋯ +50 ⋯>-[+++++++++++++++++++++++][+++++++++++++++++++++++|
      time (ms) | 0           50                       100                     150
    `)
  })

  it('correctly calculates computedRenderBeaconSpans, adjusting the render start based on the first render-start', () => {
    const traceManager = new TraceManager({
      relationSchemas: { ticket: { ticketId: String } },
      reportFn: getReportFn(),
      generateId,
      reportErrorFn,
    })
    const tracer = traceManager.createTracer({
      name: 'ticket.computedRenderBeaconSpans',
      type: 'operation',
      relationSchemaName: 'ticket',
      requiredSpans: [{ name: 'Component', isIdle: true }],
      variants: {
        cold_boot: { timeout: DEFAULT_COLDBOOT_TIMEOUT_DURATION },
      },
    })

    const traceId = tracer.start({
      relatedTo: { ticketId: '1' },
      variant: 'cold_boot',
    })

    // prettier-ignore
    const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
    Events: ${Render('Component', 0, {type: 'component-render-start'})}--${Render('Component', 50)}--${Render('Component', 50, {renderedOutput: 'content'})}
    Time:   ${0}                                                         ${50}                       ${100}
    `

    processSpans(spans, traceManager)
    vitest.runAllTimers()

    expect(reportFn).toHaveBeenCalled()
    const report = reportFn.mock.calls[0]![0]

    // render-start should get merged with the first render
    expect(report.entries).toHaveLength(2)

    expect(report.entries).toMatchInlineSnapshot(`
      events    | Component(100)                                    Component(50)
      timeline  | [++++++++++++++++++++++++++++++++++++++++++++++++][+++++++++++++++++++++++]
      time (ms) | 0                                                 100
    `)

    expect(report.name).toBe('ticket.computedRenderBeaconSpans')
    expect(report.interruption).toBeUndefined()
    expect(report.status).toBe('ok')
    expect(report.duration).toBe(150)
    expect(report.computedRenderBeaconSpans).toEqual({
      Component: {
        firstRenderTillContent: 150,
        firstRenderTillData: 100,
        firstRenderTillLoading: 100,
        renderCount: 2,
        startOffset: 0,
        sumOfRenderDurations: 150,
      },
    })
  })

  it('when relatedTo is true for two relations: tracks trace with relatedTo ticketId: 4 and relatedTo userId: 3', () => {
    const traceManager = new TraceManager({
      relationSchemas: ticketAndUserAndGlobalRelationSchemasFixture,
      reportFn:
        reportFn as unknown as AnyPossibleReportFn<TicketAndUserAndGlobalRelationSchemasFixture>,
      generateId,
      reportErrorFn,
    })
    const tracer = traceManager.createTracer({
      name: 'ticket.relatedTo-operation',
      type: 'operation',
      relationSchemaName: 'ticket',
      requiredSpans: [{ name: 'end', matchingRelations: true }],
      variants: {
        cold_boot: { timeout: DEFAULT_COLDBOOT_TIMEOUT_DURATION },
      },
    })
    const relatedTo = {
      ticketId: '4',
      userId: '3',
    }
    const traceId = tracer.start({
      relatedTo,
      variant: 'cold_boot',
    })
    expect(traceId).toBe('trace-0')

    // prettier-ignore
    const { spans } = getSpansFromTimeline<TicketAndUserAndGlobalRelationSchemasFixture>`
    Events: ${Render('start', 0)}-----${Render('middle', 0)}-----${Render('end', 0, { relatedTo })}---<===+6s===>----${Check}
    Time:   ${0}                      ${50}                      ${100}                                          ${6_000}
    `
    processSpans(spans, traceManager)
    expect(reportFn).toHaveBeenCalled()

    const report = reportFn.mock.calls[0]![0]
    expect(report.entries).toMatchInlineSnapshot(`
      events    | start       middle      end
      timeline  | |-<⋯ +50 ⋯>-|-<⋯ +50 ⋯>-|
      time (ms) | 0           50          100
    `)
    expect(report.name).toBe('ticket.relatedTo-operation')
    expect(report.interruption).toBeUndefined()
    expect(report.duration).toBe(100)
    expect(report.status).toBe('ok')
    expect(report.relatedTo).toEqual(relatedTo)
  })

  describe('debounce', () => {
    it('tracks trace when debouncedOn is defined but no debounce events', () => {
      const traceManager = new TraceManager({
        relationSchemas: { ticket: { ticketId: String } },
        reportFn: getReportFn(),
        generateId,
        reportErrorFn,
      })
      const tracer = traceManager.createTracer({
        name: 'ticket.operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'end' }],
        debounceOnSpans: [{ name: 'debounce' }],
        variants: {
          cold_boot: { timeout: DEFAULT_COLDBOOT_TIMEOUT_DURATION },
        },
      })
      const traceId = tracer.start({
        relatedTo: {
          ticketId: '1',
        },
        variant: 'cold_boot',
      })
      expect(traceId).toBe('trace-0')

      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
      Events: ${Render('start', 0)}-----${Render('middle', 0)}-----${Render('end', 0)}---<===+2s===>----${Check}
      Time:   ${0}                      ${50}                      ${100}                               ${2_100}
      `
      processSpans(spans, traceManager)
      expect(reportFn).toHaveBeenCalled()

      const report: Parameters<
        AnyPossibleReportFn<TicketIdRelationSchemasFixture>
      >[0] = reportFn.mock.calls[0]![0]
      expect(
        report.entries.map(
          (spanAndAnnotation) => spanAndAnnotation.span.performanceEntry,
        ),
      ).toMatchInlineSnapshot(`
        events    | start       middle      end
        timeline  | |-<⋯ +50 ⋯>-|-<⋯ +50 ⋯>-|
        time (ms) | 0           50          100
      `)
      expect(report.name).toBe('ticket.operation')
      expect(report.duration).toBe(100)
      expect(report.status).toBe('ok')
      expect(report.interruption).toBeUndefined()
    })

    it('tracks trace correctly when debounced entries are seen', () => {
      const traceManager = new TraceManager({
        relationSchemas: { ticket: { ticketId: String } },
        reportFn: getReportFn(),
        generateId,
        reportErrorFn,
      })
      const tracer = traceManager.createTracer({
        name: 'ticket.debounce-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [matchSpan.withName('end')],
        debounceOnSpans: [
          matchSpan.withName((n: string) => n.endsWith('debounce')),
        ],
        debounceWindow: 300,
        variants: {
          cold_boot: { timeout: DEFAULT_COLDBOOT_TIMEOUT_DURATION },
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
      Events: ${Render('start', 0)}-----${Render('end', 0)}-----${Render('shorter-debounce', 0)}-----${Render('short-debounce', 0)}-----${Render('long-debounce', 0)}-----${Check})}
      Time:   ${0}                      ${50}                   ${51}                                ${251}                             ${451}                            ${1_051}
      `
      processSpans(spans, traceManager)
      expect(reportFn).toHaveBeenCalled()

      const report: Parameters<
        AnyPossibleReportFn<TicketIdRelationSchemasFixture>
      >[0] = reportFn.mock.calls[0]![0]
      expect(
        report.entries.map(
          (spanAndAnnotation) => spanAndAnnotation.span.performanceEntry,
        ),
      ).toMatchInlineSnapshot(`
        events    |                                                     shorter-debounce           long-debounce
        events    | start                                             end             short-debounce
        timeline  | |-------------------------------------------------|-|-<⋯ +200 ⋯>--|-<⋯ +200 ⋯>-|
        time (ms) | 0                                                 50              251          451
        time (ms) |                                                     51
      `)
      expect(report.name).toBe('ticket.debounce-operation')
      expect(report.duration).toBe(451) // 50 + 1 + 200 + 200
      expect(report.status).toBe('ok')
      expect(report.interruption).toBeUndefined()
    })
  })

  describe('interrupts', () => {
    it('interrupts a basic trace when interruptOnSpans criteria is met', () => {
      const traceManager = new TraceManager({
        relationSchemas: { ticket: { ticketId: String } },
        reportFn: getReportFn(),
        generateId,
        reportErrorFn,
      })
      const tracer = traceManager.createTracer({
        name: 'ticket.interrupt-on-basic-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [matchSpan.withName('end')],
        interruptOnSpans: [matchSpan.withName('interrupt')],
        variants: {
          cold_boot: { timeout: DEFAULT_COLDBOOT_TIMEOUT_DURATION },
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
      Events: ${Render('start', 0)}-----${Render('interrupt', 0)}-----${Render('end', 0)}
      Time:   ${0}                      ${100}                      ${200}
      `

      processSpans(spans, traceManager)

      expect(reportFn).toHaveBeenCalled()

      const report: Parameters<
        AnyPossibleReportFn<TicketIdRelationSchemasFixture>
      >[0] = reportFn.mock.calls[0]![0]
      expect(
        report.entries.map(
          (spanAndAnnotation) => spanAndAnnotation.span.performanceEntry,
        ),
      ).toMatchInlineSnapshot(`
        events    | start        interrupt
        timeline  | |-<⋯ +100 ⋯>-|
        time (ms) | 0            100
      `)
      expect(report.name).toBe('ticket.interrupt-on-basic-operation')
      expect(report.duration).toBeNull()
      expect(report.status).toBe('interrupted')
      expect(report.interruption).toMatchObject({
        reason: 'matched-on-interrupt',
      })
    })

    it('interrupts itself when another trace is started', () => {
      const traceManager = new TraceManager({
        relationSchemas: { ticket: { ticketId: String } },
        reportFn: getReportFn(),
        generateId,
        reportErrorFn,
      })
      const tracer = traceManager.createTracer({
        name: 'ticket.interrupt-itself-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'end' }],
        debounceOnSpans: [{ name: 'debounce' }],
        variants: {
          cold_boot: { timeout: DEFAULT_COLDBOOT_TIMEOUT_DURATION },
        },
      })
      const traceId = tracer.start({
        relatedTo: {
          ticketId: '1',
        },
        variant: 'cold_boot',
      })
      expect(traceId).toBe('trace-0')

      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
      Events: ${Render('start', 0)}
      Time:   ${0}
      `
      processSpans(spans, traceManager)

      // Start another operation to interrupt the first one
      const newTraceId = tracer.start({
        relatedTo: {
          ticketId: '1',
        },
        variant: 'cold_boot',
      })
      expect(newTraceId).toBe('trace-1')
      expect(reportFn).toHaveBeenCalled()

      const report: Parameters<
        AnyPossibleReportFn<TicketIdRelationSchemasFixture>
      >[0] = reportFn.mock.calls[0]![0]
      expect(
        report.entries.map(
          (spanAndAnnotation) => spanAndAnnotation.span.performanceEntry,
        ),
      ).toMatchInlineSnapshot(`
        events    | start
        timeline  | |
        time (ms) | 0
      `)

      expect(report.name).toBe('ticket.interrupt-itself-operation')
      expect(report.duration).toBeNull()
      expect(report.status).toBe('interrupted')
      expect(report.interruption).toMatchObject({
        reason: 'another-trace-started',
      })
    })

    it('tracks a regression: interrupts a trace when a component is no longer idle', () => {
      const traceManager = new TraceManager({
        relationSchemas: { ticket: { ticketId: String } },
        reportFn: getReportFn(),
        generateId,
        reportErrorFn,
      })
      const tracer = traceManager.createTracer({
        name: 'ticket.interrupt-on-basic-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'component', isIdle: true }],
        debounceOnSpans: [{ name: 'component' }],
        variants: {
          cold_boot: { timeout: DEFAULT_COLDBOOT_TIMEOUT_DURATION },
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
      Events: ${Render('start', 0)}-----${Render('component', 50, {isIdle: true})}-----${Render('component', 50, {isIdle: false})}
      Time:   ${0}                      ${100}                                         ${200}
      `

      processSpans(spans, traceManager)

      expect(reportFn).toHaveBeenCalled()

      const report: Parameters<
        AnyPossibleReportFn<TicketIdRelationSchemasFixture>
      >[0] = reportFn.mock.calls[0]![0]
      expect(
        report.entries.map(
          (spanAndAnnotation) => spanAndAnnotation.span.performanceEntry,
        ),
      ).toMatchInlineSnapshot(`
        events    | start        component(50)                  component(50)
        timeline  | |-<⋯ +100 ⋯>-[++++++++++++++]---------------[++++++++++++++]-
        time (ms) | 0            100                            200
      `)
      expect(report.name).toBe('ticket.interrupt-on-basic-operation')
      expect(report.interruption).toMatchObject({
        reason: 'idle-component-no-longer-idle',
      })

      expect(report.status).toBe('interrupted')
      expect(report.duration).toBeNull()
    })

    describe('timeout', () => {
      it('timeouts when the basic trace when the default timeout duration is reached', () => {
        const traceManager = new TraceManager({
          relationSchemas: { ticket: { ticketId: String } },
          reportFn: getReportFn(),
          generateId,
          reportErrorFn,
        })
        const tracer = traceManager.createTracer({
          name: 'ticket.timeout-operation',
          type: 'operation',
          relationSchemaName: 'ticket',
          requiredSpans: [{ name: 'timed-out-render' }],
          variants: { cold_boot: { timeout: 500 } },
        })
        const traceId = tracer.start({
          startTime: { now: 0, epoch: 0 },
          relatedTo: {
            ticketId: '1',
          },
          variant: 'cold_boot',
        })
        expect(traceId).toBe('trace-0')

        // prettier-ignore
        const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
        Events: ${Render('start', 0)}------${Render('timed-out-render', 0)}
        Time:   ${0}                       ${500 + 1}
        `
        processSpans(spans, traceManager)

        expect(reportFn).toHaveBeenCalled()

        const report: Parameters<
          AnyPossibleReportFn<TicketIdRelationSchemasFixture>
        >[0] = reportFn.mock.calls[0]![0]

        expect(
          report.entries.map(
            (spanAndAnnotation) => spanAndAnnotation.span.performanceEntry,
          ),
        ).toMatchInlineSnapshot(`
          events    | start
          timeline  | |
          time (ms) | 0
        `)
        expect(report.interruption).toMatchObject({ reason: 'timeout' })
        expect(report.duration).toBeNull()

        expect(report.name).toBe('ticket.timeout-operation')
        expect(report.status).toBe('interrupted')

        expect(report.interruption).toMatchObject({ reason: 'timeout' })
        expect(report.duration).toBeNull()
      })

      it('timeouts when the basic trace when a custom timeout duration is reached', () => {
        const traceManager = new TraceManager({
          relationSchemas: { ticket: { ticketId: String } },
          reportFn: getReportFn(),
          generateId,
          reportErrorFn,
        })
        const CUSTOM_TIMEOUT_DURATION = 500
        const tracer = traceManager.createTracer({
          name: 'ticket.timeout-operation',
          type: 'operation',
          relationSchemaName: 'ticket',
          requiredSpans: [{ name: 'timed-out-render' }],
          variants: {
            cold_boot: { timeout: CUSTOM_TIMEOUT_DURATION },
          },
        })
        const traceId = tracer.start({
          startTime: { now: 0, epoch: 0 },
          relatedTo: {
            ticketId: '1',
          },
          variant: 'cold_boot',
        })
        expect(traceId).toBe('trace-0')

        // prettier-ignore
        const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
        Events: ${Render('start', 0)}------${Render('timed-out-render', 0)}
        Time:   ${0}                       ${CUSTOM_TIMEOUT_DURATION + 1}
        `
        processSpans(spans, traceManager)

        expect(reportFn).toHaveBeenCalled()

        const report: Parameters<
          AnyPossibleReportFn<TicketIdRelationSchemasFixture>
        >[0] = reportFn.mock.calls[0]![0]

        expect(report.status).toBe('interrupted')
        expect(report.interruption).toMatchObject({ reason: 'timeout' })
        expect(
          report.entries.map(
            (spanAndAnnotation) => spanAndAnnotation.span.performanceEntry,
          ),
        ).toMatchInlineSnapshot(`
          events    | start
          timeline  | |
          time (ms) | 0
        `)
        expect(report.name).toBe('ticket.timeout-operation')
        expect(report.duration).toBeNull()
      })

      it('transitions from debouncing to timeout', () => {
        const traceManager = new TraceManager({
          relationSchemas: { ticket: { ticketId: String } },
          reportFn: getReportFn(),
          generateId,
          reportErrorFn,
        })
        const CUSTOM_TIMEOUT_DURATION = 500
        const tracer = traceManager.createTracer({
          name: 'ticket.timeout-operation',
          type: 'operation',
          relationSchemaName: 'ticket',
          requiredSpans: [{ name: 'end' }],
          debounceOnSpans: [{ name: 'debounce' }],
          variants: {
            cold_boot: { timeout: CUSTOM_TIMEOUT_DURATION },
          },
        })
        const traceId = tracer.start({
          startTime: { now: 0, epoch: 0 },
          relatedTo: {
            ticketId: '1',
          },
          variant: 'cold_boot',
        })
        expect(traceId).toBe('trace-0')

        // prettier-ignore
        const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
        Events: ${Render('start', 0)}--${Render('end', 0)}--${Render('debounce', 0)}--${Check}}
        Time:   ${0}                   ${50}                ${51}                     ${CUSTOM_TIMEOUT_DURATION + 1}
        `
        processSpans(spans, traceManager)

        expect(reportFn).toHaveBeenCalled()

        const report: Parameters<
          AnyPossibleReportFn<TicketIdRelationSchemasFixture>
        >[0] = reportFn.mock.calls[0]![0]
        expect(
          report.entries.map(
            (spanAndAnnotation) => spanAndAnnotation.span.performanceEntry,
          ),
        ).toMatchInlineSnapshot(`
          events    |              debounce
          events    | start       end
          timeline  | |-<⋯ +50 ⋯>-||-
          time (ms) | 0           50
          time (ms) |              51
        `)
        expect(report.name).toBe('ticket.timeout-operation')
        expect(report.duration).toBeNull()
        expect(report.status).toBe('interrupted')
        expect(report.interruption).toMatchObject({ reason: 'timeout' })
      })
    })
  })
})
