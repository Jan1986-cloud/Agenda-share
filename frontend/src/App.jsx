import React, { useState, useEffect, createContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './Navbar';
import Dashboard from './Dashboard';
import Appointments from './Appointments';
import LinkEditor from './LinkEditor';
import { apiRoutes } from '@shared/apiRoutes.js';

import apiClient from './utils/apiClient';

export const UserContext = createContext(null);

const LoadingSpinner = () => (
  <div className="d-flex justify-content-center align-items-center" style={{ height: '100vh' }}>
    <div className="spinner-border text-primary" style={{ width: '3rem', height: '3rem' }} role="status">
      <span className="visually-hidden">Laden...</span>
    </div>
  </div>
);

const ProtectedRoute = ({ children }) => {
  const { user, loading } = React.useContext(UserContext);
  if (loading) {
    return <LoadingSpinner />;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

const LoginPage = () => {
  const loginUrl = `${apiRoutes.auth.prefix}${apiRoutes.auth.login}`;
  return (
    <div className="container">
      <div className="row justify-content-center align-items-center" style={{ height: '80vh' }}>
        <div className="col-md-6 text-center">
          <div className="card p-5 shadow-sm">
            <h1 className="h2 mb-4">Welkom bij Agenda Share</h1>
            <p className="text-muted mb-4">Log in met je Google-account om je agenda's te beheren en te delen.</p>
            <a href={loginUrl} className="btn btn-primary btn-lg">
              <i className="bi bi-google me-2"></i> Inloggen met Google
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkUserStatus = async () => {
    // setLoading(true) hier weggelaten om onnodige flikkering te voorkomen
    try {
      const statusUrl = `${apiRoutes.auth.prefix}${apiRoutes.auth.status}`;
      const { data } = await apiClient.get(statusUrl);
      if (data.isAuthenticated) {
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error("Kon de gebruikersstatus niet verifiëren:", error.message);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkUserStatus();
  }, []);

  const userContextValue = { user, setUser, loading };

  return (
    <UserContext.Provider value={userContextValue}>
      <Router>
        {user && <Navbar user={user} />}
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/appointments" element={<ProtectedRoute><Appointments /></ProtectedRoute>} />
          <Route path="/link-editor" element={<ProtectedRoute><LinkEditor /></ProtectedRoute>} />
          <Route path="/link-editor/:id" element={<ProtectedRoute><LinkEditor /></ProtectedRoute>} />
          {/* Redirect root to dashboard or login */}
          <Route path="/" element={<Navigate to={loading ? "/login" : (user ? "/dashboard" : "/login")} replace />} />
          {/* Catch-all for unknown routes */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </UserContext.Provider>
  );
}


export default App;
