const SUPABASE_URL = 'https://uxypkwbxduahafcarhos.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_vpoPggq4eCO208jUNxsmNA_xd7IcTmF';

const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Use supabaseClient instead of supabase in the rest of the file

const API = {
    // Auth
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

    // Tournament Stats
    async getTournamentStats() {
        const { data, error } = await supabaseClient
            .from('tournament_stats')
            .select('*')
            .single();

        if (error) throw error;
        return data.data; // The JSON stats
    },

    // Drafting
    async getDraftedPlayers() {
        const { data, error } = await supabaseClient
            .from('drafted_players')
            .select('*');

        if (error) throw error;
        return data;
    },

    async draftPlayer(playerId, playerName, userId) {
        const { data, error } = await supabaseClient
            .from('drafted_players')
            .insert([{ player_id: playerId, player_name: playerName, user_id: userId }]);

        if (error) throw error;
        return data;
    },

    async releasePlayer(playerId, userId) {
        const { error } = await supabaseClient
            .from('drafted_players')
            .delete()
            .match({ player_id: playerId, user_id: userId });

        if (error) throw error;
    },

    // User Team
    async getUserTeam(userId) {
        const { data, error } = await supabaseClient
            .from('users_teams')
            .select('*')
            .match({ id: userId })
            .single();

        if (error && error.code !== 'PGRST116') throw error;
        return data;
    },

    async saveUserTeam(userId, squad, starting11) {
        // We use upsert to create or update the team entry
        const { data, error } = await supabaseClient
            .from('users_teams')
            .upsert({
                id: userId,
                squad: squad,
                starting_11: starting11,
                updated_at: new Date()
            }, { onConflict: 'id' });

        if (error) throw error;
        return data;
    },

    // Trading API
    async getAllUsers() {
        const { data, error } = await supabaseClient
            .from('user_profiles')
            .select('*');
        if (error) throw error;
        return data;
    },

    async getTrades(userId) {
        const { data, error } = await supabaseClient
            .from('trades')
            .select('*')
            .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data;
    },

    async proposeTrade(senderId, receiverId, offeredId, requestedId) {
        const { data, error } = await supabaseClient
            .from('trades')
            .insert([{
                sender_id: senderId,
                receiver_id: receiverId,
                player_offered: offeredId,
                player_requested: requestedId,
                status: 'pending'
            }]);
        if (error) throw error;
        return data;
    },

    async updateTradeStatus(tradeId, newStatus) {
        const { data, error } = await supabaseClient
            .from('trades')
            .update({ status: newStatus, updated_at: new Date() })
            .match({ id: tradeId });
        if (error) throw error;
        return data;
    },

    // Transactional Swap (Helper for accepted trades)
    async swapPlayers(senderId, receiverId, playerA, playerB) {
        // 1. Release Player A from Sender, Player B from Receiver
        // 2. Draft Player B for Sender, Player A for Receiver
        // In a real app we'd use a postgres function for atomicity
        // For now we'll do sequential calls
        await Promise.all([
            this.releasePlayer(playerA, senderId),
            this.releasePlayer(playerB, receiverId)
        ]);
        await Promise.all([
            this.draftPlayer(playerB, playerB, senderId),
            this.draftPlayer(playerA, playerA, receiverId)
        ]);
    }
};
