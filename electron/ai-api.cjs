async function readJsonResponse(response) {
  const raw = await response.text();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function apiErrorMessage(payload, fallback) {
  return payload?.error?.message || payload?.message || fallback;
}

function geminiText(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("")
    .trim();
}

function correctionInstruction(lang) {
  if (lang === "pl") {
    return "Popraw wyłącznie literówki, błędy ortograficzne, interpunkcyjne i oczywiste błędy gramatyczne. Nie zmieniaj treści, znaczenia, tonu ani stylu. Zwróć tylko poprawiony tekst, bez komentarza.";
  }
  if (lang === "de") {
    return "Korrigiere ausschließlich Tippfehler, Rechtschreibung, Zeichensetzung und offensichtliche Grammatikfehler. Ändere weder Inhalt, Bedeutung, Ton noch Stil. Gib nur den korrigierten Text ohne Kommentar zurück.";
  }
  return "Correct only typos, spelling, punctuation, and obvious grammatical errors. Do not change the content, meaning, tone, or style. Return only the corrected text, without any comments.";
}

function localized(lang, polish, english) {
  return lang === "pl" ? polish : english;
}

async function correctTextWithApi({ text, settings, lang, fetchImpl = globalThis.fetch }) {
  const prompt = correctionInstruction(lang) + "\n\n" + text;
  if (settings.provider === "local") {
    throw new Error(localized(
      lang,
      "Lokalny silnik nie obsługuje jeszcze korekty tekstu",
      "The local engine does not support text correction yet",
    ));
  }

  if (settings.provider === "openai") {
    const response = await fetchImpl("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
      }),
    });
    const payload = await readJsonResponse(response);
    if (!response.ok) {
      throw new Error(apiErrorMessage(
        payload,
        localized(lang, "Błąd OpenAI", "OpenAI error"),
      ));
    }
    const corrected = payload?.choices?.[0]?.message?.content;
    if (typeof corrected !== "string" || !corrected.trim()) {
      throw new Error(localized(lang, "OpenAI zwróciło pustą odpowiedź", "OpenAI returned an empty response"));
    }
    return corrected;
  }

  const model = settings.model.startsWith("gemini")
    ? settings.model
    : "gemini-2.0-flash";
  const response = await fetchImpl(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${settings.apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0 },
      }),
    },
  );
  const payload = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(apiErrorMessage(
      payload,
      localized(lang, "Błąd Gemini", "Gemini error"),
    ));
  }
  const corrected = geminiText(payload);
  if (!corrected) {
    throw new Error(localized(lang, "Gemini zwróciło pustą odpowiedź", "Gemini returned an empty response"));
  }
  return corrected;
}

async function transcribeAudioWithApi({
  buf,
  mime,
  settings,
  lang,
  systemLanguage,
  fetchImpl = globalThis.fetch,
}) {
  if (settings.provider === "openai") {
    const form = new FormData();
    form.append("file", new Blob([buf], { type: mime }), "nagranie.webm");
    form.append(
      "model",
      settings.model.startsWith("gpt-")
        ? settings.model
        : "gpt-4o-mini-transcribe",
    );
    if (settings.language && settings.language !== "auto") {
      form.append("language", settings.language);
    }
    const response = await fetchImpl("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${settings.apiKey}` },
      body: form,
    });
    const payload = await readJsonResponse(response);
    if (!response.ok) {
      throw new Error(apiErrorMessage(
        payload,
        localized(lang, "Błąd transkrypcji OpenAI", "OpenAI transcription error"),
      ));
    }
    if (typeof payload?.text !== "string" || !payload.text.trim()) {
      throw new Error(localized(lang, "OpenAI nie zwróciło transkrypcji", "OpenAI did not return a transcription"));
    }
    return payload.text;
  }

  const model = settings.model.startsWith("gemini")
    ? settings.model
    : "gemini-2.0-flash";
  const recordingLanguage =
    settings.language && settings.language !== "auto"
      ? settings.language
      : systemLanguage;
  let instruction;
  if (recordingLanguage === "pl") {
    instruction = "Dokładnie przepisz tę polską notatkę głosową. Zwróć tylko transkrypcję.";
  } else if (recordingLanguage === "de") {
    instruction = "Transkribiere diese deutsche Sprachnotiz genau. Gib nur die Transkription zurück.";
  } else if (recordingLanguage === "ru") {
    instruction = "Точно расшифруй эту голосовую заметку на русском языке. Верни только расшифровку.";
  } else {
    instruction = "Accurately transcribe this English voice note. Return only the transcription.";
  }
  const response = await fetchImpl(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${settings.apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: instruction },
            {
              inline_data: {
                mime_type: mime,
                data: Buffer.from(buf).toString("base64"),
              },
            },
          ],
        }],
      }),
    },
  );
  const payload = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(apiErrorMessage(
      payload,
      localized(lang, "Błąd transkrypcji Gemini", "Gemini transcription error"),
    ));
  }
  const text = geminiText(payload);
  if (!text) {
    throw new Error(localized(lang, "Gemini nie zwróciło transkrypcji", "Gemini did not return a transcription"));
  }
  return text;
}

module.exports = {
  readJsonResponse,
  apiErrorMessage,
  geminiText,
  correctTextWithApi,
  transcribeAudioWithApi,
};
