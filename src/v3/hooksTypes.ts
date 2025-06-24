import type { ProcessedSpan } from './spanAnnotationTypes'
import type {
  Attributes,
  ComponentRenderSpan,
  WithParentSpanMatcher,
} from './spanTypes'
import type { TraceManager } from './TraceManager'
import type { RelatedTo, RelationSchemasBase } from './types'

export type RenderedOutput = 'null' | 'loading' | 'content' | 'error'

export type BeaconConfig<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  RequiredAttributesT = {},
> = {
  name: string
  relatedTo: RelatedTo<RelationSchemasT>
  renderedOutput: RenderedOutput
  isIdle?: boolean
  error?: Error
} & (keyof RequiredAttributesT extends never
  ? { attributes?: Attributes }
  : { attributes: RequiredAttributesT & Attributes }) &
  WithParentSpanMatcher<RelationSchemasT>

export type UseBeacon<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  RequiredAttributesT,
> = (
  beaconConfig: BeaconConfig<RelationSchemasT, RequiredAttributesT>,
) => ProcessedSpan<RelationSchemasT, ComponentRenderSpan<RelationSchemasT>>

export type GetRelationSchemasTFromTraceManager<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TraceManagerT extends TraceManager<any>,
> = TraceManagerT extends TraceManager<infer RelationSchemasT>
  ? RelationSchemasT
  : never
