import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { taskAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import './TaskDetail.css';

const TaskDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [task, setTask] = useState(null);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  useEffect(() => {
    loadTask();
  }, [id]);

  const loadTask = async () => {
    try {
      const response = await taskAPI.getById(id);
      setTask(response.data);
    } catch (error) {
      console.error('Failed to load task:', error);
      alert('Failed to load task');
      navigate('/my-tasks');
    } finally {
      setLoading(false);
    }
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!comment.trim()) return;

    try {
      await taskAPI.addComment(id, comment);
      setComment('');
      loadTask();
    } catch (error) {
      alert('Failed to add comment: ' + (error.response?.data?.error || 'Unknown error'));
    }
  };

  const handleStatusChange = async (newStatus) => {
    setUpdatingStatus(true);
    try {
      await taskAPI.update(id, { status: newStatus });
      await loadTask();
    } catch (error) {
      alert('Failed to update status: ' + (error.response?.data?.detail || 'Unknown error'));
    } finally {
      setUpdatingStatus(false);
    }
  };

  const isAssignee = task?.assignee_id === user?.id;

  const getStatusIcon = (status) => {
    switch (status) {
      case 'todo': return '📋';
      case 'in_progress': return '⚙️';
      case 'in_review': return '👀';
      case 'done': return '✅';
      default: return '📌';
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

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (!task) {
    return <div className="card">Task not found</div>;
  }

  return (
    <div className="task-detail-container">
      <button className="btn btn-secondary back-btn" onClick={() => navigate(-1)}>
        ← Back
      </button>

      <div className="task-detail-header">
        <div className="task-header-content">
          <div className="task-badges">
            {isAssignee ? (
              <div className="status-dropdown-container">
                <label htmlFor="status-select" style={{ fontSize: '14px', fontWeight: 'bold', marginRight: '8px' }}>
                  Status:
                </label>
                <select
                  id="status-select"
                  value={task.status}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  disabled={updatingStatus}
                  className="status-select"
                  style={{
                    padding: '8px 12px',
                    fontSize: '14px',
                    borderRadius: '6px',
                    border: '2px solid #ddd',
                    cursor: updatingStatus ? 'wait' : 'pointer',
                    backgroundColor: updatingStatus ? '#f5f5f5' : 'white'
                  }}
                >
                  <option value="todo">📋 To Do</option>
                  <option value="in_progress">⚙️ In Progress</option>
                  <option value="in_review">👀 In Review</option>
                  <option value="done">✅ Done</option>
                </select>
              </div>
            ) : (
              <span className={`status-badge-large badge-${task.status}`}>
                {getStatusIcon(task.status)} {task.status.replace('_', ' ')}
              </span>
            )}
            <span className={`priority-badge-large badge-${task.priority}`}>
              {getPriorityIcon(task.priority)} {task.priority}
            </span>
          </div>
          <h1 className="task-title-large">{task.title}</h1>
        </div>
      </div>

      <div className="task-content-grid">
        <div className="task-main-content">
          <div className="detail-card">
            <h2 className="section-title">📝 Description</h2>
            <p className="task-description-full">
              {task.description || 'No description provided'}
            </p>
          </div>

          <div className="detail-card">
            <h2 className="section-title">💬 Comments ({task.comments?.length || 0})</h2>
            
            <form onSubmit={handleAddComment} className="comment-form">
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add a comment..."
                rows="3"
                className="comment-textarea"
              />
              <button type="submit" className="btn btn-primary">
                💬 Add Comment
              </button>
            </form>

            {task.comments && task.comments.length > 0 ? (
              <div className="comments-list">
                {task.comments.map(comment => (
                  <div key={comment.id} className="comment-item">
                    <div className="comment-header">
                      <div className="comment-author">
                        <span className="author-avatar">👤</span>
                        <strong>{comment.user_name}</strong>
                      </div>
                      <span className="comment-date">
                        {new Date(comment.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="comment-content">{comment.content}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="no-comments">No comments yet. Be the first to comment!</p>
            )}
          </div>
        </div>

        <div className="task-sidebar">
          <div className="detail-card">
            <h3 className="sidebar-title">📊 Task Information</h3>
            <div className="info-list">
              <div className="info-item">
                <span className="info-label">🏢 Team</span>
                <span className="info-value">{task.team_name}</span>
              </div>
              <div className="info-item">
                <span className="info-label">👤 Assignee</span>
                <span className="info-value">{task.assignee_name || 'Unassigned'}</span>
              </div>
              <div className="info-item">
                <span className="info-label">📢 Reporter</span>
                <span className="info-value">{task.reporter_name}</span>
              </div>
              <div className="info-item">
                <span className="info-label">📅 Due Date</span>
                <span className="info-value">
                  {task.due_date ? new Date(task.due_date).toLocaleDateString() : 'Not set'}
                </span>
              </div>
              <div className="info-item">
                <span className="info-label">🕐 Created</span>
                <span className="info-value">
                  {new Date(task.created_at).toLocaleDateString()}
                </span>
              </div>
              <div className="info-item">
                <span className="info-label">🔄 Updated</span>
                <span className="info-value">
                  {new Date(task.updated_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TaskDetail;
