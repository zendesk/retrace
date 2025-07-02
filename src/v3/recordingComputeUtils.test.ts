import { describe, expect, it, vitest as jest } from 'vitest'
import { getSpanSummaryAttributes } from './convertToRum'
import { fromDefinition } from './matchSpan'
import {
  createTraceRecording,
  getComputedSpans,
  getComputedValues,
} from './recordingComputeUtils'
import {
  createMockSpanAndAnnotation,
  createTimestamp,
} from './testUtility/createMockFactory'
import type { CompleteTraceDefinition } from './types'

interface AnyRelation {
  global: {}
}

const baseDefinitionFixture: CompleteTraceDefinition<
  'global',
  AnyRelation,
  'origin'
> = {
  name: 'test-trace',
  relationSchemaName: 'global',
  relationSchema: { global: {} },
  requiredSpans: [() => true],
  computedSpanDefinitions: {},
  computedValueDefinitions: {},
  variants: {
    origin: { timeout: 45_000 },
  },
}

describe('recordingComputeUtils', () => {
  describe('error status propagation', () => {
    it('should mark trace as error if any non-suppressed span has error status', () => {
      const recording = createTraceRecording(
        {
          definition: baseDefinitionFixture,
          recordedItems: new Map([
            createMockSpanAndAnnotation(100, {
              status: 'error',
              name: 'error-span',
            }),
            createMockSpanAndAnnotation(200, { status: 'ok', name: 'ok-span' }),
          ]),
          input: {
            id: 'test',
            startTime: createTimestamp(0),
            relatedTo: {},
            variant: 'origin',
          },
          recordedItemsByLabel: {},
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

      expect(recording.status).toBe('error')
      expect(recording.additionalDurations.startTillInteractive).toBeNull()
      expect(recording.additionalDurations.completeTillInteractive).toBeNull()
      expect(recording.additionalDurations.startTillRequirementsMet).toBeNull()
    })

    it('should not mark trace as error if all error spans are suppressed', () => {
      const recording = createTraceRecording(
        {
          definition: {
            ...baseDefinitionFixture,
            suppressErrorStatusPropagationOnSpans: [
              ({ span }) => span.name === 'suppressed-error-span',
            ],
          },
          recordedItems: new Map([
            createMockSpanAndAnnotation(100, {
              status: 'error',
              name: 'suppressed-error-span',
            }),
            createMockSpanAndAnnotation(200, { status: 'ok', name: 'ok-span' }),
          ]),
          input: {
            id: 'test',
            startTime: createTimestamp(0),
            relatedTo: {},
            variant: 'origin',
          },
          recordedItemsByLabel: {},
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

      expect(recording.status).toBe('ok')
      expect(recording.additionalDurations.startTillInteractive).toBeNull()
    })

    it('should mark trace as error if any error span is not suppressed', () => {
      const recording = createTraceRecording(
        {
          definition: {
            ...baseDefinitionFixture,
            suppressErrorStatusPropagationOnSpans: [
              ({ span }) => span.name === 'suppressed-error-span',
            ],
          },
          recordedItems: new Map([
            createMockSpanAndAnnotation(100, {
              status: 'error',
              name: 'suppressed-error-span',
            }),
            createMockSpanAndAnnotation(200, {
              status: 'error',
              name: 'non-suppressed-error-span',
            }),
            createMockSpanAndAnnotation(300, { status: 'ok', name: 'ok-span' }),
          ]),
          input: {
            id: 'test',
            startTime: createTimestamp(0),
            relatedTo: {},
            variant: 'origin',
          },
          recordedItemsByLabel: {},
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

      expect(recording.status).toBe('error')
      expect(recording.additionalDurations.startTillInteractive).toBeNull()
    })

    it('should prioritize interrupted status over error status', () => {
      const recording = createTraceRecording(
        {
          definition: baseDefinitionFixture,
          recordedItems: new Map([
            createMockSpanAndAnnotation(100, {
              status: 'error',
              name: 'error-span',
            }),
          ]),
          input: {
            id: 'test',
            startTime: createTimestamp(0),
            relatedTo: {},
            variant: 'origin',
          },
          recordedItemsByLabel: {},
        },
        {
          transitionFromState: 'active',
          interruption: { reason: 'timeout' },
          transitionToState: 'interrupted',
          lastRelevantSpanAndAnnotation: undefined,
        },
      )

      expect(recording.status).toBe('interrupted')
      expect(recording.additionalDurations.startTillInteractive).toBeNull()
    })
  })

  describe('getComputedSpans', () => {
    const baseDefinition: CompleteTraceDefinition<
      'global',
      AnyRelation,
      'origin'
    > = {
      ...baseDefinitionFixture,
      computedSpanDefinitions: {
        'test-computed-span': {
          startSpan: ({ span }) => span.name === 'start-span',
          endSpan: ({ span }) => span.name === 'end-span',
        },
      },
    }

    it('should compute duration and startOffset correctly', () => {
      const result = getComputedSpans({
        definition: baseDefinition,
        recordedItems: new Map([
          createMockSpanAndAnnotation(100, {
            name: 'start-span',
            duration: 50,
          }),
          createMockSpanAndAnnotation(200, {
            name: 'end-span',
            duration: 50,
          }),
        ]),
        input: {
          id: 'test',
          startTime: createTimestamp(0),
          relatedTo: {},
          variant: 'origin',
        },
        recordedItemsByLabel: {},
      })

      expect(result['test-computed-span']).toEqual({
        duration: 150, // (200 + 50) - 100
        startOffset: 100,
      })
    })

    it('should handle operation-start and operation-end special matchers', () => {
      const definition: CompleteTraceDefinition<
        'global',
        AnyRelation,
        'origin'
      > = {
        ...baseDefinition,
        computedSpanDefinitions: {
          'operation-span': {
            startSpan: 'operation-start',
            endSpan: 'operation-end',
          },
        },
      }

      const markedCompleteSpan = createMockSpanAndAnnotation(200, {
        name: 'end-span',
      })
      markedCompleteSpan[1].annotation.markedComplete = true

      const result = getComputedSpans(
        {
          definition,
          recordedItems: new Map([
            createMockSpanAndAnnotation(100, { name: 'start-span' }),
            markedCompleteSpan,
          ]),
          input: {
            id: 'test',
            startTime: createTimestamp(0),
            // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
            relatedTo: {} as never,
            variant: 'origin',
          },
          recordedItemsByLabel: {},
        },
        { completeSpanAndAnnotation: markedCompleteSpan[1] },
      )

      expect(result['operation-span']).toBeDefined()
    })

    describe('matchingIndex', () => {
      it('should select the correct start span using a positive matchingIndex', () => {
        const definition: CompleteTraceDefinition<
          'global',
          AnyRelation,
          'origin'
        > = {
          ...baseDefinitionFixture,
          computedSpanDefinitions: {
            'test-computed-span': {
              startSpan: fromDefinition({
                name: 'start-span',
                matchingIndex: 1, // starts at 0th index
              }),
              endSpan: fromDefinition({ name: 'end-span' }),
            },
          },
        }
        const result = getComputedSpans({
          definition,
          recordedItems: new Map([
            createMockSpanAndAnnotation(100, { name: 'start-span' }),
            createMockSpanAndAnnotation(300, { name: 'start-span' }), // matching start span
            createMockSpanAndAnnotation(400, { name: 'start-span' }),
            createMockSpanAndAnnotation(500, {
              name: 'end-span',
              duration: 50,
            }),
          ]),
          input: {
            id: 'test',
            startTime: createTimestamp(0),
            relatedTo: {},
            variant: 'origin',
          },
          recordedItemsByLabel: {},
        })
        expect(result['test-computed-span']).toEqual({
          duration: 250, // (500 + 50) - 300
          startOffset: 300, // should use the second start-span
        })
      })

      it('should select the correct start span using a negative matchingIndex', () => {
        const definition: CompleteTraceDefinition<
          'global',
          AnyRelation,
          'origin'
        > = {
          ...baseDefinitionFixture,
          computedSpanDefinitions: {
            'test-computed-span': {
              startSpan: fromDefinition({
                name: 'start-span',
                matchingIndex: -3,
              }),
              endSpan: fromDefinition({ name: 'end-span' }),
            },
          },
        }
        const result = getComputedSpans({
          definition,
          recordedItems: new Map([
            createMockSpanAndAnnotation(100, { name: 'start-span' }), // starting span
            createMockSpanAndAnnotation(200, { name: 'start-span' }),
            createMockSpanAndAnnotation(300, { name: 'start-span' }),
            createMockSpanAndAnnotation(500, {
              name: 'end-span',
              duration: 50,
            }),
          ]),
          input: {
            id: 'test',
            startTime: createTimestamp(0),
            relatedTo: {},
            variant: 'origin',
          },
          recordedItemsByLabel: {},
        })
        expect(result['test-computed-span']).toEqual({
          duration: 450, // (500 + 50) - 100
          startOffset: 100,
        })
      })

      it('should select the correct end span using a positive matchingIndex', () => {
        const definition: CompleteTraceDefinition<
          'global',
          AnyRelation,
          'origin'
        > = {
          ...baseDefinitionFixture,
          computedSpanDefinitions: {
            'test-computed-span': {
              startSpan: fromDefinition({ name: 'start-span' }),
              endSpan: fromDefinition({
                name: 'end-span',
                matchingIndex: 2,
              }),
            },
          },
        }
        const result = getComputedSpans({
          definition,
          recordedItems: new Map([
            createMockSpanAndAnnotation(100, { name: 'start-span' }),
            createMockSpanAndAnnotation(150, { name: 'span' }),
            createMockSpanAndAnnotation(200, {
              name: 'end-span',
              duration: 50,
            }),
            createMockSpanAndAnnotation(400, {
              name: 'end-span',
              duration: 50,
            }),
            createMockSpanAndAnnotation(600, {
              // matching span
              name: 'end-span',
              duration: 50,
            }),
            createMockSpanAndAnnotation(700, {
              name: 'end-span',
              duration: 50,
            }),
          ]),
          input: {
            id: 'test',
            startTime: createTimestamp(0),
            relatedTo: {},
            variant: 'origin',
          },
          recordedItemsByLabel: {},
        })
        expect(result['test-computed-span']).toEqual({
          duration: 550, // (600 + 50) - 100
          startOffset: 100,
        })
      })

      it('should select the correct end span using a negative matchingIndex', () => {
        const definition: CompleteTraceDefinition<
          'global',
          AnyRelation,
          'origin'
        > = {
          ...baseDefinitionFixture,
          computedSpanDefinitions: {
            'test-computed-span': {
              startSpan: fromDefinition({ name: 'start-span' }),
              endSpan: fromDefinition({
                name: 'end-span',
                matchingIndex: -1,
              }),
            },
          },
        }
        const result = getComputedSpans({
          definition,
          recordedItems: new Map([
            createMockSpanAndAnnotation(100, { name: 'start-span' }),
            createMockSpanAndAnnotation(200, {
              name: 'end-span',
              duration: 50,
            }),
            createMockSpanAndAnnotation(400, {
              name: 'end-span',
              duration: 50,
            }),
            createMockSpanAndAnnotation(600, {
              name: 'end-span',
              duration: 50,
            }),
            createMockSpanAndAnnotation(700, {
              // matching span
              name: 'end-span',
              duration: 50,
            }),
          ]),
          input: {
            id: 'test',
            startTime: createTimestamp(0),
            relatedTo: {},
            variant: 'origin',
          },
          recordedItemsByLabel: {},
        })
        expect(result['test-computed-span']).toEqual({
          duration: 650, // (700 + 50) - 100
          startOffset: 100,
        })
      })

      it('should not return any computed spans using a invalid matchingIndex', () => {
        const definition: CompleteTraceDefinition<
          'global',
          AnyRelation,
          'origin'
        > = {
          ...baseDefinitionFixture,
          computedSpanDefinitions: {
            'test-computed-span': {
              startSpan: fromDefinition({ name: 'start-span' }),
              endSpan: fromDefinition({
                name: 'end-span',
                matchingIndex: -100,
              }),
            },
          },
        }
        const result = getComputedSpans({
          definition,
          recordedItems: new Map([
            createMockSpanAndAnnotation(100, { name: 'start-span' }),
            createMockSpanAndAnnotation(200, {
              name: 'end-span',
              duration: 50,
            }),
            createMockSpanAndAnnotation(400, {
              // matching span
              name: 'end-span',
              duration: 50,
            }),
            createMockSpanAndAnnotation(600, {
              name: 'end-span',
              duration: 50,
            }),
            createMockSpanAndAnnotation(700, {
              name: 'end-span',
              duration: 50,
            }),
          ]),
          input: {
            id: 'test',
            startTime: createTimestamp(0),
            relatedTo: {},
            variant: 'origin',
          },
          recordedItemsByLabel: {},
        })
        expect(result).toEqual({})
      })

      it('should work with span definition objects containing matchingIndex', () => {
        const definition: CompleteTraceDefinition<
          'global',
          AnyRelation,
          'origin'
        > = {
          ...baseDefinitionFixture,
          computedSpanDefinitions: {
            'test-computed-span': {
              startSpan: fromDefinition({
                name: 'start-span',
                matchingIndex: 1,
              }),
              endSpan: fromDefinition({ name: 'end-span', matchingIndex: -1 }),
            },
          },
        }
        const result = getComputedSpans({
          definition,
          recordedItems: new Map([
            createMockSpanAndAnnotation(100, { name: 'start-span' }),
            createMockSpanAndAnnotation(200, { name: 'start-span' }),
            createMockSpanAndAnnotation(300, { name: 'start-span' }),
            createMockSpanAndAnnotation(400, {
              name: 'end-span',
              duration: 50,
            }),
            createMockSpanAndAnnotation(500, {
              name: 'end-span',
              duration: 50,
            }),
            createMockSpanAndAnnotation(600, {
              name: 'end-span',
              duration: 50,
            }),
          ]),
          input: {
            id: 'test',
            startTime: createTimestamp(0),
            relatedTo: {},
            variant: 'origin',
          },
          recordedItemsByLabel: {},
        })
        expect(result['test-computed-span']).toEqual({
          duration: 450, // (600 + 50) - 200
          startOffset: 200, // should use second start-span
        })
      })
    })
  })

  describe('getComputedValues', () => {
    const baseDefinition: CompleteTraceDefinition<
      'global',
      AnyRelation,
      'origin'
    > = {
      ...baseDefinitionFixture,
      computedValueDefinitions: {
        'error-count': {
          matches: [({ span }) => span.status === 'error'],
          computeValueFromMatches: (matches) => matches.length,
        },
      },
    }

    it('should compute values based on matching spans', () => {
      const result = getComputedValues({
        definition: baseDefinition,
        recordedItems: new Map([
          createMockSpanAndAnnotation(100, { status: 'error' }),
          createMockSpanAndAnnotation(200, { status: 'error' }),
          createMockSpanAndAnnotation(300, { status: 'ok' }),
        ]),
        input: {
          id: 'test',
          startTime: createTimestamp(0),
          // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
          relatedTo: {} as never,
          variant: 'origin',
        },
        recordedItemsByLabel: {},
      })

      expect(result['error-count']).toBe(2)
    })

    it('should handle multiple matches in computeValueFromMatches', () => {
      const definition: CompleteTraceDefinition<
        'global',
        AnyRelation,
        'origin'
      > = {
        ...baseDefinition,
        computedValueDefinitions: {
          'status-counts': {
            matches: [
              ({ span }) => span.status === 'error',
              ({ span }) => span.status === 'ok',
            ],
            computeValueFromMatches: (errors, oks) =>
              errors.length + oks.length,
          },
        },
      }

      const result = getComputedValues({
        definition,
        recordedItems: new Map([
          createMockSpanAndAnnotation(100, { status: 'error' }),
          createMockSpanAndAnnotation(200, { status: 'ok' }),
          createMockSpanAndAnnotation(300, { status: 'error' }),
        ]),
        input: {
          id: 'test',
          startTime: createTimestamp(0),
          // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
          relatedTo: {} as never,
          variant: 'origin',
        },
        recordedItemsByLabel: {},
      })

      expect(result['status-counts']).toEqual(3)
    })
  })

  describe('getSpanSummaryAttributes', () => {
    it('should merge attributes from spans with the same name', () => {
      const result = getSpanSummaryAttributes([
        createMockSpanAndAnnotation(100, {
          name: 'test-span',
          attributes: { first: true },
        })[1],
        createMockSpanAndAnnotation(200, {
          name: 'test-span',
          attributes: { second: true },
        })[1],
      ])

      expect(result['test-span']).toEqual({
        first: true,
        second: true,
      })
    })
  })

  describe('computedRenderBeaconSpans', () => {
    it('should compute render beacon metrics correctly', () => {
      const recording = createTraceRecording(
        {
          definition: baseDefinitionFixture,
          recordedItems: new Map([
            createMockSpanAndAnnotation(100, {
              name: 'test-component',
              type: 'component-render',
              relatedTo: {},
              duration: 50,
              isIdle: true,
              renderCount: 1,
              renderedOutput: 'loading',
            }),
            createMockSpanAndAnnotation(
              200,
              {
                name: 'test-component',
                type: 'component-render',
                relatedTo: {},
                duration: 50,
                isIdle: true,
                renderCount: 2,
                renderedOutput: 'content',
              },
              { occurrence: 2 },
            ),
          ]),
          input: {
            id: 'test',
            startTime: createTimestamp(0),
            relatedTo: {},
            variant: 'origin',
          },
          recordedItemsByLabel: {},
        },
        {
          transitionFromState: 'active',
          transitionToState: 'complete',
          lastRelevantSpanAndAnnotation: undefined,
          completeSpanAndAnnotation: undefined,
          cpuIdleSpanAndAnnotation: undefined,
          lastRequiredSpanAndAnnotation: undefined,
        },
      )

      expect(recording.computedRenderBeaconSpans['test-component']).toEqual({
        startOffset: 100,
        firstRenderTillContent: 150,
        firstRenderTillLoading: 50,
        firstRenderTillData: 100,
        renderCount: 2,
        sumOfRenderDurations: 100,
      })
    })
  })

  describe('variant property', () => {
    it('should include the variant in the recording', () => {
      const recording = createTraceRecording(
        {
          definition: baseDefinitionFixture,
          recordedItems: new Map([
            createMockSpanAndAnnotation(100, {
              status: 'ok',
              name: 'test-span',
            }),
          ]),
          input: {
            id: 'test',
            startTime: createTimestamp(0),
            relatedTo: {},
            variant: 'origin',
          },
          recordedItemsByLabel: {},
        },
        {
          transitionFromState: 'active',
          transitionToState: 'complete',
          lastRelevantSpanAndAnnotation: undefined,
          completeSpanAndAnnotation: undefined,
          cpuIdleSpanAndAnnotation: undefined,
          lastRequiredSpanAndAnnotation: undefined,
        },
      )

      // Verify the variant is included in the recording
      expect(recording.variant).toBe('origin')
    })
  })

  describe('promoteSpanAttributesForTrace and attribute promotion', () => {
    const promotedAttributesTraceDefinition = {
      ...baseDefinitionFixture,
      promoteSpanAttributes: [
        {
          span: { name: 'foo-span' },
          attributes: ['foo', 'bar'],
        },
        {
          span: { name: 'baz-span' },
          attributes: ['baz'],
        },
      ],
    }

    it('should promote specified attributes from last matching spans to trace', () => {
      const recording = createTraceRecording(
        {
          definition: promotedAttributesTraceDefinition,
          recordedItems: new Map([
            createMockSpanAndAnnotation(100, {
              name: 'foo-span',
              attributes: { foo: 1, bar: 2, unused: 42 },
            }),
            createMockSpanAndAnnotation(200, {
              name: 'foo-span',
              attributes: { foo: 7, bar: 8 },
            }),
            createMockSpanAndAnnotation(300, {
              name: 'baz-span',
              attributes: { baz: 'hello' },
            }),
          ]),
          input: {
            id: 'test',
            startTime: createTimestamp(0),
            relatedTo: {},
            variant: 'origin',
          },
          recordedItemsByLabel: {},
        },
        {
          transitionFromState: 'active',
          transitionToState: 'complete',
          lastRelevantSpanAndAnnotation: undefined,
          completeSpanAndAnnotation: undefined,
          cpuIdleSpanAndAnnotation: undefined,
          lastRequiredSpanAndAnnotation: undefined,
        },
      )
      // Should select last foo-span (timestamp 200) for foo/bar, and baz-span for baz
      expect(recording.attributes.foo).toBe(7)
      expect(recording.attributes.bar).toBe(8)
      expect(recording.attributes.baz).toBe('hello')
      expect('unused' in recording.attributes).toBe(false)
    })

    it('should promote specified attributes from last matching spans when there is an attribute name collision to trace', () => {
      const promotedAttributesTraceDefinitionWithOverrideAttributeNames = {
        ...baseDefinitionFixture,
        promoteSpanAttributes: [
          {
            span: { name: 'foo-span' },
            attributes: ['foo', 'bar'],
          },
          {
            span: { name: 'baz-span' },
            attributes: ['foo', 'bar'],
          },
        ],
      }

      const recording = createTraceRecording(
        {
          definition:
            promotedAttributesTraceDefinitionWithOverrideAttributeNames,
          recordedItems: new Map([
            createMockSpanAndAnnotation(200, {
              name: 'foo-span',
              attributes: { foo: 7, bar: 8 },
            }),
            createMockSpanAndAnnotation(300, {
              name: 'baz-span',
              // should replace the trace attributes from 'foo-span'
              attributes: { foo: 'hello', bar: 'world' },
            }),
          ]),
          input: {
            id: 'test',
            startTime: createTimestamp(0),
            relatedTo: {},
            variant: 'origin',
          },
          recordedItemsByLabel: {},
        },
        {
          transitionFromState: 'active',
          transitionToState: 'complete',
          lastRelevantSpanAndAnnotation: undefined,
          completeSpanAndAnnotation: undefined,
          cpuIdleSpanAndAnnotation: undefined,
          lastRequiredSpanAndAnnotation: undefined,
        },
      )
      // Should select attributes from baz-span (timestamp 300)
      expect(recording.attributes.foo).toBe('hello')
      expect(recording.attributes.bar).toBe('world')
      expect('unused' in recording.attributes).toBe(false)
    })

    it('should not set unset promoted attributes if not found', () => {
      const partialAttrDefinition = {
        ...baseDefinitionFixture,
        promoteSpanAttributes: [
          {
            span: { name: 'foo-span' },
            attributes: ['foo', 'bar'],
          },
          {
            span: { name: 'no-match' },
            attributes: ['baz', 'shouldNotBeSet'],
          },
        ],
      }
      const recording = createTraceRecording(
        {
          definition: partialAttrDefinition,
          recordedItems: new Map([
            createMockSpanAndAnnotation(111, {
              name: 'foo-span',
              attributes: { foo: 99 },
            }),
          ]),
          input: {
            id: 'test',
            startTime: createTimestamp(0),
            relatedTo: {},
            variant: 'origin',
          },
          recordedItemsByLabel: {},
        },
        {
          transitionFromState: 'active',
          transitionToState: 'complete',
          lastRelevantSpanAndAnnotation: undefined,
          completeSpanAndAnnotation: undefined,
          cpuIdleSpanAndAnnotation: undefined,
          lastRequiredSpanAndAnnotation: undefined,
        },
      )
      expect(recording.attributes.foo).toBe(99)
      expect('bar' in recording.attributes).toBe(false)
      expect('baz' in recording.attributes).toBe(false)
      expect('shouldNotBeSet' in recording.attributes).toBe(false)
    })

    it('should allow attribute promotion on interruption', () => {
      const recording = createTraceRecording(
        {
          definition: promotedAttributesTraceDefinition,
          recordedItems: new Map([
            createMockSpanAndAnnotation(100, {
              name: 'foo-span',
              attributes: { foo: 'z' },
            }),
            createMockSpanAndAnnotation(200, {
              name: 'baz-span',
              attributes: { baz: 10 },
            }),
          ]),
          input: {
            id: 'test',
            startTime: createTimestamp(0),
            relatedTo: {},
            variant: 'origin',
          },
          recordedItemsByLabel: {},
        },
        {
          transitionFromState: 'active',
          transitionToState: 'interrupted',
          interruption: { reason: 'timeout' },
          lastRelevantSpanAndAnnotation: undefined,
        },
      )
      expect(recording.attributes.foo).toBe('z')
      expect(recording.attributes.baz).toBe(10)
    })

    it('should allow original trace attributes to take precedence over promoted', () => {
      const definition = {
        ...promotedAttributesTraceDefinition,
      }

      const recording = createTraceRecording(
        {
          definition,
          recordedItems: new Map([
            createMockSpanAndAnnotation(100, {
              name: 'foo-span',
              attributes: { foo: 'notUsed' },
            }),
            createMockSpanAndAnnotation(200, {
              name: 'baz-span',
              attributes: { baz: 111 },
            }),
          ]),
          input: {
            id: 'test',
            startTime: createTimestamp(0),
            relatedTo: {},
            variant: 'origin',
            attributes: { foo: 'owned', baz: 'shouldWin' },
          },
          recordedItemsByLabel: {},
        },
        {
          transitionFromState: 'active',
          transitionToState: 'complete',
          lastRelevantSpanAndAnnotation: undefined,
          completeSpanAndAnnotation: undefined,
          cpuIdleSpanAndAnnotation: undefined,
          lastRequiredSpanAndAnnotation: undefined,
        },
      )
      expect(recording.attributes.foo).toBe('owned')
      expect(recording.attributes.baz).toBe('shouldWin')
    })
  })
})
