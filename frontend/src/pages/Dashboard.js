import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { taskAPI, teamAPI } from '../services/api';

const Dashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    myTasks: 0,
    teams: 0,
    pendingTasks: 0,
    inProgressTasks: 0,
  });
  const [recentTasks, setRecentTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const [tasksRes, teamsRes] = await Promise.all([
        taskAPI.getMyTasks(),
        teamAPI.getAll(),
      ]);

      const tasks = tasksRes.data;
      const teams = teamsRes.data;

      setStats({
        myTasks: tasks.length,
        teams: teams.length,
        pendingTasks: tasks.filter(t => t.status === 'todo').length,
        inProgressTasks: tasks.filter(t => t.status === 'in_progress').length,
      });

      setRecentTasks(tasks.slice(0, 5));
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div>
      <h1>Dashboard</h1>
      <p>Welcome back, {user?.firstName}!</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginTop: '30px' }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <h3>My Tasks</h3>
          <p style={{ fontSize: '48px', fontWeight: 'bold', color: '#0066cc', margin: '10px 0' }}>
            {stats.myTasks}
          </p>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <h3>My Teams</h3>
          <p style={{ fontSize: '48px', fontWeight: 'bold', color: '#28a745', margin: '10px 0' }}>
            {stats.teams}
          </p>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <h3>Pending</h3>
          <p style={{ fontSize: '48px', fontWeight: 'bold', color: '#ffc107', margin: '10px 0' }}>
            {stats.pendingTasks}
          </p>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <h3>In Progress</h3>
          <p style={{ fontSize: '48px', fontWeight: 'bold', color: '#fd7e14', margin: '10px 0' }}>
            {stats.inProgressTasks}
          </p>
        </div>
      </div>

      <div className="card" style={{ marginTop: '30px' }}>
        <h2>Recent Tasks</h2>
        {recentTasks.length === 0 ? (
          <p>No tasks assigned to you yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Team</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Due Date</th>
              </tr>
            </thead>
            <tbody>
              {recentTasks.map(task => (
                <tr key={task.id}>
                  <td>{task.title}</td>
                  <td>{task.team_name}</td>
                  <td><span className={`badge badge-${task.status}`}>{task.status.replace('_', ' ')}</span></td>
                  <td><span className={`badge badge-${task.priority}`}>{task.priority}</span></td>
                  <td>{task.due_date ? new Date(task.due_date).toLocaleDateString() : 'N/A'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
