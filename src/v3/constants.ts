import type { SpanAnnotation } from './spanAnnotationTypes'

export const DEFAULT_DEBOUNCE_DURATION = 500
export const DEFAULT_INTERACTIVE_TIMEOUT_DURATION = 10_000
export const DEADLINE_BUFFER = 250

export const FALLBACK_ANNOTATION: SpanAnnotation = {
  id: 'n/a',
  occurrence: 0,
  operationRelativeStartTime: 0,
  operationRelativeEndTime: 0,
  recordedInState: 'active',
  labels: [],
}
