import React, { useState, useEffect } from 'react';
import api from '../api/api';

const Scoreboard = ({ currentLeague, refreshTrigger }) => {
    const [standings, setStandings] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const loadStandings = async () => {
            if (!currentLeague) return;
            setLoading(true);
            try {
                const data = await api.getLeagueStandings(currentLeague.id);
                setStandings(data);
            } catch (error) {
                console.error('Error loading standings:', error);
            } finally {
                setLoading(false);
            }
        };

        loadStandings();
    }, [currentLeague, refreshTrigger]);

    return (
        <section id="scoreboard-view" className="tab-content">
            <div className="card">
                <h3>League Table</h3>
                <div className="table-container">
                    <table className="w-full text-left">
                        <thead>
                            <tr>
                                <th>Pos</th>
                                <th>Team</th>
                                <th>P</th>
                                <th>W</th>
                                <th>L</th>
                                <th>D</th>
                                <th>Pts</th>
                                <th>Net Pts</th>
                            </tr>
                        </thead>
                        <tbody id="scoreboard-body">
                            {loading && (
                                <tr>
                                    <td colSpan="8" className="text-center">Loading...</td>
                                </tr>
                            )}
                            {!loading && standings.length === 0 && (
                                <tr>
                                    <td colSpan="8" className="text-center dim">No standings available</td>
                                </tr>
                            )}
                            {!loading && standings.map((team, index) => (
                                <tr key={team.user_id}>
                                    <td>{index + 1}</td>
                                    <td className="font-bold">{team.username}</td>
                                    <td>{team.played}</td>
                                    <td>{team.won}</td>
                                    <td>{team.lost}</td>
                                    <td>{team.drawn}</td>
                                    <td className="font-bold">{team.points}</td>
                                    <td className="text-sm dim">{(team.net_points || 0).toFixed(1)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </section>
    );
};

export default Scoreboard;
