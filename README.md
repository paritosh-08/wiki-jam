# 📝 Wiki Jam - Collaborative Wiki Editor

Real-time collaborative wiki editing with session-based collaboration, Firebase authentication, and Google Docs-style comments.

![Status](https://img.shields.io/badge/status-ready-brightgreen)
![Node](https://img.shields.io/badge/node-%3E%3D18-blue)
![License](https://img.shields.io/badge/license-MIT-blue)

## ✨ Key Features

- � **Firebase Authentication** - Secure Google sign-in with persistent sessions
- 👥 **Real-time Collaboration** - Multiple users editing simultaneously with colored cursors
- � **Google Docs-style Comments** - Add comments with @mentions and assignments
- 🔗 **Wiki Links** - Link pages with hover previews and broken link detection
- 🏷️ **Tags & Filtering** - Organize pages with tags and filter by multiple tags
- 📊 **Graph Visualization** - Interactive view of page relationships
- 📤 **Upload & Download** - Import/export .hml files and download filtered ZIPs
- 🔍 **Smart Search** - Find pages by title, definition, or aliases
- 💾 **PostgreSQL Backend** - Persistent storage for sessions, comments, and tags

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 15+
- Firebase project (for authentication)

### Setup

1. **Clone and install dependencies:**
```bash
npm install
```

2. **Configure Firebase:**
   - Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
   - Enable Google authentication
   - Add your Firebase config to `frontend/src/firebase.js`
   - Add Firebase Admin SDK credentials to `backend/serviceAccountKey.json`

3. **Configure PostgreSQL:**
```bash
# Create database
createdb wiki_jam

# Configure connection in backend/.env (optional)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=wiki_jam
DB_USER=postgres
DB_PASSWORD=postgres
```

4. **Start the application:**
```bash
npm run dev
```

5. **Open browser:** http://localhost:5173

### Docker (Alternative)

```bash
docker compose up --build -d
```
See [DOCKER.md](DOCKER.md) for details.

## 📖 Usage

### Creating & Joining Sessions

1. **Sign in** with Google
2. **Create Session** - Get a secret key to share with collaborators
3. **Join Session** - Enter a secret key to join an existing session
4. **My Sessions** - View and rejoin your previous sessions

### Editing Pages

- Click any page card to open the editor
- Edit in real-time with collaborators (see colored cursors)
- Add comments with @mentions and assign tasks
- Create wiki links: `[Link Text](wiki://Page Title)`
- Hover over links for instant previews
- Add tags for organization and filtering
- Auto-save keeps your changes safe

### Additional Features

- **Graph View** - Visualize page relationships
- **Upload/Download** - Import/export .hml files or download filtered ZIPs
- **Search** - Find pages by title, definition, or aliases
- **Tag Filtering** - Filter pages by multiple tags (AND logic)

## 🛠️ Technology Stack

**Frontend:** React, Vite, Tiptap, ShareDB, Firebase Auth, React Force Graph
**Backend:** Node.js, Express, PostgreSQL, ShareDB, WebSocket
**Storage:** PostgreSQL (sessions, comments, tags), File system (.hml files)

## 📁 Project Structure

```
wiki-editor/
├── backend/
│   ├── server.js              # Express server
│   ├── sharedbServer.js       # ShareDB WebSocket server
│   ├── sessionManager.js      # Session management
│   ├── db.js                  # PostgreSQL connection
│   ├── auth.js                # Firebase authentication
│   ├── wikiParser.js          # .hml file parser
│   └── routes/
│       ├── wiki.js            # Wiki CRUD, upload, download, tags
│       ├── session.js         # Session create/join/delete
│       ├── comments.js        # Comments with @mentions
│       └── users.js           # User management
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── HomePage.jsx      # Auth & session management
│       │   └── WikiSession.jsx   # Page grid with tags & search
│       └── components/
│           ├── WikiEditor.jsx         # Collaborative editor
│           ├── CommentsSidebar.jsx    # Comments with @mentions
│           ├── GraphView.jsx          # Graph visualization
│           └── WikiLink.jsx           # Link with hover preview
├── sessions/              # .hml files storage
└── docker-compose.yaml    # Docker setup
```

## 🐛 Troubleshooting

**PostgreSQL not connecting?**
- Check if PostgreSQL is running: `sudo systemctl status postgresql`
- Verify credentials in `backend/.env`

**Port already in use?**
- Backend (3001): `lsof -i :3001` then `kill -9 <PID>`
- Frontend (5173): `lsof -i :5173` then `kill -9 <PID>`

**Firebase auth not working?**
- Verify Firebase config in `frontend/src/firebase.js`
- Check service account key in `backend/serviceAccountKey.json`
- Enable Google sign-in in Firebase Console

## 📄 License

MIT License

---

**Ready to collaborate? Start your wiki jam session now! 🎉**

