import React from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './Layout.css';

const Layout = () => {
  const { user, logout, isAdmin, isTeamLeader } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="layout">
      <nav className="navbar">
        <div className="navbar-brand">
          <h1>Nefos</h1>
        </div>
        <div className="navbar-links">
          <Link to="/dashboard">Dashboard</Link>
          <Link to="/teams">Teams</Link>
          {isTeamLeader() && <Link to="/tasks">Tasks</Link>}
          <Link to="/my-tasks">My Tasks</Link>
          {isAdmin() && <Link to="/admin">Admin Panel</Link>}
        </div>
        <div className="navbar-user">
          <Link to="/profile" style={{ textDecoration: 'none', color: 'inherit' }}>
            <span>@{user?.username}</span>
          </Link>
          <span className={`badge badge-${user?.role}`}>{user?.role}</span>
          <button onClick={handleLogout} className="btn btn-secondary">
            Logout
          </button>
        </div>
      </nav>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
