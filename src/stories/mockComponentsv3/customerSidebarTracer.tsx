import { traceManager } from './traceManager'

export const CustomerSidebarOpenedOperation = `ticket.customer_sidebar.opened`

export const customerSidebarTracer = traceManager.createTracer({
  name: CustomerSidebarOpenedOperation,
  type: 'operation',
  requiredSpans: [
    {
      name: 'CustomerSidebar',
      matchingRelations: true,
      type: 'component-render',
      isIdle: true,
    },
  ],
  relationSchemaName: 'ticket',
  variants: {
    sidebar_open: { timeout: 10_000 },
  },
  debounceOnSpans: [
    {
      name: 'CustomerSidebar',
      matchingRelations: true,
    },
  ],
  interruptOnSpans: [
    {
      name: 'CustomerSidebar',
      matchingRelations: true,
      type: 'component-unmount',
    },
  ],
  computedSpanDefinitions: {
    time_to_start_loading: {
      startSpan: 'operation-start',
      endSpan: {
        name: 'CustomerSidebar',
        matchingRelations: true,
        fn: (s) =>
          s.span.type === 'component-render' &&
          s.span.renderedOutput === 'loading',
      },
    },
    time_to_show_content: {
      startSpan: 'operation-start',
      endSpan: {
        name: 'CustomerSidebar',
        matchingRelations: true,
        fn: (s) =>
          s.span.type === 'component-render' &&
          s.span.renderedOutput === 'content',
      },
    },
  },
  computedValueDefinitions: {
    customer_found: {
      matches: [
        { name: 'CustomerSidebar', type: 'component-render', isIdle: true },
      ],
      computeValueFromMatches: (matches) => {
        const contentMatch = matches.find(
          (m) =>
            m.span.type === 'component-render' &&
            m.span.renderedOutput === 'content',
        )
        return !!contentMatch
      },
    },
  },
  captureInteractive: true,
})
