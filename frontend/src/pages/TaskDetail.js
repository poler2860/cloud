import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { taskAPI } from '../services/api';

const TaskDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [task, setTask] = useState(null);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);

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

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (!task) {
    return <div className="card">Task not found</div>;
  }

  return (
    <div>
      <button className="btn btn-secondary" onClick={() => navigate(-1)} style={{ marginBottom: '20px' }}>
        ← Back
      </button>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '20px' }}>
          <div>
            <h1 style={{ marginBottom: '10px' }}>{task.title}</h1>
            <div style={{ display: 'flex', gap: '10px' }}>
              <span className={`badge badge-${task.status}`}>{task.status.replace('_', ' ')}</span>
              <span className={`badge badge-${task.priority}`}>{task.priority}</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
          <div>
            <p><strong>Team:</strong> {task.team_name}</p>
            <p><strong>Assignee:</strong> {task.assignee_name || 'Unassigned'}</p>
            <p><strong>Reporter:</strong> {task.reporter_name}</p>
          </div>
          <div>
            <p><strong>Due Date:</strong> {task.due_date ? new Date(task.due_date).toLocaleDateString() : 'Not set'}</p>
            <p><strong>Created:</strong> {new Date(task.created_at).toLocaleString()}</p>
            <p><strong>Updated:</strong> {new Date(task.updated_at).toLocaleString()}</p>
          </div>
        </div>

        <div style={{ marginBottom: '30px' }}>
          <h3>Description</h3>
          <p style={{ whiteSpace: 'pre-wrap', color: '#666' }}>{task.description || 'No description provided'}</p>
        </div>

        <div>
          <h3>Comments ({task.comments?.length || 0})</h3>
          
          <form onSubmit={handleAddComment} style={{ marginTop: '15px', marginBottom: '20px' }}>
            <div className="form-group">
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add a comment..."
                rows="3"
              />
            </div>
            <button type="submit" className="btn btn-primary">
              Add Comment
            </button>
          </form>

          {task.comments && task.comments.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              {task.comments.map(comment => (
                <div key={comment.id} style={{ padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <strong>{comment.user_name}</strong>
                    <span style={{ color: '#666', fontSize: '14px' }}>
                      {new Date(comment.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p style={{ whiteSpace: 'pre-wrap' }}>{comment.content}</p>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: '#666' }}>No comments yet</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default TaskDetail;
