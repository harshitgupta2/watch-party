// Fire-and-forget wrapper for persistence calls: the live room experience
// runs entirely off in-memory state, so a DB hiccup should log, not crash
// the socket handler or block the broadcast that already happened.
export function persist(promise: Promise<unknown>): void {
  promise.catch((err) => console.error('Persistence error:', err));
}
