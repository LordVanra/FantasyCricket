import React from 'react';

const DraftPanel = ({ draftState, countdown, isMyTurn, currentUser, usersList }) => {
    if (!draftState || (!draftState.is_active && draftState.current_pick === 0)) {
        return null;
    }

    const turnOrder = draftState.turn_order || [];
    const totalPicks = turnOrder.length * 18;
    const isComplete = !draftState.is_active && draftState.current_pick >= totalPicks;
    const currentPickIndex = draftState.current_pick % Math.max(1, turnOrder.length);
    const currentTurnUserId = turnOrder[currentPickIndex];
    const currentTurnUser = usersList.find((u) => u.id === currentTurnUserId);

    let turnText = `Waiting for ${currentTurnUser?.username || 'Unknown'}...`;
    let turnClass = 'draft-turn-text';
    
    if (isComplete) {
        turnText = 'Draft Complete!';
    } else if (isMyTurn) {
        turnText = "🎯 It's YOUR turn! Pick a player!";
        turnClass += ' your-turn';
    }

    const timerPct = isComplete ? 100 : Math.max(0, (countdown / 30) * 100);
    const dangerClass = countdown <= 5 && !isComplete ? ' danger' : '';
    
    const recentPicks = (draftState.picks || []).slice(-5).reverse();

    return (
        <div id="draft-panel" className="card draft-panel">
            <div className="draft-header">
                <h3>🏏 Live Draft</h3>
                <span id="draft-pick-info" className="draft-pick-info">
                    {isComplete ? `${totalPicks} of ${totalPicks} picks made` : `Pick ${Math.min(draftState.current_pick + 1, totalPicks)} of ${totalPicks}`}
                </span>
            </div>
            <div className="draft-timer-bar">
                <div 
                    id="draft-timer-fill" 
                    className={`draft-timer-fill${dangerClass}`}
                    style={{ width: `${timerPct}%` }}
                ></div>
            </div>
            <div className="draft-turn-info">
                <span id="draft-turn-text" className={turnClass}>
                    {turnText}
                </span>
                <span id="draft-timer-text" className={`draft-timer-text${dangerClass}`}>
                    {isComplete ? '✔' : `${countdown}s`}
                </span>
            </div>
            <div id="draft-order-list" className="draft-order-list">
                {isComplete ? (
                    <div className="draft-complete-banner">
                        🏆 Draft Complete! All {totalPicks} players selected.
                    </div>
                ) : (
                    turnOrder.map((userId, idx) => {
                        const user = usersList.find((u) => u.id === userId);
                        const userPicks = (draftState.picks || []).filter((p) => p.user_id === userId).length;
                        return (
                            <span 
                                key={`${userId}-${idx}`} 
                                className={`draft-order-chip ${idx === currentPickIndex ? 'active' : ''} ${userId === currentUser?.id ? 'current-user' : ''}`}
                            >
                                {user?.username || '?'} ({userPicks})
                            </span>
                        );
                    })
                )}
            </div>
            {recentPicks.length > 0 && (
                <div className="recent-picks-section">
                    <h4 style={{ fontSize: '0.9rem', color: 'var(--text-dim)', marginBottom: '8px' }}>Recent Picks</h4>
                    <div className="recent-picks-list" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {recentPicks.map((pick, i) => {
                            const picker = usersList.find(u => u.id === pick.user_id);
                            return (
                                <div key={i} className="recent-pick-item" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '6px 10px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px' }}>
                                    <span>#{pick.pick_number + 1} <strong>{pick.player_id}</strong></span>
                                    <span style={{ color: 'var(--text-dim)' }}>{picker?.username || 'Unknown'}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export default DraftPanel;
