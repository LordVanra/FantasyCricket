import React from 'react';

const MyTeam = ({ mySquad, starting11, setStarting11, onReleasePlayer, onSaveLineup }) => {

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

    return (
        <div className="side-panel">
            <div className="card my-squad">
                <h3>My Squad</h3>
                <div id="squad-list" className="mini-list">
                    {mySquad.map(playerName => (
                        <div key={playerName} className="squad-player">
                            <span>{playerName}</span>
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
                <p className="hint">Reorder for batting/bowling strategy</p>
                <div id="starting-list" className="mini-list">
                    {starting11.map((playerName, index) => (
                        <div key={playerName} className="squad-player">
                            <div className="reorder-actions">
                                <button className="btn-arrow move-up" onClick={() => handleMoveUp(index)}>▲</button>
                                <button className="btn-arrow move-down" onClick={() => handleMoveDown(index)}>▼</button>
                            </div>
                            <span>{index + 1}. {playerName}</span>
                            <button className="btn btn-outline btn-xs remove-11-btn" onClick={() => handleRemove11(playerName)}>
                                Remove
                            </button>
                        </div>
                    ))}
                </div>
                <button 
                    id="save-team-btn" 
                    className="btn btn-accent full-width"
                    onClick={onSaveLineup}
                    disabled={starting11.length === 0 || starting11.length > 11}
                >
                    Save Lineup
                </button>
            </div>
        </div>
    );
};

export default MyTeam;
