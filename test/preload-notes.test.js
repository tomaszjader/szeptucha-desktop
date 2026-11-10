const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Load the actual preload entry; no Electron runtime or microphone is needed.
const source = fs.readFileSync(path.join(__dirname, "../electron/preload.cjs"), "utf8");
function bridge(result) {
  let api;
  const calls = [];
  vm.runInNewContext(source, {
    require(name) {
      if (name === "electron") return {
        contextBridge: { exposeInMainWorld(key, value) { assert.equal(key, "szeptucha"); api = value; } },
        ipcRenderer: {
          on() {},
          invoke(...args) { calls.push(args); return result instanceof Error ? Promise.reject(result) : Promise.resolve(result); },
        },
      };
      if (name === "./recording-controller.cjs") return {
        createRecordingController: () => ({ restore: async () => {} }),
      };
      throw new Error(`Unexpected preload import: ${name}`);
    },
  }, { filename: "preload.cjs" });
  return { api, calls };
}

test("the preload forwards page and search to notes:get and returns the backend page", async () => {
  const page = { items: [{ id: "match.txt" }], total: 25, page: 1, pageSize: 24 };
  const { api, calls } = bridge(page);
  const options = { page: 1, search: "Zażółć" };
  assert.equal(await api.getNotes(options), page);
  assert.deepEqual(calls, [["notes:get", options]]);
  assert.deepEqual(options, { page: 1, search: "Zażółć" });
});

test("the preload leaves omitted options to the backend defaults", async () => {
  const page = { items: [], total: 0, page: 0, pageSize: 24 };
  const { api, calls } = bridge(page);
  assert.equal(await api.getNotes(), page);
  assert.deepEqual(calls, [["notes:get", undefined]]);
});

test("the preload preserves history loading errors instead of returning an empty page", async () => {
  const error = new Error("NOTES_HISTORY_UNAVAILABLE");
  const { api, calls } = bridge(error);
  await assert.rejects(api.getNotes({ page: 0, search: "test" }), candidate => candidate === error);
  assert.deepEqual(calls, [["notes:get", { page: 0, search: "test" }]]);
});
