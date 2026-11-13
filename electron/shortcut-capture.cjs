function createShortcutCapture({ globalShortcut }) {
  let owner = null;
  return {
    begin(token) {
      if (typeof token !== "string" || !/^[a-zA-Z0-9-]{1,100}$/.test(token)) return false;
      globalShortcut.setSuspended(true);
      owner = token;
      return true;
    },
    end(token) {
      // An old input's cleanup must not resume shortcuts while another input is editing.
      if (owner === null || token !== owner) return;
      globalShortcut.setSuspended(false);
      owner = null;
    },
    reset() {
      if (owner === null) return;
      globalShortcut.setSuspended(false);
      owner = null;
    },
    withRegistration(action) {
      // Electron rejects new registrations while suspended. Reapply synchronously,
      // then restore capture mode before processing further keyboard events.
      const suspended = owner !== null;
      if (suspended) globalShortcut.setSuspended(false);
      try { return action(); }
      finally { if (suspended && owner !== null) globalShortcut.setSuspended(true); }
    },
  };
}

module.exports = { createShortcutCapture };
