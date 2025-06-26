/* eslint-disable @typescript-eslint/no-explicit-any */
import type { IGardenTheme } from '@zendeskgarden/react-theming'
import type { SpanAnnotation } from '../v3/spanAnnotationTypes'
import type { Attributes, Span, SpanBase } from '../v3/spanTypes'
import type { TraceRecording } from '../v3/traceRecordingTypes'
import type { Timestamp } from '../v3/types'
import type { SupportedSpanTypes } from './constants'
import type { MappedOperation } from './mapOperationForVisualization'

type DistributiveOmit<T, K extends keyof any> = T extends T ? Omit<T, K> : never

// visualizer-specific types
export type MinimalSpanAnnotation = Omit<
  SpanAnnotation,
  'id' | 'occurrence' | 'recordedInState' | 'labels'
> &
  Partial<SpanAnnotation>
export type MinimalSpan = DistributiveOmit<
  Span<any> | SpanBase<any>,
  'startTime' | 'attributes'
> & {
  startTime: Pick<Timestamp, 'now'> & Partial<Timestamp>
  attributes?: Attributes
}

export interface MappedSpanAndAnnotation {
  span: MinimalSpan
  annotation: MinimalSpanAnnotation
  groupName: string
  type: SupportedSpanTypes
}

export type RecordingInputFile = TraceRecording<any, any>

// Hierarchical span types for parent-child visualization
export interface HierarchicalSpanAndAnnotation extends MappedSpanAndAnnotation {
  children: HierarchicalSpanAndAnnotation[]
  isExpanded: boolean
  depth: number
  parentId?: string
}

export interface HierarchicalOperation
  extends Omit<MappedOperation, 'spansWithDuration'> {
  spans: HierarchicalSpanAndAnnotation[]
  expandedSpanIds: Set<string>
}

export interface ExpansionState {
  expandedSpans: Set<string>
  toggleSpanExpansion: (spanId: string) => void
  isSpanExpanded: (spanId: string) => boolean
  collapseAll: () => void
  expandAll: () => void
}

declare module 'styled-components' {
  export interface DefaultTheme extends IGardenTheme {}
}
