import React, { useState, useEffect } from 'react';
import api from '../api/api';
import { useNotify } from '../hooks/useNotify';

const Fixtures = ({ currentLeague, usersList, isCommissioner, onStartDraft, onUpdateScoresTrigger }) => {
    const [fixtures, setFixtures] = useState([]);
    const [roundsInput, setRoundsInput] = useState(1);
    const [ignoreRoundsInput, setIgnoreRoundsInput] = useState(0);
    const [loading, setLoading] = useState(false);
    const { notify } = useNotify();

    const getIgnoreRoundsStorageKey = (leagueId) => `ignore-rounds-${leagueId}`;

    const loadFixtures = async () => {
        if (!currentLeague) return;
        setLoading(true);
        try {
            const data = await api.getFixtures(currentLeague.id);
            setFixtures(data);
        } catch (error) {
            notify('Error loading fixtures: ' + error.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadFixtures();
    }, [currentLeague]);

    useEffect(() => {
        if (!currentLeague) return;

        const storedValue = window.localStorage.getItem(getIgnoreRoundsStorageKey(currentLeague.id));
        if (storedValue === null) {
            setIgnoreRoundsInput(0);
            return;
        }

        const parsed = parseInt(storedValue, 10);
        setIgnoreRoundsInput(Number.isNaN(parsed) ? 0 : Math.max(0, Math.min(20, parsed)));
    }, [currentLeague]);

    const handleGenerate = async () => {
        if (!currentLeague) return;
        if (roundsInput < 1 || roundsInput > 10) {
            return notify('Please enter rounds between 1-10', 'error');
        }
        if (window.confirm(`Generate ${roundsInput} round(s) of fixtures? This will clear any existing matches.`)) {
            try {
                await api.generateFixtures(currentLeague.id, roundsInput);
                notify(`${roundsInput} round(s) generated!`, 'success');
                loadFixtures();
                onUpdateScoresTrigger(); // trigger scoreboard refresh
            } catch (error) {
                notify('Generation failed: ' + error.message, 'error');
            }
        }
    };

    const handleUpdateScores = async () => {
        if (!currentLeague) return;
        try {
            const ignoredRounds = Math.max(0, Math.min(20, Number(ignoreRoundsInput) || 0));

            notify('Updating scores... please wait.', 'info');
            const count = await api.updateRoundScores(currentLeague.id, ignoredRounds);
            notify(`Updated scores! ${count || 0} matches finalized (ignoring first ${ignoredRounds} round(s)).`, 'success');
            loadFixtures();
            onUpdateScoresTrigger(); // trigger scoreboard refresh
        } catch (error) {
            notify('Update failed: ' + error.message, 'error');
        }
    };

    const handleStartDraft = async () => {
        const confirmed = window.confirm('Are you sure? This will delete all current squads.');
        if (!confirmed) return;
        await onStartDraft(usersList);
    };

    // Group by rounds
    const rounds = {};
    fixtures.forEach((match) => {
        if (!rounds[match.round_number]) rounds[match.round_number] = [];
        rounds[match.round_number].push(match);
    });

    return (
        <section id="fixtures-view" className="tab-content">
            <div className="card">
                <div className="card-header">
                    <h3>Season Fixtures</h3>
                    {isCommissioner && (
                        <div id="commissioner-controls" className="form-group fixtures-controls" style={{ margin: 0 }}>
                            <button className="btn btn-accent fixtures-action-btn" onClick={handleStartDraft}>
                                Start Draft
                            </button>
                            <button className="btn btn-primary fixtures-action-btn" onClick={handleGenerate}>
                                Generate Fixtures
                            </button>
                            <button className="btn btn-secondary fixtures-action-btn" onClick={handleUpdateScores}>
                                Update Scores
                            </button>
                            <div className="fixtures-rounds-field">
                                <label htmlFor="fixtures-rounds-input">Rounds</label>
                                <input
                                    id="fixtures-rounds-input"
                                    type="number"
                                    className="fixtures-rounds-input"
                                    min="1"
                                    max="10"
                                    value={roundsInput}
                                    onChange={(event) => {
                                        const parsed = parseInt(event.target.value, 10);
                                        if (Number.isNaN(parsed)) {
                                            setRoundsInput(1);
                                            return;
                                        }
                                        setRoundsInput(Math.min(10, Math.max(1, parsed)));
                                    }}
                                />
                            </div>
                            <div className="fixtures-rounds-field">
                                <label htmlFor="fixtures-ignore-rounds-input">Ignore Rounds</label>
                                <input
                                    id="fixtures-ignore-rounds-input"
                                    type="number"
                                    className="fixtures-rounds-input"
                                    min="0"
                                    max="20"
                                    value={ignoreRoundsInput}
                                    onChange={(event) => {
                                        const parsed = parseInt(event.target.value, 10);
                                        if (Number.isNaN(parsed)) {
                                            setIgnoreRoundsInput(0);
                                            window.localStorage.setItem(getIgnoreRoundsStorageKey(currentLeague.id), '0');
                                            return;
                                        }

                                        const clamped = Math.max(0, Math.min(20, parsed));
                                        setIgnoreRoundsInput(clamped);
                                        window.localStorage.setItem(getIgnoreRoundsStorageKey(currentLeague.id), String(clamped));
                                    }}
                                />
                            </div>
                        </div>
                    )}
                </div>
                
                <div className="fixtures-container">
                    {loading ? (
                        <div className="text-center">Loading fixtures...</div>
                    ) : fixtures.length === 0 ? (
                        <div className="text-center dim">
                            <p>No fixtures generated yet.</p>
                            {usersList.length >= 2 ? (
                                <p className="text-sm">Use the commissioner controls to generate fixtures.</p>
                            ) : (
                                <p>Need at least 2 teams.</p>
                            )}
                        </div>
                    ) : (
                        Object.keys(rounds).sort((a, b) => parseInt(a) - parseInt(b)).map((roundNum) => (
                            <div key={`round-${roundNum}`} className="fixture-round">
                                <div className="round-header">Round {roundNum}</div>
                                {rounds[roundNum].map((match) => {
                                    const teamA = usersList.find((u) => u.id === match.team_a_id);
                                    const teamB = usersList.find((u) => u.id === match.team_b_id);
                                    const nameA = teamA ? teamA.username : 'Unknown';
                                    const nameB = teamB ? teamB.username : 'Unknown';
                                    const isCompleted = match.status === 'completed';
                                    const scoreA = isCompleted ? match.team_a_score : '-';
                                    const scoreB = isCompleted ? match.team_b_score : '-';
                                    const classA = isCompleted && match.winner_id === match.team_a_id ? 'winner' : '';
                                    const classB = isCompleted && match.winner_id === match.team_b_id ? 'winner' : '';
                                    
                                    return (
                                        <div key={match.id} className="match-card">
                                            <span className={`match-team text-right ${classA}`}>{nameA}</span>
                                            <div className={`match-score ${isCompleted ? 'completed' : ''}`}>
                                                {scoreA} - {scoreB}
                                                <div className="match-status">{match.status}</div>
                                            </div>
                                            <span className={`match-team ${classB}`}>{nameB}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </section>
    );
};

export default Fixtures;
