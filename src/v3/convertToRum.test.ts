import { assert, describe, expect, it } from 'vitest'
import { convertTraceToRUM, recursivelyRoundValues } from './convertToRum'
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

describe('recursivelyRoundValues', () => {
  it('should handle null and undefined values', () => {
    const input = {
      nullValue: null,
      undefinedValue: undefined,
      number: 1.5,
    }

    const result = recursivelyRoundValues(input)

    expect(result.nullValue).toBe(null)
    expect(result.undefinedValue).toBe(undefined)
    expect(result.number).toBe(2)
  })

  it('should return null/undefined when passed as root object', () => {
    expect(recursivelyRoundValues(null as any)).toBe(null)
    expect(recursivelyRoundValues(undefined as any)).toBe(undefined)
  })

  it('should round numeric values using default Math.round', () => {
    const input = {
      integer: 42,
      positiveFloat: 3.141_59,
      negativeFloat: -2.718_28,
      zero: 0,
      largeNumber: 1_234_567.89,
    }

    const result = recursivelyRoundValues(input)

    expect(result.integer).toBe(42)
    expect(result.positiveFloat).toBe(3)
    expect(result.negativeFloat).toBe(-3)
    expect(result.zero).toBe(0)
    expect(result.largeNumber).toBe(1_234_568)
  })

  it('should use custom round function when provided', () => {
    const input = {
      value1: 3.141_59,
      value2: 2.718_28,
    }

    const customRound = (x: number) => Math.floor(x * 10) / 10 // Round to 1 decimal
    const result = recursivelyRoundValues(input, customRound)

    expect(result.value1).toBe(3.1)
    expect(result.value2).toBe(2.7)
  })

  it('should preserve non-numeric primitive values', () => {
    const input = {
      string: 'hello world',
      boolean: true,
      booleanFalse: false,
      bigint: 123n,
      symbol: Symbol('test'),
    }

    const result = recursivelyRoundValues(input)

    expect(result.string).toBe('hello world')
    expect(result.boolean).toBe(true)
    expect(result.booleanFalse).toBe(false)
    expect(result.bigint).toBe(123n)
    expect(result.symbol).toBe(input.symbol)
  })

  it('should handle nested objects recursively', () => {
    const input = {
      level1: {
        number: 1.7,
        level2: {
          anotherNumber: 2.3,
          level3: {
            deepNumber: 3.9,
          },
        },
      },
    }

    const result = recursivelyRoundValues(input)

    expect(result.level1.number).toBe(2)
    expect(result.level1.level2.anotherNumber).toBe(2)
    expect(result.level1.level2.level3.deepNumber).toBe(4)
  })

  it('should handle arrays with mixed types', () => {
    const input = {
      mixedArray: [1.5, 'string', 2.7, true, null, undefined, { nested: 3.2 }],
    }

    const result = recursivelyRoundValues(input)

    expect(result.mixedArray).toEqual([
      2, // 1.5 rounded
      'string', // preserved
      3, // 2.7 rounded
      true, // preserved
      null, // preserved
      undefined, // preserved
      { nested: 3 }, // nested object processed
    ])
  })

  it('should handle arrays with null/undefined elements', () => {
    const input = {
      arrayWithNulls: [1.5, null, 2.7, undefined, 3.9],
      nestedArrays: [
        [1.1, null],
        [undefined, 2.9],
      ],
    }

    const result = recursivelyRoundValues(input)

    expect(result.arrayWithNulls).toEqual([2, null, 3, undefined, 4])
    expect(result.nestedArrays).toEqual([
      [1, null],
      [undefined, 3],
    ])
  })

  it('should handle complex nested structures', () => {
    const input = {
      data: {
        metrics: {
          duration: 123.456,
          startTime: 789.012,
          spans: [
            { offset: 10.7, duration: 20.3 },
            { offset: 30.9, duration: null },
            null,
            { offset: undefined, duration: 40.1 },
          ],
        },
        metadata: {
          version: '1.0.0',
          enabled: true,
          config: {
            timeout: 5_000.99,
            retries: 3.14,
          },
        },
      },
    }

    const result = recursivelyRoundValues(input)

    expect(result.data.metrics.duration).toBe(123)
    expect(result.data.metrics.startTime).toBe(789)
    expect(result.data.metrics.spans[0]).toEqual({ offset: 11, duration: 20 })
    expect(result.data.metrics.spans[1]).toEqual({ offset: 31, duration: null })
    expect(result.data.metrics.spans[2]).toBe(null)
    expect(result.data.metrics.spans[3]).toEqual({
      offset: undefined,
      duration: 40,
    })
    expect(result.data.metadata.version).toBe('1.0.0')
    expect(result.data.metadata.enabled).toBe(true)
    expect(result.data.metadata.config.timeout).toBe(5_001)
    expect(result.data.metadata.config.retries).toBe(3)
  })

  it('should handle empty objects and arrays', () => {
    const input = {
      emptyObject: {},
      emptyArray: [],
      nestedEmpty: {
        inner: {},
        innerArray: [],
      },
    }

    const result = recursivelyRoundValues(input)

    expect(result.emptyObject).toEqual({})
    expect(result.emptyArray).toEqual([])
    expect(result.nestedEmpty.inner).toEqual({})
    expect(result.nestedEmpty.innerArray).toEqual([])
  })

  it('should not mutate the original object', () => {
    const input = {
      number: 1.5,
      nested: {
        array: [2.7, { value: 3.9 }],
      },
    }

    const originalInput = JSON.parse(JSON.stringify(input))
    recursivelyRoundValues(input)

    expect(input).toEqual(originalInput) // Original should be unchanged
  })
})
