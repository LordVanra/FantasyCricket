import React from 'react';

const Navbar = ({ authData }) => {
    const { user, league, signOut } = authData;

    const displayUsername = user ? user.email.split('@')[0] : '';

    return (
        <nav className="navbar">
            <div className="nav-container">
                <h1 className="logo">FANTASY <span className="accent">CRICKET</span></h1>
                <div id="auth-status" className="auth-group">
                    {user && (
                        <>
                            <span id="league-badge" className="league-badge-nav">
                                {league ? league.name : 'Loading...'}
                            </span>
                            <span id="user-email">{displayUsername}</span>
                            <button
                                id="logout-btn"
                                className="btn btn-outline"
                                onClick={signOut}
                            >
                                Logout
                            </button>
                        </>
                    )}
                </div>
            </div>
        </nav>
    );
};

export default Navbar;
