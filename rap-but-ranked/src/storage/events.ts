/** "Something saved changed" — lets lists (SAVED, Improve) refresh without polling. */
const listeners = new Set<() => void>()

export function onSavedChange(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function notifySaved() {
  listeners.forEach((fn) => fn())
}
