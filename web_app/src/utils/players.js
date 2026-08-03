import { createId } from '../state/repositories.js';

export function parseParticipants(value) {
  const names = String(value).split(',').map((part) => part.trim()).filter(Boolean);
  const normalized = names.map((name) => name.toLocaleLowerCase());
  if (new Set(normalized).size !== normalized.length) return { valid: false, error: 'Player names must be unique.' };
  if (names.length < 2) return { valid: false, error: 'Enter at least 2 players.' };
  return { valid: true, participants: names.map((displayName) => ({ id: createId('participant'), displayName })) };
}
