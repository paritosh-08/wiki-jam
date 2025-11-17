# 📝 Wiki Jam - Multiuser Collaborative Wiki Editor

A **real-time collaborative wiki editing platform** with session-based collaboration, built for your Instamart wiki pages.

![Status](https://img.shields.io/badge/status-ready-brightgreen)
![Node](https://img.shields.io/badge/node-%3E%3D18-blue)
![License](https://img.shields.io/badge/license-MIT-blue)

## ✨ Features

- 🚀 **Create or join wiki jam sessions** - Collaborate with your team
- 👥 **Real-time multiuser editing** - See changes as they happen
- 📝 **Multiple wiki pages** - Work on different pages simultaneously
- 🔗 **Wiki-style linking** - Navigate between related pages with broken link detection
- 👀 **User presence** - See who's editing with colored cursors
- 🔐 **Secret key access** - Secure session-based collaboration with encrypted keys
- 🔍 **Search functionality** - Find pages quickly by title, definition, or aliases
- 💾 **Auto-save** - Changes sync automatically
- 📊 **Graph visualization** - Interactive graph view of wiki page relationships
- 📤 **File upload** - Upload existing .hml wiki files to sessions
- 📥 **ZIP download** - Download all session pages as a ZIP archive
- ➕ **Create pages** - Create new wiki pages from scratch
- 🗑️ **Delete pages & sessions** - Remove individual pages or entire sessions
- 🏷️ **Page aliases** - Support for alternative page names
- 💾 **PostgreSQL persistence** - Sessions and documents stored in database

## 🚀 Quick Start

### Prerequisites

- **Node.js** (version 18 or higher)
- **PostgreSQL** (version 15 or higher) - for session persistence
- **Docker** (optional) - for containerized deployment

### Option 1: Docker (Recommended)

```bash
# Start all services (PostgreSQL, backend, frontend)
docker compose up --build -d

# Access the application at http://localhost:5173
```

See [DOCKER.md](DOCKER.md) for detailed Docker setup instructions.

### Option 2: Local Development

```bash
# Install dependencies (uses npm workspaces)
npm install

# Start both backend and frontend concurrently
npm run dev

# OR start them separately:
# Terminal 1 - Start backend
npm run dev:backend

# Terminal 2 - Start frontend
npm run dev:frontend
```

**Note:** Make sure PostgreSQL is running locally and configure the database connection in `backend/.env` if needed:
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=wiki_jam
DB_USER=postgres
DB_PASSWORD=postgres
```

### Open in Browser

Navigate to **http://localhost:5173** and start collaborating!

## 📖 How to Use

### 1️⃣ Create a Session

1. Click **"Create Session"**
2. Enter your username
3. Copy the **secret key** (share with collaborators)
4. Start editing!

### 2️⃣ Join a Session

1. Click **"Join Session"**
2. Enter the **secret key** from session creator
3. Enter your username
4. Start collaborating!

### 3️⃣ Work with Pages

- **Click any wiki card** to open the editor
- **Edit content** - changes sync in real-time with collaborative editing
- **See collaborators' cursors** in different colors
- **Click wiki links** to navigate between pages (broken links are highlighted)
- **Add aliases** - alternative names for pages
- **Click "Save"** to persist changes
- **Click "Back"** to return to the grid

### 4️⃣ Additional Features

- **📊 Graph View** - Visualize wiki page relationships and connections
- **📤 Upload Files** - Upload existing .hml wiki files to your session
- **📥 Download ZIP** - Download all session pages as a ZIP archive
- **➕ Create Pages** - Create new wiki pages from scratch
- **🗑️ Delete Pages** - Remove individual pages you no longer need
- **🗑️ Delete Session** - Remove entire session and all its data
- **🔍 Search** - Search pages by title, definition, or aliases

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React)                        │
│  ┌──────────┐  ┌───────────┐  ┌──────────────────────────┐  │
│  │ HomePage │  │WikiSession│  │ WikiEditor + GraphView   │  │
│  │          │  │  + Search │  │   (Tiptap + Yjs)         │  │
│  └──────────┘  └───────────┘  └──────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                          │
              WebSocket (Yjs + ShareDB)
                          │
┌────────────────────────────────────────────────────────────┐
│                  Backend (Node.js + Express)               │
│  ┌──────────┐  ┌──────────┐  ┌────────────────────────┐    │
│  │ Session  │  │   Wiki   │  │ Yjs + ShareDB WebSocket│    │
│  │   API    │  │   API    │  │      Servers           │    │
│  └──────────┘  └──────────┘  └────────────────────────┘    │
└────────────────────────────────────────────────────────────┘
                          │
              ┌───────────┴───────────┐
              │                       │
        PostgreSQL DB            .hml Files
     (Sessions, Documents)    (Wiki Content)
```

## 🛠️ Technology Stack

### Frontend
- **React** - UI framework
- **Vite** - Build tool and dev server
- **Tiptap** - Rich text editor with collaboration
- **Yjs** - CRDT for conflict-free sync
- **ShareDB** - Real-time document synchronization
- **React Router** - Navigation
- **React Force Graph 2D** - Interactive graph visualization
- **js-yaml** - Parse .hml files

### Backend
- **Node.js** - Runtime
- **Express** - Web framework
- **PostgreSQL** - Database for session and document persistence
- **WebSocket (ws)** - Real-time communication
- **Yjs** - CRDT document sync
- **ShareDB** - Operational transformation for documents
- **ShareDB-Postgres** - PostgreSQL adapter for ShareDB
- **bcrypt** - Secret key encryption
- **multer** - File upload handling
- **archiver** - ZIP file creation
- **js-yaml** - Parse .hml files
- **chokidar** - File system watching

## 📁 Project Structure

```
wiki-editor/
├── backend/
│   ├── server.js              # Main Express server
│   ├── yjsServer.js           # Yjs WebSocket server
│   ├── sharedbServer.js       # ShareDB WebSocket server
│   ├── db.js                  # PostgreSQL database connection
│   ├── wikiParser.js          # .hml file parser
│   ├── Dockerfile             # Backend Docker configuration
│   └── routes/
│       ├── wiki.js            # Wiki API endpoints (CRUD, upload, download)
│       └── session.js         # Session management (create, join, delete)
├── frontend/
│   ├── Dockerfile             # Frontend Docker configuration
│   ├── nginx.conf             # Nginx configuration for production
│   └── src/
│       ├── App.jsx            # Main app component
│       ├── pages/
│       │   ├── HomePage.jsx      # Create/join interface
│       │   └── WikiSession.jsx   # Card grid view with search
│       └── components/
│           ├── WikiCard.jsx           # Page card component
│           ├── WikiEditor.jsx         # Collaborative editor
│           ├── CollaborativeEditor.jsx # Tiptap editor wrapper
│           ├── GraphView.jsx          # Graph visualization
│           ├── SessionInfo.jsx        # Session details display
│           └── Modal.jsx              # Modal dialog component
├── sessions/              # Session data storage (created at runtime)
├── docker-compose.yaml    # Docker Compose configuration
├── package.json           # Root package with npm workspaces
├── DOCKER.md              # Docker setup guide
└── README.md              # This file
```

## 🎯 Use Cases

- **Team Documentation** - Collaborate on wiki pages in real-time
- **Knowledge Base** - Build and maintain shared knowledge
- **Onboarding** - Guide new team members through wiki
- **Brainstorming** - Capture ideas collaboratively
- **Review Sessions** - Review and update content together

## 🌟 Key Highlights

- ✅ **Zero conflicts** - Yjs CRDT ensures smooth merging
- ✅ **Instant sync** - Changes appear in milliseconds
- ✅ **Scalable** - Multiple sessions and users
- ✅ **Production-ready** - Error handling and validation
- ✅ **Extensible** - Easy to add features

## 📚 Documentation

- **[DOCKER.md](DOCKER.md)** - Docker setup and deployment guide
- **README.md** (this file) - Complete project overview and setup

## 🐛 Troubleshooting

### PostgreSQL connection fails
```bash
# Check if PostgreSQL is running
sudo systemctl status postgresql

# Or if using Docker
docker compose ps postgres
```

### Backend won't start
```bash
# Check if port 3001 is available
lsof -i :3001
# Kill process if needed
kill -9 <PID>

# Check PostgreSQL connection
# Make sure DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD are correct
```

### Frontend won't start
```bash
# Check if port 5173 is available
lsof -i :5173
```

### WebSocket connection fails
- Ensure backend is running before frontend
- Check browser console for errors
- Verify WebSocket URL in frontend code
- Ensure PostgreSQL is running and accessible

### File upload fails
- Check that files are valid .hml (YAML) format
- Ensure files have proper structure with `definition` field
- Check backend logs for validation errors

## 🔮 Future Enhancements

- [ ] Comments and annotations on pages
- [ ] Better UX for adding wiki links

## 📄 License

MIT License - Feel free to use and modify!

## 🙏 Acknowledgments

Built with:
- [Yjs](https://github.com/yjs/yjs) - Amazing CRDT implementation
- [ShareDB](https://github.com/share/sharedb) - Real-time document synchronization
- [Tiptap](https://tiptap.dev/) - Excellent collaborative editor
- [React](https://react.dev/) - UI framework
- [Vite](https://vitejs.dev/) - Lightning-fast build tool
- [PostgreSQL](https://www.postgresql.org/) - Robust database system
- [React Force Graph](https://github.com/vasturiano/react-force-graph) - Graph visualization

---

**Ready to collaborate? Start your wiki jam session now! 🎉**

For questions or issues, check the documentation or create an issue.

