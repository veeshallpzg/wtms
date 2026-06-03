

# Product Requirements Document (PRD) — CURRENT STATE
## Work Time Management System (WTMS)

---

## Document Information

| Field | Detail |
|---|---|
| **Project Name** | Work Time Management System (WTMS) |
| **Version** | Current (as of May 2026) |
| **Platform** | Electron Desktop App (Windows) |
| **Deployment** | LAN — Server PC + Client PCs |
| **Architecture** | Electron + Express + sql.js (SQLite in-memory, persisted to disk) |
| **Original PRD** | PRD.md (Antigravity IDE / Cline planning document — NOT updated) |

> This document reflects the **actual implemented system** as built through incremental development. It supersedes PRD.md for all reference purposes.

---

## 1. EXECUTIVE SUMMARY

WTMS is a Windows desktop application (Electron) that packages a full Express web server and SQLite database. One PC on the office LAN runs the server and database. All other PCs run the Electron app in **client mode**, which opens a browser window pointing to the server PC's IP. No installation or database is required on client machines beyond the Electron app.

The system tracks projects, tasks, and time entries for every team member across four roles: Admin, Manager, Member, and Client. The critical differentiator is **iteration-aware time tracking** — every revision cycle is a separate iteration record with its own time entries, so management can see the true cost (time + revisions) of delivering any task.

Additional differentiators over the original plan:
- Managers can self-assign and time-track their own tasks
- Multiple managers can be co-owners of a single project
- Detailed pause reason tracking (Break, Meeting, On Call, Done for Day, Other, Auto)
- Automated timer guards: end-of-day pause at 8 PM IST, 12-hour cap, inactivity heartbeat
- Full client portal with separate read-only view
- Project-level client review workflow

---

## 2. DEPLOYMENT ARCHITECTURE

### 2.1 Installation

