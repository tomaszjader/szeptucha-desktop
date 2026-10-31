// Integration-test fixture: deliberately blocks its own event loop.
process.parentPort.on("message", ({ data }) => {
  if (data.samples[0] === 0) {
    process.parentPort.postMessage({ type: "progress", id: data.id, phase: "transcribing" });
    while (true) { Math.sqrt(Math.random()); }
  } else process.parentPort.postMessage({ type: "result", id: data.id, text: "retry succeeded" });
});
