import { useEffect, useRef } from 'react'
import { useOnComponentUnmount } from '../ErrorBoundary'
import type { BeaconConfig, UseBeacon } from './hooksTypes'
import type { ProcessedSpan } from './spanAnnotationTypes'
import type { ComponentRenderSpan } from './spanTypes'
import type { TraceManager } from './TraceManager'
import type { RelationSchemasBase, RelationsOnASpan } from './types'

/**
 * The job of the beacon:
 * emit component-render-start, component-render, component-unmount entries
 */
export const generateUseBeacon =
  <
    RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
    RequiredAttributesT = {},
  >(
    traceManager: TraceManager<RelationSchemasT>,
  ): UseBeacon<RelationSchemasT, RequiredAttributesT> =>
  (config: BeaconConfig<RelationSchemasT, RequiredAttributesT>) => {
    const renderCountRef = useRef(0)
    renderCountRef.current += 1

    const { attributes, renderedOutput } = config

    const status = config.error ? 'error' : 'ok'

    const isIdle =
      config.isIdle ??
      (renderedOutput === 'content' || renderedOutput === 'error')

    const relatedTo =
      config.relatedTo as unknown as RelationsOnASpan<RelationSchemasT>

    const renderStartEntry = traceManager.startRenderSpan({
      ...config,
      relatedTo,
      attributes,
      status,
      renderCount: renderCountRef.current,
      isIdle,
    })

    const renderStartRef = useRef<
      | ProcessedSpan<RelationSchemasT, ComponentRenderSpan<RelationSchemasT>>
      | undefined
    >()
    renderStartRef.current = renderStartEntry

    // Beacon effect for tracking 'component-render'. This will fire after every render as it does not have any dependencies:
    useEffect(() => {
      if (!renderStartRef.current) {
        return
      }
      traceManager.endRenderSpan(renderStartRef.current.span)
      renderStartRef.current = undefined
    })

    // Beacon effect for tracking 'component-unmount' entries
    useOnComponentUnmount(
      (errorBoundaryMetadata) => {
        traceManager.createAndProcessSpan<
          ComponentRenderSpan<RelationSchemasT>
        >({
          ...config,
          relatedTo,
          type: 'component-unmount',
          attributes,
          error: errorBoundaryMetadata?.error,
          errorInfo: errorBoundaryMetadata?.errorInfo,
          status: errorBoundaryMetadata?.error ? 'error' : 'ok',
          renderCount: renderCountRef.current,
          isIdle,
          parentSpanId: renderStartRef.current?.span.id,
        })
      },
      [config.name],
    )

    return renderStartEntry
  }
