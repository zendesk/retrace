import './testUtility/asciiTimelineSerializer'
import { describe, expect, it } from 'vitest'
import { createCPUIdleProcessor } from './firstCPUIdle'
import {
  Check,
  FMP,
  Idle,
  LongTask,
  makeEntries,
} from './testUtility/makeTimeline'

function getFirstCPUIdleEntry({
  fmpTime,
  entries,
}: {
  fmpTime: number | null
  entries: PerformanceEntry[]
}) {
  const processor = createCPUIdleProcessor(fmpTime ?? 0)
  let firstCPUIdle

  for (const entry of entries) {
    const result = processor.processPerformanceEntry(entry)
    if (result !== undefined) {
      firstCPUIdle = result
    }
  }
  return firstCPUIdle
}

describe('createCPUIdleProcessor', () => {
  it('No long tasks after FMP, FirstCPUIdle immediately after FMP + quiet window', () => {
    const { entries, fmpTime } = makeEntries([
      Idle(200),
      FMP,
      Idle(4_000),
      LongTask(400),
    ])
    expect(entries).toMatchInlineSnapshot(`
      events    | fmp           task(400)
      timeline  | |-<⋯ +4000 ⋯>-[++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++]
      time (ms) | 200           4200
    `)

    const firstCPUIdle = getFirstCPUIdleEntry({ fmpTime, entries })

    expect(firstCPUIdle).toEqual({ firstCpuIdle: 200 })
  })

  it('One heavy cluster-sized long task after FMP, FirstCPUIdle after long task', () => {
    const { entries, fmpTime } = makeEntries([
      Idle(200),
      FMP,
      Idle(200),
      LongTask(400),
      Idle(4_000),
      Check,
    ])
    expect(entries).toMatchInlineSnapshot(`
      events    | fmp                   task(400)                                                 check
      timeline  | |---------------------[++++++++++++++++++++++++++++++++++++++++++]-<⋯ +4000 ⋯>--|
      time (ms) | 200                   400                                                       4800
    `)

    const firstCPUIdle = getFirstCPUIdleEntry({ fmpTime, entries })

    // the first CPU idle is after the long task, so it should be 800 (FMP at 200 + 200 idle + 400 long task)
    expect(firstCPUIdle).toEqual({ firstCpuIdle: 800 })
  })

  it('One light cluster after FMP, FirstCPUIdle at FMP', () => {
    const { entries, fmpTime } = makeEntries([
      Idle(200),
      FMP,
      Idle(100),
      LongTask(50),
      Idle(50),
      LongTask(50),
      LongTask(50),
      Idle(2_550),
      Check,
    ])
    expect(entries).toMatchInlineSnapshot(`
      events    | fmp                 task(50)            task(50)   task(50)               check
      timeline  | |-------------------[++++++++]----------[++++++++]-[++++++++]-<⋯ +2550 ⋯>-|
      time (ms) | 200                 300                 400        450                    3050
    `)
    const firstCPUIdle = getFirstCPUIdleEntry({ fmpTime, entries })

    expect(firstCPUIdle).toEqual({ firstCpuIdle: 200 })
  })

  it('One heavy cluster after FMP, FirstCPUIdle after the cluster', () => {
    const { entries, fmpTime } = makeEntries([
      Idle(200),
      FMP,
      Idle(100),
      LongTask(50),
      Idle(50),
      LongTask(200),
      Idle(50),
      LongTask(50),
      Idle(2_500),
      Check,
    ])
    expect(entries).toMatchInlineSnapshot(`
      events    | fmp         task(50)    task(200)                      task(50)            check
      timeline  | |-----------[++++]------[+++++++++++++++++++++++]------[++++]-<⋯ +2500 ⋯>--|
      time (ms) | 200         300         400                            650                 3200
    `)
    const firstCPUIdle = getFirstCPUIdleEntry({ fmpTime, entries })

    expect(firstCPUIdle).toEqual({ firstCpuIdle: 700 })
  })

  it('Multiple heavy clusters, FirstCPUIdle updated to end of last cluster', () => {
    const { entries, fmpTime } = makeEntries([
      Idle(200),
      FMP,
      Idle(100),
      LongTask(200),
      Idle(400),
      LongTask(200),
      Idle(400),
      LongTask(200),
      Idle(2_100),
      Check,
    ])
    expect(entries).toMatchInlineSnapshot(`
      events    | fmp task(200)                  task(200)                  task(200)              check
      timeline  | |---[+++++++]------------------[+++++++]------------------[+++++++]-<⋯ +2100 ⋯>--|
      time (ms) | 200 300                        900                        1500                   3800
    `)
    const firstCPUIdle = getFirstCPUIdleEntry({ fmpTime, entries })

    const lastLongTask = entries.at(-2)!
    const expectedResult = lastLongTask.startTime + lastLongTask.duration

    expect(firstCPUIdle).toEqual({ firstCpuIdle: expectedResult })
  })

  it('Checking before the quiet window has passed - no long tasks processed, FirstCPUIdle not found', () => {
    const { entries, fmpTime } = makeEntries([Idle(200), FMP, Idle(200), Check])
    expect(entries).toMatchInlineSnapshot(`
      events    | fmp          check
      timeline  | |-<⋯ +200 ⋯>-|
      time (ms) | 200          400
    `)
    const firstCPUIdle = getFirstCPUIdleEntry({ fmpTime, entries })

    expect(firstCPUIdle).toEqual({ nextCheck: 2_400 })
  })

  it('One heavy cluster, followed by two light, value is after 1st heavy cluster', () => {
    const { entries, fmpTime } = makeEntries([
      Idle(200),
      FMP,
      Idle(100),
      LongTask(200),
      Idle(100),
      LongTask(100),
      Idle(1_000),
      LongTask(200),
      Idle(1_000),
      LongTask(200),
      Idle(1_550),
      Check,
    ])
    expect(entries).toMatchInlineSnapshot(`
      events    | fmp  task(200)       task(100)          task(200)               task(200)               check
      timeline  | |----[+++++++++]-----[+++]-<⋯ +1000 ⋯>--[+++++++++]-<⋯ +1000 ⋯>-[+++++++++]-<⋯ +1550 ⋯>-|
      time (ms) | 200  300             600                1700                    2900                    4650
    `)
    const firstCPUIdle = getFirstCPUIdleEntry({ fmpTime, entries })

    const lastHeavyClusterLongTask = entries.at(2)!
    const expectedResult =
      lastHeavyClusterLongTask.startTime + lastHeavyClusterLongTask.duration

    expect(firstCPUIdle).toEqual({ firstCpuIdle: expectedResult })
  })

  it('Continuous heavy clusters', () => {
    const { entries, fmpTime } = makeEntries([
      FMP,
      Idle(200),
      LongTask(300),
      Idle(50),
      LongTask(300),
      Idle(50),
      LongTask(300),
      Idle(50),
      LongTask(300),
      Idle(50),
      LongTask(300),
      Idle(50),
      LongTask(300),
      Idle(50),
      LongTask(300),
      Idle(50),
      LongTask(300),
      Idle(50),
      LongTask(300),
      Idle(50),
      LongTask(300),
      Idle(50),
      LongTask(300),
      Idle(50),
      LongTask(300),
      Idle(50),
      LongTask(300),
      Idle(50),
      LongTask(300),
      Idle(50),
      LongTask(300),
      Idle(50),
      Check,
    ])
    expect(entries).toMatchInlineSnapshot(`
      events    |   task(300) task(300) task(300) task(300) task(300) task(300) task(300) task(300)
      events    | fmp    task(300) task(300) task(300) task(300) task(300) task(300) task(300) check
      timeline  | |-[++]-[++]-[++]-[++]-[++]-[++]-[++]-[++]-[++]-[++]-[++]-[++]-[++]-[++]-[++]-|-
      time (ms) | 0 200  550  900  1250 1600 1950 2300 2650 3000 3350 3700 4050 4400 4750 5100 5450
    `)

    const firstCPUIdle = getFirstCPUIdleEntry({ fmpTime, entries })
    expect(firstCPUIdle).toEqual({ nextCheck: 7_450 })
  })

  it('Light cluster followed by a heavy cluster a second later, FirstCPUIdle updated', () => {
    const { entries, fmpTime } = makeEntries([
      Idle(200),
      FMP,
      LongTask(50),
      Idle(50),
      LongTask(50),
      LongTask(50),
      Idle(1_050),
      LongTask(50),
      Idle(50),
      LongTask(50),
      Idle(50),
      LongTask(200),
      Idle(50),
      LongTask(200),
      Idle(2_050),
      Check,
    ])
    expect(entries).toMatchInlineSnapshot(`
      events    | task(50)  task(50)            task(50)
      events    | fmp  task(50)            task(50)   task(200)       task(200)                  check
      timeline  | [+]--[+]--[+]-<⋯ +1050 ⋯>[+]--[+]---[+++++++++++]---[+++++++++++]-<⋯ +2050 ⋯>--|
      time (ms) | 200  300  350            1450 1550  1650            1900                       4150
    `)
    const firstCPUIdle = getFirstCPUIdleEntry({ fmpTime, entries })

    const lastLongTask = entries.at(-2)!
    const expectedResult = lastLongTask.startTime + lastLongTask.duration

    expect(firstCPUIdle).toEqual({ firstCpuIdle: expectedResult })
  })

  it('A long task overlaps FMP, we consider FirstCPUIdle after the long task', () => {
    const { entries, fmpTime } = makeEntries([
      Idle(200),
      FMP,
      LongTask(110, { start: 150 }), // Overlaps with FMP
      Idle(2_300),
      Check,
    ])
    expect(entries).toMatchInlineSnapshot(`
      events    |
      events    | task(110)                fmp                                        check
      timeline  | [+++++++++++++++++++++++++++++++++++++++++++++++++++++]-<⋯ +2240 ⋯>-|
      timeline  | -------------------------|-<⋯ +2300 ⋯>-------------------------------
      time (ms) | 150                      200                                        2500
    `)
    const firstCPUIdle = getFirstCPUIdleEntry({ fmpTime, entries })

    const lastLongTask = entries.at(-2)!
    const expectedResult = lastLongTask.startTime + lastLongTask.duration

    expect(firstCPUIdle).toEqual({ firstCpuIdle: expectedResult })
  })
})
