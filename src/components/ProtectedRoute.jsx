import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

export const ProtectedRoute = ({ children, requireAdmin = false }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center vh-100" style={{ background: '#f9fafb' }}>
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading session...</span>
        </div>
      </div>
    );
  }

  if (requireAdmin) {
    const role = sessionStorage.getItem('um_role');
    const adminId = sessionStorage.getItem('um_admin_id');
    if (role !== 'admin' || !adminId) {
      return <Navigate to="/login" replace />;
    }
    return children;
  }

  // Regular student pages check
  const role = sessionStorage.getItem('um_role');
  if (role === 'admin') {
    // If an admin tries to view student catalog, redirect them to admin page
    return <Navigate to="/admin" replace />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
};
