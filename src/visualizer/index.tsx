/* eslint-disable import/no-extraneous-dependencies */
import '@zendeskgarden/css-bedrock'
import { useEffect, useMemo, useState } from 'react'
import * as React from 'react'
import { DEFAULT_THEME, ThemeProvider } from '@zendeskgarden/react-theming'
import { DropTarget } from './components/DropTarget'
import FileUploadButton from './components/FileUploadButton'
import OperationVisualization from './components/OperationVisualization'
import {
  COLLAPSE_ASSET_SPANS_TEXT,
  COLLAPSE_EMBER_RESOURCE_SPANS,
  COLLAPSE_IFRAME_SPANS,
  COLLAPSE_RENDER_SPANS_TEXT,
  type FilterOption,
  MEASURES_TEXT,
  RESOURCES_TEXT,
} from './constants'
import { mapOperationForVisualizationHierarchical } from './mapOperationForVisualization'
import type { RecordingInputFile } from './types'

const STORAGE_KEY = {
  FILE_CONTENT: 'visualizer-file-content',
  DISPLAY_OPTIONS: 'visualizer-display-options',
} as const

function getStoredContent(): RecordingInputFile | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY.FILE_CONTENT)
    return stored ? (JSON.parse(stored) as RecordingInputFile) : null
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to parse stored content:', error)
    return null
  }
}

const defaultDisplayOptions = {
  [RESOURCES_TEXT]: true,
  [MEASURES_TEXT]: true,
  [COLLAPSE_RENDER_SPANS_TEXT]: true,
  [COLLAPSE_ASSET_SPANS_TEXT]: true,
  [COLLAPSE_EMBER_RESOURCE_SPANS]: false,
  [COLLAPSE_IFRAME_SPANS]: false,
}

function getStoredDisplayOptions(): Record<FilterOption, boolean> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY.DISPLAY_OPTIONS)
    return stored
      ? {
          ...defaultDisplayOptions,
          ...(JSON.parse(stored) as Record<FilterOption, boolean>),
        }
      : defaultDisplayOptions
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to parse stored display options:', error)
    return defaultDisplayOptions
  }
}

export interface OperationVisualizerProps {
  width: number
  margin?: { top: number; right: number; bottom: number; left: number }
}

const OperationVisualizer = ({ width, margin }: OperationVisualizerProps) => {
  const [displayOptions, setDisplayOptions] = useState(() =>
    getStoredDisplayOptions(),
  )

  const [fileContent, setFileContent] = useState<RecordingInputFile | null>(
    () => getStoredContent(),
  )

  // Persist file content changes to localStorage
  useEffect(() => {
    if (fileContent) {
      localStorage.setItem(
        STORAGE_KEY.FILE_CONTENT,
        JSON.stringify(fileContent),
      )
    }
  }, [fileContent])

  // Persist display options changes to localStorage
  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY.DISPLAY_OPTIONS,
      JSON.stringify(displayOptions),
    )
  }, [displayOptions])

  const readFile = (file: File | undefined) => {
    if (file && file.type === 'application/json') {
      const reader = new FileReader()
      reader.addEventListener('load', (e) => {
        const result = e.target?.result
        if (result && typeof result === 'string') {
          const content = JSON.parse(result) as RecordingInputFile
          // Parse the JSON file as a TraceRecording
          setFileContent(content)
        }
      })
      reader.readAsText(file)
    }
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    readFile(file)
  }

  const handleDrop: React.DragEventHandler = (e) => {
    if (e.dataTransfer.files.length > 0) {
      readFile(e.dataTransfer.files[0])
    }
  }

  const mappedFileContent = useMemo(() => {
    if (!fileContent) return null

    return mapOperationForVisualizationHierarchical(fileContent, {
      collapseRenders: displayOptions[COLLAPSE_RENDER_SPANS_TEXT],
      collapseAssets: displayOptions[COLLAPSE_ASSET_SPANS_TEXT],
      collapseEmberResources: displayOptions[COLLAPSE_EMBER_RESOURCE_SPANS],
      collapseIframes: displayOptions[COLLAPSE_IFRAME_SPANS],
      displayResources: displayOptions[RESOURCES_TEXT],
      displayMeasures: displayOptions[MEASURES_TEXT],
    })
  }, [fileContent, displayOptions])

  if (!fileContent) {
    return (
      <DropTarget onDrop={handleDrop}>
        <FileUploadButton
          onChange={handleFileChange}
          name="fileData"
          id="fileData"
        />
      </DropTarget>
    )
  }

  // If we failed validation or the mapping returned a null for some reason. Alternatively could wrap the whole thing in an ErrorBoundary?
  if (!mappedFileContent) return <div>Some error state</div>

  return (
    <ThemeProvider theme={DEFAULT_THEME}>
      <DropTarget onDrop={handleDrop}>
        <OperationVisualization
          width={width}
          margin={margin}
          operation={mappedFileContent}
          displayOptions={displayOptions}
          setDisplayOptions={setDisplayOptions}
        />
      </DropTarget>
    </ThemeProvider>
  )
}

export default OperationVisualizer
