import { assert, describe, expect, it } from 'vitest'
import traceFixture from '../__fixtures__/trace-flon2op03qt-ticket.activated.json'
import { mapOperationForVisualization } from '../mapOperationForVisualization'
import type { MappedSpanAndAnnotation, RecordingInputFile } from '../types'
import {
  buildSpanHierarchy,
  flattenHierarchicalSpans,
  getDescendantSpanIds,
  validateSpanHierarchy,
} from './buildSpanHierarchy'

// Mock span data for testing
const createMockSpan = (
  id: string,
  parentSpanId?: string,
  startTime: number = 0,
  duration: number = 100,
): MappedSpanAndAnnotation => ({
  span: {
    id,
    type: 'measure',
    name: `span-${id}`,
    startTime: { now: startTime },
    duration,
    attributes: {},
    parentSpanId,
  },
  annotation: {
    id: `annotation-${id}`,
    occurrence: 1,
    operationRelativeStartTime: startTime,
    operationRelativeEndTime: startTime + duration,
  },
  groupName: `group-${id}`,
  type: 'measure',
})

describe('buildSpanHierarchy', () => {
  it('should build a simple parent-child hierarchy', () => {
    const spans: MappedSpanAndAnnotation[] = [
      createMockSpan('parent'),
      createMockSpan('child1', 'parent'),
      createMockSpan('child2', 'parent'),
    ]

    const result = buildSpanHierarchy(spans)

    expect(result).toHaveLength(1)
    assert(result[0])
    expect(result[0].span.id).toBe('parent')
    expect(result[0].children).toHaveLength(2)
    assert(result[0].children[0])
    assert(result[0].children[1])
    expect(result[0].children[0].span.id).toBe('child1')
    expect(result[0].children[1].span.id).toBe('child2')
    expect(result[0].depth).toBe(0)
    expect(result[0].children[0].depth).toBe(1)
    expect(result[0].children[1].depth).toBe(1)
  })

  it('should handle nested hierarchies', () => {
    const spans: MappedSpanAndAnnotation[] = [
      createMockSpan('root'),
      createMockSpan('level1', 'root'),
      createMockSpan('level2', 'level1'),
      createMockSpan('level3', 'level2'),
    ]

    const result = buildSpanHierarchy(spans)

    expect(result).toHaveLength(1)
    expect(result[0]?.span.id).toBe('root')
    expect(result[0]?.depth).toBe(0)
    expect(result[0]?.children[0]?.span.id).toBe('level1')
    expect(result[0]?.children[0]?.depth).toBe(1)
    expect(result[0]?.children[0]?.children[0]?.span.id).toBe('level2')
    expect(result[0]?.children[0]?.children[0]?.depth).toBe(2)
    expect(result[0]?.children[0]?.children[0]?.children[0]?.span.id).toBe(
      'level3',
    )
    expect(result[0]?.children[0]?.children[0]?.children[0]?.depth).toBe(3)
  })

  it('should handle multiple root spans', () => {
    const spans: MappedSpanAndAnnotation[] = [
      createMockSpan('root1'),
      createMockSpan('root2'),
      createMockSpan('child1', 'root1'),
      createMockSpan('child2', 'root2'),
    ]

    const result = buildSpanHierarchy(spans)

    expect(result).toHaveLength(2)
    expect(result[0]?.span.id).toBe('root1')
    expect(result[1]?.span.id).toBe('root2')
    expect(result[0]?.children).toHaveLength(1)
    expect(result[1]?.children).toHaveLength(1)
    expect(result[0]?.children[0]?.span.id).toBe('child1')
    expect(result[1]?.children[0]?.span.id).toBe('child2')
  })

  it('should handle orphaned spans by adding them as roots', () => {
    const spans: MappedSpanAndAnnotation[] = [
      createMockSpan('orphan', 'non-existent-parent'),
      createMockSpan('root'),
    ]

    const result = buildSpanHierarchy(spans)

    expect(result).toHaveLength(2)
    // Should include both the root span and the orphaned span
    const spanIds = result.map((s) => s.span.id).sort()
    expect(spanIds).toEqual(['orphan', 'root'])
  })

  it('should sort children by start time', () => {
    const spans: MappedSpanAndAnnotation[] = [
      createMockSpan('parent'),
      createMockSpan('child-late', 'parent', 200),
      createMockSpan('child-early', 'parent', 100),
      createMockSpan('child-middle', 'parent', 150),
    ]

    const result = buildSpanHierarchy(spans)
    assert(result[0])
    expect(result[0].children).toHaveLength(3)
    expect(result[0].children[0]?.span.id).toBe('child-early')
    expect(result[0].children[1]?.span.id).toBe('child-middle')
    expect(result[0].children[2]?.span.id).toBe('child-late')
  })

  it('should set isExpanded to false by default', () => {
    const spans: MappedSpanAndAnnotation[] = [
      createMockSpan('parent'),
      createMockSpan('child', 'parent'),
    ]

    const result = buildSpanHierarchy(spans)

    expect(result[0]?.isExpanded).toBe(false)
    expect(result[0]?.children[0]?.isExpanded).toBe(false)
  })
})

