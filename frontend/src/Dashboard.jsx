import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiRoutes } from '@shared/apiRoutes';

import { apiClient } from './utils/apiClient.js';

// --- Sub-components ---

const KpiCard = ({ icon, title, value }) => (
    <div className="card kpi-card shadow-sm border-0">
        <div className="card-body p-4 d-flex align-items-center">
            <div className="flex-shrink-0 me-4"><i className={`bi ${icon}`} style={{ fontSize: '2.5rem', color: 'var(--bs-primary)' }}></i></div>
            <div className="flex-grow-1">
                <h5 className="card-title text-muted mb-1">{title}</h5>
                <p className="display-4 mb-0">{value}</p>
            </div>
        </div>
    </div>
);

const LinkCard = ({ link, onDuplicate, onDelete }) => {
    const shareUrl = `${window.location.origin}/planning/${link.id}`;

    const handleCopy = (e) => {
        const target = e.currentTarget;
        navigator.clipboard.writeText(shareUrl).then(() => {
            const originalIcon = target.innerHTML;
            target.innerHTML = `<i className="bi bi-check-lg"></i>`;
            target.classList.remove('btn-outline-primary');
            target.classList.add('btn-success');
            setTimeout(() => {
                target.innerHTML = originalIcon;
                target.classList.remove('btn-success');
                target.classList.add('btn-outline-primary');
            }, 2000);
        });
    };

    return (
        <div className="col-md-12 mb-4">
            <div className="card link-card shadow-sm border-0 h-100">
                <div className="card-body p-4">
                    <div className="d-flex flex-column flex-md-row justify-content-between align-items-start">
                        <div className="mb-3 mb-md-0">
                            <h5 className="card-title mb-1"><Link to={`/planning/${link.id}`} target="_blank" rel="noopener noreferrer" className="text-decoration-none text-dark">{link.title}</Link></h5>
                            <p className="text-muted mb-2">
                                <Link to={`/appointments?linkId=${link.id}`} className="text-decoration-none">
                                    <span className="badge bg-primary">{link.appointment_count}</span>
                                    <span className="ms-1">afspraken</span>
                                </Link>
                            </p>
                        </div>
                        <div className="d-flex align-items-center">
                            <Link to={`/planning/${link.id}`} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-outline-secondary" title="Test Link"><i className="bi bi-eye me-1"></i> <span className="d-none d-md-inline">Test</span></Link>
                            <Link to={`/link-editor/${link.id}`} className="btn btn-sm btn-outline-secondary ms-2" title="Bewerk Link"><i className="bi bi-pencil me-1"></i> <span className="d-none d-md-inline">Bewerk</span></Link>
                            <button className="btn btn-sm btn-outline-secondary ms-2" onClick={() => onDuplicate(link.id)} title="Dupliceer Link"><i className="bi bi-copy me-1"></i> <span className="d-none d-md-inline">Dupliceer</span></button>
                            <button className="btn btn-sm btn-outline-danger ms-2" onClick={() => onDelete(link.id)} title="Verwijder Link"><i className="bi bi-trash me-1"></i> <span className="d-none d-md-inline">Verwijder</span></button>
                        </div>
                    </div>
                    <div className="mt-3">
                        <label className="form-label small text-muted">Deelbare Link</label>
                        <div className="input-group">
                            <input type="text" className="form-control form-control-sm" value={shareUrl} readOnly />
                            <button className="btn btn-sm btn-outline-primary" onClick={handleCopy} title="Kopieer Link"><i className="bi bi-clipboard"></i></button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};


// --- Main Dashboard Component ---

function Dashboard() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [data, setData] = useState({ totalAppointments: 0, timeSavedMinutes: 0, links: [], calendars: [] });

    const fetchData = async () => {
        try {
            setLoading(true);
            const url = `${apiRoutes.general.prefix}${apiRoutes.general.dashboardSummary}`;
            const { data: summaryData } = await apiClient.get(url);
            setData(summaryData);
        } catch (err) {
            setError(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleDuplicate = async (linkId) => {
        if (!confirm('Weet je zeker dat je deze link wilt dupliceren?')) return;
        try {
            const url = `${apiRoutes.links.prefix}${apiRoutes.links.duplicate(linkId)}`;
            await apiClient.post(url);
            fetchData(); // Refresh data
        } catch (err) {
            alert(`Kon de link niet dupliceren: ${err.message}`);
        }
    };

    const handleDelete = async (linkId) => {
        if (!confirm('Weet je zeker dat je deze link wilt verwijderen? Dit kan niet ongedaan worden gemaakt.')) return;
        try {
            const url = `${apiRoutes.links.prefix}${apiRoutes.links.delete(linkId)}`;
            await apiClient.delete(url);
            fetchData(); // Refresh data
        } catch (err) {
            alert(`Kon de link niet verwijderen: ${err.message}`);
        }
    };


    const timeSaved = `${Math.floor(data.timeSavedMinutes / 60)}h ${data.timeSavedMinutes % 60}m`;

    if (loading) {
        return (
            <div className="text-center p-5">
                <div className="spinner-border text-primary" style={{ width: '3rem', height: '3rem' }} role="status">
                    <span className="visually-hidden">Laden...</span>
                </div>
            </div>
        );
    }

    if (error) {
        if (error.status === 401) {
            const loginUrl = `${apiRoutes.auth.prefix}${apiRoutes.auth.login}`;
            return (
                <div className="alert alert-warning text-center">
                    <p>Je sessie is verlopen. Log opnieuw in.</p>
                    <a href={loginUrl} className="btn btn-primary">Opnieuw inloggen</a>
                </div>
            );
        }
        return <div className="alert alert-danger">Kon het dashboard niet laden: {error.message}</div>;
    }

    return (
        <>
            <div className="container my-5">
                <div className="d-flex justify-content-between align-items-center mb-4">
                    <h1 className="h2">Dashboard</h1>
                    <Link to="/link-editor" className="btn btn-primary">
                        <i className="bi bi-plus-lg me-1"></i> Nieuwe Link
                    </Link>
                </div>

                <div className="row g-4 mb-5">
                    <div className="col-md-6"><KpiCard icon="bi-calendar-check" title="Totaal Afspraken" value={data.totalAppointments} /></div>
                    <div className="col-md-6"><KpiCard icon="bi-clock-history" title="Tijd Bespaard" value={timeSaved} /></div>
                </div>

                <h2 className="h4 mb-3">Mijn Links</h2>
                <div className="row">
                    {data.links.length > 0 ? (
                        data.links.map(link => <LinkCard key={link.id} link={link} onDuplicate={handleDuplicate} onDelete={handleDelete} />)
                    ) : (
                        <div className="col-12"><div className="card card-body text-center text-muted">Je hebt nog geen links aangemaakt.</div></div>
                    )}
                </div>

                <div className="row mt-4">
                    <div className="col-12">
                        <div className="card shadow-sm border-0">
                            <div className="card-header bg-white"><h5 className="mb-0">Agenda Leaderboard</h5></div>
                            <ul className="list-group list-group-flush">
                                {data.calendars.length > 0 ? (
                                    data.calendars.map(cal => (
                                        <li key={cal.calendar_id} className="list-group-item d-flex justify-content-between align-items-center">
                                            <span><i className="bi bi-calendar3 me-2 text-muted"></i>{cal.calendar_id}</span>
                                            <span className="badge bg-secondary rounded-pill">{cal.appointment_count}</span>
                                        </li>
                                    ))
                                ) : (
                                    <li className="list-group-item text-center text-muted">Nog geen afspraken om een leaderboard te tonen.</li>
                                )}
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}

export default Dashboard;
