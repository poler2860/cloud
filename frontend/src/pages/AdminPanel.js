import React, { useState, useEffect } from 'react';
import { userAPI } from '../services/api';

const AdminPanel = () => {
  const [users, setUsers] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUsers();
  }, [filter]);

  const loadUsers = async () => {
    try {
      const params = filter !== 'all' ? { status: filter } : {};
      const response = await userAPI.getAll(params);
      setUsers(response.data);
    } catch (error) {
      console.error('Failed to load users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (userId, newStatus) => {
    try {
      await userAPI.updateStatus(userId, newStatus);
      loadUsers();
    } catch (error) {
      alert('Failed to update status: ' + (error.response?.data?.error || 'Unknown error'));
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    if (!window.confirm(`Are you sure you want to change this user's role to ${newRole}?`)) {
      return;
    }

    try {
      await userAPI.updateRole(userId, newRole);
      loadUsers();
    } catch (error) {
      alert('Failed to update role: ' + (error.response?.data?.error || 'Unknown error'));
    }
  };

  const handleDelete = async (userId) => {
    if (!window.confirm('Are you sure you want to delete this user?')) {
      return;
    }

    try {
      await userAPI.delete(userId);
      loadUsers();
    } catch (error) {
      alert('Failed to delete user: ' + (error.response?.data?.error || 'Unknown error'));
    }
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div>
      <h1>Admin Panel</h1>
      <p>Manage users and their permissions</p>

      <div className="card" style={{ marginTop: '20px', marginBottom: '20px' }}>
        <label style={{ marginRight: '10px', fontWeight: '500' }}>Filter by status:</label>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
        >
          <option value="all">All</option>
          <option value="pending">Pending</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {users.length === 0 ? (
        <div className="card">
          <p>No users found.</p>
        </div>
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id}>
                  <td>{user.first_name} {user.last_name}</td>
                  <td>{user.email}</td>
                  <td>
                    <select
                      value={user.role}
                      onChange={(e) => handleRoleChange(user.id, e.target.value)}
                      style={{ padding: '4px', borderRadius: '4px' }}
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td>
                    <select
                      value={user.status}
                      onChange={(e) => handleStatusChange(user.id, e.target.value)}
                      className={`badge badge-${user.status}`}
                      style={{ padding: '4px', borderRadius: '4px' }}
                    >
                      <option value="pending">Pending</option>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </td>
                  <td>{new Date(user.created_at).toLocaleDateString()}</td>
                  <td>
                    <button
                      className="btn btn-danger"
                      onClick={() => handleDelete(user.id)}
                      style={{ padding: '6px 12px', fontSize: '12px' }}
                    >
                      Delete
                    </button>
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

export default AdminPanel;
