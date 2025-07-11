import type { INHERIT_FROM_PARENT } from './constants'
import type { ProcessedSpan } from './spanAnnotationTypes'
import type {
  Attributes,
  ComponentRenderSpan,
  SpanBase,
  WithParentSpanMatcher,
} from './spanTypes'
import type { TraceManager } from './TraceManager'
import type { RelatedTo, RelationSchemasBase } from './types'

export type RenderedOutput = 'null' | 'loading' | 'content' | 'error'

// allow setting any attribute value to INHERIT_FROM_PARENT:
export type MapRequiredAttributes<RequiredAttributesT> = {
  [K in keyof RequiredAttributesT]:
    | RequiredAttributesT[K]
    | typeof INHERIT_FROM_PARENT
}

export type BeaconConfig<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  RequiredAttributesT = {},
> = {
  /** The name of the component or hook */
  name: string
  /** What is this component related to based on the tracing schema? */
  relatedTo: RelatedTo<RelationSchemasT>
  /**
   * What is being rendered in this pass of the render function?
   */
  renderedOutput: RenderedOutput
  /**
   * If true, this is a component that is idle and not waiting for any data.
   * This is inferred automatically from `renderedOutput` and `error`, but can be overridden.
   */
  isIdle?: boolean
  /**
   * True if this is a hook being instrumented.
   */
  isHook?: boolean
} & (keyof RequiredAttributesT extends never
  ? { attributes?: Attributes }
  : { attributes: MapRequiredAttributes<RequiredAttributesT> & Attributes }) &
  WithParentSpanMatcher<RelationSchemasT> &
  Pick<SpanBase<RelationSchemasT>, 'internalUse' | 'error'>

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
