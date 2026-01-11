import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { taskAPI, teamAPI } from '../services/api';
import './Dashboard.css';

const Dashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    myTasks: 0,
    teams: 0,
    pendingTasks: 0,
    inProgressTasks: 0,
    inReviewTasks: 0,
    doneTasks: 0,
    highPriority: 0,
    mediumPriority: 0,
    lowPriority: 0,
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
        inReviewTasks: tasks.filter(t => t.status === 'in_review').length,
        doneTasks: tasks.filter(t => t.status === 'done').length,
        highPriority: tasks.filter(t => t.priority === 'high' || t.priority === 'critical').length,
        mediumPriority: tasks.filter(t => t.priority === 'medium').length,
        lowPriority: tasks.filter(t => t.priority === 'low').length,
      });

      setRecentTasks(tasks.slice(0, 6));
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'todo': return '📋';
      case 'in_progress': return '⚙️';
      case 'in_review': return '👀';
      case 'done': return '✅';
      default: return '📌';
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high': return '#dc3545';
      case 'medium': return '#ffc107';
      case 'low': return '#28a745';
      default: return '#6c757d';
    }
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1>Dashboard</h1>
        <p className="welcome-text">Welcome back, {user?.firstName}! 👋</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card stat-tasks">
          <div className="stat-icon">📝</div>
          <div className="stat-info">
            <h3>My Tasks</h3>
            <p className="stat-number">{stats.myTasks}</p>
          </div>
        </div>
        <div className="stat-card stat-teams">
          <div className="stat-icon">👥</div>
          <div className="stat-info">
            <h3>My Teams</h3>
            <p className="stat-number">{stats.teams}</p>
          </div>
        </div>
        <div className="stat-card stat-pending">
          <div className="stat-icon">⏳</div>
          <div className="stat-info">
            <h3>Pending</h3>
            <p className="stat-number">{stats.pendingTasks}</p>
          </div>
        </div>
        <div className="stat-card stat-progress">
          <div className="stat-icon">🚀</div>
          <div className="stat-info">
            <h3>In Progress</h3>
            <p className="stat-number">{stats.inProgressTasks}</p>
          </div>
        </div>
      </div>

      <div className="charts-section">
        <div className="chart-card">
          <h3>Task Status Distribution</h3>
          <div className="bar-chart">
            <div className="bar-group">
              <div className="bar-container">
                <div 
                  className="bar bar-todo" 
                  style={{ height: `${stats.myTasks > 0 ? (stats.pendingTasks / stats.myTasks) * 100 : 0}%` }}
                >
                  <span className="bar-value">{stats.pendingTasks}</span>
                </div>
                <span className="bar-label">To Do</span>
              </div>
              <div className="bar-container">
                <div 
                  className="bar bar-progress" 
                  style={{ height: `${stats.myTasks > 0 ? (stats.inProgressTasks / stats.myTasks) * 100 : 0}%` }}
                >
                  <span className="bar-value">{stats.inProgressTasks}</span>
                </div>
                <span className="bar-label">In Progress</span>
              </div>
              <div className="bar-container">
                <div 
                  className="bar bar-review" 
                  style={{ height: `${stats.myTasks > 0 ? (stats.inReviewTasks / stats.myTasks) * 100 : 0}%` }}
                >
                  <span className="bar-value">{stats.inReviewTasks}</span>
                </div>
                <span className="bar-label">In Review</span>
              </div>
              <div className="bar-container">
                <div 
                  className="bar bar-done" 
                  style={{ height: `${stats.myTasks > 0 ? (stats.doneTasks / stats.myTasks) * 100 : 0}%` }}
                >
                  <span className="bar-value">{stats.doneTasks}</span>
                </div>
                <span className="bar-label">Done</span>
              </div>
            </div>
          </div>
        </div>

        <div className="chart-card">
          <h3>Priority Breakdown</h3>
          <div className="donut-chart">
            <svg viewBox="0 0 100 100" className="donut">
              {stats.myTasks > 0 ? (
                <>
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="none"
                    stroke="#dc3545"
                    strokeWidth="20"
                    strokeDasharray={`${(stats.highPriority / stats.myTasks) * 251.2} 251.2`}
                    transform="rotate(-90 50 50)"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="none"
                    stroke="#ffc107"
                    strokeWidth="20"
                    strokeDasharray={`${(stats.mediumPriority / stats.myTasks) * 251.2} 251.2`}
                    strokeDashoffset={`-${(stats.highPriority / stats.myTasks) * 251.2}`}
                    transform="rotate(-90 50 50)"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="none"
                    stroke="#28a745"
                    strokeWidth="20"
                    strokeDasharray={`${(stats.lowPriority / stats.myTasks) * 251.2} 251.2`}
                    strokeDashoffset={`-${((stats.highPriority + stats.mediumPriority) / stats.myTasks) * 251.2}`}
                    transform="rotate(-90 50 50)"
                  />
                  <text x="50" y="50" textAnchor="middle" dy="7" fontSize="20" fill="#333" fontWeight="bold">
                    {stats.myTasks}
                  </text>
                </>
              ) : (
                <text x="50" y="50" textAnchor="middle" dy="7" fontSize="12" fill="#999">
                  No tasks
                </text>
              )}
            </svg>
            <div className="donut-legend">
              <div className="legend-item">
                <span className="legend-color" style={{ backgroundColor: '#dc3545' }}></span>
                <span>High: {stats.highPriority}</span>
              </div>
              <div className="legend-item">
                <span className="legend-color" style={{ backgroundColor: '#ffc107' }}></span>
                <span>Medium: {stats.mediumPriority}</span>
              </div>
              <div className="legend-item">
                <span className="legend-color" style={{ backgroundColor: '#28a745' }}></span>
                <span>Low: {stats.lowPriority}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="recent-tasks-section">
        <div className="section-header">
          <h2>Recent Tasks</h2>
          <Link to="/my-tasks" className="btn btn-secondary">View All →</Link>
        </div>
        {recentTasks.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📭</div>
            <p>No tasks assigned to you yet.</p>
          </div>
        ) : (
          <div className="tasks-grid-small">
            {recentTasks.map(task => (
              <Link to={`/tasks/${task.id}`} key={task.id} className="mini-task-card">
                <div className="mini-task-header">
                  <span 
                    className="priority-indicator" 
                    style={{ backgroundColor: getPriorityColor(task.priority) }}
                  />
                  <span className={`mini-status-badge badge-${task.status}`}>
                    {getStatusIcon(task.status)}
                  </span>
                </div>
                <h4 className="mini-task-title">{task.title}</h4>
                <div className="mini-task-footer">
                  <span className="mini-team">🏢 {task.team_name}</span>
                  {task.due_date && (
                    <span className="mini-due-date">
                      📅 {new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
