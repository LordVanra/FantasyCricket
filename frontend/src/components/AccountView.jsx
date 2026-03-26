import React, { useState } from 'react';
import api from '../api/api';
import { useNotify } from '../hooks/useNotify';

const AccountView = ({ currentUser, onAccountDeleted }) => {
    const [currentPw, setCurrentPw] = useState('');
    const [newPw, setNewPw] = useState('');
    const [confirmPw, setConfirmPw] = useState('');
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteInput, setDeleteInput] = useState('');
    const { notify } = useNotify();

    const handlePasswordChange = async (e) => {
        e.preventDefault();
        if (newPw !== confirmPw) return notify('New passwords do not match', 'error');
        try {
            await api.changePassword(newPw);
            notify('Password updated successfully', 'success');
            setCurrentPw('');
            setNewPw('');
            setConfirmPw('');
        } catch (error) {
            notify('Error updating password: ' + error.message, 'error');
        }
    };

    const handleDelete = async () => {
        if (deleteInput.toUpperCase() !== 'DELETE') return;
        try {
            await api.deleteAccount(currentUser.id);
            setShowDeleteModal(false);
            onAccountDeleted();
        } catch (error) {
            notify('Failed to delete account: ' + error.message, 'error');
        }
    };

    return (
        <section id="account-view" className="view tab-content">
            <div className="account-layout">
                <div className="card account-card">
                    <h3>Change Password</h3>
                    <p className="dim">Update your account password</p>
                    <form onSubmit={handlePasswordChange}>
                        <div className="form-group">
                            <label htmlFor="new-password-input">New Password</label>
                            <input 
                                type="password" 
                                id="new-password-input" 
                                required 
                                placeholder="********" 
                                value={newPw}
                                onChange={(e) => setNewPw(e.target.value)}
                            />
                        </div>
                        <div className="form-group">
                            <label htmlFor="confirm-new-password-input">Confirm New Password</label>
                            <input 
                                type="password" 
                                id="confirm-new-password-input" 
                                required 
                                placeholder="********" 
                                value={confirmPw}
                                onChange={(e) => setConfirmPw(e.target.value)}
                            />
                        </div>
                        <button type="submit" className="btn btn-primary">Update Password</button>
                    </form>
                </div>
                
                <div className="card danger-zone-card">
                    <h3>Danger Zone</h3>
                    <p className="dim">Once you delete your account, there is no going back. All your data including your squad, trades, and league memberships will be permanently removed.</p>
                    <button className="btn btn-danger-glow" onClick={() => setShowDeleteModal(true)}>
                        Delete Account
                    </button>
                </div>
            </div>

            {showDeleteModal && (
                <div id="delete-confirm-modal" className="modal-overlay">
                    <div className="modal-dialog danger-modal">
                        <h3>Delete Account</h3>
                        <p>This action is <strong>permanent</strong> and cannot be undone. All your data will be erased.</p>
                        <p className="confirm-prompt">Type <strong>DELETE</strong> to confirm:</p>
                        <input 
                            type="text" 
                            id="delete-confirm-input" 
                            placeholder="Type DELETE here" 
                            autoComplete="off"
                            value={deleteInput}
                            onChange={(e) => setDeleteInput(e.target.value)}
                        />
                        <div className="modal-actions">
                            <button className="btn btn-outline" onClick={() => {
                                setShowDeleteModal(false);
                                setDeleteInput('');
                            }}>
                                Cancel
                            </button>
                            <button 
                                className={`btn btn-danger-glow ${deleteInput.toUpperCase() === 'DELETE' ? 'pulse-danger' : ''}`} 
                                disabled={deleteInput.toUpperCase() !== 'DELETE'}
                                onClick={handleDelete}
                            >
                                Confirm Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
};

export default AccountView;