- **Installer**: NSIS perMachine installer → `C:\Program Files\WTMS\`
- **Auto-start**: Registered with Windows login via `setLoginItemSettings`
- **Tray app**: Closing the window minimizes to system tray; double-click tray icon to restore

### 2.2 Server PC (One machine on LAN)

| Item | Value |
|---|---|
| Static IP | 192.168.29.251 |
| Port | 8080 |
| Mode | Server mode (runs Express + sql.js) |
| Database | `C:\Users\PC4\AppData\Roaming\WTMS\wtms.db` |
| Uploads | `C:\Users\PC4\AppData\Roaming\WTMS\uploads\` |

### 2.3 Client PCs (All other machines)

| Item | Value |
|---|---|
| Mode | Client mode |
| Config file | `%APPDATA%\WTMS\wtms-server-config.json` |
| Config fields | `{ "mode": "client", "serverUrl": "http://192.168.29.251:8080" }` |
| Default | New installs default to client mode (no setup screen shown) |
| Local server | None — no local DB or Express on client machines |

### 2.4 First-Run Setup

If no config file exists, a setup screen (`electron-setup.html`) is shown. The user selects server or client mode. After saving, the app initializes accordingly. Subsequent launches skip the setup screen.

---

## 3. TECHNOLOGY STACK

| Layer | Technology |
|---|---|
| Desktop shell | Electron |
| Web server | Express.js |
| Database engine | sql.js (SQLite compiled to WebAssembly, in-memory, written to disk) |
| Frontend | Single-page HTML (`dashboard.html`) — vanilla JavaScript, no framework |
| Client portal | Separate single-page HTML (`client.html`) |
| Charts | Chart.js 4.4.0 (bundled locally at `public/chart.umd.min.js`) |
| File uploads | Multer (memory storage → disk) |
| Sessions | express-session, 24-hour cookie |
| Timezone | Asia/Kolkata (IST, UTC+5:30) — set at server startup |

---

## 4. USER ROLES

### 4.1 Role Definitions

#### ADMIN
- Super user — full access to everything
- Manages users, projects, tasks, reports
- Can start/pause/resume timers on own tasks
- Sees all data across all projects

#### MANAGER
- Assigned to one or more projects (including as co-manager)
- Creates and manages tasks within assigned/co-managed projects
- Can **self-assign** tasks (using "Myself" option in assign dropdown)
- Can **start, pause, resume, and submit** their own assigned tasks (timer tracking)
- Reviews submitted tasks (approve / request revision)
- Sees team activity in real time

#### MEMBER
- Receives task assignments
- Starts/pauses/resumes/submits their own tasks
- Enters remarks and uploads files on submission
- Views only their own tasks and assigned project details

#### CLIENT
- Read-only external stakeholder role
- Assigned to specific projects by Admin
- Accesses a **separate client portal** at `/client` (not the main dashboard)
- Can view project progress, task status, and approve/request revision at the project level
- Cannot create, edit, or time-track anything

---

## 5. ACCESS CONTROL MATRIX

| Feature / Action | Admin | Manager | Member | Client |
|---|---|---|---|---|
| **User Management** | | | | |
| Create / Edit / Deactivate Users | ✅ | ❌ | ❌ | ❌ |
| Assign Roles | ✅ | ❌ | ❌ | ❌ |
| View All Users | ✅ | ✅ (team) | ❌ | ❌ |
| **Project Management** | | | | |
| Create Project | ✅ | ✅ | ❌ | ❌ |
| Edit Project | ✅ | ✅ (own/co-managed) | ❌ | ❌ |
| Delete / Archive Project | ✅ | ❌ | ❌ | ❌ |
| Assign Co-Managers | ✅ | ✅ (own projects) | ❌ | ❌ |
| View All Projects | ✅ | ✅ (assigned only) | ❌ | ✅ (assigned only) |
| Submit Project for Client Review | ✅ | ✅ (own projects) | ❌ | ❌ |
| Approve / Request Revision (Project) | ✅ | ❌ | ❌ | ✅ |
| **Task Management** | | | | |
| Create Task | ✅ | ✅ (own projects) | ❌ | ❌ |
| Edit Task | ✅ | ✅ (own projects) | ❌ | ❌ |
| Delete / Cancel Task | ✅ | ✅ (own projects) | ❌ | ❌ |
| Assign Task to Member | ✅ | ✅ (own projects) | ❌ | ❌ |
| Assign Task to Self (Manager) | ✅ | ✅ | ❌ | ❌ |
| Re-assign Task | ✅ | ✅ (own projects) | ❌ | ❌ |
| View All Tasks | ✅ | ✅ (own projects) | ✅ (own tasks) | ✅ (project tasks, read-only) |
| Approve / Request Revision (Task) | ✅ | ✅ (own projects) | ❌ | ❌ |
| **Time Tracking** | | | | |
| Start Timer on Task | ✅ (own) | ✅ (own) | ✅ (own) | ❌ |
| Pause Timer | ✅ (own) | ✅ (own) | ✅ (own) | ❌ |
| Resume Timer | ✅ (own) | ✅ (own) | ✅ (own) | ❌ |
| Submit Task | ✅ (own) | ✅ (own) | ✅ (own) | ❌ |
| View Time Entries | ✅ (all) | ✅ (own projects) | ✅ (own entries) | ❌ |
| **Reports** | | | | |
| View Global Dashboard | ✅ | ✅ (filtered) | ✅ (personal) | ✅ (client view) |
| Project Time Report | ✅ | ✅ (own projects) | ❌ | ❌ |
| Member Time Report | ✅ | ✅ (own projects) | ❌ | ❌ |
| Task Iteration Report | ✅ | ✅ (own projects) | ❌ | ❌ |
| Export CSV | ✅ | ✅ (own projects) | ❌ | ❌ |
| **Notifications** | | | | |
| Receive Task Assignment | ❌ | ✅ (self-assigned) | ✅ | ❌ |
| Receive Task Submission | ✅ | ✅ | ❌ | ❌ |
| Receive Revision Request | ❌ | ✅ (if self-assigned) | ✅ | ❌ |
| Receive Approval | ❌ | ✅ (if self-assigned) | ✅ | ❌ |

---

## 6. DATABASE SCHEMA

### 6.1 Entity Relationship Overview

```
USERS ──────────────────────────────────────┐
  │                                         │
  │ (assigned_to, assigned_by, created_by)  │
  ▼                                         │
PROJECTS ◄───────────────────────────────────┘
  │         │               │
  │    project_managers  project_members
  │    (co-managers)     (client access)
  │
  ├── project_contacts  (contact persons)
  ├── project_reviews   (client review cycles)
  │
  │ (project_id)
  ▼
TASKS
  │
  │ (task_id)
  ▼
TASK_ITERATIONS
  │
  │ (iteration_id)
  ▼
TIME_ENTRIES ──── (pause_type)
  │