describe('flattenHierarchicalSpans', () => {
  it('should flatten expanded spans only', () => {
    const spans: MappedSpanAndAnnotation[] = [
      createMockSpan('parent'),
      createMockSpan('child1', 'parent'),
      createMockSpan('grandchild', 'child1'),
      createMockSpan('child2', 'parent'),
    ]

    const hierarchical = buildSpanHierarchy(spans)
    const expandedSpanIds = new Set(['parent']) // Only parent is expanded

    const result = flattenHierarchicalSpans(hierarchical, expandedSpanIds)

    expect(result).toHaveLength(3) // parent + 2 children, but not grandchild
    expect(result[0]?.span.id).toBe('parent')
    expect(result[1]?.span.id).toBe('child1')
    expect(result[2]?.span.id).toBe('child2')
  })

  it('should include deeply nested spans when all parents are expanded', () => {
    const spans: MappedSpanAndAnnotation[] = [
      createMockSpan('parent'),
      createMockSpan('child', 'parent'),
      createMockSpan('grandchild', 'child'),
    ]

    const hierarchical = buildSpanHierarchy(spans)
    const expandedSpanIds = new Set(['parent', 'child']) // Both levels expanded

    const result = flattenHierarchicalSpans(hierarchical, expandedSpanIds)

    expect(result).toHaveLength(3)
    expect(result[0]?.span.id).toBe('parent')
    expect(result[1]?.span.id).toBe('child')
    expect(result[2]?.span.id).toBe('grandchild')
  })

  it('should only show roots when nothing is expanded', () => {
    const spans: MappedSpanAndAnnotation[] = [
      createMockSpan('root1'),
      createMockSpan('root2'),
      createMockSpan('child1', 'root1'),
      createMockSpan('child2', 'root2'),
    ]

    const hierarchical = buildSpanHierarchy(spans)
    const expandedSpanIds = new Set<string>() // Nothing expanded

    const result = flattenHierarchicalSpans(hierarchical, expandedSpanIds)

    expect(result).toHaveLength(2)
    expect(result[0]?.span.id).toBe('root1')
    expect(result[1]?.span.id).toBe('root2')
  })
})

describe('validateSpanHierarchy', () => {
  it('should validate a correct hierarchy', () => {
    const spans: MappedSpanAndAnnotation[] = [
      createMockSpan('parent'),
      createMockSpan('child', 'parent'),
    ]

    const result = validateSpanHierarchy(spans)

    expect(result.isValid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('should detect circular references', () => {
    const spans: MappedSpanAndAnnotation[] = [
      createMockSpan('a', 'b'),
      createMockSpan('b', 'a'), // Circular reference
    ]

    const result = validateSpanHierarchy(spans)

    expect(result.isValid).toBe(false)
    expect(
      result.errors.some((error) => error.includes('Circular reference')),
    ).toBe(true)
  })

  it('should detect invalid parent references', () => {
    const spans: MappedSpanAndAnnotation[] = [
      createMockSpan('child', 'non-existent-parent'),
    ]

    const result = validateSpanHierarchy(spans)

    expect(result.isValid).toBe(true)
    expect(result.missingParentIds.includes('non-existent-parent')).toBe(true)
  })

  it('should handle self-referencing spans', () => {
    const spans: MappedSpanAndAnnotation[] = [
      createMockSpan('self', 'self'), // Self-reference
    ]

    const result = validateSpanHierarchy(spans)

    expect(result.isValid).toBe(false)
    expect(
      result.errors.some((error) => error.includes('Circular reference')),
    ).toBe(true)
  })
})

describe('getDescendantSpanIds', () => {
  it('should return all descendant IDs', () => {
    const spans: MappedSpanAndAnnotation[] = [
      createMockSpan('root'),
      createMockSpan('child1', 'root'),
      createMockSpan('child2', 'root'),
      createMockSpan('grandchild', 'child1'),
    ]

    const hierarchical = buildSpanHierarchy(spans)
    const result = getDescendantSpanIds(hierarchical[0]!)

    expect(result).toEqual(['child1', 'grandchild', 'child2'])
  })

  it('should return empty array for leaf spans', () => {
    const spans: MappedSpanAndAnnotation[] = [createMockSpan('leaf')]

    const hierarchical = buildSpanHierarchy(spans)
    const result = getDescendantSpanIds(hierarchical[0]!)

    expect(result).toEqual([])
  })

  it('should handle deeply nested hierarchies', () => {
    const spans: MappedSpanAndAnnotation[] = [
      createMockSpan('root'),
      createMockSpan('level1', 'root'),
      createMockSpan('level2', 'level1'),
      createMockSpan('level3', 'level2'),
    ]

    const hierarchical = buildSpanHierarchy(spans)
    const result = getDescendantSpanIds(hierarchical[0]!)

    expect(result).toEqual(['level1', 'level2', 'level3'])
  })
})

describe('buildSpanHierarchy with real trace data', () => {
  it('should build hierarchy for fixture trace data', () => {
    const mappedOperation = mapOperationForVisualization(
      traceFixture as RecordingInputFile,
    )
    expect(mappedOperation).not.toBeNull()

    if (!mappedOperation) return

    const hierarchicalSpans = buildSpanHierarchy(mappedOperation.spans)

    // Take a snapshot of the hierarchy structure
    const hierarchySnapshot = hierarchicalSpans.map((span) => ({
      spanId: span.span.id,
      name: span.span.name,
      type: span.type,
      depth: span.depth,
      parentId: span.parentId,
      childrenCount: span.children.length,
      children: span.children.map((child) => ({
        spanId: child.span.id,
        name: child.span.name,
        type: child.type,
        depth: child.depth,
        parentId: child.parentId,
        childrenCount: child.children.length,
      })),
    }))

    expect(hierarchySnapshot).toMatchSnapshot()
  })

  it('should validate hierarchy for fixture trace data', () => {
    const mappedOperation = mapOperationForVisualization(
      traceFixture as RecordingInputFile,
    )
    expect(mappedOperation).not.toBeNull()

    if (!mappedOperation) return

    const validation = validateSpanHierarchy(mappedOperation.spans)

    // Should be valid or have specific expected errors
    if (!validation.isValid) {
      expect(validation.errors).toMatchSnapshot()
    } else {
      expect(validation.isValid).toBe(true)
      expect(validation.errors).toHaveLength(0)
    }
  })
})
