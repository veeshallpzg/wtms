# WTMS Multi-Domain System — Detailed Specification

**Version:** 1.0  
**Date:** June 2026  
**Scope:** Full rebuild of WTMS as a multi-domain, cloud-hosted web application on Vercel  
**Based on:** Existing WTMS v1.0 (Lucid only, Electron + LAN)

---

## Table of Contents

1. [Current System Summary](#1-current-system-summary)
2. [New System Requirements](#2-new-system-requirements)
3. [Key Architectural Differences](#3-key-architectural-differences)
4. [Domain Structure](#4-domain-structure)
5. [Technology Stack](#5-technology-stack)
6. [Database Design](#6-database-design)
7. [Authentication & Login Flow](#7-authentication--login-flow)
8. [Project Code Convention](#8-project-code-convention)
9. [Feature Parity Checklist](#9-feature-parity-checklist)
10. [Frontend Changes](#10-frontend-changes)
11. [API Changes](#11-api-changes)
12. [File Upload Strategy](#12-file-upload-strategy)
13. [Background Jobs](#13-background-jobs)
14. [Deployment Guide](#14-deployment-guide)
15. [Phase Plan](#15-phase-plan)
16. [Step-by-Step Development Checklist](#16-step-by-step-development-checklist)
17. [Environment Variables Reference](#17-environment-variables-reference)

---

## 1. Current System Summary

### What WTMS Does (Lucid v1.0)
WTMS is a Work Time Management System built for internal company use. It runs as a Windows desktop app (Electron) with one server PC (192.168.29.251) and client PCs on the same LAN.

### Current Tech Stack
| Layer | Technology |
|-------|-----------|
| Desktop shell | Electron 41 |
| Backend | Node.js + Express 4 |
| Database | sql.js (in-memory SQLite, persisted to disk) |
| Authentication | express-session + bcryptjs |
| File storage | Local filesystem (`uploads/` folder) |
| Deployment | Local Windows PC, NSIS installer |

### Current Features (all must be preserved per domain)

**Users & Roles**
- 4 roles: `admin`, `manager`, `member`, `client`
- Admin manages all users (create, edit, soft-delete)
- Extended user profiles: DOB, anniversary, Aadhar, PAN, blood group, joining date, photo
- Password change from profile

**Projects**
- Create/edit/archive projects with name, code, client, description, priority, dates
- Project status lifecycle: Not Started → In Progress → On Hold → Client Review → Completed → Archived
- Auto-generated project code (e.g., `LU-26-001-JAN`)
- Primary manager + additional co-managers
- Contact persons per project
- File attachments (reference files)
- Project search and column sorting
- "View Project Info" modal showing team, tasks, all details
- Client review cycle tracking (submit for review → approved/revision)
- Task creation blocked when project is Not Started or Client Review

**Tasks**
- Create/edit/cancel tasks within projects
- Task category: Project Requirement or Client Request
- Assignment to member by manager/admin
- Iterations (initial → revision → revision…) with reason tracking
- Task status: pending → in_progress → paused → submitted → revision_requested → completed → cancelled
- Task search and column sorting

**Time Tracking**
- Start / Stop / Pause / Resume timer per task
- Pause types: Break, Meeting, Done for Day, On Call, Other
- Auto-pause triggers:
  - System suspend / shutdown (Electron powerMonitor)
  - Screen lock (only pauses admin timers on server PC)
  - End of working day at 8:00 PM IST
  - 12-hour continuous timer guard
  - Heartbeat inactivity guard (10 min of no ping = auto-pause)
- One active timer per user at a time (switching tasks auto-stops old one)
- Timer blocked when project is in Client Review

**Reports (Admin & Manager)**
- Project Time Report: hours per project + client review hours
- Member Time Report: hours per member with daily breakdown
- Member Detail Report: work/break/meeting breakdown, task list
- Member Timeline Report: chronological work + pause events
- Task Iterations Report: revision counts and revision time
- Project Progress Report: task completion stats per project
- Project Detail Report: full member effort + review cycles
- CSV export for Project Time, Task Iterations, Member Time

**Notifications**
- In-app notifications for: task assigned, task submitted, revision requested, task approved, project created, file uploaded
- Unread badge count

**Activity Log**
- Records all create/update/archive/submit/approve actions

**Client Portal**
- Separate read-only portal for `client` role users
- View assigned projects, progress, task list

**Background Jobs**
- Daily DB backup at 7:00 PM to `D:\wtmslocal\BKP\wtms_backup.db`
- End-of-day auto-pause at 8:00 PM IST
- 12-hour timer guard (checks every 15 min)
- Heartbeat inactivity guard (checks every 5 min)

---

## 2. New System Requirements

### Core Requirement
Build a **multi-domain, web-only** version of WTMS hosted on Vercel, where users log in to one of 6 company domains and all data is fully isolated between domains.

### The 6 Domains
| Domain Key | Company Name | Status in Phase 1 |
|------------|-------------|-------------------|
| `lucid` | Lucid | **Active** |
| `zurich` | Zurich | **Active** |
| `octik` | Octik | **Active** |
| `nusence` | Nusence | Placeholder (Phase 2) |
| `other` | Other | Placeholder (Phase 2) |
| `common` | Common | Placeholder (Phase 2, different workflow) |

### Login Flow Change
**Current:** User types `username` → system appends `@lucid.wtms`  
**New:** User types `username` and **selects domain** from dropdown → system uses domain-scoped lookup

### Data Isolation
- Users, projects, tasks, time entries, files — everything is scoped to a domain
- A person named "Rahul" at Lucid and "Rahul" at Zurich are **separate accounts** with no relation
- No cross-domain data sharing (Common domain's future workflow is separate)

### No Electron
- This is a **pure web application** — no desktop shell
- Accessible from any browser on any OS
- Desktop shortcuts are browser bookmarks

---

## 3. Key Architectural Differences

### Current vs New

| Concern | Current (Electron / LAN) | New (Vercel / Web) |
|---------|-------------------------|-------------------|
| Deployment | Windows EXE on LAN PC | Vercel (cloud) |
| Database | sql.js (file SQLite) | PostgreSQL (Neon or Supabase) |
| Sessions | express-session (in-memory) | JWT tokens (stateless) |
| File storage | Local `uploads/` folder | Vercel Blob (or Cloudinary) |
| Background jobs | `setInterval` in Node process | Vercel Cron Jobs |
| Auto-pause on sleep | Electron `powerMonitor` | **Heartbeat guard only** (no OS events in browser) |
| Screen lock auto-pause | Electron `powerMonitor` | **Not applicable** — replaced by heartbeat |
| Access | LAN only | Internet (any browser) |

### What CANNOT Be Ported Directly
1. **`setInterval` for background jobs** — Vercel serverless functions are stateless and die after each request. Use Vercel Cron Jobs instead.
2. **In-memory `userLastSeen` Map** — stateless environment; use database for this instead (store last heartbeat timestamp in DB).
3. **Local `uploads/` folder** — Vercel has no persistent writable filesystem. Use Vercel Blob storage.
4. **sql.js / SQLite file** — no writable filesystem. Use PostgreSQL.
5. **Electron `powerMonitor`** — no browser equivalent. Only the heartbeat guard remains.
6. **`express-session` with MemoryStore** — won't work across serverless instances. Use JWT.
7. **`process.env.WTMS_BACKUP_DIR`** — backup strategy changes: use pg_dump via Cron or Neon's built-in backups.

### Database Backup (New Strategy)
- Neon and Supabase provide **automatic daily backups** — no manual backup code needed
- For additional safety: set up a Vercel Cron Job that calls a `/api/admin/backup` endpoint which exports critical data to a JSON file in Vercel Blob

---

## 4. Domain Structure

### Domain Keys and Prefixes
| Domain Key | Project Code Prefix | Email Suffix | Admin Default Email |
|------------|--------------------|--------------|--------------------|
| `lucid` | `LU` | `@lucid.wtms` | `admin@lucid.wtms` |
| `zurich` | `ZU` | `@zurich.wtms` | `admin@zurich.wtms` |
| `octik` | `OC` | `@octik.wtms` | `admin@octik.wtms` |
| `nusence` | `NS` | `@nusence.wtms` | `admin@nusence.wtms` |
| `other` | `OT` | `@other.wtms` | `admin@other.wtms` |
| `common` | `CM` | `@common.wtms` | `admin@common.wtms` |

### Phase 1 Active Domains
Only `lucid`, `zurich`, `octik` will have seeded admin accounts and be selectable in the login dropdown.  
`nusence`, `other`, `common` will be listed in dropdown but show: **"Domain not yet active. Please contact administrator."**

### Domain-Specific Configuration (stored in `domains` table)
Each domain can have:
- Display name
- Logo URL
- Active/inactive flag
- Theme color accent (optional for branding)
- Custom settings (JSON blob for future expansion)

---

## 5. Technology Stack

### Recommended Stack

| Layer | Technology | Reason |
|-------|-----------|--------|
| Backend | Node.js + Express 4 | Same as current, easy to port |
| Database | **PostgreSQL via Neon** | Serverless-friendly, Vercel integration, free tier |
| ORM | **Prisma** | Type-safe, migration management, easy switch from raw SQL |
| Auth | **JWT (jsonwebtoken)** | Stateless, works across Vercel serverless instances |
| File storage | **Vercel Blob** | Native Vercel integration, simple API |
| Password hashing | bcryptjs | Same as current |
| File upload parsing | multer (memory storage) | Same as current, but route to Blob instead of disk |
| Deployment | **Vercel** | As required |
| Cron jobs | **Vercel Cron Jobs** | Replaces `setInterval` |
| Environment secrets | Vercel Environment Variables | Database URL, JWT secret, Blob token |

### Alternative Database Options (if Neon doesn't suit)
- **Supabase** (PostgreSQL + Storage + Auth — can replace Blob and JWT too)
- **Railway** (PostgreSQL, simple interface, but not a Vercel native integration)
- **PlanetScale** (MySQL-compatible Vitess — avoid, no free tier in 2024+)

### Dependency Changes
**Add:**
```json
"@prisma/client": "^5.x",
"jsonwebtoken": "^9.x",
"@vercel/blob": "^0.x",
"cookie-parser": "^1.x"
```

**Remove:**
```json
"sql.js": removed,
"express-session": removed,
"electron": removed (devDependency),
"electron-builder": removed (devDependency)
```

**Keep:**
```json
"express": "^4.18.2",
"bcryptjs": "^2.4.3",
"multer": "^1.4.5-lts.1"
```

---

## 6. Database Design

### Strategy: Single Database, Domain Column on All Tables

All tables get a `domain` column (`VARCHAR(20)`). Every query includes `WHERE domain = ?` filtering. This is the simplest approach for Vercel + a single Postgres instance.

### Schema (PostgreSQL / Prisma)

#### `domains` table
```sql
CREATE TABLE domains (
    id          SERIAL PRIMARY KEY,
    key         VARCHAR(20) UNIQUE NOT NULL,  -- 'lucid', 'zurich', etc.
    name        VARCHAR(100) NOT NULL,
    prefix      VARCHAR(5) NOT NULL,           -- 'LU', 'ZU', etc.
    email_suffix VARCHAR(50) NOT NULL,         -- '@lucid.wtms'
    is_active   BOOLEAN DEFAULT FALSE,
    logo_url    VARCHAR(500),
    theme_color VARCHAR(20) DEFAULT '#6366f1',
    settings    JSONB DEFAULT '{}',
    created_at  TIMESTAMP DEFAULT NOW()
);
```

#### `users` table
```sql
CREATE TABLE users (
    id              SERIAL PRIMARY KEY,
    domain          VARCHAR(20) NOT NULL REFERENCES domains(key),
    full_name       VARCHAR(100) NOT NULL,
    email           VARCHAR(150) NOT NULL,   -- e.g., 'john@lucid.wtms'
    username        VARCHAR(100) NOT NULL,   -- 'john' (without domain suffix)
    password_hash   VARCHAR(255) NOT NULL,
    role            VARCHAR(20) NOT NULL CHECK(role IN ('admin','manager','member','client')),
    is_active       BOOLEAN DEFAULT TRUE,
    avatar_url      VARCHAR(500),
    date_of_birth   DATE,
    anniversary_date DATE,
    aadhar_number   VARCHAR(20),
    pan_number      VARCHAR(20),
    blood_group     VARCHAR(10),
    joining_date    DATE,
    last_heartbeat  TIMESTAMP,              -- replaces in-memory userLastSeen Map
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW(),
    UNIQUE(domain, email),
    UNIQUE(domain, username)
);
```

#### `projects` table
```sql
CREATE TABLE projects (
    id              SERIAL PRIMARY KEY,
    domain          VARCHAR(20) NOT NULL REFERENCES domains(key),
    project_name    VARCHAR(200) NOT NULL,
    project_code    VARCHAR(50) NOT NULL,
    client_name     VARCHAR(150),
    description     TEXT,
    manager_id      INTEGER NOT NULL REFERENCES users(id),
    status          VARCHAR(30) DEFAULT 'not_started'
                    CHECK(status IN ('not_started','in_progress','on_hold','client_review','completed','archived')),
    priority        VARCHAR(20) DEFAULT 'medium'
                    CHECK(priority IN ('low','medium','high','critical')),
    start_date      DATE,
    due_date        DATE,
    actual_end_date DATE,
    created_by      INTEGER NOT NULL REFERENCES users(id),
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW(),
    UNIQUE(domain, project_code)
);
```

#### `project_sequences` table
```sql
CREATE TABLE project_sequences (
    domain   VARCHAR(20) NOT NULL REFERENCES domains(key),
    year     INTEGER NOT NULL,
    next_seq INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (domain, year)
);
```

#### `project_contacts` table
```sql
CREATE TABLE project_contacts (
    id              SERIAL PRIMARY KEY,
    project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    contact_name    VARCHAR(100) NOT NULL,
    contact_phone   VARCHAR(30),
    contact_email   VARCHAR(150),
    created_at      TIMESTAMP DEFAULT NOW()
);
```

#### `project_managers` table (co-managers)
```sql
CREATE TABLE project_managers (
    id          SERIAL PRIMARY KEY,
    project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    added_at    TIMESTAMP DEFAULT NOW(),
    UNIQUE(project_id, user_id)
);
```

#### `project_members` table (client access)
```sql
CREATE TABLE project_members (
    id          SERIAL PRIMARY KEY,
    project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    joined_at   TIMESTAMP DEFAULT NOW(),
    UNIQUE(project_id, user_id)
);
```

#### `project_reviews` table
```sql
CREATE TABLE project_reviews (
    id              SERIAL PRIMARY KEY,
    project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    submitted_at    TIMESTAMP NOT NULL,
    responded_at    TIMESTAMP,
    response_type   VARCHAR(30) CHECK(response_type IN ('approved','revision_requested')),
    response_notes  TEXT,
    review_minutes  DECIMAL(10,2),
    submitted_by    INTEGER NOT NULL REFERENCES users(id)
);
```

#### `tasks` table
```sql
CREATE TABLE tasks (
    id                  SERIAL PRIMARY KEY,
    project_id          INTEGER NOT NULL REFERENCES projects(id),
    task_title          VARCHAR(200) NOT NULL,
    task_description    TEXT,
    assigned_to         INTEGER NOT NULL REFERENCES users(id),
    assigned_by         INTEGER NOT NULL REFERENCES users(id),
    status              VARCHAR(30) DEFAULT 'pending'
                        CHECK(status IN ('pending','in_progress','paused','submitted','under_review','revision_requested','completed','cancelled')),
    priority            VARCHAR(20) DEFAULT 'medium'
                        CHECK(priority IN ('low','medium','high','critical')),
    task_category       VARCHAR(30) DEFAULT 'project_requirement'
                        CHECK(task_category IN ('project_requirement','client_request')),
    current_iteration   INTEGER DEFAULT 1,
    estimated_hours     DECIMAL(8,2),
    total_time_spent    DECIMAL(10,2) DEFAULT 0,
    due_date            DATE,
    actual_end_date     TIMESTAMP,
    created_at          TIMESTAMP DEFAULT NOW(),
    updated_at          TIMESTAMP DEFAULT NOW()
);
```

#### `task_iterations` table
```sql
CREATE TABLE task_iterations (
    id              SERIAL PRIMARY KEY,
    task_id         INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    iteration_number INTEGER NOT NULL,
    iteration_type  VARCHAR(20) DEFAULT 'initial'
                    CHECK(iteration_type IN ('initial','revision')),
    revision_reason TEXT,
    started_at      TIMESTAMP,
    submitted_at    TIMESTAMP,
    reviewed_at     TIMESTAMP,
    review_status   VARCHAR(30) DEFAULT 'pending'
                    CHECK(review_status IN ('pending','approved','revision_requested')),
    review_remarks  TEXT,
    member_remarks  TEXT,
    total_time_spent DECIMAL(10,2) DEFAULT 0,
    assigned_to     INTEGER NOT NULL REFERENCES users(id),
    created_at      TIMESTAMP DEFAULT NOW()
);
```

#### `time_entries` table
```sql
CREATE TABLE time_entries (
    id              SERIAL PRIMARY KEY,
    task_id         INTEGER NOT NULL REFERENCES tasks(id),
    iteration_id    INTEGER NOT NULL REFERENCES task_iterations(id),
    user_id         INTEGER NOT NULL REFERENCES users(id),
    start_time      TIMESTAMP NOT NULL,
    end_time        TIMESTAMP,
    duration_minutes DECIMAL(10,2),
    pause_type      VARCHAR(30)
                    CHECK(pause_type IN ('break','meeting','done_for_day','on_call','other','auto')),
    remarks         TEXT,
    is_active       BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMP DEFAULT NOW()
);
```

#### `file_attachments` table
```sql
CREATE TABLE file_attachments (
    id              SERIAL PRIMARY KEY,
    domain          VARCHAR(20) NOT NULL REFERENCES domains(key),
    project_id      INTEGER NOT NULL REFERENCES projects(id),
    task_id         INTEGER REFERENCES tasks(id),
    iteration_id    INTEGER REFERENCES task_iterations(id),
    uploaded_by     INTEGER NOT NULL REFERENCES users(id),
    file_name       VARCHAR(255) NOT NULL,
    blob_url        VARCHAR(1000) NOT NULL,   -- Vercel Blob URL replaces file_path
    file_size       BIGINT,
    file_type       VARCHAR(50),
    upload_type     VARCHAR(30)
                    CHECK(upload_type IN ('client_input','deliverable','reference','revision_input')),
    description     VARCHAR(500),
    version         INTEGER DEFAULT 1,
    created_at      TIMESTAMP DEFAULT NOW()
);
```

#### `notifications` table
```sql
CREATE TABLE notifications (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id),
    type            VARCHAR(30),
    title           VARCHAR(200) NOT NULL,
    message         TEXT NOT NULL,
    reference_type  VARCHAR(20),
    reference_id    INTEGER,
    is_read         BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMP DEFAULT NOW()
);
```

#### `activity_log` table
```sql
CREATE TABLE activity_log (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    domain      VARCHAR(20) NOT NULL,
    action      VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id   INTEGER NOT NULL,
    details     JSONB,
    ip_address  VARCHAR(45),
    created_at  TIMESTAMP DEFAULT NOW()
);
```

### Key Indexes
```sql
CREATE INDEX idx_users_domain ON users(domain);
CREATE INDEX idx_projects_domain ON projects(domain);
CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_tasks_assigned ON tasks(assigned_to);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_time_entries_user_active ON time_entries(user_id, is_active);
CREATE INDEX idx_time_entries_task ON time_entries(task_id);
CREATE INDEX idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX idx_activity_domain ON activity_log(domain);
```

### Migration from Existing Lucid Data
- Current Lucid database is at `C:\Users\PC4\AppData\Roaming\WTMS\wtms.db`
- Export from SQLite using sqlite3 CLI or sql.js dump
- Transform data: add `domain = 'lucid'` to all rows
- Import to PostgreSQL using psql or Prisma seed script

---

## 7. Authentication & Login Flow

### JWT-Based Authentication

**Replace** `express-session` with JWT tokens stored in HTTP-only cookies.

#### Login Request
```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "john",
  "domain": "lucid",
  "password": "secret"
}
```

#### Login Logic
```javascript
1. Validate domain is active (check domains table)
2. Normalize username: lowercase, no spaces
3. Build email: john@lucid.wtms
4. Look up user: WHERE domain='lucid' AND email='john@lucid.wtms' AND is_active=true
5. Compare password with bcrypt
6. Sign JWT: { userId, domain, role, fullName, email }
7. Set HTTP-only cookie: token=<jwt>; HttpOnly; Secure; SameSite=Strict; Max-Age=86400
8. Return: { success: true, redirect: '/dashboard' }
```

#### JWT Payload
```json
{
  "userId": 1,
  "domain": "lucid",
  "role": "admin",
  "fullName": "System Admin",
  "email": "admin@lucid.wtms",
  "iat": 1718000000,
  "exp": 1718086400
}
```

#### Auth Middleware
```javascript
function requireAuth(req, res, next) {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch {
        res.clearCookie('token');
        return res.status(401).json({ error: 'Session expired' });
    }
}
```

#### Domain Isolation in API
Every API handler that reads/writes data must scope by `req.user.domain`:
```javascript
// Example: get projects
const projects = await prisma.project.findMany({
    where: { domain: req.user.domain, status: { not: 'archived' } }
});
```

### Login Page Changes
The login form needs:
- Username field (no email suffix — user just types their name)
- **Domain dropdown** (populated from active domains in DB)
- Password field
- Submit button
- Error message area

The domain dropdown should show: **Lucid, Zurich, Octik** (active) and grayed-out: **Nusence, Other, Common** (inactive).

---

## 8. Project Code Convention

### Format: `{PREFIX}-{YY}-{NNN}-{MMM}`

| Domain | Prefix | Example |
|--------|--------|---------|
| Lucid | `LU` | `LU-26-001-JAN` |
| Zurich | `ZU` | `ZU-26-001-JAN` |
| Octik | `OC` | `OC-26-001-JAN` |
| Nusence | `NS` | `NS-26-001-JAN` |
| Other | `OT` | `OT-26-001-JAN` |
| Common | `CM` | `CM-26-001-JAN` |

### Generation Logic (updated for multi-domain)
```javascript
async function generateProjectCode(domain) {
    const domainConfig = DOMAIN_CONFIG[domain]; // { prefix: 'LU' }
    const year = new Date().getFullYear();
    const yy = String(year).slice(-2);
    const mmm = ['JAN','FEB','MAR','APR','MAY','JUN',
                  'JUL','AUG','SEP','OCT','NOV','DEC'][new Date().getMonth()];

    // Atomic increment using PostgreSQL (safe for concurrent requests)
    const seq = await prisma.$queryRaw`
        INSERT INTO project_sequences (domain, year, next_seq)
        VALUES (${domain}, ${year}, 1)
        ON CONFLICT (domain, year)
        DO UPDATE SET next_seq = project_sequences.next_seq + 1
        RETURNING next_seq
    `;
    const nnn = String(seq[0].next_seq).padStart(3, '0');
    return `${domainConfig.prefix}-${yy}-${nnn}-${mmm}`;
}
```

---

## 9. Feature Parity Checklist

All features from v1.0 must be preserved, adapted for web/multi-domain:

### Preserved As-Is
- [x] User CRUD (admin manages domain users)
- [x] Extended user profiles (DOB, anniversary, photo, etc.)
- [x] Password change
- [x] Project CRUD with all fields
- [x] Project status lifecycle
- [x] Co-managers per project
- [x] Contact persons per project
- [x] Task CRUD with all fields
- [x] Task categories
- [x] Task iteration system
- [x] Time tracking (start/stop/pause/resume)
- [x] Pause types (break, meeting, done_for_day, on_call, other)
- [x] All 7 report types
- [x] CSV export
- [x] Notifications system
- [x] Activity log
- [x] Client portal (read-only)
- [x] Project search and sorting
- [x] Task search and sorting
- [x] Task creation blocked for Not Started / Client Review projects
- [x] Client review cycle
- [x] File uploads for projects and tasks
- [x] Project info text export

### Changed / Adapted
| Feature | v1.0 | Multi-domain v2.0 |
|---------|------|-------------------|
| Auto-pause on sleep | Electron powerMonitor | Heartbeat guard only (10 min inactivity) |
| Auto-pause on screen lock | Electron powerMonitor (server-only) | Not applicable |
| Database backup | File copy at 7 PM | PostgreSQL provider's built-in backup + optional Cron export |
| Session management | express-session cookie | JWT in HTTP-only cookie |
| File storage | Local disk `uploads/` | Vercel Blob |
| Project code | `LU-YY-NNN-MMM` | Domain-prefixed `{PREFIX}-YY-NNN-MMM` |
| Email login | `john@lucid.wtms` | Username + domain dropdown |
| User email format | `@lucid.wtms` | `@{domain}.wtms` |

### Removed
| Feature | Reason |
|---------|--------|
| Electron desktop app | Web-only now |
| LAN IP detection (isServerPC) | Not needed — single cloud server |
| server/client mode config | Not needed |
| Windows startup (setLoginItemSettings) | Not needed |
| System tray | Not needed |
| Daily DB backup to D:\wtmslocal\BKP | PostgreSQL provider handles backups |
| NSIS installer / firewall rules | Not needed |

---

## 10. Frontend Changes

### Login Page (`login.html`)

**Add domain dropdown:**
```html
<div class="login-field-group">
  <input type="text" id="username" placeholder="Username" required />
  <select id="domain" required>
    <option value="">Select Company</option>
    <option value="lucid">Lucid</option>
    <option value="zurich">Zurich</option>
    <option value="octik">Octik</option>
    <option value="nusence" disabled>Nusence (Coming Soon)</option>
    <option value="other" disabled>Other (Coming Soon)</option>
    <option value="common" disabled>Common (Coming Soon)</option>
  </select>
</div>
<input type="password" id="password" placeholder="Password" required />
```

**Updated login JS:**
```javascript
const payload = {
    username: document.getElementById('username').value.trim(),
    domain: document.getElementById('domain').value,
    password: document.getElementById('password').value
};
const res = await fetch('/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
});
```

### Dashboard (`dashboard.html`)

**Changes needed:**
1. Show domain name/logo in the header sidebar (e.g., "LUCID WTMS")
2. Show current user's domain in profile section
3. The `/api/user` endpoint returns `domain` in the JWT — display it
4. All API calls remain the same (domain is read server-side from JWT)
5. Remove any references to "Lucid" branding — make it dynamic from domain

**Domain Branding (optional enhancement):**
- Fetch domain config from `/api/domain/config` on page load
- Apply theme color and logo from domain config

### No Other Frontend Changes
All sections (Projects, Tasks, Reports, etc.) work identically. The domain isolation is **entirely server-side** — the frontend doesn't need to pass domain in API calls because it's embedded in the JWT cookie.

---

## 11. API Changes

### New Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | Multi-domain login (replaces `POST /login`) |
| GET | `/api/auth/logout` | Clear JWT cookie |
| GET | `/api/domain/config` | Get current domain's display config (name, logo, color) |
| GET | `/api/domain/list` | List all domains for login dropdown |

### Changed Endpoints

**Old:** `POST /login`  
**New:** `POST /api/auth/login` — accepts `{ username, domain, password }`

**Old:** `GET /logout`  
**New:** `GET /api/auth/logout` — clears JWT cookie

**Old:** `GET /api/user`  
**New:** Same path, but returns `domain` field from JWT

**Old:** `POST /api/tasks/:id/start-timer` — uses `powerMonitor` triggered pause  
**New:** Same path — auto-pause only through heartbeat guard

### Unchanged Endpoints
All other endpoints (`/api/projects`, `/api/tasks`, `/api/reports/*`, `/api/users`, `/api/notifications`, `/api/client/*`, etc.) remain at the same paths with the same request/response shapes. The difference is internal: domain is pulled from JWT and added to every DB query.

### Vercel Serverless Entry Point
Create `api/index.js` (or `server.js` with `vercel.json` routing):
```json
// vercel.json
{
  "version": 2,
  "routes": [
    { "src": "/(.*)", "dest": "/server.js" }
  ],
  "functions": {
    "server.js": { "maxDuration": 30 }
  }
}
```

---

## 12. File Upload Strategy

### Current (v1.0)
Files saved to `uploads/{projectCode}/{filename}` on local disk.

### New (v2.0 — Vercel Blob)

**Install:**
```bash
npm install @vercel/blob
```

**Upload function (replaces `saveUploadedFile`):**
```javascript
import { put } from '@vercel/blob';

async function saveUploadedFile(domain, projectCode, originalname, buffer, mimetype) {
    const safeCode = projectCode.replace(/[^a-zA-Z0-9\-_]/g, '_');
    const blobPath = `${domain}/${safeCode}/${originalname}`;
    const blob = await put(blobPath, buffer, {
        access: 'public',      // or 'private' with signed URLs
        contentType: mimetype,
        addRandomSuffix: true  // prevents collisions
    });
    return blob.url;           // store this URL in file_attachments.blob_url
}
```

**Profile Photos:**
```javascript
const blob = await put(`${domain}/profile_photos/${userId}${ext}`, buffer, {
    access: 'public', contentType: req.file.mimetype, addRandomSuffix: false
});
avatarUrl = blob.url;
```

**File Download:**
Since Vercel Blob URLs are public, just redirect:
```javascript
app.get('/api/projects/:projectId/files/:fileId/download', requireAuth, async (req, res) => {
    const file = await prisma.fileAttachment.findFirst({
        where: { id: fileId, projectId: projectId }
    });
    if (!file) return res.status(404).json({ error: 'File not found' });
    res.redirect(file.blob_url); // redirect to Vercel Blob URL
});
```

**Note on Private Files:** If files need to be access-controlled, use Vercel Blob's `access: 'private'` and generate signed URLs. For simplicity in Phase 1, `access: 'public'` is fine (URLs are unguessable UUIDs).

---

## 13. Background Jobs

### Replace `setInterval` with Vercel Cron Jobs

All background jobs need to become API endpoints that Vercel Cron calls on a schedule.

#### Job 1: End-of-Day Auto-Pause (8:00 PM IST)
**Vercel Cron schedule:** `30 14 * * *` (14:30 UTC = 20:00 IST)

```javascript
// pages/api/cron/end-of-day-pause.js  (or api/cron/end-of-day-pause.js)
export default async function handler(req, res) {
    // Verify cron secret
    if (req.headers['x-cron-secret'] !== process.env.CRON_SECRET)
        return res.status(403).end();

    // Pause all active time entries across all domains
    await autoPauseAllTimers('Auto-paused: End of working day (8 PM)');
    res.json({ ok: true });
}
```

#### Job 2: Heartbeat Inactivity Guard (every 5 minutes)
**Vercel Cron schedule:** `*/5 * * * *`

```javascript
// Instead of in-memory userLastSeen Map, read users.last_heartbeat from DB
// Pause any active timer where user's last_heartbeat is > 10 minutes ago
```

#### Job 3: 12-Hour Timer Guard (every 15 minutes)
**Vercel Cron schedule:** `*/15 * * * *`

```javascript
// Find any time_entries where is_active=true and start_time < now - 12 hours
// Auto-pause those entries
```

#### Job 4: Optional Data Export Backup (daily at 7 PM IST)
**Vercel Cron schedule:** `30 13 * * *` (13:30 UTC = 19:00 IST)

```javascript
// Export critical tables to JSON, store in Vercel Blob as backup
// Neon/Supabase also has automated backups — this is supplemental
```

#### vercel.json Cron Configuration
```json
{
  "crons": [
    { "path": "/api/cron/end-of-day-pause", "schedule": "30 14 * * *" },
    { "path": "/api/cron/heartbeat-guard",  "schedule": "*/5 * * * *" },
    { "path": "/api/cron/timer-guard",      "schedule": "*/15 * * * *" }
  ]
}
```

### Heartbeat Changes
- **Current:** `POST /api/heartbeat` updates in-memory `userLastSeen` Map
- **New:** `POST /api/heartbeat` updates `users.last_heartbeat = NOW()` in PostgreSQL
- The Cron job queries `WHERE last_heartbeat < NOW() - INTERVAL '10 minutes'` to find inactive users

---

## 14. Deployment Guide

### Prerequisites
1. GitHub account with this codebase pushed
2. Vercel account (free tier)
3. Neon account (free tier) — https://neon.tech
4. Vercel Blob enabled on your Vercel project

### Setup Steps

#### Step 1: Set Up Neon Database
1. Create a new Neon project at https://neon.tech
2. Copy the connection string: `postgresql://user:pass@ep-xxx.neon.tech/dbname?sslmode=require`
3. Run the schema migrations (Prisma: `npx prisma migrate dev`)
4. Seed initial domain data and admin accounts

#### Step 2: Deploy to Vercel
1. Push codebase to GitHub
2. Go to vercel.com → New Project → Import from GitHub
3. Set environment variables (see Section 17)
4. Deploy

#### Step 3: Set Environment Variables in Vercel
(See Section 17 for full list)

#### Step 4: Verify
1. Visit `https://your-app.vercel.app/login`
2. Select domain "Lucid", login as `admin` / `password123`
3. Change admin password immediately
4. Create users for Zurich and Octik domains

### Custom Domain (optional)
- Add a custom domain in Vercel project settings
- Example: `wtms.lucidtheartistry.com`

---

## 15. Phase Plan

### Phase 1 — Core Multi-Domain System (Current Work)

**Goal:** Functional WTMS on Vercel with Lucid, Zurich, Octik domains

**Scope:**
- Complete infrastructure migration (SQLite → PostgreSQL, sessions → JWT, disk → Blob)
- Multi-domain login with dropdown
- Domain isolation on all APIs and data
- All existing features working per domain
- 3 active domains with seeded admin accounts
- Cron jobs replacing setInterval

**Deliverable:** Deployed, working system at a Vercel URL

---

### Phase 2 — Additional Domains

**Goal:** Activate Nusence and Other domains with same workflow as Phase 1

**Scope:**
- Update `domains` table: set `is_active = true` for nusence, other
- Seed admin accounts for each
- Update login dropdown
- No code changes needed (architecture already supports it)

---

### Phase 3 — Common Domain (Different Workflow)

**Goal:** Marketing/Accounts domain with customised workflow

**Requirements:** TBD — to be designed separately
**Note:** The Common domain may have different project types, roles, or approval workflows. Design will begin once Phase 1 is stable and Common domain requirements are gathered.

---

## 16. Step-by-Step Development Checklist

Work through these tasks in order. Each item is small and testable independently.

### Stage 1: Project Setup
- [ ] Create new GitHub repo: `wtms-cloud` (or fork this repo)
- [ ] Remove Electron dependencies and files (`electron-main.js`, `electron-setup.html`, `electron-splash.html`, `assets/installer.nsh`)
- [ ] Remove Windows-specific code from `server.js` (auto-pause from powerMonitor references)
- [ ] Install new dependencies: `@prisma/client`, `prisma`, `jsonwebtoken`, `cookie-parser`, `@vercel/blob`
- [ ] Remove `sql.js`, `express-session`
- [ ] Create `vercel.json` with routes and crons config
- [ ] Create `.env.example` with all required environment variables

### Stage 2: Database Setup
- [ ] Create Neon PostgreSQL database
- [ ] Initialize Prisma: `npx prisma init`
- [ ] Write Prisma schema (`prisma/schema.prisma`) for all tables from Section 6
- [ ] Run `npx prisma migrate dev --name init`
- [ ] Create seed script (`prisma/seed.js`):
  - Seed `domains` table with all 6 domains (lucid/zurich/octik active, others inactive)
  - Seed admin users for lucid, zurich, octik (password: password123)
- [ ] Run `npx prisma db seed` and verify in Neon console

### Stage 3: Authentication
- [ ] Create `middleware/auth.js` — JWT `requireAuth` and `requireRole` functions
- [ ] Create `api/auth.js` router:
  - `POST /api/auth/login` — domain-aware login with JWT cookie
  - `GET /api/auth/logout` — clear cookie
  - `GET /api/auth/me` — return user from JWT (replaces GET /api/user)
- [ ] Update `login.html` — add domain dropdown, change form submission JS
- [ ] Test login for all 3 active domains
- [ ] Test that inactive domains show proper error
- [ ] Test JWT expiry (24h) and logout

### Stage 4: Database Helper Layer
- [ ] Create `database/client.js` — Prisma client singleton
- [ ] Create helper functions that scope all queries by domain:
  ```javascript
  // Every helper takes domain as first param
  function projectsForDomain(domain) {
      return prisma.project.findMany({ where: { domain } });
  }
  ```
- [ ] Port `dbGet`, `dbAll`, `dbRun`, `dbInsert` equivalents using Prisma
- [ ] Remove all sql.js imports and references

### Stage 5: Users API
- [ ] Port `GET /api/users` — add `WHERE domain = req.user.domain`
- [ ] Port `POST /api/users` — normalise email with domain suffix
- [ ] Port `PUT /api/users/:id` — domain scope
- [ ] Port `DELETE /api/users/:id` — domain scope
- [ ] Port `GET /api/profile` — domain scope
- [ ] Port `PUT /api/profile` — profile photo to Vercel Blob instead of disk
- [ ] Test all user operations for domain isolation (user in Lucid cannot be seen from Zurich)

### Stage 6: Projects API
- [ ] Port `generateProjectCode(domain)` — use domain prefix from config
- [ ] Port `GET /api/projects` — domain scope
- [ ] Port `POST /api/projects` — domain scope, file upload to Vercel Blob
- [ ] Port `GET /api/projects/:id` — domain scope
- [ ] Port `PUT /api/projects/:id` — domain scope
- [ ] Port `PATCH /api/projects/:id/status` — domain scope
- [ ] Port `DELETE /api/projects/:id` — domain scope
- [ ] Port `GET /api/projects/:id/files` — blob URLs
- [ ] Port `POST /api/projects/:id/files` — upload to Vercel Blob
- [ ] Port `DELETE /api/projects/:projectId/files/:fileId` — delete from Vercel Blob
- [ ] Port `GET /api/projects/:projectId/files/:fileId/download` — redirect to blob URL
- [ ] Port `GET /api/projects/:id/tasks` — domain scope
- [ ] Port `GET /api/projects/:id/reviews` — domain scope
- [ ] Port `POST /api/projects/:id/submit-for-review` — domain scope
- [ ] Port `POST /api/projects/:id/mark-reviewed` — domain scope
- [ ] Remove `saveProjectInfoFile` (writes to disk) — not needed in cloud version OR save as a blob file

### Stage 7: Tasks API
- [ ] Port `GET /api/tasks` — domain scope
- [ ] Port `POST /api/tasks` — domain scope, file upload to blob
- [ ] Port `GET /api/tasks/:id` — domain scope
- [ ] Port `PUT /api/tasks/:id` — domain scope
- [ ] Port `DELETE /api/tasks/:id` — domain scope
- [ ] Port `POST /api/tasks/:id/start-timer`
- [ ] Port `POST /api/tasks/:id/stop-timer`
- [ ] Port `POST /api/tasks/:id/pause-timer`
- [ ] Port `POST /api/tasks/:id/resume-timer`
- [ ] Port `GET /api/tasks/:id/sessions`
- [ ] Port `POST /api/tasks/:id/submit`
- [ ] Port `POST /api/tasks/:id/review`

### Stage 8: Heartbeat & Timer APIs
- [ ] Port `POST /api/heartbeat` — update `users.last_heartbeat` in DB instead of in-memory Map
- [ ] Port `GET /api/timer/running` — domain scope
- [ ] Port `POST /api/system/auto-pause` — update to work as a Cron endpoint

### Stage 9: Reports API
- [ ] Port `GET /api/reports/project-time` — domain scope
- [ ] Port `GET /api/reports/member-time` — domain scope
- [ ] Port `GET /api/reports/member-detail/:id` — domain scope
- [ ] Port `GET /api/reports/member-timeline/:id` — domain scope
- [ ] Port `GET /api/reports/task-iterations` — domain scope
- [ ] Port `GET /api/reports/project-progress` — domain scope
- [ ] Port `GET /api/reports/project-detail/:id` — domain scope
- [ ] Port `GET /api/reports/export` (CSV) — domain scope
- [ ] Port `GET /api/reports/members-list` — domain scope

### Stage 10: Other APIs
- [ ] Port `GET /api/notifications` — domain scope
- [ ] Port `PUT /api/notifications/:id/read`
- [ ] Port `GET /api/notifications/unread-count`
- [ ] Port `GET /api/dashboard/stats` — domain scope
- [ ] Port `GET /api/time-entries` — domain scope
- [ ] Port `GET /api/members` — domain scope
- [ ] Port `GET /api/managers` — domain scope
- [ ] Port `POST /api/upload` — to Vercel Blob

### Stage 11: Client Portal API
- [ ] Port `GET /api/client/dashboard` — domain scope
- [ ] Port `GET /api/client/projects` — domain scope
- [ ] Port `GET /api/client/projects/:id/tasks` — domain scope
- [ ] Port `GET /api/client/assigned-projects/:userId`

### Stage 12: Background Cron Jobs
- [ ] Create `api/cron/end-of-day-pause.js` — pause all active timers (calls same autoPauseAllTimers logic)
- [ ] Create `api/cron/heartbeat-guard.js` — query users with stale `last_heartbeat`, pause their active timers
- [ ] Create `api/cron/timer-guard.js` — pause timers running > 12 hours
- [ ] Add cron config to `vercel.json`
- [ ] Add `CRON_SECRET` env variable and verify it in each cron handler
- [ ] Test each cron job by calling the endpoint manually

### Stage 13: Frontend Updates
- [ ] Update `login.html` — domain dropdown, updated JS
- [ ] Update `dashboard.html` — make company name/branding dynamic from `/api/domain/config`
- [ ] Update all fetch calls in `dashboard.html` that reference `/login` redirect (now `/login` same, but logout is `/api/auth/logout`)
- [ ] Update `client.html` — same domain-branding dynamic update
- [ ] Remove any hardcoded "Lucid" text from HTML templates
- [ ] Test all features end-to-end in browser for each active domain

### Stage 14: Deploy & Verify
- [ ] Push all code to GitHub
- [ ] Connect repo to Vercel project
- [ ] Set all environment variables (Section 17)
- [ ] Deploy and verify at Vercel URL
- [ ] Test login with all 3 active domains
- [ ] Test data isolation: create a project in Lucid, verify it doesn't appear in Zurich
- [ ] Test file uploads (photo, project file)
- [ ] Test timer start/stop
- [ ] Test reports
- [ ] Test cron jobs (trigger manually from Vercel dashboard)
- [ ] Change all default admin passwords

### Stage 15: Data Migration (Optional — Migrate Lucid v1 Data)
- [ ] Export existing Lucid data from `C:\Users\PC4\AppData\Roaming\WTMS\wtms.db`
- [ ] Write migration script to transform SQLite rows → PostgreSQL with `domain='lucid'`
- [ ] Run migration in dry-run mode, verify row counts
- [ ] Run migration on production DB
- [ ] Verify migrated data appears correctly in the new system
- [ ] Keep the old Electron system running in parallel until verified

---

## 17. Environment Variables Reference

### Required in Vercel Dashboard (Settings → Environment Variables)

| Variable | Example Value | Description |
|----------|--------------|-------------|
| `DATABASE_URL` | `postgresql://user:pass@ep-xxx.neon.tech/wtms?sslmode=require` | Neon PostgreSQL connection string |
| `JWT_SECRET` | `a-very-long-random-secret-string-min-32-chars` | JWT signing secret — generate with `openssl rand -base64 32` |
| `BLOB_READ_WRITE_TOKEN` | `vercel_blob_rw_xxx` | Vercel Blob token (auto-generated when you enable Blob in project) |
| `CRON_SECRET` | `another-random-secret` | Secret header for Vercel Cron job authentication |
| `TZ` | `Asia/Kolkata` | Timezone for all date operations |
| `NODE_ENV` | `production` | Node environment |

### Optional
| Variable | Example Value | Description |
|----------|--------------|-------------|
| `SESSION_DURATION_HOURS` | `24` | JWT token lifetime in hours (default: 24) |
| `MAX_UPLOAD_MB` | `25` | Max file upload size in MB (default: 25) |
| `ENABLE_SIGNUP` | `false` | Whether self-registration is allowed (default: false, admin creates users) |

### `.env.local` (for local development)
```env
DATABASE_URL=postgresql://localhost:5432/wtms_dev
JWT_SECRET=local-dev-secret-change-in-production
BLOB_READ_WRITE_TOKEN=          # Leave blank locally — use local disk for dev
CRON_SECRET=local-cron-secret
TZ=Asia/Kolkata
NODE_ENV=development
```

---

## Appendix A: Domain Constants

```javascript
// config/domains.js
const DOMAIN_CONFIG = {
    lucid:   { name: 'Lucid',   prefix: 'LU', emailSuffix: '@lucid.wtms',   color: '#6366f1' },
    zurich:  { name: 'Zurich',  prefix: 'ZU', emailSuffix: '@zurich.wtms',  color: '#0ea5e9' },
    octik:   { name: 'Octik',   prefix: 'OC', emailSuffix: '@octik.wtms',   color: '#10b981' },
    nusence: { name: 'Nusence', prefix: 'NS', emailSuffix: '@nusence.wtms', color: '#f59e0b' },
    other:   { name: 'Other',   prefix: 'OT', emailSuffix: '@other.wtms',   color: '#8b5cf6' },
    common:  { name: 'Common',  prefix: 'CM', emailSuffix: '@common.wtms',  color: '#ec4899' },
};

const ACTIVE_DOMAINS = ['lucid', 'zurich', 'octik']; // Phase 1

module.exports = { DOMAIN_CONFIG, ACTIVE_DOMAINS };
```

---

## Appendix B: Seed Data (Phase 1)

```javascript
// prisma/seed.js
const domains = [
    { key: 'lucid',   name: 'Lucid',   prefix: 'LU', emailSuffix: '@lucid.wtms',   isActive: true },
    { key: 'zurich',  name: 'Zurich',  prefix: 'ZU', emailSuffix: '@zurich.wtms',  isActive: true },
    { key: 'octik',   name: 'Octik',   prefix: 'OC', emailSuffix: '@octik.wtms',   isActive: true },
    { key: 'nusence', name: 'Nusence', prefix: 'NS', emailSuffix: '@nusence.wtms', isActive: false },
    { key: 'other',   name: 'Other',   prefix: 'OT', emailSuffix: '@other.wtms',   isActive: false },
    { key: 'common',  name: 'Common',  prefix: 'CM', emailSuffix: '@common.wtms',  isActive: false },
];

// Admin users (password: password123) — change immediately after first login
const admins = [
    { domain: 'lucid',  email: 'admin@lucid.wtms',  fullName: 'Lucid Admin' },
    { domain: 'zurich', email: 'admin@zurich.wtms', fullName: 'Zurich Admin' },
    { domain: 'octik',  email: 'admin@octik.wtms',  fullName: 'Octik Admin' },
];
```

---

## Appendix C: Quick API Comparison

| Old Path | New Path | Change |
|----------|----------|--------|
| `POST /login` | `POST /api/auth/login` | + domain param |
| `GET /logout` | `GET /api/auth/logout` | JWT cookie cleared |
| `GET /api/user` | `GET /api/auth/me` | Returns domain in response |
| `POST /api/system/auto-pause` | `POST /api/cron/end-of-day-pause` | Cron-triggered |
| All other `/api/*` | Same path | No change externally; domain from JWT internally |

---

*This document is a complete blueprint for building WTMS Multi-Domain v2.0. Follow the Stage checklist sequentially. Each stage is independently testable before moving to the next.*
