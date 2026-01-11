import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { teamAPI, userAPI } from '../services/api';

const Teams = () => {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [teams, setTeams] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTeam, setEditingTeam] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    leaderId: '',
  });

  useEffect(() => {
    loadTeams();
    if (isAdmin()) {
      loadUsers();
    }
  }, []);

  const loadTeams = async () => {
    try {
      const response = await teamAPI.getAll();
      setTeams(response.data);
    } catch (error) {
      console.error('Failed to load teams:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      const response = await userAPI.getAll({ status: 'active' });
      setUsers(response.data);
    } catch (error) {
      console.error('Failed to load users:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        name: formData.name,
        description: formData.description,
        leader_id: parseInt(formData.leaderId)
      };
      if (editingTeam) {
        await teamAPI.update(editingTeam.id, payload);
      } else {
        await teamAPI.create(payload);
      }
      setShowModal(false);
      setEditingTeam(null);
      setFormData({ name: '', description: '', leaderId: '' });
      loadTeams();
    } catch (error) {
      alert('Failed to save team: ' + (error.response?.data?.error || 'Unknown error'));
    }
  };

  const handleEdit = (team) => {
    setEditingTeam(team);
    setFormData({
      name: team.name,
      description: team.description || '',
      leaderId: team.leader_id,
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this team?')) {
      try {
        await teamAPI.delete(id);
        loadTeams();
      } catch (error) {
        alert('Failed to delete team: ' + (error.response?.data?.error || 'Unknown error'));
      }
    }
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1>Teams</h1>
        {isAdmin() && (
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            Create Team
          </button>
        )}
      </div>

      {teams.length === 0 ? (
        <div className="card">
          <p>No teams found.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '20px' }}>
          {teams.map(team => (
            <div key={team.id} className="card">
              <h3>{team.name}</h3>
              <p style={{ color: '#666', marginBottom: '10px' }}>{team.description}</p>
              <p><strong>Leader:</strong> {team.leader_name}</p>
              <div style={{ marginTop: '15px', display: 'flex', gap: '10px' }}>
                <button
                  className="btn btn-primary"
                  onClick={() => navigate(`/teams/${team.id}`)}
                >
                  View Details
                </button>
                {isAdmin() && (
                  <>
                    <button className="btn btn-secondary" onClick={() => handleEdit(team)}>
                      Edit
                    </button>
                    <button className="btn btn-danger" onClick={() => handleDelete(team.id)}>
                      Delete
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editingTeam ? 'Edit Team' : 'Create Team'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Team Leader</label>
                <select
                  value={formData.leaderId}
                  onChange={(e) => setFormData({ ...formData, leaderId: e.target.value })}
                  required
                >
                  <option value="">Select a leader</option>
                  {users.map(user => (
                    <option key={user.id} value={user.id}>
                      {user.first_name} {user.last_name} ({user.email})
                    </option>
                  ))}
                </select>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingTeam ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Teams;
