import { createId } from '../state/repositories.js';

export function parseParticipants(value) {
  const names = String(value).split(',').map((part) => part.trim()).filter(Boolean);
  const normalized = names.map((name) => name.toLocaleLowerCase());
  if (new Set(normalized).size !== normalized.length) return { valid: false, error: 'errors.playersUnique' };
  if (names.length < 2) return { valid: false, error: 'errors.playersMinimum' };
  return { valid: true, participants: names.map((displayName) => ({ id: createId('participant'), displayName })) };
}
