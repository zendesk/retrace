import type { Span } from './spanTypes'

/** used for calculating span occurrence number */
export const getSpanKey = <RelationSchemasT>(span: Span<RelationSchemasT>) =>
  `${span.type}|${span.name}`
