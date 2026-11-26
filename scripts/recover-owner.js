import assert from 'node:assert/strict';
import { open, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export async function readRecoveryKey(path) {
  const contents = (await readFile(path, 'utf8')).trim();
  const key = /^[a-f0-9]{64}$/i.test(contents) ? contents : contents.match(/^OWNER_RECOVERY_KEY\s*=\s*["']?([^"'\s]+)/m)?.[1];
  assert(key?.length >= 32, 'Expected a 64-digit hex key or an OWNER_RECOVERY_KEY entry');
  return key;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [url, keyFile, output, username, name, email] = process.argv.slice(2);
  assert(url && keyFile && output, 'Usage: npm run owner:recover -- <origin> <key-file> <new-credentials-file> [username name [email]]');
  const origin = new URL(url).origin;
  assert(origin.startsWith('https://') || ['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname), 'Use HTTPS outside local development');
  const key = await readRecoveryKey(keyFile);
  // Reserve a private destination before changing the only owner's credentials.
  const file = await open(output, 'wx', 0o600);
  try {
    const response = await fetch(origin + '/api/owner/recover', {
      method: 'POST',
      redirect: 'error',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, username, name, email }),
    });
    assert(response.ok, `Owner recovery returned HTTP ${response.status}`);
    await file.writeFile(JSON.stringify(await response.json()));
  } finally {
    await file.close();
  }
  console.log('Owner credentials saved to the private output file.');
}
