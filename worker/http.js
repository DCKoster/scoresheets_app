export class HttpError extends Error {
  constructor(status, key) {
    super(key);
    this.status = status;
  }
}

export function requireValue(condition, key = 'cloud.invalid', status = 400) {
  if (!condition) throw new HttpError(status, key);
}

export function json(body, status = 200) {
  return Response.json(body, { status });
}

export async function readJson(request, limit = 131072) {
  requireValue(request.headers.get('content-type')?.split(';')[0] === 'application/json', 'cloud.invalid', 415);
  const reader = request.body?.getReader();
  requireValue(reader);
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0;
  let text = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) {
        await reader.cancel();
        throw new HttpError(413, 'cloud.tooLarge');
      }
      text += decoder.decode(value, { stream: true });
    }
    const parsed = JSON.parse(text + decoder.decode());
    requireValue(parsed && typeof parsed === 'object' && !Array.isArray(parsed));
    return parsed;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, 'cloud.invalid');
  }
}

export function string(value, max = 100) {
  requireValue(typeof value === 'string' && value.trim().length > 0 && value.length <= max);
  return value.trim();
}

export function identifier(value) {
  requireValue(typeof value === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(value) && value !== 'constructor' && value !== 'prototype');
  return value;
}

export function revision(value, minimum = 0) {
  requireValue(Number.isSafeInteger(value) && value >= minimum);
  return value;
}

export const now = () => new Date().toISOString();
const encoder = new TextEncoder();
export function hex(bytes) {
  if (bytes.toHex) return bytes.toHex();
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function digest(value) {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
}

export function bind(db, sql, ...values) {
  const statement = db.prepare(sql);
  return values.length ? statement.bind(...values) : statement;
}

export async function rows(db, sql, ...values) {
  return (await bind(db, sql, ...values).all()).results;
}

export function first(db, sql, ...values) { return bind(db, sql, ...values).first(); }