FILE_ATTACHMENTS
NOTIFICATIONS
ACTIVITY_LOG
PROJECT_SEQUENCES  (project code counter)
```

### 6.2 Table Definitions

#### Table: `users`
| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK, auto-increment |
| full_name | TEXT | NOT NULL |
| email | TEXT | UNIQUE, NOT NULL. Normalized to `@lucid.wtms` domain |
| password_hash | TEXT | NOT NULL |
| role | TEXT | `admin`, `manager`, `member`, `client` |
| is_active | INTEGER | 1 = active, 0 = deactivated (soft delete) |
| avatar_url | TEXT | Profile photo path |
| date_of_birth | TEXT | |
| anniversary_date | TEXT | |
| aadhar_number | TEXT | |
| pan_number | TEXT | |
| blood_group | TEXT | |
| joining_date | TEXT | |
| created_at | DATETIME | |
| updated_at | DATETIME | |

#### Table: `projects`
| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK |
| project_name | TEXT | NOT NULL |
| project_code | TEXT | UNIQUE, NOT NULL. Format: `LU-YY-NNN-MMM` |
| client_name | TEXT | |
| description | TEXT | |
| manager_id | INTEGER | FK → users.id (primary manager) |
| status | TEXT | `not_started`, `in_progress`, `on_hold`, `client_review`, `completed`, `archived` |
| priority | TEXT | `low`, `medium`, `high`, `critical` |
| start_date | DATE | |
| due_date | DATE | |
| actual_end_date | DATE | |
| created_by | INTEGER | FK → users.id |
| created_at | DATETIME | |
| updated_at | DATETIME | |

> **Archive behaviour**: Archived projects are hidden from all list views but data is fully preserved (soft delete).

#### Table: `project_managers` *(multi-manager support)*
| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK |
| project_id | INTEGER | FK → projects.id |
| user_id | INTEGER | FK → users.id (must be role=manager or admin) |
| added_at | DATETIME | |

> All manager permission checks use `isProjectManager()` which queries this table. A manager in this table has full project ownership equal to the primary `manager_id`.

#### Table: `project_contacts`
| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK |
| project_id | INTEGER | FK → projects.id |
| contact_name | TEXT | |
| contact_phone | TEXT | |
| contact_email | TEXT | |
| created_at | DATETIME | |

#### Table: `project_members` *(client access)*
| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK |
| project_id | INTEGER | FK → projects.id |
| user_id | INTEGER | FK → users.id (must be role=client) |
| joined_at | DATETIME | |

#### Table: `project_reviews` *(client review workflow)*
| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK |
| project_id | INTEGER | FK → projects.id |
| submitted_at | DATETIME | When manager submitted for client review |
| responded_at | DATETIME | When client responded |
| response_type | TEXT | `approved`, `revision_requested` |
| response_notes | TEXT | Client's response comments |
| review_minutes | INTEGER | Minutes the review took |
| submitted_by | INTEGER | FK → users.id |

#### Table: `project_sequences` *(project code counter)*
| Column | Type | Notes |
|---|---|---|
| year | INTEGER | PK (4-digit year) |
| next_seq | INTEGER | Next sequence number for this year |

#### Table: `tasks`
| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK |
| project_id | INTEGER | FK → projects.id |
| task_title | TEXT | NOT NULL |
| task_description | TEXT | |
| assigned_to | INTEGER | FK → users.id |
| assigned_by | INTEGER | FK → users.id |
| status | TEXT | `pending`, `in_progress`, `paused`, `submitted`, `under_review`, `revision_requested`, `completed`, `cancelled` |
| priority | TEXT | `low`, `medium`, `high`, `critical` |
| current_iteration | INTEGER | DEFAULT 1 |
| estimated_hours | REAL | |
| total_time_spent | REAL | Cumulative minutes across all iterations |
| due_date | DATE | |
| actual_end_date | DATE | |
| task_category | TEXT | `project_requirement` or `client_request` |
| created_at | DATETIME | |
| updated_at | DATETIME | |

#### Table: `task_iterations`
| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK |
| task_id | INTEGER | FK → tasks.id |
| iteration_number | INTEGER | 1 = initial, 2+ = revisions |
| iteration_type | TEXT | `initial` or `revision` |
| revision_reason | TEXT | Manager's reason for requesting revision |
| started_at | DATETIME | When member first started work on this iteration |
| submitted_at | DATETIME | |
| reviewed_at | DATETIME | |
| review_status | TEXT | `pending`, `approved`, `revision_requested` |
| review_remarks | TEXT | Manager's review comments |
| member_remarks | TEXT | Member's completion remarks |
| total_time_spent | REAL | Minutes for this iteration only |
| assigned_to | INTEGER | FK → users.id |
| created_at | DATETIME | |

#### Table: `time_entries`
| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK |
| task_id | INTEGER | FK → tasks.id |
| iteration_id | INTEGER | FK → task_iterations.id |
| user_id | INTEGER | FK → users.id |
| start_time | DATETIME | Server time (IST) |
| end_time | DATETIME | NULL while timer is running |
| duration_minutes | REAL | Calculated on stop |
| remarks | TEXT | |
| is_active | INTEGER | 1 = timer currently running |
| pause_type | TEXT | `break`, `meeting`, `done_for_day`, `on_call`, `other`, `auto` |
| created_at | DATETIME | |

> `pause_type` is set when the timer is stopped/paused. `auto` is used by background guards (end-of-day, 12h cap, inactivity, screen lock, suspend).

#### Table: `file_attachments`
| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK |
| project_id | INTEGER | FK → projects.id |
| task_id | INTEGER | Nullable — NULL = project-level file |
| iteration_id | INTEGER | Nullable |
| uploaded_by | INTEGER | FK → users.id |
| file_name | TEXT | Original file name |
| file_path | TEXT | Server storage path |
| file_size | INTEGER | Bytes |
| file_type | TEXT | MIME type |
| upload_type | TEXT | `client_input`, `deliverable`, `reference`, `revision_input` |
| description | TEXT | |
| version | INTEGER | DEFAULT 1 |
| created_at | DATETIME | |

#### Table: `notifications`
| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK |
| user_id | INTEGER | FK → users.id (recipient) |
| type | TEXT | `task_assigned`, `task_submitted`, `revision_requested`, `task_completed`, `project_created`, `file_uploaded` |
| title | TEXT | |
| message | TEXT | |
| reference_type | TEXT | `project`, `task`, `iteration`, `file` |
| reference_id | INTEGER | |
| is_read | INTEGER | 0 = unread |
| created_at | DATETIME | |

#### Table: `activity_log`
| Column | Type | Notes |
|---|---|---|
| id | INTEGER | PK |
| user_id | INTEGER | FK → users.id |
| action | TEXT | |
| entity_type | TEXT | `project`, `task`, `iteration`, `file` |
| entity_id | INTEGER | |
| details | TEXT | JSON or text |
| ip_address | TEXT | |
| created_at | DATETIME | |

### 6.3 Database Indexes

```sql
CREATE INDEX idx_tasks_assigned ON tasks(assigned_to, project_id, status);
CREATE INDEX idx_time_entries_user ON time_entries(user_id, is_active, task_id, iteration_id);
CREATE INDEX idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX idx_activity_log_entity ON activity_log(entity_type, entity_id);
CREATE INDEX idx_project_managers ON project_managers(project_id, user_id);
```

---

## 7. PROJECT CODE FORMAT

| Segment | Description | Example |
|---|---|---|
| `LU` | Fixed prefix | `LU` |
| `YY` | 2-digit year | `26` |
| `NNN` | Zero-padded sequence (expands beyond 3 digits if needed) | `001` |
| `MMM` | 3-letter month abbreviation | `MAY` |

**Full example:** `LU-26-001-MAY`

Sequence counter is stored per-year in `project_sequences`. Auto-increments atomically on each project creation. Client-supplied codes are ignored — all codes are server-generated.

---

## 8. EMAIL DOMAIN

| Item | Value |
|---|---|
| Domain | `@lucid.wtms` |
| Normalization | Entering `john` or `john@anything.com` → stored as `john@lucid.wtms` |
| Default admin | `admin@lucid.wtms` / password: `password123` |
| Legacy migration | `@wtms.local` and `@zurich.wtms` emails auto-migrated to `@lucid.wtms` on server start |

---

## 9. PROCESS FLOWS

### 9.1 Project Lifecycle

```
Admin/Manager creates project
        │
        ▼
