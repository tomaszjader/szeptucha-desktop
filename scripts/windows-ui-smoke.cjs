const port = Number(process.env.SZEPTOCHA_DEBUG_PORT || 9223);
const deadline = Date.now() + 60_000;

async function getPageTarget() {
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (response.ok) {
        const targets = await response.json();
        const page = targets.find(target =>
          target.type === "page" &&
          /\/index\.html(?:[?#].*)?$/.test(target.url) &&
          typeof target.webSocketDebuggerUrl === "string",
        );
        if (page) return page;
      }
    } catch {
      // Electron may still be starting.
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error("Timed out waiting for the Szeptucha main window renderer.");
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const timeout = setTimeout(() => reject(new Error("Timed out connecting to renderer.")), 10_000);
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
    }, 10_000);
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
  const target = await getPageTarget();
  const socket = await connect(target.webSocketDebuggerUrl);
  try {
    let heading = "";
    while (Date.now() < deadline) {
      heading = await evaluate(socket, 'document.querySelector("h1")?.textContent?.trim() || ""');
      if (heading) break;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    if (!heading) throw new Error("Szeptucha did not render its main heading.");

    const historyTab = 'document.querySelector("aside nav button:nth-child(2)")';
    let rendered = false;
    while (Date.now() < deadline) {
      rendered = await evaluate(socket, `Boolean(${historyTab})`);
      if (rendered) break;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    if (!rendered) throw new Error("History tab was not rendered in the main window.");

    const before = await evaluate(socket, `Boolean(${historyTab}.classList.contains("active"))`);
    await evaluate(socket, `${historyTab}.click()`);
    let after = before;
    const interactionDeadline = Date.now() + 5_000;
    while (Date.now() < interactionDeadline && !after) {
      await new Promise(resolve => setTimeout(resolve, 100));
      after = await evaluate(socket, `Boolean(${historyTab}.classList.contains("active"))`);
    }
    if (before || !after) throw new Error("History tab click did not activate the tab.");
    console.log(`Szeptucha UI smoke test passed (heading: "${heading}"; History tab activated).`);
  } finally {
    socket.close();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
