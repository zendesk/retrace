import type { Preview } from '@storybook/react'
// import type { IndexEntry } from '@storybook/types';

const preview: Preview = {
  parameters: {
    actions: { argTypesRegex: '^on[A-Z].*' },
    layout: 'fullscreen',
    options: {
      // a and b are of type IndexEntry, but adding the type annotations generates a syntax warning in the console for some reason
      storySort: (a, b) => {
        if (a.title.includes('Visualizer')) return -1
        if (b.title.includes('Visualizer')) return 1
        return 0
      },
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/,
      },
    },
  },

  tags: ['autodocs']
}

export default preview
