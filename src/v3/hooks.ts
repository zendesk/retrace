import { useEffect, useRef } from 'react'
import { useOnComponentUnmount } from '../ErrorBoundary'
import type { BeaconConfig, UseBeacon } from './hooksTypes'
import type { ProcessedSpan } from './spanAnnotationTypes'
import { type ComponentRenderSpan, PARENT_SPAN } from './spanTypes'
import type { TraceManager } from './TraceManager'
import type { RelationSchemasBase, RelationsOnASpan } from './types'

/**
 * The job of the beacon:
 * emit component-render-start, component-render, component-unmount entries
 * (or hook-render-start, hook-render, hook-unmount based on the isHook option)
 */
export const generateUseBeacon =
  <
    RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
    RequiredAttributesT = {},
  >(
    traceManager: TraceManager<RelationSchemasT>,
  ): UseBeacon<RelationSchemasT, RequiredAttributesT> =>
  ({
    isHook = false,
    ...config
  }: BeaconConfig<RelationSchemasT, RequiredAttributesT>) => {
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
      kind: isHook ? 'hook' : 'component',
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
      const currentTrace = traceManager.currentTraceContext
      if (
        currentTrace &&
        !currentTrace.recordedItems.has(renderStartRef.current.span.id)
      ) {
        // handle edge case where the component mounted before the trace was started
        renderStartRef.current = traceManager.createAndProcessSpan({
          ...renderStartRef.current.span,
          parentSpan: renderStartRef.current.span[PARENT_SPAN],
          // if startTime is before the trace start time, we set it to undefined
          // to ensure the span is added to the trace
          startTime:
            renderStartRef.current.span.startTime.now <
            currentTrace.input.startTime.now
              ? undefined
              : renderStartRef.current.span.startTime,
        })
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
          type: isHook ? 'hook-unmount' : 'component-unmount',
          attributes,
          error: errorBoundaryMetadata?.error,
          errorInfo: errorBoundaryMetadata?.errorInfo,
          status: errorBoundaryMetadata?.error ? 'error' : 'ok',
          renderCount: renderCountRef.current,
          isIdle,
          parentSpan: renderStartRef.current?.span,
        })
      },
      [config.name],
    )

    return renderStartEntry
  }
