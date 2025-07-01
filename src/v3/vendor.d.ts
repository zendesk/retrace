declare namespace React {
  interface HTMLAttributes<T> extends AriaAttributes, DOMAttributes<T> {
    popover?: string
    popoverTarget?: string
  }
}
