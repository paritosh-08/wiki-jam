import React, { useState } from 'react';
import './SessionInfo.css';

function SessionInfo({ sessionData, sessionId }) {
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(sessionData.secretKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="session-info">
      <div className="session-user">
        <span className="user-icon">👤</span>
        <span className="user-name">{sessionData.username}</span>
      </div>

      <div className="session-key">
        <button
          className="key-toggle"
          onClick={() => setShowKey(!showKey)}
        >
          🔑 {showKey ? sessionData.secretKey : '••••••••••••••••'}
        </button>
        <button
          className="copy-button"
          onClick={copyToClipboard}
          title="Copy secret key"
        >
          {copied ? '✓' : '📋'}
        </button>
      </div>
    </div>
  );
}

export default SessionInfo;

