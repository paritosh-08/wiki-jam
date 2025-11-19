import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import WikiCard from '../components/WikiCard';
import WikiEditor from '../components/WikiEditor';
import GraphView from '../components/GraphView';
import SessionInfo from '../components/SessionInfo';
import Modal from '../components/Modal';
import './WikiSession.css';

function WikiSession({ sessionData }) {
  const { sessionId } = useParams();
  const [pages, setPages] = useState([]);
  const [selectedPage, setSelectedPage] = useState(null);
  const [pageHistory, setPageHistory] = useState([]); // Track navigation history
  const [initialMode, setInitialMode] = useState('preview'); // 'preview' or 'edit'
  const [showGraph, setShowGraph] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [newFileTitle, setNewFileTitle] = useState('');
  const [availableTags, setAvailableTags] = useState([]);
  const [selectedTags, setSelectedTags] = useState([]);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const fileInputRef = React.useRef(null);
  const filterDropdownRef = React.useRef(null);

  // Modal state
  const [modalState, setModalState] = useState({
    isOpen: false,
    title: '',
    content: null,
    type: 'info'
  });

  const showModal = (title, content, type = 'info') => {
    setModalState({ isOpen: true, title, content, type });
  };

  const closeModal = () => {
    setModalState({ isOpen: false, title: '', content: null, type: 'info' });
  };

  useEffect(() => {
    loadPages();
    loadTags();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target)) {
        setShowFilterDropdown(false);
      }
    };

    if (showFilterDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showFilterDropdown]);

  const loadPages = async () => {
    try {
      const response = await fetch(`/api/wiki/pages?sessionId=${sessionId}`);
      if (!response.ok) throw new Error('Failed to load pages');

      const data = await response.json();
      setPages(data.pages);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadTags = async () => {
    try {
      const response = await fetch(`/api/wiki/tags?sessionId=${sessionId}`);
      if (!response.ok) throw new Error('Failed to load tags');

      const data = await response.json();
      setAvailableTags(data.tags);
    } catch (err) {
      console.error('Error loading tags:', err);
    }
  };

  const handlePageClick = async (page) => {
    // Add current page to history if there is one
    if (selectedPage) {
      setPageHistory(prev => [...prev, selectedPage]);
    }

    // Fetch the latest page data from the server to ensure we have the most up-to-date content
    try {
      const response = await fetch(`/api/wiki/pages/${page.filename}?sessionId=${sessionData.sessionId}`);
      if (response.ok) {
        const data = await response.json();
        setSelectedPage(data.page);
      } else {
        // Fallback to cached page data if fetch fails
        setSelectedPage(page);
      }
    } catch (err) {
      console.error('Error fetching page:', err);
      // Fallback to cached page data if fetch fails
      setSelectedPage(page);
    }

    setInitialMode('preview'); // Open in preview mode when clicking from grid
    setShowGraph(false); // Close graph when opening a page
  };

  const handleCloseEditor = () => {
    setSelectedPage(null);
    setPageHistory([]); // Clear history when closing editor
    loadPages(); // Reload pages to get updated data
  };

  const handleCreateFile = async () => {
    if (!newFileName.trim()) {
      showModal('⚠️ Validation Error', (
        <p>Please enter a filename</p>
      ), 'warning');
      return;
    }

    try {
      const response = await fetch('/api/wiki/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          filename: newFileName.trim(),
          title: newFileTitle.trim() || newFileName.trim()
        })
      });

      if (!response.ok) throw new Error('Failed to create file');

      const data = await response.json();
      setShowCreateDialog(false);
      setNewFileName('');
      setNewFileTitle('');
      await loadPages();

      // Open the newly created file
      const newPage = pages.find(p => p.filename === data.filename);
      if (newPage) {
        handlePageClick(newPage);
      }
    } catch (err) {
      showModal('❌ Error Creating File', (
        <p style={{ color: '#dc2626' }}>{err.message}</p>
      ), 'error');
    }
  };

  const handleUploadFiles = async (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }

    try {
      const response = await fetch(`/api/wiki/upload?sessionId=${sessionId}`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) throw new Error('Failed to upload files');

      const data = await response.json();

      // Build modal content based on results
      const hasSuccess = data.uploadedCount > 0;
      const hasFailures = data.failedCount > 0;

      let modalType = 'info';
      let modalTitle = 'Upload Results';

      if (hasSuccess && !hasFailures) {
        modalType = 'success';
        modalTitle = '✅ Upload Successful';
      } else if (hasFailures && !hasSuccess) {
        modalType = 'error';
        modalTitle = '⚠️ Upload Failed';
      } else if (hasSuccess && hasFailures) {
        modalType = 'warning';
        modalTitle = '⚠️ Partial Upload';
      }

      const content = (
        <div>
          {hasSuccess && (
            <div style={{ marginBottom: hasFailures ? '20px' : '0' }}>
              <p style={{ color: '#059669', fontWeight: '600', marginBottom: '8px' }}>
                ✅ Successfully uploaded {data.uploadedCount} file(s)
              </p>
              <ul style={{ margin: '0', paddingLeft: '20px' }}>
                {data.uploaded.map((file, idx) => (
                  <li key={idx} style={{ color: '#6b7280', marginBottom: '4px' }}>
                    {file.filename}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {hasFailures && (
            <div>
              <p style={{ color: '#dc2626', fontWeight: '600', marginBottom: '8px' }}>
                ⚠️ Failed to upload {data.failedCount} file(s)
              </p>
              <ul style={{ margin: '0 0 16px 0', paddingLeft: '20px' }}>
                {data.failed.map((file, idx) => (
                  <li key={idx} style={{ marginBottom: '12px' }}>
                    <div style={{ fontWeight: '500', color: '#1f2937' }}>{file.filename}</div>
                    <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>
                      Reason: {file.reason}
                    </div>
                  </li>
                ))}
              </ul>
              <div style={{
                background: '#fffbeb',
                border: '1px solid #fbbf24',
                borderRadius: '8px',
                padding: '12px',
                fontSize: '14px',
                color: '#92400e'
              }}>
                💡 <strong>Tip:</strong> Only valid HML (YAML) files with a "definition" structure can be uploaded.
              </div>
            </div>
          )}
        </div>
      );

      showModal(modalTitle, content, modalType);

      if (data.uploadedCount > 0) {
        await loadPages();
      }

      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      showModal('❌ Upload Error', (
        <p style={{ color: '#dc2626' }}>{err.message}</p>
      ), 'error');
    }
  };

  const handleDownloadZip = async () => {
    try {
      // Build URL with optional tag filter
      let url = `/api/wiki/download?sessionId=${sessionId}`;
      if (selectedTags.length > 0) {
        selectedTags.forEach(tag => {
          url += `&tags=${encodeURIComponent(tag)}`;
        });
      }

      const response = await fetch(url);

      if (!response.ok) throw new Error('Failed to download wiki');

      // Get the blob from response
      const blob = await response.blob();

      // Create a download link
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `wiki-${sessionId}.zip`;
      document.body.appendChild(a);
      a.click();

      // Cleanup
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);
    } catch (err) {
      showModal('❌ Download Error', (
        <p style={{ color: '#dc2626' }}>{err.message}</p>
      ), 'error');
    }
  };

  const handleDeleteSession = async () => {
    // Show confirmation dialog
    showModal('⚠️ Delete Session', (
      <div>
        <p style={{ marginBottom: '1rem' }}>
          Are you sure you want to delete this session? This will permanently delete:
        </p>
        <ul style={{ marginLeft: '1.5rem', marginBottom: '1rem' }}>
          <li>All wiki pages in this session</li>
          <li>All session data from the database</li>
          <li>All files from the file system</li>
        </ul>
        <p style={{ color: '#dc2626', fontWeight: 'bold' }}>
          This action cannot be undone!
        </p>
        <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
          <button
            className="button button-danger"
            onClick={async () => {
              closeModal();
              try {
                const response = await fetch('/api/session/delete', {
                  method: 'DELETE',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${sessionData.token}`
                  },
                  body: JSON.stringify({
                    sessionId: sessionData.sessionId,
                    secretKey: sessionData.secretKey // Fallback for non-authenticated sessions
                  })
                });

                if (!response.ok) {
                  const error = await response.json();
                  throw new Error(error.error || 'Failed to delete session');
                }

                showModal('✅ Success', (
                  <div>
                    <p style={{ color: '#059669', marginBottom: '1rem' }}>
                      Session deleted successfully!
                    </p>
                    <p>Redirecting to home page...</p>
                  </div>
                ), 'success');

                // Redirect to home page after 2 seconds
                setTimeout(() => {
                  window.location.href = '/';
                }, 2000);
              } catch (err) {
                showModal('❌ Error', (
                  <p style={{ color: '#dc2626' }}>Failed to delete session: {err.message}</p>
                ), 'error');
              }
            }}
          >
            Yes, Delete Session
          </button>
          <button
            className="button"
            onClick={closeModal}
          >
            Cancel
          </button>
        </div>
      </div>
    ), 'warning');
  };

  const handleBackButton = () => {
    if (pageHistory.length > 0) {
      // Go back to previous page
      const previousPage = pageHistory[pageHistory.length - 1];
      setPageHistory(prev => prev.slice(0, -1)); // Remove last item from history
      setSelectedPage(previousPage);
    } else {
      // No history, close the editor
      handleCloseEditor();
    }
  };

  const handleWikiLinkClick = async (title) => {
    try {
      const response = await fetch(`/api/wiki/find/${encodeURIComponent(title)}?sessionId=${sessionId}`);
      if (!response.ok) {
        console.error('Page not found:', title);
        return;
      }

      const data = await response.json();
      // Add current page to history before navigating
      if (selectedPage) {
        setPageHistory(prev => [...prev, selectedPage]);
      }
      setSelectedPage(data.page);
      setInitialMode('preview'); // Stay in preview mode when clicking wiki links
    } catch (err) {
      console.error('Error finding page:', err);
    }
  };

  const filteredPages = pages.filter(page => {
    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesSearch = (
        page.title.toLowerCase().includes(query) ||
        page.definition.toLowerCase().includes(query) ||
        (page.aliases && page.aliases.some(a => a.toLowerCase().includes(query)))
      );
      if (!matchesSearch) return false;
    }

    // Filter by selected tags (page must have ALL selected tags)
    if (selectedTags.length > 0) {
      const pageTags = page.tags || [];
      const hasAllTags = selectedTags.every(tag => pageTags.includes(tag));
      if (!hasAllTags) return false;
    }

    return true;
  });

  if (showGraph) {
    return (
      <GraphView
        pages={pages}
        onPageClick={handlePageClick}
        onClose={() => setShowGraph(false)}
      />
    );
  }

  if (selectedPage) {
    return (
      <WikiEditor
        page={selectedPage}
        sessionData={sessionData}
        onClose={handleCloseEditor}
        onBack={handleBackButton}
        hasHistory={pageHistory.length > 0}
        onWikiLinkClick={handleWikiLinkClick}
        initialMode={initialMode}
      />
    );
  }

  return (
    <div className="wiki-session">
      <div className="session-header">
        <div className="header-content">
          <h1>📝 Wiki Jam Session</h1>
          <SessionInfo sessionData={sessionData} sessionId={sessionId} />
        </div>
      </div>

      <div className="session-content">
        <div className="search-bar">
          <input
            type="text"
            className="input search-input"
            placeholder="🔍 Search wiki pages..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          <div className="action-buttons">
            {/* Filter Button with Dropdown */}
            {availableTags.length > 0 && (
              <div style={{ position: 'relative' }} ref={filterDropdownRef}>
                <button
                  className="action-button"
                  onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                  style={{
                    backgroundColor: selectedTags.length > 0 ? '#3b82f6' : undefined,
                    color: selectedTags.length > 0 ? 'white' : undefined,
                    position: 'relative'
                  }}
                >
                  🏷️ Filter
                  {selectedTags.length > 0 && (
                    <span style={{
                      marginLeft: '0.5rem',
                      padding: '0.125rem 0.5rem',
                      borderRadius: '9999px',
                      backgroundColor: 'rgba(255, 255, 255, 0.3)',
                      fontSize: '0.75rem',
                      fontWeight: '600'
                    }}>
                      {selectedTags.length}
                    </span>
                  )}
                </button>

                {/* Dropdown Menu */}
                {showFilterDropdown && (
                  <div style={{
                    position: 'absolute',
                    top: 'calc(100% + 0.5rem)',
                    left: 0,
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '0.5rem',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                    minWidth: '200px',
                    maxWidth: '300px',
                    zIndex: 1000,
                    animation: 'slideDown 0.2s ease-out'
                  }}>
                    <div style={{
                      padding: '0.75rem 1rem',
                      borderBottom: '1px solid #e5e7eb',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <span style={{
                        fontSize: '0.875rem',
                        fontWeight: '600',
                        color: '#374151'
                      }}>
                        Filter by Tags
                      </span>
                      {selectedTags.length > 0 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTags([]);
                          }}
                          style={{
                            fontSize: '0.75rem',
                            color: '#ef4444',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '0.25rem 0.5rem',
                            borderRadius: '0.25rem',
                            fontWeight: '500'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#fee2e2';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent';
                          }}
                        >
                          Clear all
                        </button>
                      )}
                    </div>

                    <div style={{
                      maxHeight: '300px',
                      overflowY: 'auto',
                      padding: '0.5rem'
                    }}>
                      {availableTags.map(tag => {
                        const isSelected = selectedTags.includes(tag);
                        return (
                          <label
                            key={tag}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              padding: '0.5rem 0.75rem',
                              cursor: 'pointer',
                              borderRadius: '0.375rem',
                              transition: 'background-color 0.15s'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = '#f3f4f6';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent';
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {
                                if (isSelected) {
                                  setSelectedTags(selectedTags.filter(t => t !== tag));
                                } else {
                                  setSelectedTags([...selectedTags, tag]);
                                }
                              }}
                              style={{
                                width: '1rem',
                                height: '1rem',
                                marginRight: '0.75rem',
                                cursor: 'pointer',
                                accentColor: '#3b82f6'
                              }}
                            />
                            <span style={{
                              fontSize: '0.875rem',
                              color: '#374151',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem'
                            }}>
                              <span>🏷️</span>
                              <span>{tag}</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            <button
              className="action-button"
              onClick={() => setShowCreateDialog(true)}
            >
              ➕ New File
            </button>
            <button
              className="action-button"
              onClick={() => fileInputRef.current?.click()}
            >
              📤 Upload
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".hml"
              style={{ display: 'none' }}
              onChange={handleUploadFiles}
            />
            <button
              className="action-button"
              onClick={loadPages}
              disabled={loading}
            >
              🔄 Refresh
            </button>
            <button
              className="action-button"
              onClick={handleDownloadZip}
              disabled={pages.length === 0}
            >
              📥 Download ZIP
            </button>
            <button
              className="graph-view-button"
              onClick={() => setShowGraph(true)}
            >
              📊 Graph View
            </button>
            <button
              className="action-button button-danger"
              onClick={handleDeleteSession}
              style={{ marginLeft: 'auto', backgroundColor: '#dc2626', color: 'white' }}
            >
              🗑️ Delete Session
            </button>
          </div>
        </div>

        {loading && (
          <div className="loading">Loading wiki pages...</div>
        )}

        {error && (
          <div className="error">{error}</div>
        )}

        {!loading && !error && (
          <>
            <div className="pages-count">
              {filteredPages.length} page{filteredPages.length !== 1 ? 's' : ''}
              {searchQuery && ` matching "${searchQuery}"`}
              {selectedTags.length > 0 && ` with tag${selectedTags.length !== 1 ? 's' : ''}: ${selectedTags.join(', ')}`}
            </div>
            
            <div className="wiki-grid">
              {filteredPages.map((page) => (
                <WikiCard
                  key={page.filename}
                  page={page}
                  onClick={() => handlePageClick(page)}
                />
              ))}
            </div>
          </>
        )}

        {!loading && !error && filteredPages.length === 0 && (
          <div className="no-results">
            {pages.length === 0 ? (
              <div>
                <p>No wiki pages in this session yet.</p>
                <p>Create a new file or upload existing files to get started!</p>
              </div>
            ) : (
              <div>No pages found{searchQuery && ` matching "${searchQuery}"`}</div>
            )}
          </div>
        )}
      </div>

      {/* Create File Dialog */}
      {showCreateDialog && (
        <div className="dialog-overlay" onClick={() => setShowCreateDialog(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h2>Create New Wiki Page</h2>
            <div className="form-group">
              <label>Filename (without .hml extension):</label>
              <input
                type="text"
                className="input"
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                placeholder="e.g., my_page"
                autoFocus
              />
            </div>
            <div className="form-group">
              <label>Title (optional):</label>
              <input
                type="text"
                className="input"
                value={newFileTitle}
                onChange={(e) => setNewFileTitle(e.target.value)}
                placeholder="e.g., My Page Title"
              />
            </div>
            <div className="dialog-buttons">
              <button className="button" onClick={handleCreateFile}>
                Create
              </button>
              <button
                className="button button-secondary"
                onClick={() => {
                  setShowCreateDialog(false);
                  setNewFileName('');
                  setNewFileTitle('');
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal for notifications */}
      <Modal
        isOpen={modalState.isOpen}
        onClose={closeModal}
        title={modalState.title}
        type={modalState.type}
      >
        {modalState.content}
      </Modal>
    </div>
  );
}

export default WikiSession;

