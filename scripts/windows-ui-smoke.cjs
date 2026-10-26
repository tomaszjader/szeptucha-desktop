const port = Number(process.env.SZEPTOCHA_DEBUG_PORT || 9223);
const deadline = Date.now() + 60_000;

async function getMainRenderer() {
  let lastTargets = [];
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (response.ok) {
        lastTargets = await response.json();
        for (const target of lastTargets) {
          if (target.type !== "page" || typeof target.webSocketDebuggerUrl !== "string") continue;
          let socket;
          try {
            socket = await connect(target.webSocketDebuggerUrl);
            const appState = await evaluate(
              socket,
              '({ heading: document.querySelector("h1")?.textContent?.trim() || "", hasThemeToggle: Boolean(document.querySelector("button.themeToggle")) })',
            );
            if (appState.heading && appState.hasThemeToggle) {
              return { socket, heading: appState.heading };
            }
          } catch {
            // A target may disappear while Electron creates its windows.
          }
          socket?.close();
        }
      }
    } catch {
      // Electron may still be starting.
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  const summary = lastTargets.map(({ type, title, url }) => ({ type, title, url }));
  throw new Error(`Timed out waiting for the main Szeptucha renderer. Targets: ${JSON.stringify(summary)}`);
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const timeout = setTimeout(() => reject(new Error("Timed out connecting to renderer.")), 5_000);
    socket.addEventListener("open", () => {
      clearTimeout(timeout);
      resolve(socket);
    }, { once: true });
    socket.addEventListener("error", () => {
      clearTimeout(timeout);
      reject(new Error("Could not connect to renderer."));
    }, { once: true });
  });
}

function evaluate(socket, expression) {
  const id = Math.floor(Math.random() * 1_000_000_000);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.removeEventListener("message", onMessage);
      reject(new Error("Renderer evaluation timed out."));
    }, 5_000);
    function onMessage(event) {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (message.id !== id) return;
      clearTimeout(timeout);
      socket.removeEventListener("message", onMessage);
      if (message.error) {
        reject(new Error(message.error.message));
        return;
      }
      resolve(message.result?.result?.value);
    }
    socket.addEventListener("message", onMessage);
    socket.send(JSON.stringify({
      id,
      method: "Runtime.evaluate",
      params: { expression, returnByValue: true, awaitPromise: true },
    }));
  });
}

async function main() {
  const { socket, heading } = await getMainRenderer();
  try {
    const selector = "button.themeToggle";
    const before = await evaluate(socket, `(() => { const button = document.querySelector(${JSON.stringify(selector)}); return { theme: document.documentElement.dataset.theme, label: button.getAttribute("aria-label") }; })()`);
    await evaluate(socket, `document.querySelector(${JSON.stringify(selector)}).click()`);
    let after = before;
    const interactionDeadline = Date.now() + 5_000;
    while (Date.now() < interactionDeadline && before.label === after.label) {
      await new Promise(resolve => setTimeout(resolve, 100));
      after = await evaluate(socket, `(() => { const button = document.querySelector(${JSON.stringify(selector)}); return { theme: document.documentElement.dataset.theme, label: button?.getAttribute("aria-label") }; })()`);
    }
    if (!before.label || before.label === after.label) {
      throw new Error(`Theme button click did not update its accessible label (before: ${JSON.stringify(before)}, after: ${JSON.stringify(after)}).`);
    }
    console.log(`Szeptucha UI smoke test passed (heading: "${heading}"; theme: ${before.theme} → ${after.theme}).`);
  } finally {
    socket.close();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
