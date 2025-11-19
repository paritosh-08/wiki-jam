import { useEffect, useState, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import Mention from '@tiptap/extension-mention';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import tippy from 'tippy.js';
import 'tippy.js/dist/tippy.css';
import { useAuth } from '../contexts/AuthContext';
import MentionList from './MentionList';
import './TiptapCollaborativeEditor.css';

function TiptapCollaborativeEditor({ 
  sessionId, 
  pageFilename, 
  placeholder = 'Start typing...',
  onUpdate 
}) {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [sessionUsers, setSessionUsers] = useState([]);
  const ydocRef = useRef(null);
  const providerRef = useRef(null);

  // Initialize Yjs document and WebSocket provider
  useEffect(() => {
    if (!sessionId || !pageFilename) return;

    // Create Yjs document
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

    // Determine WebSocket URL
    const getWebSocketUrl = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;

      if (window.location.hostname === 'localhost' && window.location.port === '5173') {
        return 'ws://localhost:3001';
      }

      return `${protocol}//${host}/ws`;
    };

    const wsUrl = getWebSocketUrl();
    const docName = `${sessionId}/${pageFilename}`;

    // Create WebSocket provider
    const provider = new WebsocketProvider(wsUrl, docName, ydoc);
    providerRef.current = provider;

    // Set user awareness info
    provider.awareness.setLocalStateField('user', {
      name: user?.displayName || user?.email || 'Anonymous',
      color: `hsl(${Math.random() * 360}, 70%, 60%)`
    });

    // Listen for awareness changes
    provider.awareness.on('change', () => {
      const states = Array.from(provider.awareness.getStates().values());
      setUsers(states.map(state => state.user).filter(Boolean));
    });

    return () => {
      provider.destroy();
      ydoc.destroy();
    };
  }, [sessionId, pageFilename, user]);

  // Fetch session users for mentions
  const { token } = useAuth();

  useEffect(() => {
    const fetchSessionUsers = async () => {
      try {
        const response = await fetch(`/api/users/session/${sessionId}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (response.ok) {
          const data = await response.json();
          setSessionUsers(data.users || []);
        }
      } catch (err) {
        console.error('Error fetching session users:', err);
      }
    };

    if (sessionId && token) {
      fetchSessionUsers();
    }
  }, [sessionId, token]);

  // Initialize Tiptap editor
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        history: false, // Disable history as Yjs handles it
      }),
      Collaboration.configure({
        document: ydocRef.current,
      }),
      CollaborationCursor.configure({
        provider: providerRef.current,
      }),
      Link.configure({
        openOnClick: false,
      }),
      Placeholder.configure({
        placeholder,
      }),
      Mention.configure({
        HTMLAttributes: {
          class: 'mention',
        },
        suggestion: {
          items: ({ query }) => {
            if (!query) return sessionUsers.slice(0, 5);

            const lowerQuery = query.toLowerCase();

            // Score each user based on match quality
            const scoredUsers = sessionUsers.map(user => {
              const displayName = user.displayName.toLowerCase();
              const email = user.email.toLowerCase();
              let score = 0;

              // Exact match (highest priority)
              if (displayName === lowerQuery || email === lowerQuery) {
                score = 1000;
              }
              // Starts with query (high priority)
              else if (displayName.startsWith(lowerQuery) || email.startsWith(lowerQuery)) {
                score = 500;
              }
              // Contains query (medium priority)
              else if (displayName.includes(lowerQuery) || email.includes(lowerQuery)) {
                score = 100;
              }
              // Fuzzy match - check if all characters in query appear in order
              else {
                let queryIndex = 0;
                for (let i = 0; i < displayName.length && queryIndex < lowerQuery.length; i++) {
                  if (displayName[i] === lowerQuery[queryIndex]) {
                    queryIndex++;
                  }
                }
                if (queryIndex === lowerQuery.length) {
                  score = 50; // Fuzzy match (lower priority)
                }

                // Also check email for fuzzy match
                queryIndex = 0;
                for (let i = 0; i < email.length && queryIndex < lowerQuery.length; i++) {
                  if (email[i] === lowerQuery[queryIndex]) {
                    queryIndex++;
                  }
                }
                if (queryIndex === lowerQuery.length) {
                  score = Math.max(score, 50);
                }
              }

              return { user, score };
            });

            // Filter out non-matches and sort by score
            return scoredUsers
              .filter(item => item.score > 0)
              .sort((a, b) => b.score - a.score)
              .map(item => item.user)
              .slice(0, 5);
          },
          render: () => {
            let component;
            let popup;

            return {
              onStart: props => {
                component = new MentionList(props);
                popup = tippy('body', {
                  getReferenceClientRect: props.clientRect,
                  appendTo: () => document.body,
                  content: component.element,
                  showOnCreate: true,
                  interactive: true,
                  trigger: 'manual',
                  placement: 'bottom-start',
                });
              },
              onUpdate(props) {
                component.updateProps(props);
                popup[0].setProps({
                  getReferenceClientRect: props.clientRect,
                });
              },
              onKeyDown(props) {
                if (props.event.key === 'Escape') {
                  popup[0].hide();
                  return true;
                }
                return component.onKeyDown(props);
              },
              onExit() {
                popup[0].destroy();
                component.destroy();
              },
            };
          },
        },
      }),
    ],
    onUpdate: ({ editor }) => {
      if (onUpdate) {
        onUpdate(editor.getHTML());
      }
    },
  }, [ydocRef.current, providerRef.current, sessionUsers]);

  if (!editor) {
    return <div className="tiptap-loading">Loading editor...</div>;
  }

  return (
    <div className="tiptap-collaborative-editor">
      <div className="editor-header">
        <div className="active-users">
          {users.length > 0 && (
            <>
              <span className="users-label">Active:</span>
              {users.map((user, index) => (
                <div
                  key={index}
                  className="user-avatar"
                  style={{ backgroundColor: user.color }}
                  title={user.name}
                >
                  {user.name.charAt(0).toUpperCase()}
                </div>
              ))}
            </>
          )}
        </div>
      </div>
      <EditorContent editor={editor} className="editor-content" />
    </div>
  );
}

export default TiptapCollaborativeEditor;

