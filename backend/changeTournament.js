/**
 * Admin Script: Change Tournament
 * 
 * Usage: node changeTournament.js <tournament_url>
 * 
 * Example:
 *   node changeTournament.js https://www.espncricinfo.com/series/ipl-2026-1510719
 * 
 * This script will:
 *   1. Scrape match data from the new tournament
 *   2. Process player stats
 *   3. Flush old data from the database (drafted_players, trades, tournament_stats, league_matches, users_teams)
 *   4. Sync new tournament data to Supabase
 */

const CricketScraper = require('./datascrape');
const CricketDataProcessor = require('./processPlayers');
const supabase = require('./supabase');
const fs = require('fs');
const path = require('path');

async function flushDatabase() {
    console.log('\n=== Flushing old tournament data from database ===');

    // Order matters due to foreign keys
    const tables = [
        {name: 'league_matches', col: 'id'},
        {name: 'drafted_players', col: 'player_id'},
        {name: 'trades', col: 'id'},
        {name: 'users_teams', col: 'id'},
        {name: 'tournament_stats', col: 'id'}
    ];

    for (const table of tables) {
        // Delete all rows by checking for not null on a required column
        const { error } = await supabase.from(table.name).delete().not(table.col, 'is', null);

        if (error) {
            console.error(`  ERROR flushing ${table.name}:`, error.message);
        } else {
            console.log(`  ✓ Flushed ${table.name}`);
        }
    }

    console.log('=== Database flush complete ===\n');
}

async function changeTournament(tournamentUrl) {
    // Normalize URL — strip trailing path segments like /match-schedule-fixtures-and-results
    let baseUrl = tournamentUrl;
    const seriesMatch = baseUrl.match(/(https:\/\/www\.espncricinfo\.com\/series\/[^\/]+)/);
    if (seriesMatch) {
        baseUrl = seriesMatch[1];
    }

    console.log(`\n========================================`);
    console.log(`  CHANGING TOURNAMENT`);
    console.log(`  URL: ${baseUrl}`);
    console.log(`========================================\n`);

    // Step 1: Scrape
    console.log('Step 1/4: Scraping match data...');
    const scraper = new CricketScraper(baseUrl);
    const scrapedData = await scraper.scrape();

    const dataFile = path.join(__dirname, 'data.json');
    fs.writeFileSync(dataFile, JSON.stringify(scrapedData, null, 2), 'utf8');
    console.log(`  Scraped ${scrapedData.matches.length} matches, saved to data.json`);

    if (scrapedData.matches.length === 0) {
        console.error('  ERROR: No matches found! Check if the URL is correct.');
        process.exit(1);
    }

    // Step 2: Process player stats
    console.log('\nStep 2/4: Processing player stats...');
    const processor = new CricketDataProcessor(dataFile);
    const processed = processor.processData();

    const statsFile = path.join(__dirname, 'stats.json');
    fs.writeFileSync(statsFile, JSON.stringify(processed, null, 2));
    console.log(`  Processed ${Object.keys(processed.players).length} players`);
    if (processed.teams) {
        console.log(`  Found ${Object.keys(processed.teams).length} teams`);
    }

    // Step 3: Flush database
    console.log('\nStep 3/4: Flushing old data...');
    await flushDatabase();

    // Step 4: Sync new data to Supabase
    console.log('Step 4/4: Syncing new data to Supabase...');
    const { error } = await supabase
        .from('tournament_stats')
        .upsert({
            id: 1,
            tournament_url: processed.tournament,
            data: processed,
            updated_at: new Date()
        }, { onConflict: 'id' });

    if (error) {
        console.error('  ERROR syncing to Supabase:', error.message);
        process.exit(1);
    }

    console.log('  ✓ Tournament data synced to Supabase!');
    console.log(`\n========================================`);
    console.log(`  TOURNAMENT CHANGE COMPLETE`);
    console.log(`  ${processed.totalMatches} matches | ${Object.keys(processed.players).length} players`);
    console.log(`========================================\n`);
}

// CLI
const url = process.argv[2];
if (!url) {
    console.error('Usage: node changeTournament.js <tournament_url>');
    console.error('Example: node changeTournament.js https://www.espncricinfo.com/series/ipl-2026-1510719');
    process.exit(1);
}

changeTournament(url).catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