Status: NOT_STARTED
        │
Manager creates tasks
        │
        ▼
Status: IN_PROGRESS
        │
All tasks done / Manager decides
        │
        ├──► Status: ON_HOLD  (pause project)
        │
        ├──► Status: CLIENT_REVIEW  (submit to client; all active timers auto-paused)
        │           │
        │           ├──► Client approves  → Status: COMPLETED
        │           └──► Client requests revision → Status: IN_PROGRESS
        │
        └──► Status: COMPLETED  (manager directly)
        
Archive:  Admin soft-deletes → Status: ARCHIVED (hidden from all lists, data preserved)
```

### 9.2 Task Lifecycle (With Iteration Tracking)

```
Manager creates task → Iteration #1 (initial) auto-created
        │
        ▼
Status: PENDING
Member clicks "Start Task"
        │
        ▼
Status: IN_PROGRESS  ←──────────────────────────────────────┐
Timer running (time_entry.is_active = 1)                     │
        │                                                     │
Member can PAUSE (with pause reason)                          │
        │                                                     │
        ▼                                                     │
Status: PAUSED                                               │
Member clicks "Resume"                                        │
        │                                                     │
        └──► Back to IN_PROGRESS ────────────────────────────┤
                                                              │
Member clicks "Submit"                                        │
        │                                                     │
        ▼                                                     │
