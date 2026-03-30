import React, { useState, useEffect, useCallback } from 'react';
import Navbar from './components/Navbar';
import AuthView from './components/AuthView';
import DraftPanel from './components/DraftPanel';
import PlayerList from './components/PlayerList';
import MyTeam from './components/MyTeam';
import TradeCenter from './components/TradeCenter';
import LeagueView from './components/LeagueView';
import Fixtures from './components/Fixtures';
import Scoreboard from './components/Scoreboard';
import CommissionerPanel from './components/CommissionerPanel';
import AccountView from './components/AccountView';
import PlayerStatsModal from './components/PlayerStatsModal';

import { useAuth } from './hooks/useAuth';
import { useDraft } from './hooks/useDraft';
import { useNotify } from './hooks/useNotify';
import api from './api/api';

const App = () => {
    const auth = useAuth();
    const { user, league, isCommissioner, loading, signOut } = auth;
    const { notify } = useNotify();

    const [activeTab, setActiveTab] = useState('dashboard');
    
    // Global data state
    const [allPlayersData, setAllPlayersData] = useState({ players: {} });
    const [draftedPlayers, setDraftedPlayers] = useState([]);
    const [usersList, setUsersList] = useState([]);
    const [mySquad, setMySquad] = useState([]);
    const [starting11, setStarting11] = useState([]);
    const [pendingTrades, setPendingTrades] = useState([]);
    const [dataLoading, setDataLoading] = useState(false);
    const [scoreboardTrigger, setScoreboardTrigger] = useState(0);
    const [selectedPlayerName, setSelectedPlayerName] = useState(null);

    const getLineupTypeCounts = useCallback((lineup) => {
        const counts = { batsman: 0, bowler: 0, allrounder: 0 };
        lineup.forEach((playerName) => {
            const type = (allPlayersData.players?.[playerName]?.playerType || '').toLowerCase();
            if (type === 'batsman' || type === 'bowler' || type === 'allrounder') {
                counts[type] += 1;
            }
        });
        return counts;
    }, [allPlayersData.players]);

    const validateStarting11 = useCallback((lineup) => {
        const counts = getLineupTypeCounts(lineup);
        const errors = [];

        if (lineup.length !== 11) {
            errors.push('Starting 11 must include exactly 11 players.');
        }
        if (counts.batsman < 4) {
            errors.push(`Starting 11 needs at least 4 batsmen (currently ${counts.batsman}).`);
        }
        if (counts.bowler < 4) {
            errors.push(`Starting 11 needs at least 4 bowlers (currently ${counts.bowler}).`);
        }
        if (counts.allrounder < 2) {
            errors.push(`Starting 11 needs at least 2 allrounders (currently ${counts.allrounder}).`);
        }

        return {
            counts,
            errors,
            isValid: errors.length === 0,
        };
    }, [getLineupTypeCounts]);

    const lineupValidation = validateStarting11(starting11);

    const loadData = useCallback(async () => {
        if (!user) return;
        setDataLoading(true);
        try {
            const leagueId = league ? league.id : null;
            const [statsData, draftedData, uList] = await Promise.all([
                api.getTournamentStats(),
                api.getDraftedPlayers(leagueId),
                api.getAllUsers(leagueId)
            ]);
            
            setAllPlayersData(statsData || { players: {} });
            setDraftedPlayers(draftedData || []);
            setUsersList(uList || []);
            
            const mySquadPlayers = (draftedData || []).filter(dp => dp.user_id === user.id).map(dp => dp.player_id);
            setMySquad(mySquadPlayers);

            const teamData = await api.getUserTeam(user.id);
            if (teamData && teamData.starting_11) {
                setStarting11(teamData.starting_11.filter(name => mySquadPlayers.includes(name)));
            } else {
                setStarting11([]);
            }

            const tradesData = await api.getTrades(user.id);
            setPendingTrades(tradesData || []);

        } catch (error) {
            notify(`Error loading data: ${error.message}`, 'error');
        } finally {
            setDataLoading(false);
        }
    }, [user, league, notify]);

    const handleDraftTimeout = useCallback(async (timeoutUserId, timeoutPick, draftStateSnapshot) => {
        if (!league) return;
        try {
            const normalizeRole = (playerName) => {
                const raw = (allPlayersData.players?.[playerName]?.playerType || '').toLowerCase();
                if (raw === 'bowler' || raw === 'allrounder' || raw === 'batsman') return raw;
                return 'batsman';
            };

            const allPlayerNames = Object.keys(allPlayersData.players || {});
            const alreadyDrafted = new Set([
                ...draftedPlayers.map((dp) => dp.player_id),
                ...((draftStateSnapshot?.picks || []).map((pick) => pick.player_id))
            ]);
            const availableNames = allPlayerNames.filter((name) => !alreadyDrafted.has(name));
            
            if (availableNames.length > 0) {
                const roleCounts = { batsman: 0, bowler: 0, allrounder: 0 };
                const userPicks = (draftStateSnapshot?.picks || []).filter((pick) => pick.user_id === timeoutUserId);

                userPicks.forEach((pick) => {
                    const role = normalizeRole(pick.player_id);
                    roleCounts[role] += 1;
                });

                const minRoleCount = Math.min(roleCounts.batsman, roleCounts.bowler, roleCounts.allrounder);
                const targetRoles = Object.keys(roleCounts).filter((role) => roleCounts[role] === minRoleCount);

                let candidates = availableNames.filter((name) => targetRoles.includes(normalizeRole(name)));
                if (candidates.length === 0) {
                    candidates = availableNames;
                }

                const randomName = candidates[Math.floor(Math.random() * candidates.length)];
                
                await api.makeDraftPick(league.id, timeoutUserId, randomName, timeoutPick);
                await api.draftPlayer(randomName, randomName, timeoutUserId, league.id);

                setDraftedPlayers((prev) => {
                    if (prev.some((pick) => pick.player_id === randomName)) return prev;
                    return [...prev, { player_id: randomName, user_id: timeoutUserId }];
                });
            }
        } catch (error) {
            if (!error.message.includes('mismatch')) {
                console.error("Auto-draft failed:", error.message);
            }
        }
    }, [league, allPlayersData, draftedPlayers]);

    const draft = useDraft(league?.id, user?.id, handleDraftTimeout);
    const turnOrder = draft.draftState?.turn_order || [];
    const totalPicks = turnOrder.length * (draft.draftSquadSize || 22);
    const hasActiveDraftSession = Boolean(
        draft.draftState?.is_active
        && turnOrder.length >= 2
        && draft.draftState.current_pick < totalPicks
    );

    const handleOpenPlayerStats = useCallback((playerName) => {
        if (!playerName) return;
        if (!allPlayersData.players?.[playerName]) {
            notify('Stats are not available for this player yet.', 'error');
            return;
        }
        setSelectedPlayerName(playerName);
    }, [allPlayersData.players, notify]);

    const selectedPlayer = selectedPlayerName ? allPlayersData.players?.[selectedPlayerName] : null;

    // Load data when user/league changes
    useEffect(() => {
        loadData();
    }, [user?.id, league?.id]);

    useEffect(() => {
        if (!draft.draftState) return;
        if (!draft.draftState.is_active && draft.draftState.current_pick > 0) {
            loadData();
        }
    }, [draft.draftState?.is_active, draft.draftState?.current_pick, loadData]);

    if (loading) {
        return <div className="loader" style={{ marginTop: '100px', textAlign: 'center' }}>Loading Fantasy Cricket...</div>;
    }

    if (!user) {
        return (
            <>
                <Navbar authData={auth} />
                <main className="container">
                    <AuthView authData={auth} />
                </main>
            </>
        );
    }

    const handleSaveLineup = async () => {
        if (!league) return notify('You must join a league first!', 'error');

        const validation = validateStarting11(starting11);
        if (!validation.isValid) {
            return notify(validation.errors[0], 'error');
        }

        try {
            await api.saveUserTeam(user.id, league.id, mySquad, starting11);
            notify('Lineup saved successfully!', 'success');
        } catch (error) {
            notify(error.message, 'error');
        }
    };

    const handleReleasePlayer = async (playerName) => {
        const leagueId = league ? league.id : null;
        try {
            await api.releasePlayer(playerName, user.id, leagueId);
            setMySquad(prev => prev.filter(p => p !== playerName));
            setStarting11(prev => prev.filter(p => p !== playerName));
            loadData(); // reload drafted players logic
        } catch (error) {
            notify('Error releasing player: ' + error.message, 'error');
        }
    };

    const handleAccountDeleted = () => {
        notify('Account deleted. Goodbye.', 'info');
        signOut();
    };

    const renderTabContent = () => {
        switch (activeTab) {
            case 'dashboard':
                return (
                    <section id="dashboard-view" className="view tab-content">
                        <div className="dashboard-header">
                            <h2>Tournament Dashboard</h2>
                            <div className="stats-overview">
                                <div className="stat-card">
                                    <span className="label">My Squad</span>
                                    <span className="value">{mySquad.length}</span>
                                </div>
                            </div>
                        </div>

                        {hasActiveDraftSession && (
                            <DraftPanel 
                                draftState={draft.draftState} 
                                countdown={draft.countdown} 
                                isMyTurn={draft.isMyTurn} 
                                currentUser={user} 
                                usersList={usersList} 
                                autoDraftEnabled={draft.autoDraftEnabled}
                                onToggleAutoDraft={draft.toggleAutoDraft}
                                draftSquadSize={draft.draftSquadSize}
                                onPlayerClick={handleOpenPlayerStats}
                            />
                        )}

                        <div className={`main-layout ${!hasActiveDraftSession ? 'no-draft' : ''}`.trim()}>
                            {hasActiveDraftSession && (
                                <PlayerList 
                                    players={Object.values(allPlayersData.players || {})} 
                                    draftedPlayers={draftedPlayers} 
                                    mySquad={mySquad} 
                                    currentUser={user} 
                                    draftState={draft.draftState} 
                                    isDraftActive={hasActiveDraftSession}
                                    isMyTurn={draft.isMyTurn} 
                                    onPlayerClick={handleOpenPlayerStats}
                                    onDraftPick={async (player) => {
                                        if (!league) return notify('You must join a league before drafting!', 'error');
                                        if (!hasActiveDraftSession) {
                                            return notify('Draft is not active. Ask the commissioner to start the draft first.', 'error');
                                        }
                                        try {
                                            const alreadyTaken = await api.isPlayerDrafted(player.name, league.id);
                                            if (alreadyTaken) return notify('Player already taken in your league!', 'error');

                                            await draft.makePick(player.name, player.name);
                                            loadData();
                                        } catch (err) { }
                                    }}
                                />
                            )}
                            <MyTeam 
                                mySquad={mySquad} 
                                starting11={starting11} 
                                setStarting11={setStarting11} 
                                playersData={allPlayersData.players || {}}
                                lineupValidation={lineupValidation}
                                isDraftActive={hasActiveDraftSession}
                                onPlayerClick={handleOpenPlayerStats}
                                onReleasePlayer={handleReleasePlayer} 
                                onSaveLineup={handleSaveLineup}
                            />
                        </div>
                    </section>
                );
            case 'trade':
                return (
                    <TradeCenter 
                        currentUser={user} 
                        usersList={usersList} 
                        mySquad={mySquad} 
                        draftedPlayers={draftedPlayers} 
                        pendingTrades={pendingTrades} 
                        onPlayerClick={handleOpenPlayerStats}
                        onTradeUpdate={loadData}
                    />
                );
            case 'league':
                return (
                    <LeagueView 
                        currentUser={user} 
                        currentLeague={league} 
                        onLeagueChange={() => auth.refreshLeague()} 
                    />
                );
            case 'fixtures':
                return (
                    <Fixtures 
                        currentLeague={league} 
                        usersList={usersList} 
                        isCommissioner={isCommissioner} 
                        onUpdateScoresTrigger={() => setScoreboardTrigger(prev => prev + 1)}
                    />
                );
            case 'commissioner':
                return (
                    <CommissionerPanel 
                        isCommissioner={isCommissioner} 
                        currentLeague={league} 
                        currentUser={user} 
                        onLeagueChange={() => auth.refreshLeague()} 
                        onStartDraft={async (list) => {
                            const started = await draft.startDraft(list);
                            if (started) {
                                await loadData();
                                setActiveTab('dashboard');
                            }
                        }}
                    />
                );
            case 'scoreboard':
                return (
                    <Scoreboard 
                        currentLeague={league} 
                        refreshTrigger={scoreboardTrigger} 
                    />
                );
            case 'account':
                return (
                    <AccountView 
                        currentUser={user} 
                        onAccountDeleted={handleAccountDeleted} 
                    />
                );
            default:
                return null;
        }
    };

    return (
        <>
            <Navbar authData={auth} />
            <div id="nav-tabs" className="container">
                <div className="tabs">
                    {[
                        { id: 'dashboard', label: 'Dashboard' },
                        { id: 'trade', label: 'Trade Center' },
                        { id: 'league', label: 'Leagues' },
                        { id: 'fixtures', label: 'Fixtures' },
                        isCommissioner && { id: 'commissioner', label: 'Commissioner' },
                        { id: 'scoreboard', label: 'Scoreboard' },
                        { id: 'account', label: 'Account' },
                    ].filter(Boolean).map(tab => (
                        <button 
                            key={tab.id}
                            className={`tab-link ${activeTab === tab.id ? 'active' : ''}`} 
                            onClick={() => setActiveTab(tab.id)}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>
            <main className="container">
                {renderTabContent()}
            </main>
            <PlayerStatsModal
                playerName={selectedPlayerName}
                player={selectedPlayer}
                onClose={() => setSelectedPlayerName(null)}
            />
        </>
    );
};

export default App;
