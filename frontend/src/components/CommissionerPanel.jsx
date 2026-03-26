import React, { useState, useEffect } from 'react';
import api from '../api/api';
import { useNotify } from '../hooks/useNotify';

const CommissionerPanel = ({ isCommissioner, currentLeague, currentUser, onLeagueChange }) => {
    const [members, setMembers] = useState([]);
    const [loading, setLoading] = useState(false);
    const { notify } = useNotify();

    const loadMembers = async () => {
        if (!currentLeague || !isCommissioner) return;
        setLoading(true);
        try {
            const data = await api.getAllUsers(currentLeague.id);
            setMembers(data);
        } catch (error) {
            notify('Error loading members: ' + error.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadMembers();
    }, [currentLeague, isCommissioner]);

    const handleKick = async (memberId) => {
        if (!window.confirm('Kick this member from the league?')) return;
        try {
            await api.kickMember(memberId, currentLeague.id);
            notify('Member kicked.', 'success');
            loadMembers(); // reload
        } catch (error) {
            notify('Failed to kick: ' + error.message, 'error');
        }
    };

    const handleTransfer = async (memberId) => {
        if (!window.confirm('Transfer commissioner role to this member? You will lose commissioner access.')) return;
        try {
            await api.transferCommissioner(currentLeague.id, memberId);
            notify('Commissioner role transferred.', 'success');
            onLeagueChange(currentLeague.id); // Triggers re-fetch of league data & drops auth privileges
        } catch (error) {
            notify('Failed to transfer: ' + error.message, 'error');
        }
    };

    if (!isCommissioner) return null;

    return (
        <section id="commissioner-view" className="tab-content">
            <div className="card">
                <div className="card-header">
                    <h3>Commissioner Panel</h3>
                </div>
                <div id="commissioner-members-list" className="mini-list">
                    {loading && <p className="dim">Loading members...</p>}
                    {!loading && members.length === 0 && <p className="dim">No members found.</p>}
                    {!loading && members.map((member) => {
                        const isSelf = member.id === currentUser?.id;
                        const isCurrentCommissioner = member.id === currentLeague?.commissioner_id;

                        return (
                            <div key={member.id} className="league-item">
                                <div className="league-info">
                                    <h4>
                                        {member.username || member.email || member.id}{' '}
                                        {isCurrentCommissioner && <span className="badge">Commissioner</span>}
                                    </h4>
                                </div>
                                {!isSelf ? (
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                        <button 
                                            className="btn btn-outline btn-xs transfer-btn" 
                                            onClick={() => handleTransfer(member.id)}
                                        >
                                            Make Commissioner
                                        </button>
                                        <button 
                                            className="btn btn-error btn-xs kick-btn" 
                                            onClick={() => handleKick(member.id)}
                                        >
                                            Kick
                                        </button>
                                    </div>
                                ) : (
                                    <span className="dim text-sm">You</span>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
};

export default CommissionerPanel;
