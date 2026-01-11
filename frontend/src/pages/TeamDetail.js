import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { teamAPI, userAPI, taskAPI } from '../services/api';

const TeamDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const [team, setTeam] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddMember, setShowAddMember] = useState(false);
  const [selectedUser, setSelectedUser] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [formData, setFormData] = useState({ name: '', description: '' });

  useEffect(() => {
    loadTeamData();
  }, [id]);

  const loadTeamData = async () => {
    try {
      const [teamRes, tasksRes] = await Promise.all([
        teamAPI.getById(id),
        taskAPI.getAll({ teamId: id }),
      ]);
      setTeam(teamRes.data);
      setTasks(tasksRes.data);
      setFormData({
        name: teamRes.data.name,
        description: teamRes.data.description || '',
      });

      // Load all users if user can add members
      if (isAdmin() || teamRes.data.leader_id === user?.id) {
        const usersRes = await userAPI.getAll({ status: 'active' });
        setAllUsers(usersRes.data);
      }
    } catch (error) {
      console.error('Failed to load team:', error);
      alert('Failed to load team details');
      navigate('/teams');
    } finally {
      setLoading(false);
    }
  };

  const handleAddMember = async (e) => {
    e.preventDefault();
    if (!selectedUser) return;

    try {
      await teamAPI.addMember(id, parseInt(selectedUser));
      setShowAddMember(false);
      setSelectedUser('');
      loadTeamData();
    } catch (error) {
      alert('Failed to add member: ' + (error.response?.data?.error || 'Unknown error'));
    }
  };

  const handleRemoveMember = async (userId) => {
    if (!window.confirm('Are you sure you want to remove this member?')) return;

    try {
      await teamAPI.removeMember(id, userId);
      loadTeamData();
    } catch (error) {
      alert('Failed to remove member: ' + (error.response?.data?.error || 'Unknown error'));
    }
  };

  const handleUpdateTeam = async (e) => {
    e.preventDefault();
    try {
      await teamAPI.update(id, formData);
      setShowEditModal(false);
      loadTeamData();
    } catch (error) {
      alert('Failed to update team: ' + (error.response?.data?.error || 'Unknown error'));
    }
  };

  const canManageTeam = () => {
    return isAdmin() || team?.leader_id === user?.id;
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (!team) {
    return <div className="card">Team not found</div>;
  }

  const availableUsers = allUsers.filter(
    u => !team.members.some(m => m.id === u.id)
  );

  return (
    <div>
      <button className="btn btn-secondary" onClick={() => navigate('/teams')} style={{ marginBottom: '20px' }}>
        ← Back to Teams
      </button>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '20px' }}>
          <div>
            <h1>{team.name}</h1>
            <p style={{ color: '#666', marginTop: '10px' }}>{team.description}</p>
          </div>
          {canManageTeam() && (
            <button className="btn btn-primary" onClick={() => setShowEditModal(true)}>
              Edit Team
            </button>
          )}
        </div>

        <div style={{ marginBottom: '30px' }}>
          <p><strong>Team Leader:</strong> {team.leader_name} ({team.leader_email})</p>
          <p><strong>Created:</strong> {new Date(team.created_at).toLocaleDateString()}</p>
        </div>

        <div style={{ marginBottom: '30px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h2>Members ({team.members?.length || 0})</h2>
            {canManageTeam() && (
              <button className="btn btn-success" onClick={() => setShowAddMember(true)}>
                Add Member
              </button>
            )}
          </div>

          {team.members && team.members.length > 0 ? (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Joined</th>
                  {canManageTeam() && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {team.members.map(member => (
                  <tr key={member.id}>
                    <td>{member.first_name} {member.last_name}</td>
                    <td>{member.email}</td>
                    <td>{new Date(member.joined_at).toLocaleDateString()}</td>
                    {canManageTeam() && (
                      <td>
                        {member.id !== team.leader_id && (
                          <button
                            className="btn btn-danger"
                            onClick={() => handleRemoveMember(member.id)}
                            style={{ padding: '6px 12px', fontSize: '12px' }}
                          >
                            Remove
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>No members yet</p>
          )}
        </div>

        <div>
          <h2>Tasks ({tasks.length})</h2>
          {tasks.length > 0 ? (
            <table style={{ marginTop: '15px' }}>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Assignee</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Due Date</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map(task => (
                  <tr key={task.id} onClick={() => navigate(`/tasks/${task.id}`)} style={{ cursor: 'pointer' }}>
                    <td>{task.title}</td>
                    <td>{task.assignee_name || 'Unassigned'}</td>
                    <td><span className={`badge badge-${task.status}`}>{task.status.replace('_', ' ')}</span></td>
                    <td><span className={`badge badge-${task.priority}`}>{task.priority}</span></td>
                    <td>{task.due_date ? new Date(task.due_date).toLocaleDateString() : 'N/A'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>No tasks yet</p>
          )}
        </div>
      </div>

      {/* Add Member Modal */}
      {showAddMember && (
        <div className="modal-overlay" onClick={() => setShowAddMember(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Add Team Member</h2>
            <form onSubmit={handleAddMember}>
              <div className="form-group">
                <label>Select User</label>
                <select
                  value={selectedUser}
                  onChange={(e) => setSelectedUser(e.target.value)}
                  required
                >
                  <option value="">Choose a user...</option>
                  {availableUsers.map(user => (
                    <option key={user.id} value={user.id}>
                      {user.first_name} {user.last_name} ({user.email})
                    </option>
                  ))}
                </select>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddMember(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Add Member
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Team Modal */}
      {showEditModal && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Edit Team</h2>
            <form onSubmit={handleUpdateTeam}>
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
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowEditModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Update
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeamDetail;
