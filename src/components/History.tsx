import React, { useEffect, useState } from "react";
import { Search, Copy, Trash2, ExternalLink, FileText, Check, Calendar } from "lucide-react";
import { translations, type AppLanguage } from "../translations";

interface NoteItem {
  id: string;
  filename: string;
  path: string;
  text: string;
  createdAt: string;
  format: "txt" | "md" | "json";
  sizeBytes: number;
}

interface HistoryProps {
  lang: AppLanguage;
  showToast: (msg: string) => void;
  onOpenFolder: () => void;
}

export const History: React.FC<HistoryProps> = ({ lang, showToast, onOpenFolder }) => {
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedNote, setSelectedNote] = useState<NoteItem | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const t = translations[lang];

  const fetchNotes = async () => {
    setLoading(true);
    try {
      const list = await window.szeptucha.getNotes();
      setNotes(list);
    } catch {
      setNotes([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotes();
  }, []);

  const handleCopy = (note: NoteItem, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(note.text);
    setCopiedId(note.id);
    showToast(t.copiedToClipboard);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDelete = async (note: NoteItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(t.deleteConfirm)) {
      const ok = await window.szeptucha.deleteNote(note.path);
      if (ok) {
        showToast(t.noteDeleted);
        if (selectedNote?.id === note.id) setSelectedNote(null);
        fetchNotes();
      }
    }
  };

  const filteredNotes = notes.filter(
    (n) =>
      n.text.toLowerCase().includes(search.toLowerCase()) ||
      n.filename.toLowerCase().includes(search.toLowerCase())
  );

  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const locale = lang === "pl" ? "pl-PL" : lang === "de" ? "de-DE" : lang === "ru" ? "ru-RU" : "en-US";
      return date.toLocaleString(locale, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="history-container">
      <div className="history-header">
        <div>
          <p className="eyebrow">{t.historyTitle.toUpperCase()}</p>
          <h1>{t.historyTitle}</h1>
          <p>{t.historyDesc}</p>
        </div>
        <button className="secondary" onClick={onOpenFolder}>
          <ExternalLink size={16} />
          {t.openFolderBtn}
        </button>
      </div>

      <div className="search-bar">
        <Search size={18} />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t.searchPlaceholder}
        />
      </div>

      {loading ? (
        <div className="history-loading">{t.wakingUp}</div>
      ) : filteredNotes.length === 0 ? (
        <div className="history-empty">
          <FileText size={48} />
          <p>{t.noNotesFound}</p>
        </div>
      ) : (
        <div className="notes-grid">
          {filteredNotes.map((note) => (
            <div
              key={note.id}
              className={`note-card ${selectedNote?.id === note.id ? "active" : ""}`}
              onClick={() => setSelectedNote(note)}
            >
              <div className="note-card-header">
                <span className={`format-badge ${note.format}`}>{note.format.toUpperCase()}</span>
                <span className="note-date">
                  <Calendar size={12} />
                  {formatDate(note.createdAt)}
                </span>
              </div>
              <p className="note-preview">{note.text || note.filename}</p>
              <div className="note-card-actions">
                <button
                  type="button"
                  className="icon-btn"
                  onClick={(e) => handleCopy(note, e)}
                  title={t.copyNote}
                >
                  {copiedId === note.id ? <Check size={14} /> : <Copy size={14} />}
                </button>
                <button
                  type="button"
                  className="icon-btn danger"
                  onClick={(e) => handleDelete(note, e)}
                  title={t.deleteNote}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedNote && (
        <div className="note-modal-overlay" onClick={() => setSelectedNote(null)}>
          <div className="note-modal" onClick={(e) => e.stopPropagation()}>
            <div className="note-modal-header">
              <h3>{selectedNote.filename}</h3>
              <span className="note-date">{formatDate(selectedNote.createdAt)}</span>
            </div>
            <div className="note-modal-body">
              <pre>{selectedNote.text}</pre>
            </div>
            <div className="note-modal-footer">
              <button
                className="secondary"
                onClick={(e) => handleCopy(selectedNote, e)}
              >
                <Copy size={16} />
                {t.copyNote}
              </button>
              <button className="primary" onClick={() => setSelectedNote(null)}>
                Zamknij
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
