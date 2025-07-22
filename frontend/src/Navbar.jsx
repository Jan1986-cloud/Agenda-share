import React from 'react';
import { Link, NavLink } from 'react-router-dom';
import { apiRoutes } from '@shared/apiRoutes';

function Navbar({ user }) {
  const logoutUrl = `${apiRoutes.auth.prefix}${apiRoutes.auth.logout}`;

  return (
    <nav className="navbar navbar-expand-lg navbar-light bg-white border-bottom sticky-top shadow-sm">
      <div className="container">
        <Link className="navbar-brand" to="/dashboard" style={{ fontWeight: 600 }}>
          <i className="bi bi-calendar-check me-2"></i>Agenda Share
        </Link>
        <button className="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#main-nav">
          <span className="navbar-toggler-icon"></span>
        </button>
        <div className="collapse navbar-collapse" id="main-nav">
          <ul className="navbar-nav me-auto">
            <li className="nav-item">
              <NavLink className="nav-link" to="/dashboard">Dashboard</NavLink>
            </li>
            <li className="nav-item">
              <NavLink className="nav-link" to="/appointments">Afspraken</NavLink>
            </li>
          </ul>
          <ul className="navbar-nav ms-auto">
            {user ? (
              <li className="nav-item dropdown">
                <a className="nav-link dropdown-toggle" href="#" id="navbarDropdown" role="button" data-bs-toggle="dropdown" aria-expanded="false">
                  <img src={user.avatar} alt="User Avatar" width="30" height="30" className="rounded-circle me-2" />
                  {user.displayName}
                </a>
                <ul className="dropdown-menu dropdown-menu-end" aria-labelledby="navbarDropdown">
                  <li><a className="dropdown-item" href={logoutUrl}>Uitloggen</a></li>
                </ul>
              </li>
            ) : (
              <li className="nav-item">
                <a className="btn btn-primary" href={`${apiRoutes.auth.prefix}${apiRoutes.auth.login}`}>Inloggen</a>
              </li>
            )}
          </ul>
        </div>
      </div>
    </nav>
  );
}

export default Navbar;

