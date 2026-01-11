import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';

const NotificationContext = createContext();

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};

export const NotificationProvider = ({ children }) => {
  const { token } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [ws, setWs] = useState(null);
  const [showToast, setShowToast] = useState(false);
  const [toastNotification, setToastNotification] = useState(null);

  // Connect to WebSocket
  useEffect(() => {
    if (!token) {
      if (ws) {
        ws.close();
        setWs(null);
      }
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    // Create WebSocket connection
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws?token=${token}`;
    const websocket = new WebSocket(wsUrl);

    websocket.onopen = () => {
      console.log('WebSocket connected');
    };

    websocket.onmessage = (event) => {
      const notification = JSON.parse(event.data);
      console.log('Received notification:', notification);
      
      setNotifications(prev => [notification, ...prev]);
      
      if (!notification.read) {
        setUnreadCount(prev => prev + 1);
        
        // Show toast for new notifications
        setToastNotification(notification);
        setShowToast(true);
        setTimeout(() => setShowToast(false), 5000);
      }
    };

    websocket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    websocket.onclose = () => {
      console.log('WebSocket disconnected');
    };

    setWs(websocket);

    return () => {
      if (websocket.readyState === WebSocket.OPEN) {
        websocket.close();
      }
    };
  }, [token]);

  // Mark notification as read
  const markAsRead = useCallback((notificationId) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(`read:${notificationId}`);
      
      setNotifications(prev =>
        prev.map(n =>
          n.id === notificationId ? { ...n, read: true } : n
        )
      );
      
      setUnreadCount(prev => Math.max(0, prev - 1));
    }
  }, [ws]);

  // Clear all notifications
  const clearAll = useCallback(() => {
    setNotifications([]);
    setUnreadCount(0);
  }, []);

  const value = {
    notifications,
    unreadCount,
    markAsRead,
    clearAll,
    showToast,
    toastNotification,
    setShowToast
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};
