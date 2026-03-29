import { supabase } from '../lib/supabase';

const api = {
    // ======== Auth ========
    async signUp(email, password) {
        return await supabase.auth.signUp({ email, password });
    },
    async signIn(email, password) {
        return await supabase.auth.signInWithPassword({ email, password });
    },
    async signOut() {
        return await supabase.auth.signOut();
    },
    async getUser() {
        const { data: { user } } = await supabase.auth.getUser();
        return user;
    },

    // ======== Tournament ========
    async getTournamentStats() {
        const { data, error } = await supabase.from('tournament_stats').select('*').single();
        if (error) throw error;
        return data.data;
    },

    // ======== Drafting ========
    async getDraftedPlayers(leagueId) {
        let query = supabase.from('drafted_players').select('*');
        if (leagueId) query = query.eq('league_id', leagueId);
        const { data, error } = await query;
        if (error) throw error;
        return data;
    },
    async isPlayerDrafted(playerId, leagueId) {
        let query = supabase.from('drafted_players').select('player_id').eq('player_id', playerId);
        if (leagueId) query = query.eq('league_id', leagueId);
        const { data, error } = await query;
        if (error) throw error;
        return data && data.length > 0;
    },
    async draftPlayer(playerId, playerName, userId, leagueId) {
        const row = { player_id: playerId, player_name: playerName, user_id: userId };
        if (leagueId) row.league_id = leagueId;
        const { data, error } = await supabase.from('drafted_players').insert([row]);
        if (error) throw error;
        return data;
    },
    async releasePlayer(playerId, userId, leagueId) {
        let query = supabase.from('drafted_players').delete().match({ player_id: playerId, user_id: userId });
        if (leagueId) query = query.eq('league_id', leagueId);
        const { error } = await query;
        if (error) throw error;
    },

    // ======== Teams ========
    async getUserTeam(userId) {
        const { data, error } = await supabase.from('users_teams').select('*').match({ id: userId }).single();
        if (error && error.code !== 'PGRST116') throw error;
        return data;
    },
    async saveUserTeam(userId, leagueId, squad, starting11) {
        const { data, error } = await supabase.from('users_teams').upsert({
            id: userId, league_id: leagueId, squad, starting_11: starting11, updated_at: new Date()
        }, { onConflict: 'id' });
        if (error) throw error;
        return data;
    },

    // ======== Users ========
    async getAllUsers(leagueId) {
        if (leagueId) {
            const { data: userIds, error: leagueError } = await supabase.from('users').select('id').eq('league_id', leagueId);
            if (leagueError) throw leagueError;
            if (!userIds || userIds.length === 0) return [];
            const ids = userIds.map(u => u.id);
            const { data, error } = await supabase.from('user_profiles').select('*').in('id', ids);
            if (error) throw error;
            return data;
        } else {
            const { data, error } = await supabase.from('user_profiles').select('*');
            if (error) throw error;
            return data;
        }
    },

    // ======== Trades ========
    async getTrades(userId) {
        const { data, error } = await supabase.from('trades').select('*').or(`sender_id.eq.${userId},receiver_id.eq.${userId}`).order('created_at', { ascending: false });
        if (error) throw error;
        return data;
    },
    async proposeTrade(senderId, receiverId, offeredArr, requestedArr) {
        const { data, error } = await supabase.from('trades').insert([{
            sender_id: senderId, receiver_id: receiverId, players_offered: offeredArr, players_requested: requestedArr, status: 'pending'
        }]);
        if (error) throw error;
        return data;
    },
    async updateTradeStatus(tradeId, newStatus) {
        const { data, error } = await supabase.from('trades').update({ status: newStatus, updated_at: new Date() }).match({ id: tradeId });
        if (error) throw error;
        return data;
    },
    async swapPlayers(tradeId) {
        const { error } = await supabase.rpc('execute_trade', { trade_id: tradeId });
        if (error) throw error;
    },

    // ======== Leagues ========
    async getLeagues() {
        const { data, error } = await supabase.from('leagues').select('*').order('created_at', { ascending: true });
        if (error) throw error;
        return data;
    },
    async createLeague(name, code, creatorId) {
        const { data, error } = await supabase.from('leagues').insert([{ name, code, commissioner_id: creatorId }]).select().single();
        if (error) throw error;
        return data;
    },
    async kickMember(userId, leagueId) {
        const { error } = await supabase.from('users').update({ league_id: null }).match({ id: userId, league_id: leagueId });
        if (error) throw error;
    },
    async transferCommissioner(leagueId, newCommissionerId) {
        const { error } = await supabase.from('leagues').update({ commissioner_id: newCommissionerId }).eq('id', leagueId);
        if (error) throw error;
    },
    async joinLeague(userId, leagueId) {
        const { data, error } = await supabase.from('users').upsert({ id: userId, league_id: leagueId }, { onConflict: 'id' }).select().single();
        if (error) throw error;
        return data;
    },
    async getUserProfile(userId) {
        const profileReq = supabase.from('user_profiles').select('*').eq('id', userId).single();
        const userReq = supabase.from('users').select('league_id').eq('id', userId).single();
        const [profileRes, userRes] = await Promise.all([profileReq, userReq]);
        if (profileRes.error && profileRes.error.code !== 'PGRST116') throw profileRes.error;
        const profile = profileRes.data || {};
        if (userRes.data) profile.league_id = userRes.data.league_id;
        return profile;
    },
    async ensureUserProfile(userId, username, leagueId) {
        const { error: userError } = await supabase.from('users').upsert({
            id: userId, league_id: leagueId, updated_at: new Date(), players: [], starting11: []
        }, { onConflict: 'id' });
        if (userError) throw userError;
        return { id: userId, username, league_id: leagueId };
    },
    async getDefaultLeague() {
        const { data, error } = await supabase.from('leagues').select('*').eq('code', 'DEFAULT').single();
        if (error && error.code !== 'PGRST116') throw error;
        return data;
    },
    async createDefaultLeague() {
        const { data, error } = await supabase.from('leagues').insert([{ name: 'Default League', code: 'DEFAULT' }]).select().single();
        if (error) {
            if (error.code === '23505') return await this.getDefaultLeague();
            throw error;
        }
        return data;
    },

    // ======== Fixtures & Scoreboard ========
    async getLeagueStandings(leagueId) {
        const { data, error } = await supabase.from('league_standings').select('*').eq('league_id', leagueId).order('points', { ascending: false }).order('net_points', { ascending: false });
        if (error) throw error;
        return data;
    },
    async getFixtures(leagueId) {
        const { data, error } = await supabase.from('league_matches').select('*').eq('league_id', leagueId).order('round_number', { ascending: true });
        if (error) throw error;
        return data;
    },
    async generateFixtures(leagueId, rounds = 1) {
        const { error } = await supabase.rpc('generate_fixtures', { league_id: leagueId, num_rounds: rounds });
        if (error) throw error;
    },
    async updateRoundScores(leagueId) {
        const { data, error } = await supabase.rpc('update_round_scores', { league_id: leagueId });
        if (error) throw error;
        return data;
    },

    // ======== Account ========
    async changePassword(newPassword) {
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) throw error;
    },
    async deleteAccount(userId) {
        const { error } = await supabase.rpc('delete_user_account', { user_id: userId });
        if (error) throw error;
        await this.signOut();
    },

    // ======== Draft System ========
    async getDraftState(leagueId) {
        const { data, error } = await supabase.from('draft_state').select('*').eq('league_id', leagueId).single();
        if (error && error.code !== 'PGRST116') throw error;
        return data;
    },
    async startDraft(leagueId, turnOrder) {
        const { data, error } = await supabase.from('draft_state').upsert({
            league_id: leagueId,
            is_active: true,
            current_pick: 0,
            turn_order: turnOrder,
            picks: [],
            turn_start_time: new Date().toISOString(),
            updated_at: new Date().toISOString()
        }, { onConflict: 'league_id' }).select().single();
        if (error) throw error;
        return data;
    },
    async clearLeagueSquads(leagueId) {
        if (!leagueId) throw new Error('League id is required to clear squads');

        const draftedDelete = supabase
            .from('drafted_players')
            .delete()
            .eq('league_id', leagueId);

        const teamsDelete = supabase
            .from('users_teams')
            .delete()
            .eq('league_id', leagueId);

        const [draftedResult, teamsResult] = await Promise.all([draftedDelete, teamsDelete]);

        if (draftedResult.error) throw draftedResult.error;
        if (teamsResult.error) throw teamsResult.error;
    },
    async makeDraftPick(leagueId, userId, playerId, currentPick) {
        const state = await this.getDraftState(leagueId);
        if (!state || !state.is_active) throw new Error('Draft is not active');
        if (state.current_pick !== currentPick) throw new Error('Not your turn (pick mismatch)');
        const newPicks = [...(state.picks || []), { user_id: userId, player_id: playerId, pick_number: currentPick }];
        const nextPick = currentPick + 1;
        const totalPicksNeeded = (state.turn_order || []).length * 18;
        const isComplete = nextPick >= totalPicksNeeded;
        const { data, error } = await supabase.from('draft_state').update({
            picks: newPicks,
            current_pick: nextPick,
            is_active: !isComplete,
            turn_start_time: isComplete ? state.turn_start_time : new Date().toISOString(),
            updated_at: new Date().toISOString()
        }).eq('league_id', leagueId).select().single();
        if (error) throw error;
        return data;
    },
    async skipDraftTurn(leagueId, currentPick) {
        const state = await this.getDraftState(leagueId);
        if (!state || !state.is_active) throw new Error('Draft is not active');
        if (state.current_pick !== currentPick) return state;
        const nextPick = currentPick + 1;
        const isComplete = nextPick >= 20;
        const { data, error } = await supabase.from('draft_state').update({
            current_pick: nextPick,
            is_active: !isComplete,
            turn_start_time: isComplete ? state.turn_start_time : new Date().toISOString(),
            updated_at: new Date().toISOString()
        }).eq('league_id', leagueId).select().single();
        if (error) throw error;
        return data;
    },

    // ======== Realtime ========
    subscribeToDraft(leagueId, callback) {
        const channel = supabase
            .channel(`draft_${leagueId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'draft_state',
                filter: `league_id=eq.${leagueId}`
            }, (payload) => {
                callback(payload.new);
            })
            .subscribe();
        return channel;
    },
    unsubscribeFromDraft(channel) {
        if (channel) {
            supabase.removeChannel(channel);
        }
    },
};

export default api;
