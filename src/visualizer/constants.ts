import type { SpanType } from '../v3/spanTypes'

export const RESOURCES_TEXT = 'Show Resources'
export const MEASURES_TEXT = 'Show Measures'
export const COLLAPSE_RENDER_SPANS_TEXT = 'Collapse Renders'
export const COLLAPSE_ASSET_SPANS_TEXT = 'Collapse Assets'
export const COLLAPSE_EMBER_RESOURCE_SPANS = 'Collapse Ember'
export const COLLAPSE_IFRAME_SPANS = 'Collapse iframes'

export const DETAILS_PANEL_WIDTH = 400

export type FilterOption =
  | typeof RESOURCES_TEXT
  | typeof MEASURES_TEXT
  | typeof COLLAPSE_RENDER_SPANS_TEXT
  | typeof COLLAPSE_ASSET_SPANS_TEXT
  | typeof COLLAPSE_EMBER_RESOURCE_SPANS
  | typeof COLLAPSE_IFRAME_SPANS

export const FILTER_OPTIONS: FilterOption[] = [
  RESOURCES_TEXT,
  MEASURES_TEXT,
  COLLAPSE_RENDER_SPANS_TEXT,
  COLLAPSE_ASSET_SPANS_TEXT,
  COLLAPSE_EMBER_RESOURCE_SPANS,
  COLLAPSE_IFRAME_SPANS,
]

export type SupportedSpanTypes =
  | SpanType
  | 'resource-ember'
  | 'asset'
  | 'iframe'
  | 'element'
  | 'action'
  | 'error'
  | 'computed-span'

export const BAR_FILL_COLOR: Record<SupportedSpanTypes, string> = {
  'component-render-start': '#000000', // invisible
  'component-render': '#ff7f0e',
  'hook-render-start': '#000000', // invisible
  'hook-render': '#c0e0e0',
  measure: '#2ca02c',
  resource: '#1f77b4',
  'resource-ember': '#17becf',
  longtask: '#d62728',
  'long-animation-frame': '#d62728',
  mark: '#9467bd',
  asset: '#8c564b',
  iframe: '#e377c2',
  element: '#7f7f7f',
  action: '#bcbd22',
  operation: '#547621',
  'computed-span': '#17becf',

  'component-unmount': '#ff9896',
  'hook-unmount': '#ff9896',
  error: '#ff9896',
  'first-input': '#aec7e8',
  'largest-contentful-paint': '#98df8a',
  'layout-shift': '#ff9896',
  'visibility-state': '#ff9896',
  event: '#ff9896',
  navigation: '#ff9896',
  paint: '#ff9896',
  taskattribution: '#ff9896',
}
