import React, { useState } from 'react';
import { useNotify } from '../hooks/useNotify';

const PlayerList = ({ players, draftedPlayers, mySquad, currentUser, draftState, isMyTurn, onDraftPick, onPlayerClick }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [typeFilter, setTypeFilter] = useState('all');
    const [teamFilter, setTeamFilter] = useState('all');
    const { notify } = useNotify();

    const normalizePlayerType = (rawType) => {
        const type = (rawType || 'batsman').toLowerCase();
        if (type === 'allrounder' || type === 'bowler' || type === 'batsman') return type;
        return 'batsman';
    };

    const formatPlayerType = (rawType) => {
        const type = normalizePlayerType(rawType);
        if (type === 'allrounder') return 'Allrounder';
        if (type === 'bowler') return 'Bowler';
        return 'Batsman';
    };

    const formatTeamName = (team) => {
        if (!team) return 'Unknown Team';
        return String(team)
            .replace(/-/g, ' ')
            .split(' ')
            .filter(Boolean)
            .map(part => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' ');
    };

    const teamOptionMap = new Map();
    players.forEach((player) => {
        if (!player.team) return;
        const display = formatTeamName(player.team);
        if (!teamOptionMap.has(display)) {
            teamOptionMap.set(display, player.team);
        }
    });

    const teams = Array.from(teamOptionMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([display, raw]) => ({ display, raw }));

    const filtered = players.filter((player) => {
        const searchMatch = player.name.toLowerCase().includes(searchTerm.toLowerCase());
        const playerType = normalizePlayerType(player.playerType);
        const typeMatch = typeFilter === 'all' || playerType === typeFilter;
        const teamMatch = teamFilter === 'all' || (player.team || '') === teamFilter;
        return searchMatch && typeMatch && teamMatch;
    });
    
    const isDraftActive = draftState && draftState.is_active;

    const handleDraftClick = (player) => {
        if (!currentUser) return notify('You must be logged in to draft!', 'error');
        onDraftPick(player);
    };

    return (
        <div className="card marketplace">
            <div className="card-header">
                <h3>Player Draft</h3>
                <input 
                    type="text" 
                    id="player-search" 
                    placeholder="Search players..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
            <p className="hint click-stats-hint">Click any player name to view full stats.</p>
            {!isDraftActive && (
                <p className="hint">Draft is locked until the commissioner starts it from Fixtures.</p>
            )}
            <div className="draft-filters">
                <div className="draft-filter-group">
                    <label htmlFor="draft-type-filter">Role</label>
                    <select
                        id="draft-type-filter"
                        value={typeFilter}
                        onChange={(event) => setTypeFilter(event.target.value)}
                    >
                        <option value="all">All Roles</option>
                        <option value="batsman">Batsman</option>
                        <option value="bowler">Bowler</option>
                        <option value="allrounder">Allrounder</option>
                    </select>
                </div>
                <div className="draft-filter-group">
                    <label htmlFor="draft-team-filter">Team</label>
                    <select
                        id="draft-team-filter"
                        value={teamFilter}
                        onChange={(event) => setTeamFilter(event.target.value)}
                    >
                        <option value="all">All Teams</option>
                        {teams.map((team) => (
                            <option key={team.display} value={team.raw}>{team.display}</option>
                        ))}
                    </select>
                </div>
            </div>
            <div className="player-list scrollable" id="all-players-list">
                {players.length === 0 ? <div className="loader">Loading stats...</div> : null}
                {filtered.map((player) => {
                    const isTaken = draftedPlayers.some(dp => dp.player_id === player.name && dp.user_id !== currentUser?.id);
                    const isInMySquad = mySquad.includes(player.name);
                    const isDraftPicked = isDraftActive && (draftState.picks || []).some(p => p.player_id === player.name);
                    const playerType = formatPlayerType(player.playerType);
                    
                    // Simple points calc replicated from vanilla JS
                    let points = 0;
                    if (player.matches && player.matches.length > 0) {
                        const lastMatchUrl = player.matches[player.matches.length - 1];
                        const batting = player.batting.find(m => m.matchUrl === lastMatchUrl) || {};
                        const bowling = player.bowling.find(m => m.matchUrl === lastMatchUrl) || {};
                        const fielding = player.fielding.find(m => m.matchUrl === lastMatchUrl) || {};
                        
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
                    }
                    points = Math.round(points * 10) / 10;

                    let showDraftBtn = false;
                    if (!isTaken && !isInMySquad && !isDraftPicked && isDraftActive) {
                        showDraftBtn = isMyTurn;
                    }

                    return (
                        <div key={player.name} className={`player-item ${isTaken || isDraftPicked ? 'taken' : ''}`}>
                            <div className="player-info">
                                <h4>
                                    <button type="button" className="player-link-btn" onClick={() => onPlayerClick?.(player.name)}>
                                        {player.name}
                                    </button>{' '}
                                    <span className="points-badge">{points} pts</span>
                                </h4>
                                <p>
                                    {player.totalRuns} Runs | {player.totalWickets} Wickets
                                    {player.team ? ` | ${formatTeamName(player.team)}` : ''}
                                    {` | ${playerType}`}
                                </p>
                            </div>
                            {showDraftBtn && (
                                <button 
                                    className="btn btn-outline btn-xs draft-btn" 
                                    onClick={() => handleDraftClick(player)}
                                >
                                    Draft
                                </button>
                            )}
                            {isInMySquad && <span className="badge">In Squad</span>}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default PlayerList;
