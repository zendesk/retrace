# **Specification — Parent/Child Traces**

Right now, only one Trace can be ongoing at a given time. We want to make it possible to have children traces. A TraceDefinition will optionally include `adoptAsChildren` - A list of trace names which, when a Tracer for that trace has a draft started, instead of interrupting the current Trace, will be adopted as children of the current Trace.
The TraceStateMachine would include a new state 'waiting-for-children', and a new event handler `onChildEnd`, which is called by the child Trace's `onTraceEnd` implementation. Only once all children have ended, we move forward to the 'complete' state (and of course, if there are no children we transition to 'complete' immediately - in onEnterState). The children Trace instances are a Set inside of the parent Trace. When a child Trace is started, the `TraceManagerUtilities` provided isn't the same as for a top-level Trace, it is the parent Trace that manages how those utilities behave.
If a Trace has children, whenever if executes `processSpan`, it should call `processSpan` on each of its children.

As children Traces complete, they are moved to a separate Set with completed Traces, later passed into the `createTraceRecording`.
Children traces are instances of Trace, which means they have their own startTime, and they create their own version of SpanAndAnnotation, which means the spans include the annotation that has the `operationRelativeStartTime` and other relative time values.
If the parent is interrupted while children are present, we interrupt all children, with a new interruptionReason: 'parent-interrupted'
If a child times out, the `onChildEnd` event will be emitted to the parent - every state must handle this event. If the parent is still in a non-terminal state - this should interrupt the parent with 'child-timeout' `interruptionReason`. The `onChildEnd` event might tell us the child was interrupted, which should interrupt the parent with interruptionReason 'child-interrupted'. The only exception to this is the case of of 'definition-changed' interruptionReason, in which case we do not transition, but stay in the same state (noop), and delete the child instance from the children Set.
There's no additional logic to handle nested grandchildren, but they're are allowed simply by the fact that they're all Trace objects, and those can hold their own children. The higher level child always has to wait for all their children to end.
We clear the parent’s children Set in onTerminalStateReached for GC.

`onInterrupt` in non-terminal states additionally interrupts all unfinished children with `parent-interrupted` and clears the set.

The child Trace needs to be instantiated with the Trace's custom `traceUtilities` passed in at construction time. Hence, this must be done by the child's Tracer instance, possibly checking for an existing Trace that allows children of its type to be created, and only then calling something like `parentTrace.adoptChild(childTrace)`

## 1 Purpose

Extend the current Front-end Operation Tracing model so that:

- A “root” trace may _adopt_ other traces as **children** instead of interrupting them.
- A parent trace finishes only after all of its own completion criteria **and** all adopted children have ended.

The change preserves full backward-compatibility for tracers that do **not** opt in.

## 2 Functional Requirements

| #   | Requirement                                                                                                                                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F-1 | A `TraceDefinition` may list trace names in a new optional field `adoptAsChildren`. When a draft trace is created whose `definition.name` appears in this list **and** another trace is currently active, the active trace adopts the draft as a child instead of being interrupted. |
| F-2 | A parent trace enters a new non-terminal state `waiting-for-children` immediately after it would otherwise transition to `complete`.                                                                                                                                                 |
| F-3 | A parent trace transitions from `waiting-for-children` → `complete` when its `children.size === 0`.                                                                                                                                                                                  |
| F-4 | If the parent is interrupted for any reason **before** all children end, every unfinished child is forcibly interrupted with interruptionReason `parent-interrupted`.                                                                                                                |
| F-5 | If any child trace ends with a **terminal** state `interrupted`, the parent is also interrupted with reason:<br/>• `child-timeout` if the child timed-out<br/>• `child-interrupted` for all other child interruptions.                                                               |
| F-6 | When a child ends, the parent receives an `onChildEnd(childTrace)` event, removes the child from its `children` set, and—if the child’s final status was `interrupted`—handles F-5.                                                                                                  |
| F-7 | The parent’s call to `processSpan(span)` must forward the span to _all still-running_ children _after_ it performs its own 'onProcessSpan' emission.                                                                                                                                 |
| F-8 | Parent GC: both `children` and `completedChildren` sets are cleared in `onTerminalStateReached`.                                                                                                                                                                                    |
| F-9 | Existing behaviour (single active trace) is preserved for tracers that do **not** specify `adoptAsChildren`.                                                                                                                                                                         |