Timer stops, remarks required, files optional                │
Status: SUBMITTED                                            │
        │                                                     │
Manager reviews                                              │
        │                                                     │
        ├──► APPROVE → Status: COMPLETED                     │
        │                                                     │
        └──► REQUEST REVISION                                │
                 │                                            │
                 Iteration #N+1 created (type: revision)     │
                 task.current_iteration incremented           │
                 Status: REVISION_REQUESTED ─────────────────┘
                 Member notified → repeats the cycle
```

### 9.3 Multi-Task Timer Behaviour

Only **one timer can be active per user** at any time.

| Scenario | Behaviour |
|---|---|
| Start Task B while Task A is running | Task A's timer auto-closes (end_time recorded, duration calculated, status set to `paused`) |
| Resume Task A while Task B is running | Task B's timer auto-closes (same as above), then Task A starts |
| System guard fires | All active timers for affected users are paused (pause_type = `auto`) |

Both the `start-timer` and `resume-timer` endpoints perform full time aggregation on the displaced task before closing its timer: iteration total and task total are both updated to prevent data loss.

### 9.4 Client Review Workflow (Project Level)

```
Manager clicks "Submit for Client Review"
        │
        All active timers in project auto-paused
        Project status → CLIENT_REVIEW
        Project review record created (submitted_at = now)
        │
        ▼
Client logs into client portal, sees project in "Under Review" state
        │
        ├──► Client clicks "Approve"
        │        Project status → COMPLETED
        │        Review record: response_type = approved
        │
        └──► Client clicks "Request Revision"
                 Project status → IN_PROGRESS
                 Review record: response_type = revision_requested
                 Manager notified
```

### 9.5 Pause Flow (With Reason)

When a member/manager manually pauses a task, a pause modal appears with reason cards:

| Reason | Code | Icon |
|---|---|---|
| Break | `break` | ☕ |
| Meeting | `meeting` | 🤝 |
| Done for Day | `done_for_day` | 🌙 |
| On Call | `on_call` | 📞 |
| Other | `other` | — |

The selected `pause_type` is saved on the `time_entries` row when the timer is stopped. System-triggered pauses use `auto`.

---

## 10. BACKGROUND JOBS (Automated Guards)

All jobs run as `setInterval` within the Express server process.

| Job | Interval | Logic |
|---|---|---|
| **End-of-Day Auto-Pause** | Every 1 minute | At 20:00 IST exactly, pause all active timers for all users. A daily date guard ensures it fires only once per calendar day. |
| **12-Hour Timer Cap** | Every 15 minutes | If any active timer has been running for > 720 minutes (12 hours), auto-pause all timers for that user. |
| **Inactivity Heartbeat Guard** | Every 5 minutes | Frontend sends `POST /api/heartbeat` periodically. If a user has an active timer but no heartbeat in the last 10 minutes, auto-pause their timer. |

### Electron Power Events

| Event | Behaviour |
|---|---|
| `suspend` (sleep/hibernate) | Auto-pause all active timers (all users, all roles) |
| `shutdown` | Auto-pause all active timers, 400ms grace period before exit |
| `lock-screen` | Auto-pause timers on the **server PC only** (`server_only = true` flag) — client PC screen locks do not affect other users' timers |
| `resume` / `unlock-screen` | UI dispatches a custom event; user is prompted to resume their last task |

---

## 11. API ENDPOINTS

### Authentication
| Method | Path | Description |
|---|---|---|
| GET | `/login` | Login page |
| POST | `/login` | Authenticate user |
| GET | `/logout` | Destroy session |

### Users
| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/api/user` | All | Current session user |
| GET | `/api/profile` | All | Own profile (extended fields) |
| PUT | `/api/profile` | All | Update own profile + photo |
| GET | `/api/users` | Admin | All users list |
| POST | `/api/users` | Admin | Create user |
| PUT | `/api/users/:id` | Admin | Update user |
| DELETE | `/api/users/:id` | Admin | Deactivate user |
| GET | `/api/members` | Manager+ | Members for task assignment |
| GET | `/api/managers` | Admin | All managers |

