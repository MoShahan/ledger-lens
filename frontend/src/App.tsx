import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';

import Health from './pages/Health';
import Inbox from './pages/Inbox';
import JobWait from './pages/JobWait';
import Review from './pages/Review';
import { ToastProvider } from './toast';

function Sidebar() {
  const { pathname } = useLocation();
  const inboxActive =
    pathname === '/' || pathname.startsWith('/jobs') || pathname.startsWith('/invoices');

  return (
    <aside className="sidebar">
      <Link to="/" className="brand" title="Go to inbox">
        <img className="brand-mark" src="/favicon.svg" alt="" width={28} height={28} />
        Ledger Lens
      </Link>

      <p className="nav-label">Navigate</p>
      <nav>
        <NavLink
          to="/"
          end
          className={inboxActive ? 'nav-link active' : 'nav-link'}
          title="Open the invoice inbox"
        >
          <span className="nav-icon" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect
                x="2"
                y="3"
                width="12"
                height="10"
                rx="2"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <path d="M2 6h12" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </span>
          Inbox
        </NavLink>
        <NavLink
          to="/health"
          className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
          title="Check whether the extract API is up"
        >
          <span className="nav-icon" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M2.5 8h2.2l1.3-3.2 2.2 6.4 1.4-3.2H13.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          Health
        </NavLink>
      </nav>

      <div className="sidebar-note">
        <p className="sidebar-note-title">How it works</p>
        <p>Review uncertain fields. Extracts stay in this browser and are not shared.</p>
      </div>
    </aside>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <div className="app-shell">
        <Sidebar />
        <main className="main">
          <Routes>
            <Route path="/" element={<Inbox />} />
            <Route path="/health" element={<Health />} />
            <Route path="/jobs/:jobId" element={<JobWait />} />
            <Route path="/invoices/:id" element={<Review />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </ToastProvider>
  );
}
