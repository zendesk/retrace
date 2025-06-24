/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  ComponentRenderSpan,
  PerformanceEntrySpan,
  Span,
  SpanType,
} from '../spanTypes'
import type { RelationSchemasBase } from '../types'

export interface ComponentRenderStub
  extends Partial<Omit<ComponentRenderSpan<any>, 'startTime' | 'duration'>> {
  entryType: 'component-render' | 'component-render-start'
  duration: number
  startTime?: number
  name: string
}

export interface LongTaskStub {
  entryType: 'longtask'
  duration: number
  startTime?: number
  name?: string
}

export interface MarkStub
  extends Partial<Omit<PerformanceEntrySpan<any>, 'startTime' | 'duration'>> {
  entryType: 'mark'
  name: string
  startTime?: number
}

export interface FmpStub {
  entryType: 'fmp'
  startTime?: number
}

export interface IdleStub {
  entryType: 'idle'
  duration: number
}

export type Stub =
  | ComponentRenderStub
  | LongTaskStub
  | MarkStub
  | FmpStub
  | IdleStub

export const Render = (
  name: string,
  duration: number,
  options: { startTime?: number } & Partial<
    Omit<ComponentRenderSpan<any>, 'startTime' | 'duration'>
  > = {},
): ComponentRenderStub => ({
  entryType: 'component-render',
  name,
  duration,
  startTime: options.startTime,
  isIdle:
    (options.renderedOutput === 'content' ||
      options.renderedOutput === 'error') ??
    options.isIdle,
  ...options,
})

export const LongTask = (
  duration: number,
  options: { start?: number } = {},
): LongTaskStub => ({
  entryType: 'longtask',
  duration,
  startTime: options.start,
  name: 'task',
})

export const Idle = (duration: number): IdleStub => ({
  entryType: 'idle',
  duration,
})

export const Check: MarkStub = {
  entryType: 'mark',
  name: 'check',
}

export const FMP: FmpStub = {
  entryType: 'fmp',
}

export function makeEntries(events: Stub[]): {
  entries: PerformanceEntry[]
  fmpTime: number | null
} {
  const entries: PerformanceEntry[] = []
  let currentTime = 0
  let fmpTime = null

  for (const event of events) {
    const thisEventStartTime =
      'startTime' in event && event.startTime !== undefined && event.startTime
    const eventStartTime =
      thisEventStartTime !== false ? thisEventStartTime : currentTime
    const eventDuration = 'duration' in event ? event.duration : 0

    switch (event.entryType) {
      case 'idle':
        break
      case 'fmp':
        fmpTime = eventStartTime
        if (event.startTime === undefined) fmpTime = currentTime
      // fallthrough on purpose
      // eslint-disable-next-line no-fallthrough
      default:
        entries.push({
          entryType: event.entryType,
          name: 'name' in event ? event.name : event.entryType,
          startTime: eventStartTime,
          duration: eventDuration,
        } as PerformanceEntry)
        break
    }

    // Update `currentTime` only if `startTime` is not predefined
    if (thisEventStartTime === false) {
      currentTime = eventStartTime + eventDuration
    }
  }

  return { entries, fmpTime }
}

export function getSpansFromTimeline<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
>(
  _: TemplateStringsArray,
  ...exprs: (Stub | number)[]
): { spans: Span<RelationSchemasT>[]; fmpTime: number | null } {
  const spans: Span<RelationSchemasT>[] = []
  let fmpTime: number | null = null

  const stubs = exprs.filter((expr) => typeof expr !== 'number')
  const allNumbers = exprs.filter((expr) => typeof expr === 'number')
  let startTime: number
  let time: number[]

  if (allNumbers.length === stubs.length + 1) {
    startTime = allNumbers[0]!
    time = allNumbers.slice(1)
  } else if (allNumbers.length === stubs.length) {
    startTime = allNumbers[0]!
    time = allNumbers
  } else {
    throw new Error('Invalid timeline, mismatch of events and timestamps')
  }

  if (startTime === undefined) {
    throw new Error('No time provided for the beginning of the timeline')
  }

  for (let i = 0; i < time.length; i++) {
    const currentTime = time[i]
    const stub = stubs[i]
    if (!stub || typeof currentTime !== 'number') {
      throw new Error('Invalid timeline, mismatch of events and timestamps')
    }
    if (stub.entryType === 'fmp') {
      fmpTime = currentTime
    }
    const now =
      'startTime' in stub ? stub.startTime ?? currentTime : currentTime
    spans.push({
      type: stub.entryType as SpanType,
      duration: 0,
      name: `${stub.entryType}`,
      ...stub,
      startTime: {
        now,
        epoch: now,
      },
      isIdle:
        'isIdle' in stub
          ? stub.isIdle
          : 'name' in stub
          ? stub.name?.includes('idle')
          : undefined,
      renderedOutput:
        'renderedOutput' in stub
          ? stub.renderedOutput
          : 'name' in stub
          ? stub.name?.includes('idle')
            ? 'content'
            : 'loading'
          : undefined,
      performanceEntry: {
        duration: 0,
        name: `${stub.entryType}`,
        ...stub,
        startTime:
          'startTime' in stub ? stub.startTime ?? currentTime : currentTime,
        toJSON: () => {},
      },
      id: `span-${i}-${now}-${stub.entryType}-${
        'duration' in stub ? stub.duration : 0
      }`,
    } as Span<RelationSchemasT>)
  }

  return { spans, fmpTime }
}

// example usage
// const timeline = getEventsFromTimeline`
// Events: ----------${FMP}-----${Task(50)}-------${Task(100)}-------${Task(200)}-------${Check}
// Time:   ${0}      ${200}     ${300}            ${350}             ${550}             ${700}
// `
// console.log(timeline)