### Projects
| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/api/projects` | All | List projects (role-filtered) |
| POST | `/api/projects` | Admin/Manager | Create project |
| GET | `/api/projects/:id` | Allowed | Project detail + contacts + co-managers |
| PUT | `/api/projects/:id` | Admin/Manager | Update project |
| PATCH | `/api/projects/:id/status` | Admin/Manager | Quick status change |
| DELETE | `/api/projects/:id` | Admin | Archive project |
| POST | `/api/projects/:id/submit-for-review` | Admin/Manager | Submit for client review |
| POST | `/api/projects/:id/mark-reviewed` | Client | Mark client review done |
| GET | `/api/projects/:id/reviews` | Admin/Manager | Review history |
| GET | `/api/projects/:id/files` | Allowed | List project files |
| POST | `/api/projects/:id/files` | Admin/Manager | Upload project file |
| DELETE | `/api/projects/:projectId/files/:fileId` | Admin/Manager | Delete file |
| GET | `/api/projects/:projectId/files/:fileId/download` | Allowed | Download file |

### Tasks
| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/api/tasks` | All | List all tasks (role-filtered) |
| GET | `/api/projects/:id/tasks` | Allowed | Tasks for a project |
| POST | `/api/tasks` | Admin/Manager | Create task |
| GET | `/api/tasks/:id` | Allowed | Task detail + iterations + time entries |
| PUT | `/api/tasks/:id` | Admin/Manager | Edit task |
| DELETE | `/api/tasks/:id` | Admin/Manager | Cancel task |
| GET | `/api/tasks/:id/files` | Allowed | Files for task |
| GET | `/api/tasks/:id/files/:fileId/download` | Allowed | Download task file |

### Time Tracking
| Method | Path | Access | Description |
|---|---|---|---|
| POST | `/api/tasks/:id/start-timer` | Member/Manager | Start timer (auto-stops any running timer) |
| POST | `/api/tasks/:id/stop-timer` | Member/Manager | Stop active timer |
| POST | `/api/tasks/:id/pause-timer` | Member/Manager | Pause with reason |
| POST | `/api/tasks/:id/resume-timer` | Member/Manager | Resume paused task |
| GET | `/api/timer/running` | Member/Manager | Current running timer for user |
| GET | `/api/tasks/:id/sessions` | Allowed | All work sessions for task |

### Task Workflow
| Method | Path | Access | Description |
|---|---|---|---|
| POST | `/api/tasks/:id/submit` | Member/Manager | Submit task for review |
| POST | `/api/tasks/:id/review` | Admin/Manager | Approve or request revision |

### System
| Method | Path | Access | Description |
|---|---|---|---|
| POST | `/api/system/auto-pause` | Localhost only | Electron triggers auto-pause (power events) |
| POST | `/api/heartbeat` | All | Inactivity guard keep-alive |

### Notifications
| Method | Path | Description |
|---|---|---|
| GET | `/api/notifications` | Unread notifications for current user |
| PUT | `/api/notifications/:id/read` | Mark as read |
| GET | `/api/notifications/unread-count` | Unread count (for badge) |

