document.addEventListener('DOMContentLoaded', () => {
    // State Management
    let currentUser = null;
    let allPlayersData = {};
    let draftedPlayers = [];
    let mySquad = [];
    let starting11 = [];
    let usersList = [];
    let isSignUp = false;

    // UI Elements
    const navTabs = document.getElementById('nav-tabs');
    const tabLinks = document.querySelectorAll('.tab-link');
    const tabContents = document.querySelectorAll('.tab-content');

    const authView = document.getElementById('auth-view');
    const dashboardView = document.getElementById('dashboard-view');
    const tradeView = document.getElementById('trade-view');
    const authForm = document.getElementById('auth-form');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirm-password');
    const confirmPasswordGroup = document.getElementById('confirm-password-group');
    const authSubmit = document.getElementById('auth-submit');
    const authTitle = document.getElementById('auth-title');
    const toggleAuth = document.getElementById('toggle-auth');
    const toggleText = document.getElementById('toggle-text');
    const logoutBtn = document.getElementById('logout-btn');
    const userEmailSpan = document.getElementById('user-email');

    const allPlayersList = document.getElementById('all-players-list');
    const playerSearch = document.getElementById('player-search');
    const squadList = document.getElementById('squad-list');
    const startingList = document.getElementById('starting-list');
    const squadCount = document.getElementById('squad-count');
    const saveTeamBtn = document.getElementById('save-team-btn');

    // Trade elements
    const tradeReceiverSelect = document.getElementById('trade-receiver-select');
    const tradeGiveSelect = document.getElementById('trade-give-select');
    const tradeRequestSelect = document.getElementById('trade-request-select');
    const proposeTradeBtn = document.getElementById('propose-trade-btn');
    const pendingTradesList = document.getElementById('pending-trades-list');

    // Initialization
    async function init() {
        checkSession();
        setupListeners();
    }

    async function checkSession() {
        currentUser = await API.getUser();
        if (currentUser) {
            showDashboard();
        } else {
            showAuth();
        }
    }

    function showAuth() {
        authView.classList.remove('hidden');
        dashboardView.classList.add('hidden');
        tradeView.classList.add('hidden');
        navTabs.classList.add('hidden');
        logoutBtn.classList.add('hidden');
        userEmailSpan.textContent = '';
    }

    async function showDashboard() {
        authView.classList.add('hidden');
        dashboardView.classList.remove('hidden');
        navTabs.classList.remove('hidden');
        logoutBtn.classList.remove('hidden');

        // Extract username from dummy email for display
        const displayUsername = currentUser.email.split('@')[0];
        userEmailSpan.textContent = displayUsername;

        loadData();
    }

    async function loadData() {
        try {
            // Load stats and drafted status in parallel
            [allPlayersData, draftedPlayers, usersList] = await Promise.all([
                API.getTournamentStats(),
                API.getDraftedPlayers(),
                API.getAllUsers()
            ]);

            mySquad = draftedPlayers
                .filter(dp => dp.user_id === currentUser.id)
                .map(dp => dp.player_id); // we store player name as player_id in schema_v2

            // Load user's starting 11 config
            const teamData = await API.getUserTeam(currentUser.id);
            if (teamData) {
                starting11 = teamData.starting_11 || [];
                // Clean up starting11 in case players were released
                starting11 = starting11.filter(name => mySquad.includes(name));
            }

            renderAllPlayers();
            renderMyTeam();
            renderTradeUI();
        } catch (error) {
            notify(`Error loading data: ${error.message}`, 'error');
        }
    }

    // Auth Logic helpers
    function getDummyEmail(username) {
        return `${username.toLowerCase().trim()}@fantasy-app.internal`;
    }

    // Auth Logic
    async function handleAuth(e) {
        e.preventDefault();
        const username = usernameInput.value;
        const password = passwordInput.value;
        const confirmPassword = confirmPasswordInput.value;
        const dummyEmail = getDummyEmail(username);

        try {
            let res;
            if (isSignUp) {
                if (password !== confirmPassword) {
                    throw new Error('Passwords do not match!');
                }
                res = await API.signUp(dummyEmail, password);
                if (res.error) throw res.error;
                notify('Account created! You can now Sign In.', 'success');
                // Switch back to sign in automatically
                toggleAuthState();
            } else {
                res = await API.signIn(dummyEmail, password);
                if (res.error) throw res.error;
                currentUser = res.data.user;
                showDashboard();
            }
        } catch (error) {
            notify(error.message, 'error');
        }
    }

    function toggleAuthState() {
        isSignUp = !isSignUp;
        authTitle.textContent = isSignUp ? 'Create Account' : 'Welcome Back';
        authSubmit.textContent = isSignUp ? 'Sign Up' : 'Sign In';
        toggleAuth.textContent = isSignUp ? 'Sign In' : 'Sign Up';
        toggleText.textContent = isSignUp ? 'Already have an account?' : "Don't have an account?";

        if (isSignUp) {
            confirmPasswordGroup.classList.remove('hidden');
            confirmPasswordInput.required = true;
        } else {
            confirmPasswordGroup.classList.add('hidden');
            confirmPasswordInput.required = false;
        }
    }

    // --- Points Engine ---
    function calculatePlayerPoints(playerName) {
        const player = allPlayersData.players[playerName];
        if (!player || player.matches.length === 0) return 0;

        // Get stats from the last match
        const lastMatchUrl = player.matches[player.matches.length - 1];

        const batting = player.batting.find(m => m.matchUrl === lastMatchUrl) || {};
        const bowling = player.bowling.find(m => m.matchUrl === lastMatchUrl) || {};
        const fielding = player.fielding.find(m => m.matchUrl === lastMatchUrl) || {};

        let points = 0;
        points += (parseInt(batting.runs) || 0) * 1;
        points += (parseInt(bowling.wickets) || 0) * 20;
        points += (parseInt(fielding.catches) || 0) * 8;
        points += (parseInt(fielding.stumpings) || 0) * 12;
        points += (parseInt(fielding.runouts) || 0) * 5;

        return points;
    }

    // UI Rendering
    function renderAllPlayers() {
        const searchTerm = playerSearch.value.toLowerCase();
        allPlayersList.innerHTML = '';

        const players = Object.values(allPlayersData.players);
        const filtered = players.filter(p => p.name.toLowerCase().includes(searchTerm));

        filtered.forEach(player => {
            const isTaken = draftedPlayers.some(dp => dp.player_id === player.name && dp.user_id !== currentUser.id);
            const isInMySquad = mySquad.includes(player.name);
            const lastPoints = calculatePlayerPoints(player.name);

            const div = document.createElement('div');
            div.className = `player-item ${isTaken ? 'taken' : ''}`;

            div.innerHTML = `
                <div class="player-info">
                    <h4>${player.name} <span class="points-badge">${lastPoints} pts</span></h4>
                    <p>${player.totalRuns} Runs | ${player.totalWickets} Wickets</p>
                </div>
                ${!isTaken && !isInMySquad ? `<button class="btn btn-outline btn-xs draft-btn" data-id="${player.name}">Draft</button>` : ''}
                ${isInMySquad ? `<span class="badge">In Squad</span>` : ''}
            `;
            allPlayersList.appendChild(div);
        });
    }

    function renderMyTeam() {
        squadList.innerHTML = '';
        startingList.innerHTML = '';
        squadCount.textContent = mySquad.length;

        // Render Squad
        mySquad.forEach(playerName => {
            const div = document.createElement('div');
            div.className = 'squad-player';
            div.innerHTML = `
                <span>${playerName}</span>
                <div class="actions">
                    <button class="btn btn-outline btn-xs start-btn" data-id="${playerName}">+ 11</button>
                    <button class="btn btn-outline btn-xs release-btn" data-id="${playerName}">×</button>
                </div>
            `;
            squadList.appendChild(div);
        });

        // Render Starting 11
        starting11.forEach((playerName, index) => {
            const div = document.createElement('div');
            div.className = 'squad-player';
            div.innerHTML = `
                <div class="reorder-actions">
                    <button class="btn-arrow move-up" data-index="${index}">▲</button>
                    <button class="btn-arrow move-down" data-index="${index}">▼</button>
                </div>
                <span>${index + 1}. ${playerName}</span>
                <button class="btn btn-outline btn-xs remove-11-btn" data-id="${playerName}">Remove</button>
            `;
            startingList.appendChild(div);
        });

        // Toggle Save Button
        saveTeamBtn.disabled = starting11.length !== 11;
        saveTeamBtn.textContent = starting11.length === 11 ? 'Save Lineup' : `Need ${11 - starting11.length} more`;
    }

    async function renderTradeUI() {
        // Populate Receiver Select
        tradeReceiverSelect.innerHTML = '<option value="">Select User</option>';
        usersList.filter(u => u.id !== currentUser.id).forEach(user => {
            const opt = document.createElement('option');
            opt.value = user.id;
            opt.textContent = user.username;
            tradeReceiverSelect.appendChild(opt);
        });

        // Populate "Give" Select
        tradeGiveSelect.innerHTML = '<option value="">Select Player</option>';
        mySquad.forEach(playerName => {
            const opt = document.createElement('option');
            opt.value = playerName;
            opt.textContent = playerName;
            tradeGiveSelect.appendChild(opt);
        });

        // Load Pending Trades
        const trades = await API.getTrades(currentUser.id);
        pendingTradesList.innerHTML = '';

        if (trades.length === 0) {
            pendingTradesList.innerHTML = '<p class="dim">No active proposals</p>';
        }

        trades.forEach(trade => {
            const isSender = trade.sender_id === currentUser.id;
            const otherUser = usersList.find(u => u.id === (isSender ? trade.receiver_id : trade.sender_id));

            const div = document.createElement('div');
            div.className = `trade-item card ${trade.status}`;
            div.innerHTML = `
                <div class="trade-info">
                    <p><b>${isSender ? 'You' : otherUser.username}</b> offered <b>${trade.player_offered}</b></p>
                    <p>For <b>${trade.player_requested}</b></p>
                    <p class="status-tag ${trade.status}">${trade.status.toUpperCase()}</p>
                </div>
                ${!isSender && trade.status === 'pending' ? `
                    <div class="trade-actions">
                        <button class="btn btn-primary btn-xs accept-trade" data-id="${trade.id}">Accept</button>
                        <button class="btn btn-outline btn-xs decline-trade" data-id="${trade.id}">Decline</button>
                    </div>
                ` : ''}
                ${isSender && trade.status === 'pending' ? `
                    <button class="btn btn-outline btn-xs cancel-trade" data-id="${trade.id}">Cancel</button>
                ` : ''}
            `;
            pendingTradesList.appendChild(div);
        });
    }

    // Interaction Logic
    async function setupListeners() {
        authForm.addEventListener('submit', handleAuth);

        toggleAuth.addEventListener('click', (e) => {
            e.preventDefault();
            toggleAuthState();
        });

        logoutBtn.addEventListener('click', async () => {
            await API.signOut();
            currentUser = null;
            showAuth();
        });

        // Tab switching
        tabLinks.forEach(link => {
            link.addEventListener('click', () => {
                tabLinks.forEach(l => l.classList.remove('active'));
                tabContents.forEach(c => c.classList.add('hidden'));
                link.classList.add('active');
                document.getElementById(link.dataset.tab).classList.remove('hidden');
                if (link.dataset.tab === 'trade-view') renderTradeUI();
            });
        });

        playerSearch.addEventListener('input', renderAllPlayers);

        allPlayersList.addEventListener('click', async (e) => {
            if (e.target.classList.contains('draft-btn')) {
                const playerName = e.target.dataset.id;
                try {
                    await API.draftPlayer(playerName, playerName, currentUser.id);
                    notify(`Drafted ${playerName}!`, 'success');
                    loadData(); // Reload to update "taken" status for others
                } catch (error) {
                    notify('Player already taken!', 'error');
                }
            }
        });

        squadList.addEventListener('click', async (e) => {
            const playerName = e.target.dataset.id;
            if (e.target.classList.contains('release-btn')) {
                await API.releasePlayer(playerName, currentUser.id);
                mySquad = mySquad.filter(p => p !== playerName);
                starting11 = starting11.filter(p => p !== playerName);
                loadData();
            } else if (e.target.classList.contains('start-btn')) {
                if (starting11.length < 11 && !starting11.includes(playerName)) {
                    starting11.push(playerName);
                    renderMyTeam();
                } else if (starting11.includes(playerName)) {
                    notify('Already in Lineup', 'info');
                } else {
                    notify('Lineup full!', 'error');
                }
            }
        });

        startingList.addEventListener('click', (e) => {
            if (e.target.classList.contains('remove-11-btn')) {
                const playerName = e.target.dataset.id;
                starting11 = starting11.filter(p => p !== playerName);
                renderMyTeam();
            } else if (e.target.classList.contains('move-up')) {
                const idx = parseInt(e.target.dataset.index);
                if (idx > 0) {
                    [starting11[idx], starting11[idx - 1]] = [starting11[idx - 1], starting11[idx]];
                    renderMyTeam();
                }
            } else if (e.target.classList.contains('move-down')) {
                const idx = parseInt(e.target.dataset.index);
                if (idx < starting11.length - 1) {
                    [starting11[idx], starting11[idx + 1]] = [starting11[idx + 1], starting11[idx]];
                    renderMyTeam();
                }
            }
        });

        saveTeamBtn.addEventListener('click', async () => {
            try {
                await API.saveUserTeam(currentUser.id, mySquad, starting11);
                notify('Lineup saved successfully!', 'success');
            } catch (error) {
                notify(error.message, 'error');
            }
        });

        // Trade Listeners
        tradeReceiverSelect.addEventListener('change', async () => {
            const receiverId = tradeReceiverSelect.value;
            if (!receiverId) return;

            // Show their squad in the request select
            const receiverDrafted = draftedPlayers.filter(dp => dp.user_id === receiverId);
            tradeRequestSelect.innerHTML = '<option value="">Select Player</option>';
            receiverDrafted.forEach(dp => {
                const opt = document.createElement('option');
                opt.value = dp.player_id;
                opt.textContent = dp.player_name;
                tradeRequestSelect.appendChild(opt);
            });
        });

        proposeTradeBtn.addEventListener('click', async () => {
            const receiverId = tradeReceiverSelect.value;
            const offered = tradeGiveSelect.value;
            const requested = tradeRequestSelect.value;

            if (!receiverId || !offered || !requested) {
                return notify('Please fill all trade fields', 'error');
            }

            try {
                await API.proposeTrade(currentUser.id, receiverId, offered, requested);
                notify('Trade proposed!', 'success');
                renderTradeUI();
            } catch (error) { notify(error.message, 'error'); }
        });

        pendingTradesList.addEventListener('click', async (e) => {
            const tradeId = e.target.dataset.id;
            if (e.target.classList.contains('accept-trade')) {
                const trade = (await API.getTrades(currentUser.id)).find(t => t.id === tradeId);
                try {
                    await API.swapPlayers(trade.sender_id, trade.receiver_id, trade.player_offered, trade.player_requested);
                    await API.updateTradeStatus(tradeId, 'accepted');
                    notify('Trade accepted! Players swapped.', 'success');
                    loadData();
                } catch (error) { notify('Swap failed: ' + error.message, 'error'); }
            } else if (e.target.classList.contains('decline-trade')) {
                await API.updateTradeStatus(tradeId, 'declined');
                renderTradeUI();
            } else if (e.target.classList.contains('cancel-trade')) {
                await API.updateTradeStatus(tradeId, 'cancelled');
                renderTradeUI();
            }
        });
    }

    function notify(message, type = 'info') {
        const area = document.getElementById('notification-area');
        const div = document.createElement('div');
        div.className = `notification ${type}`;
        div.textContent = message;
        area.appendChild(div);
        setTimeout(() => div.remove(), 4000);
    }

    init();
});
