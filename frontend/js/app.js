document.addEventListener('DOMContentLoaded', () => {
    let currentUser = null, currentLeague = null, allPlayersData = {}, draftedPlayers = [], mySquad = [], starting11 = [], usersList = [], isSignUp = false;
    let tradeGiveSelected = [], tradeRequestSelected = [];

    const navTabs = document.getElementById('nav-tabs');
    const tabLinks = document.querySelectorAll('.tab-link');
    const tabContents = document.querySelectorAll('.tab-content');
    const authView = document.getElementById('auth-view');
    const dashboardView = document.getElementById('dashboard-view');
    const tradeView = document.getElementById('trade-view');
    const leagueView = document.getElementById('league-view');
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
    const leagueBadge = document.getElementById('league-badge');
    const allPlayersList = document.getElementById('all-players-list');
    const playerSearch = document.getElementById('player-search');
    const squadList = document.getElementById('squad-list');
    const startingList = document.getElementById('starting-list');
    const squadCount = document.getElementById('squad-count');
    const saveTeamBtn = document.getElementById('save-team-btn');
    const tradeReceiverSelect = document.getElementById('trade-receiver-select');
    const tradeGiveChips = document.getElementById('trade-give-chips');
    const tradeGiveList = document.getElementById('trade-give-list');
    const tradeRequestChips = document.getElementById('trade-request-chips');
    const tradeRequestList = document.getElementById('trade-request-list');
    const proposeTradeBtn = document.getElementById('propose-trade-btn');
    const pendingTradesList = document.getElementById('pending-trades-list');
    const currentLeagueName = document.getElementById('current-league-name');
    const leaguesList = document.getElementById('leagues-list');
    const createLeagueBtn = document.getElementById('create-league-btn');
    const createLeagueNameInput = document.getElementById('create-league-name');
    const joinLeagueCodeInput = document.getElementById('join-league-code');
    const joinLeagueBtn = document.getElementById('join-league-btn');

    async function init() {
        checkSession();
        setupListeners();
    }

    async function checkSession() {
        currentUser = await API.getUser();
        if (currentUser) {
            await loadUserLeague();
            showDashboard();
        } else {
            showAuth();
        }
    }

    async function loadUserLeague() {
        try {
            const profile = await API.getUserProfile(currentUser.id);
            if (profile && profile.league_id) {
                const leagues = await API.getLeagues();
                currentLeague = leagues.find(l => l.id === profile.league_id) || null;
            }
            if (!currentLeague) {
                let defaultLeague = await API.getDefaultLeague();
                if (!defaultLeague) defaultLeague = await API.createDefaultLeague();
                currentLeague = defaultLeague;
                const displayUsername = currentUser.email.split('@')[0];
                await API.ensureUserProfile(currentUser.id, displayUsername, defaultLeague.id);
            }
        } catch (error) { }
    }

    function showAuth() {
        authView.classList.remove('hidden');
        tabContents.forEach(c => c.classList.add('hidden'));
        navTabs.classList.add('hidden');
        logoutBtn.classList.add('hidden');
        userEmailSpan.textContent = '';
        leagueBadge.textContent = '';
    }

    async function showDashboard() {
        authView.classList.add('hidden');
        dashboardView.classList.remove('hidden');
        navTabs.classList.remove('hidden');
        logoutBtn.classList.remove('hidden');
        const displayUsername = currentUser.email.split('@')[0];
        userEmailSpan.textContent = displayUsername;
        leagueBadge.textContent = currentLeague ? currentLeague.name : 'No League';
        loadData();
    }

    async function loadData() {
        try {
            const leagueId = currentLeague ? currentLeague.id : null;
            [allPlayersData, draftedPlayers, usersList] = await Promise.all([
                API.getTournamentStats(),
                API.getDraftedPlayers(leagueId),
                API.getAllUsers(leagueId)
            ]);
            mySquad = draftedPlayers.filter(dp => dp.user_id === currentUser.id).map(dp => dp.player_id);
            const teamData = await API.getUserTeam(currentUser.id);
            if (teamData) {
                starting11 = teamData.starting_11 || [];
                starting11 = starting11.filter(name => mySquad.includes(name));
            }
            renderAllPlayers();
            renderMyTeam();
            renderTradeUI();
        } catch (error) {
            notify(`Error loading data: ${error.message}`, 'error');
        }
    }

    function getDummyEmail(username) {
        return `${username.toLowerCase().trim()}@fantasy-app.internal`;
    }

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

                // Auto-assign to default league on sign up
                try {
                    const newUser = res.data.user;
                    if (newUser) {
                        let defaultLeague = await API.getDefaultLeague();
                        if (!defaultLeague) {
                            defaultLeague = await API.createDefaultLeague();
                        }
                        await API.ensureUserProfile(newUser.id, username, defaultLeague.id);
                    }
                } catch (_) {
                    notify('Account created! You can now Sign In.', 'success');
                    toggleAuthState();
                }
            } else {
                res = await API.signIn(dummyEmail, password);
                if (res.error) throw res.error;
                currentUser = res.data.user;
                await loadUserLeague();
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

    function calculatePlayerPoints(playerName) {
        const player = allPlayersData.players[playerName];
        if (!player || player.matches.length === 0) return 0;
        const lastMatchUrl = player.matches[player.matches.length - 1];
        const batting = player.batting.find(m => m.matchUrl === lastMatchUrl) || {};
        const bowling = player.bowling.find(m => m.matchUrl === lastMatchUrl) || {};
        const fielding = player.fielding.find(m => m.matchUrl === lastMatchUrl) || {};
        let points = 0;
        points += (parseInt(batting.runs) || 0) * 1;
        points += (parseInt(batting.fours) || 0) * 2;
        points += (parseInt(batting.sixes) || 0) * 3;
        const overs = parseFloat(bowling.overs) || 0;
        if (overs > 0) {
            const eco = parseFloat(bowling.economy) || 0;
            points += 10 - eco;
        }
        points += (parseInt(bowling.wickets) || 0) * 20;
        points += (parseInt(fielding.catches) || 0) * 8;
        points += (parseInt(fielding.stumpings) || 0) * 5;
        points += (parseInt(fielding.runouts) || 0) * 4;
        return Math.round(points * 10) / 10;
    }

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
        saveTeamBtn.disabled = starting11.length === 0 || starting11.length > 11;
        saveTeamBtn.textContent = 'Save Lineup';
    }

    function renderPlayerList(container, players, selectedArr, onToggle) {
        container.innerHTML = '';
        players.forEach(name => {
            const isSelected = selectedArr.includes(name);
            const row = document.createElement('div');
            row.className = `trade-player-row ${isSelected ? 'selected' : ''}`;
            row.innerHTML = `<span>${name}</span>`;
            row.addEventListener('click', () => onToggle(name));
            container.appendChild(row);
        });
        if (players.length === 0) container.innerHTML = '<p class="dim">No players available</p>';
    }

    function refreshGiveUI() {
        renderChips(tradeGiveChips, tradeGiveSelected, (name) => {
            tradeGiveSelected = tradeGiveSelected.filter(n => n !== name);
            refreshGiveUI();
        });
        renderPlayerList(tradeGiveList, mySquad, tradeGiveSelected, (name) => {
            if (tradeGiveSelected.includes(name)) {
                tradeGiveSelected = tradeGiveSelected.filter(n => n !== name);
            } else {
                tradeGiveSelected.push(name);
            }
            refreshGiveUI();
        });
    }

    function refreshRequestUI() {
        const receiverId = tradeReceiverSelect.value;
        const receiverPlayers = receiverId ? draftedPlayers.filter(dp => dp.user_id === receiverId).map(dp => dp.player_name) : [];
        renderChips(tradeRequestChips, tradeRequestSelected, (name) => {
            tradeRequestSelected = tradeRequestSelected.filter(n => n !== name);
            refreshRequestUI();
        });
        renderPlayerList(tradeRequestList, receiverPlayers, tradeRequestSelected, (name) => {
            if (tradeRequestSelected.includes(name)) {
                tradeRequestSelected = tradeRequestSelected.filter(n => n !== name);
            } else {
                tradeRequestSelected.push(name);
            }
            refreshRequestUI();
        });
    }

    async function renderTradeUI() {
        tradeGiveSelected = [];
        tradeRequestSelected = [];
        tradeReceiverSelect.innerHTML = '<option value="">Select User</option>';
        usersList.filter(u => u.id !== currentUser.id).forEach(user => {
            const opt = document.createElement('option');
            opt.value = user.id;
            opt.textContent = user.username;
            tradeReceiverSelect.appendChild(opt);
        });
        refreshGiveUI();
        refreshRequestUI();
        const trades = await API.getTrades(currentUser.id);
        pendingTradesList.innerHTML = '';
        if (trades.length === 0) pendingTradesList.innerHTML = '<p class="dim">No active proposals</p>';
        trades.forEach(trade => {
            const isSender = trade.sender_id === currentUser.id;
            const otherUser = usersList.find(u => u.id === (isSender ? trade.receiver_id : trade.sender_id));
            const offered = trade.players_offered || [trade.player_offered];
            const requested = trade.players_requested || [trade.player_requested];
            const div = document.createElement('div');
            div.className = `trade-item card ${trade.status}`;
            div.innerHTML = `
                <div class="trade-info">
                    <p><b>${isSender ? 'You' : (otherUser ? otherUser.username : 'Unknown')}</b> offered:</p>
                    <p class="trade-players-list">${offered.join(', ')}</p>
                    <p>For:</p>
                    <p class="trade-players-list">${requested.join(', ')}</p>
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

    async function renderLeagueUI() {
        if (!currentLeague) return;
        currentLeagueName.textContent = currentLeague.name;
        try {
            const leagues = await API.getLeagues();
            leaguesList.innerHTML = '';
            leagues.forEach(league => {
                const isCurrent = currentLeague && currentLeague.id === league.id;
                const div = document.createElement('div');
                div.className = `league-item ${isCurrent ? 'current' : ''}`;
                div.innerHTML = `
                    <div class="league-info">
                        <h4>${league.name}</h4>
                        <p class="dim">Code: <span class="league-code">${league.code}</span></p>
                    </div>
                    ${isCurrent ? '<span class="badge">Current</span>' : `<button class="btn btn-outline btn-xs switch-league-btn" data-id="${league.id}">Join</button>`}
                `;
                leaguesList.appendChild(div);
            });
        } catch (error) {
            notify('Could not load leagues: ' + error.message, 'error');
        }
    }

    async function setupListeners() {
        authForm.addEventListener('submit', handleAuth);
        toggleAuth.addEventListener('click', (e) => {
            e.preventDefault();
            toggleAuthState();
        });
        logoutBtn.addEventListener('click', async () => {
            await API.signOut();
            currentUser = null;
            currentLeague = null;
            showAuth();
        });
        tabLinks.forEach(link => {
            link.addEventListener('click', () => {
                tabLinks.forEach(l => l.classList.remove('active'));
                tabContents.forEach(c => c.classList.add('hidden'));
                link.classList.add('active');
                document.getElementById(link.dataset.tab).classList.remove('hidden');
                if (link.dataset.tab === 'trade-view') renderTradeUI();
                if (link.dataset.tab === 'league-view') renderLeagueUI();
                if (link.dataset.tab === 'fixtures-view') renderFixtures();
                if (link.dataset.tab === 'scoreboard-view') renderScoreboard();
            });
        });
        playerSearch.addEventListener('input', renderAllPlayers);
        allPlayersList.addEventListener('click', async (e) => {
            if (e.target.classList.contains('draft-btn')) {
                const playerName = e.target.dataset.id;
                if (!currentLeague) {
                    notify('You must join a league before drafting!', 'error');
                    await loadUserLeague();
                    if (currentLeague) {
                        notify('League loaded. Try again.', 'success');
                        renderLeagueUI();
                    }
                    return;
                }
                const leagueId = currentLeague.id;
                try {
                    const alreadyTaken = await API.isPlayerDrafted(playerName, leagueId);
                    if (alreadyTaken) {
                        notify('Player already taken in your league!', 'error');
                        return;
                    }
                    await API.draftPlayer(playerName, playerName, currentUser.id, leagueId);
                    notify(`Drafted ${playerName}!`, 'success');
                    loadData();
                } catch (error) {
                    notify('Draft failed: ' + error.message, 'error');
                }
            }
        });
        squadList.addEventListener('click', async (e) => {
            const playerName = e.target.dataset.id;
            const leagueId = currentLeague ? currentLeague.id : null;
            if (e.target.classList.contains('release-btn')) {
                await API.releasePlayer(playerName, currentUser.id, leagueId);
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
            if (!currentLeague) return notify('You must join a league first!', 'error');
            try {
                await API.saveUserTeam(currentUser.id, currentLeague.id, mySquad, starting11);
                notify('Lineup saved successfully!', 'success');
            } catch (error) {
                notify(error.message, 'error');
            }
        });
        tradeReceiverSelect.addEventListener('change', () => {
            tradeRequestSelected = [];
            refreshRequestUI();
        });
        proposeTradeBtn.addEventListener('click', async () => {
            const receiverId = tradeReceiverSelect.value;
            if (!receiverId || tradeGiveSelected.length === 0 || tradeRequestSelected.length === 0) {
                return notify('Select a user and at least one player on each side', 'error');
            }
            try {
                await API.proposeTrade(currentUser.id, receiverId, tradeGiveSelected, tradeRequestSelected);
                notify('Trade proposed!', 'success');
                renderTradeUI();
            } catch (error) {
                notify(error.message, 'error');
            }
        });
        const genBtn = document.getElementById('generate-fixtures-btn');
        const roundsInput = document.getElementById('rounds-input');
        if (genBtn) {
            genBtn.addEventListener('click', async () => {
                const rounds = parseInt(roundsInput.value) || 1;
                if (rounds < 1 || rounds > 10) {
                    return notify('Please enter rounds between 1-10', 'error');
                }
                if (confirm(`Generate ${rounds} round(s) of fixtures? This will clear any existing matches for this league.`)) {
                    try {
                        await API.generateFixtures(currentLeague.id, rounds);
                        notify(`${rounds} round(s) of fixtures generated!`, 'success');
                        renderFixtures();
                        renderScoreboard();
                    } catch (error) {
                        notify('Generation failed: ' + error.message, 'error');
                    }
                }
            });
        }
        const scoreBtn = document.getElementById('update-scores-btn');
        if (scoreBtn) {
            scoreBtn.addEventListener('click', async () => {
                try {
                    notify('Updating scores... please wait.', 'info');
                    const count = await API.updateRoundScores(currentLeague.id);
                    notify(`Updated scores! ${count} matches finalized.`, 'success');
                    renderFixtures();
                    renderScoreboard();
                } catch (error) {
                    notify('Update failed: ' + error.message, 'error');
                }
            });
        }
    }

    async function renderFixtures() {
        const container = document.getElementById('fixtures-list');
        if (!container) return;
        container.innerHTML = '<div class="text-center">Loading...</div>';
        try {
            if (!currentLeague) return;
            const leagueId = currentLeague.id;
            const fixtures = await API.getFixtures(leagueId);
            if (fixtures.length === 0) {
                container.innerHTML = `
                    <div class="text-center dim">
                        <p>No fixtures generated yet.</p>
                        ${usersList.length >= 2 ? '<p class="text-sm">Use the controls above to generate fixtures.</p>' : '<p>Need at least 2 teams.</p>'}
                    </div>
                `;
                return;
            }
            container.innerHTML = '';
            const rounds = {};
            fixtures.forEach(match => {
                if (!rounds[match.round_number]) rounds[match.round_number] = [];
                rounds[match.round_number].push(match);
            });
            Object.keys(rounds).sort((a, b) => a - b).forEach(roundNum => {
                const roundDiv = document.createElement('div');
                roundDiv.className = 'fixture-round';
                let matchesHtml = '';
                rounds[roundNum].forEach(match => {
                    const teamA = usersList.find(u => u.id === match.team_a_id);
                    const teamB = usersList.find(u => u.id === match.team_b_id);
                    const nameA = teamA ? teamA.username : 'Unknown';
                    const nameB = teamB ? teamB.username : 'Unknown';
                    const isCompleted = match.status === 'completed';
                    const scoreA = isCompleted ? match.team_a_score : '-';
                    const scoreB = isCompleted ? match.team_b_score : '-';
                    const classA = isCompleted && match.winner_id === match.team_a_id ? 'winner' : '';
                    const classB = isCompleted && match.winner_id === match.team_b_id ? 'winner' : '';
                    matchesHtml += `
                        <div class="match-card">
                            <span class="match-team text-right ${classA}">${nameA}</span>
                            <div class="match-score ${isCompleted ? 'completed' : ''}">
                                ${scoreA} - ${scoreB}
                                <div class="match-status">${match.status}</div>
                            </div>
                            <span class="match-team ${classB}">${nameB}</span>
                        </div>
                    `;
                });
                roundDiv.innerHTML = `
                    <div class="round-header">Round ${roundNum}</div>
                    ${matchesHtml}
                `;
                container.appendChild(roundDiv);
            });
        } catch (error) {
            container.innerHTML = `<div class="text-error">Error: ${error.message}</div>`;
        }
    }

    async function renderScoreboard() {
        const tbody = document.getElementById('scoreboard-body');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="8" class="text-center">Loading...</td></tr>';
        try {
            if (!currentLeague) return;
            const standings = await API.getLeagueStandings(currentLeague.id);
            tbody.innerHTML = '';
            standings.forEach((team, index) => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${index + 1}</td>
                    <td class="font-bold">${team.username}</td>
                    <td>${team.played}</td>
                    <td>${team.won}</td>
                    <td>${team.lost}</td>
                    <td>${team.drawn}</td>
                    <td class="font-bold">${team.points}</td>
                    <td class="text-sm dim">${team.net_points.toFixed(1)}</td>
                `;
                tbody.appendChild(tr);
            });
        } catch (error) {
            tbody.innerHTML = `<tr><td colspan="8" class="text-error">Error: ${error.message}</td></tr>`;
        }
    }

    pendingTradesList.addEventListener('click', async (e) => {
        const tradeId = e.target.dataset.id;
        const leagueId = currentLeague ? currentLeague.id : null;
        if (e.target.classList.contains('accept-trade')) {
            try {
                await API.swapPlayers(tradeId);
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

    createLeagueBtn.addEventListener('click', async () => {
        const name = createLeagueNameInput.value.trim();
        if (!name) return notify('Enter a league name', 'error');
        const code = name.toUpperCase().replace(/\s+/g, '-').substring(0, 20) + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
        try {
            const league = await API.createLeague(name, code);
            await API.joinLeague(currentUser.id, league.id);
            currentLeague = league;
            leagueBadge.textContent = league.name;
            createLeagueNameInput.value = '';
            notify(`League "${name}" created! Code: ${code}`, 'success');
            renderLeagueUI();
            loadData();
        } catch (error) {
            notify('Failed to create league: ' + error.message, 'error');
        }
    });

    joinLeagueBtn.addEventListener('click', async () => {
        const code = joinLeagueCodeInput.value.trim().toUpperCase();
        if (!code) return notify('Enter a league code', 'error');
        try {
            const leagues = await API.getLeagues();
            const league = leagues.find(l => l.code?.toUpperCase() === code);
            if (!league) return notify('League not found with that code', 'error');
            await API.joinLeague(currentUser.id, league.id);
            currentLeague = league;
            leagueBadge.textContent = league.name;
            joinLeagueCodeInput.value = '';
            notify(`Joined "${league.name}"!`, 'success');
            renderLeagueUI();
            loadData();
        } catch (error) {
            notify('Failed to join league: ' + error.message, 'error');
        }
    });

    leaguesList.addEventListener('click', async (e) => {
        if (e.target.classList.contains('switch-league-btn')) {
            const leagueId = e.target.dataset.id;
            try {
                await API.joinLeague(currentUser.id, leagueId);
                const leagues = await API.getLeagues();
                currentLeague = leagues.find(l => l.id === leagueId);
                leagueBadge.textContent = currentLeague ? currentLeague.name : 'No League';
                notify(`Switched to "${currentLeague.name}"!`, 'success');
                renderLeagueUI();
                loadData();
            } catch (error) {
                notify('Failed to switch league: ' + error.message, 'error');
            }
        }
    });

    const changePasswordForm = document.getElementById('change-password-form');
    const deleteAccountBtn = document.getElementById('delete-account-btn');
    const deleteConfirmModal = document.getElementById('delete-confirm-modal');
    const deleteConfirmInput = document.getElementById('delete-confirm-input');
    const modalCancelBtn = document.getElementById('modal-cancel-btn');
    const modalConfirmBtn = document.getElementById('modal-confirm-btn');

    if (changePasswordForm) {
        changePasswordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const currentPw = document.getElementById('current-password-input').value;
            const newPw = document.getElementById('new-password-input').value;
            const confirmPw = document.getElementById('confirm-new-password-input').value;
            if (newPw !== confirmPw) return notify('New passwords do not match', 'error');
            try {
                await API.changePassword(newPw);
                notify('Password updated successfully', 'success');
                changePasswordForm.reset();
            } catch (error) {
                notify('Error updating password: ' + error.message, 'error');
            }
        });
    }

    if (deleteAccountBtn) {
        deleteAccountBtn.addEventListener('click', () => {
            deleteConfirmModal.classList.remove('hidden');
            deleteConfirmInput.value = '';
            modalConfirmBtn.disabled = true;
            deleteConfirmInput.focus();
        });
    }

    if (modalCancelBtn) {
        modalCancelBtn.addEventListener('click', () => {
            deleteConfirmModal.classList.add('hidden');
        });
    }

    if (deleteConfirmInput) {
        deleteConfirmInput.addEventListener('input', (e) => {
            const text = e.target.value;
            modalConfirmBtn.disabled = text.toUpperCase() !== 'DELETE';
            if (text.toUpperCase() === 'DELETE') {
                modalConfirmBtn.classList.add('pulse-danger');
            } else {
                modalConfirmBtn.classList.remove('pulse-danger');
            }
        });
    }

    if (modalConfirmBtn) {
        modalConfirmBtn.addEventListener('click', async () => {
            if (deleteConfirmInput.value.toUpperCase() !== 'DELETE') return;
            try {
                await API.deleteAccount(currentUser.id);
                deleteConfirmModal.classList.add('hidden');
                notify('Account deleted. Goodbye.', 'info');
                currentUser = null;
                currentLeague = null;
                showAuth();
            } catch (error) {
                notify('Failed to delete account: ' + error.message, 'error');
            }
        });
    }

    init();
});