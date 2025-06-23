import { adjustTimestampBy } from '../v3/ensureTimestamp'
import type { SupportedSpanTypes } from './constants'
import type { MappedSpanAndAnnotation, RecordingInputFile } from './types'

const orderArray = [
  'longtask',
  'long-animation-frame',
  'computed-span',
  'component-render',
  'measure',
  'resource',
  'resource-ember',
  'asset',
  'iframe',
] satisfies SupportedSpanTypes[]

const ASSET_EXTENSIONS = [
  '.mp3',
  '.mp4',
  '.webm',
  '.wav',
  '.ogg',
  '.flac',
  '.aac',
  '.aiff',
  '.wma',
  '.m4a',
  '.flv',
  '.avi',
  '.mov',
  '.wmv',
  '.mpg',
  '.mpeg',
  '.mkv',
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.bmp',
  '.tiff',
  '.svg',
  '.ico',
  '.css',
  '.scss',
  '.less',
  '.styl',
  '.html',
  '.htm',
  '.xml',
  '.js',
]

const order: Record<string, number> = Object.fromEntries(
  orderArray.map((type, idx) => [type, idx]),
)

export interface MappedOperation {
  name: string
  spanEvents: MappedSpanAndAnnotation[]
  spanTypes: Set<SupportedSpanTypes>
  spansWithDuration: MappedSpanAndAnnotation[]
  uniqueGroups: string[]
  duration: number
}

