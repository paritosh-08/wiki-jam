import { useEffect, useRef, useState } from 'react';
import ShareDB from 'sharedb/lib/client';
import ReconnectingWebSocket from 'reconnecting-websocket';
import './CollaborativeEditor.css';

/**
 * Collaborative text editor using ShareDB for real-time synchronization
 */
function CollaborativeEditor({ filename, initialValue, onChange, placeholder, className, sessionData }) {
  const textareaRef = useRef(null);
  const editorContainerRef = useRef(null);
  const [doc, setDoc] = useState(null);
  const [docReady, setDocReady] = useState(false);
  const [users, setUsers] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const suppressChangeRef = useRef(false);
  const presenceSocketRef = useRef(null);

  // Generate a random user ID and color
  const userIdRef = useRef(`user-${Math.random().toString(36).substr(2, 9)}`);
  const userColorRef = useRef(`hsl(${Math.random() * 360}, 70%, 60%)`);

  // Get username from sessionData or generate a fallback
  const userName = sessionData?.username || 'User ' + userIdRef.current.substring(userIdRef.current.length - 4);

  // Auto-resize textarea
  const autoResize = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.max(textarea.scrollHeight, 150) + 'px';
    }
  };

  // Auto-resize on mount and when textarea content changes
  useEffect(() => {
    autoResize();
  }, [initialValue]);

  // Watch for external changes to initialValue and update the document
  useEffect(() => {
    if (!doc || !docReady || !textareaRef.current || suppressChangeRef.current) return;

    const currentContent = doc.data?.content || '';
    const newContent = initialValue || '';

    // Only update if the content is actually different
    if (currentContent !== newContent) {
      // Submit operation to replace entire content
      const op = [{ p: ['content'], od: currentContent, oi: newContent }];
      doc.submitOp(op, { source: userIdRef.current }, (err) => {
        if (err) {
          console.error('Error updating document:', err);
          return;
        }

        // Update textarea
        suppressChangeRef.current = true;
        textareaRef.current.value = newContent;
        suppressChangeRef.current = false;

        // Auto-resize after update
        setTimeout(autoResize, 0);
      });
    }
  }, [initialValue, doc, docReady]);

  // Send cursor position update
  const sendCursorUpdate = () => {
    const textarea = textareaRef.current;
    const socket = presenceSocketRef.current;

    if (textarea && socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'cursor-update',
        userId: userIdRef.current,
        filename: filename,
        cursorPosition: textarea.selectionStart,
        selectionEnd: textarea.selectionEnd
      }));
    }
  };

  useEffect(() => {
    if (!filename) return;

    // Determine WebSocket URL based on environment
    const getWebSocketUrl = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;

      // In development (localhost:5173), connect directly to backend
      if (window.location.hostname === 'localhost' && window.location.port === '5173') {
        return 'ws://localhost:3001';
      }

      // In production (served via nginx or Cloudflare), use /ws path
      return `${protocol}//${host}/ws`;
    };

    const wsBaseUrl = getWebSocketUrl();

    // Create ShareDB WebSocket connection
    const shareSocket = new ReconnectingWebSocket(wsBaseUrl);
    const shareConnection = new ShareDB.Connection(shareSocket);

    // Create separate presence WebSocket connection
    // In production, use /ws/presence; in development, use /presence
    const presenceUrl = window.location.hostname === 'localhost' && window.location.port === '5173'
      ? 'ws://localhost:3001/presence'
      : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/presence`;
    const presenceSocket = new ReconnectingWebSocket(presenceUrl);

    // Get or create the document - include sessionId in document ID
    const docId = `${sessionData.sessionId}/${filename}`;
    const shareDoc = shareConnection.get('wiki-pages', docId);

    shareSocket.addEventListener('open', () => {
      console.log('✅ Connected to ShareDB server');
      setIsConnected(true);
    });

    shareSocket.addEventListener('close', () => {
      console.log('❌ Disconnected from ShareDB server');
      setIsConnected(false);
    });

    // Store presence socket reference
    presenceSocketRef.current = presenceSocket;

    // Handle presence connection
    presenceSocket.addEventListener('open', () => {
      console.log('👥 Connected to presence server');

      // Send user info
      presenceSocket.send(JSON.stringify({
        type: 'user-info',
        userId: userIdRef.current,
        userName: userName,
        color: userColorRef.current,
        filename: filename,
        cursorPosition: 0,
        selectionEnd: 0
      }));
    });

    presenceSocket.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'presence') {
          // Filter users to only show those editing the same document
          const documentUsers = (data.users || []).filter(u => u.filename === filename && u.userId !== userIdRef.current);
          setUsers(documentUsers);
        }
      } catch (err) {
        console.error('Error parsing presence message:', err);
      }
    });
    
    // Subscribe to the document
    shareDoc.subscribe((err) => {
      if (err) {
        console.error('Error subscribing to document:', err);
        return;
      }

      console.log('📄 Subscribed to document:', filename);

      // Initialize document if it doesn't exist
      if (shareDoc.type === null) {
        shareDoc.create({ content: initialValue || '' }, (err) => {
          if (err) {
            console.error('Error creating document:', err);
            return;
          }
          console.log('📝 Created new document');
          setDocReady(true);
        });
      } else {
        // Update textarea with document content
        if (textareaRef.current && shareDoc.data) {
          suppressChangeRef.current = true;
          textareaRef.current.value = shareDoc.data.content || '';
          if (onChange) {
            onChange(shareDoc.data.content || '');
          }
          suppressChangeRef.current = false;
          // Auto-resize after loading content
          setTimeout(autoResize, 0);
        }
        setDocReady(true);
      }
    });
    
    // Listen for remote changes
    shareDoc.on('op', (op, source) => {
      if (source === userIdRef.current) return; // Ignore own changes

      console.log('📥 Received operation:', op);

      if (textareaRef.current && shareDoc.data) {
        const textarea = textareaRef.current;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;

        suppressChangeRef.current = true;
        textarea.value = shareDoc.data.content || '';

        // Try to preserve cursor position
        textarea.setSelectionRange(start, end);

        if (onChange) {
          onChange(shareDoc.data.content || '');
        }
        suppressChangeRef.current = false;

        // Auto-resize after remote changes
        setTimeout(autoResize, 0);
      }
    });
    
    setDoc(shareDoc);

    // Cleanup
    return () => {
      setDocReady(false);
      shareDoc.destroy();
      shareConnection.close();
      shareSocket.close();
      presenceSocket.close();
    };
  }, [filename]);
  
  const handleChange = (e) => {
    if (suppressChangeRef.current) return;

    const newValue = e.target.value;

    if (doc && doc.type) {
      // Submit operation to ShareDB
      const op = [{ p: ['content'], od: doc.data.content, oi: newValue }];
      doc.submitOp(op, { source: userIdRef.current }, (err) => {
        if (err) {
          console.error('Error submitting operation:', err);
        }
      });
    }

    if (onChange) {
      onChange(newValue);
    }

    // Auto-resize and send cursor update
    autoResize();
    sendCursorUpdate();
  };

  // Handle cursor/selection changes
  const handleSelect = () => {
    sendCursorUpdate();
  };
  
  // Calculate cursor position in pixels accounting for line wrapping
  const getCursorCoordinates = (position) => {
    const textarea = textareaRef.current;
    const container = editorContainerRef.current;
    if (!textarea || !container) return { top: 0, left: 0 };

    // Use a hidden div that we temporarily make visible to measure cursor position
    // This approach creates a contenteditable div that matches the textarea exactly
    const computedStyle = window.getComputedStyle(textarea);
    const measureDiv = document.createElement('div');

    // Get padding values
    const paddingTop = parseFloat(computedStyle.paddingTop);
    const paddingLeft = parseFloat(computedStyle.paddingLeft);
    const paddingRight = parseFloat(computedStyle.paddingRight);

    // Calculate the content width
    const totalWidth = parseFloat(computedStyle.width);
    const borderLeft = parseFloat(computedStyle.borderLeftWidth);
    const borderRight = parseFloat(computedStyle.borderRightWidth);
    const contentWidth = totalWidth - paddingLeft - paddingRight - borderLeft - borderRight;

    // Copy all styles to match textarea rendering exactly
    measureDiv.contentEditable = 'true';
    measureDiv.style.position = 'absolute';
    measureDiv.style.visibility = 'hidden';
    measureDiv.style.top = '-9999px';
    measureDiv.style.left = '-9999px';
    measureDiv.style.whiteSpace = 'pre-wrap'; // Match textarea wrapping
    measureDiv.style.overflowWrap = 'break-word'; // Match textarea word breaking
    measureDiv.style.width = `${contentWidth}px`;
    measureDiv.style.font = computedStyle.font;
    measureDiv.style.fontSize = computedStyle.fontSize;
    measureDiv.style.fontFamily = computedStyle.fontFamily;
    measureDiv.style.fontWeight = computedStyle.fontWeight;
    measureDiv.style.lineHeight = computedStyle.lineHeight;
    measureDiv.style.letterSpacing = computedStyle.letterSpacing;
    measureDiv.style.padding = '0';
    measureDiv.style.border = 'none';
    measureDiv.style.margin = '0';
    measureDiv.style.boxSizing = 'content-box';

    document.body.appendChild(measureDiv);

    // Set the text content
    measureDiv.textContent = textarea.value;

    // Create a range and set it to the cursor position
    const range = document.createRange();
    const textNode = measureDiv.firstChild;

    if (textNode && textNode.nodeType === Node.TEXT_NODE) {
      // Set the range to the cursor position
      const cursorPos = Math.min(position, textNode.length);
      range.setStart(textNode, cursorPos);
      range.setEnd(textNode, cursorPos);

      // Get the bounding rect of the range (this is where the cursor would be)
      const rangeRect = range.getBoundingClientRect();
      const divRect = measureDiv.getBoundingClientRect();

      // Calculate position relative to the div
      const top = rangeRect.top - divRect.top;
      const left = rangeRect.left - divRect.left;

      // Clean up
      document.body.removeChild(measureDiv);

      // Get textarea's position relative to the editor container
      const textareaRect = textarea.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const textareaOffsetTop = textareaRect.top - containerRect.top;
      const textareaOffsetLeft = textareaRect.left - containerRect.left;

      // Add textarea padding and offset to get the final position relative to container
      return {
        top: top + paddingTop + textareaOffsetTop,
        left: left + paddingLeft + textareaOffsetLeft
      };
    }

    // Fallback if no text node
    document.body.removeChild(measureDiv);
    return { top: paddingTop, left: paddingLeft };
  };

  return (
    <div className="collaborative-editor">
      <div className="editor-header">
        <div className="connection-status">
          <span className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}></span>
          <span className="status-text">
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        {users.length > 0 && (
          <div className="active-users">
            <span className="users-label">Active users:</span>
            {users.map((user, index) => (
              <div
                key={index}
                className="user-avatar"
                style={{ backgroundColor: user.color }}
                title={user.userName}
              >
                {user.userName.charAt(0)}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="editor-container" ref={editorContainerRef}>
        <textarea
          ref={textareaRef}
          onChange={handleChange}
          onSelect={handleSelect}
          onKeyUp={handleSelect}
          onClick={handleSelect}
          placeholder={placeholder}
          className={className}
          defaultValue={initialValue}
        />
        {/* Render cursor indicators for other users */}
        {users.map((user, index) => {
          const coords = getCursorCoordinates(user.cursorPosition || 0);
          return (
            <div
              key={index}
              className="remote-cursor"
              style={{
                top: `${coords.top}px`,
                left: `${coords.left}px`,
                borderColor: user.color
              }}
            >
              <div
                className="cursor-label"
                style={{ backgroundColor: user.color }}
              >
                {user.userName}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default CollaborativeEditor;
