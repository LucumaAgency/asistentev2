# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI Assistant v2 - A full-stack web application with voice support, Google Calendar integration, and OpenAI GPT-4 chat capabilities. Designed for deployment on Plesk with automated CI/CD via GitHub Actions.

## Architecture

### Dual Module System
- **ES Modules (.js files)**: Default for new code (`"type": "module"` in package.json)
- **CommonJS (.cjs files)**: Used for compatibility with certain libraries
- Both `server.js` and `server.cjs` exist - use `.cjs` version for production stability

### Backend Structure
- **Main Server**: `server.cjs` - Express server with OpenAI, Google OAuth, Calendar integration
- **Authentication**: `/routes/auth.cjs` - Google OAuth flow with Calendar permissions
- **Middleware**: `/middleware/auth.cjs`, `/middleware/calendarAuth.cjs` - JWT and Calendar token validation
- **Services**: `/services/googleCalendar.cjs` - Google Calendar API wrapper
- **Config**: `/config/googleAuth.js` - OAuth client configuration
- **Database**: MySQL/MariaDB with automatic fallback to in-memory storage

### Frontend Structure
- **Framework**: React + Vite (development on port 5173)
- **Main Components**: 
  - `App.jsx` - Main application with chat interface
  - `LoginWithCalendar.jsx` - OAuth login requesting Calendar permissions
  - `CalendarEvents.jsx` - Calendar event management UI
  - `Sidebar.jsx` - Navigation and mode selection
- **Build Output**: `/frontend/dist` (only exists in production branch)

### Database Schema
Key tables:
- `users` - Google OAuth users
- `user_tokens` - OAuth tokens for Calendar access
- `conversations` - Chat sessions
- `messages` - Chat messages
- `assistant_modes` - Custom AI modes
- `chat_sessions` - Links chats to modes

## Essential Commands

### Development
```bash
# Install all dependencies (backend + frontend)
npm run install:all

# Start development servers (backend + frontend with hot reload)
npm run dev

# Start only backend in development
npm run dev:server

# Start only frontend in development
cd frontend && npm run dev

# Run backend with CommonJS version
npm run start:cjs

# Test Calendar integration
node test-calendar-integration.cjs
```

### Building & Deployment
```bash
# Build frontend for production
npm run build

# The CI/CD pipeline automatically:
# 1. Builds frontend on push to main
# 2. Creates/updates production branch with dist folder
# 3. Plesk pulls from production branch

# Manual deployment to Plesk:
git push origin main  # Triggers GitHub Actions
```

### Database Operations
```bash
# Create all required tables
mysql -u root -p < create_tables.sql

# Create user tables for OAuth
mysql -u root -p < create_users_table.sql

# Update tables for OAuth tokens
mysql -u root -p < update_tables_for_oauth.sql

# Check user tables
mysql -u root -p < check_user_tables.sql
```

### Testing & Debugging
```bash
# Test Calendar integration
node test-calendar-integration.cjs

# Test OAuth locally
node test-oauth-local.js

# Verify tokens in database
node verify-tokens-db.js

# Debug token issues
./debug-tokens.sh
```

## Environment Variables

Required in `.env` (copy from `.env.example`):
```
# Database
DB_HOST=localhost
DB_USER=root
DB_NAME=asistente_ia or ai_assistant_db
DB_PASSWORD=

# OpenAI
OPENAI_API_KEY=sk-...

# Google OAuth & Calendar
GOOGLE_CLIENT_ID=....apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
GOOGLE_REDIRECT_URI=http://localhost:3001/oauth-callback.html

# Security
JWT_SECRET=your-secret-key

# Server
PORT=3001
NODE_ENV=development
```

## Google Calendar Integration

### OAuth Flow
1. User clicks "Iniciar sesión con Google" in `LoginWithCalendar.jsx`
2. Request goes to `/api/auth/google/auth-url` for OAuth URL with Calendar scopes
3. User authorizes, Google redirects with code
4. Code exchanged for tokens at `/api/auth/google`
5. Tokens saved in `user_tokens` table with user ID
6. Calendar operations use tokens via `calendarAuth` middleware

### Calendar Endpoints
- `GET /api/calendar/events` - List events (requires auth)
- `GET /api/calendar/events/today` - Today's events
- `POST /api/calendar/events` - Create event with Google Meet
- `POST /api/calendar/check-availability` - Check time slot
- `GET /api/calendar/next-available` - Find next free slot
- `PATCH /api/calendar/events/:id` - Update event
- `DELETE /api/calendar/events/:id` - Delete event

### Chat Integration
When `mode_id === 'calendar'`, the chat has access to calendar functions:
- `schedule_meeting` - Creates Google Calendar event with Meet link
- `check_availability` - Checks if time slot is free
- `list_events` - Lists calendar events
- `find_next_available` - Finds next available time slot

## Deployment Notes

### Plesk Configuration
1. **Git Repository**: Points to `production` branch (NOT main)
2. **Node.js Settings**:
   - Application root: `/`
   - Document root: `/frontend/dist`
   - Startup file: `server.cjs`
3. **Environment Variables**: Set in Plesk Node.js panel
4. **Database**: Created via phpMyAdmin

### CI/CD Pipeline
The GitHub Actions workflow (`.github/workflows/deploy.yml`):
1. Triggers on push to `main`
2. Builds frontend (`npm run build`)
3. Creates/updates `production` branch
4. Includes `frontend/dist` folder (normally gitignored)
5. Plesk pulls from `production` branch

### Production vs Development
- **Development**: Uses `main` branch, no `dist` folder, hot reload enabled
- **Production**: Uses `production` branch, includes built `dist` folder
- **Database**: Auto-creates tables if missing, falls back to memory if DB unavailable

## Common Issues & Solutions

### Calendar tokens not saving
1. Check `user_tokens` table exists with correct columns
2. Verify user ID is numeric (not Google ID string) when saving
3. Check `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set

### Frontend not showing in production
1. Ensure `frontend/dist` exists in production branch
2. Check Plesk document root is `/frontend/dist`
3. Verify static file serving in `server.cjs`

### OAuth redirect issues
1. Verify `GOOGLE_REDIRECT_URI` matches Google Console settings
2. For local: `http://localhost:3001/oauth-callback.html`
3. For production: `https://your-domain.com/oauth-callback.html`

### Module resolution errors
- Use `.cjs` extension for CommonJS files
- Use `.js` extension for ES modules
- Check `"type": "module"` in package.json

## Security Considerations

- JWT tokens for session management
- OAuth tokens encrypted in database
- Rate limiting on API endpoints
- CORS configured for frontend origin
- Helmet.js for security headers
- Environment variables for secrets (never commit `.env`)

## AI Assistant Modes

Custom modes stored in `assistant_modes` table:
- **General**: Default assistant mode
- **Calendar**: Has access to Google Calendar functions
- Custom modes can be created with specific prompts and contexts

Chat sessions link to modes via `chat_sessions` table for context persistence.