import React, { useState, useEffect } from 'react';
import api from '../api/api';
import { useNotify } from '../hooks/useNotify';

const LeagueView = ({ currentUser, currentLeague, onLeagueChange }) => {
    const [leagues, setLeagues] = useState([]);
    const [joinCode, setJoinCode] = useState('');
    const [createName, setCreateName] = useState('');
    const { notify } = useNotify();

    const loadLeagues = async () => {
        try {
            const data = await api.getLeagues();
            setLeagues(data);
        } catch (error) {
            notify('Could not load leagues: ' + error.message, 'error');
        }
    };

    useEffect(() => {
        loadLeagues();
    }, []);

    const handleCreateLeague = async () => {
        const name = createName.trim();
        if (!name) return notify('Enter a league name', 'error');
        const code = name.toUpperCase().replace(/\s+/g, '-').substring(0, 20) + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
        try {
            const league = await api.createLeague(name, code, currentUser.id);
            await api.joinLeague(currentUser.id, league.id);
            notify(`League "${name}" created! Code: ${code}`, 'success');
            setCreateName('');
            loadLeagues();
            onLeagueChange(league.id);
        } catch (error) {
            notify('Failed to create league: ' + error.message, 'error');
        }
    };

    const handleJoinLeague = async () => {
        const code = joinCode.trim().toUpperCase();
        if (!code) return notify('Enter a league code', 'error');
        try {
            const leagueToJoin = leagues.find((l) => l.code?.toUpperCase() === code);
            if (!leagueToJoin) return notify('League not found with that code', 'error');
            await api.joinLeague(currentUser.id, leagueToJoin.id);
            notify(`Joined "${leagueToJoin.name}"!`, 'success');
            setJoinCode('');
            loadLeagues();
            onLeagueChange(leagueToJoin.id);
        } catch (error) {
            notify('Failed to join league: ' + error.message, 'error');
        }
    };

    const handleSwitchLeague = async (leagueId) => {
        try {
            await api.joinLeague(currentUser.id, leagueId);
            notify('Switched league!', 'success');
            onLeagueChange(leagueId);
        } catch (error) {
            notify('Failed to switch league: ' + error.message, 'error');
        }
    };

    return (
        <section id="league-view" className="view tab-content">
            <div className="league-layout">
                <div className="card league-current-card">
                    <div className="league-current-header">
                        <h3>Your League</h3>
                        <span id="current-league-name" className="league-name-display">
                            {currentLeague ? currentLeague.name : '-'}
                        </span>
                    </div>
                </div>
                <div className="league-actions-grid">
                    <div className="card">
                        <h3>Join a League</h3>
                        <p className="dim">Enter the league invite code to join</p>
                        <div className="form-group">
                            <input 
                                type="text" 
                                placeholder="e.g. MY-LEAGUE-X7K2" 
                                value={joinCode}
                                onChange={(e) => setJoinCode(e.target.value)}
                            />
                        </div>
                        <button className="btn btn-primary" onClick={handleJoinLeague}>Join League</button>
                    </div>
                    <div className="card">
                        <h3>Create a League</h3>
                        <p className="dim">Start your own league and invite friends</p>
                        <div className="form-group">
                            <input 
                                type="text" 
                                placeholder="League name" 
                                value={createName}
                                onChange={(e) => setCreateName(e.target.value)}
                            />
                        </div>
                        <button className="btn btn-accent" onClick={handleCreateLeague}>Create League</button>
                    </div>
                </div>
                <div className="card">
                    <h3>Available Leagues</h3>
                    <div id="leagues-list" className="mini-list">
                        {leagues.map((league) => {
                            const isCurrent = currentLeague && currentLeague.id === league.id;
                            return (
                                <div key={league.id} className={`league-item ${isCurrent ? 'current' : ''}`}>
                                    <div className="league-info">
                                        <h4>{league.name}</h4>
                                        <p className="dim">Code: <span className="league-code">{league.code}</span></p>
                                    </div>
                                    {isCurrent ? (
                                        <span className="badge">Current</span>
                                    ) : (
                                        <button 
                                            className="btn btn-outline btn-xs switch-league-btn" 
                                            onClick={() => handleSwitchLeague(league.id)}
                                        >
                                            Join
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </section>
    );
};

export default LeagueView;
