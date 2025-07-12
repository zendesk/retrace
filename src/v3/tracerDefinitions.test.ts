import './testUtility/asciiTimelineSerializer'
import { beforeEach, describe, expect, it, type Mock, vitest } from 'vitest'
import * as match from './matchSpan'
import {
  type TicketAndUserAndGlobalRelationSchemasFixture,
  ticketAndUserAndGlobalRelationSchemasFixture as relationSchemas,
} from './testUtility/fixtures/relationSchemas'
import { Check, getSpansFromTimeline, Render } from './testUtility/makeTimeline'
import { processSpans } from './testUtility/processSpans'
import { TraceManager } from './TraceManager'
import type { AnyPossibleReportFn, GenerateIdFn } from './types'

describe('Trace Definitions', () => {
  let reportFn: Mock<
    AnyPossibleReportFn<TicketAndUserAndGlobalRelationSchemasFixture>
  >
  // TS doesn't like that reportFn is wrapped in Mock<> type
  const getReportFn = () =>
    reportFn as AnyPossibleReportFn<TicketAndUserAndGlobalRelationSchemasFixture>
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

  describe('computedSpanDefinitions', () => {
    it('correctly calculates a computed span provided in definition', () => {
      const traceManager = new TraceManager({
        relationSchemas,
        reportFn: getReportFn(),
        generateId,
        reportErrorFn,
      })

      const computedSpanName = 'render-1-to-3'
      const tracer = traceManager.createTracer({
        name: 'ticket.computed-span-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'end' }],
        variants: {
          cold_boot: { timeout: DEFAULT_COLDBOOT_TIMEOUT_DURATION },
        },
        // Define computed span in the initial definition as a Record
        computedSpanDefinitions: {
          [computedSpanName]: {
            startSpan: match.withName('render-1'),
            endSpan: match.withName('render-3'),
          },
        },
      })

      const traceId = tracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'cold_boot',
      })

      expect(traceId).toBe('trace-0')

      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketAndUserAndGlobalRelationSchemasFixture>`
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
    })

    it('correctly calculates multiple computed spans in definition', () => {
      const traceManager = new TraceManager({
        relationSchemas,
        reportFn: getReportFn(),
        generateId,
        reportErrorFn,
      })

      const tracer = traceManager.createTracer({
        name: 'ticket.multiple-computed-spans',
        type: 'operation',
        relationSchemaName: 'global',
        requiredSpans: [{ name: 'end' }],
        variants: {
          cold_boot: { timeout: DEFAULT_COLDBOOT_TIMEOUT_DURATION },
        },
        computedSpanDefinitions: {
          'first-to-second': {
            startSpan: match.withName('render-1'),
            endSpan: match.withName('render-2'),
          },
          'second-to-third': {
            startSpan: match.withName('render-2'),
            endSpan: match.withName('render-3'),
          },
        },
      })

      tracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'cold_boot',
      })

      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketAndUserAndGlobalRelationSchemasFixture>`
      Events: ${Render('start', 0)}---${Render('render-1', 50)}----${Render('render-2', 50)}----${Render('render-3', 50)}--------${Render('end', 0)}
      Time:   ${0}                    ${50}                        ${100}                       ${150}                           ${200}
      `

      processSpans(spans, traceManager)
      expect(reportFn).toHaveBeenCalled()

      const report = reportFn.mock.calls[0]![0]
      expect(report.computedSpans['first-to-second']?.startOffset).toBe(50)
      expect(report.computedSpans['first-to-second']?.duration).toBe(100)
      expect(report.computedSpans['second-to-third']?.startOffset).toBe(100)
      expect(report.computedSpans['second-to-third']?.duration).toBe(100)
    })
  })

  describe('requiredSpans error behavior', () => {
    it('interrupts trace when a required span has an error status', () => {
      const traceManager = new TraceManager({
        relationSchemas,
        reportFn: getReportFn(),
        generateId,
        reportErrorFn,
      })

      const tracer = traceManager.createTracer({
        name: 'ticket.required-span-error',
        type: 'operation',
        relationSchemaName: 'global',
        requiredSpans: [{ name: 'feature' }],
        variants: {
          cold_boot: { timeout: DEFAULT_COLDBOOT_TIMEOUT_DURATION },
        },
      })

      tracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'cold_boot',
      })

      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketAndUserAndGlobalRelationSchemasFixture>`
      Events: ${Render('start', 0)}--${Render('feature', 50, { status: 'error' })}
      Time:   ${0}                   ${50}
      `

      processSpans(spans, traceManager)
      expect(reportFn).toHaveBeenCalled()

      const report = reportFn.mock.calls[0]![0]
      expect(report.status).toBe('interrupted')
      expect(report.interruption).toMatchObject({
        reason: 'matched-on-required-span-with-error',
      })
    })

    it('does not interrupt trace when required span error is explicitly ignored', () => {
      const traceManager = new TraceManager({
        relationSchemas,
        reportFn: getReportFn(),
        generateId,
        reportErrorFn,
      })

      const tracer = traceManager.createTracer({
        name: 'ticket.required-span-error-ignored',
        type: 'operation',
        relationSchemaName: 'global',
        requiredSpans: [
          match.withAllConditions(
            match.withName('feature'),
            match.continueWithErrorStatus(),
          ),
        ],
        variants: {
          cold_boot: { timeout: DEFAULT_COLDBOOT_TIMEOUT_DURATION },
        },
      })

      tracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'cold_boot',
      })

      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketAndUserAndGlobalRelationSchemasFixture>`
      Events: ${Render('start', 0)}--${Render('feature', 50, { status: 'error' })}--${Render('end', 0)}
      Time:   ${0}                   ${50}                                          ${100}
      `

      processSpans(spans, traceManager)
      expect(reportFn).toHaveBeenCalled()

      const report = reportFn.mock.calls[0]![0]
      expect(report.status).toBe('error')
      expect(report.interruption).toBeUndefined()
    })

    it('interrupts trace when one of multiple required spans has an error', () => {
      const traceManager = new TraceManager({
        relationSchemas,
        reportFn: getReportFn(),
        generateId,
        reportErrorFn,
      })

      const tracer = traceManager.createTracer({
        name: 'ticket.multiple-required-spans-error',
        type: 'operation',
        relationSchemaName: 'global',
        requiredSpans: [{ name: 'feature-1' }, { name: 'feature-2' }],
        variants: {
          cold_boot: { timeout: DEFAULT_COLDBOOT_TIMEOUT_DURATION },
        },
      })

      tracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'cold_boot',
      })

      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketAndUserAndGlobalRelationSchemasFixture>`
      Events: ${Render('start', 0)}--${Render('feature-1', 50)}--${Render('feature-2', 50, { status: 'error' })}
      Time:   ${0}                   ${50}                       ${100}
      `

      processSpans(spans, traceManager)
      expect(reportFn).toHaveBeenCalled()

      const report = reportFn.mock.calls[0]![0]
      expect(report.status).toBe('interrupted')
      expect(report.interruption).toMatchObject({
        reason: 'matched-on-required-span-with-error',
      })
    })
  })

  describe('computedValueDefinitions', () => {
    it('correctly calculates a computed value provided in definition', () => {
      const traceManager = new TraceManager({
        relationSchemas,
        reportFn: getReportFn(),
        generateId,
        reportErrorFn,
      })

      const tracer = traceManager.createTracer({
        name: 'ticket.computed-value-operation',
        type: 'operation',
        relationSchemaName: 'global',
        requiredSpans: [{ name: 'end' }],
        variants: {
          cold_boot: { timeout: DEFAULT_COLDBOOT_TIMEOUT_DURATION },
        },
        // Define computed value in the initial definition as a Record
        computedValueDefinitions: {
          feature: {
            matches: [{ name: 'feature' }],
            computeValueFromMatches: (feature) => feature.length,
          },
        },
      })

      tracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'cold_boot',
      })

      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketAndUserAndGlobalRelationSchemasFixture>`
      Events: ${Render('start', 0)}--${Render('feature', 50)}--${Render('feature', 50)}-${Render('end', 0)}
      Time:   ${0}                   ${50}                     ${100}                    ${150}
      `

      processSpans(spans, traceManager)
      expect(reportFn).toHaveBeenCalled()

      const report = reportFn.mock.calls[0]![0]
      expect(report.computedValues).toEqual({
        feature: 2,
      })
    })

    it('correctly calculates multiple computed values with different matchers', () => {
      const traceManager = new TraceManager({
        relationSchemas,
        reportFn: getReportFn(),
        generateId,
        reportErrorFn,
      })

      const tracer = traceManager.createTracer({
        name: 'ticket.multiple-computed-values',
        type: 'operation',
        relationSchemaName: 'global',
        requiredSpans: [{ name: 'end' }],
        variants: {
          cold_boot: { timeout: DEFAULT_COLDBOOT_TIMEOUT_DURATION },
        },
        computedValueDefinitions: {
          'feature-count': {
            matches: [match.withName('feature'), match.withName('feature-2')],
            computeValueFromMatches: (feature, feature2) =>
              // @ts-expect-error unexpected TS error
              // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
              feature.length + feature2.length,
          },
          'error-count': {
            matches: [match.withName((name) => name.startsWith('error'))],
            // @ts-expect-error unexpected TS error
            computeValueFromMatches: (errors) => errors.length,
          },
        },
      })

      tracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'cold_boot',
      })

      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketAndUserAndGlobalRelationSchemasFixture>`
      Events: ${Render('start', 0)}--${Render('feature', 50)}--${Render('error-1', 50)}--${Render('feature', 50)}--${Render('error-2', 50)}--${Render('end', 0)}
      Time:   ${0}                   ${50}                     ${100}                    ${150}                    ${200}                    ${250}
      `

      processSpans(spans, traceManager)
      expect(reportFn).toHaveBeenCalled()

      const report = reportFn.mock.calls[0]![0]
      expect(report.computedValues).toEqual({
        'feature-count': 2,
        'error-count': 2,
      })
    })
    describe('promoteSpanAttributes integration', () => {
      it('should promote span attributes to trace attributes from specific span only', () => {
        const traceManager = new TraceManager({
          relationSchemas,
          reportFn: getReportFn(),
          generateId,
          reportErrorFn,
        })

        const tracer = traceManager.createTracer({
          name: 'ticket.promote-span-attributes',
          type: 'operation',
          relationSchemaName: 'ticket',
          requiredSpans: [match.withName('final')],
          variants: { x: { timeout: 1_000 } },
          promoteSpanAttributes: [
            {
              span: { name: 'foo', nthMatch: -1 },
              attributes: ['foo', 'only'],
            },
            {
              span: { name: 'bar', nthMatch: -1 },
              attributes: ['bar', 'baz'],
            },
          ],
        })

        tracer.start({ relatedTo: { ticketId: 't-aaa' }, variant: 'x' })

        // prettier-ignore
        const { spans } = getSpansFromTimeline<TicketAndUserAndGlobalRelationSchemasFixture>`
          Events: ${Render('foo', 0, { attributes: { foo: 'abc', only: 1, other: 99 } })}---${Render('foo', 2, { attributes: { foo: 'bar' } })}---${Render('bar', 4, { attributes: { bar: 123, baz: 'b', ignoreMe: 20 } })}---${Render('final', 6)}
          Time:   ${0}                                                                   ${2}                                                     ${4}                                                                        ${6}
        `
        processSpans(spans, traceManager)
        expect(reportFn).toHaveBeenCalled()
        const report = reportFn.mock.calls[0]![0]
        expect(report.attributes.foo).toBe('bar')
        expect(report.attributes.only).toBeUndefined()
        expect(report.attributes.bar).toBe(123)
        expect(report.attributes.baz).toBe('b')
        expect(report.attributes.other).toBeUndefined()
      })

      it('should promote all span attributes to trace attributes when no nthMatch is specified', () => {
        const traceManager = new TraceManager({
          relationSchemas,
          reportFn: getReportFn(),
          generateId,
          reportErrorFn,
        })

        const tracer = traceManager.createTracer({
          name: 'ticket.promote-span-attributes',
          type: 'operation',
          relationSchemaName: 'ticket',
          requiredSpans: [match.withName('final')],
          variants: { x: { timeout: 1_000 } },
          promoteSpanAttributes: [
            { span: match.withName('foo'), attributes: ['foo', 'only'] },
            { span: match.withName('bar'), attributes: ['bar', 'baz'] },
          ],
        })

        tracer.start({ relatedTo: { ticketId: 't-aaa' }, variant: 'x' })

        // prettier-ignore
        const { spans } = getSpansFromTimeline<TicketAndUserAndGlobalRelationSchemasFixture>`
          Events: ${Render('foo', 0, { attributes: { foo: 'abc', only: 1, other: 99 } })}---${Render('foo', 2, { attributes: { foo: 'bar' } })}---${Render('bar', 4, { attributes: { bar: 123, baz: 'b', ignoreMe: 20 } })}---${Render('final', 6)}
          Time:   ${0}                                                                      ${2}                                                  ${4}                                                                        ${6}
        `
        processSpans(spans, traceManager)
        expect(reportFn).toHaveBeenCalled()
        const report = reportFn.mock.calls[0]![0]
        expect(report.attributes.foo).toBe('bar')
        expect(report.attributes.only).toBe(1)
        expect(report.attributes.bar).toBe(123)
        expect(report.attributes.baz).toBe('b')
        expect(report.attributes.other).toBeUndefined()
      })

      it('should prefer explicit trace attributes over promoted', () => {
        const traceManager = new TraceManager({
          relationSchemas,
          reportFn: getReportFn(),
          generateId,
          reportErrorFn,
        })
        const tracer = traceManager.createTracer({
          name: 'ticket.promote-span-precedence',
          type: 'operation',
          relationSchemaName: 'ticket',
          requiredSpans: [match.withName('final')],
          variants: { v: { timeout: 1_000 } },
          promoteSpanAttributes: [
            { span: match.withName('foo'), attributes: ['foo', 'bar'] },
          ],
        })

        tracer.start({
          relatedTo: { ticketId: 't-bbb' },
          variant: 'v',
          attributes: { foo: 'winner', bar: 'own' },
        })
        // prettier-ignore
        const { spans } = getSpansFromTimeline<TicketAndUserAndGlobalRelationSchemasFixture>`
          Events: ${Render('foo', 3, { attributes: { foo: 'loser', bar: 'lost' } })}---${Render('final', 5)}
          Time:   ${3}                                                                 ${5}
        `
        processSpans(spans, traceManager)
        expect(reportFn).toHaveBeenCalled()
        const report = reportFn.mock.calls[0]![0]
        expect(report.attributes.foo).toBe('winner')
        expect(report.attributes.bar).toBe('own')
      })

      it('should promote on interruption', () => {
        const traceManager = new TraceManager({
          relationSchemas,
          reportFn: getReportFn(),
          generateId,
          reportErrorFn,
        })
        const tracer = traceManager.createTracer({
          name: 'ticket.promote-span-interrupt',
          type: 'operation',
          relationSchemaName: 'ticket',
          requiredSpans: [match.withName('done')],
          variants: { iv: { timeout: 1_000 } },
          promoteSpanAttributes: [
            { span: match.withName('interruptme'), attributes: ['interrupt'] },
          ],
        })
        tracer.start({ relatedTo: { ticketId: 't-interrupt' }, variant: 'iv' })
        // prettier-ignore
        const { spans } = getSpansFromTimeline<TicketAndUserAndGlobalRelationSchemasFixture>`
          Events: ${Render('interruptme', 8, { attributes: { interrupt: 'here' } })}---${Render('done', 20)}
          Time:   ${8}                                                                 ${20}
        `
        // forcibly interrupt
        processSpans(spans, traceManager)
        expect(reportFn).toHaveBeenCalled()
        const report = reportFn.mock.calls[0]![0]
        expect(report.attributes.interrupt).toBe('here')
      })
    })
  })
})
