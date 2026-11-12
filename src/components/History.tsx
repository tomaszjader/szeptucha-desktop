import React, { useEffect, useRef, useState } from "react";
import { Search, Copy, Trash2, ExternalLink, FileText, Check, Calendar, RefreshCw } from "lucide-react";
import { translations, type AppLanguage } from "../translations";

interface HistoryProps {
  lang: AppLanguage;
  showToast: (msg: string) => void;
  onOpenFolder: () => void;
}

export const History: React.FC<HistoryProps> = ({ lang, showToast, onOpenFolder }) => {
  const pageSize = 24;
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const retryButtonRef = useRef<HTMLButtonElement>(null);
  const refreshButtonRef = useRef<HTMLButtonElement>(null);
  const reloadFocus = useRef<"retry" | "refresh" | null>(null);
  const [reload, setReload] = useState(0);
  const [selectedNote, setSelectedNote] = useState<NoteItem | null>(null);
  const [selectedText, setSelectedText] = useState("");
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const selectedRequest = useRef(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const dialogTitleRef = useRef<HTMLHeadingElement>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [dialogMessage, setDialogMessage] = useState("");
  const noteOpen = selectedNote !== null;

  const t = translations[lang];

  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      setLoadFailed(false);
      try {
        const result = await window.szeptucha.getNotes({ page, search });
        if (!active) return;
        setNotes(result.items);
        setTotal(result.total);
        if (result.page !== page) setPage(result.page);
      } catch {
        if (active) {
          setLoadFailed(true);
          setNotes([]);
          setTotal(0);
        }
      } finally {
        if (active) setLoading(false);
      }
    }, search ? 200 : 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [page, search, reload]);

  useEffect(() => {
    if (loading || !reloadFocus.current) return;
    const origin = reloadFocus.current;
    reloadFocus.current = null;
    if (origin === "refresh") refreshButtonRef.current?.focus();
    else (loadFailed ? retryButtonRef.current : searchRef.current)?.focus();
  }, [loading, loadFailed]);

  const reloadHistory = (origin: "retry" | "refresh") => {
    if (loading) return;
    reloadFocus.current = origin;
    setLoading(true);
    setLoadFailed(false);
    setReload(value => value + 1);
  };

  useEffect(() => {
    if (!noteOpen || !dialogRef.current) return;
    const dialog = dialogRef.current;
    const opener = openerRef.current;
    dialog.showModal();
    dialogTitleRef.current?.focus();
    return () => {
      selectedRequest.current += 1;
      dialog.close();
      if (opener?.isConnected) opener.focus();
      else searchRef.current?.focus();
    };
  }, [noteOpen]);

  const handleCopy = async (note: NoteItem, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const text = await window.szeptucha.readNote(note.id);
      await navigator.clipboard.writeText(text);
      setCopiedId(note.id);
      showToast(t.copiedToClipboard);
      if (selectedNote?.id === note.id) setDialogMessage(t.copiedToClipboard);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      showToast(t.noteLoadFailed);
      if (selectedNote?.id === note.id) setDialogMessage(t.noteLoadFailed);
    }
  };

  const handleDelete = async (note: NoteItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(t.deleteConfirm)) {
      try {
        const ok = await window.szeptucha.deleteNote(note.id);
        if (ok) {
          showToast(t.noteDeleted);
          if (selectedNote?.id === note.id) closeSelectedNote();
          if (notes.length === 1 && page > 0) setPage(page - 1);
          setReload((value) => value + 1);
        }
      } catch {
        showToast(t.noteDeleteFailed);
      }
    }
  };

  const openNote = async (note: NoteItem, opener: HTMLButtonElement) => {
    openerRef.current = opener;
    setDialogMessage("");
    const request = ++selectedRequest.current;
    setSelectedNote(note);
    setSelectedText(note.text);
    setSelectedLoading(true);
    try {
      const text = await window.szeptucha.readNote(note.id);
      if (selectedRequest.current === request) setSelectedText(text);
    } catch {
      if (selectedRequest.current === request) {
        showToast(t.noteLoadFailed);
        setDialogMessage(t.noteLoadFailed);
      }
    } finally {
      if (selectedRequest.current === request) setSelectedLoading(false);
    }
  };

  function closeSelectedNote() {
    selectedRequest.current += 1;
    setSelectedNote(null);
    setSelectedText("");
    setSelectedLoading(false);
  }

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

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
    <div className="history-container" aria-busy={loading}>
      <div className="history-header">
        <div>
          <p className="eyebrow">{t.historyTitle.toUpperCase()}</p>
          <h1>{t.historyTitle}</h1>
          <p>{t.historyDesc}</p>
        </div>
        <div className="history-header-actions">
          <button
            type="button"
            ref={refreshButtonRef}
            className="secondary history-refresh"
            aria-disabled={loading}
            onClick={() => reloadHistory("refresh")}
          >
            <RefreshCw size={16} />
            {t.refreshHistory}
          </button>
          <button type="button" className="secondary" onClick={onOpenFolder}>
            <ExternalLink size={16} />
            {t.openFolderBtn}
          </button>
        </div>
      </div>

      <div className="search-bar">
        <Search size={18} />
        <input
          type="text"
          ref={searchRef}
          aria-label={t.searchPlaceholder}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          placeholder={t.searchPlaceholder}
        />
      </div>

      {loading ? (
        <div className="history-loading">{t.wakingUp}</div>
      ) : loadFailed ? (
        <div className="history-error">
          <p role="alert">{t.historyLoadFailed}</p>
          <button type="button" ref={retryButtonRef} className="secondary history-retry" onClick={() => reloadHistory("retry")}>
            {t.retry}
          </button>
        </div>
      ) : notes.length === 0 ? (
        <div className="history-empty">
          <FileText size={48} />
          <p>{t.noNotesFound}</p>
        </div>
      ) : (
        <div className="notes-grid">
          {notes.map((note) => (
            <div
              key={note.id}
              className={`note-card ${selectedNote?.id === note.id ? "active" : ""}`}
            >
              <button
                type="button"
                className="note-open"
                aria-label={note.filename}
                aria-haspopup="dialog"
                onClick={(event) => void openNote(note, event.currentTarget)}
              >
                <span className="note-card-header">
                  <span className={`format-badge ${note.format}`}>{note.format.toUpperCase()}</span>
                  <span className="note-date">
                    <Calendar size={12} />
                    {formatDate(note.createdAt)}
                  </span>
                </span>
                <span className="note-preview">
                  {note.text ? `${note.text}${note.truncated ? "…" : ""}` : note.filename}
                </span>
              </button>
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

      {!loading && !loadFailed && total > pageSize && (
        <div className="history-pagination">
          <button className="secondary" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>
            {t.previousPage}
          </button>
          <span>{t.pageLabel} {page + 1} / {pageCount}</span>
          <button className="secondary" disabled={page + 1 >= pageCount} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}>
            {t.nextPage}
          </button>
        </div>
      )}

      {selectedNote && (
        <dialog
          ref={dialogRef}
          className="note-modal"
          aria-labelledby="note-dialog-title"
          onCancel={(event) => {
            event.preventDefault();
            closeSelectedNote();
          }}
          onClick={(event) => {
            if (event.target !== event.currentTarget) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            if (event.clientX < bounds.left || event.clientX > bounds.right ||
                event.clientY < bounds.top || event.clientY > bounds.bottom) closeSelectedNote();
          }}
        >
          <div className="note-modal-header">
            <h3 id="note-dialog-title" ref={dialogTitleRef} tabIndex={-1}>{selectedNote.filename}</h3>
            <span className="note-date">{formatDate(selectedNote.createdAt)}</span>
          </div>
          <div className="note-modal-body">
            <pre>{selectedLoading ? t.wakingUp : selectedText}</pre>
          </div>
          <p className="note-modal-status" role="status">{dialogMessage}</p>
          <div className="note-modal-footer">
            <button
              className="secondary"
              onClick={(e) => handleCopy(selectedNote, e)}
            >
              {copiedId === selectedNote.id ? <Check size={16} /> : <Copy size={16} />}
              {t.copyNote}
            </button>
            <button type="button" className="primary note-close" onClick={closeSelectedNote}>
              {t.closeNote}
            </button>
          </div>
        </dialog>
      )}
    </div>
  );
};
