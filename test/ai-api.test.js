const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  correctTextWithApi,
  transcribeAudioWithApi,
} = require("../electron/ai-api.cjs");

function response(payload, ok = true) {
  return { ok, text: async () => JSON.stringify(payload) };
}

test("sends OpenAI transcription as multipart audio with model and language", async () => {
  let request;
  const text = await transcribeAudioWithApi({
    buf: Buffer.from("audio bytes"),
    mime: "audio/webm",
    lang: "pl",
    settings: {
      provider: "openai",
      apiKey: "openai-key",
      model: "gpt-4o-mini-transcribe",
      language: "pl",
    },
    fetchImpl: async (url, options) => {
      request = { url, options };
      return response({ text: "Cześć świecie" });
    },
  });

  assert.equal(request.url, "https://api.openai.com/v1/audio/transcriptions");
  assert.equal(request.options.headers.Authorization, "Bearer openai-key");
  assert.equal(request.options.body.get("model"), "gpt-4o-mini-transcribe");
  assert.equal(request.options.body.get("language"), "pl");
  assert.equal(request.options.body.get("file").name, "nagranie.webm");
  assert.equal(text, "Cześć świecie");
});

test("sends Gemini transcription audio and language instruction", async () => {
  let request;
  const text = await transcribeAudioWithApi({
    buf: Buffer.from("audio bytes"),
    mime: "audio/webm",
    lang: "pl",
    systemLanguage: "en",
    settings: {
      provider: "gemini",
      apiKey: "gemini-key",
      model: "gemini-2.0-flash",
      language: "pl",
    },
    fetchImpl: async (url, options) => {
      request = { url, options };
      return response({ candidates: [{ content: { parts: [{ text: "  Cześć świecie  " }] } }] });
    },
  });

  assert.match(request.url, /models\/gemini-2\.0-flash:generateContent\?key=gemini-key$/);
  const body = JSON.parse(request.options.body);
  assert.equal(body.contents[0].parts[0].text, "Dokładnie przepisz tę polską notatkę głosową. Zwróć tylko transkrypcję.");
  assert.equal(body.contents[0].parts[1].inline_data.mime_type, "audio/webm");
  assert.equal(body.contents[0].parts[1].inline_data.data, Buffer.from("audio bytes").toString("base64"));
  assert.equal(text, "Cześć świecie");
});

test("surfaces provider errors and rejects empty transcriptions", async () => {
  await assert.rejects(
    transcribeAudioWithApi({
      buf: Buffer.from("audio"),
      mime: "audio/webm",
      lang: "pl",
      settings: { provider: "openai", apiKey: "key", model: "gpt-4o-mini-transcribe", language: "auto" },
      fetchImpl: async () => response({ error: { message: "invalid API key" } }, false),
    }),
    /invalid API key/,
  );

  await assert.rejects(
    transcribeAudioWithApi({
      buf: Buffer.from("audio"),
      mime: "audio/webm",
      lang: "pl",
      settings: { provider: "gemini", apiKey: "key", model: "gemini-2.0-flash", language: "auto" },
      fetchImpl: async () => response({ candidates: [{ content: { parts: [] } }] }),
    }),
    /Gemini nie zwróciło transkrypcji/,
  );
});

test("sends a correction prompt to OpenAI and returns the generated text", async () => {
  let request;
  const corrected = await correctTextWithApi({
    text: "Czesc swiecie",
    lang: "pl",
    settings: { provider: "openai", apiKey: "openai-key" },
    fetchImpl: async (url, options) => {
      request = { url, options };
      return response({ choices: [{ message: { content: "Cześć świecie" } }] });
    },
  });

  assert.equal(request.url, "https://api.openai.com/v1/chat/completions");
  assert.equal(request.options.headers.Authorization, "Bearer openai-key");
  const body = JSON.parse(request.options.body);
  assert.equal(body.model, "gpt-4o-mini");
  assert.match(body.messages[0].content, /Popraw wyłącznie literówki/);
  assert.match(body.messages[0].content, /Czesc swiecie/);
  assert.equal(corrected, "Cześć świecie");
});

test("rejects empty corrections and unsupported local correction", async () => {
  await assert.rejects(
    correctTextWithApi({
      text: "tekst",
      lang: "pl",
      settings: { provider: "openai", apiKey: "key" },
      fetchImpl: async () => response({ choices: [{ message: { content: "  " } }] }),
    }),
    /OpenAI zwróciło pustą odpowiedź/,
  );
  await assert.rejects(
    correctTextWithApi({
      text: "tekst",
      lang: "pl",
      settings: { provider: "local", apiKey: "" },
    }),
    /Lokalny silnik nie obsługuje/,
  );
});

const baseTranscription = {
  buf: Buffer.from("audio"), mime: "audio/webm", lang: "en", systemLanguage: "en",
  settings: { provider: "openai", apiKey: "key", model: "gpt-4o-mini-transcribe", language: "en" },
};
test("API deadline covers a response body that never finishes", async () => {
  let signal;
  await assert.rejects(transcribeAudioWithApi({
    ...baseTranscription, timeoutMs: 10,
    fetchImpl: async (_, init) => { signal = init.signal; return { ok: true, text: () => new Promise(() => {}) }; },
  }), /TRANSCRIPTION_TIMEOUT/);
  assert.equal(signal.aborted, true);
});
test("cancelling an API request aborts fetch and prevents a late response from succeeding", async () => {
  const controller = new AbortController();
  let requestSignal;
  let finish;
  const request = transcribeAudioWithApi({
    ...baseTranscription, signal: controller.signal,
    fetchImpl: (_, init) => { requestSignal = init.signal; return new Promise(resolve => { finish = resolve; }); },
  });
  controller.abort(new Error("TRANSCRIPTION_CANCELLED"));
  await assert.rejects(request, /TRANSCRIPTION_CANCELLED/);
  assert.equal(requestSignal.aborted, true);
  finish(response({ text: "late text" }));
});
test("an already cancelled request never calls fetch", async () => {
  const controller = new AbortController();
  controller.abort(new Error("TRANSCRIPTION_CANCELLED"));
  await assert.rejects(transcribeAudioWithApi({
    ...baseTranscription, signal: controller.signal,
    fetchImpl: () => { assert.fail("fetch must not run"); },
  }), /TRANSCRIPTION_CANCELLED/);
});
