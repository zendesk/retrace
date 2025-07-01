export const CSS_STYLES = /* CSS */ `
.tmdb-debugger-root {
  --tmdb-font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif;

  /* Colors - Base */
  --tmdb-color-white: #fff;
  --tmdb-color-black: #000;
  --tmdb-color-text-primary: #333;
  --tmdb-color-text-secondary: #555;
  --tmdb-color-text-tertiary: #616161; /* draft text */
  --tmdb-color-text-muted: #757575; /* noTrace, idChip text */
  --tmdb-color-text-light: #666; /* timeDisplay */
  --tmdb-color-text-error: #c62828; /* Interrupted, error icon */
  --tmdb-color-text-success: #2e7d32; /* Completed */
  --tmdb-color-text-info: #1565c0; /* Active */
  --tmdb-color-text-warning: #e65100; /* Spans group text */

  /* Colors - Backgrounds */
  --tmdb-color-bg-main: #f9f9f9;
  --tmdb-color-bg-content: #fff;
  --tmdb-color-bg-light-gray: #f5f5f5; /* listItem, preWrap, idChip bg, draft bg */
  --tmdb-color-bg-medium-gray: #f8f8f8; /* configChip bg */
  --tmdb-color-bg-dark-gray: #e0e0e0; /* renderStatsValue bg */
  --tmdb-color-bg-handle: #2a2a2a;
  --tmdb-color-bg-handle-hover: #3a3a3a; /* Added for handle hover */

  /* Colors - Borders */
  --tmdb-color-border-light: #ddd;
  --tmdb-color-border-medium: #eee;
  --tmdb-color-border-dark: #e0e0e0; /* activeTrace, noTrace, historyItem, preWrap, idChip, infoChip, renderStatsGroup */
  --tmdb-color-border-input: #e8e8e8; /* configChip */
  --tmdb-color-border-muted: #bdbdbd; /* unmatchedDot */

  /* Colors - Semantic & Accents */
  --tmdb-color-active-primary: #1565c0;
  --tmdb-color-active-primary-hover: #1976d2; /* Added for hover states */
  --tmdb-color-active-bg: #e3f2fd;
  --tmdb-color-active-bg-hover: #bbdefb; /* Added for hover states */
  --tmdb-color-active-border: #bbdefb;
  --tmdb-color-active-border-light: #90caf9;

  --tmdb-color-completed-primary: #2e7d32;
  --tmdb-color-completed-primary-hover: #388e3c; /* Added for hover states */
  --tmdb-color-completed-bg: #e8f5e9;
  --tmdb-color-completed-bg-hover: #c8e6c9; /* Added for hover states */
  --tmdb-color-completed-border: #c8e6c9;

  --tmdb-color-interrupted-primary: #c62828;
  --tmdb-color-interrupted-primary-hover: #d32f2f; /* Added for hover states */
  --tmdb-color-interrupted-bg: #ffebee;
  --tmdb-color-interrupted-bg-hover: #ffcdd2; /* Added for hover states */
  --tmdb-color-interrupted-border: #ffcdd2;

  /* Error-specific colors */
  --tmdb-color-error-primary: #dc3545;
  --tmdb-color-error-primary-hover: #c82333;
  --tmdb-color-error-bg: rgba(220, 53, 69, 0.05);
  --tmdb-color-error-bg-hover: rgba(220, 53, 69, 0.1);
  --tmdb-color-error-border: #dc3545;

  /* Time Marker Colors */
  --tmdb-color-fcr-primary: #0277bd; /* Deep blue */
  --tmdb-color-fcr-primary-hover: #0288d1;
  --tmdb-color-fcr-bg: #e1f5fe;
  --tmdb-color-fcr-bg-hover: #b3e5fc;
  --tmdb-color-fcr-border: #b3e5fc;

  --tmdb-color-lcr-primary: #00796b; /* Teal green */
  --tmdb-color-lcr-primary-hover: #00897b;
  --tmdb-color-lcr-bg: #e0f2f1;
  --tmdb-color-lcr-bg-hover: #b2dfdb;
  --tmdb-color-lcr-border: #b2dfdb;

  --tmdb-color-tti-primary: #7b1fa2; /* Purple */
  --tmdb-color-tti-primary-hover: #8e24aa;
  --tmdb-color-tti-bg: #f3e5f5;
  --tmdb-color-tti-bg-hover: #e1bee7;
  --tmdb-color-tti-border: #e1bee7;

  /* Spans Count Colors */
  --tmdb-color-items-primary: #546e7a; /* Blue gray */
  --tmdb-color-items-primary-hover: #607d8b;
  --tmdb-color-items-bg: #eceff1;
  --tmdb-color-items-bg-hover: #cfd8dc;
  --tmdb-color-items-border: #cfd8dc;

  --tmdb-color-draft-primary: #616161;
  --tmdb-color-draft-primary-hover: #757575; /* Added for hover states */
  --tmdb-color-draft-bg: #f5f5f5;
  --tmdb-color-draft-bg-hover: #e0e0e0; /* Added for hover states */

  --tmdb-color-link-primary: #1976d2;
  --tmdb-color-link-primary-hover: #1e88e5; /* Added for hover states */
  --tmdb-color-button-danger-primary: #f44336;
  --tmdb-color-button-danger-primary-hover: #e53935; /* Added for hover states */

  --tmdb-color-warning-primary: #e65100;
  --tmdb-color-warning-primary-hover: #ef6c00; /* Added for hover states */
  --tmdb-color-warning-bg: #fff3e0;
  --tmdb-color-warning-bg-hover: #ffe0b2; /* Added for hover states */
  --tmdb-color-warning-border: #ffe0b2;

  /* Colors - Timeline */
  --tmdb-timeline-loading-marker: #e67e22;
  --tmdb-timeline-loading-segment-bg: linear-gradient(to right, rgba(230, 126, 34, 0.15), rgba(230, 126, 34, 0.5));
  --tmdb-timeline-data-marker: #3498db;
  --tmdb-timeline-data-segment-bg: linear-gradient(to right, rgba(52, 152, 219, 0.15), rgba(52, 152, 219, 0.5));
  --tmdb-timeline-content-marker: #27ae60;
  --tmdb-timeline-content-segment-bg: linear-gradient(to right, rgba(39, 174, 96, 0.15), rgba(39, 174, 96, 0.5));
  --tmdb-timeline-default-segment-bg: linear-gradient(to right, rgba(189, 195, 199, 0.2), rgba(189, 195, 199, 0.4));
  --tmdb-timeline-start-marker: #7f8c8d;


  /* Spacing */
  --tmdb-space-xxs: 2px;
  --tmdb-space-xs: 3px; /* chip vertical padding */
  --tmdb-space-s: 4px;
  --tmdb-space-ms: 5px;
  --tmdb-space-m: 8px;
  --tmdb-space-ml: 10px; /* chip horizontal padding */
  --tmdb-space-l: 12px;
  --tmdb-space-xl: 15px;
  --tmdb-space-xxl: 20px;

  /* Borders */
  --tmdb-border-radius-small: 4px;
  --tmdb-border-radius-medium: 6px;
  --tmdb-border-radius-large: 8px;
  --tmdb-border-radius-xlarge: 10px; /* configChip */
  --tmdb-border-radius-pill: 12px; /* most chips */
  --tmdb-border-radius-circle: 50%;

  /* Font Sizes */
  --tmdb-font-size-xxs: 11px; /* defChip, configChip, idChip */
  --tmdb-font-size-xs: 12px; /* statusTag, buttons, infoChip, timeDisplay, timeline labels */
  --tmdb-font-size-s: 13px; /* listItem, requiredSpan */
  --tmdb-font-size-m: 14px; /* sectionTitle, handleTitle, minimizedButton */
  --tmdb-font-size-l: 15px; /* history item strong title */
  --tmdb-font-size-xl: 16px; /* dismissButton, RenderBeaconTimeline name */
  --tmdb-font-size-xxl: 18px; /* historyTitle, error/wrench icon */
  --tmdb-font-size-xxxl: 20px; /* title */

  /* Font Weights */
  --tmdb-font-weight-normal: 400;
  --tmdb-font-weight-medium: 500;
  --tmdb-font-weight-bold: 700; /* or 'bold' keyword */

  /* Shadows */
  --tmdb-shadow-small: 0 1px 3px rgba(0, 0, 0, 0.05);
  --tmdb-shadow-medium: 0 2px 8px rgba(0, 0, 0, 0.1);
  --tmdb-shadow-large: 0 4px 8px rgba(0, 0, 0, 0.15);
  --tmdb-shadow-xlarge: 0 6px 20px rgba(0, 0, 0, 0.15); /* floating container */
  --tmdb-shadow-button: 0 4px 10px rgba(0, 0, 0, 0.2); /* minimized button */
  --tmdb-shadow-button-hover: 0 6px 14px rgba(0, 0, 0, 0.25); /* hover state for button */

  /* Z-indices */
  --tmdb-z-index-timeline-marker: 0;
  --tmdb-z-index-timeline-bar: 1;
  --tmdb-z-index-timeline-text: 2;
  --tmdb-z-index-floating: 1000;
  --tmdb-z-index-tooltip: 1001;

  /* Timeline specific */
  --tmdb-timeline-bar-height: 25px;
  --tmdb-timeline-text-area-height: 18px;
  --tmdb-timeline-text-height: 14px;
  --tmdb-timeline-marker-line-width: 2px;
  --tmdb-timeline-padding-between-areas: 2px;

  /* Transitions */
  --tmdb-transition-fast: 0.15s ease;
  --tmdb-transition-medium: 0.2s ease;
  --tmdb-transition-slow: 0.3s ease;

  font-family: var(--tmdb-font-family);
}

.tmdb-container {
  max-width: 800px;
  margin: var(--tmdb-space-xxl) auto;
  padding: var(--tmdb-space-xxl);
  border: 1px solid var(--tmdb-color-border-light);
  border-radius: var(--tmdb-border-radius-large);
  box-shadow: var(--tmdb-shadow-medium);
  background-color: var(--tmdb-color-bg-main);
}

.tmdb-header {
  border-bottom: 1px solid var(--tmdb-color-border-medium);
  padding-bottom: var(--tmdb-space-xl);
  margin-bottom: var(--tmdb-space-xxl);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.tmdb-title {
  margin: 0;
  font-size: var(--tmdb-font-size-xxxl);
  font-weight: var(--tmdb-font-weight-bold);
  color: var(--tmdb-color-text-primary);
}

/* Active trace container, though not explicitly used with this class name in the original JS */
/* .tmdb-active-trace {
  padding: var(--tmdb-space-xxl);
  background-color: var(--tmdb-color-bg-content);
  border-radius: var(--tmdb-border-radius-large);
  margin-bottom: var(--tmdb-space-xxl);
  border: 1px solid var(--tmdb-color-border-dark);
  box-shadow: var(--tmdb-shadow-small);
} */

.tmdb-section {
  margin-bottom: var(--tmdb-space-xl);
}

.tmdb-section-title {
  font-weight: var(--tmdb-font-weight-bold);
  margin-bottom: var(--tmdb-space-ml);
  font-size: var(--tmdb-font-size-m);
  color: var(--tmdb-color-text-secondary);
}

/* Add hover styles to status tags */
.tmdb-status-tag {
  display: inline-block;
  padding: var(--tmdb-space-s) var(--tmdb-space-ml);
  border-radius: var(--tmdb-border-radius-pill);
  font-size: var(--tmdb-font-size-xs);
  font-weight: var(--tmdb-font-weight-medium);
  margin-left: var(--tmdb-space-ml);
  transition: filter var(--tmdb-transition-fast), transform var(--tmdb-transition-fast);
}
.tmdb-status-tag:hover {
  filter: brightness(0.95);
}
.tmdb-status-tag-active {
  background-color: var(--tmdb-color-active-bg);
  color: var(--tmdb-color-active-primary);
}
.tmdb-status-tag-active:hover {
  background-color: var(--tmdb-color-active-bg-hover);
}
.tmdb-status-tag-completed {
  background-color: var(--tmdb-color-completed-bg);
  color: var(--tmdb-color-completed-primary);
}
.tmdb-status-tag-completed:hover {
  background-color: var(--tmdb-color-completed-bg-hover);
}
.tmdb-status-tag-interrupted {
  background-color: var(--tmdb-color-interrupted-bg);
  color: var(--tmdb-color-interrupted-primary);
}
.tmdb-status-tag-interrupted:hover {
  background-color: var(--tmdb-color-interrupted-bg-hover);
}
.tmdb-status-tag-draft {
  background-color: var(--tmdb-color-draft-bg);
  color: var(--tmdb-color-draft-primary);
}
.tmdb-status-tag-draft:hover {
  background-color: var(--tmdb-color-draft-bg-hover);
}

.tmdb-list-item {
  padding: var(--tmdb-space-ms) var(--tmdb-space-xl);
  background-color: var(--tmdb-color-bg-light-gray);
  border-radius: var(--tmdb-border-radius-medium);
  margin-bottom: var(--tmdb-space-xs);
  font-size: var(--tmdb-font-size-s);
  display: flex;
  justify-content: space-between;
  align-items: center; /* Added for vertical alignment */
}

.tmdb-required-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--tmdb-space-ml) var(--tmdb-space-xl);
  background-color: var(--tmdb-color-bg-light-gray);
  border-radius: var(--tmdb-border-radius-medium);
  margin-bottom: var(--tmdb-space-m);
  font-size: var(--tmdb-font-size-s);
}
.tmdb-required-item-matched {
  border-left: 4px solid var(--tmdb-color-completed-primary);
}
.tmdb-required-item-unmatched {
  border-left: 4px solid var(--tmdb-color-text-muted);
}

.tmdb-matched-indicator {
  display: inline-block;
  width: var(--tmdb-space-l);
  height: var(--tmdb-space-l);
  border-radius: var(--tmdb-border-radius-circle);
  margin-right: var(--tmdb-space-ml);
}
.tmdb-matched-indicator-matched {
  background-color: var(--tmdb-color-completed-primary);
}
.tmdb-matched-indicator-unmatched {
  background-color: var(--tmdb-color-border-muted);
}

.tmdb-no-trace {
  padding: 30px; /* Kept specific padding */
  text-align: center;
  color: var(--tmdb-color-text-muted);
  font-style: italic;
}

.tmdb-history-title {
  margin-top: var(--tmdb-space-ml);
  margin-bottom: var(--tmdb-space-ml);
  font-size: var(--tmdb-font-size-xxl);
  font-weight: var(--tmdb-font-weight-bold);
  color: var(--tmdb-color-text-primary);
  display: flex;
  align-items: center;
  gap: var(--tmdb-space-ml);
  justify-content: space-between;
}
.tmdb-history-title-left,
.tmdb-history-title-right {
  display: flex;
  align-items: center;
  gap: var(--tmdb-space-ml);
}

.tmdb-button { /* Base for buttons if commonality increases */
  border: none;
  border-radius: var(--tmdb-border-radius-small);
  padding: var(--tmdb-space-s) var(--tmdb-space-ml);
  font-size: var(--tmdb-font-size-xs);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  text-decoration: none;
  transition: background-color var(--tmdb-transition-fast),
              box-shadow var(--tmdb-transition-fast),
              transform var(--tmdb-transition-fast);
}
.tmdb-button:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
}
.tmdb-button:active {
  transform: translateY(0);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}
.tmdb-visualizer-link {
  background-color: var(--tmdb-color-link-primary);
  color: var(--tmdb-color-white);
}
.tmdb-visualizer-link:hover {
  background-color: var(--tmdb-color-link-primary-hover);
}
.tmdb-clear-button {
  background-color: var(--tmdb-color-button-danger-primary);
  color: var(--tmdb-color-white);
}
.tmdb-clear-button:hover {
  background-color: var(--tmdb-color-button-danger-primary-hover);
}
.tmdb-download-button {
  background-color: var(--tmdb-color-link-primary);
  color: var(--tmdb-color-white);
  margin-left: var(--tmdb-space-ml);
}
.tmdb-download-button:hover {
  background-color: var(--tmdb-color-link-primary-hover);
}
.tmdb-download-icon {
  font-size: var(--tmdb-font-size-m); /* Approximation */
}


.tmdb-history-item {
  padding: var(--tmdb-space-xl);
  background-color: var(--tmdb-color-bg-content);
  border-radius: var(--tmdb-border-radius-large);
  margin-bottom: var(--tmdb-space-l);
  border: 1px solid var(--tmdb-color-border-dark);
  box-shadow: var(--tmdb-shadow-small);
  transition: box-shadow var(--tmdb-transition-medium);
  position: relative; /* For positioning the arrow */
}
.tmdb-history-item:hover {
  box-shadow: var(--tmdb-shadow-large);
}

.tmdb-history-item-error {
  border: 2px solid var(--tmdb-color-error-primary);
  background-color: var(--tmdb-color-error-bg);
  box-shadow: 0 0 0 1px var(--tmdb-color-error-primary), var(--tmdb-shadow-small);
}
.tmdb-history-item-error:hover {
  box-shadow: 0 0 0 1px var(--tmdb-color-error-primary), var(--tmdb-shadow-large);
}

.tmdb-history-header {
  display: flex;
  justify-content: space-between;
  cursor: pointer;
  align-items: center;
  margin-bottom: var(--tmdb-space-m);
}

.tmdb-history-header-sticky {
  position: sticky;
  top: 0;
  background-color: var(--tmdb-color-bg-content);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  z-index: 10;
  margin: calc(-1 * var(--tmdb-space-xl)) calc(-1 * var(--tmdb-space-xl)) var(--tmdb-space-m) calc(-1 * var(--tmdb-space-xl));
  padding: var(--tmdb-space-xl) var(--tmdb-space-xl) var(--tmdb-space-m) var(--tmdb-space-xl);
  border-top-left-radius: var(--tmdb-border-radius-large);
  border-top-right-radius: var(--tmdb-border-radius-large);
}

.tmdb-dismiss-button {
  background: none;
  border: none;
  color: var(--tmdb-color-interrupted-primary);
  cursor: pointer;
  font-size: var(--tmdb-font-size-xl);
  padding: var(--tmdb-space-xxs) var(--tmdb-space-m);
  border-radius: var(--tmdb-border-radius-circle);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px; /* Specific size */
  height: 24px; /* Specific size */
  transition: background-color var(--tmdb-transition-fast),
              color var(--tmdb-transition-fast),
              transform var(--tmdb-transition-fast);
}
.tmdb-dismiss-button:hover {
  background-color: var(--tmdb-color-interrupted-bg);
  transform: scale(1.1);
}
.tmdb-dismiss-button:active {
  transform: scale(1);
}

.tmdb-expand-arrow {
  display: flex;
  justify-content: center;
  align-items: center;
  transition: transform var(--tmdb-transition-medium);
  cursor: pointer;
  color: var(--tmdb-color-text-secondary);
  width: 24px;
  height: 24px;
}
.tmdb-expand-arrow:hover {
  color: var(--tmdb-color-text-primary);
}
.tmdb-expand-arrow-down {
  transform: rotate(0deg);
}
.tmdb-expand-arrow-up {
  transform: rotate(180deg);
}

.tmdb-expanded-history {
  display: flex;
  flex-direction: column;
  margin-top: var(--tmdb-space-xl);
  padding-top: var(--tmdb-space-xl);
  border-top: 1px dashed var(--tmdb-color-border-dark);
}

.tmdb-time-display {
  font-size: var(--tmdb-font-size-xs);
  color: var(--tmdb-color-text-light);
  font-weight: var(--tmdb-font-weight-medium);
}

.tmdb-trace-info-row {
  display: flex;
  gap: var(--tmdb-space-m);
  flex-wrap: nowrap;
  margin-bottom: var(--tmdb-space-ml);
  padding: var(--tmdb-space-m) 0;
  justify-content: space-between;
  align-items: center;
}

.tmdb-config-info-row {
  display: flex;
  gap: var(--tmdb-space-m);
  flex-wrap: wrap;
  margin-bottom: var(--tmdb-space-xxs);
  font-size: 90%; /* Kept percentage */
}

.tmdb-chip { /* Base for chips */
  padding: var(--tmdb-space-xs) var(--tmdb-space-ml);
  border-radius: var(--tmdb-border-radius-pill);
  font-size: var(--tmdb-font-size-xs);
  border: 1px solid var(--tmdb-color-border-dark);
}
.tmdb-info-chip {
  background-color: #f1f1f1; /* unique, kept */
  color: var(--tmdb-color-text-primary);
}
.tmdb-config-chip {
  background-color: var(--tmdb-color-bg-medium-gray);
  padding: var(--tmdb-space-xxs) var(--tmdb-space-m);
  border-radius: var(--tmdb-border-radius-xlarge);
  font-size: var(--tmdb-font-size-xxs);
  color: var(--tmdb-color-text-secondary);
  border: 1px solid var(--tmdb-color-border-input);
}
.tmdb-id-chip {
  background-color: var(--tmdb-color-bg-light-gray);
  color: var(--tmdb-color-text-muted);
  font-size: var(--tmdb-font-size-xxs);
}

/* Chip Groups (Label + Value pairs) */
.tmdb-chip-group {
  display: inline-flex;
  flex-wrap: nowrap;
  overflow: hidden;
  border-radius: var(--tmdb-border-radius-pill);
  transition: all var(--tmdb-transition-fast);
  margin: 0;
}
.tmdb-chip-group-label {
  padding: var(--tmdb-space-xs) var(--tmdb-space-m);
  font-size: var(--tmdb-font-size-xs);
}
.tmdb-chip-group-value {
  color: var(--tmdb-color-white);
  padding: var(--tmdb-space-xs) var(--tmdb-space-m);
  font-size: var(--tmdb-font-size-xs);
  font-weight: var(--tmdb-font-weight-medium);
}

.tmdb-variant-group {
  border: 1px solid var(--tmdb-color-completed-border);
  background-color: var(--tmdb-color-completed-bg);
  & .tmdb-chip-group-label {
    color: var(--tmdb-color-completed-primary);
  }
  & .tmdb-chip-group-value {
    background-color: var(--tmdb-color-completed-primary);
  }
}
.tmdb-variant-group:hover {
  background-color: var(--tmdb-color-completed-bg-hover);
  & .tmdb-chip-group-value {
    background-color: var(--tmdb-color-completed-primary-hover);
  }
}

.tmdb-items-group {
  border: 1px solid var(--tmdb-color-warning-border);
  background-color: var(--tmdb-color-warning-bg);
  & .tmdb-chip-group-label {
    color: var(--tmdb-color-warning-primary);
  }
  & .tmdb-chip-group-value {
    background-color: var(--tmdb-color-warning-primary);
  }
}
.tmdb-items-group:hover {
  background-color: var(--tmdb-color-warning-bg-hover);
  & .tmdb-chip-group-value {
    background-color: var(--tmdb-color-warning-primary-hover);
  }
}

.tmdb-reason-group {
  border: 1px solid var(--tmdb-color-interrupted-border);
  background-color: var(--tmdb-color-interrupted-bg);
  & .tmdb-chip-group-label {
    color: var(--tmdb-color-interrupted-primary);
  }
  & .tmdb-chip-group-value {
    background-color: var(--tmdb-color-interrupted-primary);
  }
}
.tmdb-reason-group:hover {
  background-color: var(--tmdb-color-interrupted-bg-hover);
  & .tmdb-chip-group-value {
    background-color: var(--tmdb-color-interrupted-primary-hover);
  }
}

.tmdb-related-group {
  border: 1px solid var(--tmdb-color-active-border);
  background-color: var(--tmdb-color-active-bg);
  & .tmdb-chip-group-label { /* relatedLabel */
    color: var(--tmdb-color-active-primary);
  }
  & .tmdb-related-items { /* Container for multiple items */
    background-color: var(--tmdb-color-active-primary);
    display: flex;
    gap: 2px;
    padding: 0 6px;
  }
  & .tmdb-related-item {
    background-color: var(--tmdb-color-active-primary); /* Should be same as relatedItems to blend */
    color: var(--tmdb-color-white);
    padding: var(--tmdb-space-xs) var(--tmdb-space-s);
    font-size: var(--tmdb-font-size-xs);
  }
}
.tmdb-related-group:hover {
  background-color: var(--tmdb-color-active-bg-hover);
  & .tmdb-related-items {
    background-color: var(--tmdb-color-active-primary-hover);
  }
  & .tmdb-related-item {
    background-color: var(--tmdb-color-active-primary-hover);
  }
}

/* Time marker chip groups */
.tmdb-fcr-group {
  border: 1px solid var(--tmdb-color-fcr-border);
  background-color: var(--tmdb-color-fcr-bg);
  & .tmdb-chip-group-label {
    color: var(--tmdb-color-fcr-primary);
  }
  & .tmdb-chip-group-value {
    background-color: var(--tmdb-color-fcr-primary);
  }
}
.tmdb-fcr-group:hover {
  background-color: var(--tmdb-color-fcr-bg-hover);
  & .tmdb-chip-group-value {
    background-color: var(--tmdb-color-fcr-primary-hover);
  }
}

.tmdb-lcr-group {
  border: 1px solid var(--tmdb-color-lcr-border);
  background-color: var(--tmdb-color-lcr-bg);
  & .tmdb-chip-group-label {
    color: var(--tmdb-color-lcr-primary);
  }
  & .tmdb-chip-group-value {
    background-color: var(--tmdb-color-lcr-primary);
  }
}
.tmdb-lcr-group:hover {
  background-color: var(--tmdb-color-lcr-bg-hover);
  & .tmdb-chip-group-value {
    background-color: var(--tmdb-color-lcr-primary-hover);
  }
}

.tmdb-tti-group {
  border: 1px solid var(--tmdb-color-tti-border);
  background-color: var(--tmdb-color-tti-bg);
  & .tmdb-chip-group-label {
    color: var(--tmdb-color-tti-primary);
  }
  & .tmdb-chip-group-value {
    background-color: var(--tmdb-color-tti-primary);
  }
}
.tmdb-tti-group:hover {
  background-color: var(--tmdb-color-tti-bg-hover);
  & .tmdb-chip-group-value {
    background-color: var(--tmdb-color-tti-primary-hover);
  }
}

.tmdb-item-count-group {
  border: 1px solid var(--tmdb-color-items-border);
  background-color: var(--tmdb-color-items-bg);
  & .tmdb-chip-group-label {
    color: var(--tmdb-color-items-primary);
  }
  & .tmdb-chip-group-value {
    background-color: var(--tmdb-color-items-primary);
  }
}
.tmdb-item-count-group:hover {
  background-color: var(--tmdb-color-items-bg-hover);
  & .tmdb-chip-group-value {
    background-color: var(--tmdb-color-items-primary-hover);
  }
}

.tmdb-pre-wrap {
  white-space: pre-wrap;
  font-size: var(--tmdb-font-size-xs);
  background-color: var(--tmdb-color-bg-light-gray);
  padding: var(--tmdb-space-l);
  border-radius: var(--tmdb-border-radius-medium);
  overflow-x: auto;
  max-height: 200px;
  border: 1px solid var(--tmdb-color-border-dark);
}

.tmdb-time-marker-value { /* Used within TimeMarkers component */
  font-family: monospace;
  text-align: right;
  display: inline-block;
  width: 80px; /* Specific width */
  font-weight: var(--tmdb-font-weight-medium);
}

.tmdb-floating-container {
  position: fixed;
  /* top, left are dynamic */
  min-width: 600px;
  max-width: 750px;
  width: 100%; /* Or some other logic if needed */
  z-index: var(--tmdb-z-index-floating);
  resize: both;
  overflow: auto;
  max-height: 90vh;
  box-shadow: var(--tmdb-shadow-xlarge);
  /* padding will be 0 for floating container itself */
  background-color: var(--tmdb-color-bg-main); /* Match .tmdb-container */
  border-radius: var(--tmdb-border-radius-large); /* Match .tmdb-container */
}

.tmdb-handle {
  position: sticky;
  top: 0;
  padding: var(--tmdb-space-l) var(--tmdb-space-xl);
  background-color: var(--tmdb-color-bg-handle);
  color: var(--tmdb-color-white);
  cursor: move;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-top-left-radius: var(--tmdb-border-radius-large);
  border-top-right-radius: var(--tmdb-border-radius-large);
  transition: background-color var(--tmdb-transition-fast);
}
.tmdb-handle:hover {
  background-color: var(--tmdb-color-bg-handle-hover);
}

.tmdb-handle-title {
  margin: 0;
  font-size: var(--tmdb-font-size-m);
  font-weight: var(--tmdb-font-weight-bold);
}

.tmdb-close-button { /* Also used for minimize */
  background: none;
  border: none;
  color: var(--tmdb-color-white);
  cursor: pointer;
  font-size: var(--tmdb-font-size-xxl); /* 18px */
  padding: var(--tmdb-space-xxs) var(--tmdb-space-m);
  border-radius: var(--tmdb-border-radius-circle);
  transition: background-color var(--tmdb-transition-fast), transform var(--tmdb-transition-fast);
}
.tmdb-close-button:hover {
  background-color: rgba(255, 255, 255, 0.1);
  transform: scale(1.1);
}
.tmdb-close-button:active {
  transform: scale(1);
}

.tmdb-minimized-button {
  position: fixed;
  bottom: var(--tmdb-space-xxl);
  right: var(--tmdb-space-xxl);
  background-color: var(--tmdb-color-active-primary);
  color: var(--tmdb-color-white);
  border: none;
  border-radius: var(--tmdb-border-radius-circle);
  width: 74px; /* Specific */
  height: 74px; /* Specific */
  opacity: 0.9;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  box-shadow: var(--tmdb-shadow-button);
  z-index: var(--tmdb-z-index-floating);
  font-size: var(--tmdb-font-size-m);
  font-weight: var(--tmdb-font-weight-bold);
  transition: opacity var(--tmdb-transition-fast),
              transform var(--tmdb-transition-fast),
              box-shadow var(--tmdb-transition-fast),
              background-color var(--tmdb-transition-fast);
}
.tmdb-minimized-button:hover {
  opacity: 1;
  transform: scale(1.05);
  box-shadow: var(--tmdb-shadow-button-hover);
  background-color: var(--tmdb-color-active-primary-hover);
}
.tmdb-minimized-button:active {
  transform: scale(1);
}

.tmdb-def-chip-container {
  display: flex;
  flex-wrap: wrap;
  gap: var(--tmdb-space-ms);
  align-items: center;
}

.tmdb-def-chip {
  background-color: var(--tmdb-color-active-bg);
  color: var(--tmdb-color-active-primary);
  padding: var(--tmdb-space-xxs) var(--tmdb-space-m);
  border-radius: var(--tmdb-border-radius-xlarge);
  font-size: var(--tmdb-font-size-xxs);
  max-width: 200px;
  text-overflow: ellipsis;
  white-space: nowrap;
  position: relative;
  border: 1px solid var(--tmdb-color-active-border-light);
  transition: background-color var(--tmdb-transition-fast);
}
.tmdb-def-chip:hover {
  background-color: var(--tmdb-color-active-bg-hover);
}
.tmdb-def-chip-value {
  font-weight: var(--tmdb-font-weight-bold);
}

/* Variant-specific styles */
.tmdb-def-chip-pending {
  background-color: var(--tmdb-color-draft-bg);
  color: var(--tmdb-color-draft-primary);
  border-color: var(--tmdb-color-draft-primary);
  font-style: italic;
}
.tmdb-def-chip-pending:hover {
  background-color: var(--tmdb-color-draft-bg-hover);
}

.tmdb-def-chip-missing {
  background-color: var(--tmdb-color-interrupted-bg);
  color: var(--tmdb-color-interrupted-primary);
  border-color: var(--tmdb-color-interrupted-border);
}
.tmdb-def-chip-missing:hover {
  background-color: var(--tmdb-color-interrupted-bg-hover);
}

.tmdb-def-chip-success {
  background-color: var(--tmdb-color-completed-bg);
  color: var(--tmdb-color-completed-primary);
  border-color: var(--tmdb-color-completed-border);
}
.tmdb-def-chip-success:hover {
  background-color: var(--tmdb-color-completed-bg-hover);
}

.tmdb-def-chip-error {
  background-color: var(--tmdb-color-interrupted-bg);
  color: var(--tmdb-color-interrupted-primary);
  border-color: var(--tmdb-color-interrupted-border);
  font-weight: var(--tmdb-font-weight-bold);
}
.tmdb-def-chip-error:hover {
  background-color: var(--tmdb-color-interrupted-bg-hover);
}

.tmdb-def-chip-hoverable {
  cursor: help;
}
.tmdb-def-chip-hoverable:hover {
  background-color: var(--tmdb-color-active-bg-hover);
}
.tmdb-def-chip-tooltip {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  background-color: rgba(0,0,0,0.8);
  color: var(--tmdb-color-white);
  padding: var(--tmdb-space-ms) var(--tmdb-space-ml);
  border-radius: var(--tmdb-border-radius-small);
  font-size: var(--tmdb-font-size-xxs);
  z-index: var(--tmdb-z-index-tooltip);
  min-width: 200px;
  max-width: 300px;
  word-break: break-word;
  pointer-events: none;
  opacity: 0;
  transition: opacity var(--tmdb-transition-slow), visibility var(--tmdb-transition-slow); /* Added visibility transition */
  visibility: hidden;
}
.tmdb-def-chip-tooltip-visible {
  opacity: 1;
  visibility: visible;
}

.tmdb-item-content { /* In RequiredSpansList */
  display: flex;
  align-items: center;
  flex: 1;
}

/* RenderBeaconTimeline specific classes */
.tmdb-render-beacon-timeline-name {
  font-weight: 600; /* Specific */
  font-size: var(--tmdb-font-size-xl);
  margin-right: var(--tmdb-space-ml);
}
.tmdb-render-stats-group {
  display: inline-flex;
  flex-wrap: nowrap;
  overflow: hidden;
  border-radius: var(--tmdb-border-radius-pill);
  border: 1px solid var(--tmdb-color-border-dark);
  background-color: var(--tmdb-color-bg-light-gray);
  margin-right: var(--tmdb-space-m);
  transition: border-color var(--tmdb-transition-fast);
}
.tmdb-render-stats-group:hover {
  border-color: var(--tmdb-color-active-primary);
}
.tmdb-render-stats-label {
  color: var(--tmdb-color-text-secondary);
  padding: var(--tmdb-space-xs) var(--tmdb-space-m);
  font-size: var(--tmdb-font-size-xs);
}
.tmdb-render-stats-value {
  background-color: var(--tmdb-color-bg-dark-gray);
  color: var(--tmdb-color-text-primary);
  padding: var(--tmdb-space-xs) var(--tmdb-space-m);
  font-size: var(--tmdb-font-size-xs);
  font-weight: var(--tmdb-font-weight-medium);
}

.tmdb-timeline-point-label,
.tmdb-timeline-point-time {
  position: absolute;
  font-size: var(--tmdb-font-size-xs); /* 12px for better readability */
  white-space: nowrap;
  padding: 2px var(--tmdb-space-m);
  background-color: rgba(255, 255, 255, 0.85);
  border-radius: var(--tmdb-border-radius-small);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  z-index: var(--tmdb-z-index-timeline-text);
}

.tmdb-timeline-bar {
  position: relative;
  width: 100%;
  height: var(--tmdb-timeline-bar-height);
  border-radius: 3px; /* Specific */
  background: var(--tmdb-timeline-default-segment-bg);
  box-sizing: border-box;
  z-index: var(--tmdb-z-index-timeline-bar);
  display: flex; /* For segments */
  flex-shrink: 0; /* Prevent bar from shrinking */
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.05);
}

.tmdb-timeline-segment {
  position: absolute;
  height: 100%;
  border-radius: 2px;
  transition: opacity 0.2s ease, transform 0.1s ease;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}
.tmdb-timeline-segment:hover {
  opacity: 0.95;
  transform: scaleY(1.05);
}

.tmdb-timeline-marker-line {
  position: absolute;
  top: 0;
  width: var(--tmdb-timeline-marker-line-width);
  height: 100%; /* Spans full TOTAL_VIS_CONTENT_HEIGHT */
  z-index: var(--tmdb-z-index-timeline-marker);
  border-left: var(--tmdb-timeline-marker-line-width) dashed;
  border-right: none;
  background: none;
}

.tmdb-error-indicator {
  color: var(--tmdb-color-text-error);
  font-size: var(--tmdb-font-size-xxl); /* 18px */
}
.tmdb-definition-modified-indicator {
  color: var(--tmdb-color-link-primary);
  font-size: var(--tmdb-font-size-xxl); /* 18px */
}

.tmdb-computed-item-missing {
  margin-left: var(--tmdb-space-m);
  color: red; /* Kept direct red */
  font-weight: var(--tmdb-font-weight-medium);
}
.tmdb-computed-item-pending,
.tmdb-computed-value-pending {
  margin-left: var(--tmdb-space-m);
  color: var(--tmdb-color-text-muted);
  font-style: italic;
}
.tmdb-computed-value {
  margin-left: var(--tmdb-space-m);
  color: var(--tmdb-color-link-primary);
}
.tmdb-computed-value-na {
  margin-left: var(--tmdb-space-m);
  color: red; /* Kept direct red */
  font-weight: var(--tmdb-font-weight-medium);
}

.tmdb-definition-details-toggle {
  display: flex;
  align-items: center;
  cursor: pointer;
  margin-top: var(--tmdb-space-m);
  font-size: var(--tmdb-font-size-xs);
  color: var(--tmdb-color-text-secondary);
  transition: color var(--tmdb-transition-fast);
  & > span {
    margin-right: var(--tmdb-space-ms);
  }
}
.tmdb-definition-details-toggle:hover {
  color: var(--tmdb-color-text-primary);
  text-decoration: underline;
}

/* Ensure the root class is applied to the main div */
.tmdb-container, .tmdb-floating-container {
  font-family: var(--tmdb-font-family);
}

ul.tmdb-no-style-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

/* For the content within the floating container specifically */
.tmdb-floating-content-wrapper {
  padding: 0 var(--tmdb-space-xl); /* Original padding for non-handle/non-floater parts */
}

/* Add hover styles for clickable list items */
.tmdb-list-item[onClick],
.tmdb-list-item[role="button"],
.tmdb-list-item a,
.tmdb-list-item button {
  cursor: pointer;
  transition: background-color var(--tmdb-transition-fast), transform var(--tmdb-transition-fast);
}
.tmdb-list-item[onClick]:hover,
.tmdb-list-item[role="button"]:hover,
.tmdb-list-item a:hover,
.tmdb-list-item button:hover {
  background-color: var(--tmdb-color-bg-medium-gray);
  transform: translateX(2px);
}

/* Child trace styles */
.tmdb-history-item-child {
  position: relative;
}

.tmdb-child-trace-indicator {
  height: 2px;
  background-color: var(--tmdb-color-border-light);
}

.tmdb-child-trace-connector {
  width: 2px;
  background-color: var(--tmdb-color-border-light);
}

.tmdb-child-trace-badge {
  color: var(--tmdb-color-text-secondary);
  font-weight: normal;
  font-size: var(--tmdb-font-size-s);
}

/* Error section styles */
.tmdb-error-section {
  border: 2px solid var(--tmdb-color-error-primary);
  border-radius: var(--tmdb-border-radius-medium);
  background-color: var(--tmdb-color-error-bg);
  padding: var(--tmdb-space-l);
  margin-bottom: var(--tmdb-space-xl);
}

.tmdb-error-title {
  color: var(--tmdb-color-error-primary);
  font-weight: var(--tmdb-font-weight-bold);
  display: flex;
  align-items: center;
  gap: var(--tmdb-space-s);
}

.tmdb-error-content {
  margin-top: var(--tmdb-space-m);
}

.tmdb-error-text {
  background-color: rgba(0, 0, 0, 0.05);
  border: 1px solid var(--tmdb-color-error-primary);
  border-radius: var(--tmdb-border-radius-small);
  padding: var(--tmdb-space-l);
  margin: 0;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: var(--tmdb-font-size-xs);
  color: var(--tmdb-color-error-primary);
  overflow-x: auto;
  max-height: 300px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
}
`

export function getDynamicStateStyle(state: string) {
  let stateClass: string
  switch (state) {
    case 'complete': {
      stateClass = 'tmdb-status-tag-completed'
      break
    }
    case 'interrupted': {
      stateClass = 'tmdb-status-tag-interrupted'
      break
    }
    case 'draft': {
      stateClass = 'tmdb-status-tag-draft'
      // No default
      break
    }
    default:
      stateClass = 'tmdb-status-tag-active'
  }

  return `tmdb-status-tag ${stateClass}`
}
