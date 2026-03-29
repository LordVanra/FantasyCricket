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
    this.defaultPlayerType = 'batsman';
  }

  extractTeamsFromUrl(matchUrl) {
    // URL format: .../teamA-vs-teamB-Nth-match-group-X-ID/full-scorecard
    // Extract the match slug (segment after series ID)
    const parts = matchUrl.split('/');
    // Find the segment that contains '-vs-'
    const matchSlug = parts.find(p => p.includes('-vs-'));
    if (!matchSlug) return [];

    // Split on '-vs-' to get team parts
    // e.g. "india-vs-pakistan-27th-match-group-a-1512745" -> ["india", "pakistan-27th-match-group-a-1512745"]
    const vsSplit = matchSlug.split('-vs-');
    if (vsSplit.length !== 2) return [];

    const teamA = vsSplit[0]; // e.g. "india"
    // teamB is everything before the match number suffix
    // e.g. "pakistan-27th-match-group-a-1512745" -> "pakistan"
    // The match number part starts with a digit followed by ordinal suffix (st, nd, rd, th)
    const teamBMatch = vsSplit[1].match(/^(.+?)-\d+(?:st|nd|rd|th)-match/);
    const teamB = teamBMatch ? teamBMatch[1] : vsSplit[1];

    return [teamA, teamB];
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

  normalizePlayerType(type) {
    if (!type) return null;
    const compact = String(type).replace(/\s+/g, ' ').trim();
    const normalized = compact.toLowerCase();
    const battingKeywords = ['batsman', 'batter', 'wicketkeeper', 'keeper', 'wk'];
    const bowlingKeywords = ['bowler', 'pace', 'fast', 'medium', 'seam', 'spin', 'spinner', 'orthodox', 'offbreak', 'legbreak', 'chinaman', 'googly'];

    const explicitRoleMatch = compact.match(/(all-?rounder|bowler|wicketkeeper(?:\s*batter)?|batter|batsman)\s*(?=age\b)/i)
      || compact.match(/playing\s*role\s*:?\s*(all-?rounder|bowler|batter|batsman|wicketkeeper(?:\s*batter)?)/i);

    if (explicitRoleMatch) {
      const explicit = explicitRoleMatch[1].toLowerCase();
      if (explicit.includes('all')) return 'allrounder';
      if (explicit.includes('bowl')) return 'bowler';
      return 'batsman';
    }

    if (normalized.includes('all-rounder') || normalized.includes('all rounder') || normalized.includes('allrounder')) {
      return 'allrounder';
    }

    const hasBowlingSignal = bowlingKeywords.some(keyword => normalized.includes(keyword));
    const hasBattingSignal = battingKeywords.some(keyword => normalized.includes(keyword));

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

  inferPlayerType(player, preferredType = null) {
    const preferred = this.normalizePlayerType(preferredType);
    if (preferred) return preferred;

    const hasBatting = (player.batting && player.batting.length > 0)
      || player.totalRuns > 0
      || player.totalBalls > 0
      || player.totalFours > 0
      || player.totalSixes > 0;

    const hasBowling = (player.bowling && player.bowling.length > 0)
      || player.totalWickets > 0
      || player.totalOvers > 0
      || player.totalRunsConceded > 0;

    if (hasBatting && hasBowling) return 'allrounder';
    if (hasBowling) return 'bowler';
    if (hasBatting) return 'batsman';

    return this.defaultPlayerType;
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

  findCanonicalName(name, url, options = {}) {
    const { allowSurnameFallback = true } = options;
    const id = this.getPlayerId(url);
    if (id && this.idToNameMap[id]) {
      return this.idToNameMap[id];
    }

    const normalized = this.normalizePlayerName(name);
    if (!normalized) return null;

    if (this.fullNames.has(normalized)) {
      return normalized;
    }

    if (!allowSurnameFallback) {
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
        playerType: null,
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

    // Build teams map: teamName -> ordered list of match URLs
    const teamsMap = {};
    this.data.matches.forEach((match, matchIndex) => {
      const teams = this.extractTeamsFromUrl(match.url);
      teams.forEach(team => {
        if (!teamsMap[team]) teamsMap[team] = [];
        teamsMap[team].push(match.url);
      });
    });
    console.log(`Found ${Object.keys(teamsMap).length} teams: ${Object.keys(teamsMap).join(', ')}`);

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

    // Assign team to each player by finding which team appears in all their match URLs
    Object.keys(this.playerNameMap).forEach(name => {
      const player = this.playerNameMap[name];
      if (player.matches.length === 0) return;

      // Collect all team names from the player's matches
      const teamCounts = {};
      player.matches.forEach(matchUrl => {
        const teams = this.extractTeamsFromUrl(matchUrl);
        teams.forEach(t => {
          teamCounts[t] = (teamCounts[t] || 0) + 1;
        });
      });

      // The player's team is the one that appears in ALL of their matches
      const playerTeam = Object.keys(teamCounts).find(t => teamCounts[t] === player.matches.length);
      if (playerTeam) {
        player.team = playerTeam;
      } else {
        // Fallback: use the most frequent team
        player.team = Object.keys(teamCounts).sort((a, b) => teamCounts[b] - teamCounts[a])[0] || null;
        if (player.team) {
          console.log(`WARNING: Could not uniquely determine team for ${name}, using most frequent: ${player.team}`);
        }
      }
    });

    // Merge squad roster players (bench players who haven't played in any match)
    if (this.data.squads && Object.keys(this.data.squads).length > 0) {
      let rosterAdded = 0;
      Object.keys(this.data.squads).forEach(teamName => {
        const squad = this.data.squads[teamName];
        if (!Array.isArray(squad)) return;

        squad.forEach(rosterPlayer => {
          const canonical = this.findCanonicalName(rosterPlayer.name, rosterPlayer.url, { allowSurnameFallback: false });
          if (!canonical) return;

          const rosterType = this.normalizePlayerType(rosterPlayer.type);

          // Skip if already in playerNameMap (already found from match data)
          if (this.playerNameMap[canonical]) {
            if (!this.playerNameMap[canonical].playerType && rosterType) {
              this.playerNameMap[canonical].playerType = rosterType;
            }
            if (!this.playerNameMap[canonical].team) {
              this.playerNameMap[canonical].team = teamName;
            }
            return;
          }

          // Add as a new player with 0 stats
          this.playerNameMap[canonical] = {
            name: canonical,
            url: rosterPlayer.url,
            playerType: rosterType,
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
            matches: [],
            team: teamName
          };
          rosterAdded++;
        });
      });
      console.log(`Added ${rosterAdded} bench players from team rosters`);
    }

    Object.keys(this.playerNameMap).forEach(name => {
      const player = this.playerNameMap[name];
      player.playerType = this.inferPlayerType(player, player.playerType);
    });

    const sortedPlayers = Object.keys(this.playerNameMap)
      .sort()
      .reduce((acc, key) => {
        acc[key] = this.playerNameMap[key];
        return acc;
      }, {});

    const matches = this.data.matches || [];
    const lastMatchUrl = matches.length > 0 ? matches[matches.length - 1].url : null;

    return {
      tournament: this.data.url,
      totalMatches: matches.length,
      lastMatchUrl: lastMatchUrl,
      teams: teamsMap,
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

if (require.main === module) {
  const inputFile = process.argv[2] || 'scraped-data.json';
  const outputFile = process.argv[3] || 'player-stats.json';

  const processor = new CricketDataProcessor(inputFile);
  processor.save(outputFile).then(() => {
    // Exit gracefully to avoid libuv assertion on Windows
  }).catch(err => {
    console.error('Processor failed:', err);
    process.exitCode = 1;
  });
}

module.exports = CricketDataProcessor;