import React from 'react';

const DraftPanel = ({ draftState, countdown, isMyTurn, currentUser, usersList }) => {
    if (!draftState || (!draftState.is_active && draftState.current_pick === 0)) {
        return null;
    }

    const isComplete = !draftState.is_active && draftState.current_pick >= 20;
    const turnOrder = draftState.turn_order || [];
    const currentPickIndex = draftState.current_pick % turnOrder.length;
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

    return (
        <div id="draft-panel" className="card draft-panel">
            <div className="draft-header">
                <h3>🏏 Live Draft</h3>
                <span id="draft-pick-info" className="draft-pick-info">
                    {isComplete ? '20 of 20 picks made' : `Pick ${Math.min(draftState.current_pick + 1, 20)} of 20`}
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
                        🏆 Draft Complete! All 20 players selected.
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
        </div>
    );
};

export default DraftPanel;