---

## Public-API Changes

### TraceDefinition (new fields)

```ts
interface TraceDefinition<…> {
  …
  /**
   * Names of traces that should be adopted as children
   * instead of interrupting this trace.
   */
  adoptAsChildren?: readonly string[]
}
```

### Trace InterruptionReason (new literals)

```ts
export const INVALID_TRACE_INTERRUPTION_REASONS = [
  …,                                      // existing
  'parent-interrupted',
  'child-interrupted',
  'child-timeout',
] as const
```

## Memory Management

- `Trace.children` and `completedChildren` are `Set<Trace>` **without** back-pointers from child to parent (other than the utility closures) to avoid strong cycles.
- In `onTerminalStateReached` (both `interrupted` & `complete`) parent executes:

```ts
this.children.clear()
this.completedChildren.clear()
```

- Child’s own clean-up remains unchanged.

## **where** the child `Trace` is instantiated and **how** it receives parent-scoped `traceUtilities`

## Instantiation flow

```
user-code → Tracer.createDraft / start
                    │
                    ▼
           (1) look-for-parent()
                    │
         ┌──────────┴──────────┐
         │                     │
   parent found & can adopt    no suitable parent
         │                     │
  (2) build child utilities    normal top-level
         │                     │
 (3) new Trace(childUtils)     new Trace(rootUtils)
         │                     │
 (4) parent.adoptChild(child)  TraceManager.replaceCurrentTrace(child,…)
```

### `lookForAdoptingParent`

```ts
function lookForAdoptingParent(
  tracerDef: CompleteTraceDefinition,
  globalUtils: TraceManagerUtilities
): Trace | undefined {
  const maybeParent = globalUtils.getCurrentTrace()
  if (!maybeParent) return undefined

  return maybeParent.definition.adoptAsChildren?.includes(tracerDef.name) &&
         ? maybeParent
         : undefined
}
```

### Child-scoped `traceUtilities`

When a parent is returned:

```ts
const childUtils: TraceManagerUtilities = {
  // reporting and errors continue to use the
  // *original* reportFn / reportErrorFn handed down
  ...globalUtils,

  // redirect “current trace” queries to the CHILD
  getCurrentTrace: () => childTrace,

  // forbid replacing parent – instead replace the child itself
  replaceCurrentTrace: (newTrace, reason) => {
    if (reason === 'another-trace-started') {
      parent.adoptChild(newTrace) // adds to children
    } else {
      childTrace.interrupt('definition-changed') // special type of interruption that doesn't propagate up
      parent.adoptChild(newTrace) // adds to children
    }
  },
}
```

> _Rationale_: the child should behave **as if** it were the only active trace inside its subtree, yet it cannot influence the global “root” slot.

### Tracer changes

```ts
// inside Tracer.createDraft
const parent = lookForAdoptingParent(this.definition, this.traceUtilities)

const utilsForThisTrace = parent
  ? buildChildUtilities(parent, this.traceUtilities)
  : this.traceUtilities

const trace = new Trace({
  definition: this.definition,
  input,
  traceUtilities: utilsForThisTrace,
  isChild: !!parent,
})

if (parent) {
  parent.adoptChild(trace) // F-1/F-2 behaviour
  // trace does NOT call global replaceCurrentTrace
} else {
  this.traceUtilities.replaceCurrentTrace(trace, 'another-trace-started')
}
```

Edge-cases:

- **Self-nested** calls (a tracer starts another of the _same_ definition) should never be allowed.
  This can be checked when instantiating the Tracer - the definition's `adoptAsChildren` list should not include the definition's own name. Otherwise - report an error and filter out the self-nested trace name from `adoptAsChildren`.

- children traces always skip the `waiting-for-interactive` state, and do not setup any timeouts for it. Children traces do not support `captureInteractive` (and if it's defined, the setting is not respected).

## Other

While I acknowledge that `createTraceRecording` would have to be updated to add the children, we're not going to be doing that just yet.
