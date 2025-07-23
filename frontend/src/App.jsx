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
    return <Navigate to={apiRoutes.frontend.login} replace />;
  }
  return children;
};

const LoginPage = () => {
  const loginUrl = `${apiRoutes.auth.prefix}${apiRoutes.auth.login}`;

  const featureIconStyle = {
    fontSize: '3rem',
    color: 'var(--bs-primary)',
  };

  return (
    <>
      {/* Navbar */}
      <nav className="navbar navbar-expand-lg navbar-light bg-white border-bottom sticky-top">
        <div className="container">
          <a className="navbar-brand" href="#">Agenda Share</a>
          <div className="collapse navbar-collapse" id="navbarNav">
            <ul className="navbar-nav ms-auto align-items-center">
              <li className="nav-item">
                <a href={loginUrl} className="btn btn-primary">
                  <i className="bi bi-box-arrow-in-right me-1"></i> Inloggen met Google
                </a>
              </li>
            </ul>
          </div>
        </div>
      </nav>

      <main>
        {/* Hero Section */}
        <header className="text-center" style={{ padding: '6rem 0', backgroundColor: '#ffffff' }}>
          <div className="container">
            <div className="row justify-content-center">
              <div className="col-lg-8">
                <h1 className="display-4" style={{ fontSize: '3.5rem', fontWeight: 700 }}>De slimste weg naar een volle agenda</h1>
                <p className="lead mt-3" style={{ fontSize: '1.25rem', color: '#6c757d' }}>Stop met puzzelen, start met plannen. Deel een link en laat uw klanten zelf de perfecte afspraak boeken, inclusief reistijd.</p>
                <a href={loginUrl} className="btn btn-primary btn-lg mt-4">
                  Begin Vandaag Nog <i className="bi bi-arrow-right ms-2"></i>
                </a>
              </div>
            </div>
          </div>
        </header>

        {/* How It Works Section */}
        <section className="section bg-light" style={{ padding: '5rem 0' }}>
          <div className="container">
            <div className="text-center mb-5">
              <h2>Hoe het werkt</h2>
              <p className="lead text-muted">In drie eenvoudige stappen naar een efficiënte planning.</p>
            </div>
            <div className="row g-4">
              <div className="col-md-4">
                <div className="card text-center p-4 h-100">
                  <div className="mb-3"><i className="bi bi-link-45deg" style={featureIconStyle}></i></div>
                  <h4>Creëer & Deel</h4>
                  <p>Maak een unieke planningslink aan met uw beschikbaarheid en voorkeuren.</p>
                </div>
              </div>
              <div className="col-md-4">
                <div className="card text-center p-4 h-100">
                  <div className="mb-3"><i className="bi bi-stopwatch" style={featureIconStyle}></i></div>
                  <h4>Klant Kiest</h4>
                  <p>Uw klant opent de link, kiest een tijdslot dat voor beiden werkt, en vult zijn gegevens in.</p>
                </div>
              </div>
              <div className="col-md-4">
                <div className="card text-center p-4 h-100">
                  <div className="mb-3"><i className="bi bi-calendar-check" style={featureIconStyle}></i></div>
                  <h4>Direct Bevestigd</h4>
                  <p>De afspraak, inclusief berekende reistijd, verschijnt automatisch in uw Google Calendar.</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="text-center" style={{ backgroundColor: '#343a40', color: 'white', padding: '3rem 0' }}>
        <div className="container">
          <p className="mb-1">&copy; 2025 Agenda Share. All Rights Reserved.</p>
        </div>
      </footer>
    </>
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
          <Route path={apiRoutes.frontend.login} element={<LoginPage />} />
          <Route path={apiRoutes.frontend.dashboard} element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path={apiRoutes.frontend.appointments} element={<ProtectedRoute><Appointments /></ProtectedRoute>} />
          <Route path={apiRoutes.frontend.linkEditor} element={<ProtectedRoute><LinkEditor /></ProtectedRoute>} />
          <Route path={apiRoutes.frontend.linkEditorWithId} element={<ProtectedRoute><LinkEditor /></ProtectedRoute>} />
          {/* Redirect root to dashboard */}
          <Route path={apiRoutes.frontend.home} element={<Navigate to={apiRoutes.frontend.dashboard} replace />} />
          {/* Catch-all for unknown routes */}
          <Route path="*" element={<Navigate to={apiRoutes.frontend.home} replace />} />
        </Routes>
      </Router>
    </UserContext.Provider>
  );
}


export default App;
