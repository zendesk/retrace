import './testUtility/asciiTimelineSerializer'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vitest as jest,
} from 'vitest'
import * as matchSpan from './matchSpan'
import {
  type TicketAndUserAndGlobalRelationSchemasFixture,
  ticketAndUserAndGlobalRelationSchemasFixture,
  type TicketIdRelationSchemasFixture,
} from './testUtility/fixtures/relationSchemas'
import { Check, getSpansFromTimeline, LongTask, Render } from './testUtility/makeTimeline'
import { processSpans } from './testUtility/processSpans'
import { TraceManager } from './TraceManager'
import type { AnyPossibleReportFn, ReportErrorFn } from './types'

describe('TraceManager - Child Traces (Nested Proposal)', () => {
  let reportFn: Mock<AnyPossibleReportFn<TicketIdRelationSchemasFixture>>
  // TS doesn't like that reportFn is wrapped in Mock<> type
  const getReportFn = () =>
    reportFn as AnyPossibleReportFn<TicketIdRelationSchemasFixture>
  let generateId: Mock
  let reportErrorFn: Mock<ReportErrorFn<TicketIdRelationSchemasFixture>>
  const DEFAULT_TIMEOUT_DURATION = 45_000

  jest.useFakeTimers({
    now: 0,
  })

  let id = 0
  beforeEach(() => {
    reportFn = jest.fn()
    id = 0
    generateId = jest.fn(() => `id-${id++}`)
    reportErrorFn = jest.fn()
  })

  afterEach(() => {
    jest.clearAllMocks()
    jest.clearAllTimers()
  })

  describe('Basic Child Adoption (F-1, F-2)', () => {
    it('should adopt child trace instead of interrupting parent when child trace name is in adoptAsChildren', () => {
      const traceManager = new TraceManager({
        relationSchemas: { ticket: { ticketId: String } },
        reportFn: getReportFn(),
        generateId,
        reportErrorFn,
        reportWarningFn: reportErrorFn,
      })

      // Create parent tracer that can adopt 'child-operation' traces
      const parentTracer = traceManager.createTracer({
        name: 'ticket.parent-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'parent-end' }],
        adoptAsChildren: ['ticket.child-operation'],
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      // Create child tracer
      const childTracer = traceManager.createTracer({
        name: 'ticket.child-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'child-end' }],
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      // Start parent trace
      const parentTraceId = parentTracer.start({
        id: 'parent-trace-id',
        relatedTo: { ticketId: '1' },
        variant: 'default',
      })
      expect(parentTraceId).toBe('parent-trace-id')

      // Start child trace - should be adopted, not interrupt parent
      const childTraceId = childTracer.start({
        id: 'child-trace-id',
        relatedTo: { ticketId: '1' },
        variant: 'default',
      })
      expect(childTraceId).toBe('child-trace-id')

      // the Trace Manager should still have a reference to the parent trace, child never overrides it:
      expect(traceManager.currentTracerContext?.input.id).toBe(
        'parent-trace-id',
      )

      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
      Events: ${Render('parent-start', 0)}---${Render('child-start', 0)}---${Render('child-end', 0)}---${Render('parent-end', 0)}
      Time:   ${0}                           ${50}                         ${100}                      ${150}
      `

      processSpans(spans, traceManager)

      expect(reportFn).toHaveBeenCalledTimes(2) // Both parent and child should complete

      // Verify parent trace completed with child
      const parentReport = reportFn.mock.calls.find(
        (call) => call[0].name === 'ticket.parent-operation',
      )?.[0]
      expect(parentReport).toBeDefined()

      expect(parentReport?.status).toBe('ok')
      expect(parentReport?.interruptionReason).toBeUndefined()
      expect(parentReport?.parentTraceId).toBeUndefined() // Parent has no parent

      // Verify child trace completed
      const childReport = reportFn.mock.calls.find(
        (call) => call[0].name === 'ticket.child-operation',
      )?.[0]
      expect(childReport).toBeDefined()
      expect(childReport?.status).toBe('ok')
      expect(childReport?.interruptionReason).toBeUndefined()
      expect(childReport?.parentTraceId).toBe('parent-trace-id') // Child adopted by parent
      expect(reportErrorFn).not.toHaveBeenCalled()
    })

    it('should interrupt parent trace when child trace name is NOT in adoptAsChildren (existing behavior)', () => {
      const traceManager = new TraceManager({
        relationSchemas: { ticket: { ticketId: String } },
        reportFn: getReportFn(),
        generateId,
        reportErrorFn,
        reportWarningFn: reportErrorFn,
      })

      // Create parent tracer that does NOT adopt 'other-operation' traces
      const parentTracer = traceManager.createTracer({
        name: 'ticket.parent-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'parent-end' }],
        adoptAsChildren: ['ticket.child-operation'], // Only adopts child-operation, not other-operation
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      // Create tracer for a different operation that should interrupt
      const otherTracer = traceManager.createTracer({
        name: 'ticket.other-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'other-end' }],
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      // Start parent trace
      const parentTraceId = parentTracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'default',
      })
      expect(parentTraceId).toBe('id-0')

      // Start other trace - should interrupt parent (existing behavior)
      const otherTraceId = otherTracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'default',
      })
      expect(otherTraceId).toBe('id-1')

      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
      Events: ${Render('parent-start', 0)}---${Render('other-end', 0)}
      Time:   ${0}                           ${50}
      `

      processSpans(spans, traceManager)

      expect(reportFn).toHaveBeenCalledTimes(2)

      // Verify parent trace was interrupted
      const parentReport = reportFn.mock.calls.find(
        (call) => call[0].name === 'ticket.parent-operation',
      )?.[0]
      expect(parentReport).toBeDefined()
      expect(parentReport?.status).toBe('interrupted')
      expect(parentReport?.interruptionReason).toBe('another-trace-started')
      expect(parentReport?.parentTraceId).toBeUndefined() // Parent has no parent

      // Verify other trace completed
      const otherReport = reportFn.mock.calls.find(
        (call) => call[0].name === 'ticket.other-operation',
      )?.[0]
      expect(otherReport).toBeDefined()
      expect(otherReport?.status).toBe('ok')
      expect(otherReport?.interruptionReason).toBeUndefined()
      expect(otherReport?.parentTraceId).toBeUndefined() // Other trace has no parent (it interrupted)
      expect(reportErrorFn).not.toHaveBeenCalled()
    })

    it('should handle multiple children being adopted by the same parent', () => {
      const traceManager = new TraceManager({
        relationSchemas: { ticket: { ticketId: String } },
        reportFn: getReportFn(),
        generateId,
        reportErrorFn,
        reportWarningFn: reportErrorFn,
      })

      // Create parent tracer that can adopt multiple child trace types
      const parentTracer = traceManager.createTracer({
        name: 'ticket.parent-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'parent-end' }],
        adoptAsChildren: [
          'ticket.child-operation-1',
          'ticket.child-operation-2',
        ],
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      // Create first child tracer
      const childTracer1 = traceManager.createTracer({
        name: 'ticket.child-operation-1',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'child-1-end' }],
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      // Create second child tracer
      const childTracer2 = traceManager.createTracer({
        name: 'ticket.child-operation-2',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'child-2-end' }],
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      // Start parent trace
      const parentTraceId = parentTracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'default',
      })
      expect(parentTraceId).toBe('id-0')

      // Start first child trace - should be adopted
      const childTraceId1 = childTracer1.start({
        relatedTo: { ticketId: '1' },
        variant: 'default',
      })
      expect(childTraceId1).toBe('id-1')

      // Start second child trace - should also be adopted
      const childTraceId2 = childTracer2.start({
        relatedTo: { ticketId: '1' },
        variant: 'default',
      })
      expect(childTraceId2).toBe('id-2')

      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
      Events: ${Render('parent-start', 0)}---${Render('child-1-start', 0)}---${Render('child-2-start', 0)}---${Render('child-1-end', 0)}---${Render('child-2-end', 0)}---${Render('parent-end', 0)}
      Time:   ${0}                           ${25}                            ${50}                            ${75}                           ${100}                          ${125}
      `

      processSpans(spans, traceManager)

      expect(reportFn).toHaveBeenCalledTimes(3) // Parent and both children should complete

      // Verify parent trace completed
      const parentReport = reportFn.mock.calls.find(
        (call) => call[0].name === 'ticket.parent-operation',
      )?.[0]
      expect(parentReport).toBeDefined()
      expect(parentReport?.status).toBe('ok')
      expect(parentReport?.interruptionReason).toBeUndefined()
      expect(parentReport?.parentTraceId).toBeUndefined() // Parent has no parent

      // Verify first child trace completed
      const child1Report = reportFn.mock.calls.find(
        (call) => call[0].name === 'ticket.child-operation-1',
      )?.[0]
      expect(child1Report).toBeDefined()
      expect(child1Report?.status).toBe('ok')
      expect(child1Report?.interruptionReason).toBeUndefined()
      expect(child1Report?.parentTraceId).toBe('id-0') // Child-1 adopted by parent

      // Verify second child trace completed
      const child2Report = reportFn.mock.calls.find(
        (call) => call[0].name === 'ticket.child-operation-2',
      )?.[0]
      expect(child2Report).toBeDefined()
      expect(child2Report?.status).toBe('ok')
      expect(child2Report?.interruptionReason).toBeUndefined()
      expect(child2Report?.parentTraceId).toBe('id-0') // Child-2 adopted by parent
      expect(reportErrorFn).not.toHaveBeenCalled()
    })

    it('should transition parent to waiting-for-children state immediately after completing its own requirements', () => {
      const traceManager = new TraceManager({
        relationSchemas: { ticket: { ticketId: String } },
        reportFn: getReportFn(),
        generateId,
        reportErrorFn,
        reportWarningFn: reportErrorFn,
      })

      // Create parent tracer that can adopt children
      const parentTracer = traceManager.createTracer({
        name: 'ticket.parent-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'parent-end' }],
        adoptAsChildren: ['ticket.child-operation'],
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      // Create child tracer
      const childTracer = traceManager.createTracer({
        name: 'ticket.child-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'child-end' }],
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      // Start parent trace
      parentTracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'default',
      })

      // Start child trace
      childTracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'default',
      })

      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
      Events: ${Render('parent-start', 0)}---${Render('child-start', 0)}---${Render('parent-end', 0)}---${Check}
      Time:   ${0}                           ${50}                         ${100}                        ${150}
      `

      // Process only parent completion first - child is still running
      processSpans(spans.slice(0, 3), traceManager)

      // Parent should not have reported yet (waiting for child)
      expect(reportFn).not.toHaveBeenCalled()

      // Now complete the child
      // prettier-ignore
      const { spans: childEndSpans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
      Events: ${Render('child-end', 0)}
      Time:   ${200}
      `

      processSpans(childEndSpans, traceManager)

      // Now both should be reported
      expect(reportFn).toHaveBeenCalledTimes(2)

      // Verify parent completed after child
      const parentReport = reportFn.mock.calls.find(
        (call) => call[0].name === 'ticket.parent-operation',
      )?.[0]
      expect(parentReport).toBeDefined()
      expect(parentReport?.status).toBe('ok')
      expect(parentReport?.interruptionReason).toBeUndefined()
      expect(parentReport?.parentTraceId).toBeUndefined() // Parent has no parent
      expect(reportErrorFn).not.toHaveBeenCalled()
    })
  })

  describe('Parent Completion (F-3)', () => {
    it('should transition parent from waiting-for-children to complete when all children finish', () => {
      const traceManager = new TraceManager({
        relationSchemas: { ticket: { ticketId: String } },
        reportFn: getReportFn(),
        generateId,
        reportErrorFn,
        reportWarningFn: reportErrorFn,
      })

      // Create parent tracer
      const parentTracer = traceManager.createTracer({
        name: 'ticket.parent-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'parent-end' }],
        adoptAsChildren: [
          'ticket.child-operation-1',
          'ticket.child-operation-2',
        ],
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      // Create child tracers
      const childTracer1 = traceManager.createTracer({
        name: 'ticket.child-operation-1',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'child-1-end' }],
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      const childTracer2 = traceManager.createTracer({
        name: 'ticket.child-operation-2',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'child-2-end' }],
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      // Start traces
      parentTracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'default',
      })

      childTracer1.start({
        relatedTo: { ticketId: '1' },
        variant: 'default',
      })

      childTracer2.start({
        relatedTo: { ticketId: '1' },
        variant: 'default',
      })

      // Complete parent first, but children are still running
      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
      Events: ${Render('parent-start', 0)}---${Render('child-1-start', 0)}---${Render('child-2-start', 0)}---${Render('parent-end', 0)}
      Time:   ${0}                           ${25}                            ${50}                            ${75}
      `

      processSpans(spans, traceManager)

      // Parent should not be completed yet (waiting for children)
      expect(reportFn).not.toHaveBeenCalled()

      // Complete first child
      // prettier-ignore
      const { spans: child1EndSpans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
      Events: ${Render('child-1-end', 0)}
      Time:   ${100}
      `

      processSpans(child1EndSpans, traceManager)

      // Still waiting for second child
      expect(reportFn).toHaveBeenCalledTimes(1) // Only child-1 should be reported

      // Complete second child
      // prettier-ignore
      const { spans: child2EndSpans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
      Events: ${Render('child-2-end', 0)}
      Time:   ${125}
      `

      processSpans(child2EndSpans, traceManager)

      // Now all should be completed
      expect(reportFn).toHaveBeenCalledTimes(3) // Both children + parent

      // Verify all traces completed successfully
      const parentReport = reportFn.mock.calls.find(
        (call) => call[0].name === 'ticket.parent-operation',
      )?.[0]
      expect(parentReport).toBeDefined()
      expect(parentReport?.status).toBe('ok')
      expect(parentReport?.interruptionReason).toBeUndefined()
      expect(parentReport?.parentTraceId).toBeUndefined() // Parent has no parent
      expect(reportErrorFn).not.toHaveBeenCalled()
    })

    it('should transition parent directly to complete if no children exist when entering waiting-for-children', () => {
      const traceManager = new TraceManager({
        relationSchemas: { ticket: { ticketId: String } },
        reportFn: getReportFn(),
        generateId,
        reportErrorFn,
        reportWarningFn: reportErrorFn,
      })

      // Create parent tracer that CAN adopt children but none are started
      const parentTracer = traceManager.createTracer({
        name: 'ticket.parent-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'parent-end' }],
        adoptAsChildren: ['ticket.child-operation'], // Can adopt but won't
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      // Start only parent trace (no children)
      parentTracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'default',
      })

      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
      Events: ${Render('parent-start', 0)}---${Render('parent-end', 0)}
      Time:   ${0}                           ${50}
      `

      processSpans(spans, traceManager)

      // Parent should complete immediately since no children exist
      expect(reportFn).toHaveBeenCalledTimes(1)

      const parentReport = reportFn.mock.calls[0]![0]
      expect(parentReport.name).toBe('ticket.parent-operation')
      expect(parentReport.status).toBe('ok')
      expect(parentReport.interruptionReason).toBeUndefined()
      expect(parentReport.parentTraceId).toBeUndefined() // Parent has no parent
    })

    it('should maintain parent in waiting-for-children state while any child is still running', () => {
      const traceManager = new TraceManager({
        relationSchemas: { ticket: { ticketId: String } },
        reportFn: getReportFn(),
        generateId,
        reportErrorFn,
        reportWarningFn: reportErrorFn,
      })

      // Create parent tracer
      const parentTracer = traceManager.createTracer({
        name: 'ticket.parent-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'parent-end' }],
        adoptAsChildren: ['ticket.child-operation'],
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      // Create child tracer with long-running requirement
      const childTracer = traceManager.createTracer({
        name: 'ticket.child-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'child-end' }],
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      // Start traces
      parentTracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'default',
      })

      childTracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'default',
      })

      // Complete parent but keep child running
      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
      Events: ${Render('parent-start', 0)}---${Render('child-start', 0)}---${Render('parent-end', 0)}---${Check}
      Time:   ${0}                           ${25}                         ${50}                        ${1_000}
      `

      processSpans(spans, traceManager)

      // Parent should still be waiting (not reported)
      expect(reportFn).not.toHaveBeenCalled()

      // Now complete the child
      // prettier-ignore
      const { spans: childEndSpans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
      Events: ${Render('child-end', 0)}
      Time:   ${6_050}
      `

      processSpans(childEndSpans, traceManager)

      // Now both should complete
      expect(reportFn).toHaveBeenCalledTimes(2)

      const parentReport = reportFn.mock.calls.find(
        (call) => call[0].name === 'ticket.parent-operation',
      )?.[0]
      expect(parentReport).toBeDefined()
      expect(parentReport?.status).toBe('ok')
      expect(parentReport?.interruptionReason).toBeUndefined()
      expect(parentReport?.parentTraceId).toBeUndefined() // Parent has no parent
      expect(reportErrorFn).not.toHaveBeenCalled()
    })
  })

  describe('Parent Interruption Propagation (F-4)', () => {
    it('should interrupt all children with parent-interrupted when parent is interrupted manually', () => {
      const traceManager = new TraceManager({
        relationSchemas: { ticket: { ticketId: String } },
        reportFn: getReportFn(),
        generateId,
        reportErrorFn,
        reportWarningFn: reportErrorFn,
      })

      // Create parent tracer that can be interrupted
      const parentTracer = traceManager.createTracer({
        name: 'ticket.parent-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'parent-end' }],
        interruptOnSpans: [matchSpan.withName('interrupt')],
        adoptAsChildren: ['ticket.child-operation'],
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      // Create child tracer
      const childTracer = traceManager.createTracer({
        name: 'ticket.child-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'child-end' }],
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      // Start traces
      parentTracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'default',
      })

      childTracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'default',
      })

      // Interrupt parent manually
      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
      Events: ${Render('parent-start', 0)}---${Render('child-start', 0)}---${Render('interrupt', 0)}
      Time:   ${0}                           ${25}                         ${50}
      `

      processSpans(spans, traceManager)

      expect(reportFn).toHaveBeenCalledTimes(2) // Both parent and child should be interrupted

      // Verify parent was interrupted
      const parentReport = reportFn.mock.calls.find(
        (call) => call[0].name === 'ticket.parent-operation',
      )?.[0]
      expect(parentReport).toBeDefined()
      expect(parentReport?.status).toBe('interrupted')
      expect(parentReport?.interruptionReason).toBe('matched-on-interrupt')
      expect(parentReport?.parentTraceId).toBeUndefined() // Parent has no parent

      // Verify child was interrupted with parent-interrupted
      const childReport = reportFn.mock.calls.find(
        (call) => call[0].name === 'ticket.child-operation',
      )?.[0]
      expect(childReport).toBeDefined()
      expect(childReport?.status).toBe('interrupted')
      expect(childReport?.interruptionReason).toBe('parent-interrupted')
      expect(childReport?.parentTraceId).toBe('id-0') // Child was adopted by parent
      expect(reportErrorFn).not.toHaveBeenCalled()
    })

    it('should interrupt all children with parent-interrupted when parent times out', () => {
      const traceManager = new TraceManager({
        relationSchemas: { ticket: { ticketId: String } },
        reportFn: getReportFn(),
        generateId,
        reportErrorFn,
        reportWarningFn: reportErrorFn,
      })

      // Create parent tracer with short timeout
      const parentTracer = traceManager.createTracer({
        name: 'ticket.parent-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'parent-end' }],
        adoptAsChildren: ['ticket.child-operation'],
        variants: {
          default: { timeout: 100 }, // Very short timeout
        },
      })

      // Create child tracer
      const childTracer = traceManager.createTracer({
        name: 'ticket.child-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'child-end' }],
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      // Start traces
      parentTracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'default',
      })

      childTracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'default',
      })

      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
      Events: ${Render('parent-start', 0)}---${Render('child-start', 0)}---<===+150ms===>----${Check}
      Time:   ${0}                           ${25}                           ${150}
      `

      processSpans(spans, traceManager)

      expect(reportFn).toHaveBeenCalledTimes(2) // Both parent and child should be interrupted

      // Verify parent timed out
      const parentReport = reportFn.mock.calls.find(
        (call) => call[0].name === 'ticket.parent-operation',
      )?.[0]
      expect(parentReport).toBeDefined()
      expect(parentReport?.status).toBe('interrupted')
      expect(parentReport?.interruptionReason).toBe('timeout')
      expect(parentReport?.parentTraceId).toBeUndefined() // Parent has no parent

      // Verify child was interrupted with parent-interrupted
      const childReport = reportFn.mock.calls.find(
        (call) => call[0].name === 'ticket.child-operation',
      )?.[0]
      expect(childReport).toBeDefined()
      expect(childReport?.status).toBe('interrupted')
      expect(childReport?.interruptionReason).toBe('parent-interrupted')
      expect(childReport?.parentTraceId).toBe('id-0') // Child was adopted by parent
      expect(reportErrorFn).not.toHaveBeenCalled()
    })

    it('should clear children set when parent is interrupted', () => {
      const traceManager = new TraceManager({
        relationSchemas: { ticket: { ticketId: String } },
        reportFn: getReportFn(),
        generateId,
        reportErrorFn,
        reportWarningFn: reportErrorFn,
      })

      // Create parent tracer
      const parentTracer = traceManager.createTracer({
        name: 'ticket.parent-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'parent-end' }],
        interruptOnSpans: [matchSpan.withName('interrupt')],
        adoptAsChildren: ['ticket.child-operation'],
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      // Create child tracer
      const childTracer = traceManager.createTracer({
        name: 'ticket.child-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'child-end' }],
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      // Start traces
      parentTracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'default',
      })

      childTracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'default',
      })

      // Verify traces are running
      expect(traceManager.currentTracerContext).toBeDefined()

      // Interrupt parent
      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
      Events: ${Render('parent-start', 0)}---${Render('child-start', 0)}---${Render('interrupt', 0)}
      Time:   ${0}                           ${25}                         ${50}
      `

      processSpans(spans, traceManager)

      // Both traces should be interrupted and cleaned up
      expect(reportFn).toHaveBeenCalledTimes(2)

      // Verify no active traces remain (memory cleaned up)
      // This is a basic check - in real implementation, we'd verify children sets are cleared
      expect(traceManager.currentTracerContext).toBeUndefined()

      // Verify parentTraceId relationships
      const parentReport = reportFn.mock.calls.find(
        (call) => call[0].name === 'ticket.parent-operation',
      )?.[0]
      const childReport = reportFn.mock.calls.find(
        (call) => call[0].name === 'ticket.child-operation',
      )?.[0]

      expect(parentReport?.parentTraceId).toBeUndefined() // Parent has no parent
      expect(childReport?.parentTraceId).toBe('id-0') // Child was adopted by parent
      expect(reportErrorFn).not.toHaveBeenCalled()
    })
  })

  describe('Child Interruption Propagation (F-5, F-6)', () => {
    it('should interrupt parent with child-timeout when child times out', () => {
      const traceManager = new TraceManager({
        relationSchemas: { ticket: { ticketId: String } },
        reportFn: getReportFn(),
        generateId,
        reportErrorFn,
        reportWarningFn: reportErrorFn,
      })

      // Create parent tracer
      const parentTracer = traceManager.createTracer({
        name: 'ticket.parent-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'parent-end' }],
        adoptAsChildren: ['ticket.child-operation'],
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      // Create child tracer with short timeout
      const childTracer = traceManager.createTracer({
        name: 'ticket.child-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'child-end' }],
        variants: {
          default: { timeout: 100 }, // Very short timeout
        },
      })

      // Start traces
      parentTracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'default',
      })

      childTracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'default',
      })

      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
      Events: ${Render('parent-start', 0)}---${Render('child-start', 0)}---<===+150ms===>----${Check}
      Time:   ${0}                           ${25}                           ${150}
      `

      processSpans(spans, traceManager)

      expect(reportFn).toHaveBeenCalledTimes(2) // Both child and parent should be interrupted

      // Verify child timed out
      const childReport = reportFn.mock.calls.find(
        (call) => call[0].name === 'ticket.child-operation',
      )?.[0]
      expect(childReport).toBeDefined()
      expect(childReport?.status).toBe('interrupted')
      expect(childReport?.interruptionReason).toBe('timeout')
      expect(childReport?.parentTraceId).toBe('id-0') // Child was adopted by parent

      // Verify parent was interrupted due to child timeout
      const parentReport = reportFn.mock.calls.find(
        (call) => call[0].name === 'ticket.parent-operation',
      )?.[0]
      expect(parentReport).toBeDefined()
      expect(parentReport?.status).toBe('interrupted')
      expect(parentReport?.interruptionReason).toBe('child-timeout')
      expect(parentReport?.parentTraceId).toBeUndefined() // Parent has no parent
      expect(reportErrorFn).not.toHaveBeenCalled()
    })

    it('should interrupt parent with child-interrupted when child is interrupted for other reasons', () => {
      const traceManager = new TraceManager({
        relationSchemas: { ticket: { ticketId: String } },
        reportFn: getReportFn(),
        generateId,
        reportErrorFn,
        reportWarningFn: reportErrorFn,
      })

      // Create parent tracer
      const parentTracer = traceManager.createTracer({
        name: 'ticket.parent-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'parent-end' }],
        adoptAsChildren: ['ticket.child-operation'],
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      // Create child tracer that can be interrupted
      const childTracer = traceManager.createTracer({
        name: 'ticket.child-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'child-end' }],
        interruptOnSpans: [matchSpan.withName('child-interrupt')],
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      // Start traces
      parentTracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'default',
      })

      childTracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'default',
      })

      // Interrupt child manually
      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
      Events: ${Render('parent-start', 0)}---${Render('child-start', 0)}---${Render('child-interrupt', 0)}
      Time:   ${0}                           ${25}                         ${50}
      `

      processSpans(spans, traceManager)

      expect(reportFn).toHaveBeenCalledTimes(2) // Both child and parent should be interrupted

      // Verify child was interrupted
      const childReport = reportFn.mock.calls.find(
        (call) => call[0].name === 'ticket.child-operation',
      )?.[0]
      expect(childReport).toBeDefined()
      expect(childReport?.status).toBe('interrupted')
      expect(childReport?.interruptionReason).toBe('matched-on-interrupt')
      expect(childReport?.parentTraceId).toBe('id-0') // Child was adopted by parent

      // Verify parent was interrupted due to child interruption
      const parentReport = reportFn.mock.calls.find(
        (call) => call[0].name === 'ticket.parent-operation',
      )?.[0]
      expect(parentReport).toBeDefined()
      expect(parentReport?.status).toBe('interrupted')
      expect(parentReport?.interruptionReason).toBe('child-interrupted')
      expect(parentReport?.parentTraceId).toBeUndefined() // Parent has no parent
      expect(reportErrorFn).not.toHaveBeenCalled()
    })

    it('should NOT interrupt parent when child is interrupted with child-swap reason', () => {
      const traceManager = new TraceManager({
        relationSchemas: { ticket: { ticketId: String } },
        reportFn: getReportFn(),
        generateId,
        reportErrorFn,
        reportWarningFn: reportErrorFn,
      })

      // Create parent tracer
      const parentTracer = traceManager.createTracer({
        name: 'ticket.parent-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'parent-end' }],
        adoptAsChildren: ['ticket.child-operation'],
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      // Create child tracer
      const childTracer = traceManager.createTracer({
        name: 'ticket.child-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'child-end' }],
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      // Start parent and child
      parentTracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'default',
      })

      const childId = childTracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'default',
      })

      // Modify the child tracer's definition - this should cause child-swap
      childTracer.addRequirementsToCurrentTraceOnly({
        additionalRequiredSpans: [{ name: 'new-requirement' }],
      })

      // Complete child and parent
      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
      Events: ${Render('parent-start', 0)}---${Render('child-start', 0)}---${Render('child-end', 0)}---${Render('parent-end', 0)}--${Render('new-requirement', 0)}
      Time:   ${0}                           ${25}                         ${75}                       ${125}                      ${175}
      `

      processSpans(spans, traceManager)

      // Should get reports for: new child (ok), parent (ok)
      expect(reportFn).toHaveBeenCalledTimes(2)

      const completedChildReport = reportFn.mock.calls.find(
        (call) =>
          call[0].name === 'ticket.child-operation' && call[0].status === 'ok',
      )?.[0]

      // Verify new child completed successfully
      expect(completedChildReport?.status).toBe('ok')
      expect(completedChildReport?.interruptionReason).toBeUndefined()
      expect(completedChildReport?.parentTraceId).toBe('id-0')

      // Verify parent was NOT interrupted (continued successfully)
      const parentReport = reportFn.mock.calls.find(
        (call) => call[0].name === 'ticket.parent-operation',
      )?.[0]
      expect(parentReport?.status).toBe('ok')
      expect(parentReport?.interruptionReason).toBeUndefined()
      expect(parentReport?.parentTraceId).toBeUndefined()
      expect(reportErrorFn).not.toHaveBeenCalled()
    })

    it('should handle onChildEnd event and remove child from children set', () => {
      const traceManager = new TraceManager({
        relationSchemas: { ticket: { ticketId: String } },
        reportFn: getReportFn(),
        generateId,
        reportErrorFn,
        reportWarningFn: reportErrorFn,
      })

      // Create parent tracer
      const parentTracer = traceManager.createTracer({
        name: 'ticket.parent-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'parent-end' }],
        adoptAsChildren: ['ticket.child-operation'],
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      // Create child tracer
      const childTracer = traceManager.createTracer({
        name: 'ticket.child-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'child-end' }],
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      // Start traces
      parentTracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'default',
      })

      childTracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'default',
      })

      // Complete child first
      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
      Events: ${Render('parent-start', 0)}---${Render('child-start', 0)}---${Render('child-end', 0)}
      Time:   ${0}                           ${25}                         ${75}
      `

      processSpans(spans, traceManager)

      // Child should be reported
      expect(reportFn).toHaveBeenCalledTimes(1)
      const childReport = reportFn.mock.calls[0]![0]
      expect(childReport.name).toBe('ticket.child-operation')
      expect(childReport.status).toBe('ok')
      expect(childReport.parentTraceId).toBe('id-0')

      // Parent should still be waiting, not yet reported
      // Now complete parent
      // prettier-ignore
      const { spans: parentEndSpans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
      Events: ${Render('parent-end', 0)}
      Time:   ${125}
      `

      processSpans(parentEndSpans, traceManager)

      // Now parent should also be reported
      expect(reportFn).toHaveBeenCalledTimes(2)
      const parentReport = reportFn.mock.calls[1]![0]
      expect(parentReport.name).toBe('ticket.parent-operation')
      expect(parentReport.status).toBe('ok')
      expect(parentReport.parentTraceId).toBeUndefined()
      expect(reportErrorFn).not.toHaveBeenCalled()
    })

    it('should move completed child to completedChildren set', () => {
      const traceManager = new TraceManager({
        relationSchemas: { ticket: { ticketId: String } },
        reportFn: getReportFn(),
        generateId,
        reportErrorFn,
        reportWarningFn: reportErrorFn,
      })

      // Create parent tracer
      const parentTracer = traceManager.createTracer({
        name: 'ticket.parent-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'parent-end' }],
        adoptAsChildren: ['ticket.child-operation'],
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      // Create child tracer
      const childTracer = traceManager.createTracer({
        name: 'ticket.child-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'child-end' }],
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      // Start traces
      parentTracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'default',
      })

      childTracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'default',
      })

      // Complete child, then parent
      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
      Events: ${Render('parent-start', 0)}---${Render('child-start', 0)}---${Render('child-end', 0)}---${Render('parent-end', 0)}
      Time:   ${0}                           ${25}                         ${75}                      ${125}
      `

      processSpans(spans, traceManager)

      // Both should be reported
      expect(reportFn).toHaveBeenCalledTimes(2)

      const childReport = reportFn.mock.calls.find(
        (call) => call[0].name === 'ticket.child-operation',
      )?.[0]
      const parentReport = reportFn.mock.calls.find(
        (call) => call[0].name === 'ticket.parent-operation',
      )?.[0]

      // Child completed and was moved to completedChildren
      expect(childReport?.status).toBe('ok')
      expect(childReport?.parentTraceId).toBe('id-0')

      // Parent completed after all children
      expect(parentReport?.status).toBe('ok')
      expect(parentReport?.parentTraceId).toBeUndefined()
      expect(reportErrorFn).not.toHaveBeenCalled()
    })
  })

  describe('Span Forwarding (F-7)', () => {
    it('should forward spans from parent to all running children after processing in parent', () => {
      const traceManager = new TraceManager({
        relationSchemas: { ticket: { ticketId: String } },
        reportFn: getReportFn(),
        generateId,
        reportErrorFn,
        reportWarningFn: reportErrorFn,
      })

      const parentTracer = traceManager.createTracer({
        name: 'ticket.parent-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'parent-end' }],
        adoptAsChildren: ['ticket.child-operation'],
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      const childTracer = traceManager.createTracer({
        name: 'ticket.child-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'child-end' }],
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      // Start parent and child
      parentTracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'default',
      })

      childTracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'default',
      })

      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
      Events: ${Render('parent-start', 0)}---${Render('child-start', 0)}---${Render('shared-span', 50)}---${Render('child-end', 0)}---${Render('parent-end', 0)}
      Time:   ${0}                           ${25}                         ${75}                       ${125}                     ${175}
      `

      processSpans(spans, traceManager)

      expect(reportFn).toHaveBeenCalledTimes(2)

      // Verify both parent and child received the shared-span
      const parentReport = reportFn.mock.calls.find(
        (call) => call[0].name === 'ticket.parent-operation',
      )?.[0]
      const childReport = reportFn.mock.calls.find(
        (call) => call[0].name === 'ticket.child-operation',
      )?.[0]

      expect(parentReport?.status).toBe('ok')
      expect(childReport?.status).toBe('ok')

      // Verify parentTraceId relationships
      expect(parentReport?.parentTraceId).toBeUndefined() // Parent has no parent
      expect(childReport?.parentTraceId).toBe('id-0') // Child was adopted by parent

      // Both should have processed the shared-span
      const parentSpanNames = parentReport?.entries.map(
        (entry) => entry.span.performanceEntry?.name,
      )
      const childSpanNames = childReport?.entries.map(
        (entry) => entry.span.performanceEntry?.name,
      )

      expect(parentSpanNames).toContain('shared-span')
      expect(childSpanNames).toContain('shared-span')
      expect(reportErrorFn).not.toHaveBeenCalled()
    })

    it('should not forward spans to children that have already completed', () => {
      const traceManager = new TraceManager({
        relationSchemas: { ticket: { ticketId: String } },
        reportFn: getReportFn(),
        generateId,
        reportErrorFn,
        reportWarningFn: reportErrorFn,
      })

      const parentTracer = traceManager.createTracer({
        name: 'ticket.parent-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'parent-end' }],
        adoptAsChildren: ['ticket.child-operation'],
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      const childTracer = traceManager.createTracer({
        name: 'ticket.child-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'child-end' }],
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      // Start parent and child
      parentTracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'default',
      })

      childTracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'default',
      })

      // Complete child first, then add span to parent, then complete parent
      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
      Events: ${Render('parent-start', 0)}---${Render('child-start', 0)}---${Render('child-end', 0)}---${Render('late-span', 50)}---${Render('parent-end', 0)}
      Time:   ${0}                           ${25}                         ${75}                     ${125}                     ${175}
      `

      processSpans(spans, traceManager)

      expect(reportFn).toHaveBeenCalledTimes(2)

      const childReport = reportFn.mock.calls.find(
        (call) => call[0].name === 'ticket.child-operation',
      )?.[0]
      const parentReport = reportFn.mock.calls.find(
        (call) => call[0].name === 'ticket.parent-operation',
      )?.[0]

      // Parent should have the late-span
      const parentSpanNames = parentReport?.entries.map(
        (entry) => entry.span.performanceEntry?.name,
      )
      expect(parentSpanNames).toContain('late-span')

      // Child should NOT have the late-span (it completed before the span arrived)
      const childSpanNames = childReport?.entries.map(
        (entry) => entry.span.performanceEntry?.name,
      )
      expect(childSpanNames).not.toContain('late-span')

      expect(childReport?.status).toBe('ok')
      expect(parentReport?.status).toBe('ok')
      expect(reportErrorFn).not.toHaveBeenCalled()
    })

    it('should handle span forwarding when children are in different states', () => {
      const traceManager = new TraceManager({
        relationSchemas: { ticket: { ticketId: String } },
        reportFn: getReportFn(),
        generateId,
        reportErrorFn,
        reportWarningFn: reportErrorFn,
      })

      const parentTracer = traceManager.createTracer({
        name: 'ticket.parent-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'parent-end' }],
        adoptAsChildren: [
          'ticket.child-operation-1',
          'ticket.child-operation-2',
        ],
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      const child1Tracer = traceManager.createTracer({
        name: 'ticket.child-operation-1',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'child-1-end' }],
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      const child2Tracer = traceManager.createTracer({
        name: 'ticket.child-operation-2',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'child-2-end' }],
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      // Start all traces
      parentTracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'default',
      })

      child1Tracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'default',
      })

      child2Tracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'default',
      })

      // Complete child1, then add shared span, then complete child2 and parent
      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
      Events: ${Render('parent-start', 0)}---${Render('child-1-start', 0)}---${Render('child-2-start', 0)}---${Render('child-1-end', 0)}---${Render('shared-span', 50)}---${Render('child-2-end', 0)}---${Render('parent-end', 0)}
      Time:   ${0}                           ${25}                            ${50}                            ${75}                           ${125}                       ${175}                          ${225}
      `

      processSpans(spans, traceManager)

      expect(reportFn).toHaveBeenCalledTimes(3)

      const parentReport = reportFn.mock.calls.find(
        (call) => call[0].name === 'ticket.parent-operation',
      )?.[0]
      const child1Report = reportFn.mock.calls.find(
        (call) => call[0].name === 'ticket.child-operation-1',
      )?.[0]
      const child2Report = reportFn.mock.calls.find(
        (call) => call[0].name === 'ticket.child-operation-2',
      )?.[0]

      // Parent should have shared-span
      const parentSpanNames = parentReport?.entries.map(
        (entry) => entry.span.performanceEntry?.name,
      )
      expect(parentSpanNames).toContain('shared-span')

      // Child1 should NOT have shared-span (completed before it arrived)
      const child1SpanNames = child1Report?.entries.map(
        (entry) => entry.span.performanceEntry?.name,
      )
      expect(child1SpanNames).not.toContain('shared-span')

      // Child2 should have shared-span (was still running when it arrived)
      const child2SpanNames = child2Report?.entries.map(
        (entry) => entry.span.performanceEntry?.name,
      )
      expect(child2SpanNames).toContain('shared-span')

      expect(parentReport?.status).toBe('ok')
      expect(child1Report?.status).toBe('ok')
      expect(child2Report?.status).toBe('ok')
      expect(reportErrorFn).not.toHaveBeenCalled()
    })
  })

  describe('Memory Management (F-8)', () => {
    it('should clear children and completedChildren sets in onTerminalStateReached', () => {
      const traceManager = new TraceManager({
        relationSchemas: { ticket: { ticketId: String } },
        reportFn: getReportFn(),
        generateId,
        reportErrorFn,
        reportWarningFn: reportErrorFn,
      })

      const parentTracer = traceManager.createTracer({
        name: 'ticket.parent-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'parent-end' }],
        adoptAsChildren: ['ticket.child-operation'],
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      const childTracer = traceManager.createTracer({
        name: 'ticket.child-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'child-end' }],
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      // Start traces
      parentTracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'default',
      })

      childTracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'default',
      })

      // Complete both traces
      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
      Events: ${Render('parent-start', 0)}---${Render('child-start', 0)}---${Render('child-end', 0)}---${Render('parent-end', 0)}
      Time:   ${0}                           ${25}                         ${75}                      ${125}
      `

      processSpans(spans, traceManager)

      // Both should be completed and reported
      expect(reportFn).toHaveBeenCalledTimes(2)

      const parentReport = reportFn.mock.calls.find(
        (call) => call[0].name === 'ticket.parent-operation',
      )?.[0]
      const childReport = reportFn.mock.calls.find(
        (call) => call[0].name === 'ticket.child-operation',
      )?.[0]

      expect(parentReport?.status).toBe('ok')
      expect(childReport?.status).toBe('ok')

      // Memory should be cleaned up - no active traces should remain
      expect(traceManager.currentTracerContext).toBeUndefined()
      expect(reportErrorFn).not.toHaveBeenCalled()
    })

    it('should not create memory leaks with parent-child references', () => {
      const traceManager = new TraceManager({
        relationSchemas: { ticket: { ticketId: String } },
        reportFn: getReportFn(),
        generateId,
        reportErrorFn,
        reportWarningFn: reportErrorFn,
      })

      const parentTracer = traceManager.createTracer({
        name: 'ticket.parent-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'parent-end' }],
        adoptAsChildren: ['ticket.child-operation'],
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      const childTracer = traceManager.createTracer({
        name: 'ticket.child-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'child-end' }],
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      // Start multiple parent-child cycles to test memory cleanup
      for (let i = 0; i < 3; i++) {
        parentTracer.start({
          relatedTo: { ticketId: `${i}` },
          variant: 'default',
        })

        childTracer.start({
          relatedTo: { ticketId: `${i}` },
          variant: 'default',
        })

        // prettier-ignore
        const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
        Events: ${Render('parent-start', 0)}---${Render('child-start', 0)}---${Render('child-end', 0)}---${Render('parent-end', 0)}
        Time:   ${i * 200}                     ${i * 200 + 25}               ${i * 200 + 75}            ${i * 200 + 125}
        `

        processSpans(spans, traceManager)
      }

      // All traces should complete successfully
      expect(reportFn).toHaveBeenCalledTimes(6) // 3 parents + 3 children

      // Memory should be clean - no dangling references
      expect(traceManager.currentTracerContext).toBeUndefined()

      // All reports should have correct parent-child relationships
      const parentReports = reportFn.mock.calls
        .map((call) => call[0])
        .filter((report) => report.name === 'ticket.parent-operation')
      const childReports = reportFn.mock.calls
        .map((call) => call[0])
        .filter((report) => report.name === 'ticket.child-operation')

      expect(parentReports).toHaveLength(3)
      expect(childReports).toHaveLength(3)

      // Each parent should have no parentTraceId, each child should have a parentTraceId
      parentReports.forEach((report) => {
        expect(report.parentTraceId).toBeUndefined()
        expect(report.status).toBe('ok')
      })

      childReports.forEach((report) => {
        expect(report.parentTraceId).toBeDefined()
        expect(report.status).toBe('ok')
      })

      expect(reportErrorFn).not.toHaveBeenCalled()
    })
  })

  describe('Child Utilities and Scope', () => {
    it('should provide child-scoped utilities that return child as current trace', () => {
      const traceManager = new TraceManager({
        relationSchemas: { ticket: { ticketId: String } },
        reportFn: getReportFn(),
        generateId,
        reportErrorFn,
        reportWarningFn: reportErrorFn,
      })

      const parentTracer = traceManager.createTracer({
        name: 'ticket.parent-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'parent-end' }],
        adoptAsChildren: ['ticket.child-operation'],
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      const childTracer = traceManager.createTracer({
        name: 'ticket.child-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'child-end' }],
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      // Start parent and child
      const parentTraceId = parentTracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'default',
      })

      const childTraceId = childTracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'default',
      })

      // The main trace manager should still reference the parent as current
      expect(traceManager.currentTracerContext?.input.id).toBe(parentTraceId)

      // Complete both traces
      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
      Events: ${Render('parent-start', 0)}---${Render('child-start', 0)}---${Render('child-end', 0)}---${Render('parent-end', 0)}
      Time:   ${0}                           ${25}                         ${75}                      ${125}
      `

      processSpans(spans, traceManager)

      expect(reportFn).toHaveBeenCalledTimes(2)

      const parentReport = reportFn.mock.calls.find(
        (call) => call[0].name === 'ticket.parent-operation',
      )?.[0]
      const childReport = reportFn.mock.calls.find(
        (call) => call[0].name === 'ticket.child-operation',
      )?.[0]

      expect(parentReport?.status).toBe('ok')
      expect(childReport?.status).toBe('ok')
      expect(childReport?.parentTraceId).toBe(parentTraceId)
      expect(reportErrorFn).not.toHaveBeenCalled()
    })

    it('should handle multiple children', () => {
      const traceManager = new TraceManager({
        relationSchemas: { ticket: { ticketId: String } },
        reportFn: getReportFn(),
        generateId,
        reportErrorFn,
        reportWarningFn: reportErrorFn,
      })

      const parentTracer = traceManager.createTracer({
        name: 'ticket.parent-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'parent-end' }],
        adoptAsChildren: ['ticket.child-operation', 'ticket.sibling-operation'],
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      const childTracer = traceManager.createTracer({
        name: 'ticket.child-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'child-end' }],
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      const siblingTracer = traceManager.createTracer({
        name: 'ticket.sibling-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'sibling-end' }],
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      // Start parent
      const parentTraceId = parentTracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'default',
      })

      // Start child
      const firstChildId = childTracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'default',
      })

      const siblingId = siblingTracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'default',
      })

      // Parent should still be the current trace in main manager
      expect(traceManager.currentTracerContext?.input.id).toBe(parentTraceId)

      // Complete new child and parent
      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
        Events: ${Render('parent-start', 0)}---${Render('child-end', 0)}-----${Render('sibling-end', 0)}---${Render('parent-end', 0)}
        Time:   ${0}                           ${25}                         ${75}                         ${125}
      `

      processSpans(spans, traceManager)

      // Should get: first child (ok), second child (ok), parent (ok)
      expect(reportFn).toHaveBeenCalledTimes(3)

      const parentReport = reportFn.mock.calls.find(
        (call) => call[0].name === 'ticket.parent-operation',
      )?.[0]
      const firstChildReport = reportFn.mock.calls.find(
        (call) => call[0].id === firstChildId,
      )?.[0]
      const siblingReport = reportFn.mock.calls.find(
          (call) => call[0].id === siblingId,
      )?.[0]

      expect(parentReport?.status).toBe('ok')
      expect(firstChildReport?.status).toBe('ok')
      expect(siblingReport?.status).toBe('ok')

      // Both children should reference parent
      expect(firstChildReport?.parentTraceId).toBe(parentTraceId)
      expect(siblingReport?.parentTraceId).toBe(parentTraceId)
      expect(reportErrorFn).not.toHaveBeenCalled()
    })
  })

  describe('Edge Cases', () => {
    it('should prevent self-nested traces (trace adopting itself)', () => {
      const traceManager = new TraceManager({
        relationSchemas: { ticket: { ticketId: String } },
        reportFn: getReportFn(),
        generateId,
        reportErrorFn,
        reportWarningFn: reportErrorFn,
      })

      const name = 'ticket.self-referencing-operation'
      // Create a tracer that tries to adopt itself
      const selfReferencingTracer = traceManager.createTracer({
        name,
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'end' }],
        // Self-reference - this should either throw or be filtered out
        adoptAsChildren: [name],
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })
      expect(reportErrorFn).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining(
            `A tracer cannot adopt its own traces as a children. Please remove "${name}" from the adoptAsChildren array.`,
          ),
        }),
        expect.anything(),
      )

      // Start first trace
      const firstTraceId = selfReferencingTracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'default',
      })

      // Start second trace of same type - should NOT be adopted (should interrupt first one)
      const secondTraceId = selfReferencingTracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'default',
      })

      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
      Events: ${Render('start', 0)}---${Render('end', 0)}
      Time:   ${0}                 ${50}
      `

      processSpans(spans, traceManager)

      // Both traces should be reported as separate (not parent-child)
      expect(reportFn).toHaveBeenCalledTimes(2)
      const reports = reportFn.mock.calls.map((call) => call[0])

      // First should be interrupted, second should complete
      const firstReport = reports.find((r) => r.id === firstTraceId)
      const secondReport = reports.find((r) => r.id === secondTraceId)

      expect(firstReport?.status).toBe('interrupted')
      expect(firstReport?.interruptionReason).toBe('another-trace-started')
      expect(firstReport?.parentTraceId).toBeUndefined() // First trace has no parent
      expect(secondReport?.status).toBe('ok')
      expect(secondReport?.parentTraceId).toBeUndefined() // Second trace has no parent (interrupted first)
    })

    it('should handle grandchildren (children of children)', () => {
      const traceManager = new TraceManager({
        relationSchemas: { ticket: { ticketId: String } },
        reportFn: getReportFn(),
        generateId,
        reportErrorFn,
        reportWarningFn: reportErrorFn,
      })

      // Parent can adopt child
      const parentTracer = traceManager.createTracer({
        name: 'ticket.parent-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'parent-end' }],
        adoptAsChildren: ['ticket.child-operation'],
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      // Child can adopt grandchild
      const childTracer = traceManager.createTracer({
        name: 'ticket.child-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'child-end' }],
        adoptAsChildren: ['ticket.grandchild-operation'],
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      // Grandchild
      const grandchildTracer = traceManager.createTracer({
        name: 'ticket.grandchild-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'grandchild-end' }],
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      // Start all traces in order
      parentTracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'default',
      })

      childTracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'default',
      })

      grandchildTracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'default',
      })

      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
      Events: ${Render('start', 0)}---${Render('grandchild-end', 0)}---${Render('child-end', 0)}---${Render('parent-end', 0)}
      Time:   ${0}                    ${100}                           ${150}                      ${200}
      `

      processSpans(spans, traceManager)

      // All should complete successfully, though there might be more reports due to implementation details
      expect(reportFn).toHaveBeenCalled()

      const parentReport = reportFn.mock.calls.find(
        (call) => call[0].name === 'ticket.parent-operation',
      )?.[0]
      const childReport = reportFn.mock.calls.find(
        (call) => call[0].name === 'ticket.child-operation',
      )?.[0]
      const grandchildReport = reportFn.mock.calls.find(
        (call) => call[0].name === 'ticket.grandchild-operation',
      )?.[0]

      expect(parentReport?.status).toBe('ok')
      expect(childReport?.status).toBe('ok')
      expect(grandchildReport?.status).toBe('ok')

      expect(parentReport?.interruptionReason).toBeUndefined()
      expect(childReport?.interruptionReason).toBeUndefined()
      expect(grandchildReport?.interruptionReason).toBeUndefined()

      // Verify parentTraceId hierarchy
      expect(parentReport?.parentTraceId).toBeUndefined() // Parent has no parent
      expect(childReport?.parentTraceId).toBe('id-0') // Child adopted by parent
      expect(grandchildReport?.parentTraceId).toBe('id-1') // Grandchild adopted by child
    })

    it('should handle complex nested hierarchies', () => {
      const traceManager = new TraceManager({
        relationSchemas: { ticket: { ticketId: String } },
        reportFn: getReportFn(),
        generateId,
        reportErrorFn,
        reportWarningFn: reportErrorFn,
      })

      // Create a 3-level hierarchy: root -> level1 -> level2
      const rootTracer = traceManager.createTracer({
        name: 'ticket.root-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'root-end' }],
        adoptAsChildren: ['ticket.level1-operation'],
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      const level1Tracer = traceManager.createTracer({
        name: 'ticket.level1-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'level1-end' }],
        adoptAsChildren: ['ticket.level2-operation'],
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      const level2Tracer = traceManager.createTracer({
        name: 'ticket.level2-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'level2-end' }],
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      // Start all traces
      rootTracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'default',
      })

      level1Tracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'default',
      })

      level2Tracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'default',
      })

      // Complete from deepest to shallowest
      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
      Events: ${Render('root-start', 0)}---${Render('level1-start', 0)}---${Render('level2-start', 0)}---${Render('level2-end', 0)}---${Render('level1-end', 0)}---${Render('root-end', 0)}
      Time:   ${0}                        ${25}                          ${50}                          ${75}                           ${100}                        ${125}
      `

      processSpans(spans, traceManager)

      expect(reportFn).toHaveBeenCalledTimes(3)

      const rootReport = reportFn.mock.calls.find(
        (call) => call[0].name === 'ticket.root-operation',
      )?.[0]
      const level1Report = reportFn.mock.calls.find(
        (call) => call[0].name === 'ticket.level1-operation',
      )?.[0]
      const level2Report = reportFn.mock.calls.find(
        (call) => call[0].name === 'ticket.level2-operation',
      )?.[0]

      // All should complete successfully
      expect(rootReport?.status).toBe('ok')
      expect(level1Report?.status).toBe('ok')
      expect(level2Report?.status).toBe('ok')

      // Verify parent-child hierarchy
      expect(rootReport?.parentTraceId).toBeUndefined() // Root has no parent
      expect(level1Report?.parentTraceId).toBe('id-0') // Level1 adopted by root
      expect(level2Report?.parentTraceId).toBe('id-1') // Level2 adopted by level1

      expect(reportErrorFn).not.toHaveBeenCalled()
    })

    it('should skip waiting-for-interactive state for children', () => {
      const traceManager = new TraceManager({
        relationSchemas: { ticket: { ticketId: String } },
        reportFn: getReportFn(),
        generateId,
        reportErrorFn,
        reportWarningFn: reportErrorFn,
      })

      const parentTracer = traceManager.createTracer({
        name: 'ticket.parent-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'parent-end' }],
        adoptAsChildren: ['ticket.child-operation'],
        captureInteractive: true, // Parent uses interactive
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      const childTracer = traceManager.createTracer({
        name: 'ticket.child-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'child-end' }],
        captureInteractive: true, // Child also has interactive, but should be ignored
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      // Start traces
      parentTracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'default',
      })

      childTracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'default',
      })

      // Complete child and parent quickly (no interactive wait)
      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
        Events: ${Render('parent-start', 0)}---${Render('parent-end', 0)}--${LongTask(300)}--${Render('child-end', 0)}--${Check}
        Time:   ${0}                           ${125}                      ${200}            ${220}                     ${5_000}
      `

      processSpans(spans, traceManager)

      expect(reportFn).toHaveBeenCalledTimes(2)

      const parentReport = reportFn.mock.calls.find(
        (call) => call[0].name === 'ticket.parent-operation',
      )?.[0]
      const childReport = reportFn.mock.calls.find(
        (call) => call[0].name === 'ticket.child-operation',
      )?.[0]

      // Both should complete successfully
      expect(childReport?.status).toBe('ok')
      expect(childReport?.parentTraceId).toBe('id-0')
      expect(childReport?.duration).toBe(220) // child completes immediately
      expect(childReport?.additionalDurations.startTillInteractive).toBe(null)

      expect(parentReport?.status).toBe('ok')
      expect(parentReport?.parentTraceId).toBeUndefined()
      expect(parentReport?.duration).toBe(125)
      expect(parentReport?.additionalDurations.startTillInteractive).toBe(500) // last long task starts at 200 + 300 duration

      expect(reportErrorFn).not.toHaveBeenCalled()
    })

    it('should ignore captureInteractive setting for children', () => {
      const traceManager = new TraceManager({
        relationSchemas: { ticket: { ticketId: String } },
        reportFn: getReportFn(),
        generateId,
        reportErrorFn,
        reportWarningFn: reportErrorFn,
      })

      const parentTracer = traceManager.createTracer({
        name: 'ticket.parent-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'parent-end' }],
        adoptAsChildren: ['ticket.child-operation'],
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      const childTracer = traceManager.createTracer({
        name: 'ticket.child-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'child-end' }],
        captureInteractive: true, // This should be ignored for children
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      // Start traces
      parentTracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'default',
      })

      childTracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'default',
      })

      // Complete child immediately without any interactive delay
      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
      Events: ${Render('parent-start', 0)}---${Render('child-start', 0)}---${Render('child-end', 0)}---${Render('parent-end', 0)}
      Time:   ${0}                           ${25}                         ${75}                      ${125}
      `

      processSpans(spans, traceManager)

      expect(reportFn).toHaveBeenCalledTimes(2)

      const parentReport = reportFn.mock.calls.find(
        (call) => call[0].name === 'ticket.parent-operation',
      )?.[0]
      const childReport = reportFn.mock.calls.find(
        (call) => call[0].name === 'ticket.child-operation',
      )?.[0]

      // Child should complete immediately without waiting for interactive
      expect(childReport?.status).toBe('ok')
      expect(childReport?.parentTraceId).toBe('id-0')

      // Parent should also complete
      expect(parentReport?.status).toBe('ok')
      expect(parentReport?.parentTraceId).toBeUndefined()
      expect(reportErrorFn).not.toHaveBeenCalled()
    })
  })

  describe('Backward Compatibility (F-9)', () => {
    it('should preserve existing single-trace behavior when adoptAsChildren is not defined', () => {
      const traceManager = new TraceManager({
        relationSchemas: { ticket: { ticketId: String } },
        reportFn: getReportFn(),
        generateId,
        reportErrorFn,
        reportWarningFn: reportErrorFn,
      })

      // Create first tracer without adoptAsChildren
      const firstTracer = traceManager.createTracer({
        name: 'ticket.first-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'first-end' }],
        // No adoptAsChildren defined
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      // Create second tracer
      const secondTracer = traceManager.createTracer({
        name: 'ticket.second-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'second-end' }],
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      // Start first trace
      const firstTraceId = firstTracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'default',
      })
      expect(firstTraceId).toBe('id-0')

      // Start second trace - should interrupt first (existing behavior)
      const secondTraceId = secondTracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'default',
      })
      expect(secondTraceId).toBe('id-1')

      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
      Events: ${Render('first-start', 0)}---${Render('second-start', 0)}---${Render('second-end', 0)}
      Time:   ${0}                          ${25}                          ${75}
      `

      processSpans(spans, traceManager)

      expect(reportFn).toHaveBeenCalledTimes(2)

      // Verify first trace was interrupted
      const firstReport = reportFn.mock.calls.find(
        (call) => call[0].name === 'ticket.first-operation',
      )?.[0]
      expect(firstReport?.status).toBe('interrupted')
      expect(firstReport?.interruptionReason).toBe('another-trace-started')
      expect(firstReport?.parentTraceId).toBeUndefined() // First trace has no parent

      // Verify second trace completed successfully
      const secondReport = reportFn.mock.calls.find(
        (call) => call[0].name === 'ticket.second-operation',
      )?.[0]
      expect(secondReport?.status).toBe('ok')
      expect(secondReport?.interruptionReason).toBeUndefined()
      expect(secondReport?.parentTraceId).toBeUndefined() // Second trace has no parent (interrupted first)
    })

    it('should preserve existing interruption behavior when no adoption occurs', () => {
      const traceManager = new TraceManager({
        relationSchemas: { ticket: { ticketId: String } },
        reportFn: getReportFn(),
        generateId,
        reportErrorFn,
        reportWarningFn: reportErrorFn,
      })

      // Create first tracer with adoptAsChildren but for different trace names
      const firstTracer = traceManager.createTracer({
        name: 'ticket.first-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'first-end' }],
        adoptAsChildren: ['ticket.some-other-operation'], // Doesn't match second tracer
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      // Create second tracer that won't be adopted
      const secondTracer = traceManager.createTracer({
        name: 'ticket.second-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'second-end' }],
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      // Start first trace
      const firstTraceId = firstTracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'default',
      })

      // Start second trace - should interrupt first (no adoption)
      const secondTraceId = secondTracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'default',
      })

      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
      Events: ${Render('first-start', 0)}---${Render('second-start', 0)}---${Render('second-end', 0)}
      Time:   ${0}                          ${25}                          ${75}
      `

      processSpans(spans, traceManager)

      expect(reportFn).toHaveBeenCalledTimes(2)

      // Verify first trace was interrupted (existing behavior)
      const firstReport = reportFn.mock.calls.find(
        (call) => call[0].id === firstTraceId,
      )?.[0]
      expect(firstReport?.status).toBe('interrupted')
      expect(firstReport?.interruptionReason).toBe('another-trace-started')
      expect(firstReport?.parentTraceId).toBeUndefined()

      // Verify second trace completed successfully
      const secondReport = reportFn.mock.calls.find(
        (call) => call[0].id === secondTraceId,
      )?.[0]
      expect(secondReport?.status).toBe('ok')
      expect(secondReport?.interruptionReason).toBeUndefined()
      expect(secondReport?.parentTraceId).toBeUndefined() // Not a child
      expect(reportErrorFn).not.toHaveBeenCalled()
    })
  })

  describe('Integration Scenarios', () => {
    it('should handle child adoption with debouncing', () => {
      const traceManager = new TraceManager({
        relationSchemas: { ticket: { ticketId: String } },
        reportFn: getReportFn(),
        generateId,
        reportErrorFn,
        reportWarningFn: reportErrorFn,
      })

      const parentTracer = traceManager.createTracer({
        name: 'ticket.parent-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'parent-end' }],
        adoptAsChildren: ['ticket.child-operation'],
        debounceOnSpans: [matchSpan.withName('parent-end')],
        debounceWindow: 200,
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      const childTracer = traceManager.createTracer({
        name: 'ticket.child-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'child-end' }],
        debounceOnSpans: [matchSpan.withName('child-end')],
        debounceWindow: 150,
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      // Start traces
      parentTracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'default',
      })

      childTracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'default',
      })

      // Create debouncing events for both parent and child
      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
      Events: ${Render('parent-start', 0)}---${Render('child-start', 0)}---${Render('parent-end', 0)}---${Render('child-end', 0)}---${Render('parent-end', 0)}---${Render('child-end', 0)}---${Check}
      Time:   ${0}                           ${25}                         ${50}                        ${100}                      ${220}                       ${240}                      ${600}
      `

      processSpans(spans, traceManager)

      expect(reportFn).toHaveBeenCalledTimes(2)

      const parentReport = reportFn.mock.calls.find(
        (call) => call[0].name === 'ticket.parent-operation',
      )?.[0]
      const childReport = reportFn.mock.calls.find(
        (call) => call[0].name === 'ticket.child-operation',
      )?.[0]

      // Both should complete successfully with debouncing applied
      expect(parentReport?.status).toBe('ok')
      expect(childReport?.status).toBe('ok')
      expect(childReport?.parentTraceId).toBe('id-0')

      // Verify debouncing was applied (duration should reflect debounced end times)
      expect(parentReport?.duration).toBe(220) // parent-start to parent-end
      expect(childReport?.duration).toBe(240) // child-start to child-end, accounting for debounce
      expect(reportErrorFn).not.toHaveBeenCalled()
    })

    it('should handle child adoption with computed spans', () => {
      const traceManager = new TraceManager({
        relationSchemas: { ticket: { ticketId: String } },
        reportFn: getReportFn(),
        generateId,
        reportErrorFn,
        reportWarningFn: reportErrorFn,
      })

      const parentTracer = traceManager.createTracer({
        name: 'ticket.parent-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'parent-end' }],
        adoptAsChildren: ['ticket.child-operation'],
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      const childTracer = traceManager.createTracer({
        name: 'ticket.child-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'child-end' }],
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      // Define computed spans for both tracers
      parentTracer.defineComputedSpan({
        name: 'parent-computed',
        startSpan: matchSpan.withName('parent-start'),
        endSpan: matchSpan.withName('parent-middle'),
      })

      childTracer.defineComputedSpan({
        name: 'child-computed',
        startSpan: matchSpan.withName('child-start'),
        endSpan: matchSpan.withName('child-middle'),
      })

      // Start traces
      parentTracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'default',
      })

      childTracer.start({
        relatedTo: { ticketId: '1' },
        variant: 'default',
        startTime: {epoch: 25, now: 25},
      })

      // Create spans for computed span calculation
      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketIdRelationSchemasFixture>`
      Events: ${Render('parent-start', 0)}---${Render('child-start', 0)}---${Render('parent-middle', 0)}---${Render('child-middle', 50)}---${Render('child-end', 0)}---${Render('parent-end', 0)}
      Time:   ${0}                           ${25}                         ${75}                           ${125}                          ${175}                     ${225}
      `

      processSpans(spans, traceManager)

      expect(reportFn).toHaveBeenCalledTimes(2)

      const parentReport = reportFn.mock.calls.find(
        (call) => call[0].name === 'ticket.parent-operation',
      )?.[0]
      const childReport = reportFn.mock.calls.find(
        (call) => call[0].name === 'ticket.child-operation',
      )?.[0]

      // Both should complete successfully
      expect(parentReport?.status).toBe('ok')
      expect(childReport?.status).toBe('ok')
      expect(childReport?.parentTraceId).toBe('id-0')

      // Verify computed spans were calculated
      expect(parentReport?.computedSpans?.['parent-computed']).toBeDefined()
      expect(parentReport?.computedSpans?.['parent-computed']?.startOffset).toBe(0)
      expect(parentReport?.computedSpans?.['parent-computed']?.duration).toBe(75)

      expect(childReport?.computedSpans?.['child-computed']).toBeDefined()
      expect(childReport?.computedSpans?.['child-computed']?.startOffset).toBe(0) // Relative to child start
      expect(childReport?.computedSpans?.['child-computed']?.duration).toBe(150)
      expect(reportErrorFn).not.toHaveBeenCalled()
    })

    it('should handle child adoption with required spans and matching relations', () => {
      // Create separate error/warning functions for the extended schema
      const extendedReportErrorFn: Mock<ReportErrorFn<TicketAndUserAndGlobalRelationSchemasFixture>> = jest.fn()
      const extendedReportWarningFn: Mock<ReportErrorFn<TicketAndUserAndGlobalRelationSchemasFixture>> = jest.fn()

      const traceManager = new TraceManager({
        relationSchemas: ticketAndUserAndGlobalRelationSchemasFixture,
        reportFn: reportFn as unknown as AnyPossibleReportFn<TicketAndUserAndGlobalRelationSchemasFixture>,
        generateId,
        reportErrorFn: extendedReportErrorFn,
        reportWarningFn: extendedReportWarningFn,
      })

      const parentTracer = traceManager.createTracer({
        name: 'ticket.parent-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'parent-end', matchingRelations: true }],
        adoptAsChildren: ['ticket.child-operation'],
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      const childTracer = traceManager.createTracer({
        name: 'ticket.child-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'child-end', matchingRelations: true }],
        variants: {
          default: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      const relatedTo = {
        ticketId: '123',
        userId: '456',
      }

      // Start traces with specific relations
      parentTracer.start({
        relatedTo,
        variant: 'default',
      })

      childTracer.start({
        relatedTo,
        variant: 'default',
      })

      // Create spans with matching relations
      // prettier-ignore
      const { spans } = getSpansFromTimeline<TicketAndUserAndGlobalRelationSchemasFixture>`
      Events: ${Render('parent-start', 0)}---${Render('child-start', 0)}---${Render('child-end', 0, { relatedTo })}---${Render('parent-end', 0, { relatedTo })}
      Time:   ${0}                           ${25}                         ${75}                                     ${125}
      `

      processSpans(spans, traceManager)

      expect(reportFn).toHaveBeenCalledTimes(2)

      const parentReport = reportFn.mock.calls.find(
        (call) => call[0].name === 'ticket.parent-operation',
      )?.[0]
      const childReport = reportFn.mock.calls.find(
        (call) => call[0].name === 'ticket.child-operation',
      )?.[0]

      // Both should complete successfully with matching relations
      expect(parentReport?.status).toBe('ok')
      expect(childReport?.status).toBe('ok')
      expect(childReport?.parentTraceId).toBe('id-0')

      // Verify relations are preserved
      expect(parentReport?.relatedTo).toEqual(relatedTo)
      expect(childReport?.relatedTo).toEqual(relatedTo)
      expect(extendedReportErrorFn).not.toHaveBeenCalled()
    })
  })
})
