import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_ENGINES, buildUrl, cleanQuery, engineProblem, formatEngines, parseEngines, shorten } from '../src/logic.ts';

test('cleanQuery strips Markdown down to words', () => {
  assert.equal(cleanQuery('  **bold** and *italic*  \n text '), 'bold and italic text');
  assert.equal(cleanQuery('[[Note#Heading]]'), 'Note');
  assert.equal(cleanQuery('[[Target|shown]]'), 'shown');
  assert.equal(cleanQuery('[a site](https://x.org)'), 'a site');
  assert.equal(cleanQuery('==marked== `code` ~~gone~~'), 'marked code gone');
  assert.equal(cleanQuery('- [ ] buy milk'), 'buy milk');
  assert.equal(cleanQuery('## Title'), 'Title');
  assert.equal(cleanQuery('snake_case_word'), 'snake_case_word');
  assert.equal(cleanQuery('2 * 3 = 6'), '2 * 3 = 6');
  assert.equal(cleanQuery('__init__ method'), '__init__ method');
  assert.equal(cleanQuery('a == b'), 'a == b');
});

test('buildUrl encodes the query and fills every placeholder', () => {
  assert.equal(buildUrl('https://x.org/?q={query}', 'a b&c'), 'https://x.org/?q=a%20b%26c');
  assert.equal(buildUrl('https://x.org/{query}/{query}', 'é'), 'https://x.org/%C3%A9/%C3%A9');
  assert.equal(buildUrl('https://x.org/', 'a'), null);
  assert.equal(buildUrl('https://x.org/?q={query}', '   '), null);
});

test('buildUrl does not let the query inject placeholders', () => {
  assert.equal(buildUrl('https://x.org/?q={query}', '{query}'), 'https://x.org/?q=%7Bquery%7D');
});

test('engineProblem', () => {
  assert.equal(engineProblem({ name: 'A', url: 'https://x.org/?q={query}' }), null);
  assert.match(engineProblem({ name: '', url: 'https://x.org/{query}' }) ?? '', /name/);
  assert.match(engineProblem({ name: 'A', url: 'javascript:{query}' }) ?? '', /http/);
  assert.match(engineProblem({ name: 'A', url: 'https://x.org/' }) ?? '', /\{query\}/);
});

test('the default engines are all valid and round-trip', () => {
  for (const e of DEFAULT_ENGINES) assert.equal(engineProblem(e), null, e.name);
  const parsed = parseEngines(formatEngines(DEFAULT_ENGINES));
  assert.deepEqual(parsed.engines, DEFAULT_ENGINES);
  assert.deepEqual(parsed.problems, []);
});

test('parseEngines skips bad and duplicate lines and reports them', () => {
  const { engines, problems } = parseEngines('Good | https://a.org/?q={query}\n\nbad line\nGOOD | https://b.org/{query}\nNoPlace | https://c.org/\n');
  assert.deepEqual(engines.map((e) => e.name), ['Good']);
  assert.equal(problems.length, 3);
  assert.match(problems[0], /Line 3/);
});

test('shorten', () => {
  assert.equal(shorten('short', 10), 'short');
  assert.equal(shorten('a long piece of text', 8), 'a long…');
  assert.equal(shorten('a\n\nb', 10), 'a b');
});
