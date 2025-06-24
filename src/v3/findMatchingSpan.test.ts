import { describe, expect, it } from 'vitest'
import { findMatchingSpan, fromDefinition } from './matchSpan'
import type { SpanAndAnnotation, SpanAnnotation } from './spanAnnotationTypes'
import type { PerformanceEntrySpan, Span } from './spanTypes'
import type { TicketIdRelationSchemasFixture } from './testUtility/fixtures/relationSchemas'
import type { MapSchemaToTypes, TraceContext } from './types'

// Mock data setup
const mockRelations: MapSchemaToTypes<
  TicketIdRelationSchemasFixture['ticket']
> = {
  ticketId: '123',
}

const createMockSpan = (
  overrides: Partial<PerformanceEntrySpan<TicketIdRelationSchemasFixture>> = {},
): PerformanceEntrySpan<TicketIdRelationSchemasFixture> => ({
  type: 'measure',
  id: '123',
  name: 'testEntry',
  startTime: {
    now: Date.now(),
    epoch: Date.now(),
  },
  relatedTo: mockRelations,
  attributes: {
    attr1: 'value1',
    attr2: 2,
  },
  duration: 100,
  status: 'ok',
  ...overrides,
})

const createMockAnnotation = (
  overrides: Partial<SpanAnnotation> = {},
): SpanAnnotation => ({
  id: '',
  occurrence: 1,
  operationRelativeEndTime: 0,
  operationRelativeStartTime: 0,
  recordedInState: 'active',
  labels: [],
  ...overrides,
})

const createMockSpanAndAnnotation = (
  spanOverrides: Partial<
    PerformanceEntrySpan<TicketIdRelationSchemasFixture>
  > = {},
  annotationOverrides: Partial<SpanAnnotation> = {},
): SpanAndAnnotation<TicketIdRelationSchemasFixture> => ({
  span: createMockSpan(spanOverrides),
  annotation: createMockAnnotation(annotationOverrides),
})

const mockContext: TraceContext<
  'ticket',
  TicketIdRelationSchemasFixture,
  'origin'
> = {
  input: {
    id: '123',
    relatedTo: mockRelations,
    startTime: {
      now: Date.now(),
      epoch: Date.now(),
    },
    variant: 'origin',
  },
  definition: {
    name: 'test',
    type: 'operation',
    relationSchemaName: 'ticket',
    relationSchema: { ticketId: String },
    requiredSpans: [() => true],
    computedSpanDefinitions: {},
    computedValueDefinitions: {},
    variants: {
      origin: { timeout: 10_000 },
    },
  },
  recordedItemsByLabel: {},
  recordedItems: new Map(),
} as const

