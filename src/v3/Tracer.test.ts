import './testUtility/asciiTimelineSerializer'
import {
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vitest as jest,
} from 'vitest'
import { Check, getSpansFromTimeline, Render } from './testUtility/makeTimeline'
import { processSpans } from './testUtility/processSpans'
import { TraceManager } from './TraceManager'
import type { AnyPossibleReportFn } from './types'

interface TestRelationSchema {
  test: {
    id: StringConstructor
  }
}

describe('Tracer', () => {
  let reportFn: Mock<AnyPossibleReportFn<TestRelationSchema>>
  // TS doesn't like that reportFn is wrapped in Mock<> type
  const getReportFn = () => reportFn as AnyPossibleReportFn<TestRelationSchema>
  let generateId: Mock
  let reportErrorFn: Mock

  let id = 0
  beforeEach(() => {
    reportFn = jest.fn<AnyPossibleReportFn<TestRelationSchema>>()
    id = 0
    generateId = jest.fn(() => `id-${id++}`)
    reportErrorFn = jest.fn()
    jest.useFakeTimers({ now: 0 })
  })

  describe('variants', () => {
    it('uses additional required spans from variant', () => {
      const traceManager = new TraceManager({
        relationSchemas: { test: { id: String } },
        reportFn: getReportFn(),
        generateId,
        reportErrorFn,
      })

      const tracer = traceManager.createTracer({
        name: 'test.operation',
        type: 'operation',
        relationSchemaName: 'test',
        requiredSpans: [{ name: 'base-required' }],
        variants: {
          variant_a: {
            timeout: 1_000,
            additionalRequiredSpans: [{ name: 'extra-required' }],
          },
          variant_b: {
            timeout: 1_000,
          },
        },
      })

      // Start trace with variant_a - should require both spans
      tracer.start({
        relatedTo: { id: '1' },
        variant: 'variant_a',
      })

      // Only see base-required span - should not complete

      // prettier-ignore
      const { spans: firstSpans } = getSpansFromTimeline<TestRelationSchema>`
        Events: ${Render('start', 0)}-----${Render('base-required', 0)}-----${Check}
        Time:   ${0}                      ${50}                            ${100}
      `
      processSpans(firstSpans, traceManager)
      expect(reportFn).not.toHaveBeenCalled()

      // See both required spans - should complete
      // prettier-ignore
      const { spans: secondSpans } = getSpansFromTimeline<TestRelationSchema>`
        Events: ${Render('base-required', 0)}-----${Render('extra-required', 0)}
        Time:   ${150}                            ${200}
      `
      processSpans(secondSpans, traceManager)

      expect(reportFn).toHaveBeenCalled()
      const report = reportFn.mock.calls[0]![0]
      expect(report.status).toBe('ok')
      expect(report.duration).toBe(200)
    })

    it('uses additional interrupt on spans from variant', () => {
      const traceManager = new TraceManager<TestRelationSchema>({
        relationSchemas: { test: { id: String } },
        reportFn: getReportFn(),
        generateId,
        reportErrorFn,
      })

      const tracer = traceManager.createTracer({
        name: 'test.operation',
        type: 'operation',
        relationSchemaName: 'test',
        requiredSpans: [{ name: 'required' }],
        debounceWindow: 100,
        variants: {
          variant_a: {
            timeout: 1_000,
            additionalInterruptOnSpans: [{ name: 'variant-a-interrupt' }],
          },
        },
      })

      tracer.start({
        relatedTo: { id: '1' },
        variant: 'variant_a',
      })

      // prettier-ignore
      const { spans } = getSpansFromTimeline<TestRelationSchema>`
        Events: ${Render('span', 0)}------${Render('variant-a-interrupt', 0)}---${Render('required', 0)}
        Time:   ${0}                      ${100}                                ${250}
      `
      processSpans(spans, traceManager)
      expect(reportFn).toHaveBeenCalled()

      const report = reportFn.mock.calls[0]![0]
      expect(report.status).toBe('interrupted')
      expect(report.duration).toBe(null)
    })

    it('uses additional debounce spans from variant', () => {
      const traceManager = new TraceManager<TestRelationSchema>({
        relationSchemas: { test: { id: String } },
        reportFn: getReportFn(),
        generateId,
        reportErrorFn,
      })

      const tracer = traceManager.createTracer({
        name: 'test.operation',
        type: 'operation',
        relationSchemaName: 'test',
        requiredSpans: [{ name: 'required' }],
        debounceOnSpans: [{ name: 'base-debounce' }],
        debounceWindow: 100,
        variants: {
          variant_a: {
            timeout: 1_000,
            additionalDebounceOnSpans: [{ name: 'extra-debounce' }],
          },
        },
      })

      tracer.start({
        relatedTo: { id: '1' },
        variant: 'variant_a',
      })

      // prettier-ignore
      const { spans } = getSpansFromTimeline<TestRelationSchema>`
        Events: ${Render('required', 0)}---${Render('base-debounce', 0)}---${Render('extra-debounce', 0)}---${Check}
        Time:   ${0}                       ${50}                           ${100}                           ${250}
      `
      processSpans(spans, traceManager)
      expect(reportFn).toHaveBeenCalled()

      const report = reportFn.mock.calls[0]![0]
      expect(report.status).toBe('ok')
      expect(report.duration).toBe(100)
    })

    it('different variants can have different additional spans', () => {
      const traceManager = new TraceManager<TestRelationSchema>({
        relationSchemas: { test: { id: String } },
        reportFn: getReportFn(),
        generateId,
        reportErrorFn,
      })

      const tracer = traceManager.createTracer({
        name: 'test.operation',
        type: 'operation',
        relationSchemaName: 'test',
        requiredSpans: [{ name: 'base-required' }],
        variants: {
          variant_a: {
            timeout: 1_000,
            additionalRequiredSpans: [{ name: 'extra-required-a' }],
          },
          variant_b: {
            timeout: 1_000,
            additionalRequiredSpans: [{ name: 'extra-required-b' }],
          },
        },
      })

      // Start trace with variant_a
      tracer.start({
        relatedTo: { id: '1' },
        variant: 'variant_a',
      })

      // Complete variant_a requirements
      // prettier-ignore
      const { spans: variantASpans } = getSpansFromTimeline<TestRelationSchema>`
        Events: ${Render('base-required', 0)}-----${Render('extra-required-a', 0)}
        Time:   ${0}                              ${50}
      `
      processSpans(variantASpans, traceManager)
      expect(reportFn).toHaveBeenCalled()
      expect(reportFn.mock.calls[0]![0].status).toBe('ok')

      reportFn.mockClear()

      // Start new trace with variant_b
      tracer.start({
        relatedTo: { id: '1' },
        variant: 'variant_b',
      })

      // Complete variant_b requirements
      // prettier-ignore
      const { spans: variantBSpans } = getSpansFromTimeline<TestRelationSchema>`
        Events: ${Render('base-required', 0)}-----${Render('extra-required-b', 0)}
        Time:   ${100}                            ${150}
      `
      processSpans(variantBSpans, traceManager)
      expect(reportFn).toHaveBeenCalled()
      expect(reportFn.mock.calls[0]![0].status).toBe('ok')
    })
  })

  describe('addRequiredSpansToCurrentTrace', () => {
    it('adds required spans to an existing trace', () => {
      const traceManager = new TraceManager<TestRelationSchema>({
        relationSchemas: { test: { id: String } },
        reportFn: getReportFn(),
        generateId,
        reportErrorFn,
      })

      const tracer = traceManager.createTracer({
        name: 'test.operation',
        type: 'operation',
        relationSchemaName: 'test',
        requiredSpans: [{ name: 'hello' }, { name: 'initial-required' }],
        variants: {
          default: { timeout: 1_000 },
        },
      })

      // Start trace
      tracer.start({
        relatedTo: { id: '1' },
        variant: 'default',
      })

      // @ts-expect-error internal prop
      const trace = tracer.rootTraceUtilities.getCurrentTrace()
      expect(
        trace?.stateMachine.successfullyMatchedRequiredSpanMatchers.size,
      ).toBe(0)
      expect(trace?.definition.requiredSpans).toHaveLength(2)
      expect(trace?.definition.interruptOnSpans).toHaveLength(2)

      // See initial required span - should not complete yet
      // prettier-ignore
      const { spans: firstSpans } = getSpansFromTimeline<TestRelationSchema>`
        Events: ${Render('hello', 0)}
        Time:   ${50}
      `
      processSpans(firstSpans, traceManager)
      expect(reportFn).not.toHaveBeenCalled()

      // Now add an additional required span
      tracer.addRequirementsToCurrentTraceOnly({
        additionalRequiredSpans: [{ name: 'added-required' }],
      })

      // @ts-expect-error internal prop
      const traceRecreated = tracer.rootTraceUtilities.getCurrentTrace()
      expect(traceRecreated).not.toBe(trace)
      expect(traceRecreated?.definition.requiredSpans).toHaveLength(3)
      expect(traceRecreated?.definition.interruptOnSpans).toHaveLength(3)
      // two required spans left:
      expect(
        traceRecreated?.stateMachine.successfullyMatchedRequiredSpanMatchers
          .size,
      ).toBe(1)

      // See the added required span - now should complete
      // prettier-ignore
      const { spans: secondSpans } = getSpansFromTimeline<TestRelationSchema>`
        Events: ${Render('initial-required', 50)}----${Render('added-required', 0)}
        Time:   ${100}                               ${150}
      `
      processSpans(secondSpans, traceManager)

      expect(
        traceRecreated?.stateMachine.successfullyMatchedRequiredSpanMatchers
          .size,
      ).toBe(3)

      // Verify trace completed
      expect(reportFn).toHaveBeenCalled()
      const report = reportFn.mock.calls[0]![0]
      expect(report.status).toBe('ok')
      expect(report.duration).toBe(150)

      // Verify that previous spans were preserved
      const recordedSpanNames = report.entries.map((s) => s.span.name)
      expect(recordedSpanNames).toEqual([
        'hello',
        'initial-required',
        'added-required',
      ])
      expect(traceManager.currentTracerContext).toBeUndefined()
    })
  })

  describe('adding requiredSpans', () => {
    it('adds requiredSpans when starting a trace', () => {
      const traceManager = new TraceManager({
        relationSchemas: { test: { id: String } },
        reportFn: getReportFn(),
        generateId,
        reportErrorFn,
      })
      const tracer = traceManager.createTracer({
        name: 'ticket.basic-operation',
        type: 'operation',
        relationSchemaName: 'test',
        requiredSpans: [{ name: 'orig-end' }],
        variants: {
          cold_boot: { timeout: 10_000 },
        },
      })
      const traceId = tracer.start(
        {
          relatedTo: { id: '1' },
          variant: 'cold_boot',
        },
        {
          additionalRequiredSpans: [{ name: 'additional-end' }],
        },
      )
      expect(traceId).toBe('id-0')

      // @ts-expect-error internals
      const trace = tracer.rootTraceUtilities.getCurrentTrace()
      expect(trace?.definition.requiredSpans).toHaveLength(2)
      expect(
        trace?.stateMachine.successfullyMatchedRequiredSpanMatchers.size,
      ).toBe(0)
      expect(trace?.definition.interruptOnSpans).toHaveLength(2)

      // prettier-ignore
      const { spans } = getSpansFromTimeline<TestRelationSchema>`
        Events: ${Render('start', 0)}-----${Render('middle', 0)}-----${Render('orig-end', 0)}----${Render('additional-end', 0)}
        Time:   ${0}                      ${50}                      ${100}                      ${150}
      `

      processSpans(spans, traceManager)
      expect(reportFn).toHaveBeenCalled()

      expect(
        trace?.stateMachine.successfullyMatchedRequiredSpanMatchers.size,
      ).toBe(2)

      const report = reportFn.mock.calls[0]![0]
      expect(
        report.entries.map(
          (spanAndAnnotation) => spanAndAnnotation.span.performanceEntry,
        ),
      ).toMatchInlineSnapshot(`
        events    | start       middle      orig-end    additional-end
        timeline  | |-<⋯ +50 ⋯>-|-<⋯ +50 ⋯>-|-<⋯ +50 ⋯>-|
        time (ms) | 0           50          100         150
      `)
      expect(report.name).toBe('ticket.basic-operation')
      expect(report.duration).toBe(150)
      expect(report.status).toBe('ok')
      expect(report.interruptionReason).toBeUndefined()
    })

    it('adds requiredSpans when creating a trace, and then again after transitioning to active, and again after start', () => {
      const traceManager = new TraceManager({
        relationSchemas: { test: { id: String } },
        reportFn: getReportFn(),
        generateId,
        reportErrorFn,
      })
      const tracer = traceManager.createTracer({
        name: 'ticket.basic-operation',
        type: 'operation',
        relationSchemaName: 'test',
        requiredSpans: [
          function origEnd({ span }) {
            return span.name === 'orig-end'
          },
        ],
        variants: {
          cold_boot: {
            timeout: 10_000,
            additionalRequiredSpans: [
              function variantEnd({ span }) {
                return span.name === 'variant-end'
              },
            ],
          },
        },
      })
      const traceId = tracer.createDraft(
        {
          variant: 'cold_boot',
        },
        {
          additionalRequiredSpans: [
            function draftEnd({ span }) {
              return span.name === 'draft-end'
            },
          ],
        },
      )

      tracer.transitionDraftToActive({
        relatedTo: { id: '1' },
        additionalRequiredSpans: [
          function transitionToActiveEnd({ span }) {
            return span.name === 'transition-to-active-end'
          },
        ],
      })

      tracer.addRequirementsToCurrentTraceOnly({
        additionalRequiredSpans: [
          function activeEnd({ span }) {
            return span.name === 'active-end'
          },
        ],
      })

      // @ts-expect-error internals
      const trace = tracer.rootTraceUtilities.getCurrentTrace()

      expect(trace?.definition.requiredSpans).toHaveLength(5)
      expect(
        trace?.stateMachine.successfullyMatchedRequiredSpanMatchers.size,
      ).toBe(0)
      expect(trace?.definition.interruptOnSpans).toHaveLength(5)

      // prettier-ignore
      const { spans } = getSpansFromTimeline<TestRelationSchema>`
        Events: ${Render('start', 0)}-----${Render('orig-end', 0)}----${Render('variant-end', 0)}----${Render('draft-end', 0)}----${Render('transition-to-active-end', 0)}---${Render('active-end', 0)}
        Time:   ${0}                      ${50}                       ${100}                         ${150}                       ${200}                                     ${250}
        `

      processSpans(spans, traceManager)
      expect(reportFn).toHaveBeenCalled()

      expect(
        trace?.stateMachine.successfullyMatchedRequiredSpanMatchers.size,
      ).toBe(5)

      const report = reportFn.mock.calls[0]![0]
      expect(
        report.entries.map(
          (spanAndAnnotation) => spanAndAnnotation.span.performanceEntry,
        ),
      ).toMatchInlineSnapshot(`
        events    |                                                                 active-end
        events    | start       orig-end     variant-end  draft-end    transition-to-active-end
        timeline  | |-----------|------------|------------|------------|------------|-
        time (ms) | 0           50           100          150          200          250
      `)
      expect(report.name).toBe('ticket.basic-operation')
      expect(report.duration).toBe(250)
      expect(report.status).toBe('ok')
      expect(report.interruptionReason).toBeUndefined()
    })
  })
})
