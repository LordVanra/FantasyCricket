const fs = require('fs');
const path = require('path');
const supabase = require('./supabase');

async function syncStats() {
    try {
        const statsPath = path.join(__dirname, 'stats.json');
        const statsData = JSON.parse(fs.readFileSync(statsPath, 'utf8'));

        const { data, error } = await supabase
            .from('tournament_stats')
            .upsert({
                id: 1,
                tournament_url: statsData.tournament,
                data: statsData,
                updated_at: new Date()
            }, { onConflict: 'id' });

        if (error) throw error;
        console.log('Successfully synced stats.json to Supabase!');
    } catch (error) {
        console.error('Error syncing stats:', error.message);
    }
}

// Function to handle user data
async function saveUserData(userId, players, starting11) {
    try {
        const { data, error } = await supabase
            .from('users')
            .upsert({
                id: userId,
                players: players,
                starting11: starting11,
                updated_at: new Date()
            }, { onConflict: 'id' });

        if (error) throw error;
        console.log(`Successfully saved data for user ${userId}`);
    } catch (error) {
        console.error('Error saving user data:', error.message);
    }
}

// Uncomment to run immediately
// syncStats();

module.exports = { syncStats, saveUserData };
