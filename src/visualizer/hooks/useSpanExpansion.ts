import { useCallback, useMemo, useState } from 'react'
import type { HierarchicalSpanAndAnnotation } from '../types'

interface UseSpanExpansionOptions {
  initialExpandedSpans?: Set<string>
  persistKey?: string
}

export function useSpanExpansion(options: UseSpanExpansionOptions = {}) {
  const { initialExpandedSpans = new Set(), persistKey } = options
  
  const [expandedSpans, setExpandedSpans] = useState<Set<string>>(() => {
    if (persistKey && typeof localStorage !== 'undefined') {
      try {
        const stored = localStorage.getItem(`span-expansion-${persistKey}`)
        if (stored) {
          const parsed = JSON.parse(stored) as string[]
          return new Set(parsed)
        }
        return initialExpandedSpans
      } catch {
        return initialExpandedSpans
      }
    }
    return initialExpandedSpans
  })

  const toggleSpanExpansion = useCallback((spanId: string) => {
    setExpandedSpans(prev => {
      const next = new Set(prev)
      if (next.has(spanId)) {
        next.delete(spanId)
      } else {
        next.add(spanId)
      }
      
      if (persistKey && typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem(`span-expansion-${persistKey}`, JSON.stringify([...next]))
        } catch {
          // Ignore storage errors
        }
      }
      
      return next
    })
  }, [persistKey])

  const isSpanExpanded = useCallback((spanId: string) => {
    return expandedSpans.has(spanId)
  }, [expandedSpans])

  const collapseAll = useCallback(() => {
    setExpandedSpans(new Set())
    if (persistKey && typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(`span-expansion-${persistKey}`, JSON.stringify([]))
      } catch {
        // Ignore storage errors
      }
    }
  }, [persistKey])

  const expandAll = useCallback((spans: HierarchicalSpanAndAnnotation[]) => {
    const allSpanIds = new Set<string>()
    
    const collectSpanIds = (span: HierarchicalSpanAndAnnotation) => {
      if (span.children.length > 0) {
        allSpanIds.add(span.span.id)
      }
      span.children.forEach(collectSpanIds)
    }
    
    spans.forEach(collectSpanIds)
    
    setExpandedSpans(allSpanIds)
    if (persistKey && typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(`span-expansion-${persistKey}`, JSON.stringify([...allSpanIds]))
      } catch {
        // Ignore storage errors
      }
    }
  }, [persistKey])

  const getVisibleSpans = useCallback((spans: HierarchicalSpanAndAnnotation[]): HierarchicalSpanAndAnnotation[] => {
    const visibleSpans: HierarchicalSpanAndAnnotation[] = []
    
    const addVisibleSpans = (span: HierarchicalSpanAndAnnotation) => {
      visibleSpans.push(span)
      
      if (expandedSpans.has(span.span.id)) {
        span.children.forEach(addVisibleSpans)
      }
    }
    
    spans.forEach(addVisibleSpans)
    return visibleSpans
  }, [expandedSpans])

  const expansionState = useMemo(() => ({
    expandedSpans,
    toggleSpanExpansion,
    isSpanExpanded,
    collapseAll,
    expandAll,
    getVisibleSpans
  }), [expandedSpans, toggleSpanExpansion, isSpanExpanded, collapseAll, expandAll, getVisibleSpans])

  return expansionState
}