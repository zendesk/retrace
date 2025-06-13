import './testUtility/asciiTimelineSerializer'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vitest as jest,
} from 'vitest'
import * as matchSpan from './matchSpan'
import { type TicketIdRelationSchemasFixture } from './testUtility/fixtures/relationSchemas'
import { Check, getSpansFromTimeline, Render } from './testUtility/makeTimeline'
import { processSpans } from './testUtility/processSpans'
import { TraceManager } from './TraceManager'
import type { AnyPossibleReportFn } from './types'

describe('TraceManager', () => {
  let reportFn: jest.Mock
  let generateId: jest.Mock
  let reportErrorFn: jest.Mock
  let reportWarningFn: jest.Mock

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
    reportWarningFn = jest.fn()
  })

  afterEach(() => {
    jest.clearAllMocks()
    jest.clearAllTimers()
  })

  it('tracks trace after creating a draft and transitioning to active trace', () => {
    const traceManager = new TraceManager({
      relationSchemas: { ticket: { ticketId: String } },
      reportFn,
      generateId,
      reportErrorFn,
      reportWarningFn,
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
    const traceId = tracer.createDraft({
      variant: 'cold_boot',
    })
    expect(traceId).toBe('id-0')

    // prettier-ignore
    const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
      Events: ${Render('start', 0)}-----${Render('middle', 0)}-----${Render('end', 0)}---<===+2s===>----${Check}
      Time:   ${0}                      ${50}                      ${100}                               ${2_100}
      `

    processSpans(spans, traceManager)

    tracer.transitionDraftToActive({ relatedTo: { ticketId: '1' } })

    expect(reportFn).toHaveBeenCalled()

    const report: Parameters<
      AnyPossibleReportFn<TicketIdRelationSchemasFixture>
    >[0] = reportFn.mock.calls[0][0]
    expect(
      report.entries.map(
        (spanAndAnnotation) => spanAndAnnotation.span.performanceEntry,
      ),
    ).toMatchInlineSnapshot(`
        events    | start       middle      end
        timeline  | |-<⋯ +50 ⋯>-|-<⋯ +50 ⋯>-|
        time (ms) | 0           50          100
      `)
    expect(report.name).toBe('ticket.basic-operation')
    expect(report.duration).toBe(100)
    expect(report.status).toBe('ok')
    expect(report.interruptionReason).toBeUndefined()
  })

  it('timeouts when the basic trace when an timeout duration from variant is reached', () => {
    const traceManager = new TraceManager({
      relationSchemas: { ticket: { ticketId: String } },
      reportFn,
      generateId,
      reportErrorFn,
      reportWarningFn,
    })
    const tracer = traceManager.createTracer({
      name: 'ticket.timeout-operation',
      type: 'operation',
      relationSchemaName: 'ticket',
      requiredSpans: [{ name: 'timed-out-render' }],
      variants: { cold_boot: { timeout: 500 } },
    })
    const traceId = tracer.createDraft({
      startTime: { now: 0, epoch: 0 },
      variant: 'cold_boot',
    })
    expect(traceId).toBe('id-0')

    tracer.transitionDraftToActive({ relatedTo: { ticketId: '1' } })

    // prettier-ignore
    const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
        Events: ${Render('start', 0)}------${Render('timed-out-render', 0)}
        Time:   ${0}                       ${500 + 1}
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
          events    | start
          timeline  | |
          time (ms) | 0
        `)
    expect(report.interruptionReason).toBe('timeout')
    expect(report.duration).toBeNull()

    expect(report.name).toBe('ticket.timeout-operation')
    expect(report.status).toBe('interrupted')

    expect(report.interruptionReason).toBe('timeout')
    expect(report.duration).toBeNull()
  })

  describe('transitionDraftToActive()', () => {
    it('after a trace is active: reports warning', () => {
      const traceManager = new TraceManager({
        relationSchemas: { ticket: { ticketId: String } },
        reportFn,
        generateId,
        reportErrorFn,
        reportWarningFn,
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

      tracer.createDraft({
        variant: 'cold_boot',
      })

      tracer.transitionDraftToActive({ relatedTo: { ticketId: '1' } })
      tracer.transitionDraftToActive({ relatedTo: { ticketId: '2' } })

      expect(reportWarningFn).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining(
            'You are trying to activate a trace that has already been activated',
          ),
        }),
        expect.objectContaining({
          definition: expect.objectContaining({
            name: 'ticket.basic-operation',
          }),
        }),
      )
    })

    it('after a trace is active and previouslyActivatedBehavior is "warn-and-continue": reports error and continues trace with new trace modification', () => {
      const traceManager = new TraceManager({
        relationSchemas: { ticket: { ticketId: String } },
        reportFn,
        generateId,
        reportErrorFn,
        reportWarningFn,
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

      tracer.createDraft({
        variant: 'cold_boot',
      })

      tracer.transitionDraftToActive({ relatedTo: { ticketId: '1' } })
      tracer.transitionDraftToActive(
        { relatedTo: { ticketId: '2' } },
        { previouslyActivatedBehavior: 'warn-and-continue' },
      )

      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
      Events: ${Render('Component', 0, {type: 'component-render-start'})}--${Render('Component', 50)}--${Render('end', 50,)}
      Time:   ${0}                                                         ${50}                       ${100}
      `
      processSpans(spans, traceManager)

      expect(reportWarningFn).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining(
            'You are trying to activate a trace that has already been activated',
          ),
        }),
        expect.objectContaining({
          definition: expect.objectContaining({
            name: 'ticket.basic-operation',
          }),
        }),
      )

      expect(reportFn).toHaveBeenCalled()
      const report = reportFn.mock.calls[0]![0]

      expect(report.relatedTo).toEqual({
        ticketId: '2', // relatedTo successfully replaced
      })
    })

    it('after a trace is active and previouslyActivatedBehavior is "error-and-continue": reports error and continues trace with new trace modification', () => {
      const traceManager = new TraceManager({
        relationSchemas: { ticket: { ticketId: String } },
        reportFn,
        generateId,
        reportErrorFn,
        reportWarningFn,
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

      tracer.createDraft({
        variant: 'cold_boot',
      })

      tracer.transitionDraftToActive({ relatedTo: { ticketId: '1' } })
      tracer.transitionDraftToActive(
        { relatedTo: { ticketId: '2' } },
        { previouslyActivatedBehavior: 'error-and-continue' },
      )

      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
      Events: ${Render('Component', 0, {type: 'component-render-start'})}--${Render('Component', 50)}--${Render('end', 50,)}
      Time:   ${0}                                                         ${50}                       ${100}
      `
      processSpans(spans, traceManager)

      expect(reportErrorFn).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining(
            'You are trying to activate a trace that has already been activated',
          ),
        }),
        expect.objectContaining({
          definition: expect.objectContaining({
            name: 'ticket.basic-operation',
          }),
        }),
      )

      expect(reportFn).toHaveBeenCalled()
      const report = reportFn.mock.calls[0]![0]

      expect(report.relatedTo).toEqual({
        ticketId: '2', // relatedTo successfully replaced
      })
    })

    it('after a trace is active and previouslyActivatedBehavior is "error": reports error and continues trace with original trace definition', () => {
      const traceManager = new TraceManager({
        relationSchemas: { ticket: { ticketId: String } },
        reportFn,
        generateId,
        reportErrorFn,
        reportWarningFn,
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

      tracer.createDraft({
        variant: 'cold_boot',
      })

      tracer.transitionDraftToActive({ relatedTo: { ticketId: '1' } })
      tracer.transitionDraftToActive(
        { relatedTo: { ticketId: '2' } },
        { previouslyActivatedBehavior: 'error' },
      )

      expect(reportErrorFn).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining(
            'You are trying to activate a trace that has already been activated',
          ),
        }),
        expect.objectContaining({
          definition: expect.objectContaining({
            name: 'ticket.basic-operation',
          }),
        }),
      )

      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
      Events: ${Render('Component', 0, {type: 'component-render-start'})}--${Render('Component', 50)}--${Render('end', 50,)}
      Time:   ${0}                                                         ${50}                       ${100}
      `
      processSpans(spans, traceManager)

      expect(reportErrorFn).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining(
            'You are trying to activate a trace that has already been activated',
          ),
        }),
        expect.objectContaining({
          definition: expect.objectContaining({
            name: 'ticket.basic-operation',
          }),
        }),
      )

      expect(reportFn).toHaveBeenCalled()
      const report = reportFn.mock.calls[0]![0]

      expect(report.relatedTo).toEqual({
        ticketId: '1', // relatedTo was not replaced!
      })
    })
  })

  describe('interrupt()', () => {
    it('interrupts a basic trace when interruptOnSpans criteria is met in draft mode, trace stops immediately', () => {
      const traceManager = new TraceManager({
        relationSchemas: { ticket: { ticketId: String } },
        reportFn,
        generateId,
        reportErrorFn,
        reportWarningFn,
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
      tracer.createDraft({
        variant: 'cold_boot',
      })

      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
        Events: ${Render('start', 0)}-----${Render('interrupt', 0)}-----${Render('end', 0)}
        Time:   ${0}                      ${100}                        ${200}
        `
      processSpans(spans, traceManager)

      expect(reportFn).toHaveBeenCalled()

      const report: Parameters<
        AnyPossibleReportFn<TicketIdRelationSchemasFixture>
      >[0] = reportFn.mock.calls[0][0]

      // this trace was interrupted before transitioning from draft to active, so the only available entries are up to the interrupt
      expect(report.entries).toHaveLength(2)
      expect(report.name).toBe('ticket.interrupt-on-basic-operation')
      expect(report.duration).toBeNull()
      expect(report.interruptionReason).toBe('matched-on-interrupt')
      expect(report.status).toBe('interrupted')
    })

    it('interrupts a draft trace when interrupt() is called with error', () => {
      const traceManager = new TraceManager({
        relationSchemas: { ticket: { ticketId: String } },
        reportFn,
        generateId,
        reportErrorFn,
        reportWarningFn,
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
      tracer.createDraft({
        variant: 'cold_boot',
      })

      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
        Events: ${Render('start', 0)}-----${Render('middle', 0)}
        Time:   ${0}                      ${50}
      `
      processSpans(spans, traceManager)

      const error = new Error('Test error')
      tracer.interrupt({ error })

      expect(reportFn).toHaveBeenCalled()
      const report = reportFn.mock.calls[0][0]
      expect(report.entries.length).toBe(3) // start, middle, and error mark
      expect(report.status).toBe('interrupted')
      expect(report.interruptionReason).toBe('aborted')
      // Last entry should be the error mark
      expect(report.entries[report.entries.length - 1].span.error).toBe(error)
    })

    it('interrupts a draft trace when interrupt() is called without error', () => {
      const traceManager = new TraceManager({
        relationSchemas: { ticket: { ticketId: String } },
        reportFn,
        generateId,
        reportErrorFn,
        reportWarningFn,
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
      tracer.createDraft({
        variant: 'cold_boot',
      })

      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
        Events: ${Render('start', 0)}-----${Render('middle', 0)}
        Time:   ${0}                      ${50}
      `
      processSpans(spans, traceManager)

      tracer.interrupt()

      expect(reportFn).toHaveBeenCalled()
      const report = reportFn.mock.calls[0][0]
      expect(report.status).toBe('interrupted')
      expect(report.entries.length).toBe(0)
      expect(report.interruptionReason).toBe('draft-cancelled')
    })

    it('interrupts an active trace when interrupt() is called with error', () => {
      const traceManager = new TraceManager({
        relationSchemas: { ticket: { ticketId: String } },
        reportFn,
        generateId,
        reportErrorFn,
        reportWarningFn,
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
      tracer.createDraft({
        variant: 'cold_boot',
      })
      tracer.transitionDraftToActive({ relatedTo: { ticketId: '1' } })

      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
        Events: ${Render('start', 0)}-----${Render('middle', 0)}
        Time:   ${0}                      ${50}
      `
      processSpans(spans, traceManager)

      const error = new Error('Test error')
      tracer.interrupt({ error })

      expect(reportFn).toHaveBeenCalled()
      const report = reportFn.mock.calls[0][0]
      expect(report.entries.length).toBe(3) // start, middle, and error mark
      expect(report.status).toBe('interrupted')
      expect(report.interruptionReason).toBe('aborted')
      // Last entry should be the error mark
      expect(report.entries[report.entries.length - 1].span.error).toBe(error)
    })

    it('interrupts an active trace when interrupt() is called without error', () => {
      const traceManager = new TraceManager({
        relationSchemas: { ticket: { ticketId: String } },
        reportFn,
        generateId,
        reportErrorFn,
        reportWarningFn,
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
      tracer.createDraft({
        variant: 'cold_boot',
      })
      tracer.transitionDraftToActive({ relatedTo: { ticketId: '1' } })

      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
        Events: ${Render('start', 0)}-----${Render('middle', 0)}
        Time:   ${0}                      ${50}
      `
      processSpans(spans, traceManager)

      tracer.interrupt()

      expect(reportFn).toHaveBeenCalled()
      const report = reportFn.mock.calls[0][0]
      expect(report.status).toBe('interrupted')
      expect(report.entries.length).toBe(2) // start, middle
      expect(report.interruptionReason).toBe('aborted')
    })

    it('reports warning when interrupting a non-existent trace', () => {
      const traceManager = new TraceManager({
        relationSchemas: { ticket: { ticketId: String } },
        reportFn,
        generateId,
        reportErrorFn,
        reportWarningFn,
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

      tracer.interrupt({})

      expect(reportWarningFn).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining(
            'No current active trace when initializing a trace',
          ),
        }),
        expect.objectContaining({
          definition: expect.any(Object),
        }),
      )
    })
  })
})
