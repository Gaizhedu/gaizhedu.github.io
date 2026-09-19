import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describeBank, selectBank } from '../question-banks.js';
const it = JSON.parse(await readFile(new URL('../question/09_17.json', import.meta.url), 'utf8'));
const english = JSON.parse(await readFile(new URL('../question/e_c.json', import.meta.url), 'utf8'));

test('catalog displays JSON titles, never the source filename', () => {
  assert.equal(describeBank(it, 'unrelated-file.json').title, 'IT基础概念题库');
  assert.equal(describeBank(english, 'other.json').title, '英语技术与职场词汇题库');
  assert.equal(describeBank({questions: it.questionBank.questions}, 'private-name.json').title, '未命名题库');
  assert.equal(describeBank({name: ' 顶层名称 ', questions: it.questionBank.questions}, 'file.json').title, '顶层名称');
});

test('bank selection uses stable ids and keeps questions isolated', () => {
  const catalog = [describeBank(it, 'it.json'), describeBank(english, 'english.json')];
  const selected = selectBank(catalog, 'english.json', 'it.json');
  assert.equal(selected.id, 'english.json');
  assert.equal(selected.questions.length, english.questionBank.questions.length);
  assert.equal(selectBank(catalog, null, 'it.json').questions.length, 10);
  assert.equal(selected.questions.some(q => q.question === 'CPU 的中文全称是什么？'), false);
  catalog[1].title = catalog[0].title;
  assert.equal(selectBank(catalog, 'english.json').id, 'english.json');
});

test('missing and invalid saved selections fall back to a playable bank', () => {
  const good = describeBank(it, 'good.json');
  const bad = describeBank({title:'空题库', questions:[]}, 'bad.json');
  const short = describeBank({questions: it.questionBank.questions.slice(0, 1)}, 'short.json');
  assert.ok(bad.error);assert.ok(short.error);
  assert.equal(selectBank([bad, short, good], 'bad.json', 'removed.json'), good);
  assert.equal(selectBank([bad, short], null, null), undefined);
});
