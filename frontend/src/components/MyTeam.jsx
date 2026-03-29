import React from 'react';

const MyTeam = ({ mySquad, starting11, setStarting11, playersData = {}, lineupValidation, onReleasePlayer, onSaveLineup }) => {

    const getPlayerType = (playerName) => {
        const type = (playersData[playerName]?.playerType || '').toLowerCase();
        if (type === 'batsman' || type === 'bowler' || type === 'allrounder') return type;
        return 'batsman';
    };

    const formatPlayerType = (type) => {
        if (type === 'allrounder') return 'Allrounder';
        if (type === 'bowler') return 'Bowler';
        return 'Batsman';
    };

    const handleRelease = (playerName) => {
        onReleasePlayer(playerName);
    };

    const handleAdd11 = (playerName) => {
        if (starting11.length < 11 && !starting11.includes(playerName)) {
            setStarting11([...starting11, playerName]);
        }
    };

    const handleRemove11 = (playerName) => {
        setStarting11(starting11.filter(p => p !== playerName));
    };

    const handleMoveUp = (index) => {
        if (index > 0) {
            const new11 = [...starting11];
            [new11[index], new11[index - 1]] = [new11[index - 1], new11[index]];
            setStarting11(new11);
        }
    };

    const handleMoveDown = (index) => {
        if (index < starting11.length - 1) {
            const new11 = [...starting11];
            [new11[index], new11[index + 1]] = [new11[index + 1], new11[index]];
            setStarting11(new11);
        }
    };

    const counts = lineupValidation?.counts || { batsman: 0, bowler: 0, allrounder: 0 };
    const canSave = Boolean(lineupValidation?.isValid);

    return (
        <div className="side-panel">
            <div className="card my-squad">
                <h3>My Squad</h3>
                <div id="squad-list" className="mini-list">
                    {mySquad.map(playerName => (
                        <div key={playerName} className="squad-player">
                            <div>
                                <span>{playerName}</span>
                                <p className="player-type-label">{formatPlayerType(getPlayerType(playerName))}</p>
                            </div>
                            <div className="actions">
                                <button 
                                    className="btn btn-outline btn-xs" 
                                    onClick={() => handleAdd11(playerName)}
                                >
                                    + 11
                                </button>
                                <button 
                                    className="btn btn-outline btn-xs" 
                                    onClick={() => handleRelease(playerName)}
                                >
                                    ×
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            
            <div className="card starting-11">
                <h3>Starting 11</h3>
                <p className="hint">Need 4 batsmen, 4 bowlers, 2 allrounders + 1 flex player</p>
                <div className="lineup-type-grid">
                    <span className={`lineup-chip ${counts.batsman >= 4 ? 'met' : ''}`}>Batsmen: {counts.batsman}/4</span>
                    <span className={`lineup-chip ${counts.bowler >= 4 ? 'met' : ''}`}>Bowlers: {counts.bowler}/4</span>
                    <span className={`lineup-chip ${counts.allrounder >= 2 ? 'met' : ''}`}>Allrounders: {counts.allrounder}/2</span>
                </div>
                <div id="starting-list" className="mini-list">
                    {starting11.map((playerName, index) => (
                        <div key={playerName} className="squad-player">
                            <div className="reorder-actions">
                                <button className="btn-arrow move-up" onClick={() => handleMoveUp(index)}>▲</button>
                                <button className="btn-arrow move-down" onClick={() => handleMoveDown(index)}>▼</button>
                            </div>
                            <div>
                                <span>{index + 1}. {playerName}</span>
                                <p className="player-type-label">{formatPlayerType(getPlayerType(playerName))}</p>
                            </div>
                            <button className="btn btn-outline btn-xs remove-11-btn" onClick={() => handleRemove11(playerName)}>
                                Remove
                            </button>
                        </div>
                    ))}
                </div>
                {!canSave && lineupValidation?.errors?.length > 0 && (
                    <p className="lineup-error">{lineupValidation.errors[0]}</p>
                )}
                <button 
                    id="save-team-btn" 
                    className="btn btn-accent full-width"
                    onClick={onSaveLineup}
                    disabled={!canSave}
                >
                    Save Lineup
                </button>
            </div>
        </div>
    );
};

export default MyTeam;
