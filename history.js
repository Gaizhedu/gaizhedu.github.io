export const HISTORY_KEY = 'knowledge-quest-history-v1';
const empty = () => ({ totalRuns: 0, records: [] });
export function loadHistory(storage) {
  try {
    const data = JSON.parse(storage.getItem(HISTORY_KEY));
    if (!data || !Array.isArray(data.records)) return empty();
    const seen = new Set();
    const records = data.records.filter(record => {
      if (!record || typeof record.id !== 'string' || seen.has(record.id) || !Number.isInteger(record.total) || record.total < 1 || !Number.isInteger(record.correct) || record.correct < 0 || record.correct > record.total || !Number.isFinite(record.at)) return false;
      seen.add(record.id);return true;
    }).map(record => ({ id: record.id, correct: record.correct, total: record.total, score: Math.round(record.correct / record.total * 100), at: record.at })).sort((a, b) => b.at - a.at).slice(0, 20);
    return { totalRuns: Number.isSafeInteger(data.totalRuns) ? Math.max(records.length, data.totalRuns) : records.length, records };
  } catch { return empty(); }
}
export function addResult(history, record) {
  if (history.records.some(item => item.id === record.id)) return history;
  return { totalRuns: history.totalRuns + 1, records: [{ ...record, score: Math.round(record.correct / record.total * 100) }, ...history.records].slice(0, 20) };
}
export function saveHistory(storage, history) {
  try { storage.setItem(HISTORY_KEY, JSON.stringify(history));return true; }
  catch { return false; }
}
