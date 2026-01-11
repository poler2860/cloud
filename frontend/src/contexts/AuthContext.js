import React, { createContext, useState, useContext, useEffect } from 'react';
import { authAPI, teamAPI } from '../services/api';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    
    if (token && savedUser) {
      setUser(JSON.parse(savedUser));
      loadTeams();
    } else {
      setLoading(false);
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

  const login = async (email, password) => {
    const response = await authAPI.login(email, password);
    const { access_token } = response.data;
    
    localStorage.setItem('token', access_token);
    
    // Fetch user info
    const userResponse = await authAPI.me();
    const user = userResponse.data;
    
    localStorage.setItem('user', JSON.stringify(user));
    setUser(user);
    
    // Load teams
    await loadTeams();
    
    return user;
  };

  const register = async (data) => {
    const response = await authAPI.register(data);
    return response.data;
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  const isAdmin = () => {
    return user?.role === 'admin';
  };

  const isTeamLeader = () => {
    if (!user || !teams) return false;
    return teams.some(team => team.leader_id === user.id);
  };

  const value = {
    user,
    teams,
    login,
    register,
    logout,
    isAdmin,
    isTeamLeader,
    loading,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
