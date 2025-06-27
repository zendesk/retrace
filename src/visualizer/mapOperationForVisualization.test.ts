import { describe, expect, it } from 'vitest'
import traceFixture from './__fixtures__/trace-flon2op03qt-ticket.activated.json'
import { mapOperationForVisualizationHierarchical } from './mapOperationForVisualization'
import type { RecordingInputFile } from './types'

describe('mapOperationForVisualizationHierarchical', () => {
  it('should process the fixture trace data', () => {
    const result = mapOperationForVisualizationHierarchical(
      traceFixture as RecordingInputFile,
    )

    expect(result).not.toBeNull()
    expect(result?.name).toBeDefined()
    expect(result?.spans).toBeInstanceOf(Array)
    expect(result?.expandedSpanIds).toBeInstanceOf(Set)
  })

  it('should create hierarchical spans with proper structure', () => {
    const result = mapOperationForVisualizationHierarchical(
      traceFixture as RecordingInputFile,
    )

    expect(result).not.toBeNull()

    // Check that spans have hierarchical properties
    if (result && result.spans.length > 0) {
      const firstSpan = result.spans[0]
      expect(firstSpan).toBeDefined()
      if (firstSpan) {
        expect(firstSpan).toHaveProperty('children')
        expect(firstSpan).toHaveProperty('isExpanded')
        expect(firstSpan).toHaveProperty('depth')
        expect(firstSpan).toHaveProperty('parentId')
        expect(Array.isArray(firstSpan.children)).toBe(true)
        expect(typeof firstSpan.isExpanded).toBe('boolean')
        expect(typeof firstSpan.depth).toBe('number')
      }
    }
  })

  it('should handle spans with parent-child relationships', () => {
    const result = mapOperationForVisualizationHierarchical(
      traceFixture as RecordingInputFile,
    )

    expect(result).not.toBeNull()

    if (result) {
      // Find spans that have children
      const spansWithChildren = result.spans.filter(
        (span) => span.children.length > 0,
      )

      if (spansWithChildren.length > 0) {
        const parentSpan = spansWithChildren[0]!
        expect(parentSpan.children.length).toBeGreaterThan(0)

        // Check that children have correct parent references
        for (const child of parentSpan.children) {
          expect(child.parentId).toBe(parentSpan.span.id)
          expect(child.depth).toBe(parentSpan.depth + 1)
        }
      }
    }
  })

  it('should maintain the same data as the flat version', () => {
    const result = mapOperationForVisualizationHierarchical(
      traceFixture as RecordingInputFile,
    )

    expect(result).not.toBeNull()

    if (result) {
      // Should have the same basic structure
      expect(result.name).toBeDefined()
      expect(result.duration).toBeGreaterThan(0)
      expect(result.spanTypes).toBeInstanceOf(Set)
      expect(result.uniqueGroups).toBeInstanceOf(Array)

      // Should have an expansion state
      expect(result.expandedSpanIds).toBeInstanceOf(Set)
      expect(result.expandedSpanIds.size).toBe(0) // Default to no expansions
    }
  })

  it('should handle filtering options', () => {
    const resultWithResources = mapOperationForVisualizationHierarchical(
      traceFixture as RecordingInputFile,
      { displayResources: true },
    )

    const resultWithoutResources = mapOperationForVisualizationHierarchical(
      traceFixture as RecordingInputFile,
      { displayResources: false },
    )

    expect(resultWithResources).not.toBeNull()
    expect(resultWithoutResources).not.toBeNull()

    if (resultWithResources && resultWithoutResources) {
      // Should have different numbers of spans based on filtering
      const resourceSpansWithFilter = resultWithResources.spans.filter(
        (span) => span.type === 'resource',
      )
      const resourceSpansWithoutFilter = resultWithoutResources.spans.filter(
        (span) => span.type === 'resource',
      )

      if (resourceSpansWithFilter.length > 0) {
        expect(resourceSpansWithoutFilter.length).toBe(0)
      }
    }
  })
})
