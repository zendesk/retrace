import { describe, expect, it } from 'vitest'
import * as matchSpan from './matchSpan'
import type { SpanAnnotation } from './spanAnnotationTypes'
import type {
  ActiveTraceInput,
  ComponentRenderSpan,
  SpanBase,
} from './spanTypes'
import type {
  TicketIdRelationSchemasFixture,
  UserIdRelationSchemasFixture,
} from './testUtility/fixtures/relationSchemas'
import type {
  CompleteTraceDefinition,
  DraftTraceContext,
  MapSchemaToTypes,
} from './types'

const mockRelations: MapSchemaToTypes<
  TicketIdRelationSchemasFixture['ticket']
> = {
  ticketId: '123',
}

const mockEntryBase = {
  id: '123',
  type: 'element',
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
} as const satisfies SpanBase<TicketIdRelationSchemasFixture>

const mockPerformanceEntry = {
  ...mockEntryBase,
  performanceEntry: {
    entryType: 'element',
    name: 'testEntry',
    startTime: 0,
    duration: 0,
    toJSON: () => ({}),
  },
} as const satisfies SpanBase<TicketIdRelationSchemasFixture>

// Mock data for ComponentRenderTraceEntry
const mockComponentEntry: ComponentRenderSpan<TicketIdRelationSchemasFixture> =
  {
    ...mockEntryBase,
    type: 'component-render',
    errorInfo: undefined,
    isIdle: true,
    renderedOutput: 'content',
    renderCount: 1,
  }

const mockAnnotation: SpanAnnotation = {
  id: '',
  occurrence: 1,
  operationRelativeEndTime: 0,
  operationRelativeStartTime: 0,
  recordedInState: 'active',
  labels: [],
}

const mockContext = {
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
} as const satisfies DraftTraceContext<
  'ticket',
  TicketIdRelationSchemasFixture,
  'origin'
>

type MockOrigin = (typeof mockContext)['input']['variant']

// TESTING TODO: ask chatgpt to add 'or' and 'not' tests

