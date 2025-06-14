import type { Span } from './spanTypes'
import type { TraceManager } from './TraceManager'
import type { RelationSchemasBase, TraceManagerUtilities } from './types'

type ResolveParentFn<RelationSchemasT> = (
  spansInCurrentTick: Span<RelationSchemasT>[],
  spanIndex: number,
) => Span<RelationSchemasT> | undefined

type SpanWithParent<RelationSchemasT> = Span<RelationSchemasT> & {
  parentSpan?: Span<RelationSchemasT> | ResolveParentFn<RelationSchemasT>
}

export class SpanManager<
  const RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
> {
  #currentTickSpans: SpanWithParent<RelationSchemasT>[] = []
  #isFlushScheduled = false
  #tickId: string
  #traceManager: TraceManager<RelationSchemasT>
  #utilities: TraceManagerUtilities<RelationSchemasT>

  constructor(
    traceManager: TraceManager<RelationSchemasT>,
    utilities: TraceManagerUtilities<RelationSchemasT>,
  ) {
    this.#traceManager = traceManager
    this.#utilities = utilities
    this.#tickId = utilities.generateId()
  }

  #scheduleFlush() {
    if (!this.#isFlushScheduled) {
      this.#isFlushScheduled = true
      // double queueMicrotask ensures the flush happens at the very end of the current event loop tick,
      // after all spans are added to the current tick
      queueMicrotask(() => {
        queueMicrotask(this.#flushCurrentTickSpans)
      })
    }
  }

  #flushCurrentTickSpans = () => {
    for (const span of this.#currentTickSpans) {
      const resolvedParent =
        typeof span.parentSpan === 'function'
          ? span.parentSpan(
              this.#currentTickSpans,
              this.#currentTickSpans.indexOf(span),
            )
          : span.parentSpan

      this.#traceManager.processSpan({
        ...span,
        parentSpanId: resolvedParent?.id,
        tickId: this.#tickId,
      })
    }
    this.#currentTickSpans = []
    this.#tickId = this.#utilities.generateId()
    this.#isFlushScheduled = false
  }

  #addSpanToCurrentTick(span: SpanWithParent<RelationSchemasT>) {
    this.#currentTickSpans.push(span)
    this.#scheduleFlush()
  }

  startSpan(span: SpanWithParent<RelationSchemasT>) {
    // TODO: maybe mutate span instead of creating a new object
    this.#addSpanToCurrentTick(
      span.id ? span : { id: this.#utilities.generateId(), ...span },
    )
    return span
  }

  endSpan(
    startSpan: SpanWithParent<RelationSchemasT>,
    endSpanAttributes: Partial<SpanWithParent<RelationSchemasT>> = {},
  ) {
    // TODO: maybe mutate endSpan instead of creating a new object (Object.assign)
    const id = endSpanAttributes.id ?? this.#utilities.generateId()
    const endSpan = {
      ...startSpan,
      id,
      ...endSpanAttributes,
      startSpanId: startSpan.id,
    }
    this.#addSpanToCurrentTick(endSpan)
  }

  errorSpan(span: SpanWithParent<RelationSchemasT>) {
    // mutate the input span, resolve parent if possible, since it will be synchronous
  }
}
