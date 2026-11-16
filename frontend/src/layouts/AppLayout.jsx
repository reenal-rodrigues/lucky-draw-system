import React from 'react';
import { Ticket, LogOut, Shield, User } from 'lucide-react';

export default function AppLayout({ user, onLogout, children }) {
  return (
    <div className="app-shell">
      <header className="top-navbar">
        <div className="navbar-inner">
          <div className="brand-logo">
            <div className="brand-icon-badge">
              <Ticket size={22} />
            </div>
            <div>
              <h1 className="brand-title">Digital Lucky Draw</h1>
              <span className="brand-subtitle">Ticket Management System</span>
            </div>
          </div>

          {user && (
            <div className="navbar-user-controls">
              <div className="user-pill">
                {user.role === 'ADMIN' ? (
                  <Shield size={16} className="text-gold" />
                ) : (
                  <User size={16} className="text-emerald" />
                )}
                <div className="user-pill-text">
                  <span className="user-pill-name">{user.name}</span>
                  <span className="user-pill-role">
                    {user.role === 'ADMIN'
                      ? 'ADMINISTRATOR'
                      : `${user.sellerCode || 'SELLER'} • ${user.username}`}
                  </span>
                </div>
              </div>

              <button
                type="button"
                className="btn btn-outline btn-sm btn-logout"
                onClick={onLogout}
              >
                <LogOut size={15} />
                <span>Logout</span>
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="main-content-area">{children}</main>
    </div>
  );
}

