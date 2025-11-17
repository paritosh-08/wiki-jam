import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './HomePage.css';

function HomePage({ onSessionStart }) {
  const [mode, setMode] = useState(null); // 'create' or 'join'
  const [username, setUsername] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleCreateSession = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!username.trim()) {
      setError('Please enter a username');
      return;
    }

    setLoading(true);
    
    try {
      const response = await fetch('/api/session/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim() })
      });

      if (!response.ok) {
        throw new Error('Failed to create session');
      }

      const data = await response.json();
      onSessionStart(data);
      navigate(`/session/${data.sessionId}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinSession = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!username.trim()) {
      setError('Please enter a username');
      return;
    }
    
    if (!secretKey.trim()) {
      setError('Please enter a secret key');
      return;
    }

    setLoading(true);
    
    try {
      const response = await fetch('/api/session/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          username: username.trim(),
          secretKey: secretKey.trim()
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to join session');
      }

      const data = await response.json();
      onSessionStart(data);
      navigate(`/session/${data.sessionId}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!mode) {
    return (
      <div className="home-page">
        <div className="home-container">
          <div className="home-header">
            <h1 className="home-title">📝 Wiki Jam</h1>
            <p className="home-subtitle">Collaborative Wiki Editing Sessions</p>
          </div>

          <div className="home-options">
            <button 
              className="option-card"
              onClick={() => setMode('create')}
            >
              <div className="option-icon">🚀</div>
              <h2>Create Session</h2>
              <p>Start a new wiki jam session</p>
            </button>

            <button 
              className="option-card"
              onClick={() => setMode('join')}
            >
              <div className="option-icon">🔗</div>
              <h2>Join Session</h2>
              <p>Join an existing session with a secret key</p>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="home-page">
      <div className="home-container">
        <button 
          className="back-button"
          onClick={() => {
            setMode(null);
            setError('');
            setUsername('');
            setSecretKey('');
          }}
        >
          ← Back
        </button>

        <div className="form-card">
          <h2>{mode === 'create' ? '🚀 Create Session' : '🔗 Join Session'}</h2>
          
          <form onSubmit={mode === 'create' ? handleCreateSession : handleJoinSession}>
            <div className="form-group">
              <label htmlFor="username">Name</label>
              <input
                id="username"
                type="text"
                className="input"
                placeholder="Enter your Name"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
              />
            </div>

            {mode === 'join' && (
              <div className="form-group">
                <label htmlFor="secretKey">Secret Key</label>
                <input
                  id="secretKey"
                  type="text"
                  className="input"
                  placeholder="Enter session secret key"
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value)}
                  disabled={loading}
                />
              </div>
            )}

            {error && <div className="error">{error}</div>}

            <button 
              type="submit" 
              className="button button-primary"
              disabled={loading}
              style={{ width: '100%', marginTop: '16px' }}
            >
              {loading ? 'Loading...' : mode === 'create' ? 'Create Session' : 'Join Session'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default HomePage;

