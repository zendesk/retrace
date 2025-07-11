import type { Span } from './spanTypes'
import type { RelationSchemasBase, TraceManagerUtilities } from './types'

export type TickListWithMeta<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
> = Span<RelationSchemasT>[] & {
  tickCompleted?: boolean
}

export interface TickMeta<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
> {
  /**
   * Array of all spans that were processed in the current event loop tick.
   * Empty if tick tracking is disabled
   */
  spansInCurrentTick: TickListWithMeta<RelationSchemasT>
  thisSpanInCurrentTickIndex: number
}

/** symbol for storing the tick meta for starting of the span */
export const TICK_META = Symbol('tickMeta')
/** symbol for storing the tick meta for closing of the span */
export const TICK_META_END = Symbol('tickMetaEnd')

export class TickParentResolver<
  const RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
> {
  #utilities: TraceManagerUtilities<RelationSchemasT>

  constructor(utilities: TraceManagerUtilities<RelationSchemasT>) {
    this.#utilities = utilities
    this.#tickId = utilities.generateId('tick')
  }

  #currentTickSpans: TickListWithMeta<RelationSchemasT> = []
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
    // we define an attribute to indicate that the tick is completed, and will not change
    this.#currentTickSpans.tickCompleted = true
    // very important: the array instance is created fresh to preserve references to arrays in previous tick closures
    this.#currentTickSpans = []
    this.#tickId = this.#utilities.generateId('tick')
    this.#isFlushScheduled = false
  }

  addSpanToCurrentTick(
    span: Span<RelationSchemasT>,
    endingSpan = false,
  ): TickMeta<RelationSchemasT> {
    const spansInCurrentTick = this.#currentTickSpans
    const thisSpanInCurrentTickIndex = spansInCurrentTick.push(span) - 1
    // eslint-disable-next-line no-param-reassign
    span.tickId = this.#tickId
    // store a non-enumerable reference to the tick meta on the span - helpful for parent resolution after the trace was finished
    // eslint-disable-next-line no-param-reassign
    span[endingSpan ? TICK_META_END : TICK_META] = {
      spansInCurrentTick,
      thisSpanInCurrentTickIndex,
    }
    this.#ensureFlushScheduled()
    return {
      spansInCurrentTick,
      thisSpanInCurrentTickIndex,
    }
  }
}
