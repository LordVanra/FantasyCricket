import React, { useState } from 'react';
import api from '../api/api';
import { useNotify } from '../hooks/useNotify';

const TradeCenter = ({ currentUser, usersList, mySquad, draftedPlayers, pendingTrades, onPlayerClick, onTradeUpdate }) => {
    const [receiverId, setReceiverId] = useState('');
    const [giveSelected, setGiveSelected] = useState([]);
    const [requestSelected, setRequestSelected] = useState([]);
    const { notify } = useNotify();

    const receiverPlayers = receiverId 
        ? draftedPlayers.filter(dp => dp.user_id === receiverId).map(dp => dp.player_name) 
        : [];

    const handleProposeTrade = async () => {
        if (!receiverId || giveSelected.length === 0 || requestSelected.length === 0) {
            return notify('Select a user and at least one player on each side', 'error');
        }
        try {
            await api.proposeTrade(currentUser.id, receiverId, giveSelected, requestSelected);
            notify('Trade proposed!', 'success');
            setReceiverId('');
            setGiveSelected([]);
            setRequestSelected([]);
            onTradeUpdate();
        } catch (error) {
            notify(error.message, 'error');
        }
    };

    const handleTradeAction = async (tradeId, action) => {
        try {
            if (action === 'accept') {
                await api.swapPlayers(tradeId);
                notify('Trade accepted! Players swapped.', 'success');
            } else if (action === 'decline') {
                await api.updateTradeStatus(tradeId, 'declined');
            } else if (action === 'cancel') {
                await api.updateTradeStatus(tradeId, 'cancelled');
            }
            onTradeUpdate();
        } catch (error) {
            notify(`Trade action failed: ${error.message}`, 'error');
        }
    };

    return (
        <section id="trade-view" className="view tab-content">
            <div className="trade-layout">
                <div className="card trade-proposal">
                    <h3>Propose a Trade</h3>
                    <p className="hint click-stats-hint">Click any player name to view full stats.</p>
                    
                    <div className="form-group">
                        <label>Select Other User</label>
                        <select 
                            id="trade-receiver-select" 
                            value={receiverId} 
                            onChange={(e) => {
                                setReceiverId(e.target.value);
                                setRequestSelected([]); // Reset requested players
                            }}
                        >
                            <option value="">Select User</option>
                            {usersList.filter(u => u.id !== currentUser.id).map(user => (
                                <option key={user.id} value={user.id}>{user.username}</option>
                            ))}
                        </select>
                    </div>
                    
                    <div className="form-group">
                        <label>Give (Your Players)</label>
                        <div className="trade-chips">
                            {giveSelected.map(name => (
                                <span key={name} className="player-chip">
                                    <button
                                        type="button"
                                        className="player-link-btn chip-player-link"
                                        onClick={() => onPlayerClick?.(name)}
                                    >
                                        {name}
                                    </button>
                                    <span className="remove-chip" onClick={() => setGiveSelected(giveSelected.filter(n => n !== name))}>×</span>
                                </span>
                            ))}
                        </div>
                        <div className="trade-player-list">
                            {mySquad.length === 0 ? <p className="dim">No players available</p> : null}
                            {mySquad.map(name => (
                                <div 
                                    key={name} 
                                    className={`trade-player-row ${giveSelected.includes(name) ? 'selected' : ''}`}
                                    onClick={() => {
                                        if (giveSelected.includes(name)) setGiveSelected(giveSelected.filter(n => n !== name));
                                        else setGiveSelected([...giveSelected, name]);
                                    }}
                                >
                                    <button
                                        type="button"
                                        className="player-link-btn"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            onPlayerClick?.(name);
                                        }}
                                    >
                                        {name}
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                    
                    <div className="form-group">
                        <label>Request (Their Players)</label>
                        <div className="trade-chips">
                            {requestSelected.map(name => (
                                <span key={name} className="player-chip">
                                    <button
                                        type="button"
                                        className="player-link-btn chip-player-link"
                                        onClick={() => onPlayerClick?.(name)}
                                    >
                                        {name}
                                    </button>
                                    <span className="remove-chip" onClick={() => setRequestSelected(requestSelected.filter(n => n !== name))}>×</span>
                                </span>
                            ))}
                        </div>
                        <div className="trade-player-list">
                            {receiverId && receiverPlayers.length === 0 ? <p className="dim">No players available</p> : null}
                            {!receiverId && <p className="dim">Select a user first</p>}
                            {receiverPlayers.map(name => (
                                <div 
                                    key={name} 
                                    className={`trade-player-row ${requestSelected.includes(name) ? 'selected' : ''}`}
                                    onClick={() => {
                                        if (requestSelected.includes(name)) setRequestSelected(requestSelected.filter(n => n !== name));
                                        else setRequestSelected([...requestSelected, name]);
                                    }}
                                >
                                    <button
                                        type="button"
                                        className="player-link-btn"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            onPlayerClick?.(name);
                                        }}
                                    >
                                        {name}
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                    
                    <button id="propose-trade-btn" className="btn btn-primary" onClick={handleProposeTrade}>
                        Propose Trade
                    </button>
                </div>
                
                <div className="card trade-active">
                    <h3>Pending Trades</h3>
                    <div id="pending-trades-list" className="mini-list">
                        {pendingTrades.length === 0 ? <p className="dim">No active proposals</p> : null}
                        {pendingTrades.map(trade => {
                            const isSender = trade.sender_id === currentUser.id;
                            const otherUser = usersList.find(u => u.id === (isSender ? trade.receiver_id : trade.sender_id));
                            const offered = trade.players_offered || [trade.player_offered];
                            const requested = trade.players_requested || [trade.player_requested];
                            
                            return (
                                <div key={trade.id} className={`trade-item card ${trade.status}`}>
                                    <div className="trade-info">
                                        <p><b>{isSender ? 'You' : (otherUser ? otherUser.username : 'Unknown')}</b> offered:</p>
                                        <p className="trade-players-list">
                                            {offered.map((name, index) => (
                                                <React.Fragment key={`${trade.id}-offered-${name}-${index}`}>
                                                    <button
                                                        type="button"
                                                        className="player-link-btn trade-player-link"
                                                        onClick={() => onPlayerClick?.(name)}
                                                    >
                                                        {name}
                                                    </button>
                                                    {index < offered.length - 1 ? ', ' : ''}
                                                </React.Fragment>
                                            ))}
                                        </p>
                                        <p>For:</p>
                                        <p className="trade-players-list">
                                            {requested.map((name, index) => (
                                                <React.Fragment key={`${trade.id}-requested-${name}-${index}`}>
                                                    <button
                                                        type="button"
                                                        className="player-link-btn trade-player-link"
                                                        onClick={() => onPlayerClick?.(name)}
                                                    >
                                                        {name}
                                                    </button>
                                                    {index < requested.length - 1 ? ', ' : ''}
                                                </React.Fragment>
                                            ))}
                                        </p>
                                        <p className={`status-tag ${trade.status}`}>{trade.status.toUpperCase()}</p>
                                    </div>
                                    {!isSender && trade.status === 'pending' && (
                                        <div className="trade-actions">
                                            <button className="btn btn-primary btn-xs accept-trade" onClick={() => handleTradeAction(trade.id, 'accept')}>Accept</button>
                                            <button className="btn btn-outline btn-xs decline-trade" onClick={() => handleTradeAction(trade.id, 'decline')}>Decline</button>
                                        </div>
                                    )}
                                    {isSender && trade.status === 'pending' && (
                                        <button className="btn btn-outline btn-xs cancel-trade" onClick={() => handleTradeAction(trade.id, 'cancel')}>Cancel</button>
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

export default TradeCenter;
