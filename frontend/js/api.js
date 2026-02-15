const SUPABASE_URL = 'https://uxypkwbxduahafcarhos.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_vpoPggq4eCO208jUNxsmNA_xd7IcTmF';
const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const API = {
    async signUp(email, password) {
        return await supabaseClient.auth.signUp({ email, password });
    },
    async signIn(email, password) {
        return await supabaseClient.auth.signInWithPassword({ email, password });
    },
    async signOut() {
        return await supabaseClient.auth.signOut();
    },
    async getUser() {
        const { data: { user } } = await supabaseClient.auth.getUser();
        return user;
    },
    async getTournamentStats() {
        const { data, error } = await supabaseClient.from('tournament_stats').select('*').single();
        if (error) throw error;
        return data.data;
    },
    async getDraftedPlayers(leagueId) {
        let query = supabaseClient.from('drafted_players').select('*');
        if (leagueId) query = query.eq('league_id', leagueId);
        const { data, error } = await query;
        if (error) throw error;
        return data;
    },
    async isPlayerDrafted(playerId, leagueId) {
        let query = supabaseClient.from('drafted_players').select('player_id').eq('player_id', playerId);
        if (leagueId) query = query.eq('league_id', leagueId);
        const { data, error } = await query;
        if (error) throw error;
        return data && data.length > 0;
    },
    async draftPlayer(playerId, playerName, userId, leagueId) {
        const row = { player_id: playerId, player_name: playerName, user_id: userId };
        if (leagueId) row.league_id = leagueId;
        const { data, error } = await supabaseClient.from('drafted_players').insert([row]);
        if (error) throw error;
        return data;
    },
    async releasePlayer(playerId, userId, leagueId) {
        let query = supabaseClient.from('drafted_players').delete().match({ player_id: playerId, user_id: userId });
        if (leagueId) query = query.eq('league_id', leagueId);
        const { error } = await query;
        if (error) throw error;
    },
    async getUserTeam(userId) {
        const { data, error } = await supabaseClient.from('users_teams').select('*').match({ id: userId }).single();
        if (error && error.code !== 'PGRST116') throw error;
        return data;
    },
    async saveUserTeam(userId, squad, starting11) {
        const { data, error } = await supabaseClient.from('users_teams').upsert({
            id: userId, squad: squad, starting_11: starting11, updated_at: new Date()
        }, { onConflict: 'id' });
        if (error) throw error;
        return data;
    },
    async getAllUsers(leagueId) {
        if (leagueId) {
            const { data: userIds, error: leagueError } = await supabaseClient.from('users').select('id').eq('league_id', leagueId);
            if (leagueError) throw leagueError;
            if (!userIds || userIds.length === 0) return [];
            const ids = userIds.map(u => u.id);
            const { data, error } = await supabaseClient.from('user_profiles').select('*').in('id', ids);
            if (error) throw error;
            return data;
        } else {
            const { data, error } = await supabaseClient.from('user_profiles').select('*');
            if (error) throw error;
            return data;
        }
    },
    async getTrades(userId) {
        const { data, error } = await supabaseClient.from('trades').select('*').or(`sender_id.eq.${userId},receiver_id.eq.${userId}`).order('created_at', { ascending: false });
        if (error) throw error;
        return data;
    },
    async proposeTrade(senderId, receiverId, offeredArr, requestedArr) {
        const { data, error } = await supabaseClient.from('trades').insert([{
            sender_id: senderId, receiver_id: receiverId, players_offered: offeredArr, players_requested: requestedArr, status: 'pending'
        }]);
        if (error) throw error;
        return data;
    },
    async updateTradeStatus(tradeId, newStatus) {
        const { data, error } = await supabaseClient.from('trades').update({ status: newStatus, updated_at: new Date() }).match({ id: tradeId });
        if (error) throw error;
        return data;
    },
    async swapPlayers(tradeId) {
        const { error } = await supabaseClient.rpc('execute_trade', { trade_id: tradeId });
        if (error) throw error;
    },
    async getLeagues() {
        const { data, error } = await supabaseClient.from('leagues').select('*').order('created_at', { ascending: true });
        if (error) throw error;
        return data;
    },
    async createLeague(name, code) {
        const { data, error } = await supabaseClient.from('leagues').insert([{ name, code }]).select().single();
        if (error) throw error;
        return data;
    },
    async joinLeague(userId, leagueId) {
        const { data, error } = await supabaseClient.from('users').upsert({ id: userId, league_id: leagueId }, { onConflict: 'id' }).select().single();
        if (error) throw error;
        return data;
    },
    async getUserProfile(userId) {
        const profileReq = supabaseClient.from('user_profiles').select('*').eq('id', userId).single();
        const userReq = supabaseClient.from('users').select('league_id').eq('id', userId).single();
        const [profileRes, userRes] = await Promise.all([profileReq, userReq]);
        if (profileRes.error && profileRes.error.code !== 'PGRST116') throw profileRes.error;
        const profile = profileRes.data || {};
        if (userRes.data) profile.league_id = userRes.data.league_id;
        return profile;
    },
    async ensureUserProfile(userId, username, leagueId) {
        const { error: userError } = await supabaseClient.from('users').upsert({
            id: userId, league_id: leagueId, updated_at: new Date(), players: [], starting11: []
        }, { onConflict: 'id' });
        if (userError) throw userError;
        return { id: userId, username, league_id: leagueId };
    },
    async getDefaultLeague() {
        const { data, error } = await supabaseClient.from('leagues').select('*').eq('code', 'DEFAULT').single();
        if (error && error.code !== 'PGRST116') throw error;
        return data;
    },
    async createDefaultLeague() {
        const { data, error } = await supabaseClient.from('leagues').insert([{ name: 'Default League', code: 'DEFAULT' }]).select().single();
        if (error) {
            if (error.code === '23505') return await this.getDefaultLeague();
            throw error;
        }
        return data;
    },
    async getLeagueStandings(leagueId) {
        const { data, error } = await supabaseClient.from('league_standings').select('*').eq('league_id', leagueId).order('points', { ascending: false }).order('net_points', { ascending: false });
        if (error) throw error;
        return data;
    },
    async getFixtures(leagueId) {
        const { data, error } = await supabaseClient.from('league_matches').select('*').eq('league_id', leagueId).order('round_number', { ascending: true });
        if (error) throw error;
        return data;
    },
    async generateFixtures(leagueId, rounds = 1) {
        const { error } = await supabaseClient.rpc('generate_fixtures', { league_id: leagueId, num_rounds: rounds });
        if (error) throw error;
    },
    async updateRoundScores(leagueId) {
        const { data, error } = await supabaseClient.rpc('update_round_scores', { league_id: leagueId });
        if (error) throw error;
        return data;
    },
    async changePassword(newPassword) {
        const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
        if (error) throw error;
    },
    async deleteAccount(userId) {
        const { error } = await supabaseClient.rpc('delete_user_account', { user_id: userId });
        if (error) throw error;
        await this.signOut();
    }
};