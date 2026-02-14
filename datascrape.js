const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

class CricketScraper {
  constructor(url) {
    this.url = url;
    const match = url.match(/\/series\/([^\/]+)-(\d+)/);
    this.seriesSlug = match ? match[1] : '';
    this.seriesId = match ? match[2] : '';
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    };
  }

  cleanText(text) {
    return text.replace(/[^a-zA-Z0-9\s\.\(\)]/g, '').replace(/\s+/g, ' ').trim();
  }

  async scrapeMatch(matchUrl) {
    try {
      const response = await axios.get(matchUrl, { headers: this.headers });
      const $ = cheerio.load(response.data);

      const battingData = [];
      const bowlingData = [];
      const fieldingData = [];

      let isBowlingTable = false;

      $('table').each((i, table) => {
        const tableText = $(table).text();

        if (tableText.includes('BOWLING') || tableText.includes('Bowling')) {
          isBowlingTable = true;
        } else if (tableText.includes('BATTING') || tableText.includes('Batting')) {
          isBowlingTable = false;
        }

        $(table).find('tbody tr').each((j, row) => {
          const cells = $(row).find('td');

          if (!isBowlingTable && cells.length >= 7 && cells.length <= 8) {
            const player = this.cleanText($(cells[0]).text());
            const dismissal = this.cleanText($(cells[1]).text());
            const runs = this.cleanText($(cells[2]).text());
            const balls = this.cleanText($(cells[3]).text());

            if (player && runs && !isNaN(parseInt(runs))) {
              const mins = cells.length === 8 ? this.cleanText($(cells[4]).text()) : '';
              const fours = cells.length === 8 ? this.cleanText($(cells[5]).text()) : this.cleanText($(cells[4]).text());
              const sixes = cells.length === 8 ? this.cleanText($(cells[6]).text()) : this.cleanText($(cells[5]).text());
              const sr = cells.length === 8 ? this.cleanText($(cells[7]).text()) : this.cleanText($(cells[6]).text());

              battingData.push({ player, runs, balls, mins, fours, sixes, sr });

              if (dismissal.toLowerCase().includes('c ')) {
                const catchMatch = dismissal.match(/c\s+([^\s]+)/i);
                if (catchMatch) {
                  const fielder = this.cleanText(catchMatch[1]);
                  const existing = fieldingData.find(f => f.player === fielder);
                  if (existing) {
                    existing.catches = (parseInt(existing.catches) || 0) + 1;
                  } else {
                    fieldingData.push({ player: fielder, catches: 1, runouts: 0, stumpings: 0 });
                  }
                }
              }

              if (dismissal.toLowerCase().includes('run out')) {
                const roMatch = dismissal.match(/run out\s+\(([^)]+)\)/i);
                if (roMatch) {
                  const fielders = roMatch[1].split('/');
                  fielders.forEach(f => {
                    const fielder = this.cleanText(f);
                    const existing = fieldingData.find(fd => fd.player === fielder);
                    if (existing) {
                      existing.runouts = (parseInt(existing.runouts) || 0) + 1;
                    } else {
                      fieldingData.push({ player: fielder, catches: 0, runouts: 1, stumpings: 0 });
                    }
                  });
                }
              }

              if (dismissal.toLowerCase().includes('st ')) {
                const stMatch = dismissal.match(/st\s+([^\s]+)/i);
                if (stMatch) {
                  const keeper = this.cleanText(stMatch[1]);
                  const existing = fieldingData.find(f => f.player === keeper);
                  if (existing) {
                    existing.stumpings = (parseInt(existing.stumpings) || 0) + 1;
                  } else {
                    fieldingData.push({ player: keeper, catches: 0, runouts: 0, stumpings: 1 });
                  }
                }
              }
            }
          }

          if (cells.length >= 5) {
            const col0 = this.cleanText($(cells[0]).text());
            const col1 = this.cleanText($(cells[1]).text());
            const col2 = this.cleanText($(cells[2]).text());
            const col3 = this.cleanText($(cells[3]).text());
            const col4 = this.cleanText($(cells[4]).text());
            const col5 = cells.length > 5 ? this.cleanText($(cells[5]).text()) : '';

            if (col0 && col1 && col3 && col4 && (col1.includes('.') || col1.match(/^\d+$/))) {
              bowlingData.push({
                bowler: col0,
                overs: col1,
                maidens: col2,
                runs: col3,
                wickets: col4,
                economy: col5,
                dots: cells.length >= 7 ? this.cleanText($(cells[6]).text()) : '',
                fours: cells.length >= 8 ? this.cleanText($(cells[7]).text()) : '',
                sixes: cells.length >= 9 ? this.cleanText($(cells[8]).text()) : '',
                wides: cells.length >= 10 ? this.cleanText($(cells[9]).text()) : '',
                noballs: cells.length >= 11 ? this.cleanText($(cells[10]).text()) : ''
              });
            }
          }
        });
      });

      return { batting: battingData, bowling: bowlingData, fielding: fieldingData };
    } catch (error) {
      return { batting: [], bowling: [], fielding: [] };
    }
  }

  async scrape() {
    const layers = { url: this.url, matches: [] };

    if (!this.url) {
      return layers;
    }

    try {
      const resultsUrl = `https://www.espncricinfo.com/series/${this.seriesSlug}-${this.seriesId}/match-results`;

      const response = await axios.get(resultsUrl, { headers: this.headers });
      const $ = cheerio.load(response.data);

      const matchUrls = [];
      $('a').each((i, elem) => {
        const href = $(elem).attr('href');
        if (href && (href.includes('/scorecard') || href.includes('/full-scorecard'))) {
          if (href.includes(this.seriesSlug) && href.includes(this.seriesId)) {
            const fullUrl = href.startsWith('http') ? href : `https://www.espncricinfo.com${href}`;
            if (!matchUrls.includes(fullUrl)) {
              matchUrls.push(fullUrl);
            }
          }
        }
      });

      for (let i = 0; i < matchUrls.length; i++) {
        const data = await this.scrapeMatch(matchUrls[i]);
        layers.matches.push({ url: matchUrls[i], ...data });
        await new Promise(r => setTimeout(r, 1500));
      }

    } catch (error) {
      console.error('Error:', error.message);
    }

    return layers;
  }
}

const url = process.argv[2];
const outputFile = process.argv[3] || 'data.json';

new CricketScraper(url).scrape().then(data => {
  fs.writeFileSync(outputFile, JSON.stringify(data, null, 2), 'utf8');
  console.log(`Saved to ${outputFile}`);
});

module.exports = CricketScraper;