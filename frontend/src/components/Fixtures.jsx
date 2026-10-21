import React, { useEffect, useState } from 'react';
import api from '../api/api';
import MatchBreakdownModal from './MatchBreakdownModal';

const time = value => value ? new Date(value).toLocaleString() : 'Awaiting schedule';
function GameweekLineup({ week, squad, players, leagueId, onSaved }) {
    const [selected, setSelected] = useState(week.lineup || []);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const locked = Date.now() >= Date.parse(week.lock_at);
    const lineup = locked ? week.lineup : selected;
    return <div className="card">
        <h3>{locked ? 'Locked XI' : 'Your gameweek XI'} · {lineup.length}/11</h3>
        <p className="hint">{locked ? 'This lineup cannot change. Other gameweeks have separate lineups.' : 'Pick 4 batsmen, 4 bowlers, 2 allrounders and 1 extra player. Save before the deadline.'}</p>
        <div className="gameweek-lineup">
            {(locked ? lineup : squad).map(name => <label key={name}>
                <input type="checkbox" checked={lineup.includes(name)} disabled={locked || busy || (!selected.includes(name) && selected.length >= 11)}
                    onChange={() => setSelected(current => current.includes(name) ? current.filter(n => n !== name) : [...current, name])} />
                {name} <span className="hint">{players[name]?.team} · {players[name]?.playerType}</span>
            </label>)}
        </div>
        {locked && !lineup.length && <p role="status">No valid XI was saved before the deadline. This gameweek scores zero.</p>}
        {!locked && <button className="btn btn-primary" disabled={busy || selected.length !== 11} onClick={async () => {
            setBusy(true); setError('');
            try { await api.saveGameweekLineup(leagueId, week.number, selected); setError('Lineup saved.'); onSaved(); }
            catch(e) { setError(e.message); } finally { setBusy(false); }
        }}>{busy ? 'Saving…' : 'Save gameweek XI'}</button>}
        {error && <p role="status">{error}</p>}
    </div>;
}
export default function Fixtures({ currentLeague, currentUser, usersList, isCommissioner, onUpdateScoresTrigger }) {
    const [data,setData]=useState({matches:[],weeks:[],stats:{},squad:[]});
    const [loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(false);
    const [selected,setSelected]=useState(1),[count,setCount]=useState(14),[firstRound,setFirstRound]=useState(1),[refresh,setRefresh]=useState(0);
    const [modal,setModal]=useState(null);
    const leagueId=currentLeague?.id;
    useEffect(()=>{
        if(!leagueId) return;
        let stopped=false,timer;
        const load=async()=>{
            try {
                const [matches,weeks,stats,drafted]=await Promise.all([api.getFixtures(leagueId),api.getGameweeks(leagueId),api.getTournamentStats(),api.getDraftedPlayers(leagueId)]);
                if(!stopped){setData({matches,weeks,stats,squad:drafted.filter(p=>p.user_id===currentUser.id).map(p=>p.player_id)});setError('');setLoading(false);}
            } catch(e){if(!stopped){setError(e.message);setLoading(false);}}
            finally {if(!stopped)timer=setTimeout(load,30000);}
        };
        load();return()=>{stopped=true;clearTimeout(timer);};
    },[leagueId,currentUser?.id,refresh]);
    const reload=()=>{setRefresh(n=>n+1);onUpdateScoresTrigger?.();};
    const week=data.weeks.find(w=>w.number===selected) || data.weeks[0];
    const matches=week?data.matches.filter(m=>m.round_number===week.number):data.matches;
    const name=id=>usersList.find(u=>u.id===id)?.username || 'Unknown';
    const open=async(match,id)=>{
        setModal({match,teamName:name(id),loading:true});
        try {const breakdown=await api.getMatchTeamBreakdown(match.id,id);setModal({match,teamName:name(id),breakdown});}
        catch(e){setModal({match,teamName:name(id),error:e.message});}
    };
    return <section id="fixtures-view" className="tab-content gameweeks-view">
        <div className="card">
            <h2>Head-to-head gameweeks</h2>
            <p>One opponent. One match per IPL team. Gameweek 2 uses each IPL team's second match—even if a player missed its first.</p>
            <p className="hint">Rounds can overlap and last more or less than seven days. Each XI locks before the earliest match in its round. A missed appearance scores zero. Results update after the stats import; they are not ball-by-ball live.</p>
            <p className="hint">Win: 2 league points · Draw: 1 · Loss: 0. Ties in the table use net fantasy points.</p>
            {error && <p role="alert">{error}</p>}
            {loading && <p>Loading gameweeks…</p>}
            {!loading && !data.weeks.length && data.matches.length>0 && <p>These are fixtures from the previous scoring system. Existing results are preserved. A completed season cannot be replaced.</p>}
            {isCommissioner && !data.weeks.length && !data.matches.some(m=>m.status==='completed') && <form className="gameweek-setup" onSubmit={async e=>{
                e.preventDefault();setBusy(true);setError('');
                try {await api.createGameweeks(leagueId,count,firstRound);reload();}catch(e){setError(e.message);}finally{setBusy(false);}
            }}>
                <p>After the draft, everyone must save a valid XI on the dashboard. It becomes the starting lineup for each gameweek; members can edit future gameweeks separately.</p>
                <label>First IPL team round <input type="number" min="1" max="14" value={firstRound} onChange={e=>setFirstRound(Number(e.target.value))}/></label>
                <label>Number of gameweeks <input type="number" min="1" max={15-firstRound} value={count} onChange={e=>setCount(Number(e.target.value))}/></label>
                <button className="btn btn-primary" disabled={busy || !data.stats.schedule?.length}>{busy?'Creating…':'Create season'}</button>
                {!data.stats.schedule?.length && <p className="hint">Waiting for the competition schedule. Deadlines will use published IPL start times.</p>}
            </form>}
            {!!data.weeks.length && <label>Gameweek <select value={week?.number} onChange={e=>setSelected(Number(e.target.value))}>
                {data.weeks.map(w=><option key={w.number} value={w.number}>Gameweek {w.number} · IPL round {w.ipl_round} · {w.status}</option>)}
            </select></label>}
        </div>
        {week && <div className="card">
            <h3>Gameweek {week.number} · {week.status}</h3>
            <p>Lineup deadline: <strong>{time(week.lock_at)}</strong> (your local time)</p>
            <p>{week.completed_teams || 0}/{week.team_matches.length} IPL team results imported</p>
            <details><summary>Which IPL match counts for each team?</summary>
                <ul>{week.team_matches.map(m=><li key={m.team}><strong>{m.team}</strong>: match {week.ipl_round} · {time(m.startTime)} · <a href={m.url} target="_blank" rel="noreferrer">Scorecard</a></li>)}</ul>
            </details>
        </div>}
        <div className="card">
            <h3>{week?'Matchups':'Fixtures'}</h3>
            {week && !matches.some(m=>[m.team_a_id,m.team_b_id].includes(currentUser.id)) && <p>You have a bye this gameweek. No head-to-head league points are awarded.</p>}
            {!matches.length && <p>No matchups yet.</p>}
            {matches.map(m=><div key={m.id} className="match-card">
                <button className="match-team-btn" disabled={!['live','completed'].includes(m.status)} onClick={()=>open(m,m.team_a_id)}>{name(m.team_a_id)}</button>
                <div className="match-score">{m.status==='pending'?'—':m.team_a_score} : {m.status==='pending'?'—':m.team_b_score}<div className="match-status">{m.status}</div></div>
                <button className="match-team-btn" disabled={!['live','completed'].includes(m.status)} onClick={()=>open(m,m.team_b_id)}>{name(m.team_b_id)}</button>
            </div>)}
        </div>
        {week && <GameweekLineup key={leagueId+'-'+week.number} week={week} leagueId={leagueId} squad={data.squad} players={data.stats.players || {}} onSaved={reload}/>}
        <MatchBreakdownModal isOpen={!!modal} {...modal} onClose={()=>setModal(null)}/>
    </section>;
}
