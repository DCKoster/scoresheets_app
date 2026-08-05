import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LOCALE_STORAGE_KEY,
  createTranslator,
  normalizeLocale,
  resolveLocale,
  saveLocale,
  translationKeys,
} from '../web_app/src/i18n.js';
import { BUILTIN_GAMES, getGameName } from '../web_app/src/data/games.js';

class MemoryStorage {
  constructor(values = {}) { this.values = new Map(Object.entries(values)); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

test('locale resolution uses a valid saved preference, browser language, then English', () => {
  assert.equal(normalizeLocale('nl-NL'), 'nl');
  assert.equal(resolveLocale(new MemoryStorage({ [LOCALE_STORAGE_KEY]: 'en' }), ['nl-NL']), 'en');
  assert.equal(resolveLocale(new MemoryStorage(), ['nl-BE']), 'nl');
  assert.equal(resolveLocale(new MemoryStorage({ [LOCALE_STORAGE_KEY]: 'invalid' }), ['de-DE']), 'en');
  const storage = new MemoryStorage();
  assert.equal(saveLocale(storage, 'nl-NL'), 'nl');
  assert.equal(storage.getItem(LOCALE_STORAGE_KEY), 'nl');
});

test('English and Dutch catalogs have matching keys and interpolate plurals', () => {
  assert.deepEqual(translationKeys('nl'), translationKeys('en'));
  assert.equal(createTranslator('en').t('home.summary', { count: 1, game: 'X', date: 'today' }), '1 saved session. Most recent: X on today.');
  assert.equal(createTranslator('nl').t('home.summary', { count: 2, game: 'X', date: 'vandaag' }), '2 opgeslagen sessies. Meest recent: X op vandaag.');
});

test('built-in game names follow the active locale', () => {
  const game = BUILTIN_GAMES.find((item) => item.id === 'regenwormen');
  assert.equal(getGameName(game, 'en'), 'Pick-omino');
  assert.equal(getGameName(game, 'nl'), 'Regenwormen');
});
