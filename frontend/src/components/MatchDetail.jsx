import React, { useEffect, useState } from 'react';
import api from '../api/api';
const date = v => new Date(v).toLocaleString();
const points = v => Number(v || 0).toFixed(1);
export default function MatchDetail({ match, week, name, onClose }) {
    const [teams, setTeams] = useState(null), [error, setError] = useState('');
    useEffect(() => {
        let stopped=false;
        setTeams(null); setError('');
        if (match.status === 'pending') return;
        Promise.all([match.team_a_id, match.team_b_id].map(id=>api.getMatchTeamBreakdown(match.id,id)))
            .then(rows=>{if(!stopped)setTeams(rows);}).catch(e=>{if(!stopped)setError(e.message);});
        return ()=>{stopped=true;};
    }, [match.id, match.status, match.team_a_score, match.team_b_score]);
    const end = week?.team_matches?.length ? Math.max(...week.team_matches.map(m=>Date.parse(m.startTime)))+4*3600000 : null;
    return <section className="tab-content match-detail">
        <button className="btn" onClick={onClose}>← Back to gameweeks</button>
        <div className="card">
            <h2>{name(match.team_a_id)} vs {name(match.team_b_id)}</h2>
            <p>Gameweek {match.round_number} · {match.status}</p>
            <h3>{points(match.team_a_score)} : {points(match.team_b_score)} points</h3>
            {week && <p>XI locks: {date(week.lock_at)}</p>}
            {end && <p>Expected finish: <strong>{date(end)}</strong> (your local time)</p>}
            <p className="hint">Times are local. Results update after scorecards are imported.</p>
            {match.finalized_at && <p>Finalized: {date(match.finalized_at)}</p>}
        </div>
        {match.status==='pending' ? <div className="card">Both starting XIs will appear when the gameweek locks. Managers can still change their lineups.</div> : error ? <p role="alert">{error}</p> : !teams ? <p>Loading starting XIs…</p> :
        <div className="match-detail-teams">{teams.map(team=><div className="card" key={team.user_id}>
            <h3>{name(team.user_id)} · {points(team.team_total)} pts</h3>
            <p>{team.players.length}/11 players</p>
            {!team.players.length && <p>No valid XI was saved for this matchup.</p>}
            {team.players.map(row=>{
                const stats=row.stats, b=stats?.batting, w=stats?.bowling, f=stats?.fielding;
                return <article className="match-player" key={row.player_name}>
                    <h4>{row.lineup_position ? `${row.lineup_position}. ` : ''}{row.player_name} <span className="points-badge">{points(row.points)} pts</span></h4>
                    <p className="hint">{row.team} · {row.appearance_status==='did_not_play'?'Did not play':row.appearance_status==='awaiting_result'?'Awaiting result': 'Played'} {row.match_url && <a href={row.match_url} target="_blank" rel="noreferrer">Scorecard</a>}</p>
                    {row.appearance_status==='awaiting_result' ? <p>Stats pending for this player's assigned IPL match.</p> : stats ? <>
                        <dl className="match-stats-grid">{[
                            ['Runs',b.runs],['Balls',b.balls],['SR',b.sr],['Fours',b.fours],['Sixes',b.sixes],
                            ...(Number(w.overs)>0 || Number(w.runs)>0 || Number(w.wickets)>0 ? [['Overs',w.overs],['Conceded',w.runs],['Economy',w.economy],['Wickets',w.wickets],['Maidens',w.maidens],['Dots',w.dots]] : []),
                            ['Catches',f.catches],['Stumpings',f.stumpings],['Runouts',f.runouts]
                        ].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
                    </> : <p className="hint">Detailed stats unavailable.</p>}
                    <details><summary>Points contribution</summary><dl className="points-contributions">
                        {Object.entries(row.breakdown || {}).flatMap(([category, values])=>Object.entries(values).map(([stat,value])=><React.Fragment key={category+stat}><dt>{category} · {stat}</dt><dd>{points(value)} pts</dd></React.Fragment>))}
                    </dl></details>
                </article>;
            })}
        </div>)}</div>}
    </section>;
}
