import React, { useEffect } from 'react';

const toNumber = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return numeric;
};

const MatchBreakdownModal = ({ isOpen, loading, error, match, teamName, breakdown, onClose }) => {
    useEffect(() => {
        if (!isOpen) return undefined;

        const handleEscape = (event) => {
            if (event.key === 'Escape') onClose();
        };

        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const players = Array.isArray(breakdown?.players) ? breakdown.players : [];
    const teamTotal = toNumber(breakdown?.team_total);

    return (
        <div className="match-breakdown-overlay" onClick={onClose}>
            <div className="match-breakdown-modal" onClick={(event) => event.stopPropagation()}>
                <div className="match-breakdown-header">
                    <div>
                        <h2>{teamName} - Match Breakdown</h2>
                        <p className="match-breakdown-subtitle">
                            Round {match?.round_number || '-'} | Total: {teamTotal.toFixed(1)} pts
                        </p>
                    </div>
                    <button type="button" className="player-stats-close" onClick={onClose}>
                        x
                    </button>
                </div>

                <div className="match-breakdown-body">
                    {loading && <p className="dim">Loading breakdown...</p>}

                    {!loading && error && (
                        <p className="lineup-error">{error}</p>
                    )}

                    {!loading && !error && players.length === 0 && (
                        <p className="dim">No per-player breakdown saved for this team in this match yet.</p>
                    )}

                    {!loading && !error && players.length > 0 && (
                        <div className="match-breakdown-list">
                            {players.map((row, index) => {
                                const batting = row?.breakdown?.batting || {};
                                const bowling = row?.breakdown?.bowling || {};
                                const fielding = row?.breakdown?.fielding || {};

                                return (
                                    <div key={`${row.player_name}-${index}`} className="match-breakdown-row">
                                        <div className="match-breakdown-row-top">
                                            <strong>{row.player_name}</strong>
                                            <span className="points-badge">{toNumber(row.points).toFixed(1)} pts</span>
                                        </div>
                                        <div className="match-breakdown-points-grid">
                                            <span>Bat: {toNumber(batting.runs) + toNumber(batting.fours) + toNumber(batting.sixes)}</span>
                                            <span>Bowl: {toNumber(bowling.economy) + toNumber(bowling.wickets)}</span>
                                            <span>Field: {toNumber(fielding.catches) + toNumber(fielding.stumpings) + toNumber(fielding.runouts)}</span>
                                        </div>
                                        <div className="match-breakdown-details">
                                            <span>Runs {toNumber(batting.runs).toFixed(1)}</span>
                                            <span>4s {toNumber(batting.fours).toFixed(1)}</span>
                                            <span>6s {toNumber(batting.sixes).toFixed(1)}</span>
                                            <span>Econ {toNumber(bowling.economy).toFixed(1)}</span>
                                            <span>Wkts {toNumber(bowling.wickets).toFixed(1)}</span>
                                            <span>Catches {toNumber(fielding.catches).toFixed(1)}</span>
                                            <span>Stumpings {toNumber(fielding.stumpings).toFixed(1)}</span>
                                            <span>Runouts {toNumber(fielding.runouts).toFixed(1)}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MatchBreakdownModal;
