import { CustomerSidebarOpenedOperation } from './customerSidebarTracer'
import { traceManager } from './traceManager'

export const ticketOperationTracer = traceManager.createTracer({
  name: `ticket-activation`,
  type: 'operation',
  adoptAsChildren: [CustomerSidebarOpenedOperation],
  requiredSpans: [
    {
      name: 'TicketView',
      matchingRelations: true,
      type: 'component-render',
      isIdle: true,
    },
  ],
  relationSchemaName: 'ticket',
  variants: {
    click: { timeout: 15_000 },
  },
  debounceOnSpans: [
    {
      name: 'TicketView',
      matchingRelations: true,
    },
  ],
  interruptOnSpans: [
    {
      name: 'TicketView',
      matchingRelations: true,
      type: 'component-unmount',
    },
  ],
  computedSpanDefinitions: {
    time_to_start_loading: {
      startSpan: 'operation-start',
      endSpan: {
        name: 'TicketView',
        matchingRelations: true,
        fn: (s) =>
          s.span.type === 'component-render' &&
          s.span.renderedOutput === 'loading',
      },
    },
  },
  computedValueDefinitions: {
    had_error: {
      matches: [{ name: 'TicketView', type: 'component-render', isIdle: true }],
      computeValueFromMatches: (matches) => {
        const error = matches.find(
          (m) =>
            m.span.type === 'component-render' &&
            m.span.renderedOutput === 'error',
        )
        return !!error
      },
    },
  },
  captureInteractive: true,
})
