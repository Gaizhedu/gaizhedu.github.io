import { normalizeQuestions } from './game-core.js';

export const BANK_KEY = 'knowledge-quest-bank-v1';
export function describeBank(data, id) {
  const metadata = data?.questionBank ?? data;
  const name = [metadata?.title, metadata?.name].find(value => typeof value === 'string' && value.trim());
  const entry = { id, title: name?.trim() || '未命名题库', questions: [], error: '' };
  try {
    entry.questions = normalizeQuestions([data]);
    if (entry.questions.length < 2) throw new Error('至少需要 2 道不同的单选题');
  } catch (error) { entry.error = error.message; }
  return entry;
}
export function selectBank(catalog, requested, saved) {
  const available = catalog.filter(entry => !entry.error && entry.questions.length >= 2);
  return available.find(entry => entry.id === requested) ?? available.find(entry => entry.id === saved) ?? available[0];
}
