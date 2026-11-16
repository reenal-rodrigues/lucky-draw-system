import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { api, getStoredUser, clearAuthSession } from './services/api';
import AppLayout from './layouts/AppLayout';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import AdminDashboard from './pages/AdminDashboard';
import SellerDashboard from './pages/SellerDashboard';
import CustomerBookingPage from './pages/CustomerBookingPage';
import VerifyTicketPage from './pages/VerifyTicketPage';

export default function App() {
  const [user, setUser] = useState(() => getStoredUser());
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    const stored = getStoredUser();
    if (!stored) {
      setCheckingAuth(false);
      return;
    }

    api
      .getMe()
      .then((res) => {
        if (res.user) {
          setUser(res.user);
        }
      })
      .catch(() => {
        clearAuthSession();
        setUser(null);
      })
      .finally(() => {
        setCheckingAuth(false);
      });
  }, []);

  const handleLogout = () => {
    clearAuthSession();
    setUser(null);
  };

  if (checkingAuth) {
    return (
      <div className="loading-screen">
        <div className="spinner-ring" />
        <p>Loading Digital Lucky Draw System...</p>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Public Customer QR Booking Route */}
        <Route path="/book/:reservationToken" element={<CustomerBookingPage />} />

        {/* Public Digital Ticket Verification Route */}
        <Route path="/verify/:verificationToken" element={<VerifyTicketPage />} />

        {/* Login Route */}
        <Route
          path="/login"
          element={
            user ? (
              <Navigate to={user.role === 'ADMIN' ? '/admin' : '/seller'} replace />
            ) : (
              <LoginPage onLoginSuccess={(loggedInUser) => setUser(loggedInUser)} />
            )
          }
        />

        {/* Protected Administrator Portal */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute user={user} allowedRoles={['ADMIN']}>
              <AppLayout user={user} onLogout={handleLogout}>
                <AdminDashboard user={user} />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        {/* Protected Seller Portal */}
        <Route
          path="/seller"
          element={
            <ProtectedRoute user={user} allowedRoles={['SELLER']}>
              <AppLayout user={user} onLogout={handleLogout}>
                <SellerDashboard user={user} />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        {/* Default Redirect */}
        <Route
          path="*"
          element={
            <Navigate
              to={
                user
                  ? user.role === 'ADMIN'
                    ? '/admin'
                    : '/seller'
                  : '/login'
              }
              replace
            />
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

