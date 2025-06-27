import type { Span } from './spanTypes'
import type { RelationSchemasBase } from './types'

/** used for calculating span occurrence number */
export const getSpanKey = <
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
>(
  span: Span<RelationSchemasT>,
) => `${span.type}|${span.name}`
