import React, { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import HomePage from './pages/HomePage';
import WikiSession from './pages/WikiSession';
import './App.css';

function App() {
  const [sessionData, setSessionData] = useState(null);

  return (
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
  );
}

export default App;

