import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('the PWA declares a manifest and versioned offline shell', async () => {
  const [manifest, worker, html] = await Promise.all([
    readFile(new URL('../web_app/manifest.webmanifest', import.meta.url), 'utf8'),
    readFile(new URL('../web_app/service-worker.js', import.meta.url), 'utf8'),
    readFile(new URL('../web_app/index.html', import.meta.url), 'utf8'),
  ]);
  assert.match(manifest, /"start_url": "\.\/"/);
  assert.match(manifest, /icons\/icon\.svg/);
  assert.match(html, /manifest\.webmanifest/);
  assert.match(worker, /CACHE_VERSION = 'scoresheets-shell-v\d+'/);
  assert.match(worker, /'\.\/src\/main\.js'/);
  assert.match(worker, /request\.mode === 'navigate'/);
  assert.match(worker, /caches\.delete/);
});
