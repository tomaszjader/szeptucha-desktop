// One correction operation shared by the interface and global shortcut.
function createCorrectionController({ clipboard, keys, correct, onState, timeoutMs = 120_000, wait = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  let active = null;
  let state = { phase: "idle", busy: false, canCancel: false };
  const publish = phase => {
    state = { phase, busy: phase !== "idle", canCancel: phase === "selecting" || phase === "correcting" };
    onState({ ...state });
  };
  function check(operation) {
    operation.controller.signal.throwIfAborted();
    if (active !== operation) throw new Error("CORRECTION_CANCELLED");
  }
  async function perform(operation, options) {
    check(operation);
    operation.previous = clipboard.readText();
    clipboard.clear();
    operation.owned = "";
    await keys("copy", operation.controller.signal);
    check(operation);
    let selected = "";
    for (let index = 0; index < 10; index++) {
      await wait(50);
      check(operation);
      selected = clipboard.readText();
      if (selected.trim()) break;
    }
    operation.owned = selected;
    if (!selected.trim()) throw new Error("CORRECTION_NO_SELECTION");
    publish("correcting");
    const corrected = await correct({ ...options, text: selected, signal: operation.controller.signal });
    check(operation);
    if (clipboard.readText() !== selected) throw new Error("CORRECTION_CLIPBOARD_CHANGED");
    if (typeof corrected !== "string" || !corrected.trim()) throw new Error("CORRECTION_EMPTY_RESPONSE");
    // Once paste dispatch starts it cannot be undone; cancellation is disabled here.
    publish("pasting");
    clearTimeout(operation.timer);
    operation.timer = setTimeout(() => operation.controller.abort(new Error("CORRECTION_TIMEOUT")), 10_000);
    operation.pasting = true;
    operation.owned = corrected.trim();
    clipboard.writeText(operation.owned);
    await keys("paste", operation.controller.signal);
    check(operation);
    return { ok: true };
  }
  return {
    getState: () => ({ ...state }),
    cancel() {
      if (!active || !state.canCancel) return false;
      active.controller.abort(new Error("CORRECTION_CANCELLED"));
      return true;
    },
    dispose() { active?.controller.abort(new Error("CORRECTION_CANCELLED")); },
    async run(options) {
      if (active) return { ok: false, code: "CORRECTION_BUSY" };
      const operation = { controller: new AbortController() };
      active = operation;
      operation.timer = setTimeout(() => operation.controller.abort(new Error("CORRECTION_TIMEOUT")), timeoutMs);
      let abort;
      const interrupted = new Promise((_, reject) => {
        abort = () => reject(operation.controller.signal.reason);
        operation.controller.signal.addEventListener("abort", abort, { once: true });
      });
      publish("selecting");
      try {
        return await Promise.race([perform(operation, options), interrupted]);
      } catch (error) {
        // Do not overwrite text the user copied while waiting for the service.
        try {
          if (!operation.pasting && operation.previous !== undefined && clipboard.readText() === operation.owned) clipboard.writeText(operation.previous);
        } catch { /* A clipboard failure must still release the operation lock. */ }
        return { ok: false, code: operation.pasting ? "CORRECTION_PASTE_FAILED" : error instanceof Error ? error.message : String(error) };
      } finally {
        clearTimeout(operation.timer);
        operation.controller.signal.removeEventListener("abort", abort);
        if (active === operation) { active = null; publish("idle"); }
      }
    },
  };
}
module.exports = { createCorrectionController };
