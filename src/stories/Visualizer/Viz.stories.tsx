import * as React from 'react'
import type { Meta, StoryObj } from '@storybook/react-webpack5'
// eslint-disable-next-line import/no-extraneous-dependencies
import { useScreenSize } from '@visx/responsive'
import OperationVisualizer, {
  type OperationVisualizerProps,
} from '../../visualizer'

export const OperationVisualizerStory: StoryObj<OperationVisualizerProps> = {
  render: () => {
    const { width } = useScreenSize()
    return <OperationVisualizer width={width} />
  },
}

const Component: React.FunctionComponent<{}> = () => <>Hello world</>

const meta: Meta<{}> = {
  component: Component,
}

// eslint-disable-next-line import/no-default-export
export default meta
