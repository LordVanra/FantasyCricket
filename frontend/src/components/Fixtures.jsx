import React, { useState, useEffect } from 'react';
import api from '../api/api';
import { useNotify } from '../hooks/useNotify';
import MatchBreakdownModal from './MatchBreakdownModal';

const toIsoDay = (value) => {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString().slice(0, 10);
};

const addOneDayIso = (isoDay) => {
    if (!isoDay) return null;
    const parsed = new Date(`${isoDay}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) return null;
    parsed.setUTCDate(parsed.getUTCDate() + 1);
    return parsed.toISOString().slice(0, 10);
};

const extractTeamsFromMatchUrl = (matchUrl) => {
    if (!matchUrl || typeof matchUrl !== 'string') return [];
    const parts = matchUrl.split('/');
    const slug = parts.find((segment) => segment.includes('-vs-'));
    if (!slug) return [];

    const [teamA, teamBRest] = slug.split('-vs-');
    if (!teamA || !teamBRest) return [];

    const teamBMatch = teamBRest.match(/^(.+?)-\d+(?:st|nd|rd|th)-match/);
    const teamB = teamBMatch ? teamBMatch[1] : teamBRest;

    if (!teamA || !teamB) return [];
    return [teamA, teamB];
};

const buildRoundMatchDays = (stats) => {
    const rawMatches = Array.isArray(stats?.matches) ? stats.matches : [];
    if (rawMatches.length === 0) return {};

    const dedupedByUrl = new Map();
    rawMatches.forEach((entry) => {
        const url = entry?.url;
        const day = toIsoDay(entry?.matchDate || entry?.date || entry?.match_date);
        if (!url || !day) return;

        const existing = dedupedByUrl.get(url);
        if (!existing || day < existing) {
            dedupedByUrl.set(url, day);
        }
    });

    const teamToDays = new Map();
    dedupedByUrl.forEach((day, url) => {
        const teams = extractTeamsFromMatchUrl(url);
        teams.forEach((teamSlug) => {
            if (!teamToDays.has(teamSlug)) {
                teamToDays.set(teamSlug, new Set());
            }
            teamToDays.get(teamSlug).add(day);
        });
    });

    const teams = Array.from(teamToDays.keys());
    if (teams.length < 2) return {};

    const orderedDaysByTeam = new Map();
    teams.forEach((teamSlug) => {
        const ordered = Array.from(teamToDays.get(teamSlug)).sort();
        orderedDaysByTeam.set(teamSlug, ordered);
    });

    const roundDayMap = {};
    for (let round = 1; round <= 40; round += 1) {
        let completionDay = null;

        for (const teamSlug of teams) {
            const teamDays = orderedDaysByTeam.get(teamSlug) || [];
            const nthDay = teamDays[round - 1];
            if (!nthDay) {
                return roundDayMap;
            }
            if (!completionDay || nthDay > completionDay) {
                completionDay = nthDay;
            }
        }

        const matchDay = addOneDayIso(completionDay);
        if (!matchDay) return roundDayMap;
        roundDayMap[round] = matchDay;
    }

    return roundDayMap;
};

const formatMatchDay = (rawValue) => {
    if (!rawValue) return 'Pending scraped match dates';
    if (typeof rawValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawValue)) return rawValue;
    const parsed = new Date(rawValue);
    if (Number.isNaN(parsed.getTime())) return 'Pending scraped match dates';
    return parsed.toLocaleDateString();
};

const Fixtures = ({ currentLeague, usersList, isCommissioner, onUpdateScoresTrigger }) => {
    const [fixtures, setFixtures] = useState([]);
    const [roundMatchDays, setRoundMatchDays] = useState({});
    const [roundsInput, setRoundsInput] = useState(1);
    const [ignoreRoundsInput, setIgnoreRoundsInput] = useState(0);
    const [loading, setLoading] = useState(false);
    const [breakdownOpen, setBreakdownOpen] = useState(false);
    const [breakdownLoading, setBreakdownLoading] = useState(false);
    const [breakdownError, setBreakdownError] = useState('');
    const [selectedMatch, setSelectedMatch] = useState(null);
    const [selectedTeamName, setSelectedTeamName] = useState('');
    const [selectedBreakdown, setSelectedBreakdown] = useState(null);
    const { notify } = useNotify();

    const getRoundsStorageKey = (leagueId) => `fixtures-rounds-${leagueId}`;
    const getIgnoreRoundsStorageKey = (leagueId) => `ignore-rounds-${leagueId}`;

    const loadFixtures = async () => {
        if (!currentLeague) return;
        setLoading(true);
        try {
            const [data, stats] = await Promise.all([
                api.getFixtures(currentLeague.id),
                api.getTournamentStats().catch(() => null)
            ]);
            setFixtures(data);
            setRoundMatchDays(buildRoundMatchDays(stats));

            // Prefer the currently-generated rounds count so the input reflects league state.
            const currentMaxRound = (data || []).reduce((maxRound, match) => {
                const value = Number(match?.round_number) || 0;
                return value > maxRound ? value : maxRound;
            }, 0);

            if (currentMaxRound > 0) {
                const clampedRound = Math.min(10, Math.max(1, currentMaxRound));
                setRoundsInput(clampedRound);
                window.localStorage.setItem(getRoundsStorageKey(currentLeague.id), String(clampedRound));
            }
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

        const storedRoundsValue = window.localStorage.getItem(getRoundsStorageKey(currentLeague.id));
        if (storedRoundsValue === null) {
            setRoundsInput(1);
        } else {
            const parsedRounds = parseInt(storedRoundsValue, 10);
            setRoundsInput(Number.isNaN(parsedRounds) ? 1 : Math.max(1, Math.min(10, parsedRounds)));
        }

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

    const closeBreakdownModal = () => {
        setBreakdownOpen(false);
        setBreakdownLoading(false);
        setBreakdownError('');
        setSelectedMatch(null);
        setSelectedTeamName('');
        setSelectedBreakdown(null);
    };

    const openTeamBreakdown = async (match, teamId, teamName) => {
        if (!match || match.status !== 'completed') return;

        setSelectedMatch(match);
        setSelectedTeamName(teamName);
        setSelectedBreakdown(null);
        setBreakdownError('');
        setBreakdownLoading(true);
        setBreakdownOpen(true);

        try {
            const data = await api.getMatchTeamBreakdown(match.id, teamId);
            setSelectedBreakdown(data);
        } catch (error) {
            setBreakdownError(error.message || 'Failed to load match breakdown.');
            notify('Could not load team breakdown: ' + error.message, 'error');
        } finally {
            setBreakdownLoading(false);
        }
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
                                            window.localStorage.setItem(getRoundsStorageKey(currentLeague.id), '1');
                                            return;
                                        }
                                        const clamped = Math.min(10, Math.max(1, parsed));
                                        setRoundsInput(clamped);
                                        window.localStorage.setItem(getRoundsStorageKey(currentLeague.id), String(clamped));
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
                                    const computedRoundDay = roundMatchDays[Number(match.round_number)] || null;
                                    const fallbackMatchDay = match.score_due_at || match.finalized_at;
                                    const matchDayText = formatMatchDay(computedRoundDay || fallbackMatchDay);
                                    const finalizedText = match.finalized_at
                                        ? new Date(match.finalized_at).toLocaleString()
                                        : null;
                                    
                                    return (
                                        <div key={match.id} className="match-card">
                                            {isCompleted ? (
                                                <button
                                                    type="button"
                                                    className={`match-team-btn match-team text-right ${classA}`.trim()}
                                                    onClick={() => openTeamBreakdown(match, match.team_a_id, nameA)}
                                                    title={`View ${nameA} breakdown`}
                                                >
                                                    {nameA}
                                                </button>
                                            ) : (
                                                <span className={`match-team text-right ${classA}`}>{nameA}</span>
                                            )}
                                            <div className={`match-score ${isCompleted ? 'completed' : ''}`}>
                                                {scoreA} - {scoreB}
                                                <div className="match-status">{match.status}</div>
                                                <div className="match-meta">Match Day: {matchDayText}</div>
                                                {finalizedText && <div className="match-meta">Finalized: {finalizedText}</div>}
                                            </div>
                                            {isCompleted ? (
                                                <button
                                                    type="button"
                                                    className={`match-team-btn match-team ${classB}`.trim()}
                                                    onClick={() => openTeamBreakdown(match, match.team_b_id, nameB)}
                                                    title={`View ${nameB} breakdown`}
                                                >
                                                    {nameB}
                                                </button>
                                            ) : (
                                                <span className={`match-team ${classB}`}>{nameB}</span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        ))
                    )}
                </div>
            </div>
            <MatchBreakdownModal
                isOpen={breakdownOpen}
                loading={breakdownLoading}
                error={breakdownError}
                match={selectedMatch}
                teamName={selectedTeamName}
                breakdown={selectedBreakdown}
                onClose={closeBreakdownModal}
            />
        </section>
    );
};

export default Fixtures;
