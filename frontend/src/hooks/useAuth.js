import { useState, useEffect, useCallback } from 'react';
import api from '../api/api';

export function useAuth() {
    const [user, setUser] = useState(null);
    const [league, setLeague] = useState(null);
    const [isCommissioner, setIsCommissioner] = useState(false);
    const [loading, setLoading] = useState(true);

    const loadUserLeague = useCallback(async (userId, retryCount = 0) => {
        try {
            const profile = await api.getUserProfile(userId);
            let currentLeague = null;
            if (profile && profile.league_id) {
                const leagues = await api.getLeagues();
                currentLeague = leagues.find((l) => l.id === profile.league_id) || null;
            }
            if (!currentLeague) {
                let defaultLeague = await api.getDefaultLeague();
                if (!defaultLeague) defaultLeague = await api.createDefaultLeague();
                currentLeague = defaultLeague;
                
                // Fetch the user object again to get the email, or just use the generated display name
                // Since we removed 'user' from dependencies to avoid infinite loops
                const displayUsername = `user_${userId.substring(0,5)}`;
                await api.ensureUserProfile(userId, displayUsername, defaultLeague.id);
            }
            setLeague(currentLeague);
            setIsCommissioner(currentLeague.commissioner_id === userId);
        } catch (error) {
            console.error('Failed to load user league:', error);
            if (retryCount < 2) {
                // Retry in case of transient error
                setTimeout(() => loadUserLeague(userId, retryCount + 1), 1000);
            }
        }
    }, []);

    const checkSession = useCallback(async () => {
        setLoading(true);
        try {
            const currentUser = await api.getUser();
            setUser(currentUser);
            if (currentUser) {
                await loadUserLeague(currentUser.id);
            } else {
                setLeague(null);
                setIsCommissioner(false);
            }
        } catch (error) {
            console.error('Session check failed:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        checkSession();
    }, [checkSession]);

    const getDummyEmail = (username) => `${username.toLowerCase().trim()}@fantasy-app.internal`;

    const signIn = async (username, password) => {
        const dummyEmail = getDummyEmail(username);
        const res = await api.signIn(dummyEmail, password);
        if (res.error) throw res.error;
        setUser(res.data.user);
        await loadUserLeague(res.data.user.id);
        return res.data.user;
    };

    const signUp = async (username, password) => {
        const dummyEmail = getDummyEmail(username);
        const res = await api.signUp(dummyEmail, password);
        if (res.error) throw res.error;
        
        try {
            const newUser = res.data.user;
            if (newUser) {
                let defaultLeague = await api.getDefaultLeague();
                if (!defaultLeague) defaultLeague = await api.createDefaultLeague();
                await api.ensureUserProfile(newUser.id, username, defaultLeague.id);
            }
        } catch (_) {
            // Ignore failure to create profile, will retry on login
        }
        return res.data.user;
    };

    const signOut = async () => {
        await api.signOut();
        setUser(null);
        setLeague(null);
        setIsCommissioner(false);
    };

    const refreshLeague = async () => {
        if (user) await loadUserLeague(user.id);
    };

    return {
        user,
        league,
        isCommissioner,
        loading,
        signIn,
        signUp,
        signOut,
        refreshLeague,
    };
}
