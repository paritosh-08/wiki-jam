import React, { useState, useEffect, useRef, useCallback } from 'react';
import CollaborativeEditor from './CollaborativeEditor';
import TiptapCollaborativeEditor from './TiptapCollaborativeEditor';
import CommentsSidebar from './CommentsSidebar';
import Modal from './Modal';
import WikiLink from './WikiLink';
import LinkEditDialog from './LinkEditDialog';
import { parseWikiLinks } from '../utils/wikiUtils';
import './WikiEditor.css';

function WikiEditor({ page, sessionData, onClose, onBack, hasHistory, onWikiLinkClick, initialMode = 'preview' }) {
  const [title, setTitle] = useState(page.title || '');
  const [definition, setDefinition] = useState(page.definition || '');
  const [details, setDetails] = useState(page.details || '');
  const [aliases, setAliases] = useState(page.aliases || []);
  const [newAlias, setNewAlias] = useState('');
  const [tags, setTags] = useState(page.tags || []);
  const [newTag, setNewTag] = useState('');
  const [isEditing, setIsEditing] = useState(initialMode === 'edit');
  const [isSaving, setIsSaving] = useState(false);
  const [brokenLinks, setBrokenLinks] = useState(new Set());
  const [showComments, setShowComments] = useState(true);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkDialogPosition, setLinkDialogPosition] = useState({ x: 0, y: 0 });
  const [linkInsertField, setLinkInsertField] = useState(null); // 'definition' or 'details'
  const saveTimeoutRef = useRef(null);
  const currentPageRef = useRef(page.filename);
  const isInitialLoadRef = useRef(true);

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
      isInitialLoadRef.current = true; // Reset initial load flag when page changes
      setTitle(page.title || '');
      setDefinition(page.definition || '');
      setDetails(page.details || '');
      setAliases(page.aliases || []);
      setTags(page.tags || []);
      setNewAlias('');
      setNewTag('');
      setIsEditing(initialMode === 'edit'); // Set mode based on initialMode prop
    } else {
      // Even if filename hasn't changed, update aliases and tags in case they were modified
      setAliases(page.aliases || []);
      setTags(page.tags || []);
    }
  }, [page, initialMode]);

  // Render text with clickable wiki links using WikiLink component
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

      // Add the WikiLink component
      parts.push(
        <WikiLink
          key={`link-${idx}`}
          pageName={link.pageName}
          displayText={link.displayText}
          sessionId={sessionData.sessionId}
          onNavigate={onWikiLinkClick}
          onCreatePage={handleCreatePageFromLink}
        />
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

  // Handle creating a new page from a broken link
  const handleCreatePageFromLink = (pageName) => {
    showModal(
      'Create New Page',
      `The page "${pageName}" doesn't exist yet. Would you like to create it?`,
      'confirm',
      async () => {
        try {
          // Create the page with the title
          const filename = `${pageName.toLowerCase().replace(/\s+/g, '-')}.hml`;
          const response = await fetch('/api/wiki/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId: sessionData.sessionId,
              filename,
              title: pageName
            })
          });

          if (response.ok) {
            // Navigate to the new page
            onWikiLinkClick(pageName);
          } else {
            showModal('Error', 'Failed to create page', 'error');
          }
        } catch (err) {
          showModal('Error', 'Failed to create page: ' + err.message, 'error');
        }
      }
    );
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
      // Save page content
      const response = await fetch(`/api/wiki/pages/${filenameToSave}?sessionId=${sessionData.sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedPage)
      });

      if (response.ok) {
        // Save tags separately
        await fetch(`/api/wiki/pages/${filenameToSave}/tags?sessionId=${sessionData.sessionId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tags })
        });

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
  }, [page, title, definition, details, aliases, tags]);

  // Auto-save when content changes
  useEffect(() => {
    // Skip auto-save on initial load
    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false;
      return;
    }

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
  }, [title, definition, details, aliases, tags, handleSave, page.filename]);

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

  const handleAddTag = () => {
    if (!newTag.trim()) return;

    // Check if tag already exists
    if (tags.includes(newTag.trim())) {
      showModal('⚠️ Duplicate Tag', (
        <p>This tag already exists.</p>
      ), 'warning');
      return;
    }

    setTags([...tags, newTag.trim()]);
    setNewTag('');
  };

  const handleRemoveTag = (index) => {
    setTags(tags.filter((_, i) => i !== index));
  };

  // Handle inserting a link
  const handleInsertLink = (field) => {
    // Track which field we're inserting into
    setLinkInsertField(field);

    // Position dialog in center of screen
    setLinkDialogPosition({
      x: window.innerWidth / 2 - 200,
      y: window.innerHeight / 2 - 150
    });

    setShowLinkDialog(true);
  };

  // Handle link insertion from dialog
  const handleLinkInsert = (url) => {
    if (!linkInsertField) {
      setShowLinkDialog(false);
      return;
    }

    // Format the link - use page name from URL as display text
    let displayText = 'link text';
    if (url.startsWith('wiki://')) {
      displayText = url.replace('wiki://', '').replace(/-/g, ' ');
    }
    const linkText = `[${displayText}](${url})`;

    // Append the link to the appropriate field
    if (linkInsertField === 'definition') {
      const newValue = definition ? `${definition}\n${linkText}` : linkText;
      setDefinition(newValue);
    } else if (linkInsertField === 'details') {
      const newValue = details ? `${details}\n${linkText}` : linkText;
      setDetails(newValue);
    }

    // Close dialog
    setShowLinkDialog(false);
    setLinkInsertField(null);
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
          <button
            className="mode-button"
            onClick={() => setShowComments(!showComments)}
            title={showComments ? 'Hide Comments' : 'Show Comments'}
          >
            💬 {showComments ? 'Hide' : 'Show'} Comments
          </button>
          <button className="save-button" onClick={() => handleSave(false)}>
            💾 Save Now
          </button>
          <button className="delete-button" onClick={handleDelete}>
            🗑️ Delete
          </button>
        </div>
      </div>

      <div className="editor-container-with-sidebar">
        <div className="editor-main-content">
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
                <div className="form-group-header">
                  <label htmlFor="definition">Definition</label>
                  <button
                    type="button"
                    className="insert-link-button"
                    onClick={() => handleInsertLink('definition')}
                    title="Insert Link (Ctrl+K)"
                  >
                    🔗 Insert Link
                  </button>
                </div>
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
                <div className="form-group-header">
                  <label htmlFor="details">Details</label>
                  <button
                    type="button"
                    className="insert-link-button"
                    onClick={() => handleInsertLink('details')}
                    title="Insert Link (Ctrl+K)"
                  >
                    🔗 Insert Link
                  </button>
                </div>
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

              <div className="form-group">
                <label htmlFor="tags">Tags</label>
                <div className="aliases-editor">
                  <div className="aliases-list">
                    {tags.map((tag, idx) => (
                      <div key={idx} className="alias-tag" style={{ backgroundColor: '#3b82f6' }}>
                        <span>{tag}</span>
                        <button
                          type="button"
                          className="alias-remove"
                          onClick={() => handleRemoveTag(idx)}
                          title="Remove tag"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="alias-input-group">
                    <input
                      type="text"
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddTag();
                        }
                      }}
                      placeholder="Add a tag..."
                      className="alias-input"
                    />
                    <button
                      type="button"
                      onClick={handleAddTag}
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

              {tags && tags.length > 0 && (
                <div className="preview-section">
                  <h2>Tags</h2>
                  <div className="aliases-preview">
                    {tags.map((tag, idx) => (
                      <span key={idx} className="alias-tag-preview" style={{ backgroundColor: '#3b82f6' }}>🏷️ {tag}</span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        </div>

        {showComments && (
          <CommentsSidebar
            sessionId={sessionData.sessionId}
            pageFilename={page.filename}
          />
        )}
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

      {/* Link Edit Dialog */}
      <LinkEditDialog
        show={showLinkDialog}
        position={linkDialogPosition}
        initialUrl=""
        onInsert={handleLinkInsert}
        onCancel={() => setShowLinkDialog(false)}
        sessionId={sessionData.sessionId}
      />
    </div>
  );
}

export default WikiEditor;

