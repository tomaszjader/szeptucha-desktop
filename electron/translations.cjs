const mainTranslations = {
  pl: {
    statusWhisperLoad: "Ładuję lokalny model Whisper…",
    statusWhisperTranscribe: "Transkrybuję lokalnie…",
    statusNoApiKey: "Najpierw podaj klucz API",
    statusNoApiKeySettings: "Najpierw podaj klucz API w ustawieniach",
    statusSelectText: "Zaznacz tekst do poprawienia",
    statusCorrecting: "Poprawiam zaznaczony tekst…",
    statusCorrected: "Tekst został poprawiony",
    statusTranscribing: "Transkrybuję nagranie…",
    statusPasted: "Transkrypcja została wklejona",
    statusReadyNoSave: "Transkrypcja gotowa (bez zapisu do pliku)",
    statusSaved: "Zapisano",
    noteFilePrefix: "notatka",
    noteDocHeader: "# Notatka głosowa",
    recordingActive: "Nagrywanie aktywne",
    recordingSub: "Użyj skrótu ponownie, aby zakończyć",
    trayOpen: "Otwórz Szeptuchę",
    trayRecord: "Nagraj notatkę",
    trayExit: "Zakończ",
  },
  en: {
    statusWhisperLoad: "Loading local Whisper model…",
    statusWhisperTranscribe: "Transcribing locally…",
    statusNoApiKey: "Please enter your API key first",
    statusNoApiKeySettings: "Please enter your API key in settings first",
    statusSelectText: "Select text to correct",
    statusCorrecting: "Correcting selected text…",
    statusCorrected: "Text has been corrected",
    statusTranscribing: "Transcribing recording…",
    statusPasted: "Transcription has been pasted",
    statusReadyNoSave: "Transcription ready (without saving to file)",
    statusSaved: "Saved",
    noteFilePrefix: "note",
    noteDocHeader: "# Voice note",
    recordingActive: "Recording active",
    recordingSub: "Use the shortcut again to finish",
    trayOpen: "Open Szeptucha",
    trayRecord: "Record note",
    trayExit: "Exit",
  }
};

const preloadTranslations = {
  pl: {
    loadingWhisper: "Ładuję lokalny model Whisper…",
    transcribingLocally: "Transkrybuję lokalnie…",
    recordingNotActive: "Nagrywanie nie jest aktywne",
  },
  en: {
    loadingWhisper: "Loading local Whisper model…",
    transcribingLocally: "Transcribing locally…",
    recordingNotActive: "Recording is not active",
  }
};

module.exports = {
  mainTranslations,
  preloadTranslations
};
