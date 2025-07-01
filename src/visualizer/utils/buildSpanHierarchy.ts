import type {
  HierarchicalSpanAndAnnotation,
  MappedSpanAndAnnotation,
} from '../types'

/**
 * Builds a hierarchical tree structure from flat spans using parentSpanId relationships
 */
export function buildSpanHierarchy(
  spans: MappedSpanAndAnnotation[],
): HierarchicalSpanAndAnnotation[] {
  // Create a map for quick lookup by span id
  const spanMap = new Map<string, HierarchicalSpanAndAnnotation>()
  const rootSpans: HierarchicalSpanAndAnnotation[] = []
  const orphanedSpans: HierarchicalSpanAndAnnotation[] = []

  // First pass: Convert all spans to hierarchical format and build lookup map
  for (const span of spans) {
    const hierarchicalSpan: HierarchicalSpanAndAnnotation = {
      ...span,
      children: [],
      isExpanded: false, // Default to collapsed
      depth: 0, // Will be calculated later
      parentId: span.span.parentSpanId,
    }
    spanMap.set(span.span.id, hierarchicalSpan)
  }

  // Second pass: Build parent-child relationships
  for (const span of spanMap.values()) {
    if (span.parentId && spanMap.has(span.parentId)) {
      // This span has a valid parent
      const parent = spanMap.get(span.parentId)!
      parent.children.push(span)
    } else if (span.parentId) {
      // Parent ID exists but parent span not found - orphaned span
      orphanedSpans.push(span)
    } else {
      // No parent ID - root span
      rootSpans.push(span)
    }
  }

  // Third pass: Calculate depths and sort children
  function calculateDepthsAndSort(
    spansToProcess: HierarchicalSpanAndAnnotation[],
    depth: number = 0,
  ): void {
    for (const span of spansToProcess) {
      span.depth = depth
      // Sort children by start time
      span.children.sort((a, b) => a.span.startTime.now - b.span.startTime.now)
      // Recursively calculate depths for children
      calculateDepthsAndSort(span.children, depth + 1)
    }
  }

  // Sort root spans by start time
  rootSpans.sort((a, b) => a.span.startTime.now - b.span.startTime.now)
  calculateDepthsAndSort(rootSpans)

  // Handle orphaned spans - add them as root spans with a warning
  if (orphanedSpans.length > 0) {
    // console.warn(
    //   `Found ${orphanedSpans.length} orphaned spans with invalid parentSpanId:`,
    //   orphanedSpans.map((s) => ({ id: s.span.id, parentId: s.parentId })),
    // )
    // Add orphaned spans as root spans
    for (const orphan of orphanedSpans) {
      orphan.depth = 0
      calculateDepthsAndSort([orphan])
    }
    rootSpans.push(...orphanedSpans)
  }

  return rootSpans
}

/**
 * Flattens a hierarchical span tree into a flat array, respecting expansion states
 */
export function flattenHierarchicalSpans(
  hierarchicalSpans: HierarchicalSpanAndAnnotation[],
  expandedSpanIds: Set<string>,
): HierarchicalSpanAndAnnotation[] {
  const result: HierarchicalSpanAndAnnotation[] = []

  function traverse(spans: HierarchicalSpanAndAnnotation[]): void {
    for (const span of spans) {
      result.push(span)

      // Only include children if this span is expanded
      if (span.children.length > 0 && expandedSpanIds.has(span.span.id)) {
        traverse(span.children)
      }
    }
  }

  traverse(hierarchicalSpans)
  return result
}

/**
 * Validates span hierarchy for circular references and other issues
 */
export function validateSpanHierarchy(spans: MappedSpanAndAnnotation[]): {
  isValid: boolean
  errors: string[]
  missingParentIds: string[]
} {
  const errors: string[] = []
  const visited = new Set<string>()
  const recursionStack = new Set<string>()

  // Build parent-child map
  const childrenMap = new Map<string, string[]>()
  for (const span of spans) {
    if (span.span.parentSpanId) {
      const children = childrenMap.get(span.span.parentSpanId) ?? []
      children.push(span.span.id)
      childrenMap.set(span.span.parentSpanId, children)
    }
  }

  // Check for circular references using DFS
  function detectCycle(spanId: string): boolean {
    if (recursionStack.has(spanId)) {
      errors.push(`Circular reference detected involving span: ${spanId}`)
      return true
    }
    if (visited.has(spanId)) {
      return false
    }

    visited.add(spanId)
    recursionStack.add(spanId)

    const children = childrenMap.get(spanId) ?? []
    for (const childId of children) {
      if (detectCycle(childId)) {
        return true
      }
    }

    recursionStack.delete(spanId)
    return false
  }

  // Check all spans for cycles (not just roots, as cycles can exist anywhere)
  const allSpanIds = new Set(spans.map((s) => s.span.id))
  for (const span of spans) {
    if (!visited.has(span.span.id)) {
      detectCycle(span.span.id)
    }
  }

  const missingParentIds: string[] = []

  // Check for invalid parent references
  for (const span of spans) {
    if (span.span.parentSpanId && !allSpanIds.has(span.span.parentSpanId)) {
      missingParentIds.push(span.span.parentSpanId)
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    missingParentIds,
  }
}

/**
 * Gets all descendant span IDs for a given span
 */
export function getDescendantSpanIds(
  span: HierarchicalSpanAndAnnotation,
): string[] {
  const descendants: string[] = []

  function traverse(currentSpan: HierarchicalSpanAndAnnotation): void {
    for (const child of currentSpan.children) {
      descendants.push(child.span.id)
      traverse(child)
    }
  }

  traverse(span)
  return descendants
}
