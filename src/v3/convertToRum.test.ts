import { assert, describe, expect, it } from 'vitest'
import { convertTraceToRUM } from './convertToRum'
import { createTraceRecording } from './recordingComputeUtils'
import type { ActiveTraceInput } from './spanTypes'
import {
  createMockSpanAndAnnotation,
  createTimestamp,
} from './testUtility/createMockFactory'
import type { TicketIdRelationSchemasFixture } from './testUtility/fixtures/relationSchemas'
import type { CompleteTraceDefinition, MapTypesToSchema } from './types'

describe('convertTraceToRUM', () => {
  it('should round all numeric values in the trace recording', () => {
    const definition: CompleteTraceDefinition<
      'ticket',
      TicketIdRelationSchemasFixture,
      'origin'
    > = {
      name: 'test-trace',
      relationSchemaName: 'ticket',
      relationSchema: { ticketId: String },
      requiredSpans: [() => true],
      computedSpanDefinitions: {},
      computedValueDefinitions: {},
      variants: {
        origin: { timeout: 45_000 },
      },
    }

    const input: ActiveTraceInput<
      MapTypesToSchema<TicketIdRelationSchemasFixture['ticket']>,
      'origin'
    > = {
      id: 'test',
      startTime: createTimestamp(0),
      relatedTo: { ticketId: '74' },
      variant: 'origin',
    }

    const recordedItems = new Map([
      createMockSpanAndAnnotation(100.501, {
        name: 'test-component',
        type: 'component-render',
        relatedTo: {},
        duration: 50.499,
        isIdle: false,
        renderCount: 1,
        renderedOutput: 'loading',
      }),
      createMockSpanAndAnnotation(
        200.001,
        {
          name: 'test-component',
          type: 'component-render',
          relatedTo: {},
          duration: 50.999,
          isIdle: true,
          renderCount: 2,
          renderedOutput: 'content',
        },
        { occurrence: 2 },
      ),
    ])
    const traceRecording = createTraceRecording(
      {
        definition,
        input,
        recordedItemsByLabel: {},
        recordedItems,
      },
      {
        transitionFromState: 'active',
        lastRelevantSpanAndAnnotation: undefined,
        transitionToState: 'complete',
        completeSpanAndAnnotation: undefined,
        cpuIdleSpanAndAnnotation: undefined,
        lastRequiredSpanAndAnnotation: undefined,
      },
    )

    const context = {
      definition,
      input,
      recordedItemsByLabel: {},
      recordedItems,
    }

    const result = convertTraceToRUM({ traceRecording, context })

    // Check rounded values in embeddedSpans
    const embeddedSpan = result.embeddedSpans['component-render|test-component']
    if (embeddedSpan) {
      expect(Number.isInteger(embeddedSpan.totalDuration)).toBe(true)
      expect(Number.isInteger(embeddedSpan.spans[0]!.startOffset)).toBe(true)
      expect(Number.isInteger(embeddedSpan.spans[0]!.duration)).toBe(true)
      expect(Number.isInteger(embeddedSpan.spans[1]!.startOffset)).toBe(true)
      expect(Number.isInteger(embeddedSpan.spans[1]!.duration)).toBe(true)

      // Check specific rounded values
      expect(embeddedSpan.spans[0]!.startOffset).toBe(101) // 100.501 rounded
      expect(embeddedSpan.spans[0]!.duration).toBe(50) // 50.499 rounded
      expect(embeddedSpan.spans[1]!.startOffset).toBe(200) // 200.001 rounded
      expect(embeddedSpan.spans[1]!.duration).toBe(51) // 50.999 rounded

      expect(result.nonEmbeddedSpans).toEqual([])
    }
  })

  it('should return correct non embedded spans', () => {
    const definition: CompleteTraceDefinition<
      'ticket',
      TicketIdRelationSchemasFixture,
      'origin'
    > = {
      name: 'test-trace',
      relationSchemaName: 'ticket',
      relationSchema: { ticketId: String },
      requiredSpans: [() => true],
      computedSpanDefinitions: {},
      computedValueDefinitions: {},
      variants: {
        origin: { timeout: 45_000 },
      },
    }

    const input: ActiveTraceInput<
      MapTypesToSchema<TicketIdRelationSchemasFixture['ticket']>,
      'origin'
    > = {
      id: 'test',
      startTime: createTimestamp(0),
      relatedTo: { ticketId: '74' },
      variant: 'origin',
    }

    const recordedItems = new Map([
      createMockSpanAndAnnotation(100.501, {
        name: 'test-component',
        type: 'component-render',
        relatedTo: {},
        duration: 50.499,
        isIdle: false,
        renderCount: 1,
        renderedOutput: 'loading',
      }),
      createMockSpanAndAnnotation(
        200.001,
        {
          name: 'test-component',
          type: 'component-render',
          relatedTo: {},
          duration: 50.999,
          isIdle: true,
          renderCount: 2,
          renderedOutput: 'content',
        },
        { occurrence: 2 },
      ),
    ])
    const traceRecording = createTraceRecording(
      {
        definition,
        input,
        recordedItemsByLabel: {},
        recordedItems,
      },
      {
        transitionFromState: 'active',
        lastRelevantSpanAndAnnotation: undefined,
        transitionToState: 'complete',
        completeSpanAndAnnotation: undefined,
        cpuIdleSpanAndAnnotation: undefined,
        lastRequiredSpanAndAnnotation: undefined,
      },
    )

    const context = {
      definition,
      input,
      recordedItemsByLabel: {},
      recordedItems,
    }

    // we dont want to return any embedded spans
    const result = convertTraceToRUM({
      traceRecording,
      context,
      embedSpanSelector: () => false,
    })
    expect(Object.keys(result.embeddedSpans)).toHaveLength(0)
    expect(result.nonEmbeddedSpans).toEqual(['component-render|test-component'])
    expect(result.nonEmbeddedSpans).toHaveLength(1)
  })

  it('should identify the longest span correctly', () => {
    const definition: CompleteTraceDefinition<
      'ticket',
      TicketIdRelationSchemasFixture,
      'origin'
    > = {
      name: 'test-trace',
      relationSchemaName: 'ticket',
      relationSchema: { ticketId: String },
      requiredSpans: [() => true],
      computedSpanDefinitions: {},
      computedValueDefinitions: {},
      variants: {
        origin: { timeout: 45_000 },
      },
    }

    const input: ActiveTraceInput<
      MapTypesToSchema<TicketIdRelationSchemasFixture['ticket']>,
      'origin'
    > = {
      id: 'test',
      startTime: createTimestamp(0),
      relatedTo: { ticketId: '74' },
      variant: 'origin',
    }

    const recordedItems = new Map([
      createMockSpanAndAnnotation(100, {
        name: 'short-component',
        type: 'component-render',
        relatedTo: {},
        duration: 30,
        isIdle: false,
        renderCount: 1,
        renderedOutput: 'loading',
      }),
      createMockSpanAndAnnotation(200, {
        name: 'long-component',
        type: 'component-render',
        relatedTo: {},
        duration: 150,
        isIdle: true,
        renderCount: 1,
        renderedOutput: 'content',
      }),
      createMockSpanAndAnnotation(300, {
        name: 'medium-component',
        type: 'component-render',
        relatedTo: {},
        duration: 75,
        isIdle: false,
        renderCount: 1,
        renderedOutput: 'error',
      }),
    ])

    const traceRecording = createTraceRecording(
      {
        definition,
        input,
        recordedItemsByLabel: {},
        recordedItems,
      },
      {
        transitionFromState: 'active',
        lastRelevantSpanAndAnnotation: undefined,
        transitionToState: 'complete',
        completeSpanAndAnnotation: undefined,
        cpuIdleSpanAndAnnotation: undefined,
        lastRequiredSpanAndAnnotation: undefined,
      },
    )

    const context = {
      definition,
      input,
      recordedItemsByLabel: {},
      recordedItems,
    }

    const result = convertTraceToRUM({ traceRecording, context })

    // Should identify the longest span
    expect(result.longestSpan).toBeDefined()
    assert(result.longestSpan)
    expect(result.longestSpan.span.name).toBe('long-component')
    expect(result.longestSpan.span.duration).toBe(150)
    expect(result.longestSpan.span.type).toBe('component-render')
    expect(result.longestSpan.key).toBe('component-render|long-component')
  })
})
