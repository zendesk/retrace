import { describe, expect, it } from 'vitest'
import traceFixture from './__fixtures__/trace-flon2op03qt-ticket.activated.json'
import { mapOperationForVisualizationHierarchical } from './mapOperationForVisualization'
import type { RecordingInputFile } from './types'
import { flattenHierarchicalSpans } from './utils/buildSpanHierarchy'

describe('Phase 1.3 Hierarchical Integration', () => {
  it('should create hierarchical operation from trace data', () => {
    const hierarchicalOperation = mapOperationForVisualizationHierarchical(
      traceFixture as RecordingInputFile,
    )

    expect(hierarchicalOperation).not.toBeNull()
    expect(hierarchicalOperation).toHaveProperty('expandedSpanIds')
    expect(hierarchicalOperation!.expandedSpanIds).toBeInstanceOf(Set)
    expect(hierarchicalOperation!.spans).toBeInstanceOf(Array)

    // Verify that spans have hierarchical properties
    if (hierarchicalOperation!.spans.length > 0) {
      const firstSpan = hierarchicalOperation!.spans[0]
      expect(firstSpan).toHaveProperty('children')
      expect(firstSpan).toHaveProperty('isExpanded')
      expect(firstSpan).toHaveProperty('depth')
      expect(firstSpan!.children).toBeInstanceOf(Array)
      expect(typeof firstSpan!.isExpanded).toBe('boolean')
      expect(typeof firstSpan!.depth).toBe('number')
    }
  })

  it('should flatten hierarchical spans correctly with no expansion', () => {
    const hierarchicalOperation = mapOperationForVisualizationHierarchical(
      traceFixture as RecordingInputFile,
    )

    expect(hierarchicalOperation).not.toBeNull()

    // With no expanded spans, should only show root level spans
    const flattenedSpans = flattenHierarchicalSpans(
      hierarchicalOperation!.spans,
      new Set(),
    )

    // All flattened spans should have depth 0 (root level)
    flattenedSpans.forEach((span) => {
      expect(span.depth).toBe(0)
    })
  })

  it('should expand children when parent is expanded', () => {
    const hierarchicalOperation = mapOperationForVisualizationHierarchical(
      traceFixture as RecordingInputFile,
    )

    expect(hierarchicalOperation).not.toBeNull()

    // Find a span with children
    const spanWithChildren = hierarchicalOperation!.spans.find(
      (span) => span.children.length > 0,
    )

    if (spanWithChildren) {
      // Expand this span
      const expandedIds = new Set([spanWithChildren.span.id])
      const flattenedSpans = flattenHierarchicalSpans(
        hierarchicalOperation!.spans,
        expandedIds,
      )

      // Should include the parent and its children
      const parentSpan = flattenedSpans.find(
        (s) => s.span.id === spanWithChildren.span.id,
      )
      const childSpans = flattenedSpans.filter((s) => s.depth === 1)

      expect(parentSpan).toBeDefined()
      expect(childSpans.length).toBeGreaterThan(0)

      // Verify child spans have correct depth
      childSpans.forEach((child) => {
        expect(child.depth).toBe(1)
      })
    }
  })
})
