# Docker Setup for Wiki Jam

This guide explains how to run Wiki Jam using Docker.

## Prerequisites

- Docker (version 20.10 or higher)
- Docker Compose (version 2.0 or higher)

## Quick Start

1. **Build and start all services:**
   ```bash
   docker compose up --build -d
   ```

2. **Access the application:**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:3001
   - PostgreSQL: localhost:5432

3. **Stop all services:**
   ```bash
   docker compose down
   ```

## Services

The application consists of three services:

### 1. PostgreSQL Database
- **Container name:** `wiki-jam-postgres`
- **Port:** 5432
- **Database:** wiki_jam
- **User:** postgres
- **Password:** postgres
- **Data persistence:** Uses a Docker volume `postgres_data`

### 2. Backend (Node.js)
- **Container name:** `wiki-jam-backend`
- **Port:** 3001
- **Features:**
  - Express REST API
  - Yjs WebSocket server for real-time collaboration
  - ShareDB for document synchronization
  - PostgreSQL for session persistence
- **Volumes:**
  - `./sessions:/app/sessions` - Session data persistence

### 3. Frontend (React + Vite)
- **Container name:** `wiki-jam-frontend`
- **Port:** 5173 (mapped to 80 inside container)
- **Features:**
  - React application
  - Nginx web server
  - Proxies API and WebSocket requests to backend

## Environment Variables

The backend uses the following environment variables (configured in docker-compose.yaml):

- `NODE_ENV=production`
- `DB_HOST=postgres`
- `DB_PORT=5432`
- `DB_NAME=wiki_jam`
- `DB_USER=postgres`
- `DB_PASSWORD=postgres`

## Data Persistence

- **PostgreSQL data:** Stored in Docker volume `postgres_data`
- **Session files:** Stored in `./sessions` directory on the host machine

## Development vs Production

### Development (without Docker)
```bash
# Terminal 1: Start PostgreSQL
docker compose up postgres

# Terminal 2: Start backend
cd backend && npm run dev

# Terminal 3: Start frontend
cd frontend && npm run dev
```

### Production (with Docker)
```bash
docker compose up --build -d
```

## Useful Commands

### View logs
```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f postgres
```

### Rebuild a specific service
```bash
docker compose up --build -d backend
docker compose up --build -d frontend
```

### Stop and remove all containers
```bash
docker compose down
```

### Stop and remove all containers + volumes
```bash
docker compose down -v
```

### Access a container shell
```bash
docker exec -it wiki-jam-backend sh
docker exec -it wiki-jam-frontend sh
docker exec -it wiki-jam-postgres psql -U postgres -d wiki_jam
```

## Troubleshooting

### Port already in use
If you get a port conflict error, either:
1. Stop the service using that port
2. Change the port mapping in docker-compose.yaml

### Database connection issues
Make sure PostgreSQL is healthy:
```bash
docker compose ps
```

Check backend logs:
```bash
docker compose logs backend
```

### Frontend can't connect to backend
Check that all services are on the same network:
```bash
docker network inspect wiki-jam-network
```

## Network Architecture

All services communicate through a Docker bridge network called `wiki-jam-network`:
- Frontend → Backend: HTTP/WebSocket requests via nginx proxy
- Backend → PostgreSQL: Direct connection using service name `postgres`

