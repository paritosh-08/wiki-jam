import React from 'react';
import './WikiCard.css';

function WikiCard({ page, onClick }) {
  const truncateText = (text, maxLength = 150) => {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  return (
    <div className="wiki-card" onClick={onClick}>
      <div className="wiki-card-header">
        <h3 className="wiki-card-title">{page.title}</h3>
        {page.linkCount > 0 && (
          <span className="wiki-card-links">
            🔗 {page.linkCount}
          </span>
        )}
      </div>
      
      <p className="wiki-card-definition">
        {truncateText(page.definition)}
      </p>

      {page.aliases && page.aliases.length > 0 && (
        <div className="wiki-card-aliases">
          <span className="alias-label">Aliases:</span>
          {page.aliases.slice(0, 3).map((alias, idx) => (
            <span key={idx} className="alias-tag">
              {alias}
            </span>
          ))}
          {page.aliases.length > 3 && (
            <span className="alias-tag">+{page.aliases.length - 3}</span>
          )}
        </div>
      )}

      <div className="wiki-card-footer">
        <span className="wiki-card-filename">{page.filename}</span>
      </div>
    </div>
  );
}

export default WikiCard;

