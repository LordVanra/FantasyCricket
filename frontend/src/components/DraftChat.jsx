import React, { useEffect, useRef, useState } from 'react';
import api from '../api/api';

export default function DraftChat({ leagueId }) {
    const [messages, setMessages] = useState([]);
    const [text, setText] = useState('');
    const [error, setError] = useState('');
    const [refreshError, setRefreshError] = useState('');
    const [sending, setSending] = useState(false);
    const alive = useRef(true);
    const log = useRef(null);
    const nearBottom = useRef(true);
    useEffect(() => {
        alive.current = true;
        let stopped = false, timer;
        const refresh = async () => {
            try {
                if (!document.hidden) {
                    const next = await api.getDraftChat(leagueId);
                    if (!stopped) {
                        setMessages(previous => [...new Map([...previous, ...next].map(m => [m.id, m])).values()].sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(-100));
                        setRefreshError('');
                    }
                }
            } catch (e) { if (!stopped) setRefreshError('Chat could not refresh. Retrying…'); }
            finally { if (!stopped) timer = setTimeout(refresh, 4000); }
        };
        refresh();
        return () => { alive.current = false; stopped = true; clearTimeout(timer); };
    }, [leagueId]);
    useEffect(() => {
        if (nearBottom.current && log.current) log.current.scrollTop = log.current.scrollHeight;
    }, [messages]);
    const send = async event => {
        event.preventDefault();
        if (sending || !text.trim()) return;
        setSending(true); setError('');
        try {
            const message = await api.sendDraftChat(leagueId, text);
            if (alive.current) {
                setMessages(previous => [...previous.filter(m => m.id !== message.id), message].slice(-100));
                setText(''); nearBottom.current = true;
            }
        } catch (e) { if (alive.current) setError(e.message); }
        finally { if (alive.current) setSending(false); }
    };
    return <section className="card draft-chat" aria-label="Draft chat">
        <h3>Draft chat</h3>
        <p className="hint">Private to your league · Latest 100 messages · Updates every few seconds</p>
        <div className="draft-chat-log" role="log" aria-live="polite" aria-relevant="additions" ref={log}
            onScroll={() => { const el = log.current; nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; }}>
            {!messages.length && <p className="hint">Talk picks and plans with your league here.</p>}
            {messages.map(message => <div className="draft-chat-message" key={message.id}>
                <strong>{message.username}</strong>{' '}
                <time dateTime={message.created_at}>{new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
                <p>{message.message}</p>
            </div>)}
        </div>
        <form onSubmit={send} className="draft-chat-form">
            <label htmlFor="draft-chat-input" className="hint">Message your league</label>
            <textarea id="draft-chat-input" maxLength={1000} rows={2} value={text} disabled={sending}
                onChange={e => setText(e.target.value)} placeholder="Who are you picking?" />
            <div><span className="hint">{text.length}/1000</span><button type="submit" disabled={sending || !text.trim()}>{sending ? 'Sending…' : 'Send'}</button></div>
        </form>
        {(error || refreshError) && <p role="alert">{error || refreshError}</p>}
    </section>;
}
