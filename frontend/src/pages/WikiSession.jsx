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
  const fileInputRef = React.useRef(null);

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
  }, []);

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
      const response = await fetch(`/api/wiki/download?sessionId=${sessionId}`);

      if (!response.ok) throw new Error('Failed to download wiki');

      // Get the blob from response
      const blob = await response.blob();

      // Create a download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `wiki-${sessionId}.zip`;
      document.body.appendChild(a);
      a.click();

      // Cleanup
      window.URL.revokeObjectURL(url);
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
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ secretKey: sessionData.secretKey })
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
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      page.title.toLowerCase().includes(query) ||
      page.definition.toLowerCase().includes(query) ||
      (page.aliases && page.aliases.some(a => a.toLowerCase().includes(query)))
    );
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

