/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { expect } from 'vitest'
import { generateAsciiTimeline } from './generateAsciiTimeline'

const asciiTimelineSerializer = {
  test: (val: unknown) =>
    Array.isArray(val) &&
    val.every(
      (item) =>
        item &&
        typeof item.startTime === 'number' &&
        typeof item.duration === 'number',
    ),
  print: (val: unknown) =>
    generateAsciiTimeline(val as PerformanceEntry[], {
      width: 80,
    }),
} as const

expect.addSnapshotSerializer(asciiTimelineSerializer)

// eslint-disable-next-line import/no-default-export
export default asciiTimelineSerializer
