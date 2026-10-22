import React, { useEffect, useState } from 'react';
import api from '../api/api';
import MatchDetail from './MatchDetail';

const time = value => value ? new Date(value).toLocaleString() : 'Awaiting schedule';
export default function Fixtures({ currentLeague, currentUser, usersList, isCommissioner, onUpdateScoresTrigger }) {
    const [data,setData]=useState({matches:[],weeks:[],stats:{},squad:[]});
    const [loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(false);
    const [selected,setSelected]=useState(1),[count,setCount]=useState(14),[firstRound,setFirstRound]=useState(1),[refresh,setRefresh]=useState(0);
    const [modal,setModal]=useState(null);
    const [historical,setHistorical]=useState(false);
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
    const open=match=>setModal(match);
    if(modal) return <MatchDetail match={data.matches.find(m=>m.id===modal.id) || modal} week={data.weeks.find(w=>w.number===modal.round_number)} name={name} onClose={()=>setModal(null)}/>;
    return <section id="fixtures-view" className="tab-content gameweeks-view">
        <div className="card">
            <h2>Head-to-head gameweeks</h2>
            <p>One opponent. One match per IPL team. Gameweek 2 uses each IPL team's second match—even if a player missed its first.</p>
            <p className="hint">Rounds can overlap and last more or less than seven days. Your dashboard XI is saved for each matchup when its round begins. A missed appearance scores zero. Results update after the stats import; they are not ball-by-ball live.</p>
            <p className="hint">Win: 2 league points · Draw: 1 · Loss: 0. Ties in the table use net fantasy points.</p>
            {error && <p role="alert">{error}</p>}
            {loading && <p>Loading gameweeks…</p>}
            {!loading && !data.weeks.length && data.matches.length>0 && <p>These are fixtures from the previous scoring system. Existing results are preserved. A completed season cannot be replaced.</p>}
            {isCommissioner && !data.weeks.length && !data.matches.some(m=>m.status==='completed') && <form className="gameweek-setup" onSubmit={async e=>{
                e.preventDefault();setBusy(true);setError('');
                try {await api.createGameweeks(leagueId,count,firstRound,historical);reload();}catch(e){setError(e.message);}finally{setBusy(false);}
            }}>
                <p>Missing XIs are generated from draft order, respecting role requirements. Saved XIs are kept. Squads need at least 4 batsmen, 4 bowlers and 2 allrounders.</p>
                <label><input type="checkbox" checked={historical} onChange={e=>setHistorical(e.target.checked)}/> Use historical results (past rounds lock and score immediately)</label>
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
            <p>Expected finish: <strong>{time(new Date(Math.max(...week.team_matches.map(m=>Date.parse(m.startTime)))+4*3600000).toISOString())}</strong> · estimate; results finalize after all scorecards are imported.</p>
            <p>{week.completed_teams || 0}/{week.team_matches.length} IPL team results imported</p>
            <details><summary>Which IPL match counts for each team?</summary>
                <ul>{week.team_matches.map(m=><li key={m.team}><strong>{m.team}</strong>: match {week.ipl_round} · {time(m.startTime)} · <a href={m.url} target="_blank" rel="noreferrer">Scorecard</a></li>)}</ul>
            </details>
        </div>}
        <div className="card">
            <h3>{week?'Matchups':'Fixtures'}</h3>
            {week && !matches.some(m=>[m.team_a_id,m.team_b_id].includes(currentUser.id)) && <p>You have a bye this gameweek. No head-to-head league points are awarded.</p>}
            {!matches.length && <p>No matchups yet.</p>}
            {matches.map(m=><button type="button" key={m.id} className="match-card matchup-link" onClick={()=>open(m)}>
                <strong>{name(m.team_a_id)}</strong>
                <div className="match-score">{m.status==='pending'?'—':m.team_a_score} : {m.status==='pending'?'—':m.team_b_score}<div className="match-status">{m.status} · View both XIs →</div>
                <small>{m.finalized_at ? `Finalized ${time(m.finalized_at)}` : week ? `Expected finish ${time(new Date(Math.max(...week.team_matches.map(t=>Date.parse(t.startTime)))+4*3600000).toISOString())}` : 'Finish date unavailable'}</small></div>
                <strong>{name(m.team_b_id)}</strong>
            </button>)}
        </div>
    </section>;
}
