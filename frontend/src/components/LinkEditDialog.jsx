import { useState, useEffect, useRef } from 'react';
import { searchWikiPages, titleToId } from '../utils/wikiUtils';
import './LinkEditDialog.css';

/**
 * Dialog for inserting/editing links with wiki search
 * Features:
 * - Wiki page search with debouncing
 * - "Suggest Page" option for new pages
 * - Keyboard navigation
 * - Supports both wiki:// and external URLs
 */
function LinkEditDialog({ 
  show, 
  position, 
  initialUrl = '', 
  onInsert, 
  onCancel,
  sessionId 
}) {
  const [url, setUrl] = useState(initialUrl);
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  
  const dialogRef = useRef(null);
  const inputRef = useRef(null);
  const debounceTimerRef = useRef(null);

  // Check if value is already a URL
  const isUrl = (value) => {
    return /^(wiki:\/\/|https?:\/\/|mailto:|tel:|ftp:)/i.test(value.trim());
  };

  // Sync URL with initialUrl when dialog opens
  useEffect(() => {
    if (show) {
      setUrl(initialUrl);
      setSearchResults([]);
      setShowDropdown(false);
      setSelectedIndex(-1);
    }
  }, [show, initialUrl]);

  // Focus input when dialog opens
  useEffect(() => {
    if (show && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [show]);

  // Debounced wiki search
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Don't search if URL is empty or is already a URL
    if (!url.trim() || isUrl(url)) {
      setSearchResults([]);
      setShowDropdown(false);
      setLoading(false);
      return;
    }

    setLoading(true);

    debounceTimerRef.current = setTimeout(async () => {
      try {
        const results = await searchWikiPages(url, sessionId);
        setSearchResults(results);
        setShowDropdown(true);
        setSelectedIndex(-1);
      } catch (err) {
        setSearchResults([]);
        setShowDropdown(false);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [url, sessionId]);

  // Click outside to close
  useEffect(() => {
    if (!show) return;

    const handleClickOutside = (event) => {
      if (dialogRef.current && !dialogRef.current.contains(event.target)) {
        onCancel();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [show, onCancel]);

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (showDropdown) {
        setShowDropdown(false);
        setSelectedIndex(-1);
      } else {
        onCancel();
      }
      return;
    }

    if (!showDropdown) {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleInsert();
      }
      return;
    }

    // Calculate total options
    const showSuggestPage = url.trim() && 
      !searchResults.some(r => titleToId(r.title) === titleToId(url));
    const totalOptions = searchResults.length + (showSuggestPage ? 1 : 0);

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => prev < totalOptions - 1 ? prev + 1 : prev);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex === -1) {
          handleInsert();
        } else if (showSuggestPage && selectedIndex === 0) {
          handleSuggestPage();
        } else {
          const resultIndex = showSuggestPage ? selectedIndex - 1 : selectedIndex;
          if (resultIndex >= 0 && resultIndex < searchResults.length) {
            handleResultClick(searchResults[resultIndex]);
          }
        }
        break;
    }
  };

  const handleInsert = () => {
    onInsert(url);
  };

  const handleResultClick = (result) => {
    const wikiUrl = `wiki://${result.title}`;
    onInsert(wikiUrl);
  };

  const handleSuggestPage = () => {
    const wikiUrl = `wiki://${url}`;
    onInsert(wikiUrl);
  };

  if (!show) return null;

  const showSuggestPage = url.trim() && 
    !searchResults.some(r => titleToId(r.title) === titleToId(url));

  return (
    <div
      ref={dialogRef}
      className="link-edit-dialog"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
    >
      <div className="link-edit-field">
        <label className="link-edit-label">URL or Wiki Page</label>
        <div className="link-edit-input-wrapper">
          <input
            ref={inputRef}
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={handleKeyDown}
            className="link-edit-input"
            placeholder="Search wiki or enter URL..."
          />
          {loading && (
            <div className="link-edit-spinner">
              <div className="spinner" />
            </div>
          )}
        </div>

        {/* Search results dropdown */}
        {showDropdown && (searchResults.length > 0 || showSuggestPage) && (
          <div className="link-edit-dropdown">
            {/* Suggest Page option */}
            {showSuggestPage && (
              <button
                type="button"
                onClick={handleSuggestPage}
                className={`link-edit-result ${selectedIndex === 0 ? 'selected' : ''}`}
              >
                <div className="result-icon">✨</div>
                <div className="result-content">
                  <div className="result-title">
                    Suggest Page: <span className="result-badge">{url}</span>
                  </div>
                  <div className="result-subtitle">
                    Create link to wiki://{url}
                  </div>
                </div>
              </button>
            )}

            {/* Search results */}
            {searchResults.map((result, index) => (
              <button
                key={result.filename}
                type="button"
                onClick={() => handleResultClick(result)}
                className={`link-edit-result ${
                  selectedIndex === (showSuggestPage ? index + 1 : index) ? 'selected' : ''
                }`}
              >
                <div className="result-content">
                  <div className="result-title">{result.title}</div>
                  <div className="result-definition">{result.definition}</div>
                  <div className="result-subtitle">wiki://{result.title}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="link-edit-actions">
        <button onClick={onCancel} className="link-edit-btn link-edit-btn-cancel">
          Cancel
        </button>
        <button onClick={handleInsert} className="link-edit-btn link-edit-btn-insert">
          Insert Link
        </button>
      </div>
    </div>
  );
}

export default LinkEditDialog;

