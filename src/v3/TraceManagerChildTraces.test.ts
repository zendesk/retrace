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
import { Check, getSpansFromTimeline, Render } from './testUtility/makeTimeline'
import { processSpans } from './testUtility/processSpans'
import { TraceManager } from './TraceManager'
import type { AnyPossibleReportFn } from './types'

describe('TraceManager - Child Traces (Nested Proposal)', () => {
  let reportFn: Mock<AnyPossibleReportFn<TicketIdRelationSchemasFixture>>
  // TS doesn't like that reportFn is wrapped in Mock<> type
  const getReportFn = () =>
    reportFn as AnyPossibleReportFn<TicketIdRelationSchemasFixture>
  let generateId: Mock
  let reportErrorFn: Mock
  const DEFAULT_TIMEOUT_DURATION = 45_000

  jest.useFakeTimers({
    now: 0,
  })

  beforeEach(() => {
    reportFn = jest.fn()
    generateId = jest.fn(() => 'default-generated-id')
    // .mockReturnValueOnce('parent-trace-id')
    // .mockReturnValueOnce('child-trace-id')
    // .mockReturnValue('fallback-id')
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
      })

      // Create parent tracer that can adopt 'child-operation' traces
      const parentTracer = traceManager.createTracer({
        name: 'ticket.parent-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'parent-end' }],
        adoptAsChildren: ['ticket.child-operation'],
        variants: {
          cold_boot: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      // Create child tracer
      const childTracer = traceManager.createTracer({
        name: 'ticket.child-operation',
        type: 'operation',
        relationSchemaName: 'ticket',
        requiredSpans: [{ name: 'child-end' }],
        variants: {
          cold_boot: { timeout: DEFAULT_TIMEOUT_DURATION },
        },
      })

      // Start parent trace
      const parentTraceId = parentTracer.start({
        id: 'parent-trace-id',
        relatedTo: { ticketId: '1' },
        variant: 'cold_boot',
      })
      expect(parentTraceId).toBe('parent-trace-id')

      // Start child trace - should be adopted, not interrupt parent
      const childTraceId = childTracer.start({
        id: 'child-trace-id',
        relatedTo: { ticketId: '1' },
        variant: 'cold_boot',
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

      // Debug: Log all reports
      console.log(
        'All reports:',
        reportFn.mock.calls.map((call) => ({
          name: call[0].name,
          status: call[0].status,
          interruptionReason: call[0].interruptionReason,
        })),
      )

      expect(reportFn).toHaveBeenCalledTimes(2) // Both parent and child should complete

      // Verify parent trace completed with child
      const parentReport = reportFn.mock.calls.find(
        (call) => call[0].name === 'ticket.parent-operation',
      )?.[0]
      expect(parentReport).toBeDefined()
      console.log('Parent report:', {
        status: parentReport?.status,
        interruptionReason: parentReport?.interruptionReason,
      })
      expect(parentReport?.status).toBe('ok')
      expect(parentReport?.interruptionReason).toBeUndefined()

      // Verify child trace completed
      const childReport = reportFn.mock.calls.find(
        (call) => call[0].name === 'ticket.child-operation',
      )?.[0]
      expect(childReport).toBeDefined()
      expect(childReport?.status).toBe('ok')
      expect(childReport?.interruptionReason).toBeUndefined()
    })

    it.todo(
      'should interrupt parent trace when child trace name is NOT in adoptAsChildren (existing behavior)',
    )

    it.todo('should handle multiple children being adopted by the same parent')

    it.todo(
      'should transition parent to waiting-for-children state immediately after completing its own requirements',
    )
  })

  describe('Parent Completion (F-3)', () => {
    it.todo(
      'should transition parent from waiting-for-children to complete when all children finish',
    )

    it.todo(
      'should transition parent directly to complete if no children exist when entering waiting-for-children',
    )

    it.todo(
      'should maintain parent in waiting-for-children state while any child is still running',
    )
  })

  describe('Parent Interruption Propagation (F-4)', () => {
    it.todo(
      'should interrupt all children with parent-interrupted when parent is interrupted manually',
    )

    it.todo(
      'should interrupt all children with parent-interrupted when parent times out',
    )

    it.todo('should clear children set when parent is interrupted')
  })

  describe('Child Interruption Propagation (F-5, F-6)', () => {
    it.todo('should interrupt parent with child-timeout when child times out')

    it.todo(
      'should interrupt parent with child-interrupted when child is interrupted for other reasons',
    )

    it.todo(
      'should NOT interrupt parent when child is interrupted with child-swap reason',
    )

    it.todo('should handle onChildEnd event and remove child from children set')

    it.todo('should move completed child to completedChildren set')
  })

  describe('Span Forwarding (F-7)', () => {
    it.todo(
      'should forward spans from parent to all running children after processing in parent',
    )

    it.todo('should not forward spans to children that have already completed')

    it.todo(
      'should handle span forwarding when children are in different states',
    )
  })

  describe('Memory Management (F-8)', () => {
    it.todo(
      'should clear children and completedChildren sets in prepareAndEmitRecording',
    )

    it.todo('should not create memory leaks with parent-child references')
  })

  describe('Child Utilities and Scope', () => {
    it.todo(
      'should provide child-scoped utilities that return child as current trace',
    )

    it.todo(
      'should handle replaceCurrentTrace in child scope by adopting new trace to parent',
    )

    it.todo(
      'should handle child-swap interruption when replacing current child trace',
    )
  })

  describe('Edge Cases', () => {
    it.todo('should prevent self-nested traces (trace adopting itself)')

    it.todo('should handle grandchildren (children of children)')

    it.todo('should handle complex nested hierarchies')

    it.todo('should skip waiting-for-interactive state for children')

    it.todo('should ignore captureInteractive setting for children')
  })

  describe('Backward Compatibility (F-9)', () => {
    it.todo(
      'should preserve existing single-trace behavior when adoptAsChildren is not defined',
    )

    it.todo(
      'should preserve existing interruption behavior when no adoption occurs',
    )
  })

  describe('Integration Scenarios', () => {
    it.todo('should handle child adoption with debouncing')

    it.todo('should handle child adoption with computed spans')

    it.todo(
      'should handle child adoption with required spans and matching relations',
    )
  })
})
