async function call(op, params = {}, signal) {
    const res = await fetch('/api/rpc', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op, params }), signal });
    const data = await res.json();
    if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status });
    return data;
}
const api = {
    signUp: async (email, password) => ({ data: await call('signUp', { email, password }) }),
    signIn: async (email, password) => ({ data: await call('signIn', { email, password }) }),
    signOut: () => call('signOut'), getUser: () => call('getUser'),
    getDraftChat: leagueId => call('getDraftChat', { leagueId }),
    sendDraftChat: (leagueId, message) => call('sendDraftChat', { leagueId, message }),
    getTournamentStats: () => call('getTournamentStats'),
    getDraftedPlayers: leagueId => call('getDraftedPlayers', { leagueId }),
    isPlayerDrafted: (playerId, leagueId) => call('isPlayerDrafted', { playerId, leagueId }),
    releasePlayer: (playerId, userId, leagueId) => call('releasePlayer', { playerId, userId, leagueId }),
    getUserTeam: (userId, leagueId) => call('getUserTeam', { userId, leagueId }),
    saveUserTeam: (userId, leagueId, squad, starting11) => call('saveUserTeam', { userId, leagueId, starting11 }),
    getAllUsers: leagueId => call('getAllUsers', { leagueId }),
    getTrades: () => call('getTrades'),
    proposeTrade: (senderId, receiverId, offered, requested) => call('proposeTrade', { receiverId, offered, requested }),
    updateTradeStatus: (tradeId, newStatus) => call('updateTradeStatus', { tradeId, newStatus }),
    swapPlayers: tradeId => call('swapPlayers', { tradeId }),
    getLeagues: () => call('getLeagues'), createLeague: name => call('createLeague', { name }),
    kickMember: (userId, leagueId) => call('kickMember', { userId, leagueId }),
    transferCommissioner: (leagueId, userId) => call('transferCommissioner', { leagueId, userId }),
    joinLeague: (userId, leagueId) => call('joinLeague', { leagueId }),
    getUserProfile: () => call('getUserProfile'),
    ensureUserProfile: (userId, username, leagueId) => call('ensureUserProfile', { leagueId }),
    getDefaultLeague: () => call('getDefaultLeague'), createDefaultLeague: () => call('createDefaultLeague'),
    getLeagueStandings: leagueId => call('getLeagueStandings', { leagueId }),
    getFixtures: leagueId => call('getFixtures', { leagueId }),
    generateFixtures: (leagueId, rounds = 1) => call('generateFixtures', { leagueId, rounds }),
    updateRoundScores: (leagueId, ignoredRounds = 0) => call('updateRoundScores', { leagueId, ignoredRounds }),
    setRoundDueDate: (leagueId, round, dueAt) => call('setRoundDueDate', { leagueId, round, dueAt }),
    getMatchTeamBreakdown: (matchId, userId) => call('getMatchTeamBreakdown', { matchId, userId }),
    changePassword: newPassword => call('changePassword', { newPassword }),
    deleteAccount: () => call('deleteAccount'),
    getDraftState: leagueId => call('getDraftState', { leagueId }),
    startDraft: (leagueId, turnOrder) => call('startDraft', { leagueId, turnOrder }),
    makeDraftPick: (leagueId, userId, playerId, currentPick) => call('makeDraftPick', { leagueId, userId, playerId, currentPick }),
    setUserAutoDraftMode: (leagueId, userId, enabled) => call('setUserAutoDraftMode', { leagueId, userId, enabled }),
    subscribeToDraft(leagueId, callback) {
        const channel = { stopped: false, timer: null, controller: null };
        let previous = '';
        const poll = async () => {
            let delay = 15000;
            try {
                if (!document.hidden) {
                    channel.controller = new AbortController();
                    const state = await call('getDraftState', { leagueId }, channel.controller.signal);
                    const serialized = JSON.stringify(state);
                    if (!channel.stopped && serialized !== previous) { previous = serialized; callback(state); }
                    if (state?.is_active) delay = 3000;
                }
            } catch (error) {
                if (error.name !== 'AbortError') console.error('Draft refresh failed:', error.message);
            } finally {
                if (!channel.stopped) channel.timer = setTimeout(poll, delay);
            }
        };
        poll(); return channel;
    },
    unsubscribeFromDraft(channel) {
        if (!channel) return;
        channel.stopped = true; clearTimeout(channel.timer); channel.controller?.abort();
    },
};
export default api;
