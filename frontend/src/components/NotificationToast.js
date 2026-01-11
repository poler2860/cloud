import React, { useEffect } from 'react';
import { useNotifications } from '../contexts/NotificationContext';
import './NotificationBell.css';

const NotificationToast = () => {
  const { showToast, toastNotification, setShowToast } = useNotifications();

  useEffect(() => {
    if (showToast) {
      const timer = setTimeout(() => {
        setShowToast(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [showToast, setShowToast]);

  if (!showToast || !toastNotification) return null;

  return (
    <div className={`notification-toast ${!showToast ? 'hide' : ''}`}>
      <div className="toast-title">{toastNotification.title}</div>
      <div className="toast-message">{toastNotification.message}</div>
    </div>
  );
};

export default NotificationToast;
