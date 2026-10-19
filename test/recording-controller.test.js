const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createRecordingController } = require("../electron/recording-controller.cjs");

function makeHarness({ getUserMedia, transcribe, complete } = {}) {
  const events = [];
  const errors = [];
  let trackStops = 0;
  let recorder;
  const stream = {
    getTracks: () => [{ stop: () => { trackStops += 1; } }],
  };
  const controller = createRecordingController({
    getUserMedia: getUserMedia || (async () => stream),
    createMediaRecorder: () => {
      recorder = {
        state: "inactive",
        mimeType: "audio/webm;codecs=opus",
        start() { this.state = "recording"; },
        stop() {
          this.state = "inactive";
          this.ondataavailable?.({ data: new Blob(["recorded audio"], { type: this.mimeType }) });
          this.onstop?.();
        },
      };
      return recorder;
    },
    transcribe: transcribe || (async () => "recognized words"),
    complete: complete || (async () => {}),
    onState: state => events.push(state),
    onError: message => errors.push(message),
  });
  return {
    controller,
    events,
    errors,
    get recorder() { return recorder; },
    get trackStops() { return trackStops; },
  };
}

test("records from the selected source, transcribes once, and completes", async () => {
  const completed = [];
  const progress = [];
  const harness = makeHarness({
    transcribe: async (blob, report) => {
      assert.equal(blob.type, "audio/webm;codecs=opus");
      assert.equal(await blob.text(), "recorded audio");
      report({ phase: "transcribing", downloadProgress: 50 });
      return "recognized words";
    },
    complete: async result => completed.push(result),
  });

  await harness.controller.toggle("shortcut");
  assert.equal(harness.controller.getState().phase, "recording");
  assert.equal(harness.controller.getState().source, "shortcut");

  const unsubscribe = harness.controller.subscribe(state => progress.push(state.phase));
  const result = await harness.controller.toggle();

  assert.equal(result, "recognized words");
  assert.deepEqual(completed, ["recognized words"]);
  assert.equal(harness.controller.getState().phase, "completed");
  assert.equal(harness.trackStops, 1);
  assert.equal(harness.errors.length, 0);
  assert.ok(progress.includes("transcribing"));
  assert.ok(harness.events.some(state => state.phase === "completed"));
  unsubscribe();
});

test("reports microphone failures and allows a later recording", async () => {
  let attempts = 0;
  const harness = makeHarness({
    getUserMedia: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("Microphone permission denied");
      return { getTracks: () => [{ stop() {} }] };
    },
  });

  await harness.controller.toggle("interface");
  assert.equal(harness.controller.getState().phase, "error");
  assert.equal(harness.controller.getState().error, "Microphone permission denied");
  assert.deepEqual(harness.errors, ["Microphone permission denied"]);

  await harness.controller.toggle("tray");
  assert.equal(harness.controller.getState().phase, "recording");
  assert.equal(harness.controller.getState().source, "tray");
});

test("releases the microphone and reports transcription failures", async () => {
  const harness = makeHarness({
    transcribe: async () => { throw new Error("API unavailable"); },
  });

  await harness.controller.toggle();
  await harness.controller.toggle();

  assert.equal(harness.controller.getState().phase, "error");
  assert.equal(harness.controller.getState().error, "API unavailable");
  assert.equal(harness.trackStops, 1);
  assert.deepEqual(harness.errors, ["API unavailable"]);
});
