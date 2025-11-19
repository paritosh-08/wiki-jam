import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import AuthForm from '../components/AuthForm';
import './HomePage.css';

function HomePage({ onSessionStart }) {
  const [mode, setMode] = useState(null); // 'create' or 'join' or 'sessions'
  const [username, setUsername] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const navigate = useNavigate();
  const { user, token, isAuthenticated, signOut: authSignOut } = useAuth();

  // Fetch user's sessions when authenticated
  useEffect(() => {
    if (isAuthenticated && token) {
      fetchUserSessions();
    }
  }, [isAuthenticated, token]);

  const fetchUserSessions = async () => {
    setLoadingSessions(true);
    try {
      const response = await fetch('/api/session/my-sessions', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setSessions(data.sessions);
      }
    } catch (err) {
      console.error('Error fetching sessions:', err);
    } finally {
      setLoadingSessions(false);
    }
  };

  const handleRejoinSession = (sessionId) => {
    onSessionStart({ sessionId, token });
    navigate(`/session/${sessionId}`);
  };

  const handleCreateSession = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/session/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ username: user?.displayName || user?.email || 'Anonymous' })
      });

      if (!response.ok) {
        throw new Error('Failed to create session');
      }

      const data = await response.json();
      onSessionStart({ ...data, token });
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

    if (!secretKey.trim()) {
      setError('Please enter a secret key');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/session/join', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          username: user?.displayName || user?.email || 'Anonymous',
          secretKey: secretKey.trim()
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to join session');
      }

      const data = await response.json();
      onSessionStart({ ...data, token });
      navigate(`/session/${data.sessionId}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Show auth form if not authenticated
  if (!isAuthenticated) {
    return <AuthForm onAuthSuccess={() => {}} />;
  }

  if (!mode) {
    return (
      <div className="home-page">
        <div className="home-container">
          <div className="home-header">
            <div className="header-content">
              <h1 className="home-title">📝 Wiki Jam</h1>
              <p className="home-subtitle">Collaborative Wiki Editing Sessions</p>
            </div>
            <div className="user-info">
              <span className="user-email">{user?.email}</span>
              <button onClick={authSignOut} className="sign-out-button">
                Sign Out
              </button>
            </div>
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

            <button
              className="option-card"
              onClick={() => setMode('sessions')}
            >
              <div className="option-icon">📚</div>
              <h2>My Sessions</h2>
              <p>View and rejoin your previous sessions</p>
              {sessions.length > 0 && (
                <span className="session-count">{sessions.length}</span>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show user's sessions
  if (mode === 'sessions') {
    return (
      <div className="home-page">
        <div className="home-container">
          <button
            className="back-button"
            onClick={() => setMode(null)}
          >
            ← Back
          </button>

          <div className="sessions-header">
            <h1>📚 My Sessions</h1>
            <p>Sessions you've created or joined</p>
          </div>

          {loadingSessions ? (
            <div className="loading">Loading sessions...</div>
          ) : sessions.length === 0 ? (
            <div className="no-sessions">
              <div style={{ fontSize: '64px', marginBottom: '24px' }}>📚</div>
              <h2 style={{ marginBottom: '16px', color: '#1f2937' }}>No Sessions Yet</h2>
              <p>You haven't created or joined any sessions yet.</p>
              <button
                className="primary-button"
                onClick={() => setMode('create')}
              >
                🚀 Create Your First Session
              </button>
            </div>
          ) : (
            <div className="sessions-list">
              {sessions.map((session) => (
                <div key={session.id} className="session-card">
                  <div className="session-info-content">
                    <h3>{session.id}</h3>
                    <p className="session-creator">
                      {session.isCreator ? '👑 Created by you' : `Created by ${session.creator}`}
                    </p>
                    <p className="session-date">
                      {new Date(session.createdAt).toLocaleDateString()} at{' '}
                      {new Date(session.createdAt).toLocaleTimeString()}
                    </p>
                  </div>
                  <button
                    className="rejoin-button"
                    onClick={() => handleRejoinSession(session.id)}
                  >
                    Open Session →
                  </button>
                </div>
              ))}
            </div>
          )}
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
            {mode === 'create' && (
              <div className="form-group">
                <p className="session-info">
                  Creating session as: <strong>{user?.displayName || user?.email}</strong>
                </p>
              </div>
            )}

            {mode === 'join' && (
              <>
                <div className="form-group">
                  <p className="session-info">
                    Joining as: <strong>{user?.displayName || user?.email}</strong>
                  </p>
                </div>
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
              </>
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