describe('findMatchingSpan', () => {
  describe('basic functionality', () => {
    it('should return undefined for empty array', () => {
      const matcher = fromDefinition<
        'ticket',
        TicketIdRelationSchemasFixture,
        'origin'
      >({ name: 'testEntry' })
      const result = findMatchingSpan(matcher, [], mockContext)
      expect(result).toBeUndefined()
    })

    it('should return the first matching span', () => {
      const matcher = fromDefinition<
        'ticket',
        TicketIdRelationSchemasFixture,
        'origin'
      >({ name: 'testEntry' })
      const spanAndAnnotations = [
        createMockSpanAndAnnotation({ name: 'nonMatch' }),
        createMockSpanAndAnnotation({ name: 'testEntry' }),
        createMockSpanAndAnnotation({ name: 'testEntry' }),
      ]

      const result = findMatchingSpan(matcher, spanAndAnnotations, mockContext)
      expect(result).toBe(spanAndAnnotations[1])
    })

    it('should return undefined when no match is found', () => {
      const matcher = fromDefinition<
        'ticket',
        TicketIdRelationSchemasFixture,
        'origin'
      >({ name: 'nonExistent' })
      const spanAndAnnotations = [
        createMockSpanAndAnnotation({ name: 'testEntry1' }),
        createMockSpanAndAnnotation({ name: 'testEntry2' }),
      ]

      const result = findMatchingSpan(matcher, spanAndAnnotations, mockContext)
      expect(result).toBeUndefined()
    })

    it('should work with complex matchers', () => {
      const matcher = fromDefinition<
        'ticket',
        TicketIdRelationSchemasFixture,
        'origin'
      >({
        name: 'testEntry',
        type: 'element',
        status: 'ok',
      })

      const spanAndAnnotations = [
        createMockSpanAndAnnotation({
          name: 'testEntry',
          type: 'element',
          status: 'error',
        }),
        createMockSpanAndAnnotation({
          name: 'testEntry',
          type: 'mark',
          status: 'ok',
        }),
        createMockSpanAndAnnotation({
          name: 'testEntry',
          type: 'element',
          status: 'ok',
        }),
      ]

      const result = findMatchingSpan(matcher, spanAndAnnotations, mockContext)
      expect(result).toBe(spanAndAnnotations[2])
    })
  })

  describe('matchingIndex functionality', () => {
    const createTestData = () => [
      createMockSpanAndAnnotation({ name: 'testEntry', id: 'span1' }),
      createMockSpanAndAnnotation({ name: 'nonMatch', id: 'span2' }),
      createMockSpanAndAnnotation({ name: 'testEntry', id: 'span3' }),
      createMockSpanAndAnnotation({ name: 'testEntry', id: 'span4' }),
      createMockSpanAndAnnotation({ name: 'nonMatch', id: 'span5' }),
    ]

    it('should return first match when matchingIndex is undefined', () => {
      const matcher = fromDefinition<
        'ticket',
        TicketIdRelationSchemasFixture,
        'origin'
      >({ name: 'testEntry' })
      const spanAndAnnotations = createTestData()

      const result = findMatchingSpan(matcher, spanAndAnnotations, mockContext)
      expect(result?.span.id).toBe('span1')
    })

    it('should return first match when matchingIndex is 0', () => {
      const matcher = fromDefinition<
        'ticket',
        TicketIdRelationSchemasFixture,
        'origin'
      >({ name: 'testEntry' })
      const spanAndAnnotations = createTestData()

      const result = findMatchingSpan(
        matcher,
        spanAndAnnotations,
        mockContext,
        { matchingIndex: 0 },
      )
      expect(result?.span.id).toBe('span1')
    })

    it('should return second match when matchingIndex is 1', () => {
      const matcher = fromDefinition<
        'ticket',
        TicketIdRelationSchemasFixture,
        'origin'
      >({ name: 'testEntry' })
      const spanAndAnnotations = createTestData()

      const result = findMatchingSpan(
        matcher,
        spanAndAnnotations,
        mockContext,
        { matchingIndex: 1 },
      )
      expect(result?.span.id).toBe('span3')
    })

    it('should return third match when matchingIndex is 2', () => {
      const matcher = fromDefinition<
        'ticket',
        TicketIdRelationSchemasFixture,
        'origin'
      >({ name: 'testEntry' })
      const spanAndAnnotations = createTestData()

      const result = findMatchingSpan(
        matcher,
        spanAndAnnotations,
        mockContext,
        { matchingIndex: 2 },
      )
      expect(result?.span.id).toBe('span4')
    })

    it('should return undefined when matchingIndex exceeds available matches', () => {
      const matcher = fromDefinition<
        'ticket',
        TicketIdRelationSchemasFixture,
        'origin'
      >({ name: 'testEntry' })
      const spanAndAnnotations = createTestData()

      const result = findMatchingSpan(
        matcher,
        spanAndAnnotations,
        mockContext,
        { matchingIndex: 5 },
      )
      expect(result).toBeUndefined()
    })

    it('should return last match when matchingIndex is -1', () => {
      const matcher = fromDefinition<
        'ticket',
        TicketIdRelationSchemasFixture,
        'origin'
      >({ name: 'testEntry' })
      const spanAndAnnotations = createTestData()

      const result = findMatchingSpan(
        matcher,
        spanAndAnnotations,
        mockContext,
        { matchingIndex: -1 },
      )
      expect(result?.span.id).toBe('span4')
    })

    it('should return second-to-last match when matchingIndex is -2', () => {
      const matcher = fromDefinition<
        'ticket',
        TicketIdRelationSchemasFixture,
        'origin'
      >({ name: 'testEntry' })
      const spanAndAnnotations = createTestData()

      const result = findMatchingSpan(
        matcher,
        spanAndAnnotations,
        mockContext,
        { matchingIndex: -2 },
      )
      expect(result?.span.id).toBe('span3')
    })

    it('should return first match when matchingIndex is -3', () => {
      const matcher = fromDefinition<
        'ticket',
        TicketIdRelationSchemasFixture,
        'origin'
      >({ name: 'testEntry' })
      const spanAndAnnotations = createTestData()

      const result = findMatchingSpan(
        matcher,
        spanAndAnnotations,
        mockContext,
        { matchingIndex: -3 },
      )
      expect(result?.span.id).toBe('span1')
    })

    it('should return undefined when negative matchingIndex exceeds available matches', () => {
      const matcher = fromDefinition<
        'ticket',
        TicketIdRelationSchemasFixture,
        'origin'
      >({ name: 'testEntry' })
      const spanAndAnnotations = createTestData()

      const result = findMatchingSpan(
        matcher,
        spanAndAnnotations,
        mockContext,
        { matchingIndex: -5 },
      )
      expect(result).toBeUndefined()
    })

    it('should override matcher matchingIndex with config matchingIndex', () => {
      const matcher = fromDefinition<
        'ticket',
        TicketIdRelationSchemasFixture,
        'origin'
      >({ name: 'testEntry' })
      matcher.matchingIndex = 0 // Set matcher to return first match
      const spanAndAnnotations = createTestData()

      // Override with config to return second match
      const result = findMatchingSpan(
        matcher,
        spanAndAnnotations,
        mockContext,
        { matchingIndex: 1 },
      )
      expect(result?.span.id).toBe('span3')
    })
  })

  describe('startFromIndex functionality', () => {
    const createTestData = () => [
      createMockSpanAndAnnotation({ name: 'testEntry', id: 'span1' }),
      createMockSpanAndAnnotation({ name: 'testEntry', id: 'span2' }),
      createMockSpanAndAnnotation({ name: 'testEntry', id: 'span3' }),
      createMockSpanAndAnnotation({ name: 'testEntry', id: 'span4' }),
    ]

    it('should start from index 0 by default', () => {
      const matcher = fromDefinition<
        'ticket',
        TicketIdRelationSchemasFixture,
        'origin'
      >({ name: 'testEntry' })
      const spanAndAnnotations = createTestData()

      const result = findMatchingSpan(matcher, spanAndAnnotations, mockContext)
      expect(result?.span.id).toBe('span1')
    })

    it('should start from specified startFromIndex', () => {
      const matcher = fromDefinition<
        'ticket',
        TicketIdRelationSchemasFixture,
        'origin'
      >({ name: 'testEntry' })
      const spanAndAnnotations = createTestData()

      const result = findMatchingSpan(
        matcher,
        spanAndAnnotations,
        mockContext,
        { startFromIndex: 2 },
      )
      expect(result?.span.id).toBe('span3')
    })

    it('should return undefined when startFromIndex is beyond array length', () => {
      const matcher = fromDefinition<
        'ticket',
        TicketIdRelationSchemasFixture,
        'origin'
      >({ name: 'testEntry' })
      const spanAndAnnotations = createTestData()

      const result = findMatchingSpan(
        matcher,
        spanAndAnnotations,
        mockContext,
        { startFromIndex: 10 },
      )
      expect(result).toBeUndefined()
    })

    it('should work with startFromIndex and matchingIndex together', () => {
      const matcher = fromDefinition<
        'ticket',
        TicketIdRelationSchemasFixture,
        'origin'
      >({ name: 'testEntry' })
      const spanAndAnnotations = createTestData()

      // Start from index 1, get second match (which would be span4)
      const result = findMatchingSpan(
        matcher,
        spanAndAnnotations,
        mockContext,
        {
          startFromIndex: 1,
          matchingIndex: 1,
        },
      )
      expect(result?.span.id).toBe('span3')
    })

    it('should override matcher startFromIndex with config startFromIndex', () => {
      const matcher = fromDefinition<
        'ticket',
        TicketIdRelationSchemasFixture,
        'origin'
      >({ name: 'testEntry' })
      matcher.startFromIndex = 0
      const spanAndAnnotations = createTestData()

      const result = findMatchingSpan(
        matcher,
        spanAndAnnotations,
        mockContext,
        { startFromIndex: 2 },
      )
      expect(result?.span.id).toBe('span3')
    })
  })

  describe('endAtIndex functionality', () => {
    const createTestData = () => [
      createMockSpanAndAnnotation({ name: 'testEntry', id: 'span1' }),
      createMockSpanAndAnnotation({ name: 'testEntry', id: 'span2' }),
      createMockSpanAndAnnotation({ name: 'testEntry', id: 'span3' }),
      createMockSpanAndAnnotation({ name: 'testEntry', id: 'span4' }),
    ]

    it('should search through entire array by default', () => {
      const matcher = fromDefinition<
        'ticket',
        TicketIdRelationSchemasFixture,
        'origin'
      >({ name: 'testEntry' })
      const spanAndAnnotations = createTestData()

      const result = findMatchingSpan(
        matcher,
        spanAndAnnotations,
        mockContext,
        { matchingIndex: -1 },
      )
      expect(result?.span.id).toBe('span4') // Last match in entire array
    })

    it('should limit search to endAtIndex', () => {
      const matcher = fromDefinition<
        'ticket',
        TicketIdRelationSchemasFixture,
        'origin'
      >({ name: 'testEntry' })
      const spanAndAnnotations = createTestData()

      // Only search through first 2 elements (indices 0-1)
      const result = findMatchingSpan(
        matcher,
        spanAndAnnotations,
        mockContext,
        {
          endAtIndex: 1,
          matchingIndex: -1,
        },
      )
      expect(result?.span.id).toBe('span2') // Last match in limited range
    })

    it('should handle endAtIndex beyond array length', () => {
      const matcher = fromDefinition<
        'ticket',
        TicketIdRelationSchemasFixture,
        'origin'
      >({ name: 'testEntry' })
      const spanAndAnnotations = createTestData()

      const result = findMatchingSpan(
        matcher,
        spanAndAnnotations,
        mockContext,
        {
          endAtIndex: 100,
          matchingIndex: -1,
        },
      )
      expect(result?.span.id).toBe('span4') // Should not exceed actual array length
    })

    it('should work with startFromIndex and endAtIndex together', () => {
      const matcher = fromDefinition<
        'ticket',
        TicketIdRelationSchemasFixture,
        'origin'
      >({ name: 'testEntry' })
      const spanAndAnnotations = createTestData()

      // Search only middle elements (indices 1-2)
      const result = findMatchingSpan(
        matcher,
        spanAndAnnotations,
        mockContext,
        {
          startFromIndex: 1,
          endAtIndex: 2,
        },
      )
      expect(result?.span.id).toBe('span2') // First match in range
    })

    it('should return undefined when startFromIndex > endAtIndex', () => {
      const matcher = fromDefinition<
        'ticket',
        TicketIdRelationSchemasFixture,
        'origin'
      >({ name: 'testEntry' })
      const spanAndAnnotations = createTestData()

      const result = findMatchingSpan(
        matcher,
        spanAndAnnotations,
        mockContext,
        {
          startFromIndex: 3,
          endAtIndex: 1,
        },
      )
      expect(result).toBeUndefined()
    })

    it('should override matcher endAtIndex with config endAtIndex', () => {
      const matcher = fromDefinition<
        'ticket',
        TicketIdRelationSchemasFixture,
        'origin'
      >({ name: 'testEntry' })
      matcher.endAtIndex = 3
      const spanAndAnnotations = createTestData()

      const result = findMatchingSpan(
        matcher,
        spanAndAnnotations,
        mockContext,
        {
          endAtIndex: 1,
          matchingIndex: -1,
        },
      )
      expect(result?.span.id).toBe('span2')
    })
  })

  describe('complex scenarios', () => {
    it('should handle all config options together with positive matchingIndex', () => {
      const spanAndAnnotations = [
        createMockSpanAndAnnotation({ name: 'testEntry', id: 'span1' }), // index 0
        createMockSpanAndAnnotation({ name: 'nonMatch', id: 'span2' }), // index 1
        createMockSpanAndAnnotation({ name: 'testEntry', id: 'span3' }), // index 2
        createMockSpanAndAnnotation({ name: 'testEntry', id: 'span4' }), // index 3
        createMockSpanAndAnnotation({ name: 'testEntry', id: 'span5' }), // index 4
        createMockSpanAndAnnotation({ name: 'nonMatch', id: 'span6' }), // index 5
      ]

      const matcher = fromDefinition<
        'ticket',
        TicketIdRelationSchemasFixture,
        'origin'
      >({ name: 'testEntry' })

      // Search from index 2 to 4, get second match (should be span5)
      const result = findMatchingSpan(
        matcher,
        spanAndAnnotations,
        mockContext,
        {
          startFromIndex: 2,
          endAtIndex: 4,
          matchingIndex: 1,
        },
      )
      expect(result?.span.id).toBe('span4')
    })

    it('should handle all config options together with negative matchingIndex', () => {
      const spanAndAnnotations = [
        createMockSpanAndAnnotation({ name: 'testEntry', id: 'span1' }), // index 0
        createMockSpanAndAnnotation({ name: 'nonMatch', id: 'span2' }), // index 1
        createMockSpanAndAnnotation({ name: 'testEntry', id: 'span3' }), // index 2
        createMockSpanAndAnnotation({ name: 'testEntry', id: 'span4' }), // index 3
        createMockSpanAndAnnotation({ name: 'testEntry', id: 'span5' }), // index 4
        createMockSpanAndAnnotation({ name: 'nonMatch', id: 'span6' }), // index 5
      ]

      const matcher = fromDefinition<
        'ticket',
        TicketIdRelationSchemasFixture,
        'origin'
      >({ name: 'testEntry' })

      // Search from index 2 to 4, get last match (should be span5)
      const result = findMatchingSpan(
        matcher,
        spanAndAnnotations,
        mockContext,
        {
          startFromIndex: 2,
          endAtIndex: 4,
          matchingIndex: -1,
        },
      )
      expect(result?.span.id).toBe('span5')
    })

    it('should handle single element arrays correctly', () => {
      const matcher = fromDefinition<
        'ticket',
        TicketIdRelationSchemasFixture,
        'origin'
      >({ name: 'testEntry' })
      const spanAndAnnotations = [
        createMockSpanAndAnnotation({ name: 'testEntry', id: 'span1' }),
      ]

      // Test various matchingIndex values
      expect(
        findMatchingSpan(matcher, spanAndAnnotations, mockContext, {
          matchingIndex: 0,
        })?.span.id,
      ).toBe('span1')
      expect(
        findMatchingSpan(matcher, spanAndAnnotations, mockContext, {
          matchingIndex: -1,
        })?.span.id,
      ).toBe('span1')
      expect(
        findMatchingSpan(matcher, spanAndAnnotations, mockContext, {
          matchingIndex: 1,
        }),
      ).toBeUndefined()
      expect(
        findMatchingSpan(matcher, spanAndAnnotations, mockContext, {
          matchingIndex: -2,
        }),
      ).toBeUndefined()
    })

    it('should handle edge case where startFromIndex equals endAtIndex', () => {
      const spanAndAnnotations = [
        createMockSpanAndAnnotation({ name: 'nonMatch', id: 'span1' }),
        createMockSpanAndAnnotation({ name: 'testEntry', id: 'span2' }),
        createMockSpanAndAnnotation({ name: 'nonMatch', id: 'span3' }),
      ]

      const matcher = fromDefinition<
        'ticket',
        TicketIdRelationSchemasFixture,
        'origin'
      >({ name: 'testEntry' })

      const result = findMatchingSpan(
        matcher,
        spanAndAnnotations,
        mockContext,
        {
          startFromIndex: 1,
          endAtIndex: 1,
        },
      )
      expect(result?.span.id).toBe('span2')
    })

    it('should handle matcher with existing tags', () => {
      const matcher = fromDefinition<
        'ticket',
        TicketIdRelationSchemasFixture,
        'origin'
      >({ name: 'testEntry' })
      matcher.matchingIndex = 1
      matcher.startFromIndex = 1
      matcher.endAtIndex = 3

      const spanAndAnnotations = [
        createMockSpanAndAnnotation({ name: 'testEntry', id: 'span1' }), // index 0 - excluded by startFromIndex
        createMockSpanAndAnnotation({ name: 'testEntry', id: 'span2' }), // index 1 - first match in range
        createMockSpanAndAnnotation({ name: 'testEntry', id: 'span3' }), // index 2 - second match in range
        createMockSpanAndAnnotation({ name: 'testEntry', id: 'span4' }), // index 3 - third match in range
        createMockSpanAndAnnotation({ name: 'testEntry', id: 'span5' }), // index 4 - excluded by endAtIndex
      ]

      // Should use matcher's settings (second match in range 1-3 = span3)
      const result = findMatchingSpan(matcher, spanAndAnnotations, mockContext)
      expect(result?.span.id).toBe('span3')
    })
  })

  describe('edge cases and error conditions', () => {
    it('should handle matcher that always returns false', () => {
      const matcher = fromDefinition<
        'ticket',
        TicketIdRelationSchemasFixture,
        'origin'
      >({ name: 'nonExistent' })
      const spanAndAnnotations = [
        createMockSpanAndAnnotation({ name: 'testEntry', id: 'span1' }),
        createMockSpanAndAnnotation({ name: 'testEntry', id: 'span2' }),
      ]

      const result = findMatchingSpan(matcher, spanAndAnnotations, mockContext)
      expect(result).toBeUndefined()
    })

    it('should handle matcher that always returns true', () => {
      const matcher = () => true
      const spanAndAnnotations = [
        createMockSpanAndAnnotation({ name: 'testEntry1', id: 'span1' }),
        createMockSpanAndAnnotation({ name: 'testEntry2', id: 'span2' }),
      ]

      const result = findMatchingSpan(matcher, spanAndAnnotations, mockContext)
      expect(result?.span.id).toBe('span1')
    })

    it('should handle zero-based indices correctly', () => {
      const matcher = fromDefinition<
        'ticket',
        TicketIdRelationSchemasFixture,
        'origin'
      >({ name: 'testEntry' })
      const spanAndAnnotations = [
        createMockSpanAndAnnotation({ name: 'testEntry', id: 'span1' }),
      ]

      // Test boundary conditions
      expect(
        findMatchingSpan(matcher, spanAndAnnotations, mockContext, {
          startFromIndex: 0,
        })?.span.id,
      ).toBe('span1')
      expect(
        findMatchingSpan(matcher, spanAndAnnotations, mockContext, {
          endAtIndex: 0,
        })?.span.id,
      ).toBe('span1')
      expect(
        findMatchingSpan(matcher, spanAndAnnotations, mockContext, {
          startFromIndex: 0,
          endAtIndex: 0,
        })?.span.id,
      ).toBe('span1')
    })

    it('should handle array bounds correctly', () => {
      const matcher = fromDefinition<
        'ticket',
        TicketIdRelationSchemasFixture,
        'origin'
      >({ name: 'testEntry' })
      const spanAndAnnotations = [
        createMockSpanAndAnnotation({ name: 'testEntry', id: 'span1' }),
        createMockSpanAndAnnotation({ name: 'testEntry', id: 'span2' }),
      ]

      // Test with endAtIndex beyond array length
      const result = findMatchingSpan(
        matcher,
        spanAndAnnotations,
        mockContext,
        {
          endAtIndex: 100,
          matchingIndex: -1,
        },
      )
      expect(result?.span.id).toBe('span2')
    })
  })

  describe('performance and iteration behavior', () => {
    it('should iterate from start to end for positive indices', () => {
      const callOrder: string[] = []
      const matcher = (
        spanAndAnnotation: SpanAndAnnotation<TicketIdRelationSchemasFixture>,
      ) => {
        callOrder.push(spanAndAnnotation.span.id)
        return spanAndAnnotation.span.name === 'target'
      }

      const spanAndAnnotations = [
        createMockSpanAndAnnotation({ name: 'span1', id: 'span1' }),
        createMockSpanAndAnnotation({ name: 'span2', id: 'span2' }),
        createMockSpanAndAnnotation({ name: 'target', id: 'span3' }),
        createMockSpanAndAnnotation({ name: 'span4', id: 'span4' }),
      ]

      findMatchingSpan(matcher, spanAndAnnotations, mockContext)
      expect(callOrder).toEqual(['span1', 'span2', 'span3'])
    })

    it('should iterate from end to start for negative indices', () => {
      const callOrder: string[] = []
      const matcher = (
        spanAndAnnotation: SpanAndAnnotation<TicketIdRelationSchemasFixture>,
      ) => {
        callOrder.push(spanAndAnnotation.span.id)
        return spanAndAnnotation.span.name === 'target'
      }

      const spanAndAnnotations = [
        createMockSpanAndAnnotation({ name: 'span1', id: 'span1' }),
        createMockSpanAndAnnotation({ name: 'target', id: 'span2' }),
        createMockSpanAndAnnotation({ name: 'span3', id: 'span3' }),
        createMockSpanAndAnnotation({ name: 'span4', id: 'span4' }),
      ]

      findMatchingSpan(matcher, spanAndAnnotations, mockContext, {
        matchingIndex: -1,
      })
      expect(callOrder).toEqual(['span4', 'span3', 'span2'])
    })

    it('should stop early when target matchingIndex is found for positive indices', () => {
      const callOrder: string[] = []
      const matcher = (
        spanAndAnnotation: SpanAndAnnotation<TicketIdRelationSchemasFixture>,
      ) => {
        callOrder.push(spanAndAnnotation.span.id)
        return spanAndAnnotation.span.name === 'target'
      }

      const spanAndAnnotations = [
        createMockSpanAndAnnotation({ name: 'target', id: 'span1' }),
        createMockSpanAndAnnotation({ name: 'target', id: 'span2' }),
        createMockSpanAndAnnotation({ name: 'target', id: 'span3' }),
        createMockSpanAndAnnotation({ name: 'target', id: 'span4' }),
      ]

      // Should stop after finding the second match (index 1)
      findMatchingSpan(matcher, spanAndAnnotations, mockContext, {
        matchingIndex: 1,
      })
      expect(callOrder).toEqual(['span1', 'span2'])
    })
  })

  describe('matcher tags from fromDefinition', () => {
    const createTestData = () => [
      createMockSpanAndAnnotation({ name: 'testEntry', id: 'span1' }),
      createMockSpanAndAnnotation({ name: 'nonMatch', id: 'span2' }),
      createMockSpanAndAnnotation({ name: 'testEntry', id: 'span3' }),
      createMockSpanAndAnnotation({ name: 'testEntry', id: 'span4' }),
      createMockSpanAndAnnotation({ name: 'nonMatch', id: 'span5' }),
    ]

    it('should use matchingIndex from fromDefinition', () => {
      const matcher = fromDefinition<
        'ticket',
        TicketIdRelationSchemasFixture,
        'origin'
      >({
        name: 'testEntry',
        matchingIndex: 1,
      })
      const spanAndAnnotations = createTestData()

      const result = findMatchingSpan(matcher, spanAndAnnotations, mockContext)
      expect(result?.span.id).toBe('span3')
    })

    it('should use negative matchingIndex from fromDefinition', () => {
      const matcher = fromDefinition<
        'ticket',
        TicketIdRelationSchemasFixture,
        'origin'
      >({
        name: 'testEntry',
        matchingIndex: -1,
      })
      const spanAndAnnotations = createTestData()

      const result = findMatchingSpan(matcher, spanAndAnnotations, mockContext)
      expect(result?.span.id).toBe('span4')
    })

    it('should use startFromIndex from fromDefinition', () => {
      const matcher = fromDefinition<
        'ticket',
        TicketIdRelationSchemasFixture,
        'origin'
      >({
        name: 'testEntry',
        startFromIndex: 2,
      })
      const spanAndAnnotations = createTestData()

      const result = findMatchingSpan(matcher, spanAndAnnotations, mockContext)
      expect(result?.span.id).toBe('span3')
    })

    it('should use endAtIndex from fromDefinition and matchingIndex from config', () => {
      const matcher = fromDefinition<
        'ticket',
        TicketIdRelationSchemasFixture,
        'origin'
      >({
        name: 'testEntry',
        endAtIndex: 2,
      })
      const spanAndAnnotations = createTestData()

      const result = findMatchingSpan(
        matcher,
        spanAndAnnotations,
        mockContext,
        {
          matchingIndex: -1,
        },
      )
      expect(result?.span.id).toBe('span3') // Last match within endAtIndex range (indices 0-2)
    })

    it('should use multiple tags from fromDefinition together', () => {
      const matcher = fromDefinition<
        'ticket',
        TicketIdRelationSchemasFixture,
        'origin'
      >({
        name: 'testEntry',
        startFromIndex: 1,
        endAtIndex: 3,
        matchingIndex: 1,
      })
      const spanAndAnnotations = [
        createMockSpanAndAnnotation({ name: 'testEntry', id: 'span1' }), // index 0 - excluded by startFromIndex
        createMockSpanAndAnnotation({ name: 'nonMatch', id: 'span2' }), // index 1
        createMockSpanAndAnnotation({ name: 'testEntry', id: 'span3' }), // index 2 - first match in range
        createMockSpanAndAnnotation({ name: 'testEntry', id: 'span4' }), // index 3 - second match in range
        createMockSpanAndAnnotation({ name: 'testEntry', id: 'span5' }), // index 4 - excluded by endAtIndex
      ]

      const result = findMatchingSpan(matcher, spanAndAnnotations, mockContext)
      expect(result?.span.id).toBe('span4') // Second match in the range
    })

    it('should override fromDefinition tags with config parameter', () => {
      const matcher = fromDefinition<
        'ticket',
        TicketIdRelationSchemasFixture,
        'origin'
      >({
        name: 'testEntry',
        matchingIndex: 0,
        startFromIndex: 0,
        endAtIndex: 4,
      })
      const spanAndAnnotations = createTestData()

      // Override with different config
      const result = findMatchingSpan(
        matcher,
        spanAndAnnotations,
        mockContext,
        {
          matchingIndex: 1,
          startFromIndex: 2,
          endAtIndex: 3,
        },
      )
      expect(result?.span.id).toBe('span4') // Should use config override, not fromDefinition
    })

    it('should handle negative matchingIndex with range from fromDefinition', () => {
      const matcher = fromDefinition<
        'ticket',
        TicketIdRelationSchemasFixture,
        'origin'
      >({
        name: 'testEntry',
        startFromIndex: 0,
        endAtIndex: 2,
        matchingIndex: -1,
      })
      const spanAndAnnotations = createTestData()

      const result = findMatchingSpan(matcher, spanAndAnnotations, mockContext)
      expect(result?.span.id).toBe('span3') // Last match within range [0, 2]
    })

    it('should return undefined when fromDefinition matchingIndex exceeds matches in range', () => {
      const matcher = fromDefinition<
        'ticket',
        TicketIdRelationSchemasFixture,
        'origin'
      >({
        name: 'testEntry',
        startFromIndex: 2,
        endAtIndex: 3,
        matchingIndex: 5, // Only 2 matches in range, requesting 6th match
      })
      const spanAndAnnotations = createTestData()

      const result = findMatchingSpan(matcher, spanAndAnnotations, mockContext)
      expect(result).toBeUndefined()
    })
  })
})
