import React, { useEffect } from 'react';

const toInt = (value) => parseInt(value, 10) || 0;

const formatPlayerType = (type) => {
    const normalized = (type || '').toLowerCase();
    if (normalized === 'allrounder') return 'Allrounder';
    if (normalized === 'bowler') return 'Bowler';
    return 'Batsman';
};

const PlayerStatsModal = ({ playerName, player, onClose }) => {
    useEffect(() => {
        if (!playerName) return undefined;

        const handleEscape = (event) => {
            if (event.key === 'Escape') onClose();
        };

        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [playerName, onClose]);

    if (!playerName) return null;

    const batting = player?.batting || [];
    const bowling = player?.bowling || [];
    const fielding = player?.fielding || [];

    const averageStrikeRate = player && player.totalBalls > 0
        ? ((player.totalRuns / player.totalBalls) * 100).toFixed(2)
        : '0.00';

    const averageEconomy = player && player.totalOvers > 0
        ? (player.totalRunsConceded / player.totalOvers).toFixed(2)
        : '0.00';

    const totalCatches = fielding.reduce((sum, item) => sum + toInt(item.catches), 0);
    const totalRunouts = fielding.reduce((sum, item) => sum + toInt(item.runouts), 0);
    const totalStumpings = fielding.reduce((sum, item) => sum + toInt(item.stumpings), 0);

    return (
        <div className="player-stats-overlay" onClick={onClose}>
            <div className="player-stats-modal" onClick={(event) => event.stopPropagation()}>
                <div className="player-stats-header">
                    <div>
                        <h2>{playerName}</h2>
                        <p className="player-stats-subtitle">
                            {player?.team ? `${player.team} | ` : ''}
                            {formatPlayerType(player?.playerType)}
                            {player?.matches ? ` | ${player.matches.length} Matches` : ''}
                        </p>
                    </div>
                    <button type="button" className="player-stats-close" onClick={onClose}>
                        x
                    </button>
                </div>

                <div className="player-stats-body">
                    {!player && (
                        <p className="dim">No stats found for this player.</p>
                    )}

                    {player && batting.length > 0 && (
                        <section className="player-stats-section">
                            <h3>Batting Summary</h3>
                            <div className="player-stats-grid">
                                <div className="player-stat-card">
                                    <div className="label">Total Runs</div>
                                    <div className="value">{player.totalRuns}</div>
                                </div>
                                <div className="player-stat-card">
                                    <div className="label">Balls Faced</div>
                                    <div className="value">{player.totalBalls}</div>
                                </div>
                                <div className="player-stat-card">
                                    <div className="label">Fours</div>
                                    <div className="value">{player.totalFours}</div>
                                </div>
                                <div className="player-stat-card">
                                    <div className="label">Sixes</div>
                                    <div className="value">{player.totalSixes}</div>
                                </div>
                                <div className="player-stat-card">
                                    <div className="label">Strike Rate</div>
                                    <div className="value">{averageStrikeRate}</div>
                                </div>
                                <div className="player-stat-card">
                                    <div className="label">Innings</div>
                                    <div className="value">{batting.length}</div>
                                </div>
                            </div>
                        </section>
                    )}

                    {player && bowling.length > 0 && (
                        <section className="player-stats-section">
                            <h3>Bowling Summary</h3>
                            <div className="player-stats-grid">
                                <div className="player-stat-card">
                                    <div className="label">Wickets</div>
                                    <div className="value">{player.totalWickets}</div>
                                </div>
                                <div className="player-stat-card">
                                    <div className="label">Runs Conceded</div>
                                    <div className="value">{player.totalRunsConceded}</div>
                                </div>
                                <div className="player-stat-card">
                                    <div className="label">Overs</div>
                                    <div className="value">{Number(player.totalOvers || 0).toFixed(1)}</div>
                                </div>
                                <div className="player-stat-card">
                                    <div className="label">Economy</div>
                                    <div className="value">{averageEconomy}</div>
                                </div>
                                <div className="player-stat-card">
                                    <div className="label">Innings</div>
                                    <div className="value">{bowling.length}</div>
                                </div>
                            </div>
                        </section>
                    )}

                    {player && (totalCatches + totalRunouts + totalStumpings > 0) && (
                        <section className="player-stats-section">
                            <h3>Fielding Summary</h3>
                            <div className="player-stats-grid">
                                <div className="player-stat-card">
                                    <div className="label">Catches</div>
                                    <div className="value">{totalCatches}</div>
                                </div>
                                <div className="player-stat-card">
                                    <div className="label">Run Outs</div>
                                    <div className="value">{totalRunouts}</div>
                                </div>
                                <div className="player-stat-card">
                                    <div className="label">Stumpings</div>
                                    <div className="value">{totalStumpings}</div>
                                </div>
                            </div>
                        </section>
                    )}

                    {player && batting.length === 0 && bowling.length === 0 && (totalCatches + totalRunouts + totalStumpings === 0) && (
                        <p className="dim">This player has no match stats yet. They are currently a squad/bench player.</p>
                    )}

                    {player && (batting.length > 0 || bowling.length > 0) && (
                        <section className="player-stats-section">
                            <h3>Recent Performances</h3>
                            <div className="player-perf-list">
                                {batting.slice(-3).reverse().map((inning, index) => (
                                    <div className="player-perf-item" key={`bat-${index}`}>
                                        <span>Batting: {inning.runs} ({inning.balls})</span>
                                        <span>4s: {inning.fours} | 6s: {inning.sixes} | SR: {inning.sr}</span>
                                    </div>
                                ))}
                                {bowling.slice(-3).reverse().map((spell, index) => (
                                    <div className="player-perf-item" key={`bowl-${index}`}>
                                        <span>Bowling: {spell.overs} overs, {spell.wickets} wickets</span>
                                        <span>Runs: {spell.runs} | Econ: {spell.economy}</span>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PlayerStatsModal;
