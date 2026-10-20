// Disposable smoke account only; does not create leagues or alter gameplay data.
import assert from 'node:assert/strict';
const base = process.env.FANTASY_TEST_URL;
assert(base?.startsWith('https://'), 'Set FANTASY_TEST_URL to the deployed HTTPS origin');
const username = `smoke_${Date.now()}`;
const password = crypto.randomUUID();
let cookie = '';
async function call(op, params = {}, origin = base) {
  const response = await fetch(`${base}/api/rpc`, { method: 'POST', headers: {
    'Content-Type': 'application/json', Origin: origin, Cookie: cookie,
  }, body: JSON.stringify({ op, params }) });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) {
    assert.match(setCookie, /HttpOnly/i); assert.match(setCookie, /Secure/i);
    cookie = setCookie.split(';')[0];
  }
  return { status: response.status, data: await response.json() };
}
assert.equal((await fetch(`${base}/api/health`)).status, 200);
assert.equal((await call('getUser')).data, null);
assert.equal((await call('getTournamentStats')).status, 401);
const credentials = { email: `${username}@fantasy-app.internal`, password };
assert.equal((await call('signUp', credentials)).status, 200);
assert.equal((await call('signIn', credentials)).status, 200);
try {
  assert.equal((await call('getUser')).data.username, username);
  const result = await call('getTournamentStats');
  assert.equal(result.status, 200);
  assert(Object.keys(result.data.players).length > 0);
  assert.equal((await call('getLeagues', {}, 'https://untrusted.example')).status, 403);
  console.log(JSON.stringify({ origin: base, health: 'passed', signup: 'passed', login: 'passed', secureCookie: 'passed', session: 'passed', statsPlayers: Object.keys(result.data.players).length, originProtection: 'passed' }));
} finally {
  assert.equal((await call('deleteAccount')).status, 200);
  assert.equal((await call('getUser')).data, null);
  console.log('Disposable smoke account removed.');
}
