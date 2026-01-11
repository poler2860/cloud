import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { taskAPI } from '../services/api';
import './MyTasks.css';

const MyTasks = () => {
  const [tasks, setTasks] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('cards'); // 'cards' or 'table'

  useEffect(() => {
    loadTasks();
  }, [filter]);

  const loadTasks = async () => {
    try {
      const params = filter !== 'all' ? { status: filter } : {};
      const response = await taskAPI.getMyTasks(params);
      setTasks(response.data);
    } catch (error) {
      console.error('Failed to load tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const getPriorityIcon = (priority) => {
    switch (priority) {
      case 'high': return '🔴';
      case 'medium': return '🟡';
      case 'low': return '🟢';
      default: return '⚪';
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

  const formatDate = (dateString) => {
    if (!dateString) return 'No due date';
    const date = new Date(dateString);
    const today = new Date();
    const diffTime = date - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return <span style={{ color: '#dc3545' }}>Overdue</span>;
    if (diffDays === 0) return <span style={{ color: '#fd7e14' }}>Today</span>;
    if (diffDays === 1) return <span style={{ color: '#ffc107' }}>Tomorrow</span>;
    if (diffDays <= 7) return <span style={{ color: '#0066cc' }}>{diffDays} days left</span>;
    return date.toLocaleDateString();
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="my-tasks-container">
      <div className="tasks-header">
        <h1>My Tasks</h1>
        <div className="tasks-header-actions">
          <div className="view-toggle">
            <button 
              className={`view-btn ${viewMode === 'cards' ? 'active' : ''}`}
              onClick={() => setViewMode('cards')}
              title="Card View"
            >
              <span>🔲</span>
            </button>
            <button 
              className={`view-btn ${viewMode === 'table' ? 'active' : ''}`}
              onClick={() => setViewMode('table')}
              title="Table View"
            >
              <span>📊</span>
            </button>
          </div>
        </div>
      </div>

      <div className="filter-bar">
        <label>Filter by status:</label>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">All Tasks ({tasks.length})</option>
          <option value="todo">To Do</option>
          <option value="in_progress">In Progress</option>
          <option value="in_review">In Review</option>
          <option value="done">Done</option>
        </select>
      </div>

      {tasks.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📭</div>
          <h3>No tasks found</h3>
          <p>You don't have any tasks matching this filter.</p>
        </div>
      ) : viewMode === 'cards' ? (
        <div className="tasks-grid">
          {tasks.map(task => (
            <div key={task.id} className={`task-card priority-${task.priority}`}>
              <div className="task-card-header">
                <div className="task-priority">
                  {getPriorityIcon(task.priority)}
                  <span className={`badge badge-${task.priority}`}>
                    {task.priority}
                  </span>
                </div>
                <span className={`status-badge badge-${task.status}`}>
                  {getStatusIcon(task.status)} {task.status.replace('_', ' ')}
                </span>
              </div>
              
              <div className="task-card-body">
                <h3 className="task-title">{task.title}</h3>
                {task.description && (
                  <p className="task-description">
                    {task.description.length > 100 
                      ? `${task.description.substring(0, 100)}...` 
                      : task.description}
                  </p>
                )}
              </div>

              <div className="task-card-meta">
                <div className="meta-item">
                  <span className="meta-label">Team</span>
                  <span className="meta-value">{task.team_name}</span>
                </div>
                <div className="meta-item">
                  <span className="meta-label">Reporter</span>
                  <span className="meta-value">{task.reporter_name}</span>
                </div>
                <div className="meta-item">
                  <span className="meta-label">Due Date</span>
                  <span className="meta-value">{formatDate(task.due_date)}</span>
                </div>
              </div>

              <div className="task-card-footer">
                <Link to={`/tasks/${task.id}`} className="btn btn-primary btn-block">
                  View Details →
                </Link>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Team</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Reporter</th>
                <th>Due Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map(task => (
                <tr key={task.id}>
                  <td>{task.title}</td>
                  <td>{task.team_name}</td>
                  <td>
                    <span className={`badge badge-${task.status}`}>
                      {task.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td>
                    <span className={`badge badge-${task.priority}`}>
                      {task.priority}
                    </span>
                  </td>
                  <td>{task.reporter_name}</td>
                  <td>{formatDate(task.due_date)}</td>
                  <td>
                    <Link to={`/tasks/${task.id}`} className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '12px' }}>
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default MyTasks;
