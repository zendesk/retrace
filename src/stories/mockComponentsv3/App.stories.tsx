/* eslint-disable no-console */
import { useEffect } from 'react'
import * as React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { createConsoleTraceLogger } from '../../v3/ConsoleTraceLogger'
import TraceManagerDebugger from '../../v3/TraceManagerDebugger'
import { App } from './App'
import { traceManager } from './traceManager'

const meta: Meta<typeof App> = {
  component: App,
}

// eslint-disable-next-line import/no-default-export
export default meta
type Story = StoryObj<typeof App>

export const Primary: Story = {
  render: () => <App />,
}

export const WithDebugger: Story = {
  render: () => (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <TraceManagerDebugger traceManager={traceManager} />
      </div>
      <App />
    </div>
  ),
}

export const WithFloatingDebugger: Story = {
  render: () => (
    <div>
      <App />
      <TraceManagerDebugger traceManager={traceManager} float={true} />
    </div>
  ),
}

export const WithConsoleTraceLogger: Story = {
  render: () => {
    // Initialize the console trace logger when the story renders
    useEffect(() => {
      const consoleLogger = createConsoleTraceLogger(traceManager, {
        verbose: true,
      })

      // Log a message to explain how to use the console
      console.info(
        'ConsoleTraceLogger is active. Open your browser console to see trace events. ' +
          'Try clicking on tickets to see trace events logged in real-time.',
      )

      // Clean up the logger when the component unmounts
      return () => {
        consoleLogger.cleanup()
        console.info(
          'ConsoleTraceLogger has been cleaned up and unsubscribed from all events.',
        )
      }
    }, [])

    return <App />
  },
}
