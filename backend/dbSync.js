const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
async function syncStats(file = path.join(__dirname, 'stats.json')) {
    const base = process.env.FANTASY_API_URL;
    const token = process.env.STATS_SYNC_TOKEN;
    if (!base || !token) throw new Error('Set FANTASY_API_URL and STATS_SYNC_TOKEN for the Cloudflare backend');
    const stats = JSON.parse(fs.readFileSync(file, 'utf8'));
    const result = await fetch(`${base.replace(/\/$/, '')}/api/admin/stats`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(stats), signal: AbortSignal.timeout(30000)
    });
    if (!result.ok) throw new Error(`Stats sync failed (${result.status}): ${await result.text()}`);
    console.log('Tournament statistics synced to Cloudflare D1');
}
module.exports = { syncStats };
