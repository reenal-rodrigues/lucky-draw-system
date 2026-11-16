import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ticket, Lock, User, Shield, KeyRound } from 'lucide-react';
import { api, setAuthSession } from '../services/api';

export default function LoginPage({ onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await api.login(username, password);
      setAuthSession(res.token, res.user);
      if (onLoginSuccess) {
        onLoginSuccess(res.user);
      }
      navigate(res.user.role === 'ADMIN' ? '/admin' : '/seller', { replace: true });
    } catch (err) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const fillQuickCredentials = (u, p) => {
    setUsername(u);
    setPassword(p);
    setError('');
  };

  return (
    <div className="login-page-wrapper">
      <div className="login-card">
        <div className="login-brand-header">
          <div className="login-logo-circle">
            <Ticket size={32} />
          </div>
          <h1>Digital Lucky Draw</h1>
          <p>Authorized Seller &amp; Administrator Portal</p>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <div className="input-with-icon">
              <User size={18} className="field-icon" />
              <input
                id="username"
                type="text"
                placeholder="Enter username (e.g., admin or seller01)"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <div className="input-with-icon">
              <Lock size={18} className="field-icon" />
              <input
                id="password"
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
          </div>

          <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={loading}>
            <KeyRound size={18} />
            <span>{loading ? 'Signing in...' : 'Sign In to Portal'}</span>
          </button>
        </form>

        <div className="quick-credentials-box">
          <div className="quick-cred-title">
            <Shield size={15} />
            <span>Quick Demo Credentials (Click to Fill)</span>
          </div>
          <div className="quick-cred-buttons">
            <button
              type="button"
              className="btn-cred"
              onClick={() => fillQuickCredentials('admin', 'Admin@123')}
            >
              <strong>Admin Portal</strong>
              <span>admin / Admin@123</span>
            </button>
            <button
              type="button"
              className="btn-cred"
              onClick={() => fillQuickCredentials('seller01', 'Seller@123')}
            >
              <strong>Seller 01 (Reenal)</strong>
              <span>seller01 / Seller@123</span>
            </button>
            <button
              type="button"
              className="btn-cred"
              onClick={() => fillQuickCredentials('seller02', 'Seller@123')}
            >
              <strong>Seller 02</strong>
              <span>seller02 / Seller@123</span>
            </button>
          </div>
          <p className="quick-cred-note">
            50 individual seller accounts (<code>seller01</code> to <code>seller50</code>) are pre-configured.
          </p>
        </div>
      </div>
    </div>
  );
}

