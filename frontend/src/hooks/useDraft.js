import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../api/api';
import { useNotify } from './useNotify';

export function useDraft(leagueId, userId, onTimeout, options = {}) {
    const { instantAutoDraftFallback = false } = options;
    const [draftState, setDraftState] = useState(null);
    const [countdown, setCountdown] = useState(30);
    const [localAutoDraft, setLocalAutoDraft] = useState(instantAutoDraftFallback);
    const instantAutoDraftedPickRef = useRef(-1);
    const timedAutoDraftedPickRef = useRef(-1);
    const { notify } = useNotify();
    const hasServerAutoDraftMode = Boolean(draftState && Object.prototype.hasOwnProperty.call(draftState, 'auto_draft_user_ids'));
    const autoDraftUserIds = Array.isArray(draftState?.auto_draft_user_ids) ? draftState.auto_draft_user_ids : [];
    const instantAutoDraft = hasServerAutoDraftMode ? autoDraftUserIds.includes(userId) : localAutoDraft;

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
        const isTurnOnAutoDraft = hasServerAutoDraftMode
            ? autoDraftUserIds.includes(currentTurnUserId)
            : (localAutoDraft && currentTurnUserId === userId);

        if (isTurnOnAutoDraft) {
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

            // In server-backed per-user mode, only opted-in users auto-pick.
            // Users not in auto_draft_user_ids keep manual control.
            if (hasServerAutoDraftMode) {
                return;
            }

            if (remaining <= 0 && timedAutoDraftedPickRef.current !== currentPick) {
                timedAutoDraftedPickRef.current = currentPick;
                if (onTimeout) {
                    onTimeout(currentTurnUserId, currentPick, draftState, { mode: 'timer' });
                }
            }
        }, 500);

        return () => clearInterval(interval);
        }, [draftState, onTimeout, hasServerAutoDraftMode, autoDraftUserIds, localAutoDraft, userId]);

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

    const toggleAutoDraft = async () => {
        if (!leagueId || !draftState) return;
        const nextEnabled = !instantAutoDraft;

        if (hasServerAutoDraftMode) {
            try {
                await api.setUserAutoDraftMode(leagueId, userId, nextEnabled);
                notify(`Your auto draft ${nextEnabled ? 'enabled' : 'disabled'}.`, 'success');
            } catch (error) {
                notify('Failed to update your auto draft mode: ' + error.message, 'error');
            }
            return;
        }

        setLocalAutoDraft(nextEnabled);
        notify('Auto draft ' + (nextEnabled ? 'enabled' : 'disabled') + '.', 'success');
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
        autoDraftEnabled: instantAutoDraft,
        toggleAutoDraft,
        draftSquadSize: 22,
        startDraft,
        makePick
    };
}
