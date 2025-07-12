import type { Span } from './spanTypes'
import type { RecordedSpan } from './traceRecordingTypes'
import type { RelationSchemasBase } from './types'

/** used for calculating span occurrence number */
export const getSpanKey = <
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
>(
  span: Span<RelationSchemasT> | RecordedSpan<RelationSchemasT>,
) => `${span.type}|${span.name}`