### Dashboard & Reports
| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/api/dashboard/stats` | All | Summary stats (role-filtered) |
| GET | `/api/time-entries` | All | Time entries list (role-filtered, max 200) |
| GET | `/api/reports/project-time` | Admin/Manager | Project time breakdown |
| GET | `/api/reports/member-time` | Admin/Manager | Member time totals |
| GET | `/api/reports/member-detail/:id` | Admin/Manager | Member detail breakdown |
| GET | `/api/reports/member-timeline/:id` | Admin/Manager | Member work timeline |
| GET | `/api/reports/task-iterations` | Admin/Manager | Task iteration breakdown |
| GET | `/api/reports/project-progress` | Admin/Manager | Project progress overview |
| GET | `/api/reports/project-detail/:id` | Admin/Manager | Detailed project report |
| GET | `/api/reports/export` | Admin/Manager | CSV export |
| GET | `/api/reports/members-list` | Admin/Manager | Members list for dropdowns |

### Client Portal
| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/client` | Client | Client portal HTML page |
| GET | `/api/client/dashboard` | Client | Client summary stats |
| GET | `/api/client/projects` | Client | Assigned projects |
| GET | `/api/client/projects/:id/tasks` | Client | Tasks for a project (read-only) |
| GET | `/api/client/assigned-projects/:userId` | Admin | Get client's project list |

---

## 12. DASHBOARD VIEWS

### 12.1 Admin Dashboard
- Summary cards: Total Projects, Active Projects, Total Tasks, Pending Reviews
- Task Status Breakdown (pie chart via Chart.js)
- Recent Tasks table (last 10 tasks across all projects)
- Links to full reports

### 12.2 Manager Dashboard
- Summary cards: My Projects, Team Tasks, Pending Reviews, Overdue Tasks
- Notifications panel (task submissions, etc.)
- My Projects (cards with progress bars)
- Tasks Requiring Review table
- Team Activity (current task per member, timer status)

### 12.3 Member Dashboard
- Summary cards: My Tasks, Active Timer, Today's Hours, Pending Tasks
- Running timer card (current task + session time + pause/submit buttons)
- My Task List (all assigned tasks with status and actions)
- Today's Time Log
- Weekly Time Bar Chart (7 days, Chart.js)
- Notifications panel

### 12.4 Client Portal (`/client`)
- Separate page from the main dashboard
- My Projects (assigned projects with progress)
- Project status cards (task counts, hours spent)
- Task status read-only view
- Client Review Action (approve / request revision button when project is in `client_review` state)

---

## 13. NOTIFICATION EVENTS

| Event | Recipient | Title Template |
|---|---|---|
| Task created/assigned | Assigned member | "New task assigned: {task_title} in {project_name}" |
| Task submitted | Project manager(s) | "{member_name} submitted {task_title} for review" |
| Task approved | Assigned member | "Your task {task_title} has been approved ✅" |
| Revision requested | Assigned member | "Revision requested for {task_title}: {reason}" |
| Project created | Assigned manager | "New project assigned: {project_name}" |
| File uploaded | Project team | "New file uploaded to {task_title}: {filename}" |

- Delivered as in-app notifications (bell icon with unread count badge)
- Notification panel: dropdown list, mark as read, click to navigate to relevant entity

---

## 14. BUSINESS RULES

| # | Rule |
|---|---|
| BR-01 | A project has one primary manager (`manager_id`) and optionally multiple co-managers (`project_managers` table) |
| BR-02 | All co-managers have identical permissions to the primary manager for that project |
| BR-03 | A task belongs to exactly one project |
| BR-04 | A task can be assigned to one member **or** a manager (including the assigning manager themselves) |
| BR-05 | Only one timer can be active per user at any time |
| BR-06 | Starting a new timer auto-pauses any currently running timer; both iteration and task totals are aggregated before closing |
| BR-07 | Resuming a paused task while another timer is running auto-pauses the running task first |
| BR-08 | A task cannot be submitted without stopping the timer |
| BR-09 | A task cannot be reviewed unless its status is `submitted` |
| BR-10 | Requesting a revision automatically creates a new iteration (number incremented) |
| BR-11 | `task.total_time_spent` is always the SUM of all `time_entries.duration_minutes` for that task across all iterations |
| BR-12 | `task_iterations.total_time_spent` is always the SUM of `time_entries.duration_minutes` for that iteration |
| BR-13 | Project progress % = (completed tasks / total tasks) × 100 |
| BR-14 | Deactivated users cannot log in; all historical data is preserved |
| BR-15 | Archived projects are hidden from all list views; data is preserved |
| BR-16 | Submitting a project for client review auto-pauses all active timers in that project |
| BR-17 | All timestamps use server time (IST — Asia/Kolkata) to ensure consistency across LAN clients |
| BR-18 | Member remarks are required when submitting a task |
| BR-19 | Manager revision reason is required when requesting a revision |
| BR-20 | The `lock-screen` event only auto-pauses timers on the server PC; client PC screen locks are ignored |
| BR-21 | Timers auto-pause at 20:00 IST daily (end-of-day guard) |
| BR-22 | Any timer running longer than 12 hours is auto-paused |
| BR-23 | A user with an active timer who has not sent a heartbeat in 10 minutes has their timer auto-paused |

