const fs = require('fs');

class CricketDataProcessor {
  constructor(inputFile) {
    this.inputFile = inputFile;
    this.data = null;
  }

  cleanPlayerName(name) {
    return name.replace(/[^a-zA-Z0-9\s\(\)]/g, '').trim();
  }

  getLastName(fullName) {
    const cleaned = this.cleanPlayerName(fullName);
    const parts = cleaned.split(' ').filter(p => p.length > 0);
    
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0];
    
    return parts[parts.length - 1];
  }

  processData() {
    const rawData = fs.readFileSync(this.inputFile, 'utf8');
    const cleanedData = rawData.replace(/^\uFEFF/, '');
    this.data = JSON.parse(cleanedData);

    const playerStats = {};

    this.data.matches.forEach((match, matchIndex) => {
      match.batting.forEach(bat => {
        const lastName = this.getLastName(bat.player);
        const cleanName = this.cleanPlayerName(bat.player);
        
        if (!playerStats[lastName]) {
          playerStats[lastName] = {
            fullName: cleanName,
            lastName: lastName,
            matches: [],
            totalRuns: 0,
            totalBalls: 0,
            totalFours: 0,
            totalSixes: 0,
            innings: 0,
            notOuts: 0,
            batting: [],
            bowling: [],
            fielding: []
          };
        }

        const runs = parseInt(bat.runs) || 0;
        const balls = parseInt(bat.balls) || 0;
        const fours = parseInt(bat.fours) || 0;
        const sixes = parseInt(bat.sixes) || 0;
        const isNotOut = bat.player.toLowerCase().includes('not out');

        playerStats[lastName].totalRuns += runs;
        playerStats[lastName].totalBalls += balls;
        playerStats[lastName].totalFours += fours;
        playerStats[lastName].totalSixes += sixes;
        playerStats[lastName].innings += 1;
        if (isNotOut) playerStats[lastName].notOuts += 1;

        playerStats[lastName].batting.push({
          matchUrl: match.url,
          matchNumber: matchIndex + 1,
          runs: bat.runs,
          balls: bat.balls,
          fours: bat.fours,
          sixes: bat.sixes,
          sr: bat.sr
        });

        if (!playerStats[lastName].matches.includes(match.url)) {
          playerStats[lastName].matches.push(match.url);
        }
      });

      match.bowling.forEach(bowl => {
        const lastName = this.getLastName(bowl.bowler);
        const cleanName = this.cleanPlayerName(bowl.bowler);
        
        if (!playerStats[lastName]) {
          playerStats[lastName] = {
            fullName: cleanName,
            lastName: lastName,
            matches: [],
            totalRuns: 0,
            totalBalls: 0,
            totalFours: 0,
            totalSixes: 0,
            innings: 0,
            notOuts: 0,
            batting: [],
            bowling: [],
            fielding: []
          };
        }

        playerStats[lastName].bowling.push({
          matchUrl: match.url,
          matchNumber: matchIndex + 1,
          overs: bowl.overs,
          maidens: bowl.maidens,
          runs: bowl.runs,
          wickets: bowl.wickets,
          economy: bowl.economy,
          dots: bowl.dots
        });

        if (!playerStats[lastName].matches.includes(match.url)) {
          playerStats[lastName].matches.push(match.url);
        }
      });

      match.fielding.forEach(field => {
        const playerName = field.player;
        let matchedLastName = null;

        for (let lastName in playerStats) {
          const fullName = playerStats[lastName].fullName;
          if (fullName.includes(playerName) || playerName.includes(lastName)) {
            matchedLastName = lastName;
            break;
          }
        }

        if (!matchedLastName) {
          matchedLastName = playerName;
          playerStats[matchedLastName] = {
            fullName: playerName,
            lastName: playerName,
            matches: [],
            totalRuns: 0,
            totalBalls: 0,
            totalFours: 0,
            totalSixes: 0,
            innings: 0,
            notOuts: 0,
            batting: [],
            bowling: [],
            fielding: []
          };
        }

        playerStats[matchedLastName].fielding.push({
          matchUrl: match.url,
          matchNumber: matchIndex + 1,
          catches: field.catches || 0,
          runouts: field.runouts || 0,
          stumpings: field.stumpings || 0
        });

        if (!playerStats[matchedLastName].matches.includes(match.url)) {
          playerStats[matchedLastName].matches.push(match.url);
        }
      });
    });

    const sortedPlayers = Object.keys(playerStats)
      .sort()
      .reduce((acc, key) => {
        acc[key] = playerStats[key];
        return acc;
      }, {});

    return {
      tournament: this.data.url,
      totalMatches: this.data.matches.length,
      players: sortedPlayers
    };
  }

  save(outputFile) {
    const processed = this.processData();
    fs.writeFileSync(outputFile, JSON.stringify(processed, null, 2));
    console.log(`Processed data saved to ${outputFile}`);
    console.log(`Total players: ${Object.keys(processed.players).length}`);
  }
}

const inputFile = process.argv[2] || 'scraped-data.json';
const outputFile = process.argv[3] || 'player-stats.json';

const processor = new CricketDataProcessor(inputFile);
processor.save(outputFile);

module.exports = CricketDataProcessor;