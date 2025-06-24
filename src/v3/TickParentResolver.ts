import type { Span } from './spanTypes'
import type { RelationSchemasBase, TraceManagerUtilities } from './types'

export interface TickMeta<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
> {
  spansInCurrentTick: Span<RelationSchemasT>[]
  thisSpanInCurrentTickIndex: number
}

export class TickParentResolver<
  const RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
> {
  #utilities: TraceManagerUtilities<RelationSchemasT>

  constructor(utilities: TraceManagerUtilities<RelationSchemasT>) {
    this.#utilities = utilities
    this.#tickId = utilities.generateId('tick')
  }

  #currentTickSpans: Span<RelationSchemasT>[] = []
  #isFlushScheduled = false
  #tickId: string

  #ensureFlushScheduled() {
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
    // very important: the array instance is created fresh to preserve references to arrays in previous tick closures
    this.#currentTickSpans = []
    this.#tickId = this.#utilities.generateId('tick')
    this.#isFlushScheduled = false
  }

  addSpanToCurrentTick(
    span: Span<RelationSchemasT>,
  ): TickMeta<RelationSchemasT> {
    const spansInCurrentTick = this.#currentTickSpans
    const thisSpanInCurrentTickIndex = spansInCurrentTick.push(span) - 1
    // eslint-disable-next-line no-param-reassign
    span.tickId = this.#tickId
    const { getParentSpanId } = span
    if (getParentSpanId) {
      // wrap the getParentSpanId function to include the current tick context:
      // eslint-disable-next-line no-param-reassign
      span.getParentSpanId = (context) =>
        getParentSpanId({
          ...context,
          spansInCurrentTick,
          thisSpanInCurrentTickIndex,
        })
    }
    this.#ensureFlushScheduled()
    return {
      spansInCurrentTick,
      thisSpanInCurrentTickIndex,
    }
  }
}
