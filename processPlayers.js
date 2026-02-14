const fs = require('fs');
const { syncStats } = require('./dbSync'); // Import database sync function

class CricketDataProcessor {
  constructor(inputFile) {
    this.inputFile = inputFile;
    this.data = null;
    this.playerNameMap = {};
    this.idToNameMap = {};
    this.fullNames = new Set();
    this.surnameMap = {};
  }

  getPlayerId(url) {
    if (!url) return null;
    // Extract ID from URL like "/cricketers/scott-edwards-1150774"
    const match = url.match(/-(\d+)$/);
    if (match) return match[1];
    // If it's a full URL or doesn't match the pattern, use the whole thing as fallback
    return url.split('/').pop();
  }

  normalizePlayerName(name) {
    if (!name) return null;
    name = name.replace(/\(c\)/g, '').trim();
    name = name.replace(/\s+/g, ' ');

    if (name.length <= 1) return null;
    if (['b', 'c', 'st', 'sub', 'Sub'].includes(name)) return null;

    const parts = name.split(' ');
    if (parts.length === 1 && parts[0].length < 3) return null;

    return name;
  }

  buildNameMaps() {
    this.data.matches.forEach(match => {
      // Use batting and bowling names as sources for fullNames
      const fullNamesSource = [
        ...match.batting.map(p => ({ name: p.player, url: p.url })),
        ...match.bowling.map(p => ({ name: p.bowler, url: p.url }))
      ];

      fullNamesSource.forEach(p => {
        const id = this.getPlayerId(p.url);
        const name = this.normalizePlayerName(p.name);

        if (id && name) {
          if (!this.idToNameMap[id] || name.length > this.idToNameMap[id].length) {
            this.idToNameMap[id] = name;
          }
        }

        if (name) {
          this.fullNames.add(name);
        }
      });

      // Also process fielding URLs for identity tracking, but don't add to fullNames
      match.fielding.forEach(p => {
        const id = this.getPlayerId(p.url);
        const name = this.normalizePlayerName(p.player);
        if (id && name) {
          if (!this.idToNameMap[id] || name.length > this.idToNameMap[id].length) {
            this.idToNameMap[id] = name;
          }
        }
      });
    });

    this.fullNames.forEach(fullName => {
      const parts = fullName.split(' ');

      parts.forEach((part, idx) => {
        if (!this.surnameMap[part]) {
          this.surnameMap[part] = [];
        }
        this.surnameMap[part].push({
          fullName: fullName,
          isLastName: idx === parts.length - 1,
          partCount: parts.length
        });
      });
    });

    for (let key in this.surnameMap) {
      this.surnameMap[key].sort((a, b) => {
        if (a.isLastName && !b.isLastName) return -1;
        if (!a.isLastName && b.isLastName) return 1;
        return b.partCount - a.partCount;
      });
    }
  }

  findCanonicalName(name, url) {
    const id = this.getPlayerId(url);
    if (id && this.idToNameMap[id]) {
      return this.idToNameMap[id];
    }

    const normalized = this.normalizePlayerName(name);
    if (!normalized) return null;

    if (this.fullNames.has(normalized)) {
      return normalized;
    }

    // Try splitting the name and looking for the last part (surname) in the map
    const parts = normalized.split(' ');
    const surname = parts[parts.length - 1];

    if (this.surnameMap[surname] && this.surnameMap[surname].length > 0) {
      // Check if any of the full names with this surname match the other parts better
      // For now, we'll take the first one which is sorted by importance/completeness
      return this.surnameMap[surname][0].fullName;
    }

    return normalized;
  }

  addPlayer(name, url) {
    const canonical = this.findCanonicalName(name, url);
    if (!canonical) return null;

    if (!this.playerNameMap[canonical]) {
      this.playerNameMap[canonical] = {
        name: canonical,
        url: url,
        batting: [],
        bowling: [],
        fielding: [],
        totalRuns: 0,
        totalBalls: 0,
        totalFours: 0,
        totalSixes: 0,
        totalWickets: 0,
        totalRunsConceded: 0,
        totalOvers: 0,
        totalCatches: 0,
        totalRunouts: 0,
        totalStumpings: 0,
        matches: []
      };
    }

    return canonical;
  }

