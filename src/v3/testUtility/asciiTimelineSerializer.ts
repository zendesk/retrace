/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { expect } from 'vitest'
import { generateAsciiTimeline } from './generateAsciiTimeline'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isValid = (item: any): boolean =>
  Boolean(
    typeof item === 'object' &&
      item !== null &&
      ((typeof item.duration === 'number' &&
        (typeof item.startTime === 'number' ||
          (typeof item.startTime === 'object' &&
            typeof item.startTime?.now === 'number'))) ||
        ('span' in item &&
          typeof item.span === 'object' &&
          isValid(item.span))),
  )

const asciiTimelineSerializer = {
  test: (val: unknown) =>
    Array.isArray(val) && val.every((item) => isValid(item)),
  print: (val: unknown) =>
    generateAsciiTimeline(val as PerformanceEntry[], {
      width: 80,
    }),
} as const

expect.addSnapshotSerializer(asciiTimelineSerializer)

// eslint-disable-next-line import/no-default-export
export default asciiTimelineSerializer
