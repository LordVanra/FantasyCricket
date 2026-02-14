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
    return text.replace(/[^a-zA-Z0-9\s\.\(\)\/]/g, '').replace(/\s+/g, ' ').trim();
  }

  cleanPlayerName(name) {
    let cleaned = name.replace(/\(c\)/g, '').trim();
    cleaned = cleaned.replace(/\s+/g, ' ');
    return cleaned;
  }

  async scrapeMatch(matchUrl) {
    try {
      const response = await axios.get(matchUrl, { headers: this.headers });
      const $ = cheerio.load(response.data);

      const battingData = [];
      const bowlingData = [];
      const fieldingData = {};

      $('table').each((i, table) => {
        const tableHtml = $(table).html();
        const isBattingTable = tableHtml.includes('BATTING') || tableHtml.includes('Batting');
        const isBowlingTable = tableHtml.includes('BOWLING') || tableHtml.includes('Bowling');

        $(table).find('tbody tr').each((j, row) => {
          const cells = $(row).find('td');

          if (isBattingTable && cells.length >= 7 && cells.length <= 8) {
            const playerCell = $(cells[0]);
            const playerName = this.cleanPlayerName(this.cleanText(playerCell.text()));
            const playerUrl = playerCell.find('a').attr('href');
            const dismissal = this.cleanText($(cells[1]).text());
            const runs = this.cleanText($(cells[2]).text());
            const balls = this.cleanText($(cells[3]).text());

            if (playerName && runs && !isNaN(parseInt(runs))) {
              const mins = cells.length === 8 ? this.cleanText($(cells[4]).text()) : '';
              const fours = cells.length === 8 ? this.cleanText($(cells[5]).text()) : this.cleanText($(cells[4]).text());
              const sixes = cells.length === 8 ? this.cleanText($(cells[6]).text()) : this.cleanText($(cells[5]).text());
              const sr = cells.length === 8 ? this.cleanText($(cells[7]).text()) : this.cleanText($(cells[6]).text());

              battingData.push({ player: playerName, url: playerUrl, runs, balls, mins, fours, sixes, sr });

              const dismissalCell = $(cells[1]);
              if (dismissal.toLowerCase().includes('c ')) {
                // Improved regex to handle initials and spaces better
                const catchMatch = dismissal.match(/c\s+([A-Z][A-Za-z\s\.]+?)(?:\s+b\s+|$)/i);
                if (catchMatch) {
                  const fielderName = this.cleanText(catchMatch[1]);
                  if (fielderName.length > 1 && !['sub', 'Sub'].includes(fielderName)) {
                    // Try to find the link for the fielder
                    let fielderUrl = '';
                    dismissalCell.find('a').each((k, link) => {
                      const linkText = this.cleanText($(link).text()).toLowerCase();
                      const searchName = fielderName.toLowerCase();
                      if (linkText.includes(searchName) || searchName.includes(linkText)) {
                        fielderUrl = $(link).attr('href');
                      }
                    });

                    if (!fieldingData[fielderName]) {
                      fieldingData[fielderName] = { catches: 0, runouts: 0, stumpings: 0, url: fielderUrl };
                    }
                    fieldingData[fielderName].catches += 1;
                    if (fielderUrl && !fieldingData[fielderName].url) {
                      fieldingData[fielderName].url = fielderUrl;
                    }
                  }
                }
              }

              if (dismissal.toLowerCase().includes('run out')) {
                const roMatch = dismissal.match(/run out\s+\(([^)]+)\)/i);
                if (roMatch) {
                  const fieldersText = roMatch[1];
                  const fielders = fieldersText.split('/');
                  fielders.forEach(f => {
                    const fielderName = this.cleanText(f);
                    if (fielderName.length > 1 && !['sub', 'Sub'].includes(fielderName)) {
                      let fielderUrl = '';
                      dismissalCell.find('a').each((k, link) => {
                        const linkText = this.cleanText($(link).text()).toLowerCase();
                        const searchName = fielderName.toLowerCase();
                        if (linkText.includes(searchName) || searchName.includes(linkText)) {
                          fielderUrl = $(link).attr('href');
                        }
                      });

                      if (!fieldingData[fielderName]) {
                        fieldingData[fielderName] = { catches: 0, runouts: 0, stumpings: 0, url: fielderUrl };
                      }
                      fieldingData[fielderName].runouts += 1;
                      if (fielderUrl && !fieldingData[fielderName].url) {
                        fieldingData[fielderName].url = fielderUrl;
                      }
                    }
                  });
                }
              }

              if (dismissal.toLowerCase().includes('st ')) {
                const stMatch = dismissal.match(/st\s+([A-Z][A-Za-z\s\.]+?)(?:\s+b\s+|$)/i);
                if (stMatch) {
                  const keeperName = this.cleanText(stMatch[1]);
                  if (keeperName.length > 1 && !['sub', 'Sub'].includes(keeperName)) {
                    let keeperUrl = '';
                    dismissalCell.find('a').each((k, link) => {
                      const linkText = this.cleanText($(link).text()).toLowerCase();
                      const searchName = keeperName.toLowerCase();
                      if (linkText.includes(searchName) || searchName.includes(linkText)) {
                        keeperUrl = $(link).attr('href');
                      }
                    });

                    if (!fieldingData[keeperName]) {
                      fieldingData[keeperName] = { catches: 0, runouts: 0, stumpings: 0, url: keeperUrl };
                    }
                    fieldingData[keeperName].stumpings += 1;
                    if (keeperUrl && !fieldingData[keeperName].url) {
                      fieldingData[keeperName].url = keeperUrl;
                    }
                  }
                }
              }
            }
          }

          if (isBowlingTable && cells.length >= 5) {
            const bowlerCell = $(cells[0]);
            const bowlerName = this.cleanPlayerName(this.cleanText(bowlerCell.text()));
            const bowlerUrl = bowlerCell.find('a').attr('href');
            const overs = this.cleanText($(cells[1]).text());
            const maidens = this.cleanText($(cells[2]).text());
            const runs = this.cleanText($(cells[3]).text());
            const wickets = this.cleanText($(cells[4]).text());
            const economy = cells.length > 5 ? this.cleanText($(cells[5]).text()) : '';

            if (bowlerName && overs && (overs.includes('.') || overs.match(/^\d+$/))) {
              bowlingData.push({
                bowler: bowlerName,
                url: bowlerUrl,
                overs: overs,
                maidens: maidens,
                runs: runs,
                wickets: wickets,
                economy: economy,
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

      const fielding = Object.keys(fieldingData).map(name => ({
        player: name,
        url: fieldingData[name].url,
        catches: fieldingData[name].catches,
        runouts: fieldingData[name].runouts,
        stumpings: fieldingData[name].stumpings
      }));

      return { batting: battingData, bowling: bowlingData, fielding: fielding };
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