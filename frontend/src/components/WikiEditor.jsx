import React, { useState, useEffect, useRef, useCallback } from 'react';
import CollaborativeEditor from './CollaborativeEditor';
import Modal from './Modal';
import './WikiEditor.css';

function WikiEditor({ page, sessionData, onClose, onBack, hasHistory, onWikiLinkClick, initialMode = 'preview' }) {
  const [title, setTitle] = useState(page.title || '');
  const [definition, setDefinition] = useState(page.definition || '');
  const [details, setDetails] = useState(page.details || '');
  const [aliases, setAliases] = useState(page.aliases || []);
  const [newAlias, setNewAlias] = useState('');
  const [isEditing, setIsEditing] = useState(initialMode === 'edit');
  const [isSaving, setIsSaving] = useState(false);
  const [brokenLinks, setBrokenLinks] = useState(new Set());
  const saveTimeoutRef = useRef(null);
  const currentPageRef = useRef(page.filename);

  // Modal state
  const [modalState, setModalState] = useState({
    isOpen: false,
    title: '',
    content: null,
    type: 'info',
    onConfirm: null
  });

  const showModal = (title, content, type = 'info', onConfirm = null) => {
    setModalState({ isOpen: true, title, content, type, onConfirm });
  };

  const closeModal = () => {
    setModalState({ isOpen: false, title: '', content: null, type: 'info', onConfirm: null });
  };

  // Update state when page changes
  useEffect(() => {
    // Cancel any pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    // Update state with new page data
    if (page.filename !== currentPageRef.current) {
      currentPageRef.current = page.filename;
      setTitle(page.title || '');
      setDefinition(page.definition || '');
      setDetails(page.details || '');
      setAliases(page.aliases || []);
      setNewAlias('');
      setIsEditing(initialMode === 'edit'); // Set mode based on initialMode prop
    } else {
      // Even if filename hasn't changed, update aliases in case they were modified
      setAliases(page.aliases || []);
    }
  }, [page, initialMode]);

  // Check for broken links when content changes
  useEffect(() => {
    const checkLinks = async () => {
      const allText = `${definition} ${details}`;
      const links = parseWikiLinks(allText);
      const broken = new Set();

      for (const link of links) {
        try {
          const response = await fetch(`/api/wiki/find/${encodeURIComponent(link.pageName)}?sessionId=${sessionData.sessionId}`);
          if (!response.ok) {
            broken.add(link.pageName);
          }
        } catch (err) {
          broken.add(link.pageName);
        }
      }

      setBrokenLinks(broken);
    };

    checkLinks();
  }, [definition, details]);

  // Parse wiki links from text - format: [text](wiki://page)
  const parseWikiLinks = (text) => {
    if (!text) return [];
    const linkRegex = /\[([^\]]+)\]\(wiki:\/\/([^)]+)\)/g;
    const links = [];
    let match;
    while ((match = linkRegex.exec(text)) !== null) {
      links.push({
        fullText: match[0],
        displayText: match[1],
        pageName: match[2],
        index: match.index
      });
    }
    return links;
  };

  // Render text with clickable wiki links
  const renderWithLinks = (text) => {
    if (!text) return null;
    const links = parseWikiLinks(text);
    if (links.length === 0) return text;

    const parts = [];
    let lastIndex = 0;

    links.forEach((link, idx) => {
      // Add text before the link
      if (link.index > lastIndex) {
        parts.push(
          <span key={`text-${idx}`}>
            {text.substring(lastIndex, link.index)}
          </span>
        );
      }

      const isBroken = brokenLinks.has(link.pageName);

      // Add the clickable link
      parts.push(
        <a
          key={`link-${idx}`}
          href="#"
          className={`wiki-link ${isBroken ? 'broken' : ''}`}
          onClick={(e) => {
            e.preventDefault();
            if (!isBroken) {
              onWikiLinkClick(link.pageName);
            }
          }}
          title={isBroken ? `Page not found: ${link.pageName}` : `Go to ${link.pageName}`}
        >
          {link.displayText}
        </a>
      );

      lastIndex = link.index + link.fullText.length;
    });

    // Add remaining text
    if (lastIndex < text.length) {
      parts.push(
        <span key="text-end">
          {text.substring(lastIndex)}
        </span>
      );
    }

    return parts;
  };

  const handleSave = useCallback(async (silent = false, targetFilename = null) => {
    // Use targetFilename if provided, otherwise use current page
    const filenameToSave = targetFilename || page.filename;

    // Don't save if we've navigated away from this page
    if (targetFilename && targetFilename !== currentPageRef.current) {
      return;
    }

    if (!silent) {
      setIsSaving(true);
    }

    const updatedPage = {
      filename: page.filename,
      title,
      definition,
      details,
      aliases,
      sections: page.sections || []
    };

    try {
      const response = await fetch(`/api/wiki/pages/${filenameToSave}?sessionId=${sessionData.sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedPage)
      });

      if (response.ok) {
        if (!silent) {
          showModal('✅ Success', (
            <p style={{ color: '#059669' }}>Page saved successfully!</p>
          ), 'success');
        }
      } else {
        if (!silent) {
          showModal('❌ Save Failed', (
            <p style={{ color: '#dc2626' }}>Failed to save page</p>
          ), 'error');
        }
        console.error('Failed to save:', filenameToSave);
      }
    } catch (err) {
      console.error('Error saving page:', err);
      if (!silent) {
        showModal('❌ Save Error', (
          <p style={{ color: '#dc2626' }}>Failed to save page: {err.message}</p>
        ), 'error');
      }
    } finally {
      if (!silent) {
        setIsSaving(false);
      }
    }
  }, [page, title, definition, details, aliases]);

  // Auto-save when content changes
  useEffect(() => {
    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Capture current filename for the save
    const filenameForSave = page.filename;

    // Set new timeout to save after 1 second of no changes
    saveTimeoutRef.current = setTimeout(() => {
      handleSave(true, filenameForSave); // true = silent save, pass filename
    }, 1000);

    // Cleanup on unmount
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [title, definition, details, aliases, handleSave, page.filename]);

  const handleAddAlias = () => {
    if (!newAlias.trim()) return;

    // Check if alias already exists
    if (aliases.includes(newAlias.trim())) {
      showModal('⚠️ Duplicate Alias', (
        <p>This alias already exists.</p>
      ), 'warning');
      return;
    }

    setAliases([...aliases, newAlias.trim()]);
    setNewAlias('');
  };

  const handleRemoveAlias = (index) => {
    setAliases(aliases.filter((_, i) => i !== index));
  };

  const handleDelete = () => {
    // Show confirmation modal
    showModal(
      '⚠️ Confirm Delete',
      (
        <div>
          <p>Are you sure you want to delete <strong>"{page.filename}"</strong>?</p>
          <p style={{ color: '#dc2626', marginTop: '12px' }}>
            ⚠️ This action cannot be undone.
          </p>
        </div>
      ),
      'warning',
      async () => {
        // This function will be called when user confirms
        try {
          const response = await fetch(`/api/wiki/pages/${page.filename}?sessionId=${sessionData.sessionId}`, {
            method: 'DELETE'
          });

          if (!response.ok) throw new Error('Failed to delete page');

          showModal('✅ Deleted', (
            <p style={{ color: '#059669' }}>Page deleted successfully</p>
          ), 'success');

          // Close after a short delay to show the success message
          setTimeout(() => {
            closeModal();
            onClose();
          }, 1000);
        } catch (err) {
          showModal('❌ Delete Error', (
            <p style={{ color: '#dc2626' }}>Error deleting page: {err.message}</p>
          ), 'error');
        }
      }
    );
  };

  return (
    <div className="wiki-editor">
      <div className="editor-header">
        <div className="editor-header-left">
          <button className="back-button" onClick={onBack}>
            ← {hasHistory ? 'Back' : 'Back to Pages'}
          </button>
          <h2 className="editor-title">Editing: {page.filename}</h2>
          <span className="auto-save-indicator">
            {isSaving ? '💾 Saving...' : '✓ Auto-saved'}
          </span>
        </div>

        <div className="editor-header-right">
          <button
            className={`mode-button ${isEditing ? 'active' : ''}`}
            onClick={() => setIsEditing(true)}
          >
            ✏️ Edit
          </button>
          <button
            className={`mode-button ${!isEditing ? 'active' : ''}`}
            onClick={() => setIsEditing(false)}
          >
            👁️ Preview
          </button>
          <button className="save-button" onClick={() => handleSave(false)}>
            💾 Save Now
          </button>
          <button className="delete-button" onClick={handleDelete}>
            🗑️ Delete
          </button>
        </div>
      </div>

      <div className="editor-container">
        <div className="editor-form">
          {isEditing ? (
            <>
              <div className="form-group">
                <label htmlFor="title">Title</label>
                <input
                  id="title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="form-input"
                  placeholder="Page title"
                />
              </div>

              <div className="form-group">
                <label htmlFor="definition">Definition</label>
                <CollaborativeEditor
                  filename={`${page.filename}-definition`}
                  initialValue={definition}
                  onChange={setDefinition}
                  placeholder="Brief definition of the concept"
                  className="form-textarea"
                  sessionData={sessionData}
                />
              </div>

              <div className="form-group">
                <label htmlFor="details">Details</label>
                <CollaborativeEditor
                  filename={`${page.filename}-details`}
                  initialValue={details}
                  onChange={setDetails}
                  placeholder="Detailed information, examples, and notes"
                  className="form-textarea"
                  sessionData={sessionData}
                />
              </div>

              <div className="form-group">
                <label htmlFor="aliases">Aliases</label>
                <div className="aliases-editor">
                  <div className="aliases-list">
                    {aliases.map((alias, idx) => (
                      <div key={idx} className="alias-tag">
                        <span>{alias}</span>
                        <button
                          type="button"
                          className="alias-remove"
                          onClick={() => handleRemoveAlias(idx)}
                          title="Remove alias"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="alias-input-group">
                    <input
                      type="text"
                      value={newAlias}
                      onChange={(e) => setNewAlias(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddAlias();
                        }
                      }}
                      placeholder="Add an alias..."
                      className="alias-input"
                    />
                    <button
                      type="button"
                      onClick={handleAddAlias}
                      className="alias-add-button"
                    >
                      + Add
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="preview-section">
                <h1>{title}</h1>
              </div>

              {definition && (
                <div className="preview-section">
                  <h2>Definition</h2>
                  <p className="preview-text">{renderWithLinks(definition)}</p>
                </div>
              )}

              {details && (
                <div className="preview-section">
                  <h2>Details</h2>
                  <p className="preview-text">{renderWithLinks(details)}</p>
                </div>
              )}

              {aliases && aliases.length > 0 && (
                <div className="preview-section">
                  <h2>Aliases</h2>
                  <div className="aliases-preview">
                    {aliases.map((alias, idx) => (
                      <span key={idx} className="alias-tag-preview">{alias}</span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Modal for notifications */}
      <Modal
        isOpen={modalState.isOpen}
        onClose={closeModal}
        title={modalState.title}
        type={modalState.type}
        onConfirm={modalState.onConfirm}
      >
        {modalState.content}
      </Modal>
    </div>
  );
}

export default WikiEditor;