export const mapOperationForVisualization = (
  traceRecording: RecordingInputFile,
  {
    collapseRenders = true,
    collapseAssets = true,
    collapseEmberResources = false,
    collapseIframes = false,
    displayResources = true,
    displayMeasures = true,
  } = {},
): MappedOperation | null => {
  const allEntries = traceRecording.entries
  if (!allEntries) return null

  const preMappedEntries = allEntries.flatMap<
    MappedSpanAndAnnotation & { overrideGroupName?: string }
  >((entry) => {
    if (entry.span.type === 'component-render-start') {
      return []
    }
    const mapped: MappedSpanAndAnnotation = {
      span: entry.span,
      annotation: entry.annotation,
      groupName: entry.span.name,
      type: entry.span.type,
    }
    let overrideGroupName: string | undefined
    let { type } = mapped

    if (type === 'resource') {
      const filename = (mapped.span.performanceEntry?.name ?? mapped.span.name)
        .split('/')
        .at(-1)
        ?.split('?')
        .at(0)
      const extension = filename?.split('.').at(-1)

      if (
        filename === '$file' ||
        (extension && ASSET_EXTENSIONS.includes(`.${extension}`))
      ) {
        overrideGroupName = overrideGroupName ?? extension
        type = 'asset'
      }
    }
    if (collapseRenders && type === 'component-render') {
      overrideGroupName = 'renders'
    }
    if (collapseAssets && type === 'asset') {
      overrideGroupName = 'assets'
    }
    if (collapseIframes && type === 'iframe') {
      overrideGroupName = 'iframes'
    }
    if (type === 'asset' || type === 'iframe') {
      overrideGroupName =
        overrideGroupName ?? mapped.groupName.split('/').at(-1)
    }
    if (
      type === 'measure' &&
      (entry.span.name.endsWith('/tti') || entry.span.name.endsWith('/ttr'))
    ) {
      // remove suffix from measure name
      overrideGroupName = entry.span.name.split('/').slice(0, -1).join('/')
    }
    if (entry.span.name.startsWith('https://')) {
      const shortenedName = entry.span.name.split('zendesk.com').at(-1)
      if (mapped.span.attributes?.initiatorType === 'xmlhttprequest') {
        overrideGroupName = collapseEmberResources
          ? 'ember-resource'
          : overrideGroupName ?? shortenedName
        type = 'resource-ember'
      }
      if (type === 'resource') {
        overrideGroupName = overrideGroupName ?? shortenedName
      }
    }
    return {
      ...mapped,
      overrideGroupName,
      type,
    }
  })

  const mappedEntries = preMappedEntries.map<MappedSpanAndAnnotation>(
    (mapped, idx) => {
      if (mapped.groupName.startsWith('graphql/')) {
        const clientName = mapped.span.attributes?.apolloClientName
        const commonName = mapped.overrideGroupName ?? mapped.groupName
        if (clientName === 'local' && mapped.span.attributes?.feature) {
          const { feature } = mapped.span.attributes
          const matchingResourceTask = preMappedEntries.find(
            (t) =>
              t.span.attributes?.feature === feature && t.type === 'resource',
          )
          if (matchingResourceTask) {
            matchingResourceTask.groupName = commonName
          }
          return {
            ...mapped,
            groupName: commonName,
            type: 'resource',
          }
        }
        return {
          ...mapped,
          groupName: commonName,
          type: 'resource',
        }
      }
      return {
        ...mapped,
        groupName: mapped.overrideGroupName ?? mapped.groupName,
      }
    },
  )

  const entriesFromComputedSpans = Object.entries(
    traceRecording.computedSpans,
  ).map<MappedSpanAndAnnotation>(([name, computedSpan]) => ({
    groupName: name,
    type: 'computed-span',
    span: {
      id: `computed-span-${name}-${traceRecording.id}`,
      type: 'computed-span',
      duration: computedSpan.duration,
      name,
      startTime: adjustTimestampBy(
        traceRecording.startTime,
        computedSpan.startOffset,
      ),
      relatedTo: traceRecording.relatedTo,
    },
    annotation: {
      id: traceRecording.id,
      occurrence: 1,
      operationRelativeStartTime: computedSpan.startOffset,
      operationRelativeEndTime:
        computedSpan.startOffset + computedSpan.duration,
    },
  }))

  // Add computedRenderBeaconSpans as three computed-span entries per beacon
  const entriesFromComputedRenderBeaconSpans = Object.entries(
    traceRecording.computedRenderBeaconSpans || {},
  ).flatMap<MappedSpanAndAnnotation>(([beaconName, beaconSpan]) => [
    {
      groupName: beaconName,
      type: 'computed-span',
      span: {
        id: `computed-span-${beaconName}-${traceRecording.id}`,
        type: 'computed-span',
        duration: beaconSpan.firstRenderTillContent,
        name: `${beaconName}/firstRenderTillContent`,
        startTime: adjustTimestampBy(
          traceRecording.startTime,
          beaconSpan.startOffset,
        ),
        relatedTo: traceRecording.relatedTo,
      },
      annotation: {
        id: traceRecording.id,
        occurrence: 1,
        operationRelativeStartTime: beaconSpan.startOffset,
        operationRelativeEndTime:
          beaconSpan.startOffset + beaconSpan.firstRenderTillContent,
      },
    },
    {
      groupName: beaconName,
      type: 'computed-span',
      span: {
        id: `computed-span-${beaconName}-${traceRecording.id}`,
        type: 'computed-span',
        duration: beaconSpan.firstRenderTillLoading,
        name: `${beaconName}/firstRenderTillLoading`,
        startTime: adjustTimestampBy(
          traceRecording.startTime,
          beaconSpan.startOffset,
        ),
        relatedTo: traceRecording.relatedTo,
      },
      annotation: {
        id: traceRecording.id,
        occurrence: 1,
        operationRelativeStartTime: beaconSpan.startOffset,
        operationRelativeEndTime:
          beaconSpan.startOffset + beaconSpan.firstRenderTillLoading,
      },
    },
    {
      groupName: beaconName,
      type: 'computed-span',
      span: {
        id: `computed-span-${beaconName}-${traceRecording.id}`,
        type: 'computed-span',
        duration: beaconSpan.firstRenderTillData,
        name: `${beaconName}/firstRenderTillData`,
        startTime: adjustTimestampBy(
          traceRecording.startTime,
          beaconSpan.startOffset,
        ),
        relatedTo: traceRecording.relatedTo,
      },
      annotation: {
        id: traceRecording.id,
        occurrence: 1,
        operationRelativeStartTime: beaconSpan.startOffset,
        operationRelativeEndTime:
          beaconSpan.startOffset + beaconSpan.firstRenderTillData,
      },
    },
  ])

  const entriesWithComputedSpans = [
    ...mappedEntries,
    ...entriesFromComputedSpans,
    ...entriesFromComputedRenderBeaconSpans,
  ].sort((a, b) => {
    const orderA = order[a.type] ?? 100
    const orderB = order[b.type] ?? 100
    return orderA - orderB
  })

  const spansWithDuration = entriesWithComputedSpans
    .filter((task) => task.span.duration > 0)
    .filter(
      (task) =>
        (displayResources || task.type !== 'resource') &&
        (displayMeasures || task.type !== 'measure'),
    )

  const spanEvents = entriesWithComputedSpans.filter(
    (entry) => entry.span.duration === 0,
  )
  const spanTypes = new Set(spansWithDuration.map((entry) => entry.type))

  const uniqueGroups = [
    ...new Set(spansWithDuration.map((task) => task.groupName)),
  ]

  return {
    name: traceRecording.name,
    spansWithDuration,
    uniqueGroups,
    spanEvents,
    spanTypes,
    duration:
      traceRecording.duration ??
      traceRecording.entries.at(-1)?.annotation.operationRelativeEndTime ??
      0,
  }
}
