/**
 * Trailing-edge debounce.
 *
 * `flush()` exists because the pending call holds a *snapshot* of its
 * arguments. Cancelling it silently discards that snapshot — for the autosave
 * that means losing the last ≤2s of edits to the timeline being navigated away
 * from. Callers that are about to replace the debounced state (switching
 * timelines, unmounting the editor) must flush rather than cancel.
 */
export function debounce<T extends (...args: never[]) => unknown>(
  func: T,
  wait: number
): {
  (...args: Parameters<T>): void;
  cancel: () => void;
  flush: () => ReturnType<T> | undefined;
} {
  let timeout: NodeJS.Timeout | undefined;
  let pendingArgs: Parameters<T> | undefined;

  function invoke(): ReturnType<T> | undefined {
    const args = pendingArgs;
    pendingArgs = undefined;
    if (!args) return undefined;
    return func(...args) as ReturnType<T>;
  }

  function debounced(...args: Parameters<T>) {
    pendingArgs = args;

    const later = () => {
      timeout = undefined;
      invoke();
    };

    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  }

  debounced.cancel = () => {
    clearTimeout(timeout);
    timeout = undefined;
    pendingArgs = undefined;
  };

  // Run the pending call now instead of waiting out the timer. No-op when
  // nothing is pending, so it's safe to call unconditionally.
  debounced.flush = (): ReturnType<T> | undefined => {
    if (timeout === undefined) return undefined;
    clearTimeout(timeout);
    timeout = undefined;
    return invoke();
  };

  return debounced;
}
