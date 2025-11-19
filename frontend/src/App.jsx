import React, { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import HomePage from './pages/HomePage';
import WikiSession from './pages/WikiSession';
import './App.css';

function App() {
  const [sessionData, setSessionData] = useState(null);

  return (
    <AuthProvider>
      <div className="app">
        <Routes>
          <Route
            path="/"
            element={<HomePage onSessionStart={setSessionData} />}
          />
          <Route
            path="/session/:sessionId"
            element={
              sessionData ? (
                <WikiSession sessionData={sessionData} />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
        </Routes>
      </div>
    </AuthProvider>
  );
}

export default App;