---

## 15. FILE MANAGEMENT

### Storage Structure
```
{WTMS_DATA_DIR}/uploads/
└── {project_code}/
    ├── project_info.txt          ← Auto-generated metadata
    ├── {client_input_files}
    └── {task_deliverable_files}
```

- `WTMS_DATA_DIR` = `%APPDATA%\WTMS\` on Windows (Electron userData path)
- Files are organized under the project code directory
- If a filename conflicts, the server appends `_1`, `_2`, etc. automatically

### Upload Types
| Type | Uploaded By | When |
|---|---|---|
| `client_input` | Admin/Manager | Project creation or any time |
| `deliverable` | Member/Manager | On task submission |
| `reference` | Admin/Manager | General project reference |
| `revision_input` | Manager | When requesting revision |

---

## 16. HOW TO UPDATE THE INSTALLED APP

After code changes in `d:\wtmslocal`:

```
1. npm run build          (builds to dist\win-unpacked)
2. Kill WTMS process:
   taskkill /IM WTMS.exe /F
   netstat -ano | findstr ":8080"   (kill any leftover port 8080 process by PID)
3. Run deploy_quick.ps1 as Administrator
   (copies server.js, electron-main.js, database\init.js, public\dashboard.html, public\chart.umd.min.js)
4. Launch from desktop shortcut
   (do NOT launch from terminal — port binding is unreliable that way)
```

### Files Deployed by `deploy_quick.ps1`
| File | Purpose |
|---|---|
| `server.js` | Express server, all API endpoints, background jobs |
| `electron-main.js` | Electron shell, power monitoring, tray, client/server mode |
| `database\init.js` | Schema creation and migrations |
| `public\dashboard.html` | Full frontend (admin/manager/member) |
| `public\chart.umd.min.js` | Chart.js 4.4.0 (local, no CDN dependency) |

---

## 17. DEFAULT CREDENTIALS

| Role | Email | Password |
|---|---|---|
| Admin | admin@lucid.wtms | password123 |

> Admin creates all other user accounts via the Users section. No public registration.

---

## 18. STATUS REFERENCE

### Project Status
| Status | Color | Meaning |
|---|---|---|
| `not_started` | Gray | Created, no work begun |
| `in_progress` | Blue | Active work |
| `on_hold` | Amber | Temporarily paused |
| `client_review` | Purple | Submitted to client for review |
| `completed` | Green | Fully done |
| `archived` | Dark gray | Soft-deleted, hidden from lists |

### Task Status
| Status | Color | Meaning |
|---|---|---|
| `pending` | Gray | Assigned, not started |
| `in_progress` | Blue | Timer running |
| `paused` | Amber | Timer stopped, not submitted |
| `submitted` | Yellow | Member submitted, awaiting review |
| `under_review` | Purple | Manager viewing |
| `revision_requested` | Orange | Manager sent back for changes |
| `completed` | Green | Approved by manager |
| `cancelled` | Red | Cancelled by admin/manager |

### Priority
| Priority | Color |
|---|---|
| `low` | Green |
| `medium` | Amber |
| `high` | Red |
| `critical` | Dark red |

---

## 19. FEATURES NOT YET IMPLEMENTED

Items from the original PRD that remain out of scope:

| # | Feature |
|---|---|
| FE-01 | Email notifications (SMTP) |
| FE-02 | Gantt chart view |
| FE-03 | Kanban / drag-and-drop task board |
| FE-05 | Mobile responsive optimization |
| FE-06 | Automated daily/weekly email reports |
| FE-07 | Task dependencies |
| FE-08 | Billing/invoicing |
| FE-09 | External integrations (Slack, etc.) |
| FE-10 | Database backup and restore utility |

---

*This document was generated to reflect the actual implemented state of WTMS as of May 2026. The original planning document is preserved at `PRD.md`.*
