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
import type { ProcessedSpan } from './spanAnnotationTypes'
import {
  type ComponentRenderSpan,
  type ErrorSpan,
  type GetParentSpanContext,
  PARENT_SPAN,
  type PerformanceEntrySpan,
} from './spanTypes'
import type { TicketIdRelationSchemasFixture } from './testUtility/fixtures/relationSchemas'
import { TICK_META } from './TickParentResolver'
import type { Trace } from './Trace'
import { TraceManager } from './TraceManager'
import type { AnyPossibleReportFn } from './types'

const waitOneTick = promisify(setImmediate)

describe('creating spans', () => {
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
      const startResult: ProcessedSpan<
        TicketIdRelationSchemasFixture,
        PerformanceEntrySpan<TicketIdRelationSchemasFixture>
      > = traceManager.createAndProcessSpan({
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
      const errorResult: ProcessedSpan<
        TicketIdRelationSchemasFixture,
        ErrorSpan<TicketIdRelationSchemasFixture>
      > = traceManager.processErrorSpan({
        error,
        relatedTo: { ticketId: '123' },
      })

      const parent = errorResult.resolveParent()

      expect(errorResult.span).toBeDefined()
      expect(errorResult.span.name).toBe('Error')
      expect(errorResult.span.type).toBe('error')
      expect(errorResult.span.status).toBe('error')
      expect(errorResult.span.error).toBe(error)
      expect(errorResult.span.relatedTo).toEqual({ ticketId: '123' })
      expect(errorResult.span.tickId).toBeDefined()
      expect(parent).toBeUndefined() // no parent found
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
      const spanResult: ProcessedSpan<
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
      expect(spanResult.resolveParent()).toBeUndefined() // no parent resolved
    })

    it('should handle component render span creation', () => {
      const renderResult: ProcessedSpan<
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
      const childResult = traceManager.createAndProcessSpan({
        type: 'mark',
        name: 'child-span',
        relatedTo: { ticketId: '123' },
        getParentSpan: ({ thisSpanAndAnnotation }) => {
          // Find the parent span by name
          for (const span of thisSpanAndAnnotation.span[TICK_META]
            ?.spansInCurrentTick ?? []) {
            if (span.name === 'parent-span') {
              return span
            }
          }
          return undefined
        },
      })

      const resolvedParent = childResult.resolveParent()
      expect(resolvedParent?.id).toBe(parentResult.span.id)
      expect(resolvedParent?.name).toBe('parent-span')
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

      expect(childSpan.getParentSpan).toBeDefined()
      expect(typeof childSpan.getParentSpan).toBe('function')

      // Process the child span
      traceManager.processSpan(childSpan)

      // trace hasn't ended yet:
      expect(reportFn).not.toHaveBeenCalled()

      const trace = traceManager.currentTraceContext
      assert(trace)

      const childSpanAndAnnotation = trace.recordedItems.get(childSpan.id)
      assert(childSpanAndAnnotation)

      expect(childSpanAndAnnotation.span).toBe(childSpan)

      const getParentSpan: MockInstance<
        NonNullable<typeof childSpan.getParentSpan>
      > = vitest.spyOn(childSpan, 'getParentSpan')

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

      expect(getParentSpan).toHaveBeenCalledTimes(1)
      expect(getParentSpan).toHaveReturnedWith(parentSpan)

      // The parentSpanMatcher should have generated a working getParentSpan
      expect(childSpan[PARENT_SPAN]).toBe(parentSpan)
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

      expect(childSpan.getParentSpan).toBeDefined()
      expect(typeof childSpan.getParentSpan).toBe('function')

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

      const getParentSpan: MockInstance<
        NonNullable<typeof childSpan.getParentSpan>
      > = vitest.spyOn(childSpan, 'getParentSpan')

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

      expect(getParentSpan).toHaveBeenCalledTimes(1)
      expect(getParentSpan).toHaveReturnedWith(parentSpan)

      // The parentSpanMatcher should have generated a working getParentSpan
      expect(childSpan[PARENT_SPAN]).toBe(parentSpan)
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

      expect(childSpan.getParentSpan).toBeDefined()

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

      // The parentSpanMatcher should have generated a working getParentSpan
      expect(childSpan[PARENT_SPAN]).toBe(parentSpan)
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
        | GetParentSpanContext<TicketIdRelationSchemasFixture>
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
        getParentSpan: (context) => {
          capturedContext = context
          // Return the first span as parent
          return context.thisSpanAndAnnotation.span[TICK_META]
            ?.spansInCurrentTick[0]
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
      expect(
        capturedContext!.thisSpanAndAnnotation.span[TICK_META]
          ?.spansInCurrentTick,
      ).toHaveLength(3) // span1, spanWithParentResolver, span2
      expect(
        capturedContext!.thisSpanAndAnnotation.span[TICK_META]
          ?.thisSpanInCurrentTickIndex,
      ).toBe(1) // spanWithParentResolver was processed second
      expect(
        capturedContext!.thisSpanAndAnnotation.span[TICK_META]
          ?.spansInCurrentTick[0],
      ).toBe(span1)
      expect(
        capturedContext!.thisSpanAndAnnotation.span[TICK_META]
          ?.spansInCurrentTick[1],
      ).toBe(spanWithParentResolver)
      expect(
        capturedContext!.thisSpanAndAnnotation.span[TICK_META]
          ?.spansInCurrentTick[2],
      ).toBe(span2)

      // Verify that the parent span was actually set
      expect(spanWithParentResolver[PARENT_SPAN]).toBe(span1)
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
      const result = traceManager.createAndProcessSpan({
        type: 'mark',
        name: 'child-span',
        relatedTo: { ticketId: '123' },
        getParentSpan: () => undefined,
      })

      expect(result.span[PARENT_SPAN]).toBeUndefined()
      expect(result.resolveParent()).toBeUndefined()
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

      const childResult = traceManager.createAndProcessSpan({
        type: 'mark',
        name: 'child-span',
        getParentSpan: () => undefined,
      })

      expect(childResult.resolveParent()).toBeUndefined() // parent not found in recorded items
    })
  })

  describe('updateSpan functionality', () => {
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

    it('should merge object properties like attributes', () => {
      const result = traceManager.createAndProcessSpan({
        type: 'mark',
        name: 'test-span',
        relatedTo: { ticketId: '123' },
        attributes: {
          originalProp: 'original',
          keepThis: 'value1',
        },
      })

      // Update attributes - should merge with existing attributes
      result.updateSpan({
        attributes: {
          originalProp: 'updated',
          newProp: 'added',
        },
      })

      expect(result.span.attributes).toEqual({
        originalProp: 'updated',
        keepThis: 'value1',
        newProp: 'added',
      })
    })

    it('should merge relatedTo object properties', () => {
      const result = traceManager.createAndProcessSpan({
        type: 'mark',
        name: 'test-span',
        relatedTo: { ticketId: '123' },
      })

      // Update relatedTo - should merge with existing relatedTo
      result.updateSpan({
        relatedTo: { ticketId: '456' },
      })

      expect(result.span.relatedTo).toEqual({ ticketId: '456' })
    })

    it('should update component render span specific properties', () => {
      const result = traceManager.createAndProcessSpan<
        ComponentRenderSpan<TicketIdRelationSchemasFixture>
      >({
        type: 'component-render',
        name: 'TestComponent',
        relatedTo: { ticketId: '123' },
        isIdle: false,
        renderCount: 1,
        renderedOutput: 'loading',
        attributes: {},
      })

      // Update component-specific properties
      result.updateSpan({
        isIdle: true,
        renderedOutput: 'content',
      })

      expect(result.span.isIdle).toBe(true)
      expect(result.span.renderedOutput).toBe('content')
    })

    it('should handle undefined values to remove properties from objects', () => {
      const result = traceManager.createAndProcessSpan({
        type: 'mark',
        name: 'test-span',
        relatedTo: { ticketId: '123' },
        attributes: {
          prop1: 'value1',
          prop2: 'value2',
        },
      })

      // Update attributes to remove prop1 by setting it to undefined
      result.updateSpan({
        attributes: {
          prop1: undefined,
          prop3: 'new value',
        },
      })

      expect(result.span.attributes).toEqual({
        prop1: undefined,
        prop2: 'value2',
        prop3: 'new value',
      })
    })

    it('should ignore updates when trace has changed', () => {
      const result = traceManager.createAndProcessSpan({
        type: 'mark',
        name: 'test-span',
        relatedTo: { ticketId: '123' },
      })

      const originalAttributes = { ...result.span.attributes }

      // Complete the current trace by adding the required end span
      const endSpan = traceManager.ensureCompleteSpan({
        type: 'mark',
        name: 'end',
        relatedTo: { ticketId: '123' },
      })
      traceManager.processSpan(endSpan)

      // Now the trace has ended, updateSpan should be ignored
      result.updateSpan({
        attributes: { shouldNotUpdate: 'ignored' },
      })

      // Span should remain unchanged
      expect(result.span.attributes).toEqual(originalAttributes)
    })

    it('should work with error spans', () => {
      const error = new Error('Test error')
      const result = traceManager.processErrorSpan({
        error,
        relatedTo: { ticketId: '123' },
        attributes: { errorType: 'validation' },
      })

      // Update error span attributes
      result.updateSpan({
        attributes: {
          errorType: 'network',
          severity: 'high',
        },
      })

      expect(result.span.attributes).toEqual({
        errorType: 'network',
        severity: 'high',
      })
      expect(result.span.error).toBe(error) // Error object should remain unchanged
    })

    it('should update multiple properties in one call for component render spans', () => {
      const result = traceManager.createAndProcessSpan<
        ComponentRenderSpan<TicketIdRelationSchemasFixture>
      >({
        type: 'component-render',
        name: 'TestComponent',
        relatedTo: { ticketId: '123' },
        isIdle: false,
        renderCount: 1,
        renderedOutput: 'loading',
        attributes: { version: '1.0' },
      })

      // Update multiple properties at once
      result.updateSpan({
        isIdle: true,
        renderedOutput: 'content',
        attributes: {
          version: '2.0',
          updated: true,
        },
      })

      expect(result.span.isIdle).toBe(true)
      expect(result.span.renderedOutput).toBe('content')
      expect(result.span.attributes).toEqual({
        version: '2.0',
        updated: true,
      })
    })

    it('should not affect span matching since spans are processed synchronously', () => {
      // This test documents the caveat mentioned in the updateSpan documentation
      const result = traceManager.createAndProcessSpan({
        type: 'mark',
        name: 'test-span',
        relatedTo: { ticketId: '123' },
        attributes: { matchable: false },
      })

      // Update the attribute after processing
      result.updateSpan({
        attributes: { matchable: true },
      })

      // The span's attribute is updated
      expect(result.span.attributes?.matchable).toBe(true)

      // But if there were matchers that relied on this attribute,
      // they would have already been evaluated during processSpan()
      // This test just documents this behavior - the actual matching
      // logic would be tested in the tracer/matcher tests
    })

    it('should not do anything without an active trace', () => {
      const endSpan = traceManager.ensureCompleteSpan({
        type: 'mark',
        name: 'end',
        relatedTo: { ticketId: '123' },
      })
      traceManager.processSpan(endSpan)

      // Create a span without an active trace
      const result = traceManager.createAndProcessSpan({
        type: 'mark',
        name: 'standalone-span',
      })

      const originalAttributes = { ...result.span.attributes }

      // updateSpan should be a no-op, as there is no active trace
      result.updateSpan({
        attributes: { updated: true },
      })

      expect(result.span.attributes).toEqual(originalAttributes)
    })

    it('should only allow updating specific properties defined in UpdatableSpanProperties', () => {
      const result = traceManager.createAndProcessSpan({
        type: 'mark',
        name: 'test-span',
        relatedTo: { ticketId: '123' },
        attributes: { prop: 'value' },
      })

      // These properties should be updatable
      result.updateSpan({
        attributes: { newProp: 'new' },
        relatedTo: { ticketId: '456' },
      })

      expect(result.span.attributes).toEqual({ prop: 'value', newProp: 'new' })
      expect(result.span.relatedTo).toEqual({ ticketId: '456' })

      // Properties like name, duration, id, etc. are not in UpdatableSpanProperties
      // so they cannot be updated via updateSpan (this is by design)
    })

    it('should preserve object references when merging', () => {
      const result = traceManager.createAndProcessSpan({
        type: 'mark',
        name: 'test-span',
        relatedTo: { ticketId: '123' },
        attributes: { nested: { prop1: 'value1' }, topLevel: 'keep' },
      })

      const originalAttributesRef = result.span.attributes

      // Update should merge into the existing attributes object
      result.updateSpan({
        attributes: { nested: { prop2: 'value2' }, newTopLevel: 'added' },
      })

      // The attributes object reference should remain the same
      expect(result.span.attributes).toBe(originalAttributesRef)

      // Top-level properties should be merged (Object.assign behavior)
      expect(result.span.attributes).toEqual({
        nested: { prop2: 'value2' }, // nested object is replaced, not merged
        topLevel: 'keep',
        newTopLevel: 'added',
      })
    })
  })

  describe('span re-processing after updateSpan', () => {
    let activeTrace: string | undefined

    beforeEach(() => {
      // Create a tracer to enable trace recording
      const tracer = traceManager.createTracer({
        name: 'reprocessing-test',
        relationSchemaName: 'ticket',
        requiredSpans: [
          { name: 'test-span', attributes: { status: 'ready' } },
          { name: 'final-span', attributes: { completed: true } },
        ],
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

    it('should re-evaluate matchers when updateSpan is called', () => {
      // Create a span with the correct name but wrong attribute
      const result = traceManager.createAndProcessSpan({
        type: 'mark',
        name: 'test-span',
        relatedTo: { ticketId: '123' },
        attributes: { status: 'pending' }, // Wrong status, should be 'ready'
      })

      // Verify the trace is still active (required spans not met)
      expect(
        (
          traceManager.currentTraceContext as Trace<
            'ticket',
            TicketIdRelationSchemasFixture,
            'default'
          >
        )?.stateMachine?.currentState,
      ).toBe('active')

      // Update the span attributes to match the requirement - this should trigger re-processing
      result.updateSpan({
        attributes: { status: 'ready' }, // Now matches the required attribute
      })

      // Verify the attribute was updated
      expect(result.span.attributes?.status).toBe('ready')

      // Create the second required span to complete the trace
      const finalSpan = traceManager.createAndProcessSpan({
        type: 'mark',
        name: 'final-span',
        relatedTo: { ticketId: '123' },
        attributes: { completed: true },
      })

      // The trace should now be complete
      expect(traceManager.currentTraceContext).toBeUndefined()
      expect(reportFn).toHaveBeenCalledTimes(1)
    })

    it('should re-evaluate attribute-based matchers when attributes are updated', () => {
      // End the current trace first
      const endCurrentTrace = traceManager.ensureCompleteSpan({
        type: 'mark',
        name: 'final-span',
        relatedTo: { ticketId: '123' },
        attributes: { completed: true },
      })
      traceManager.processSpan(endCurrentTrace)

      // Create a tracer that requires a specific attribute value
      const attributeTracer = traceManager.createTracer({
        name: 'attribute-test',
        relationSchemaName: 'ticket',
        requiredSpans: [
          { name: 'test-span', attributes: { required: true } },
          { name: 'end' },
        ],
        variants: {
          default: { timeout: 10_000 },
        },
      })

      // Start the new trace
      attributeTracer.start({
        relatedTo: { ticketId: '456' },
        variant: 'default',
      })

      // Create a span without the required attribute
      const result = traceManager.createAndProcessSpan({
        type: 'mark',
        name: 'test-span',
        relatedTo: { ticketId: '456' },
        attributes: { required: false, other: 'value' },
      })

      // Verify the trace is still active (required span not matched due to attribute)
      expect(
        (
          traceManager.currentTraceContext as Trace<
            'ticket',
            TicketIdRelationSchemasFixture,
            'default'
          >
        )?.stateMachine?.currentState,
      ).toBe('active')

      // Update the span attributes to match the requirement
      result.updateSpan({
        attributes: { required: true, additional: 'new' },
      })

      // Verify the attributes were merged correctly
      expect(result.span.attributes).toEqual({
        required: true,
        other: 'value',
        additional: 'new',
      })

      // Add the end span to complete the trace
      const endSpan = traceManager.createAndProcessSpan({
        type: 'mark',
        name: 'end',
        relatedTo: { ticketId: '456' },
      })

      // The trace should now be complete
      expect(traceManager.currentTraceContext).toBeUndefined()
      expect(reportFn).toHaveBeenCalledTimes(2) // Original trace + this new one
    })

    it('should not re-process spans after trace has ended', () => {
      const result = traceManager.createAndProcessSpan({
        type: 'mark',
        name: 'test-span',
        relatedTo: { ticketId: '123' },
        attributes: { original: 'value' },
      })

      // Complete the trace
      const initialSpan = traceManager.ensureCompleteSpan({
        type: 'mark',
        name: 'test-span',
        relatedTo: { ticketId: '123' },
        attributes: { status: 'ready' },
      })
      traceManager.processSpan(initialSpan)

      const finalSpan = traceManager.ensureCompleteSpan({
        type: 'mark',
        name: 'final-span',
        relatedTo: { ticketId: '123' },
        attributes: { completed: true },
      })
      traceManager.processSpan(finalSpan)

      // Trace should be complete
      expect(traceManager.currentTraceContext).toBeUndefined()

      const originalAttributes = { ...result.span.attributes }

      // Try to update the span after trace completion - should be ignored
      result.updateSpan({
        attributes: { updated: 'ignored' },
      })

      // Attributes should remain unchanged
      expect(result.span.attributes).toEqual(originalAttributes)
    })

    it('should preserve span object references during re-processing', () => {
      const result = traceManager.createAndProcessSpan({
        type: 'mark',
        name: 'test-span',
        relatedTo: { ticketId: '123' },
        attributes: { prop: 'value' },
      })

      const originalSpanRef = result.span
      const originalAttributesRef = result.span.attributes

      // Update the span
      result.updateSpan({
        attributes: { newProp: 'newValue' },
      })

      // Object references should be preserved
      expect(result.span).toBe(originalSpanRef)
      expect(result.span.attributes).toBe(originalAttributesRef)

      // But content should be updated
      expect(result.span.attributes).toEqual({
        prop: 'value',
        newProp: 'newValue',
      })
    })

    it('should handle multiple updateSpan calls correctly', () => {
      const result = traceManager.createAndProcessSpan({
        type: 'mark',
        name: 'evolving-span',
        relatedTo: { ticketId: '123' },
        attributes: { step: 1 },
      })

      // First update
      result.updateSpan({
        attributes: { step: 2, phase: 'early' },
      })

      expect(result.span.attributes).toEqual({
        step: 2,
        phase: 'early',
      })

      // Second update
      result.updateSpan({
        attributes: { step: 3, phase: 'late', final: true },
      })

      expect(result.span.attributes).toEqual({
        step: 3,
        phase: 'late',
        final: true,
      })

      // Third update - partial
      result.updateSpan({
        attributes: { phase: 'complete' },
      })

      expect(result.span.attributes).toEqual({
        step: 3,
        phase: 'complete',
        final: true,
      })
    })
  })

  describe('findSpanInParentHierarchy functionality', () => {
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

    it('should find the span itself when it matches the criteria', () => {
      const result = traceManager.createAndProcessSpan({
        type: 'mark',
        name: 'target-span',
        relatedTo: { ticketId: '123' },
        attributes: { category: 'test' },
      })

      const found = traceManager.findSpanInParentHierarchy(result.span, {
        name: 'target-span',
      })

      expect(found).toBeDefined()
      expect(found?.span.id).toBe(result.span.id)
      expect(found?.span.name).toBe('target-span')
    })

    it('should find parent span when child does not match but parent does', () => {
      // Create grandparent
      const grandparentResult = traceManager.createAndProcessSpan({
        type: 'mark',
        name: 'grandparent',
        relatedTo: { ticketId: '123' },
        attributes: { level: 'root' },
      })

      // Create parent with explicit parentSpanId
      const parentResult = traceManager.createAndProcessSpan({
        type: 'mark',
        name: 'parent',
        relatedTo: { ticketId: '123' },
        parentSpan: grandparentResult.span,
        attributes: { level: 'middle' },
      })

      // Create child with explicit parentSpanId
      const childResult = traceManager.createAndProcessSpan({
        type: 'mark',
        name: 'child',
        relatedTo: { ticketId: '123' },
        parentSpan: parentResult.span,
        attributes: { level: 'leaf' },
      })

      // Search for parent from child
      const found = traceManager.findSpanInParentHierarchy(childResult.span, {
        name: 'parent',
      })

      expect(found).toBeDefined()
      expect(found?.span.id).toBe(parentResult.span.id)
      expect(found?.span.name).toBe('parent')
    })

    it('should traverse multiple levels to find matching ancestor', () => {
      // Create a hierarchy: root -> middle -> leaf
      const rootResult = traceManager.createAndProcessSpan({
        type: 'mark',
        name: 'root',
        relatedTo: { ticketId: '123' },
        attributes: { category: 'system' },
      })

      const middleResult = traceManager.createAndProcessSpan({
        type: 'mark',
        name: 'middle',
        relatedTo: { ticketId: '123' },
        parentSpan: rootResult.span,
        attributes: { category: 'business' },
      })

      const leafResult = traceManager.createAndProcessSpan({
        type: 'mark',
        name: 'leaf',
        relatedTo: { ticketId: '123' },
        parentSpan: middleResult.span,
        attributes: { category: 'ui' },
      })

      // Search for root from leaf (should skip middle)
      const found = traceManager.findSpanInParentHierarchy(leafResult.span, {
        attributes: { category: 'system' },
      })

      expect(found).toBeDefined()
      expect(found?.span.id).toBe(rootResult.span.id)
      expect(found?.span.name).toBe('root')
    })

    it('should work with just an object containing id', () => {
      const result = traceManager.createAndProcessSpan({
        type: 'mark',
        name: 'target-span',
        relatedTo: { ticketId: '123' },
      })

      // Use just an object with id instead of full span
      const found = traceManager.findSpanInParentHierarchy(
        { id: result.span.id },
        { name: 'target-span' },
      )

      expect(found).toBeDefined()
      expect(found?.span.id).toBe(result.span.id)
    })

    it('should return undefined when no match is found in hierarchy', () => {
      const parentResult = traceManager.createAndProcessSpan({
        type: 'mark',
        name: 'parent',
        relatedTo: { ticketId: '123' },
      })

      const childResult = traceManager.createAndProcessSpan({
        type: 'mark',
        name: 'child',
        relatedTo: { ticketId: '123' },
        parentSpan: parentResult.span,
      })

      // Search for non-existent span name
      const found = traceManager.findSpanInParentHierarchy(childResult.span, {
        name: 'non-existent',
      })

      expect(found).toBeUndefined()
    })

    it('should return undefined when no current trace is available', () => {
      // Complete the trace first
      const endSpan = traceManager.ensureCompleteSpan({
        type: 'mark',
        name: 'end',
        relatedTo: { ticketId: '123' },
      })
      traceManager.processSpan(endSpan)

      // Now there's no current trace
      expect(traceManager.currentTraceContext).toBeUndefined()

      const found = traceManager.findSpanInParentHierarchy(
        { id: 'any-id' },
        { name: 'any-name' },
      )

      expect(found).toBeUndefined()
    })

    it('should return undefined when span is not found in recorded items', () => {
      const found = traceManager.findSpanInParentHierarchy(
        { id: 'non-existent-span-id' },
        { name: 'any-name' },
      )

      expect(found).toBeUndefined()
    })

    it('should work with complex matchers', () => {
      const parentResult = traceManager.createAndProcessSpan({
        type: 'measure',
        name: 'complex-parent',
        relatedTo: { ticketId: '123' },
        attributes: { category: 'performance', priority: 'high' },
      })

      const childResult = traceManager.createAndProcessSpan({
        type: 'mark',
        name: 'simple-child',
        relatedTo: { ticketId: '123' },
        parentSpan: parentResult.span,
        attributes: { category: 'ui' },
      })

      // Use complex matcher with multiple conditions
      const found = traceManager.findSpanInParentHierarchy(childResult.span, {
        type: 'measure',
        attributes: { category: 'performance', priority: 'high' },
      })

      expect(found).toBeDefined()
      expect(found?.span.id).toBe(parentResult.span.id)
      expect(found?.span.type).toBe('measure')
    })

    it('should work with function-based matchers', () => {
      const parentResult = traceManager.createAndProcessSpan({
        type: 'mark',
        name: 'dynamic-parent',
        relatedTo: { ticketId: '123' },
        attributes: { timestamp: Date.now() },
      })

      const childResult = traceManager.createAndProcessSpan({
        type: 'mark',
        name: 'child',
        relatedTo: { ticketId: '123' },
        parentSpan: parentResult.span,
      })

      // Use function matcher
      const found = traceManager.findSpanInParentHierarchy(
        childResult.span,
        ({ span }) => span.name.startsWith('dynamic-'),
      )

      expect(found).toBeDefined()
      expect(found?.span.id).toBe(parentResult.span.id)
      expect(found?.span.name).toBe('dynamic-parent')
    })

    it('should work with spans that have getParentSpanId function', () => {
      // Create parent first
      const parentResult = traceManager.createAndProcessSpan({
        type: 'mark',
        name: 'resolved-parent',
        relatedTo: { ticketId: '123' },
      })

      // Create child with getParentSpanId function instead of explicit parentSpanId
      const childResult = traceManager.createAndProcessSpan({
        type: 'mark',
        name: 'child-with-resolver',
        relatedTo: { ticketId: '123' },
        getParentSpan: () => parentResult.span,
      })

      const found = traceManager.findSpanInParentHierarchy(childResult.span, {
        name: 'resolved-parent',
      })

      expect(found).toBeDefined()
      expect(found?.span.id).toBe(parentResult.span.id)
    })

    it('should handle getParentSpanId that throws an error', () => {
      const childResult = traceManager.createAndProcessSpan({
        type: 'mark',
        name: 'problematic-child',
        relatedTo: { ticketId: '123' },
        getParentSpan: () => {
          throw new Error('Parent resolution failed')
        },
      })

      // Should handle the error gracefully and return undefined since no parent can be found
      const found = traceManager.findSpanInParentHierarchy(childResult.span, {
        name: 'any-parent',
      })

      expect(found).toBeUndefined()
    })

    it('should stop traversal when parent span is not found in recorded items', () => {
      const childResult = traceManager.createAndProcessSpan({
        type: 'mark',
        name: 'orphaned-child',
        relatedTo: { ticketId: '123' },
        parentSpan: undefined,
      })

      const found = traceManager.findSpanInParentHierarchy(childResult.span, {
        name: 'any-name',
      })

      // Should only check the child itself, then stop when parent is not found
      expect(found).toBeUndefined()
    })

    it('should work with component render spans', () => {
      const parentRenderResult = traceManager.createAndProcessSpan<
        ComponentRenderSpan<TicketIdRelationSchemasFixture>
      >({
        type: 'component-render',
        name: 'ParentComponent',
        relatedTo: { ticketId: '123' },
        isIdle: false,
        renderCount: 1,
        renderedOutput: 'content',
      })

      const childRenderResult = traceManager.createAndProcessSpan<
        ComponentRenderSpan<TicketIdRelationSchemasFixture>
      >({
        type: 'component-render',
        name: 'ChildComponent',
        relatedTo: { ticketId: '123' },
        parentSpan: parentRenderResult.span,
        isIdle: false,
        renderCount: 2,
        renderedOutput: 'loading',
      })

      const found = traceManager.findSpanInParentHierarchy(
        childRenderResult.span,
        { name: 'ParentComponent' },
      )

      expect(found).toBeDefined()
      expect(found?.span.id).toBe(parentRenderResult.span.id)
      expect(
        (found?.span as ComponentRenderSpan<TicketIdRelationSchemasFixture>)
          .renderCount,
      ).toBe(1)
    })

    it('should work with error spans', () => {
      const contextResult = traceManager.createAndProcessSpan({
        type: 'mark',
        name: 'context-span',
        relatedTo: { ticketId: '123' },
        attributes: { context: 'error-handling' },
      })

      const error = new Error('Test error')
      const errorResult = traceManager.processErrorSpan({
        error,
        relatedTo: { ticketId: '123' },
        parentSpan: contextResult.span,
      })

      const found = traceManager.findSpanInParentHierarchy(errorResult.span, {
        attributes: { context: 'error-handling' },
      })

      expect(found).toBeDefined()
      expect(found?.span.id).toBe(contextResult.span.id)
    })
  })
})
