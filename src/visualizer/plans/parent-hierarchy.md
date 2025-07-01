# Hierarchical Span Visualization Implementation Plan

## Overview

Transform the current flat lane-based visualization into a hierarchical tree view where parent spans can be expanded/collapsed to show their children, while maintaining the timeline visualization benefits.

## Current State Analysis

### Span Structure

- `SpanBase` interface includes `parentSpanId?: string` field (src/v3/spanTypes.ts:139)
- Parent-child relationships are defined but not visualized
- Current visualizer groups spans by name, not hierarchy

### Existing Architecture

- Lane-based timeline using @visx
- `mapOperationForVisualization` transforms data
- `InteractiveSpan` renders individual spans
- `OperationVisualization` manages overall layout

## Implementation Plan

### Phase 1: Data Structure Foundation

#### 1.1 Enhanced Types

Add to `src/visualizer/types.ts`:

```typescript
interface HierarchicalSpan extends MappedSpan {
  children: HierarchicalSpan[]
  isExpanded: boolean
  depth: number
  parentId?: string
}

interface HierarchicalSpanGroup extends Omit<MappedSpanGroup, 'spans'> {
  spans: HierarchicalSpan[]
  expandedSpanIds: Set<string>
}

interface ExpansionState {
  expandedSpans: Set<string>
  toggleSpanExpansion: (spanId: string) => void
  isSpanExpanded: (spanId: string) => boolean
  collapseAll: () => void
  expandAll: () => void
}
```

#### 1.2 Hierarchy Builder Function

Create `src/visualizer/utils/buildSpanHierarchy.ts`:

- Parse `parentSpanId` relationships
- Build tree structures from flat span arrays
- Handle orphaned spans and circular references
- Calculate depth levels for each span
- Set default expansion states (collapsed)

#### 1.3 Enhanced mapOperationForVisualization

Update `src/visualizer/mapOperationForVisualization.ts`:

- Integrate hierarchy building after span processing
- Maintain existing filtering and collapsing logic
- Add expansion state management
- Preserve span ordering within hierarchy levels

### Phase 2: Core UI Components

#### 2.1 SpanLaneHeader Component

Create `src/visualizer/components/SpanLaneHeader.tsx`:

```typescript
interface SpanLaneHeaderProps {
  span: HierarchicalSpan
  isExpanded: boolean
  onToggleExpansion: (spanId: string) => void
  depth: number
}
```

Features:

- Expand/collapse icons (`+`/`-`)
- Indentation based on depth
- Click handlers for expansion
- Visual hierarchy indicators

#### 2.2 Enhanced InteractiveSpan

Update `src/visualizer/components/InteractiveSpan.tsx`:

```typescript
interface InteractiveSpanProps {
  // existing props...
  depth: number
  hasChildren: boolean
  isExpanded: boolean
  onToggleExpansion?: (spanId: string) => void
  isVisible: boolean
}
```

Changes:

- Add depth-based indentation
- Show expansion controls for parent spans
- Handle visibility based on parent expansion state
- Maintain existing timeline positioning

#### 2.3 Expansion State Hook

Create `src/visualizer/hooks/useSpanExpansion.ts`:

- Manage expansion state with React state
- Provide toggle, expand all, collapse all functions
- Handle localStorage persistence
- Return visibility calculations for spans

### Phase 3: Layout and Positioning

#### 3.1 Dynamic Lane Calculation

Update `src/visualizer/components/OperationVisualization.tsx`:

- Calculate visible lanes based on expansion states
- Recompute y-scale when spans expand/collapse
- Update lane height calculations
- Maintain smooth transitions

#### 3.2 Hierarchical Positioning Logic

- Compute visible span list from hierarchy + expansion state
- Maintain timeline x-positioning
- Apply depth-based y-offset within lanes
- Handle lane label positioning

#### 3.3 Animation Support

- CSS transitions for expand/collapse
- Height animations for smooth lane changes
- Opacity transitions for appearing/disappearing spans

### Phase 4: Polish and Features

#### 4.1 Visual Hierarchy Indicators

- Tree connector lines between parent and children
- Different background colors for depth levels
- Hover states for expansion controls
- Visual feedback for expandable spans

#### 4.2 Keyboard Navigation

- Arrow keys for expand/collapse
- Tab navigation through spans
- Enter/Space for expansion toggle
- Proper ARIA labels for accessibility

#### 4.3 Bulk Operations

- "Expand All" / "Collapse All" buttons
- Right-click context menu options
- Keyboard shortcuts (Ctrl+E, Ctrl+C)

#### 4.4 Performance Optimization

- React.memo for span components
- Virtualization for large span trees
- Debounced expansion state updates
- Lazy loading of deep hierarchies

## Technical Considerations

### Performance

- Use React.memo and useMemo for expensive calculations
- Implement virtualization for large span counts
- Debounce expansion state changes
- Consider web workers for hierarchy building

### Accessibility

- Proper ARIA tree structure
- Keyboard navigation support
- Screen reader announcements for state changes
- Focus management during expansion

### Data Integrity

- Handle circular parent-child references
- Gracefully handle orphaned spans
- Validate parentSpanId relationships
- Fallback to flat view on hierarchy errors

### State Management

- Persist expansion state in localStorage
- Key by trace/file identifier
- Handle state migration for schema changes
- Provide reset mechanisms

## Implementation Timeline

### Week 1: Foundation

- [ ] Create hierarchical types
- [ ] Build hierarchy builder utility
- [ ] Update mapOperationForVisualization
- [ ] Unit tests for hierarchy logic

### Week 2: Core Components

- [ ] Create SpanLaneHeader component
- [ ] Enhance InteractiveSpan component
- [ ] Create expansion state hook
- [ ] Integration with OperationVisualization

### Week 3: Layout & Interaction

- [ ] Dynamic lane calculation
- [ ] Smooth animations
- [ ] Keyboard navigation
- [ ] Accessibility improvements

### Week 4: Polish & Testing

- [ ] Visual hierarchy indicators
- [ ] Bulk operations
- [ ] Performance optimization
- [ ] End-to-end testing

## Success Criteria

1. **Functional**: Spans with children show expand/collapse controls
2. **Visual**: Clear parent-child relationships with proper indentation
3. **Performance**: No significant slowdown with large span hierarchies
4. **Accessible**: Full keyboard navigation and screen reader support
5. **Persistent**: Expansion states survive page reloads
6. **Robust**: Handles edge cases and malformed data gracefully

## Future Enhancements

- Search and filter within hierarchies
- Span relationship visualization (beyond parent-child)
- Hierarchical span statistics and aggregations
- Export hierarchical view as image/PDF
- Custom hierarchy grouping rules