describe('matchSpan', () => {
  describe('name', () => {
    it('should return true for a matching entry based on name', () => {
      const matcher = matchSpan.withName<
        'ticket',
        TicketIdRelationSchemasFixture,
        MockOrigin
      >('testEntry')
      const mockSpanAndAnnotation = {
        span: mockEntryBase,
        annotation: mockAnnotation,
      }
      expect(matcher(mockSpanAndAnnotation, mockContext)).toBe(true)
    })

    it('should return true for function matchers for name', () => {
      const matcher = matchSpan.withName<
        'ticket',
        TicketIdRelationSchemasFixture,
        MockOrigin
      >((n: string) => n.startsWith('test'))
      const mockSpanAndAnnotation = {
        span: mockEntryBase,
        annotation: mockAnnotation,
      }
      expect(matcher(mockSpanAndAnnotation, mockContext)).toBe(true)
    })

    it('should return true for regex matchers for name', () => {
      const matcher = matchSpan.withName<
        'ticket',
        TicketIdRelationSchemasFixture,
        MockOrigin
      >(/^test/)
      const mockSpanAndAnnotation = {
        span: mockEntryBase,
        annotation: mockAnnotation,
      }
      expect(matcher(mockSpanAndAnnotation, mockContext)).toBe(true)
    })

    it('should return false for a non-matching span based on name', () => {
      const matcher = matchSpan.withName<
        'ticket',
        TicketIdRelationSchemasFixture,
        MockOrigin
      >('nonMatchingEntry')
      const mockSpanAndAnnotation = {
        span: mockEntryBase,
        annotation: mockAnnotation,
      }
      expect(matcher(mockSpanAndAnnotation, mockContext)).toBe(false)
    })
  })

  describe('performanceEntryName', () => {
    it('should return true for a matching span based on performanceEntryName', () => {
      const matcher = matchSpan.withPerformanceEntryName<
        'ticket',
        TicketIdRelationSchemasFixture,
        MockOrigin
      >('testEntry')
      const mockSpanAndAnnotation = {
        span: mockPerformanceEntry,
        annotation: mockAnnotation,
      }
      expect(matcher(mockSpanAndAnnotation, mockContext)).toBe(true)
    })

    it('should return false for a non-matching performanceEntryName', () => {
      const matcher = matchSpan.withPerformanceEntryName<
        'ticket',
        TicketIdRelationSchemasFixture,
        MockOrigin
      >('nonMatchingEntry')
      const mockSpanAndAnnotation = {
        span: mockPerformanceEntry,
        annotation: mockAnnotation,
      }
      expect(matcher(mockSpanAndAnnotation, mockContext)).toBe(false)
    })
  })

  describe('type', () => {
    describe('for Native Performance Entry', () => {
      it('should return true for matching attributes', () => {
        const matcher = matchSpan.withType<
          'ticket',
          TicketIdRelationSchemasFixture,
          MockOrigin
        >('element')
        const mockSpanAndAnnotation = {
          span: mockEntryBase,
          annotation: mockAnnotation,
        }
        expect(matcher(mockSpanAndAnnotation, mockContext)).toBe(true)
      })

      it('should return false for non-matching attributes', () => {
        const matcher = matchSpan.withType<
          'ticket',
          TicketIdRelationSchemasFixture,
          MockOrigin
        >('component-render')
        const mockSpanAndAnnotation = {
          span: mockEntryBase,
          annotation: mockAnnotation,
        }
        expect(matcher(mockSpanAndAnnotation, mockContext)).toBe(false)
      })
    })

    describe('for ComponentRenderTraceEntry', () => {
      it('should return true for a matching ComponentRenderTraceEntry', () => {
        const matcher = matchSpan.withAllConditions<
          'ticket',
          TicketIdRelationSchemasFixture,
          MockOrigin
        >(
          matchSpan.withType('component-render'),
          matchSpan.withName('testEntry'),
        )
        const mockSpanAndAnnotation = {
          span: mockComponentEntry,
          annotation: mockAnnotation,
        }
        expect(matcher(mockSpanAndAnnotation, mockContext)).toBe(true)
      })

      it('should return false for a non-matching ComponentRenderTraceEntry', () => {
        const matcher = matchSpan.withAllConditions<
          'ticket',
          TicketIdRelationSchemasFixture,
          MockOrigin
        >(
          matchSpan.withType('component-render'),
          matchSpan.withName('nonMatchingEntry'),
        )
        const mockSpanAndAnnotation = {
          span: mockComponentEntry,
          annotation: mockAnnotation,
        }
        expect(matcher(mockSpanAndAnnotation, mockContext)).toBe(false)
      })
    })
  })

  describe('status', () => {
    it('should return true when status does match', () => {
      const matcher = matchSpan.withStatus<
        'ticket',
        TicketIdRelationSchemasFixture,
        MockOrigin
      >('ok')
      const mockSpanAndAnnotation = {
        span: mockEntryBase,
        annotation: mockAnnotation,
      }
      expect(matcher(mockSpanAndAnnotation, mockContext)).toBe(true)
    })

    it('should return false when status does not match', () => {
      const matcher = matchSpan.withStatus<
        'ticket',
        TicketIdRelationSchemasFixture,
        MockOrigin
      >('error')
      const mockSpanAndAnnotation = {
        span: mockEntryBase,
        annotation: mockAnnotation,
      }
      expect(matcher(mockSpanAndAnnotation, mockContext)).toBe(false)
    })
  })

  describe('occurrence', () => {
    it('should return true for occurrence matching', () => {
      const matcher = matchSpan.withAllConditions<
        'ticket',
        TicketIdRelationSchemasFixture,
        MockOrigin
      >(matchSpan.withName('testEntry'), matchSpan.withOccurrence(1))
      const mockSpanAndAnnotation = {
        span: mockEntryBase,
        annotation: mockAnnotation,
      }
      expect(matcher(mockSpanAndAnnotation, mockContext)).toBe(true)
    })

    it('should return false for non-matching occurrence', () => {
      const matcher = matchSpan.withAllConditions<
        'ticket',
        TicketIdRelationSchemasFixture,
        MockOrigin
      >(matchSpan.withName('testEntry'), matchSpan.withOccurrence(2))
      const mockSpanAndAnnotation = {
        span: mockEntryBase,
        annotation: mockAnnotation,
      }
      expect(matcher(mockSpanAndAnnotation, mockContext)).toBe(false)
    })
  })

  describe('attributes', () => {
    it('should return true for matching attributes', () => {
      const matcher = matchSpan.withAttributes<
        'ticket',
        TicketIdRelationSchemasFixture,
        MockOrigin
      >({
        attr1: 'value1',
      })
      const mockSpanAndAnnotation = {
        span: mockEntryBase,
        annotation: mockAnnotation,
      }
      expect(matcher(mockSpanAndAnnotation, mockContext)).toBe(true)
    })

    it('should return false for non-matching attributes', () => {
      const matcher = matchSpan.withAttributes<
        'ticket',
        TicketIdRelationSchemasFixture,
        MockOrigin
      >({
        attr1: 'wrongValue',
      })
      const mockSpanAndAnnotation = {
        span: mockEntryBase,
        annotation: mockAnnotation,
      }
      expect(matcher(mockSpanAndAnnotation, mockContext)).toBe(false)
    })
  })

  describe('matchingRelation', () => {
    it('should return true when relatedTo does match', () => {
      const matcher = matchSpan.withAllConditions<
        'ticket',
        TicketIdRelationSchemasFixture,
        MockOrigin
      >(
        matchSpan.withName('testEntry'),
        matchSpan.withMatchingRelations(['ticketId']),
      )
      const mockSpanAndAnnotation = {
        span: mockEntryBase,
        annotation: mockAnnotation,
      }
      expect(matcher(mockSpanAndAnnotation, mockContext)).toBe(true)
    })

    it('should return false when relatedTo does not match', () => {
      const matcher = matchSpan.withAllConditions<
        'ticket' | 'user',
        TicketIdRelationSchemasFixture & UserIdRelationSchemasFixture,
        MockOrigin
      >(
        matchSpan.withName('testEntry'),
        matchSpan.withMatchingRelations(['ticketId', 'userId']),
      )
      const mockSpanAndAnnotation = {
        span: mockEntryBase,
        annotation: mockAnnotation,
      }
      expect(
        matcher(mockSpanAndAnnotation, {
          ...mockContext,
          input: {
            ...mockContext.input,
            relatedTo: {
              ticketId: '123',
              userId: '123',
            },
          },
        }),
      ).toBe(false)
    })
  })

  describe('isIdle', () => {
    const mockMatcher = matchSpan.withAllConditions<
      'ticket',
      TicketIdRelationSchemasFixture,
      MockOrigin
    >(matchSpan.withName('testEntry'), matchSpan.whenIdle(true))

    it('should return true for isIdle matching', () => {
      const mockSpanAndAnnotation = {
        span: mockComponentEntry,
        annotation: mockAnnotation,
      }
      expect(mockMatcher(mockSpanAndAnnotation, mockContext)).toBe(true)
    })

    it('should return false for non-matching isIdle', () => {
      const mockEntry = { ...mockComponentEntry, isIdle: false }
      const mockSpanAndAnnotation = {
        span: mockEntry,
        annotation: mockAnnotation,
      }
      expect(mockMatcher(mockSpanAndAnnotation, mockContext)).toBe(false)
    })
  })

  describe('combination of conditions', () => {
    it('should return true when all conditions match', () => {
      const matcher = matchSpan.withAllConditions<
        'ticket',
        TicketIdRelationSchemasFixture,
        MockOrigin
      >(
        matchSpan.withName('testEntry'),
        matchSpan.withPerformanceEntryName('testEntry'),
        matchSpan.withAttributes({ attr1: 'value1' }),
        matchSpan.withMatchingRelations(['ticketId']),
        matchSpan.withStatus('ok'),
        matchSpan.withType('element'),
      )
      const mockSpanAndAnnotation = {
        span: mockPerformanceEntry,
        annotation: mockAnnotation,
      }
      expect(matcher(mockSpanAndAnnotation, mockContext)).toBe(true)
    })

    it('should return false when all conditions match but name', () => {
      const matcher = matchSpan.withAllConditions<
        'ticket',
        TicketIdRelationSchemasFixture,
        MockOrigin
      >(
        matchSpan.withName('testEntries'), // does not match
        matchSpan.withPerformanceEntryName('testEntry'),
        matchSpan.withAttributes({ attr1: 'value1' }),
        matchSpan.withMatchingRelations(['ticketId']),
        matchSpan.withStatus('ok'),
        matchSpan.withType('element'),
      )
      const mockSpanAndAnnotation = {
        span: mockPerformanceEntry,
        annotation: mockAnnotation,
      }
      expect(matcher(mockSpanAndAnnotation, mockContext)).toBe(false)
    })
  })

  describe('fn', () => {
    it('should return true when the custom function matches', () => {
      const matcher = matchSpan.fromDefinition<
        'ticket',
        TicketIdRelationSchemasFixture,
        MockOrigin
      >({
        fn: ({ span }) => span.name.startsWith('test'),
      })

      const mockSpanAndAnnotation = {
        span: mockEntryBase,
        annotation: mockAnnotation,
      }
      expect(matcher(mockSpanAndAnnotation, mockContext)).toBe(true)
    })

    it('should return false when the custom function does not match', () => {
      const matcher = matchSpan.fromDefinition<
        'ticket',
        TicketIdRelationSchemasFixture,
        MockOrigin
      >({
        fn: ({ span }) => span.name === 'nonMatchingEntry',
      })

      const mockSpanAndAnnotation = {
        span: mockEntryBase,
        annotation: mockAnnotation,
      }
      expect(matcher(mockSpanAndAnnotation, mockContext)).toBe(false)
    })
  })

  describe('fromDefinition', () => {
    it('should correctly handle standard definition objects', () => {
      const matcher = matchSpan.fromDefinition<
        'ticket',
        TicketIdRelationSchemasFixture,
        MockOrigin
      >({
        name: 'testEntry',
        type: 'element',
        attributes: { attr1: 'value1' },
      })

      const mockSpanAndAnnotation = {
        span: mockEntryBase,
        annotation: mockAnnotation,
      }
      expect(matcher(mockSpanAndAnnotation, mockContext)).toBe(true)
    })

    describe('oneOf', () => {
      it('should return true when one of the conditions matches', () => {
        const matcher = matchSpan.fromDefinition<
          'ticket',
          TicketIdRelationSchemasFixture,
          MockOrigin
        >({
          oneOf: [
            { name: 'nonMatchingEntry' },
            { name: 'testEntry' },
            { name: 'anotherNonMatchingEntry' },
          ],
        })

        const mockSpanAndAnnotation = {
          span: mockEntryBase,
          annotation: mockAnnotation,
        }
        expect(matcher(mockSpanAndAnnotation, mockContext)).toBe(true)
      })

      it('should return false when none of the conditions match', () => {
        const matcher = matchSpan.fromDefinition<
          'ticket',
          TicketIdRelationSchemasFixture,
          MockOrigin
        >({
          oneOf: [
            { name: 'nonMatchingEntry1' },
            { name: 'nonMatchingEntry2' },
            { name: 'nonMatchingEntry3' },
          ],
        })

        const mockSpanAndAnnotation = {
          span: mockEntryBase,
          annotation: mockAnnotation,
        }
        expect(matcher(mockSpanAndAnnotation, mockContext)).toBe(false)
      })

      it('should handle complex conditions within oneOf', () => {
        const matcher = matchSpan.fromDefinition<
          'ticket',
          TicketIdRelationSchemasFixture,
          MockOrigin
        >({
          oneOf: [
            {
              name: 'nonMatchingEntry',
              type: 'element',
            },
            {
              name: 'testEntry',
              type: 'component-render', // This doesn't match our entry
            },
            {
              name: 'testEntry',
              type: 'element',
              attributes: { attr1: 'value1' },
            },
          ],
        })

        const mockSpanAndAnnotation = {
          span: mockEntryBase,
          annotation: mockAnnotation,
        }
        expect(matcher(mockSpanAndAnnotation, mockContext)).toBe(true)
      })

      it('should carry over tags from sub-matchers', () => {
        const matcher = matchSpan.fromDefinition<
          'ticket',
          TicketIdRelationSchemasFixture,
          MockOrigin
        >({
          oneOf: [
            { name: 'nonMatchingEntry' },
            { name: 'testEntry', isIdle: true },
          ],
        })

        expect('idleCheck' in matcher).toBe(true)
        expect(matcher.idleCheck).toBe(true)
      })

      it('should work with nested fromDefinition calls', () => {
        // First, create a matcher using fromDefinition
        const nestedMatcher = matchSpan.fromDefinition<
          'ticket',
          TicketIdRelationSchemasFixture,
          MockOrigin
        >({
          type: 'element',
        })

        // Then use that matcher along with another in withOneOfConditions
        const combinedMatcher = matchSpan.withOneOfConditions(
          nestedMatcher,
          matchSpan.withName('nonMatchingEntry'),
        )

        const mockSpanAndAnnotation = {
          span: mockEntryBase,
          annotation: mockAnnotation,
        }
        expect(combinedMatcher(mockSpanAndAnnotation, mockContext)).toBe(true)
      })

      it('should handle nested oneOf conditions', () => {
        const matcher = matchSpan.fromDefinition<
          'ticket',
          TicketIdRelationSchemasFixture,
          MockOrigin
        >({
          oneOf: [
            { name: 'nonMatchingEntry1' },
            {
              oneOf: [{ name: 'nonMatchingEntry2' }, { name: 'testEntry' }],
            },
          ],
        })
        const mockSpanAndAnnotation = {
          span: mockEntryBase,
          annotation: mockAnnotation,
        }
        expect(matcher(mockSpanAndAnnotation, mockContext)).toBe(true)
      })
    })
  })
})
