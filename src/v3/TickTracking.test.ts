import { promisify } from 'node:util'
import {
  afterEach,
  assert,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  type MockInstance,
  vitest,
} from 'vitest'
import type {
  ConstructedSpanAndAnnotations,
  ConstructedSpanAndAnnotationsWithParent,
} from './spanAnnotationTypes'
import type {
  ComponentRenderSpan,
  ErrorSpan,
  GetParentSpanIdContext,
  PerformanceEntrySpan,
} from './spanTypes'
import type { TicketIdRelationSchemasFixture } from './testUtility/fixtures/relationSchemas'
import { TraceManager } from './TraceManager'
import type { AnyPossibleReportFn } from './types'

const waitOneTick = promisify(setImmediate)

describe('TickTracking', () => {
  let reportFn: Mock<AnyPossibleReportFn<TicketIdRelationSchemasFixture>>
  let generateId: Mock
  let reportErrorFn: Mock
  let traceManager: TraceManager<TicketIdRelationSchemasFixture>

  vitest.useFakeTimers({
    now: 0,
  })

  let id = 0

  beforeEach(() => {
    reportFn = vitest.fn()
    id = 0
    generateId = vitest.fn(() => `id-${id++}`)
    reportErrorFn = vitest.fn()

    traceManager = new TraceManager({
      relationSchemas: { ticket: { ticketId: String } },
      reportFn: reportFn as AnyPossibleReportFn<TicketIdRelationSchemasFixture>,
      generateId,
      reportErrorFn,
      enableTickTracking: true,
    })
  })

  afterEach(() => {
    vitest.clearAllMocks()
    vitest.clearAllTimers()
  })

  describe('TraceManager with tick tracking enabled', () => {
    it('should have tickParentResolver initialized when enableTickTracking is true', () => {
      expect(traceManager.tickParentResolver).toBeDefined()
    })

    it('should not have tickParentResolver when enableTickTracking is false', () => {
      const traceManagerWithoutTicks = new TraceManager({
        relationSchemas: { ticket: { ticketId: String } },
        reportFn:
          reportFn as AnyPossibleReportFn<TicketIdRelationSchemasFixture>,
        generateId,
        reportErrorFn,
        enableTickTracking: false,
      })

      expect(traceManagerWithoutTicks.tickParentResolver).toBeUndefined()
    })

    it('should assign tickId to spans when processing them', () => {
      const span = traceManager.ensureCompleteSpan({
        type: 'mark',
        name: 'test-span',
      })

      const annotationsResult = traceManager.processSpan(span)

      expect(span.tickId).toBeDefined()
      // first generated id goes to TickParentResolver, second to span
      expect(span.tickId).toBe('id-0')
      expect(span.id).toBe('id-1')
    })
  })

  describe('startSpan and endSpan functionality', () => {
    it('should create and process start span correctly', () => {
      const startResult: ConstructedSpanAndAnnotations<
        TicketIdRelationSchemasFixture,
        PerformanceEntrySpan<TicketIdRelationSchemasFixture>
      > = traceManager.startSpan({
        type: 'mark',
        name: 'operation-start',
        relatedTo: { ticketId: '123' },
      })

      expect(startResult.span).toBeDefined()
      expect(startResult.span.tickId).toBe('id-0')
      expect(startResult.span.id).toBe('id-1')
      expect(startResult.span.name).toBe('operation-start')
      expect(startResult.span.type).toBe('mark')
      expect(startResult.span.relatedTo).toEqual({ ticketId: '123' })
      expect(startResult.annotations).toBeUndefined() // no active trace
    })

    it('should create and process end span with reference to start span', () => {
      const startSpan = traceManager.ensureCompleteSpan({
        type: 'mark',
        name: 'operation-start',
        relatedTo: { ticketId: '123' },
      })

      const endResult = traceManager.endSpan(startSpan, {
        name: 'operation-end',
        duration: 100,
      })

      expect(endResult.span).toBeDefined()
      expect(endResult.span.id).not.toBe(startSpan.id)
      expect(endResult.span.name).toBe('operation-end')
      expect(endResult.span.startSpanId).toBe(startSpan.id)
      expect(endResult.span.duration).toBe(100)
      expect(endResult.span.relatedTo).toEqual({ ticketId: '123' })
      expect(endResult.span.tickId).toBeDefined()
    })

    it('should handle startRenderSpan and endRenderSpan', () => {
      const startResult = traceManager.startRenderSpan({
        name: 'MyComponent',
        relatedTo: { ticketId: '123' },
        isIdle: false,
        renderCount: 1,
        renderedOutput: 'loading',
      })

      expect(startResult.span.type).toBe('component-render-start')
      expect(startResult.span.name).toBe('MyComponent')
      expect(startResult.span.isIdle).toBe(false)
      expect(startResult.span.renderCount).toBe(1)

      const endResult = traceManager.endRenderSpan(startResult.span, {
        duration: 50,
        isIdle: true,
      })

      expect(endResult.span.type).toBe('component-render')
      expect(endResult.span.duration).toBe(50)
      expect(endResult.span.isIdle).toBe(true)
      expect(endResult.span.startSpanId).toBe(startResult.span.id)
    })
  })

  describe('processErrorSpan functionality', () => {
    it('should create and process error span', () => {
      const error = new Error('Test error')
      const errorResult: ConstructedSpanAndAnnotationsWithParent<
        TicketIdRelationSchemasFixture,
        ErrorSpan<TicketIdRelationSchemasFixture>
      > = traceManager.processErrorSpan({
        error,
        relatedTo: { ticketId: '123' },
      })

      expect(errorResult.span).toBeDefined()
      expect(errorResult.span.name).toBe('Error')
      expect(errorResult.span.type).toBe('error')
      expect(errorResult.span.status).toBe('error')
      expect(errorResult.span.error).toBe(error)
      expect(errorResult.span.relatedTo).toEqual({ ticketId: '123' })
      expect(errorResult.span.tickId).toBeDefined()
      expect(errorResult.parent).toBeUndefined() // no parent found
      expect(errorResult.parentSpanId).toBeUndefined()
    })

    it('should handle custom error span name and type', () => {
      const error = new Error('Custom error')
      const errorResult = traceManager.processErrorSpan({
        error,
        name: 'CustomErrorName',
        relatedTo: { ticketId: '456' },
      })

      expect(errorResult.span.name).toBe('CustomErrorName')
      expect(errorResult.span.type).toBe('error')
      expect(errorResult.span.status).toBe('error')
    })
  })

  describe('createAndProcessSpan functionality', () => {
    it('should create and process any type of span', () => {
      const spanResult: ConstructedSpanAndAnnotationsWithParent<
        TicketIdRelationSchemasFixture,
        PerformanceEntrySpan<TicketIdRelationSchemasFixture>
      > = traceManager.createAndProcessSpan({
        type: 'measure',
        name: 'custom-measure',
        duration: 200,
        relatedTo: { ticketId: '789' },
        attributes: { customAttribute: 'value' },
      })

      expect(spanResult.span).toBeDefined()
      expect(spanResult.span.type).toBe('measure')
      expect(spanResult.span.name).toBe('custom-measure')
      expect(spanResult.span.duration).toBe(200)
      expect(spanResult.span.relatedTo).toEqual({ ticketId: '789' })
      expect(spanResult.span.attributes).toEqual({ customAttribute: 'value' })
      expect(spanResult.span.tickId).toBeDefined()
      expect(spanResult.parent).toBeUndefined() // no parent resolved
      expect(spanResult.parentSpanId).toBeUndefined()
    })

    it('should handle component render span creation', () => {
      const renderResult: ConstructedSpanAndAnnotationsWithParent<
        TicketIdRelationSchemasFixture,
        ComponentRenderSpan<TicketIdRelationSchemasFixture>
      > = traceManager.createAndProcessSpan({
        type: 'component-render',
        name: 'TestComponent',
        isIdle: true,
        renderCount: 3,
        relatedTo: { ticketId: '999' },
        duration: 25,
        renderedOutput: 'content',
      })

      expect(renderResult.span.type).toBe('component-render')
      expect(renderResult.span.isIdle).toBe(true)
      expect(renderResult.span.renderCount).toBe(3)
      expect(renderResult.span.duration).toBe(25)
    })
  })

  describe('parent span resolution with getParentSpanId', () => {
    let activeTrace: string | undefined

    beforeEach(() => {
      // Create a tracer to enable trace recording
      const tracer = traceManager.createTracer({
        name: 'test-operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'end' }],
        variants: {
          default: { timeout: 10_000 },
        },
      })

      // Start a trace to have an active context
      activeTrace = tracer.start({
        relatedTo: { ticketId: '123' },
        variant: 'default',
      })
    })

    it('should resolve parent span using getParentSpanId function', () => {
      // Create a parent span first
      const parentResult = traceManager.createAndProcessSpan({
        type: 'mark',
        name: 'parent-span',
        relatedTo: { ticketId: '123' },
      })

      // Create a child span with getParentSpanId function
      const childResult = traceManager.createAndProcessSpan(
        {
          type: 'mark',
          name: 'child-span',
          relatedTo: { ticketId: '123' },
          getParentSpanId: ({ traceContext, spansInCurrentTick }) => {
            // Find the parent span by name
            for (const span of spansInCurrentTick) {
              if (span.name === 'parent-span') {
                return span.id
              }
            }
            return undefined
          },
        },
        true, // tryResolveParentSynchronously
      )

      expect(childResult.parentSpanId).toBe(parentResult.span.id)
      expect(childResult.parent?.span.id).toBe(parentResult.span.id)
      expect(childResult.parent?.span.name).toBe('parent-span')
    })

    it('should not resolve parent when tryResolveParentSynchronously is false', () => {
      // Create a parent span first
      const parentResult = traceManager.createAndProcessSpan({
        type: 'mark',
        name: 'parent-span',
        relatedTo: { ticketId: '123' },
      })

      // Create a child span with getParentSpanId function but don't resolve synchronously
      const childResult = traceManager.createAndProcessSpan(
        {
          type: 'mark',
          name: 'child-span',
          relatedTo: { ticketId: '123' },
          getParentSpanId: ({ traceContext }) => {
            for (const [
              spanId,
              spanAndAnnotation,
            ] of traceContext.recordedItems) {
              if (spanAndAnnotation.span.name === 'parent-span') {
                return spanId
              }
            }
            return undefined
          },
        },
        false, // tryResolveParentSynchronously
      )

      expect(childResult.parentSpanId).toBeUndefined()
      expect(childResult.parent).toBeUndefined()
    })
  })

  describe('parent span resolution with parentSpanMatcher', () => {
    let activeTrace: string | undefined

    beforeEach(() => {
      // Create a tracer to enable trace recording
      const tracer = traceManager.createTracer({
        name: 'test-operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'end' }],
        variants: {
          default: { timeout: 10_000 },
        },
      })

      // Start a trace to have an active context
      activeTrace = tracer.start({
        relatedTo: { ticketId: '123' },
        variant: 'default',
      })
    })

    it('should create getParentSpanId function from parentSpanMatcher for current-tick search', () => {
      // Create spans with parent resolution in the same tick
      const parentSpan = traceManager.ensureCompleteSpan({
        type: 'mark',
        name: 'parent-span',
        relatedTo: { ticketId: '123' },
      })
      traceManager.processSpan(parentSpan)

      const childSpan = traceManager.ensureCompleteSpan({
        type: 'mark',
        name: 'child-span',
        relatedTo: { ticketId: '123' },
        parentSpanMatcher: {
          search: 'current-tick',
          searchDirection: 'before-self',
          match: { name: 'parent-span' },
        },
      })

      expect(childSpan.getParentSpanId).toBeDefined()
      expect(typeof childSpan.getParentSpanId).toBe('function')

      // Process the child span
      traceManager.processSpan(childSpan)

      // trace hasn't ended yet:
      expect(reportFn).not.toHaveBeenCalled()

      const trace = traceManager.currentTraceContext
      assert(trace)

      const childSpanAndAnnotation = trace.recordedItems.get(childSpan.id)
      assert(childSpanAndAnnotation)

      expect(childSpanAndAnnotation.span).toBe(childSpan)

      const getParentSpanId: MockInstance<
        NonNullable<typeof childSpan.getParentSpanId>
      > = vitest.spyOn(childSpan, 'getParentSpanId')

      const endSpan = traceManager.ensureCompleteSpan({
        type: 'mark',
        name: 'end',
        relatedTo: { ticketId: '123' },
      })
      // complete the trace to trigger parent resolution
      traceManager.processSpan(endSpan)

      // trace should have finished
      expect(traceManager.currentTraceContext).toBeUndefined()
      expect(reportFn).toHaveBeenCalledTimes(1)

      expect(getParentSpanId).toHaveBeenCalledTimes(1)
      expect(getParentSpanId).toHaveReturnedWith(parentSpan.id)

      // The parentSpanMatcher should have generated a working getParentSpanId
      expect(childSpan.parentSpanId).toBe(parentSpan.id)
    })

    it('should create getParentSpanId function from parentSpanMatcher for current-tick search with after-self direction', () => {
      // Process the child span
      const childSpan = traceManager.ensureCompleteSpan({
        type: 'mark',
        name: 'child-span',
        relatedTo: { ticketId: '123' },
        parentSpanMatcher: {
          search: 'current-tick',
          searchDirection: 'after-self',
          match: { name: 'parent-span' },
        },
      })

      expect(childSpan.getParentSpanId).toBeDefined()
      expect(typeof childSpan.getParentSpanId).toBe('function')

      traceManager.processSpan(childSpan)

      // Create parent span in the same tick AFTER the child span
      const parentSpan = traceManager.ensureCompleteSpan({
        type: 'mark',
        name: 'parent-span',
        relatedTo: { ticketId: '123' },
      })
      traceManager.processSpan(parentSpan)

      // trace hasn't ended yet:
      expect(reportFn).not.toHaveBeenCalled()

      const trace = traceManager.currentTraceContext
      assert(trace)

      const childSpanAndAnnotation = trace.recordedItems.get(childSpan.id)
      assert(childSpanAndAnnotation)

      expect(childSpanAndAnnotation.span).toBe(childSpan)

      const getParentSpanId: MockInstance<
        NonNullable<typeof childSpan.getParentSpanId>
      > = vitest.spyOn(childSpan, 'getParentSpanId')

      const endSpan = traceManager.ensureCompleteSpan({
        type: 'mark',
        name: 'end',
        relatedTo: { ticketId: '123' },
      })
      // complete the trace to trigger parent resolution
      traceManager.processSpan(endSpan)

      // trace should have finished
      expect(traceManager.currentTraceContext).toBeUndefined()
      expect(reportFn).toHaveBeenCalledTimes(1)

      expect(getParentSpanId).toHaveBeenCalledTimes(1)
      expect(getParentSpanId).toHaveReturnedWith(parentSpan.id)

      // The parentSpanMatcher should have generated a working getParentSpanId
      expect(childSpan.parentSpanId).toBe(parentSpan.id)
    })

    it('should create getParentSpanId function from parentSpanMatcher for entire-recording search', async () => {
      // Create parent span first
      const parentSpan = traceManager.ensureCompleteSpan({
        type: 'mark',
        name: 'parent-span',
        relatedTo: { ticketId: '123' },
      })
      traceManager.processSpan(parentSpan)

      await waitOneTick()

      // trace hasn't ended yet:
      expect(reportFn).not.toHaveBeenCalled()

      const childSpan = traceManager.ensureCompleteSpan({
        type: 'mark',
        name: 'child-span',
        relatedTo: { ticketId: '123' },
        parentSpanMatcher: {
          search: 'entire-recording',
          searchDirection: 'before-self',
          match: { type: 'mark', name: 'parent-span' },
        },
      })

      expect(childSpan.getParentSpanId).toBeDefined()

      // Process the child span and complete trace
      traceManager.processSpan(childSpan)

      const endSpan = traceManager.ensureCompleteSpan({
        type: 'mark',
        name: 'end',
        relatedTo: { ticketId: '123' },
      })
      traceManager.processSpan(endSpan)

      // trace should have finished
      expect(traceManager.currentTraceContext).toBeUndefined()

      // The parentSpanMatcher should have generated a working getParentSpanId
      expect(childSpan.parentSpanId).toBe(parentSpan.id)
    })
  })

  describe('tick tracking in same event loop tick', () => {
    it('should assign the same tickId to spans created in the same synchronous execution', () => {
      const span1 = traceManager.ensureCompleteSpan({
        type: 'mark',
        name: 'span1',
      })
      traceManager.processSpan(span1)

      const span2 = traceManager.ensureCompleteSpan({
        type: 'mark',
        name: 'span2',
      })
      traceManager.processSpan(span2)

      const span3 = traceManager.ensureCompleteSpan({
        type: 'mark',
        name: 'span3',
      })
      traceManager.processSpan(span3)

      expect(span1.tickId).toBe(span2.tickId)
      expect(span2.tickId).toBe(span3.tickId)
      expect(span1.tickId).toBeDefined()
    })

    it('should assign different tickIds to spans created in different ticks', async () => {
      const span1 = traceManager.ensureCompleteSpan({
        type: 'mark',
        name: 'span1',
      })
      traceManager.processSpan(span1)

      // Ensure all microtasks are processed
      await waitOneTick()
      const span2 = traceManager.ensureCompleteSpan({
        type: 'mark',
        name: 'span2',
      })
      traceManager.processSpan(span2)

      expect(span1.tickId).not.toBe(span2.tickId)
      expect(span1.tickId).toBeDefined()
      expect(span2.tickId).toBeDefined()
    })

    it('should provide tick context in getParentSpanId calls', async () => {
      let capturedContext:
        | GetParentSpanIdContext<TicketIdRelationSchemasFixture>
        | undefined

      // Create a tracer to enable trace recording
      const tracer = traceManager.createTracer({
        name: 'tick-context-test',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'end' }],
        variants: {
          default: { timeout: 10_000 },
        },
      })

      // Start a trace
      const traceId = tracer.start({
        relatedTo: { ticketId: '123' },
        variant: 'default',
      })

      const span1 = traceManager.ensureCompleteSpan({
        type: 'mark',
        name: 'span1',
        relatedTo: { ticketId: '123' },
      })
      traceManager.processSpan(span1)

      const spanWithParentResolver = traceManager.ensureCompleteSpan({
        type: 'mark',
        name: 'child',
        relatedTo: { ticketId: '123' },
        getParentSpanId: (context) => {
          capturedContext = context
          // Return the first span as parent
          return context.spansInCurrentTick[0]?.id
        },
      })
      traceManager.processSpan(spanWithParentResolver)

      const span2 = traceManager.ensureCompleteSpan({
        type: 'mark',
        name: 'span2',
        relatedTo: { ticketId: '123' },
      })
      traceManager.processSpan(span2)

      // trigger next tick, so the endSpan is processed in a new tick
      await waitOneTick()

      // Add the required end span to complete the trace
      const endSpan = traceManager.ensureCompleteSpan({
        type: 'mark',
        name: 'end',
        relatedTo: { ticketId: '123' },
      })
      traceManager.processSpan(endSpan)

      // The getParentSpanId should have been called with tick context
      expect(capturedContext).toBeDefined()
      expect(capturedContext!.spansInCurrentTick).toHaveLength(3) // span1, spanWithParentResolver, span2
      expect(capturedContext!.thisSpanInCurrentTickIndex).toBe(1) // spanWithParentResolver was processed second
      expect(capturedContext!.spansInCurrentTick[0]).toBe(span1)
      expect(capturedContext!.spansInCurrentTick[1]).toBe(
        spanWithParentResolver,
      )
      expect(capturedContext!.spansInCurrentTick[2]).toBe(span2)

      // Verify that the parent span was actually set
      expect(spanWithParentResolver.parentSpanId).toBe(span1.id)
    })
  })

  describe('convenience span creation methods', () => {
    it('should create performance entry spans using makePerformanceEntrySpan', () => {
      const span = traceManager.makePerformanceEntrySpan({
        type: 'measure',
        name: 'custom-measure',
        relatedTo: { ticketId: '123' },
        duration: 50,
      })

      expect(span.type).toBe('measure')
      expect(span.name).toBe('custom-measure')
      expect(span.duration).toBe(50)
      expect(span.id).toBeDefined()
      expect(span.startTime).toBeDefined()
    })

    it('should create render spans using makeRenderSpan', () => {
      const span = traceManager.makeRenderSpan({
        type: 'component-render',
        name: 'MyComponent',
        isIdle: true,
        renderCount: 5,
        relatedTo: { ticketId: '456' },
        renderedOutput: 'content',
      })

      expect(span.type).toBe('component-render')
      expect(span.name).toBe('MyComponent')
      expect(span.isIdle).toBe(true)
      expect(span.renderCount).toBe(5)
      expect(span.id).toBeDefined()
      expect(span.startTime).toBeDefined()
    })
  })

  describe('ensureCompleteSpan functionality', () => {
    it('should auto-generate id when not provided', () => {
      const span = traceManager.ensureCompleteSpan({
        type: 'mark',
        name: 'test-span',
      })

      expect(span.id).toBe('id-1')
      expect(span.startTime).toBeDefined()
      expect(span.attributes).toEqual({})
      expect(span.duration).toBe(0)
    })

    it('should use provided id when given', () => {
      const span = traceManager.ensureCompleteSpan({
        type: 'mark',
        name: 'test-span',
        id: 'custom-id',
      })

      expect(span.id).toBe('custom-id')
    })

    it('should merge provided attributes', () => {
      const span = traceManager.ensureCompleteSpan({
        type: 'mark',
        name: 'test-span',
        attributes: { custom: 'value', other: 123 },
      })

      expect(span.attributes).toEqual({ custom: 'value', other: 123 })
    })

    it('should handle partial startTime', () => {
      const span = traceManager.ensureCompleteSpan({
        type: 'mark',
        name: 'test-span',
        startTime: { now: 100 },
      })

      expect(span.startTime.now).toBe(100)
      expect(span.startTime.epoch).toBeDefined()
    })
  })

  describe('edge cases and error handling', () => {
    it('should handle spans without tick tracking', () => {
      const traceManagerNoTicks = new TraceManager({
        relationSchemas: { ticket: { ticketId: String } },
        reportFn:
          reportFn as AnyPossibleReportFn<TicketIdRelationSchemasFixture>,
        generateId,
        reportErrorFn,
        enableTickTracking: false,
      })

      const span = traceManagerNoTicks.ensureCompleteSpan({
        type: 'mark',
        name: 'test-span',
      })

      const annotations = traceManagerNoTicks.processSpan(span)

      expect(span.tickId).toBeUndefined()
      expect(span.id).toBeDefined()
    })

    it('should handle getParentSpanId that returns undefined', () => {
      const result = traceManager.createAndProcessSpan(
        {
          type: 'mark',
          name: 'child-span',
          relatedTo: { ticketId: '123' },
          getParentSpanId: () => undefined,
        },
        true, // tryResolveParentSynchronously
      )

      expect(result.parentSpanId).toBeUndefined()
      expect(result.parent).toBeUndefined()
    })

    it('should handle missing parent span in synchronous resolution', () => {
      // Create a tracer for active context
      const tracer = traceManager.createTracer({
        name: 'test-operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'end' }],
        variants: {
          default: { timeout: 10_000 },
        },
      })

      tracer.start({
        relatedTo: { ticketId: '123' },
        variant: 'default',
      })

      const childResult = traceManager.createAndProcessSpan(
        {
          type: 'mark',
          name: 'child-span',
          getParentSpanId: () => 'non-existent-parent-id',
        },
        true, // tryResolveParentSynchronously
      )

      expect(childResult.parentSpanId).toBe('non-existent-parent-id')
      expect(childResult.parent).toBeUndefined() // parent not found in recorded items
    })
  })
})
