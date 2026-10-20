import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../api/api';

export function useAuth() {
    const [user, setUser] = useState(null);
    const [league, setLeague] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const generation = useRef(0);
    const load = useCallback(async currentUser => {
        if (!currentUser) return null;
        const profile = await api.getUserProfile(currentUser.id);
        const leagues = await api.getLeagues();
        let selected = leagues.find(l => l.id === profile.league_id);
        if (selected) {
            const members = await api.getAllUsers(selected.id).catch(e => { if (e.status === 403) return null; throw e; });
            if (!members?.some(m => m.id === currentUser.id)) selected = null;
        }
        if (!selected) {
            selected = await api.getDefaultLeague();
            await api.ensureUserProfile(currentUser.id, currentUser.username, selected.id);
            selected = (await api.getLeagues()).find(l => l.id === selected.id);
        }
        return selected;
    }, []);
    const checkSession = useCallback(async () => {
        const version = ++generation.current;
        setLoading(true); setError('');
        try {
            const currentUser = await api.getUser();
            const selected = await load(currentUser);
            if (version !== generation.current) return;
            setUser(currentUser); setLeague(selected);
        } catch (e) {
            if (version === generation.current) setError(e.message);
        } finally {
            if (version === generation.current) setLoading(false);
        }
    }, [load]);
    useEffect(() => {
        checkSession();
        return () => { generation.current++; };
    }, [checkSession]);
    const signIn = async (username, password) => {
        const version = ++generation.current;
        const { data } = await api.signIn(`${username.toLowerCase().trim()}@fantasy-app.internal`, password);
        const selected = await load(data.user);
        if (version === generation.current) { setUser(data.user); setLeague(selected); setError(''); }
        return data.user;
    };
    const signUp = async (username, password) => {
        const { data } = await api.signUp(`${username.toLowerCase().trim()}@fantasy-app.internal`, password);
        return data.user;
    };
    const signOut = async () => {
        await api.signOut();
        generation.current++; setUser(null); setLeague(null); setError('');
    };
    const refreshLeague = async () => {
        if (!user) return;
        const version = ++generation.current;
        const selected = await load(user);
        if (version === generation.current) setLeague(selected);
    };
    return { user, league, loading, error, retry: checkSession, isCommissioner: Boolean(user && league?.commissioner_id === user.id), signIn, signUp, signOut, refreshLeague };
}
