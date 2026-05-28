////////////////////////////////////////////////////////////////////////////
//
// Disable React 19 dev-build component-render logging.
//
// React 19's development build instruments every committed fiber via
// `logComponentRender` -> `addObjectDiffToProperties`, which deeply walks
// component props after each commit to record diffs for the DevTools / user
// timing track. Realm SDK proxies throw an AssertionError ("Accessing object
// which has been invalidated or deleted") on any property access once the
// underlying object is invalidated, which happens whenever another process
// writes to the .realm file. The walk runs inside React's commit phase, so
// the throw wedges the reconciler ("Should not already be working") and
// freezes the UI.
//
// `logComponentRender` is gated by `supportsUserTiming`, which is computed
// once when react-dom-client loads from `typeof console.timeStamp ===
// 'function'`. Removing `console.timeStamp` before that module evaluates
// short-circuits the entire walk. This file must be imported before
// `react-dom/client` for the stub to take effect.
//
////////////////////////////////////////////////////////////////////////////

if (
  typeof console !== 'undefined' &&
  typeof (console as { timeStamp?: unknown }).timeStamp === 'function'
) {
  (console as { timeStamp?: unknown }).timeStamp = undefined;
}
