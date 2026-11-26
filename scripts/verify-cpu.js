import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const [url, fixtureFile, output, count = '5', ...requested] = process.argv.slice(2);
const sampleCount = Number(count);
assert(url && fixtureFile && output && Number.isInteger(sampleCount) && sampleCount > 0 && sampleCount <= 20,
  'Usage: npm run verify:cpu -- <origin> <fixture-file> <new-sample-file> [sample-count] [scenario ...]');
const origin = new URL(url).origin;
const { groupA, game, identities, accounts } = JSON.parse(await readFile(fixtureFile, 'utf8'));
const owner = accounts.owner;
const groupPath = (resource) => `/api/groups/${groupA.id}/${resource}`;
const samples = [];

async function post(path, body, status, actor = null, scenario = null) {
  const start = Date.now();
  const payload = JSON.stringify(body);
  const response = await fetch(origin + path, {
    method: 'POST',
    headers: {
      Origin: origin, 'Content-Type': 'application/json',
      ...(actor ? { Cookie: actor.cookie, 'X-Scoresheets-Account': actor.id } : {}),
    },
    body: payload,
  });
  const ray = response.headers.get('cf-ray');
  if (scenario) samples.push({ scenario, ray, start, status: response.status, bytes: Buffer.byteLength(payload) });
  const result = await response.json().catch(() => null);
  if (response.status !== status) console.error(`${scenario ?? path} returned ${response.status} (${result?.error ?? 'unexpected response'})`);
  if (!scenario) assert.equal(response.status, status);
  return result;
}

function operation(fields) {
  const id = randomUUID();
  return {
    id, operationId: randomUUID(), type: 'save', expectedRevision: 0,
    match: { id, createdAt: new Date().toISOString(), ...fields },
  };
}

const players = (count) => Array.from({ length: count }, (_, index) => ({
  id: `p${index}`, displayName: `Player ${index + 1}`, ...(index === 0 ? { userId: owner.id } : {}),
}));
const typical = () => operation({
  gameId: game.id, gameRevision: game.revision, participants: players(4),
  entries: { values: { p0: 12, p1: 27, p2: 20, p3: 42 } },
});

const largeRound = (roundGame) => {
  const participants = players(30);
  const scores = Object.fromEntries(participants.map(({ id }, index) => [
    id, Object.fromEntries(roundGame.scoreCategories.map((name, position) => [name, (index + position) % 10])),
  ]));
  const rounds = Array.from({ length: 100 }, (_, index) => ({ id: `r${index}`, scores }));
  return operation({ gameId: roundGame.id, gameRevision: roundGame.revision, participants, entries: { rounds } });
};

const largeRace = () => {
  const participants = players(12);
  const participantIds = participants.map(({ id }) => id);
  const placements = Object.fromEntries(participantIds.map((id, index) => [id, index + 1]));
  const races = Array.from({ length: 100 }, (_, index) => ({
    id: `race${index}`, cc: '150cc', track: '', itemSet: 'normal', itemIds: [], participantIds, placements,
  }));
  return operation({ gameId: 'mario-kart-8', participants, entries: { races } });
};

const scenarios = {
  issue: () => post(groupPath('members'), { username: `cpu-${randomUUID()}`, name: 'CPU fixture' }, 201, owner, 'issue'),
  signIn: () => {
    const { username, code } = identities[0];
    return post('/api/auth/sign-in', { username, code }, 200, null, 'signIn');
  },
  syncTypical: () => post(groupPath('sync'), typical(), 200, owner, 'syncTypical'),
  syncLargeRound: async () => post(groupPath('sync'), largeRound(workload.roundTemplate), 200, owner, 'syncLargeRound'),
  syncLargeRace: () => post(groupPath('sync'), largeRace(), 200, owner, 'syncLargeRace'),
  syncDuplicate: () => post(groupPath('sync'), workload.duplicate, 200, owner, 'syncDuplicate'),
};
const selected = requested.length ? requested : Object.keys(scenarios);
assert(selected.every((name) => Object.hasOwn(scenarios, name)), 'Unknown CPU verification scenario');

const workloadFile = process.env.SCORESHEETS_CPU_WORKLOAD;
let workload = workloadFile ? await readFile(workloadFile, 'utf8').then(JSON.parse, (error) => {
  if (error.code === 'ENOENT') return null;
  throw error;
}) : null;
if (!workload && (selected.includes('syncLargeRound') || selected.includes('syncDuplicate'))) {
  const roundTemplate = await post(groupPath('games'), {
    name: `CPU rounds ${randomUUID()}`, playMode: 'competitive',
    scoreCategories: ['A', 'B', 'C', 'D', 'E'], categoryScoring: 'per-round',
    scoring: { engineId: 'round-sum', ranking: 'highest' },
  }, 201, owner);
  const duplicate = largeRound(roundTemplate);
  await post(groupPath('sync'), duplicate, 200, owner);
  workload = { roundTemplate, duplicate };
  if (workloadFile) await writeFile(workloadFile, JSON.stringify(workload), { mode: 0o600, flag: 'wx' });
}
try {
  for (let i = 0; i < sampleCount; i += 1) {
    for (const name of selected) await scenarios[name]();
  }
} finally {
  await writeFile(output, JSON.stringify(samples), { mode: 0o600, flag: 'wx' });
}
assert(samples.every(({ scenario, status }) => status === (scenario === 'issue' ? 201 : 200)), 'CPU verification saw unsuccessful responses');
console.log(`Recorded ${samples.length} requests for comparison with Cloudflare invocation logs.`);
