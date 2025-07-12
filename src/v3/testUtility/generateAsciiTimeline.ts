/* eslint-disable no-continue */
/* eslint-disable @typescript-eslint/prefer-for-of */

import type { SpanBase } from '../spanTypes'

export interface TimelineOptions {
  scale?: number // time units per character
  width?: number // maximum width of the timeline in characters
  startTime?: number // forced start time for the timeline
  gapThreshold?: number // fraction of total time to consider a gap as long (default 0.2 for 20%)
}

const EVENTS = 'events'
const TIMELINE = 'timeline'
const TIME = 'time (ms)'

const DEFAULT_MAX_WIDTH = 80
const DEFAULT_GAP_THRESHOLD = 0.2

// Function to format durations nicely
function formatDuration(duration: number): string {
  // Display in milliseconds
  return `${Math.round(duration)}`
}

// Function to generate the gap marker string based on the duration
function generateGapMarker(duration: number): string {
  const durationStr = formatDuration(duration)
  return `-<⋯ +${durationStr} ⋯>-`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SpanLike = Pick<SpanBase<any>, 'startTime' | 'duration' | 'name' | 'type'>

interface PerformanceEntryLike {
  duration: number
  entryType: string
  name: string
  startTime: number
}

const makePerformanceEntryLike = (
  entry: PerformanceEntryLike | SpanLike | { span: SpanLike },
): PerformanceEntryLike => {
  if ('entryType' in entry) {
    return entry
  }
  if ('span' in entry) {
    // eslint-disable-next-line no-param-reassign
    entry = entry.span
  }
  return {
    duration: entry.duration,
    entryType: entry.type,
    name: entry.name,
    startTime: entry.startTime.now,
  }
}

export function generateAsciiTimeline(
  spans: (PerformanceEntryLike | SpanLike)[],
  options: TimelineOptions = {},
): string {
  const maxWidth = options.width ?? DEFAULT_MAX_WIDTH
  const gapThreshold = options.gapThreshold ?? DEFAULT_GAP_THRESHOLD

  if (spans.length === 0) {
    return ''
  }

  const entries = spans.map(makePerformanceEntryLike)

  // Determine the time range
  const minTime =
    options.startTime ?? Math.min(...entries.map((e) => e.startTime))
  const maxTime = Math.max(...entries.map((e) => e.startTime + e.duration))
  const totalTime = maxTime - minTime

  // Sort entries by startTime
  const sortedEntries = [...entries].sort((a, b) => a.startTime - b.startTime)

  // Merge overlapping events to find active periods
  interface TimePeriod {
    start: number
    end: number
  }

  const activePeriods: TimePeriod[] = []
  for (const entry of sortedEntries) {
    const entryEnd = entry.startTime + entry.duration
    if (activePeriods.length === 0) {
      activePeriods.push({ start: entry.startTime, end: entryEnd })
    } else {
      const last = activePeriods[activePeriods.length - 1]!
      if (entry.startTime <= last.end) {
        // Overlapping, extend the last period
        last.end = Math.max(last.end, entryEnd)
      } else {
        // Non-overlapping, add new period
        activePeriods.push({ start: entry.startTime, end: entryEnd })
      }
    }
  }

  // Find gaps between active periods
  interface Segment {
    type: 'active' | 'gap'
    start: number
    end: number
  }

  const segments: Segment[] = []
  let current = minTime

  for (const period of activePeriods) {
    if (period.start > current) {
      // Gap exists
      segments.push({ type: 'gap', start: current, end: period.start })
    }
    // Active period
    segments.push({ type: 'active', start: period.start, end: period.end })
    current = period.end
  }

  // Check for gap after the last active period
  if (current < maxTime) {
    segments.push({ type: 'gap', start: current, end: maxTime })
  }

  // Determine which gaps to compress based on threshold
  const compressedSegments: Segment[] = []
  let numCompressedGaps = 0

  for (const segment of segments) {
    if (segment.type === 'gap') {
      const gapDuration = segment.end - segment.start
      if (gapDuration / totalTime > gapThreshold) {
        // Compress this gap
        compressedSegments.push({
          type: 'gap',
          start: segment.start,
          end: segment.end,
        })
        numCompressedGaps += 1
      } else {
        // Treat as active to maintain scale
        compressedSegments.push({
          type: 'active',
          start: segment.start,
          end: segment.end,
        })
      }
    } else {
      compressedSegments.push(segment)
    }
  }

  // Calculate the total active time
  const totalActiveTime = compressedSegments
    .filter((seg) => seg.type === 'active')
    .reduce((sum, seg) => sum + (seg.end - seg.start), 0)

  // Calculate the scale
  const availableWidth = maxWidth - numCompressedGaps * 10 // Estimate average gap marker length
  const effectiveAvailableWidth = availableWidth > 0 ? availableWidth : maxWidth
  const scale =
    options.scale ??
    Math.max(1, Math.ceil(totalActiveTime / effectiveAvailableWidth))

  // Build the timeline segments with their character lengths
  interface TimelineSegment {
    type: 'active' | 'gap'
    start: number
    end: number
    charLength: number
    gapMarker?: string // Only for gap segments
  }

  const timelineSegments: TimelineSegment[] = []

  for (const segment of compressedSegments) {
    if (segment.type === 'active') {
      const duration = segment.end - segment.start
      const length = Math.max(1, Math.floor(duration / scale))
      timelineSegments.push({
        type: 'active',
        start: segment.start,
        end: segment.end,
        charLength: length,
      })
    } else if (segment.type === 'gap') {
      const gapDuration = segment.end - segment.start
      const gapMarker = generateGapMarker(gapDuration)
      const charLength = gapMarker.length
      timelineSegments.push({
        type: 'gap',
        start: segment.start,
        end: segment.end,
        charLength,
        gapMarker, // Store the gap marker string
      })
    }
  }

  // Calculate the total timeline length
  const timelineLength = timelineSegments.reduce(
    (sum, seg) => sum + seg.charLength,
    0,
  )

  // Map time ranges to character ranges
  type CumulativeSegment = TimelineSegment & {
    charStart: number
    charEnd: number
  }

  const cumulativeSegments: CumulativeSegment[] = []
  let cumulativeChar = 0

  for (const seg of timelineSegments) {
    const charStart = cumulativeChar
    const charEnd = cumulativeChar + seg.charLength
    cumulativeSegments.push({
      ...seg,
      charStart,
      charEnd,
    })
    cumulativeChar += seg.charLength
  }

  // Function to map a given time to character position
  const mapTimeToChar = (time: number, round: 'down' | 'up' = 'up'): number => {
    for (const seg of cumulativeSegments) {
      if (seg.type === 'active') {
        if (time >= seg.start && time < seg.end) {
          const relativeTime = time - seg.start
          const relativeChar =
            round === 'down'
              ? Math.floor(relativeTime / scale)
              : Math.ceil(relativeTime / scale)
          return seg.charStart + Math.min(relativeChar, seg.charLength - 1)
        }
        if (time === seg.end) {
          // Map to the last character of active segment
          return seg.charEnd - 1
        }
      } else if (seg.type === 'gap' && time >= seg.start && time < seg.end) {
        // Map to the start of the gap marker
        return seg.charStart
      }
    }
    // If time is exactly at maxTime
    return timelineLength - 1
  }

  // Assign events to rows based on event overlaps
  const eventRows: PerformanceEntryLike[][] = []

  const isOverlap = (
    row: PerformanceEntryLike[],
    entry: PerformanceEntryLike,
  ): boolean => {
    for (const e of row) {
      if (
        !(
          entry.startTime >= e.startTime + e.duration ||
          entry.startTime + entry.duration <= e.startTime
        )
      ) {
        return true
      }
    }
    return false
  }

  // Assign events to rows
  for (const entry of sortedEntries) {
    let placed = false
    for (const row of eventRows) {
      if (!isOverlap(row, entry)) {
        row.push(entry)
        placed = true
        break
      }
    }
    if (!placed) {
      eventRows.push([entry])
    }
  }

  // Determine the maximum prefix length
  const prefixes = [EVENTS, TIMELINE, TIME]
  const maxPrefixLength = prefixes.reduce(
    (max, prefix) => Math.max(max, prefix.length),
    0,
  )

  // Pad all prefixes to the maximum length
  const padPrefix = (prefix: string) => prefix.padEnd(maxPrefixLength, ' ')

  // Initialize label rows for event labels
  const labelRows: string[][] = []
  for (let i = 0; i < eventRows.length; i++) {
    labelRows.push([])
  }

  // Function to check if label can be placed in a row without overlapping
  const canPlaceLabel = (
    row: string[],
    start: number,
    length: number,
  ): boolean => {
    for (let i = start; i < start + length; i++) {
      if (i >= row.length) continue // Allow extending
      if (row[i] !== ' ') return false
    }
    return true
  }

  // Function to place label in the first available row
  const placeLabel = (label: string, start: number) => {
    for (let rowIndex = 0; rowIndex < labelRows.length; rowIndex++) {
      const row = labelRows[rowIndex]!
      // Ensure the row is long enough
      if (start + label.length > row.length) {
        row.length = start + label.length
        for (let i = 0; i < row.length; i++) {
          if (row[i] === undefined) row[i] = ' '
        }
      }
      if (canPlaceLabel(row, start, label.length)) {
        for (let i = 0; i < label.length; i++) {
          row[start + i] = label[i]!
        }
        return
      }
    }
    // If no existing row can accommodate, add a new one
    const newRow: string[] = []
    newRow.length = start + label.length
    for (let i = 0; i < newRow.length; i++) {
      newRow[i] = ' '
    }
    for (let i = 0; i < label.length; i++) {
      newRow[start + i] = label[i]!
    }
    labelRows.push(newRow)
  }

  // Place event labels in label rows considering label length
  for (let rowIndex = 0; rowIndex < eventRows.length; rowIndex++) {
    const row = eventRows[rowIndex]!
    for (const entry of row) {
      const label =
        (entry.name !== 'self' ? entry.name : entry.entryType) +
        (entry.duration > 0 ? `(${entry.duration})` : '')
      const labelStartChar = mapTimeToChar(entry.startTime)

      // Place the label starting at labelStartChar
      placeLabel(label, labelStartChar)
    }
  }
  // Generate timeline lines
  const timelineLines: string[] = []
  for (let rowIndex = 0; rowIndex < eventRows.length; rowIndex++) {
    const row = eventRows[rowIndex]!
    const timelineRowArray = Array.from({ length: timelineLength }, () => '-')

    // Insert event markers
    for (const entry of row) {
      const startChar = mapTimeToChar(entry.startTime)
      // const endChar = mapTimeToChar(entry.startTime + entry.duration)
      // const durationChars = Math.max(1, endChar - startChar)

      if (entry.duration > 0) {
        const durationChars = Math.max(1, Math.floor(entry.duration / scale))
        if (durationChars === 1) {
          // Represent as '|'
          if (startChar < timelineRowArray.length) {
            timelineRowArray[startChar] = '|'
          }
        } else if (durationChars === 2) {
          // Represent as '[]'
          if (startChar < timelineRowArray.length) {
            timelineRowArray[startChar] = '['
          }
          if (startChar + 1 < timelineRowArray.length) {
            timelineRowArray[startChar + 1] = ']'
          }
        } else {
          // Represent as '[+...+]'
          if (startChar < timelineRowArray.length) {
            timelineRowArray[startChar] = '['
          }
          for (let d = 1; d < durationChars - 1; d++) {
            if (startChar + d < timelineRowArray.length) {
              timelineRowArray[startChar + d] = '+'
            }
          }
          if (startChar + durationChars - 1 < timelineRowArray.length) {
            timelineRowArray[startChar + durationChars - 1] = ']'
          }
        }
      } else if (startChar < timelineRowArray.length) {
        // Instantaneous event
        timelineRowArray[startChar] = '|'
      }
    }

    // Calculate active periods for the current row
    const rowActivePeriods: TimePeriod[] = []
    for (const entry of row) {
      const entryEnd = entry.startTime + entry.duration
      if (rowActivePeriods.length === 0) {
        rowActivePeriods.push({ start: entry.startTime, end: entryEnd })
      } else {
        const last = rowActivePeriods[rowActivePeriods.length - 1]!
        if (entry.startTime <= last.end) {
          // Overlapping, extend the last period
          last.end = Math.max(last.end, entryEnd)
        } else {
          // Non-overlapping, add new period
          rowActivePeriods.push({ start: entry.startTime, end: entryEnd })
        }
      }
    }

    // Find gaps in the current row
    const rowGaps: TimePeriod[] = []
    let currentTime = minTime
    for (const period of rowActivePeriods) {
      if (period.start > currentTime) {
        // Gap exists
        rowGaps.push({ start: currentTime, end: period.start })
      }
      currentTime = period.end
    }
    // Check for gap after the last active period
    if (currentTime < maxTime) {
      rowGaps.push({ start: currentTime, end: maxTime })
    }

    // Insert gap markers specific to the current row
    for (const gap of rowGaps) {
      const gapDuration = gap.end - gap.start
      if (gapDuration / totalTime > gapThreshold) {
        // Compress this gap
        const gapMarker = generateGapMarker(gapDuration).slice(0, -1)
        let startChar = mapTimeToChar(gap.start, 'down')
        while (
          timelineRowArray[startChar] &&
          timelineRowArray[startChar] !== '-'
        ) {
          startChar += 1
        }
        // Insert gapMarker into timelineRowArray at startChar
        for (let i = 0; i < gapMarker.length; i++) {
          if (
            startChar + i < timelineRowArray.length &&
            timelineRowArray[startChar + i] === '-'
          ) {
            timelineRowArray[startChar + i] = gapMarker[i]!
          }
        }
      }
    }

    timelineLines.push(`${timelineRowArray.join('').trimEnd()}`)
  }

  // Generate time label rows
  const timeEntries = sortedEntries.map((e) => ({
    time: e.startTime,
    label: e.startTime.toString(),
  }))

  // Remove duplicate time entries
  const uniqueTimeEntriesMap: Record<number, string> = {}
  for (const entry of timeEntries) {
    uniqueTimeEntriesMap[entry.time] = entry.label
  }
  const uniqueTimeEntries = Object.keys(uniqueTimeEntriesMap)
    .map((k) => Number.parseInt(k, 10))
    .sort((a, b) => a - b)
    .map((k) => ({ time: k, label: uniqueTimeEntriesMap[k]! }))

  // Assign time labels to rows to ensure at least 1 space between labels
  const timeLabelRows: string[][] = []
  for (const entry of uniqueTimeEntries) {
    const pos = mapTimeToChar(entry.time)
    const { label } = entry
    const startPos = pos
    const endPos = pos + label.length - 1

    // Attempt to place the label in existing rows
    let placed = false
    for (const row of timeLabelRows) {
      let canPlace = true
      for (let i = 0; i < label.length; i++) {
        const currentPos = startPos + i
        if (row[currentPos] && row[currentPos] !== ' ') {
          canPlace = false
          break
        }
      }
      // Check for at least one space before and after
      if (canPlace) {
        if (startPos > 0 && row[startPos - 1] && row[startPos - 1] !== ' ') {
          canPlace = false
        }
        if (
          endPos < row.length - 1 &&
          row[endPos + 1] &&
          row[endPos + 1] !== ' '
        ) {
          canPlace = false
        }
      }

      if (canPlace) {
        // Extend the row if necessary
        if (startPos + label.length > row.length) {
          row.length = startPos + label.length
          for (let i = 0; i < row.length; i++) {
            if (row[i] === undefined) row[i] = ' '
          }
        }
        for (let i = 0; i < label.length; i++) {
          row[startPos + i] = label[i]!
        }
        placed = true
        break
      }
    }

    if (!placed) {
      // Create a new row for the label
      const newRow: string[] = []
      newRow.length = startPos + label.length
      for (let i = 0; i < newRow.length; i++) {
        newRow[i] = ' '
      }
      for (let i = 0; i < label.length; i++) {
        newRow[startPos + i] = label[i]!
      }
      timeLabelRows.push(newRow)
    }
  }

  // Generate event label lines with padded prefixes
  const eventLabelLines = labelRows.map((row) =>
    `${padPrefix(EVENTS)} | ${row.join('')}`.trimEnd(),
  )

  // Generate timeline label lines with padded prefixes
  const timelineLabelLines = timelineLines.map(
    (line) => `${padPrefix(TIMELINE)} | ${line}`,
  )

  // Generate time label lines with padded prefixes
  const timeLabelLines = timeLabelRows.map((row) =>
    `${padPrefix(TIME)} | ${row.join('')}`.trimEnd(),
  )

  // Combine all parts
  const allLabelLines = eventLabelLines.reverse().join('\n')
  const allTimelineLines = timelineLabelLines.join('\n')
  const allTimeLabelLines = timeLabelLines.join('\n')

  return `${allLabelLines}\n${allTimelineLines}\n${allTimeLabelLines}`
}
