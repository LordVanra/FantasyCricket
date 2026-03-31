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

  normalizePlayerType(rawType) {
    if (!rawType) return null;
    const compact = rawType.replace(/\s+/g, ' ').trim();
    const lower = compact.toLowerCase();
    const battingKeywords = ['batter', 'batsman', 'wicketkeeper', 'keeper', 'wk'];
    const bowlingKeywords = ['bowler', 'pace', 'fast', 'medium', 'seam', 'spin', 'spinner', 'orthodox', 'offbreak', 'legbreak', 'chinaman', 'googly'];

    const explicitRoleMatch = compact.match(/(all-?rounder|bowler|wicketkeeper(?:\s*batter)?|batter|batsman)\s*(?=age\b)/i)
      || compact.match(/playing\s*role\s*:?\s*(all-?rounder|bowler|batter|batsman|wicketkeeper(?:\s*batter)?)/i);

    if (explicitRoleMatch) {
      const explicit = explicitRoleMatch[1].toLowerCase();
      if (explicit.includes('all')) return 'allrounder';
      if (explicit.includes('bowl')) return 'bowler';
      return 'batsman';
    }

    if (lower.includes('all-rounder') || lower.includes('all rounder') || lower.includes('allrounder')) {
      return 'allrounder';
    }

    const hasBowlingSignal = bowlingKeywords.some(keyword => lower.includes(keyword));
    const hasBattingSignal = battingKeywords.some(keyword => lower.includes(keyword));

    if (hasBowlingSignal && hasBattingSignal) {
      return null;
    }

    if (hasBowlingSignal) {
      return 'bowler';
    }
    if (hasBattingSignal) {
      return 'batsman';
    }

    return null;
  }

  extractPlayerType(contextText) {
    if (!contextText) return null;
    return this.normalizePlayerType(contextText);
  }

  extractMatchDate(responseBody, $) {
    if (!responseBody) return null;

    const startDatePatterns = [
      /"startDate"\s*:\s*"([^"]+)"/i,
      /"date"\s*:\s*"(\d{4}-\d{2}-\d{2})"/i,
      /"datePublished"\s*:\s*"([^"]+)"/i
    ];

    for (const pattern of startDatePatterns) {
      const match = responseBody.match(pattern);
      if (!match || !match[1]) continue;

      const parsed = new Date(match[1]);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString().slice(0, 10);
      }
    }

    // Fallback: some pages expose a date in visible content.
    const dateText = $('span, div, p')
      .map((_, el) => this.cleanText($(el).text()))
      .get()
      .find((txt) => /\b\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}\b/.test(txt));

    if (dateText) {
      const match = dateText.match(/\b(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})\b/);
      if (match && match[1]) {
        const parsed = new Date(match[1]);
        if (!Number.isNaN(parsed.getTime())) {
          return parsed.toISOString().slice(0, 10);
        }
      }
    }

    return null;
  }

  async scrapeMatch(matchUrl) {
    try {
      const response = await axios.get(matchUrl, { headers: this.headers });
      const $ = cheerio.load(response.data);
      const matchDate = this.extractMatchDate(response.data, $);

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

      return { batting: battingData, bowling: bowlingData, fielding: fielding, matchDate };
    } catch (error) {
      return { batting: [], bowling: [], fielding: [], matchDate: null };
    }
  }

  async scrapeSquads() {
    const squads = {};
    try {
      // First try the new ESPNCricinfo layout: /squads
      const teamsUrl = `https://www.espncricinfo.com/series/${this.seriesSlug}-${this.seriesId}/squads`;
      console.log(`Scraping teams from: ${teamsUrl}`);
      const response = await axios.get(teamsUrl, { headers: this.headers });
      const $ = cheerio.load(response.data);

      const teamLinks = [];
      // Find all team squad links (they now end in /series-squads)
      $('a').each((i, elem) => {
        const href = $(elem).attr('href') || '';
        if (href.includes(`/series/${this.seriesSlug}`) && href.includes('/series-squads')) {
          const fullUrl = href.startsWith('http') ? href : `https://www.espncricinfo.com${href}`;
          if (!teamLinks.includes(fullUrl)) {
            teamLinks.push(fullUrl);
          }
        }
      });

      console.log(`Found ${teamLinks.length} team squad links.`);

      // Now fetch each team's squad page
      for (const teamUrl of teamLinks) {
        try {
          // Extract team name from the URL, e.g., /mumbai-indians-squad-1511109/ -> mumbai indians
          const teamMatch = teamUrl.match(/\/([^/]+)-squad-\d+\/series-squads/);
          let teamName = teamMatch ? teamMatch[1].replace(/-/g, ' ') : 'Unknown Team';
          // Capitalize team name
          teamName = teamName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

          console.log(`  Scraping squad for: ${teamName}`);
          const teamResp = await axios.get(teamUrl, { headers: this.headers });
          const $team = cheerio.load(teamResp.data);

          if (!squads[teamName]) squads[teamName] = [];
          
          $team('a').each((i, elem) => {
            const href = $team(elem).attr('href') || '';
            const text = this.cleanPlayerName(this.cleanText($team(elem).text()));
            if (href.includes('/cricketers/') && text && text.length > 1 && !text.toLowerCase().includes('cricketers')) {
              const cardText = this.cleanText($team(elem).closest('div.ds-border-line, div.ds-relative.ds-flex.ds-flex-row').text());
              const parentText = this.cleanText($team(elem).parent().text());
              const rowText = this.cleanText($team(elem).closest('li, div, tr').text());
              const inferredType = this.extractPlayerType(`${cardText} ${parentText} ${rowText}`.replace(text, '').trim());
              const existing = squads[teamName].find(p => p.url === href);
              if (!existing) {
                squads[teamName].push({ name: text, url: href, type: inferredType });
              } else if (!existing.type && inferredType) {
                existing.type = inferredType;
              }
            }
          });

          await new Promise(r => setTimeout(r, 1500));
        } catch (err) {
          console.log(`  Could not scrape squad for team URL: ${teamUrl} - ${err.message}`);
        }
      }

      const totalPlayers = Object.values(squads).reduce((sum, arr) => sum + arr.length, 0);
      console.log(`Scraped ${Object.keys(squads).length} team squads with ${totalPlayers} total players`);

    } catch (error) {
      console.log(`Could not scrape squads page: ${error.message}`);
      console.log('Bench players may not be included in the draft pool.');
    }
    return squads;
  }

  async scrape() {
    const layers = { url: this.url, matches: [], squads: {} };

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
        if (!href) return;
        // Match any link that belongs to this series and contains '-vs-' (an actual match link)
        if (href.includes(this.seriesSlug) && href.includes(this.seriesId) && href.includes('-vs-')) {
          let matchPath = href.startsWith('http') ? href : `https://www.espncricinfo.com${href}`;
          // Normalize to full-scorecard URL by replacing the trailing path segment
          matchPath = matchPath.replace(/\/(?:live-cricket-score|scorecard|ball-by-ball-commentary|points-table-standings|match-(?:photos|videos))$/, '/full-scorecard');
          if (!matchPath.endsWith('/full-scorecard')) {
            matchPath = matchPath + '/full-scorecard';
          }
          if (!matchUrls.includes(matchPath)) {
            matchUrls.push(matchPath);
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

    // Scrape full team rosters
    try {
      layers.squads = await this.scrapeSquads();
    } catch (error) {
      console.log('Squad scraping failed, continuing without roster data:', error.message);
    }

    return layers;
  }
}

if (require.main === module) {
  const url = process.argv[2];
  const outputFile = process.argv[3] || 'data.json';

  new CricketScraper(url).scrape().then(data => {
    fs.writeFileSync(outputFile, JSON.stringify(data, null, 2), 'utf8');
    console.log(`Saved to ${outputFile}`);
  });
}

module.exports = CricketScraper;