  processData() {
    const rawData = fs.readFileSync(this.inputFile, 'utf8');
    const cleanedData = rawData.replace(/^\uFEFF/, '');
    this.data = JSON.parse(cleanedData);

    this.buildNameMaps();

    console.log(`Found ${this.fullNames.size} unique full names from batting/bowling`);

    this.data.matches.forEach((match, matchIndex) => {
      match.batting.forEach(bat => {
        const canonical = this.addPlayer(bat.player, bat.url);
        if (!canonical) return;

        const runs = parseInt(bat.runs) || 0;
        const balls = parseInt(bat.balls) || 0;
        const fours = parseInt(bat.fours) || 0;
        const sixes = parseInt(bat.sixes) || 0;

        this.playerNameMap[canonical].batting.push({
          matchUrl: match.url,
          matchNumber: matchIndex + 1,
          runs: bat.runs,
          balls: bat.balls,
          fours: bat.fours,
          sixes: bat.sixes,
          sr: bat.sr
        });

        this.playerNameMap[canonical].totalRuns += runs;
        this.playerNameMap[canonical].totalBalls += balls;
        this.playerNameMap[canonical].totalFours += fours;
        this.playerNameMap[canonical].totalSixes += sixes;

        if (!this.playerNameMap[canonical].matches.includes(match.url)) {
          this.playerNameMap[canonical].matches.push(match.url);
        }
      });

      match.bowling.forEach(bowl => {
        const canonical = this.addPlayer(bowl.bowler, bowl.url);
        if (!canonical) return;

        const wickets = parseInt(bowl.wickets) || 0;
        const runs = parseInt(bowl.runs) || 0;
        const overs = parseFloat(bowl.overs) || 0;

        this.playerNameMap[canonical].bowling.push({
          matchUrl: match.url,
          matchNumber: matchIndex + 1,
          overs: bowl.overs,
          maidens: bowl.maidens,
          runs: bowl.runs,
          wickets: bowl.wickets,
          economy: bowl.economy,
          dots: bowl.dots
        });

        this.playerNameMap[canonical].totalWickets += wickets;
        this.playerNameMap[canonical].totalRunsConceded += runs;
        this.playerNameMap[canonical].totalOvers += overs;

        if (!this.playerNameMap[canonical].matches.includes(match.url)) {
          this.playerNameMap[canonical].matches.push(match.url);
        }
      });

      match.fielding.forEach(field => {
        const canonical = this.findCanonicalName(field.player, field.url);
        if (!canonical) return;

        if (!this.playerNameMap[canonical]) {
          console.log(`WARNING: Fielding name "${field.player}" mapped to "${canonical}" but not in batting/bowling`);
          this.addPlayer(canonical, field.url);
        }

        this.playerNameMap[canonical].fielding.push({
          matchUrl: match.url,
          matchNumber: matchIndex + 1,
          catches: field.catches || 0,
          runouts: field.runouts || 0,
          stumpings: field.stumpings || 0
        });

        this.playerNameMap[canonical].totalCatches += parseInt(field.catches) || 0;
        this.playerNameMap[canonical].totalRunouts += parseInt(field.runouts) || 0;
        this.playerNameMap[canonical].totalStumpings += parseInt(field.stumpings) || 0;

        if (!this.playerNameMap[canonical].matches.includes(match.url)) {
          this.playerNameMap[canonical].matches.push(match.url);
        }
      });
    });

    const sortedPlayers = Object.keys(this.playerNameMap)
      .sort()
      .reduce((acc, key) => {
        acc[key] = this.playerNameMap[key];
        return acc;
      }, {});

    return {
      tournament: this.data.url,
      totalMatches: this.data.matches.length,
      players: sortedPlayers
    };
  }

  async save(outputFile) {
    const processed = this.processData();
    fs.writeFileSync(outputFile, JSON.stringify(processed, null, 2));
    console.log(`Processed data saved to ${outputFile}`);
    console.log(`Total players: ${Object.keys(processed.players).length}`);

    // Automated database sync
    try {
      await syncStats();
    } catch (err) {
      console.error('Failed to sync to database:', err.message);
    }
  }
}

const inputFile = process.argv[2] || 'scraped-data.json';
const outputFile = process.argv[3] || 'player-stats.json';

const processor = new CricketDataProcessor(inputFile);
processor.save(outputFile).then(() => {
  // Exit gracefully to avoid libuv assertion on Windows
}).catch(err => {
  console.error('Processor failed:', err);
  process.exitCode = 1;
});

module.exports = CricketDataProcessor;