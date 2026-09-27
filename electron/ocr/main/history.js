function createHistoryStore(limit = 50) {
  let entries = [];

  function validEntries(items) {
    if (!Array.isArray(items)) return [];
    const seen = new Set();
    return items.filter(entry => {
      if (!entry || typeof entry.id !== 'string' || typeof entry.text !== 'string' || typeof entry.createdAt !== 'string' || !entry.text || seen.has(entry.text)) return false;
      seen.add(entry.text);
      return true;
    }).slice(0, limit).map(entry => ({ id: entry.id, text: entry.text, createdAt: entry.createdAt }));
  }

  return {
    add(entry) {
      const item = { ...entry };
      entries = [item, ...entries.filter(current => current.text !== item.text)].slice(0, limit);
      return item;
    },
    list() {
      return entries.map(entry => ({ ...entry }));
    },
    load(items) {
      entries = validEntries(items);
    },
    get(id) {
      const entry = entries.find(current => current.id === id);
      return entry ? { ...entry } : null;
    },
    remove(id) {
      entries = entries.filter(entry => entry.id !== id);
    },
    clear() {
      entries = [];
    }
  };
}

module.exports = { createHistoryStore };
