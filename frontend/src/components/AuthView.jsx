import React, { useState } from 'react';
import { useNotify } from '../hooks/useNotify';

const AuthView = ({ authData }) => {
    const [isSignUp, setIsSignUp] = useState(false);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const { notify } = useNotify();

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (isSignUp) {
                if (password !== confirmPassword) {
                    throw new Error('Passwords do not match!');
                }
                await authData.signUp(username, password);
                notify('Account created! You can now Sign In.', 'success');
                setIsSignUp(false); // Switch to sign in view
            } else {
                await authData.signIn(username, password);
            }
        } catch (error) {
            notify(error.message, 'error');
        }
    };

    return (
        <section id="auth-view" className="view">
            <div className="auth-card">
                <h2 id="auth-title">{isSignUp ? 'Create Account' : 'Welcome Back'}</h2>
                <form id="auth-form" onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label htmlFor="username">Username</label>
                        <input
                            type="text"
                            id="username"
                            required
                            placeholder="cricket_fan_123"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                        />
                    </div>
                    <div className="form-group">
                        <label htmlFor="password">Password</label>
                        <input
                            type="password"
                            id="password"
                            required
                            placeholder="********"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>
                    {isSignUp && (
                        <div className="form-group" id="confirm-password-group">
                            <label htmlFor="confirm-password">Confirm Password</label>
                            <input
                                type="password"
                                id="confirm-password"
                                required
                                placeholder="********"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                            />
                        </div>
                    )}
                    <button type="submit" id="auth-submit" className="btn btn-primary">
                        {isSignUp ? 'Sign Up' : 'Sign In'}
                    </button>
                </form>
                <p className="auth-toggle">
                    <span id="toggle-text">
                        {isSignUp ? 'Already have an account?' : "Don't have an account?"}
                    </span>{' '}
                    <a
                        href="#"
                        id="toggle-auth"
                        onClick={(e) => {
                            e.preventDefault();
                            setIsSignUp(!isSignUp);
                        }}
                    >
                        {isSignUp ? 'Sign In' : 'Sign Up'}
                    </a>
                </p>
            </div>
        </section>
    );
};

export default AuthView;
