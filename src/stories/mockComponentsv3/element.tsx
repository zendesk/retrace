import * as React from 'react'

const visuallyHiddenButRenderable: React.CSSProperties = {
  height: '1px',
  width: '1px',
  overflow: 'hidden',
  position: 'absolute',
  whiteSpace: 'nowrap',
  pointerEvents: 'none',
} as const

export const TimingComponent = React.memo(({ name }: { name: string }) => (
  <p
    // @ts-expect-error missing elementtiming from React types
    elementtiming={name}
    style={visuallyHiddenButRenderable}
  >
    &nbsp;
  </p>
))
