const fs = require('fs');
const path = require('path');
const CricketScraper = require('./datascrape');
const CricketDataProcessor = require('./processPlayers');
const { syncStats } = require('./dbSync');
async function changeTournament(url) {
    if (!/^https:\/\/www\.espncricinfo\.com\/series\//.test(url)) throw new Error('Provide an ESPN Cricinfo series URL');
    const scraper = new CricketScraper(url);
    const data = await scraper.scrape();
    const input = path.join(__dirname, 'data.json');
    const output = path.join(__dirname, 'stats.json');
    fs.writeFileSync(input, JSON.stringify(data));
    const processor = new CricketDataProcessor(input);
    await processor.save(output, { sync: false });
    await syncStats(output);
}
if (require.main === module) changeTournament(process.argv[2] || '').catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { changeTournament };
