import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './components/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';

// Pages
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';
import { Catalog } from './pages/Catalog';
import { Sell } from './pages/Sell';
import { Activity } from './pages/Activity';
import { Review } from './pages/Review';
import { Admin } from './pages/Admin';

// Global Styles import Bootstrap
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap/dist/js/bootstrap.bundle.min.js';

function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          {/* Public Auth Routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />

          {/* Protected Student Routes */}
          <Route 
            path="/" 
            element={
              <ProtectedRoute>
                <Catalog />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/sell" 
            element={
              <ProtectedRoute>
                <Sell />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/activity" 
            element={
              <ProtectedRoute>
                <Activity />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/review" 
            element={
              <ProtectedRoute>
                <Review />
              </ProtectedRoute>
            } 
          />

          {/* Protected Admin Routes */}
          <Route 
            path="/admin" 
            element={
              <ProtectedRoute requireAdmin={true}>
                <Admin />
              </ProtectedRoute>
            } 
          />

          {/* Redirect all unmatched routes to Catalog (resolved dynamically by Auth check) */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;
