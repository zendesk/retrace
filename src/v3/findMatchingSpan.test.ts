import { describe, expect, it } from 'vitest'
import {
  findMatchingSpan,
  fromDefinition,
  type SpanAndAnnotationForMatching,
} from './matchSpan'
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
  getParentSpan: () => undefined,
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
      const result = findMatchingSpan(
        matcher,
        [] as SpanAndAnnotation<TicketIdRelationSchemasFixture>[],
        mockContext,
      )
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

  describe('nthMatch functionality', () => {
    const createTestData = () => [
      createMockSpanAndAnnotation({ name: 'testEntry', id: 'span1' }),
      createMockSpanAndAnnotation({ name: 'nonMatch', id: 'span2' }),
      createMockSpanAndAnnotation({ name: 'testEntry', id: 'span3' }),
      createMockSpanAndAnnotation({ name: 'testEntry', id: 'span4' }),
      createMockSpanAndAnnotation({ name: 'nonMatch', id: 'span5' }),
    ]

    it('should return first match when nthMatch is undefined', () => {
      const matcher = fromDefinition<
        'ticket',
        TicketIdRelationSchemasFixture,
        'origin'
      >({ name: 'testEntry' })
      const spanAndAnnotations = createTestData()

      const result = findMatchingSpan(matcher, spanAndAnnotations, mockContext)
      expect(result?.span.id).toBe('span1')
    })

    it('should return first match when nthMatch is 0', () => {
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
        { nthMatch: 0 },
      )
      expect(result?.span.id).toBe('span1')
    })

    it('should return second match when nthMatch is 1', () => {
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
        { nthMatch: 1 },
      )
      expect(result?.span.id).toBe('span3')
    })

    it('should return third match when nthMatch is 2', () => {
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
        { nthMatch: 2 },
      )
      expect(result?.span.id).toBe('span4')
    })

    it('should return undefined when nthMatch exceeds available matches', () => {
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
        { nthMatch: 5 },
      )
      expect(result).toBeUndefined()
    })

    it('should return last match when nthMatch is -1', () => {
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
        { nthMatch: -1 },
      )
      expect(result?.span.id).toBe('span4')
    })

    it('should return second-to-last match when nthMatch is -2', () => {
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
        { nthMatch: -2 },
      )
      expect(result?.span.id).toBe('span3')
    })

    it('should return first match when nthMatch is -3', () => {
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
        { nthMatch: -3 },
      )
      expect(result?.span.id).toBe('span1')
    })

    it('should return undefined when negative nthMatch exceeds available matches', () => {
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
        { nthMatch: -5 },
      )
      expect(result).toBeUndefined()
    })

    it('should override matcher nthMatch with config nthMatch', () => {
      const matcher = fromDefinition<
        'ticket',
        TicketIdRelationSchemasFixture,
        'origin'
      >({ name: 'testEntry' })
      matcher.nthMatch = 0 // Set matcher to return first match
      const spanAndAnnotations = createTestData()

      // Override with config to return second match
      const result = findMatchingSpan(
        matcher,
        spanAndAnnotations,
        mockContext,
        { nthMatch: 1 },
      )
      expect(result?.span.id).toBe('span3')
    })
  })

  describe('lowestIndexToConsider functionality', () => {
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

    it('should start from specified lowestIndexToConsider', () => {
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
        { lowestIndexToConsider: 2 },
      )
      expect(result?.span.id).toBe('span3')
    })

    it('should return undefined when lowestIndexToConsider is beyond array length', () => {
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
        { lowestIndexToConsider: 10 },
      )
      expect(result).toBeUndefined()
    })

    it('should work with lowestIndexToConsider and nthMatch together', () => {
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
          lowestIndexToConsider: 1,
          nthMatch: 1,
        },
      )
      expect(result?.span.id).toBe('span3')
    })

    it('should override matcher lowestIndexToConsider with config lowestIndexToConsider', () => {
      const matcher = fromDefinition<
        'ticket',
        TicketIdRelationSchemasFixture,
        'origin'
      >({ name: 'testEntry' })
      matcher.lowestIndexToConsider = 0
      const spanAndAnnotations = createTestData()

      const result = findMatchingSpan(
        matcher,
        spanAndAnnotations,
        mockContext,
        { lowestIndexToConsider: 2 },
      )
      expect(result?.span.id).toBe('span3')
    })
  })

  describe('highestIndexToConsider functionality', () => {
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
        { nthMatch: -1 },
      )
      expect(result?.span.id).toBe('span4') // Last match in entire array
    })

    it('should limit search to highestIndexToConsider', () => {
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
          highestIndexToConsider: 1,
          nthMatch: -1,
        },
      )
      expect(result?.span.id).toBe('span2') // Last match in limited range
    })

    it('should handle highestIndexToConsider beyond array length', () => {
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
          highestIndexToConsider: 100,
          nthMatch: -1,
        },
      )
      expect(result?.span.id).toBe('span4') // Should not exceed actual array length
    })

    it('should work with lowestIndexToConsider and highestIndexToConsider together', () => {
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
          lowestIndexToConsider: 1,
          highestIndexToConsider: 2,
        },
      )
      expect(result?.span.id).toBe('span2') // First match in range
    })

    it('should return undefined when lowestIndexToConsider > highestIndexToConsider', () => {
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
          lowestIndexToConsider: 3,
          highestIndexToConsider: 1,
        },
      )
      expect(result).toBeUndefined()
    })

    it('should override matcher highestIndexToConsider with config highestIndexToConsider', () => {
      const matcher = fromDefinition<
        'ticket',
        TicketIdRelationSchemasFixture,
        'origin'
      >({ name: 'testEntry' })
      matcher.highestIndexToConsider = 3
      const spanAndAnnotations = createTestData()

      const result = findMatchingSpan(
        matcher,
        spanAndAnnotations,
        mockContext,
        {
          highestIndexToConsider: 1,
          nthMatch: -1,
        },
      )
      expect(result?.span.id).toBe('span2')
    })
  })

  describe('complex scenarios', () => {
    it('should handle all config options together with positive nthMatch', () => {
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
          lowestIndexToConsider: 2,
          highestIndexToConsider: 4,
          nthMatch: 1,
        },
      )
      expect(result?.span.id).toBe('span4')
    })

    it('should handle all config options together with negative nthMatch', () => {
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
          lowestIndexToConsider: 2,
          highestIndexToConsider: 4,
          nthMatch: -1,
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

      // Test various nthMatch values
      expect(
        findMatchingSpan(matcher, spanAndAnnotations, mockContext, {
          nthMatch: 0,
        })?.span.id,
      ).toBe('span1')
      expect(
        findMatchingSpan(matcher, spanAndAnnotations, mockContext, {
          nthMatch: -1,
        })?.span.id,
      ).toBe('span1')
      expect(
        findMatchingSpan(matcher, spanAndAnnotations, mockContext, {
          nthMatch: 1,
        }),
      ).toBeUndefined()
      expect(
        findMatchingSpan(matcher, spanAndAnnotations, mockContext, {
          nthMatch: -2,
        }),
      ).toBeUndefined()
    })

    it('should handle edge case where lowestIndexToConsider equals highestIndexToConsider', () => {
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
          lowestIndexToConsider: 1,
          highestIndexToConsider: 1,
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
      matcher.nthMatch = 1
      matcher.lowestIndexToConsider = 1
      matcher.highestIndexToConsider = 3

      const spanAndAnnotations = [
        createMockSpanAndAnnotation({ name: 'testEntry', id: 'span1' }), // index 0 - excluded by lowestIndexToConsider
        createMockSpanAndAnnotation({ name: 'testEntry', id: 'span2' }), // index 1 - first match in range
        createMockSpanAndAnnotation({ name: 'testEntry', id: 'span3' }), // index 2 - second match in range
        createMockSpanAndAnnotation({ name: 'testEntry', id: 'span4' }), // index 3 - third match in range
        createMockSpanAndAnnotation({ name: 'testEntry', id: 'span5' }), // index 4 - excluded by highestIndexToConsider
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
          lowestIndexToConsider: 0,
        })?.span.id,
      ).toBe('span1')
      expect(
        findMatchingSpan(matcher, spanAndAnnotations, mockContext, {
          highestIndexToConsider: 0,
        })?.span.id,
      ).toBe('span1')
      expect(
        findMatchingSpan(matcher, spanAndAnnotations, mockContext, {
          lowestIndexToConsider: 0,
          highestIndexToConsider: 0,
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

      // Test with highestIndexToConsider beyond array length
      const result = findMatchingSpan(
        matcher,
        spanAndAnnotations,
        mockContext,
        {
          highestIndexToConsider: 100,
          nthMatch: -1,
        },
      )
      expect(result?.span.id).toBe('span2')
    })
  })

  describe('performance and iteration behavior', () => {
    it('should iterate from start to end for positive indices', () => {
      const callOrder: string[] = []
      const matcher = (
        spanAndAnnotation: SpanAndAnnotationForMatching<TicketIdRelationSchemasFixture>,
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
        spanAndAnnotation: SpanAndAnnotationForMatching<TicketIdRelationSchemasFixture>,
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
        nthMatch: -1,
      })
      expect(callOrder).toEqual(['span4', 'span3', 'span2'])
    })

    it('should stop early when target nthMatch is found for positive indices', () => {
      const callOrder: string[] = []
      const matcher = (
        spanAndAnnotation: SpanAndAnnotationForMatching<TicketIdRelationSchemasFixture>,
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
        nthMatch: 1,
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

    it('should use nthMatch from fromDefinition', () => {
      const matcher = fromDefinition<
        'ticket',
        TicketIdRelationSchemasFixture,
        'origin'
      >({
        name: 'testEntry',
        nthMatch: 1,
      })
      const spanAndAnnotations = createTestData()

      const result = findMatchingSpan(matcher, spanAndAnnotations, mockContext)
      expect(result?.span.id).toBe('span3')
    })

    it('should use negative nthMatch from fromDefinition', () => {
      const matcher = fromDefinition<
        'ticket',
        TicketIdRelationSchemasFixture,
        'origin'
      >({
        name: 'testEntry',
        nthMatch: -1,
      })
      const spanAndAnnotations = createTestData()

      const result = findMatchingSpan(matcher, spanAndAnnotations, mockContext)
      expect(result?.span.id).toBe('span4')
    })

    it('should use lowestIndexToConsider from fromDefinition', () => {
      const matcher = fromDefinition<
        'ticket',
        TicketIdRelationSchemasFixture,
        'origin'
      >({
        name: 'testEntry',
        lowestIndexToConsider: 2,
      })
      const spanAndAnnotations = createTestData()

      const result = findMatchingSpan(matcher, spanAndAnnotations, mockContext)
      expect(result?.span.id).toBe('span3')
    })

    it('should use highestIndexToConsider from fromDefinition and nthMatch from config', () => {
      const matcher = fromDefinition<
        'ticket',
        TicketIdRelationSchemasFixture,
        'origin'
      >({
        name: 'testEntry',
        highestIndexToConsider: 2,
      })
      const spanAndAnnotations = createTestData()

      const result = findMatchingSpan(
        matcher,
        spanAndAnnotations,
        mockContext,
        {
          nthMatch: -1,
        },
      )
      expect(result?.span.id).toBe('span3') // Last match within highestIndexToConsider range (indices 0-2)
    })

    it('should use multiple tags from fromDefinition together', () => {
      const matcher = fromDefinition<
        'ticket',
        TicketIdRelationSchemasFixture,
        'origin'
      >({
        name: 'testEntry',
        lowestIndexToConsider: 1,
        highestIndexToConsider: 3,
        nthMatch: 1,
      })
      const spanAndAnnotations = [
        createMockSpanAndAnnotation({ name: 'testEntry', id: 'span1' }), // index 0 - excluded by lowestIndexToConsider
        createMockSpanAndAnnotation({ name: 'nonMatch', id: 'span2' }), // index 1
        createMockSpanAndAnnotation({ name: 'testEntry', id: 'span3' }), // index 2 - first match in range
        createMockSpanAndAnnotation({ name: 'testEntry', id: 'span4' }), // index 3 - second match in range
        createMockSpanAndAnnotation({ name: 'testEntry', id: 'span5' }), // index 4 - excluded by highestIndexToConsider
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
        nthMatch: 0,
        lowestIndexToConsider: 0,
        highestIndexToConsider: 4,
      })
      const spanAndAnnotations = createTestData()

      // Override with different config
      const result = findMatchingSpan(
        matcher,
        spanAndAnnotations,
        mockContext,
        {
          nthMatch: 1,
          lowestIndexToConsider: 2,
          highestIndexToConsider: 3,
        },
      )
      expect(result?.span.id).toBe('span4') // Should use config override, not fromDefinition
    })

    it('should handle negative nthMatch with range from fromDefinition', () => {
      const matcher = fromDefinition<
        'ticket',
        TicketIdRelationSchemasFixture,
        'origin'
      >({
        name: 'testEntry',
        lowestIndexToConsider: 0,
        highestIndexToConsider: 2,
        nthMatch: -1,
      })
      const spanAndAnnotations = createTestData()

      const result = findMatchingSpan(matcher, spanAndAnnotations, mockContext)
      expect(result?.span.id).toBe('span3') // Last match within range [0, 2]
    })

    it('should return undefined when fromDefinition nthMatch exceeds matches in range', () => {
      const matcher = fromDefinition<
        'ticket',
        TicketIdRelationSchemasFixture,
        'origin'
      >({
        name: 'testEntry',
        lowestIndexToConsider: 2,
        highestIndexToConsider: 3,
        nthMatch: 5, // Only 2 matches in range, requesting 6th match
      })
      const spanAndAnnotations = createTestData()

      const result = findMatchingSpan(matcher, spanAndAnnotations, mockContext)
      expect(result).toBeUndefined()
    })
  })
})
