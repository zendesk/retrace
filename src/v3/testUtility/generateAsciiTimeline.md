Here's a detailed specification for the `generateAsciiTimeline` function, including a list of all the requirements and expected behavior.

---

### Specification: `generateAsciiTimeline`

#### Purpose

The purpose of `generateAsciiTimeline` is to generate an ASCII timeline visualization based on an array of `PerformanceEntry` objects, each representing an event with a start time and duration. The function outputs an ASCII diagram with clearly labeled events, timeline markers, and time labels, organizing overlapping elements into multiple rows as necessary.

#### Function Signature

```typescript
function generateAsciiTimeline(
  entries: PerformanceEntry[],
  options?: TimelineOptions,
): string
```

#### Parameters

- **entries**: `PerformanceEntry[]`
  - An array of objects where each `PerformanceEntry` has the following properties:
    - `name`: `string` - The label or name of the event.
    - `startTime`: `number` - The starting time of the event in milliseconds.
    - `duration`: `number` - The duration of the event in milliseconds.

- **options**: `TimelineOptions`
  - An optional configuration object with the following properties:
    - `scale`: `number` (optional) - The number of time units represented by each character in the timeline. If not provided, the function should auto-scale based on the maximum width.
    - `width`: `number` (optional) - The maximum width of the timeline in characters. The default width is 80 characters.

#### Return Value

- **string**: Returns a formatted ASCII string representing the timeline.

---

### Requirements

#### General Requirements

1. **Timeline Representation**:
   - Each event is represented on a timeline using a scale, with options to specify the scale manually or auto-scale based on the maximum width.

2. **Multi-Row Handling for Overlaps**:
   - If events overlap, they should be organized across multiple rows. `Events` rows should be filled from the row closest to the `Timeline` upward, and `Time` rows should be filled from the top down.

3. **Label Prefix Alignment**:
   - The prefixes `Events:`, `Timeline:`, and `Time:` should be padded with spaces to match the longest prefix, ensuring each section is aligned vertically.

#### Event Representation

1. **Instantaneous Events (`duration = 0`)**:
   - Represented by a single `|` at the corresponding position on the timeline.

2. **Events with Duration**:
   - If the event fits in a single character based on the scale, represent it as `|`.
   - If it fits in two characters, represent it as `[]`.
   - If it spans more than two characters, represent it with `[+]`, where the number of `+` symbols corresponds to the duration based on the scale. The `[` and `]` indicate the start and end of the event.

#### Time Labels

1. **Correspondence to Event Start Times**:
   - Each time label should correspond to an event’s start time, placed at the position calculated by the scale.

2. **Multi-Row Time Labels for Overlap**:
   - If time labels overlap, they should be distributed across multiple rows, starting from the highest row and moving downward as needed.

3. **Minimum Spacing Between Time Labels**:
   - Ensure at least one space between adjacent time labels within the same row. If spacing cannot be maintained, move the overlapping label to a lower row.

4. **Overflow Indicators (`|`)**:
   - For both `Events` and `Time` rows, place a `|` in the row above (for `Events`) or below (for `Time`) whenever a label in an additional row causes overflow. Only place `|` if there is no other character at that position to avoid overwriting data.

#### Scaling and Width

1. **Scale Calculation**:
   - If no scale is provided, calculate a scale that maximizes the timeline's fit within the specified or default width (80 characters).

2. **Auto-Scaling**:
   - Adjust the scale dynamically based on the total time span of events, ensuring that the timeline does not exceed the specified width.

3. **Width Constraints**:
   - Ensure that the timeline's length does not exceed the specified width. Truncate events that would extend beyond the maximum width.

---

### Example Scenarios

#### Scenario 1: Single Event

Input:

```typescript
;[{ name: 'Event', startTime: 0, duration: 100 }]
```

Expected Output:

```
events   | Event(100)
timeline | | [+++]
time     | | 0
```

#### Scenario 2: Mixed Durations and Overlapping Times

Input:

```typescript
;[
  { name: 'Mark', startTime: 0, duration: 0 },
  { name: 'Task', startTime: 200, duration: 300 },
  { name: 'Task', startTime: 250, duration: 100 },
  { name: 'Task', startTime: 650, duration: 50 },
  { name: 'Mark', startTime: 700, duration: 0 },
  { name: 'Task', startTime: 950, duration: 200 }, // Overlapping event
]
```

Expected Output:

```
events   |              Task(300)                     Task(50)
events   | Mark         |  Task(100)                  |  Mark             Task(200)
timeline | |------------[++++++++++++++++++]----------[+]|----------------[+++++++++++]--
timeline | ----------------[++++]--------------------------------------------------------
time     | 0            200|                          650|                950
time     |                 250                           700
```

#### Scenario 3

Input:

```typescript
;[
  { name: 'Start', startTime: 0, duration: 0 },
  { name: 'Init', startTime: 100, duration: 50 },
  { name: 'Load', startTime: 150, duration: 200 },
  { name: 'Render', startTime: 400, duration: 100 },
  { name: 'End', startTime: 600, duration: 0 },
]
```

Expected Output:

```
events   |                                          End
events   | Start Init(50)  Load(200)        Render(100)
timeline | |-----[]--------[+++++]----------[++]----|
time     | 0     100       150              400     600
```

#### Scenario 4

Input:

```ts
;[
  {
    duration: 0,
    entryType: 'fmp',
    name: 'fmp',
    startTime: 200,
  },
  {
    duration: 50,
    entryType: 'longtask',
    name: 'longtask',
    startTime: 300,
  },
  {
    duration: 100,
    entryType: 'longtask',
    name: 'longtask',
    startTime: 350,
  },
  {
    duration: 200,
    entryType: 'longtask',
    name: 'longtask',
    startTime: 550,
  },
  {
    duration: 0,
    entryType: 'mark',
    name: 'mark',
    startTime: 700,
  },
]
```

Output:

```
events   | fmp           longtask(50)                        longtask(200)
events   | |             |      longtask(100)                |                    mark
timeline | |-------------[+++++][++++++++++++]---------------[++++++++++++++++++++++++++]--
timeline | -----------------------------------------------------------------------|--------
time     | 200           300    350                          550                  700
```
