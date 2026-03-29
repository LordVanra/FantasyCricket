import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../api/api';
import { useNotify } from './useNotify';

export function useDraft(leagueId, userId, onTimeout, options = {}) {
    const { instantAutoDraft = true } = options;
    const [draftState, setDraftState] = useState(null);
    const [countdown, setCountdown] = useState(30);
    const instantAutoDraftedPickRef = useRef(-1);
    const timedAutoDraftedPickRef = useRef(-1);
    const { notify } = useNotify();

    const fetchDraftState = useCallback(async () => {
        if (!leagueId) return;
        try {
            const state = await api.getDraftState(leagueId);
            setDraftState(state);
        } catch (error) {
            // No draft state yet, ignore
        }
    }, [leagueId]);

    useEffect(() => {
        fetchDraftState();
        if (!leagueId) return;

        const channel = api.subscribeToDraft(leagueId, (newState) => {
            setDraftState(newState);
        });

        return () => {
            api.unsubscribeFromDraft(channel);
        };
    }, [leagueId, fetchDraftState]);

    useEffect(() => {
        if (!draftState || !draftState.is_active) {
            instantAutoDraftedPickRef.current = -1;
            timedAutoDraftedPickRef.current = -1;
            setCountdown(30);
            return;
        }

        const turnOrder = draftState.turn_order || [];
        if (turnOrder.length === 0) return;

        const currentPick = draftState.current_pick;
        const currentPickIndex = currentPick % turnOrder.length;
        const currentTurnUserId = turnOrder[currentPickIndex];

        if (instantAutoDraft) {
            timedAutoDraftedPickRef.current = -1;
            setCountdown(0);

            if (instantAutoDraftedPickRef.current === currentPick) return;

            instantAutoDraftedPickRef.current = currentPick;

            if (onTimeout) {
                onTimeout(currentTurnUserId, currentPick, draftState, { mode: 'instant' });
            }
            return;
        }

        instantAutoDraftedPickRef.current = -1;

        const turnStartTime = new Date(draftState.turn_start_time).getTime();
        const TURN_DURATION = 30;

        const interval = setInterval(() => {
            const now = Date.now();
            const elapsed = (now - turnStartTime) / 1000;
            const remaining = Math.max(0, TURN_DURATION - elapsed);
            setCountdown(Math.ceil(remaining));

            if (remaining <= 0 && timedAutoDraftedPickRef.current !== currentPick) {
                timedAutoDraftedPickRef.current = currentPick;
                if (onTimeout) {
                    onTimeout(currentTurnUserId, currentPick, draftState, { mode: 'timer' });
                }
            }
        }, 500);

        return () => clearInterval(interval);
    }, [draftState, onTimeout, instantAutoDraft]);

    const startDraft = async (usersList) => {
        if (!leagueId) return false;
        const shuffled = [...usersList].sort(() => Math.random() - 0.5).map(u => u.id);
        if (shuffled.length < 2) {
            notify('Need at least 2 users in the league to start a draft', 'error');
            return false;
        }
        try {
            await api.clearLeagueSquads(leagueId);
            await api.startDraft(leagueId, shuffled);
            notify('Draft started! Existing squads were cleared.', 'success');
            return true;
        } catch (error) {
            notify('Failed to start draft: ' + error.message, 'error');
            return false;
        }
    };

    const makePick = async (playerId, playerName) => {
        if (!leagueId || !userId || !draftState?.is_active) return;
        if (!isMyTurn) {
            notify("It's not your turn!", 'error');
            return;
        }
        try {
            await api.makeDraftPick(leagueId, userId, playerId, draftState.current_pick);
            await api.draftPlayer(playerId, playerName, userId, leagueId);
            notify(`Drafted ${playerName}! (Pick ${draftState.current_pick + 1})`, 'success');
        } catch (error) {
            notify('Draft failed: ' + error.message, 'error');
            throw error;
        }
    };

    const isMyTurn = draftState?.is_active && draftState.turn_order && 
                     draftState.turn_order[draftState.current_pick % draftState.turn_order.length] === userId;

    return {
        draftState,
        countdown,
        isMyTurn,
        startDraft,
        makePick
    };
}
