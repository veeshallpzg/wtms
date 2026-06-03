

# Product Requirements Document (PRD)
## Work Time Management System (WTMS)

---

## Document Information

| Field | Detail |
|---|---|
| **Project Name** | Work Time Management System (WTMS) |
| **Version** | 1.0 |
| **Platform** | Antigravity IDE (No-Code Web App) |
| **Agent** | Cline in Antigravity |
| **Deployment** | Local PC on LAN (accessible via IP address) |
| **Architecture** | Single-page web application with SQLite/local database |

---

## 1. EXECUTIVE SUMMARY

The Work Time Management System (WTMS) is a LAN-hosted web application designed to track projects, tasks, and time entries for every team member. The system captures the complete lifecycle of a project — from initial creation with client-provided attachments, through task breakdown and assignment, to granular time tracking that distinguishes between first-attempt work and revision cycles. The critical differentiator is the **iteration-aware time tracking** that logs every revision cycle so management can see the true cost (time + resources) of delivering a task to final completion.

---

## 2. GOALS AND OBJECTIVES

| # | Objective |
|---|---|
| G1 | Provide a centralized system to manage projects, tasks, and time entries |
| G2 | Enable precise time tracking per task per member with automatic start/stop recording |
| G3 | Track task revision cycles (iterations) to measure total effort including client-requested changes |
| G4 | Provide clear dashboards for Admin, Manager, and Member roles |
| G5 | Enable file upload and organized storage per project/task |
| G6 | Keep the interface simple, precise, and less complicated |
| G7 | Host on a local PC accessible over LAN via IP address |

---

## 3. USER ROLES AND ACCESS MATRIX

### 3.1 Role Definitions

#### ROLE 1: ADMIN
- Super user of the system
- Can do everything a Manager can do, plus system-level configuration
- Views all projects, all tasks, all time entries, all reports
- Manages users (create, edit, deactivate)

#### ROLE 2: MANAGER
- Assigned to one or more projects
- Creates and manages tasks within assigned projects
- Assigns tasks to members
- Monitors progress, reviews completed tasks
- Can approve or send tasks back for revision (triggering a new iteration)

#### ROLE 3: MEMBER
- Receives task assignments via dashboard notifications
- Starts/stops time tracking on assigned tasks
- Enters remarks upon task completion
- Uploads deliverable files upon task completion
- Views only their own tasks and assigned project details

### 3.2 Access Control Matrix

| Feature / Action | Admin | Manager | Member |
|---|---|---|---|
| **User Management** | | | |
| Create / Edit / Deactivate Users | ✅ | ❌ | ❌ |
| Assign Roles | ✅ | ❌ | ❌ |
| View All Users | ✅ | ✅ (own team) | ❌ |
| **Project Management** | | | |
| Create Project | ✅ | ✅ | ❌ |
| Edit Project Details | ✅ | ✅ (own projects) | ❌ |
| Delete / Archive Project | ✅ | ❌ | ❌ |
| Assign Manager to Project | ✅ | ❌ | ❌ |
| View All Projects | ✅ | ✅ (assigned only) | ❌ |
| Upload Project Attachments | ✅ | ✅ (own projects) | ❌ |
| **Task Management** | | | |
| Create Task | ✅ | ✅ (own projects) | ❌ |
| Edit Task | ✅ | ✅ (own projects) | ❌ |
| Delete Task | ✅ | ✅ (own projects) | ❌ |
| Assign Task to Member | ✅ | ✅ (own projects) | ❌ |
| Re-assign Task | ✅ | ✅ (own projects) | ❌ |
| View All Tasks | ✅ | ✅ (own projects) | ✅ (own tasks) |
| Approve / Reject Task (Send for Revision) | ✅ | ✅ (own projects) | ❌ |
| **Time Tracking** | | | |
| Start Timer on Task | ❌ | ❌ | ✅ (own tasks) |
| Stop Timer on Task | ❌ | ❌ | ✅ (own tasks) |
| View Time Entries (All) | ✅ | ✅ (own projects) | ✅ (own entries) |
| Edit/Correct Time Entry | ✅ | ✅ (own projects) | ❌ |
| **File Management** | | | |
| Upload Files to Task | ✅ | ✅ | ✅ (own tasks) |
| Upload Files to Project | ✅ | ✅ (own projects) | ❌ |
| View/Download Files | ✅ | ✅ (own projects) | ✅ (own project files) |
| **Reports & Dashboard** | | | |
| View Global Dashboard | ✅ | ❌ | ❌ |
| View Project Dashboard | ✅ | ✅ (own projects) | ❌ |
| View Personal Dashboard | ✅ | ✅ | ✅ |
| Export Reports | ✅ | ✅ (own projects) | ❌ |
| **Notifications** | | | |
| Receive Task Assignment Notification | ❌ | ❌ | ✅ |
| Receive Task Completion Notification | ❌ | ✅ | ❌ |
| Receive Revision Request Notification | ❌ | ❌ | ✅ |
| Receive Project-Level Notifications | ✅ | ✅ | ❌ |

---

## 4. DATABASE SCHEMA DESIGN

### 4.1 Entity Relationship Overview

```
USERS ──────────────────────────────────┐
  │                                      │
  │ (manager_id)              (created_by)│
  ▼                                      │
PROJECTS ◄──────────────────────────────┘
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
TIME_ENTRIES
  │
  │ (task_id / iteration_id)
  ▼
FILE_ATTACHMENTS
  │
NOTIFICATIONS
```

### 4.2 Table Definitions

#### Table: `users`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INT | PK, Auto-increment | Unique user ID |
| full_name | VARCHAR(100) | NOT NULL | User's full name |
| email | VARCHAR(150) | UNIQUE, NOT NULL | Email / login identifier |
| password_hash | VARCHAR(255) | NOT NULL | Hashed password |
| role | ENUM | 'admin','manager','member' | User role |
| is_active | BOOLEAN | DEFAULT TRUE | Active/deactivated status |
| avatar_url | VARCHAR(255) | NULLABLE | Profile picture path |
| created_at | DATETIME | DEFAULT NOW | Account creation timestamp |
| updated_at | DATETIME | ON UPDATE NOW | Last update timestamp |

#### Table: `projects`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INT | PK, Auto-increment | Unique project ID |
| project_name | VARCHAR(200) | NOT NULL | Name of the project |
| project_code | VARCHAR(50) | UNIQUE, NOT NULL | Short code (e.g., PRJ-001) |
| client_name | VARCHAR(150) | NULLABLE | Client company/person name |
| description | TEXT | NULLABLE | Detailed project description |
| manager_id | INT | FK → users.id | Assigned project manager |
| status | ENUM | 'not_started','in_progress','on_hold','completed','archived' | Current project status |
| priority | ENUM | 'low','medium','high','critical' | Project priority |
| start_date | DATE | NULLABLE | Planned start date |
| due_date | DATE | NULLABLE | Expected completion date |
| actual_end_date | DATE | NULLABLE | Actual completion date |
| created_by | INT | FK → users.id | User who created the project |
| created_at | DATETIME | DEFAULT NOW | Creation timestamp |
| updated_at | DATETIME | ON UPDATE NOW | Last update timestamp |

#### Table: `tasks`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INT | PK, Auto-increment | Unique task ID |
| project_id | INT | FK → projects.id | Parent project |
| task_title | VARCHAR(200) | NOT NULL | Name/title of the task |
| task_description | TEXT | NULLABLE | Detailed description |
| assigned_to | INT | FK → users.id | Member assigned to this task |
| assigned_by | INT | FK → users.id | Manager who assigned this task |
| status | ENUM | 'pending','in_progress','submitted','under_review','revision_requested','completed','cancelled' | Current task status |
| priority | ENUM | 'low','medium','high','critical' | Task priority |
| current_iteration | INT | DEFAULT 1 | Current iteration/revision number |
| estimated_hours | DECIMAL(8,2) | NULLABLE | Estimated hours to complete |
| total_time_spent | DECIMAL(10,2) | DEFAULT 0 | Cumulative time spent (all iterations) |
| due_date | DATE | NULLABLE | Task deadline |
| created_at | DATETIME | DEFAULT NOW | Creation timestamp |
| updated_at | DATETIME | ON UPDATE NOW | Last update timestamp |

#### Table: `task_iterations` *(CRITICAL TABLE)*
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INT | PK, Auto-increment | Unique iteration ID |
| task_id | INT | FK → tasks.id | Parent task |
| iteration_number | INT | NOT NULL | 1 = first attempt, 2+ = revisions |
| iteration_type | ENUM | 'initial','revision' | Whether this is first work or a revision |
| revision_reason | TEXT | NULLABLE | Why revision was requested (client feedback, etc.) |
| started_at | DATETIME | NULLABLE | When work began on this iteration |
| submitted_at | DATETIME | NULLABLE | When member submitted this iteration |
| reviewed_at | DATETIME | NULLABLE | When manager reviewed this iteration |
| review_status | ENUM | 'pending','approved','revision_requested' | Manager's review decision |
| review_remarks | TEXT | NULLABLE | Manager's review comments |
| member_remarks | TEXT | NULLABLE | Member's completion remarks |
| total_time_spent | DECIMAL(10,2) | DEFAULT 0 | Time spent in this iteration only |
| assigned_to | INT | FK → users.id | Member who worked on this iteration |
| created_at | DATETIME | DEFAULT NOW | Iteration creation timestamp |

#### Table: `time_entries`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INT | PK, Auto-increment | Unique time entry ID |
| task_id | INT | FK → tasks.id | Parent task |
| iteration_id | INT | FK → task_iterations.id | Parent iteration |
| user_id | INT | FK → users.id | Member who logged this time |
| start_time | DATETIME | NOT NULL | Auto-recorded when member clicks "Start" |
| end_time | DATETIME | NULLABLE | Recorded when member clicks "Stop" |
| duration_minutes | DECIMAL(10,2) | NULLABLE | Calculated: end_time - start_time |
| remarks | TEXT | NULLABLE | Notes/remarks entered on stop |
| is_active | BOOLEAN | DEFAULT FALSE | Whether this timer is currently running |
| created_at | DATETIME | DEFAULT NOW | Entry creation timestamp |

#### Table: `file_attachments`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INT | PK, Auto-increment | Unique file ID |
| project_id | INT | FK → projects.id | Parent project |
| task_id | INT | FK → tasks.id, NULLABLE | Parent task (NULL = project-level file) |
| iteration_id | INT | FK → task_iterations.id, NULLABLE | Specific iteration (NULL = general) |
| uploaded_by | INT | FK → users.id | User who uploaded the file |
| file_name | VARCHAR(255) | NOT NULL | Original file name |
| file_path | VARCHAR(500) | NOT NULL | Server storage path |
| file_size | BIGINT | NULLABLE | File size in bytes |
| file_type | VARCHAR(50) | NULLABLE | MIME type / extension |
| upload_type | ENUM | 'client_input','deliverable','reference','revision_input' | Category of the file |
| description | VARCHAR(500) | NULLABLE | Brief description of the file |
| version | INT | DEFAULT 1 | File version number |
| created_at | DATETIME | DEFAULT NOW | Upload timestamp |

#### Table: `notifications`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INT | PK, Auto-increment | Unique notification ID |
| user_id | INT | FK → users.id | Recipient |
| type | ENUM | 'task_assigned','task_submitted','revision_requested','task_completed','project_created','file_uploaded' | Notification type |
| title | VARCHAR(200) | NOT NULL | Notification heading |
| message | TEXT | NOT NULL | Notification body |
| reference_type | ENUM | 'project','task','iteration','file' | What entity this refers to |
| reference_id | INT | NOT NULL | ID of the referenced entity |
| is_read | BOOLEAN | DEFAULT FALSE | Read/unread status |
| created_at | DATETIME | DEFAULT NOW | Notification timestamp |

#### Table: `activity_log`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INT | PK, Auto-increment | Unique log ID |
| user_id | INT | FK → users.id | User who performed the action |
| action | VARCHAR(100) | NOT NULL | Action performed |
| entity_type | VARCHAR(50) | NOT NULL | 'project','task','iteration','file' |
| entity_id | INT | NOT NULL | ID of the affected entity |
| details | TEXT | NULLABLE | JSON or text description of changes |
| ip_address | VARCHAR(45) | NULLABLE | User's IP address |
| created_at | DATETIME | DEFAULT NOW | Action timestamp |

---

## 5. COMPLETE PROCESS FLOWS

### 5.1 Project Lifecycle Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     PROJECT LIFECYCLE                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────┐    ┌───────────────┐    ┌──────────────────┐     │
│  │ Company  │───▶│ Admin/Manager │───▶│ CREATE PROJECT   │     │
│  │ receives │    │ logs into     │    │ - Name, Client   │     │
│  │ project  │    │ WTMS          │    │ - Description    │     │
│  └──────────┘    └───────────────┘    │ - Due Date       │     │
│                                       │ - Priority       │     │
│                                       │ - Attachments    │     │
│                                       │ - Assign Manager │     │
│                                       └────────┬─────────┘     │
│                                                │               │
│                                                ▼               │
│                                       ┌──────────────────┐     │
│                                       │ Status:          │     │
│                                       │ NOT_STARTED      │     │
│                                       └────────┬─────────┘     │
│                                                │               │
│                          Manager starts        │               │
│                          creating tasks        ▼               │
│                                       ┌──────────────────┐     │
│                                       │ Status:          │     │
│                                       │ IN_PROGRESS      │     │
│                                       └────────┬─────────┘     │
│                                                │               │
│                          All tasks             │               │
│                          completed             ▼               │
│                                       ┌──────────────────┐     │
│                                       │ Status:          │     │
│                                       │ COMPLETED        │     │
│                                       └──────────────────┘     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Task Lifecycle Flow (WITH ITERATION TRACKING — CRITICAL)

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    TASK LIFECYCLE WITH ITERATIONS                        │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  MANAGER                          MEMBER                                │
│  ───────                          ──────                                │
│                                                                          │
│  ┌─────────────────┐                                                    │
│  │ CREATE TASK      │                                                    │
│  │ - Title, Desc    │                                                    │
│  │ - Assign Member  │                                                    │
│  │ - Priority, Due  │                                                    │
│  └────────┬────────┘                                                    │
│           │                                                              │
│           │  System auto-creates                                        │
│           │  Iteration #1 (type: 'initial')                             │
│           │  Sends notification to member                               │
│           ▼                                                              │
│  Task Status: PENDING          ┌──────────────────────┐                 │
│                          ┌────▶│ Member sees task on  │                 │
│                          │     │ dashboard with       │                 │
│                          │     │ notification badge   │                 │
│                          │     └──────────┬───────────┘                 │
│                          │                │                              │
│                          │                │  Member clicks              │
│                          │                │  "START TASK"               │
│                          │                ▼                              │
│  Task Status: IN_PROGRESS│     ┌──────────────────────┐                 │
│                          │     │ ⏱ TIMER STARTS       │                 │
│                          │     │ start_time = NOW()   │                 │
│                          │     │ Time Entry created   │                 │
│                          │     │ is_active = TRUE     │                 │
│                          │     └──────────┬───────────┘                 │
│                          │                │                              │
│                          │                │  Member can PAUSE           │
│                          │                │  (stop_time recorded,       │
│                          │                │   new entry on resume)      │
│                          │                │                              │
│                          │                │  Member clicks              │
│                          │                │  "SUBMIT TASK"              │
│                          │                ▼                              │
│                          │     ┌──────────────────────┐                 │
│                          │     │ ⏱ TIMER STOPS        │                 │
│                          │     │ end_time = NOW()     │                 │
│                          │     │ Enter REMARKS        │                 │
│                          │     │ Upload FILES (opt)   │                 │
│                          │     └──────────┬───────────┘                 │
│                          │                │                              │
│  Task Status: SUBMITTED  │                │  Notification              │
│                          │                │  sent to Manager            │
│                          │                ▼                              │
│  ┌─────────────────────┐ │                                              │
│  │ MANAGER REVIEWS     │ │                                              │
│  │ - Sees submission   │ │                                              │
│  │ - Checks files      │ │                                              │
│  │ - Reads remarks     │ │                                              │
│  └────────┬────────────┘ │                                              │
│           │              │                                              │
│     ┌─────┴──────┐       │                                              │
│     │            │       │                                              │
│     ▼            ▼       │                                              │
│  APPROVE     REVISION    │                                              │
│     │        REQUESTED   │                                              │
│     │            │       │                                              │
│     │            │  System auto-creates                                 │
│     │            │  Iteration #2 (type: 'revision')                     │
│     │            │  revision_reason recorded                            │
│     │            │  Notification sent to member                         │
│     │            │       │                                              │
│     │            └───────┘◄─── Member repeats                           │
│     │                          START → WORK → SUBMIT                    │
│     │                          cycle for Iteration #2                   │
│     │                                                                    │
│     │            (This loop can repeat N times)                         │
│     │            Each time = new iteration record                       │
│     │            Each time = new time entries                           │
│     │            All time entries preserved                             │
│     │                                                                    │
│     ▼                                                                    │
│  ┌─────────────────────────────────────────┐                            │
│  │ Task Status: COMPLETED                  │                            │
│  │ actual_end_date = NOW()                 │                            │
│  │ total_time_spent = SUM of ALL           │                            │
│  │   time entries across ALL iterations    │                            │
│  │ Notification sent to member             │                            │
│  └─────────────────────────────────────────┘                            │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### 5.3 Time Tracking Detail Flow

```
┌────────────────────────────────────────────────────────────┐
│              TIME TRACKING MECHANISM                       │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  MEMBER DASHBOARD                                          │
│  ┌──────────────────────────────────────────────┐         │
│  │  My Tasks                                     │         │
│  │  ┌──────────────────────────────────────────┐ │         │
│  │  │ 📋 Task: Design Homepage Mockup          │ │         │
│  │  │    Project: Website Redesign              │ │         │
│  │  │    Iteration: #2 (Revision)               │ │         │
│  │  │    Status: In Progress                    │ │         │
│  │  │    ⏱ 02:34:15  [▶ START] [⏹ STOP]       │ │         │
│  │  └──────────────────────────────────────────┘ │         │
│  │  ┌──────────────────────────────────────────┐ │         │
│  │  │ 📋 Task: Create Login API                │ │         │
│  │  │    Project: Mobile App                    │ │         │
│  │  │    Iteration: #1 (Initial)                │ │         │
│  │  │    Status: Pending                        │ │         │
│  │  │    ⏱ 00:00:00  [▶ START]                 │ │         │
│  │  └──────────────────────────────────────────┘ │         │
│  └──────────────────────────────────────────────┘         │
│                                                            │
│  RULES:                                                    │
│  1. Only ONE task timer can be active at a time            │
│  2. Starting a new task auto-pauses any running task       │
│  3. Each START creates a new time_entry record             │
│  4. Each STOP closes the time_entry (end_time + duration)  │
│  5. Multiple start/stop cycles within one iteration        │
│     = multiple time_entry records                          │
│  6. A "SUBMIT" automatically stops the running timer       │
│                                                            │
│  TIME CALCULATION:                                         │
│  ┌──────────────────────────────────────────────┐         │
│  │ Iteration #1 Time = SUM(time_entries where   │         │
│  │                      iteration_id = iter_1)  │         │
│  │ Iteration #2 Time = SUM(time_entries where   │         │
│  │                      iteration_id = iter_2)  │         │
│  │ ...                                           │         │
│  │ TOTAL TASK TIME = SUM of ALL iterations       │         │
│  │ TOTAL PROJECT TIME = SUM of ALL tasks         │         │
│  └──────────────────────────────────────────────┘         │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### 5.4 File Management Flow

```
┌────────────────────────────────────────────────────────────────┐
│                    FILE STORAGE STRUCTURE                       │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  /uploads                                                      │
│  └── /projects                                                 │
│      └── /PRJ-001_Website_Redesign                            │
│          ├── /client_inputs                                    │
│          │   ├── initial_requirements.pdf                      │
│          │   ├── brand_guidelines.pdf                          │
│          │   └── revision_feedback_v2.docx                    │
│          ├── /tasks                                            │
│          │   ├── /TASK-001_Design_Homepage                    │
│          │   │   ├── /iteration_1                             │
│          │   │   │   ├── homepage_mockup_v1.psd              │
│          │   │   │   └── homepage_preview_v1.png             │
│          │   │   └── /iteration_2                             │
│          │   │       ├── homepage_mockup_v2.psd              │
│          │   │       └── homepage_preview_v2.png             │
│          │   └── /TASK-002_Create_Login_Page                  │
│          │       └── /iteration_1                             │
│          │           └── login_page_final.html                │
│          └── /deliverables                                    │
│              └── final_website_package.zip                    │
│                                                                │
│  FILE UPLOAD RULES:                                            │
│  1. Client input files → uploaded by Admin/Manager             │
│  2. Task deliverable files → uploaded by Member on submit      │
│  3. Revision input files → uploaded by Manager with revision   │
│  4. All files tagged with upload_type for filtering            │
│  5. Version tracking: same filename = auto-increment version   │
│  6. Everyone on the project can VIEW/DOWNLOAD files            │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## 6. DETAILED FEATURE SPECIFICATIONS

### 6.1 Authentication & User Management

#### F-AUTH-01: Login Page
- **Description**: Simple login page with email and password
- **Fields**: Email, Password, "Remember Me" checkbox
- **Behavior**: On successful login, redirect to role-based dashboard
- **Security**: Password hashing, session management
- **Note**: No public registration — Admin creates all accounts

#### F-AUTH-02: User Management (Admin Only)
- **Fields for User Creation**:
  - Full Name (required)
  - Email (required, unique)
  - Password (required, min 6 characters)
  - Role (dropdown: Admin, Manager, Member)
  - Status (Active/Inactive)
- **Features**:
  - List all users with search and filter by role
  - Edit user details
  - Deactivate user (soft delete — never hard delete)
  - Reset password

---

### 6.2 Project Management

#### F-PRJ-01: Create Project
- **Accessible by**: Admin, Manager
- **Form Fields**:

| Field | Type | Required | Notes |
|---|---|---|---|
| Project Name | Text | Yes | Max 200 chars |
| Project Code | Text | Yes | Auto-generated (PRJ-XXX) with option to override |
| Client Name | Text | No | Client company or person |
| Description | Rich Text | No | Detailed project requirements |
| Assigned Manager | Dropdown | Yes | List of users with Manager role |
| Priority | Dropdown | Yes | Low, Medium, High, Critical |
| Start Date | Date Picker | No | |
| Due Date | Date Picker | No | |
| Client Attachments | File Upload | No | Multiple files, any type |

- **On Submit**:
  - Project created with status "Not Started"
  - Notification sent to assigned Manager
  - Files stored in `/uploads/projects/{project_code}/client_inputs/`
  - Activity log entry created

#### F-PRJ-02: Project List View
- **Admin view**: All projects with filters (status, manager, priority, date range)
- **Manager view**: Only assigned projects
- **Columns**: Project Code, Name, Client, Manager, Status, Priority, Progress %, Due Date, Actions
- **Progress Calculation**: `(completed tasks / total tasks) × 100`

#### F-PRJ-03: Project Detail View
- **Sections**:
  1. **Overview**: All project info, status, dates
  2. **Tasks**: List of all tasks with status indicators
  3. **Time Summary**: Total time spent on project (sum of all tasks)
  4. **Files**: All project-level and task-level files
  5. **Activity Timeline**: Chronological log of all actions
  6. **Team**: List of all members working on this project

---

### 6.3 Task Management

#### F-TASK-01: Create Task
- **Accessible by**: Manager (for own projects), Admin
- **Form Fields**:

| Field | Type | Required | Notes |
|---|---|---|---|
| Task Title | Text | Yes | Max 200 chars |
| Task Description | Rich Text | No | Detailed task instructions |
| Project | Dropdown | Yes | Auto-filled if creating from project page |
| Assigned To | Dropdown | Yes | List of active Members |
| Priority | Dropdown | Yes | Low, Medium, High, Critical |
| Estimated Hours | Number | No | Manager's estimate |
| Due Date | Date Picker | No | |

- **On Submit**:
  - Task created with status "Pending"
  - Iteration #1 automatically created (type: 'initial')
  - Notification sent to assigned Member
  - Activity log entry created

#### F-TASK-02: Task Status Workflow

```
PENDING → IN_PROGRESS → SUBMITTED → UNDER_REVIEW → COMPLETED
                                          │
                                          ▼
                                   REVISION_REQUESTED
                                          │
                                          ▼
                                    IN_PROGRESS → SUBMITTED → UNDER_REVIEW → ...
```

| Status | Set By | Trigger |
|---|---|---|
| Pending | System | Task created, awaiting member action |
| In Progress | System | Member clicks "Start Task" |
| Submitted | System | Member clicks "Submit Task" |
| Under Review | System | Auto after submission (Manager views) |
| Revision Requested | Manager | Manager sends back for changes |
| Completed | Manager | Manager approves final submission |
| Cancelled | Manager/Admin | Task no longer needed |

#### F-TASK-03: Task Detail View
- **Header**: Task title, project name, status badge, priority badge, iteration indicator
- **Sections**:
  1. **Description**: Full task description
  2. **Iteration History**: *(CRITICAL SECTION)*
     ```
     ┌─────────────────────────────────────────────────┐
     │  ITERATION HISTORY                               │
     │  ┌─────────────────────────────────────────────┐ │
     │  │ Iteration #1 (Initial)                       │ │
     │  │ Started: 2025-01-15 09:00                    │ │
     │  │ Submitted: 2025-01-15 14:30                  │ │
     │  │ Time Spent: 5h 30m                           │ │
     │  │ Member Remarks: "Completed as per specs"     │ │
     │  │ Review: ❌ Revision Requested                │ │
     │  │ Manager Remarks: "Client wants blue theme"   │ │
     │  │ Files: mockup_v1.psd                         │ │
     │  └─────────────────────────────────────────────┘ │
     │  ┌─────────────────────────────────────────────┐ │
     │  │ Iteration #2 (Revision)                      │ │
     │  │ Reason: Client wants blue theme              │ │
     │  │ Started: 2025-01-16 10:00                    │ │
     │  │ Submitted: 2025-01-16 12:00                  │ │
     │  │ Time Spent: 2h 00m                           │ │
     │  │ Member Remarks: "Updated to blue theme"      │ │
     │  │ Review: ✅ Approved                           │ │
     │  │ Files: mockup_v2.psd                         │ │
     │  └─────────────────────────────────────────────┘ │
     │                                                   │
     │  TOTAL TIME: 7h 30m across 2 iterations          │
     │  First Attempt: 5h 30m | Revisions: 2h 00m      │
     └─────────────────────────────────────────────────┘
     ```
  3. **Time Entries**: Granular start/stop logs
  4. **Files**: All files across iterations
  5. **Activity Log**: Task-specific timeline

---

### 6.4 Time Tracking

#### F-TIME-01: Start Timer
- **Trigger**: Member clicks "Start" button on a task card
- **Behavior**:
  1. Check if any other timer is running → if yes, auto-pause it (create end_time for that entry)
  2. Create new `time_entry` record:
     - `start_time` = current server timestamp
     - `is_active` = TRUE
  3. Update task status to "In Progress" (if it was "Pending" or "Revision Requested")
  4. Update iteration `started_at` if this is the first start for this iteration
  5. Show running timer on the task card (real-time counter)

#### F-TIME-02: Stop/Pause Timer
- **Trigger**: Member clicks "Pause" button
- **Behavior**:
  1. Update current `time_entry`:
     - `end_time` = current server timestamp
     - `duration_minutes` = calculated difference
     - `is_active` = FALSE
  2. Timer display freezes at last recorded value
  3. Member can resume later (creates new time_entry for same iteration)

#### F-TIME-03: Submit Task (Stop + Submit)
- **Trigger**: Member clicks "Submit Task" button
- **Behavior**:
  1. If timer is running → auto-stop it
  2. Show submission modal:
     - Remarks (text area, required)
     - File upload (optional, multiple files)
  3. On confirmation:
     - Update iteration: `submitted_at` = NOW(), `member_remarks` = entered text
     - Update task status to "Submitted"
     - Calculate `iteration.total_time_spent` = SUM of all time_entries for this iteration
     - Update `task.total_time_spent` = SUM of all iterations
     - Files stored under `/uploads/projects/{code}/tasks/{task_id}/iteration_{n}/`
     - Send notification to Manager

#### F-TIME-04: Time Display Rules
- **On Task Card**: Show current session time (running timer) + total time for current iteration
- **On Task Detail**: Show breakdown per iteration and overall total
- **Format**: HH:MM:SS for running timer, Xh Ym format for totals

---

### 6.5 Review & Revision Process

#### F-REV-01: Manager Review
- **Trigger**: Manager clicks on a task with status "Submitted"
- **View**: Task detail page with latest iteration, member remarks, files
- **Actions**:

| Action | Button | Behavior |
|---|---|---|
| Approve | "✅ Approve & Complete" (Green) | Task status → Completed, iteration review_status → approved |
| Request Revision | "🔄 Request Revision" (Orange) | Opens revision modal |

#### F-REV-02: Request Revision
- **Modal Fields**:
  - Revision Reason (text area, required) — "What needs to change?"
  - Attach Reference Files (optional) — new client feedback, etc.
  - Re-assign to different member (optional dropdown, defaults to same member)
- **On Submit**:
  1. Current iteration: `review_status` = 'revision_requested', `review_remarks` = entered text, `reviewed_at` = NOW()
  2. New iteration created:
     - `iteration_number` = previous + 1
     - `iteration_type` = 'revision'
     - `revision_reason` = entered text
     - `assigned_to` = same or different member
  3. Task status → "Revision Requested"
  4. Task `current_iteration` incremented
  5. Notification sent to member with revision details
  6. Reference files stored under appropriate path

---

### 6.6 Dashboards

#### F-DASH-01: Admin Dashboard
```
┌────────────────────────────────────────────────────────────────┐
│  ADMIN DASHBOARD                                               │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐            │
│  │ Total   │ │ Active  │ │ Tasks   │ │ Pending │            │
│  │Projects │ │Projects │ │ Today   │ │ Reviews │            │
│  │   24    │ │   12    │ │   47    │ │    8    │            │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘            │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ PROJECT OVERVIEW TABLE                                    │ │
│  │ Project | Manager | Tasks | Progress | Time | Status     │ │
│  │ PRJ-001 | John    | 12    | ████ 75% | 48h  | Active    │ │
│  │ PRJ-002 | Sarah   |  8    | ██ 40%   | 22h  | Active    │ │
│  │ ...                                                       │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  ┌─────────────────────────┐ ┌────────────────────────────┐  │
│  │ RECENT ACTIVITY         │ │ TIME DISTRIBUTION          │  │
│  │ • John started Task-12  │ │ [Bar chart by project]     │  │
│  │ • Sarah approved Task-8 │ │                            │  │
│  │ • Mike submitted Task-15│ │                            │  │
│  └─────────────────────────┘ └────────────────────────────┘  │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ MEMBER WORKLOAD                                           │ │
│  │ Member   | Active Tasks | Today's Hours | Total Hours    │ │
│  │ Alice    |      3       |    4h 30m     |    120h        │ │
│  │ Bob      |      2       |    6h 15m     |     95h        │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

#### F-DASH-02: Manager Dashboard
```
┌────────────────────────────────────────────────────────────────┐
│  MANAGER DASHBOARD                                             │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐            │
│  │ My      │ │ Total   │ │ Pending │ │ Overdue │            │
│  │Projects │ │ Tasks   │ │ Reviews │ │ Tasks   │            │
│  │    5    │ │   32    │ │    4    │ │    2    │            │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘            │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ 🔔 NOTIFICATIONS                                         │ │
│  │ • Alice submitted "Design Homepage" - Review needed      │ │
│  │ • Bob submitted "API Integration" - Review needed        │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ MY PROJECTS                                               │ │
│  │ [Clickable cards showing project progress]                │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ TASKS REQUIRING REVIEW                                    │ │
│  │ Task | Member | Submitted | Iteration | Time | Actions   │ │
│  │ T-12 | Alice  | 2h ago    | #2        | 5h   | Review ▶ │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ TEAM ACTIVITY TODAY                                       │ │
│  │ Member | Current Task | Status | Timer                   │ │
│  │ Alice  | Design Home  | Active | ⏱ 02:15:30             │ │
│  │ Bob    | API Login    | Paused | ⏸ 01:45:00             │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

#### F-DASH-03: Member Dashboard
```
┌────────────────────────────────────────────────────────────────┐
│  MEMBER DASHBOARD                                              │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐            │
│  │ My      │ │ Active  │ │Today's  │ │ Pending │            │
│  │ Tasks   │ │ Timer   │ │ Hours   │ │ Tasks   │            │
│  │   8     │ │ ⏱ T-12 │ │  4h 30m │ │    3    │            │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘            │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ 🔔 NOTIFICATIONS                                         │ │
│  │ • New task assigned: "Create Login Page" in PRJ-002      │ │
│  │ • Revision requested: "Design Homepage" - see feedback   │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ ACTIVE TASK (Currently Running)                           │ │
│  │ ┌──────────────────────────────────────────────────────┐ │ │
│  │ │ 📋 Design Homepage Mockup | PRJ-001                  │ │ │
│  │ │ Iteration: #2 (Revision)                             │ │ │
│  │ │ Revision Reason: "Client wants blue theme instead"   │ │ │
│  │ │ ⏱ Current Session: 01:23:45                          │ │ │
│  │ │ Total This Iteration: 02:30:00                       │ │ │
│  │ │ Total All Iterations: 07:45:00                       │ │ │
│  │ │ [⏸ PAUSE]  [📤 SUBMIT TASK]                         │ │ │
│  │ └──────────────────────────────────────────────────────┘ │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ MY TASK LIST                                              │ │
│  │ Task    | Project | Status    | Iter | Time  | Actions   │ │
│  │ T-15    | PRJ-002 | Pending   | #1   | 0h    | ▶ Start  │ │
│  │ T-18    | PRJ-003 | Revision  | #3   | 12h   | ▶ Start  │ │
│  │ T-10    | PRJ-001 | Completed | #1   | 4h    | 👁 View  │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ TODAY'S TIME LOG                                          │ │
│  │ Time         | Task        | Duration                    │ │
│  │ 09:00-11:30  | Design Home | 2h 30m                     │ │
│  │ 11:45-13:00  | API Login   | 1h 15m                     │ │
│  │ 14:00-Now    | Design Home | 01:23:45 (running)         │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

### 6.7 Reporting

#### F-RPT-01: Project Time Report
- Total time per project
- Time breakdown per task
- Time per iteration (initial vs revisions)
- Percentage of time spent on revisions vs initial work
- Time per team member on the project

#### F-RPT-02: Member Time Report
- Daily/weekly/monthly time logs per member
- Tasks worked on with time details
- Idle time analysis (gaps between time entries)

#### F-RPT-03: Task Iteration Report *(CRITICAL)*
- For each task: number of iterations
- Time spent per iteration
- Revision reasons documented
- Total cost of revisions (time)
- Comparison: initial estimate vs actual total time

#### F-RPT-04: Project Progress Report
- Tasks completed vs total tasks
- On-time vs overdue tasks
- Current blockers (tasks in revision cycle)

---

### 6.8 Notifications

| Event | Notification To | Title Template |
|---|---|---|
| Project Created | Assigned Manager | "New project assigned: {project_name}" |
| Task Created/Assigned | Assigned Member | "New task assigned: {task_title} in {project_name}" |
| Task Submitted | Project Manager | "{member_name} submitted {task_title} for review" |
| Task Approved | Assigned Member | "Your task {task_title} has been approved ✅" |
| Revision Requested | Assigned Member | "Revision requested for {task_title}: {reason}" |
| File Uploaded | Project Manager + Team | "New file uploaded to {task_title}: {filename}" |
| Task Overdue | Assigned Member + Manager | "Task {task_title} is overdue!" |

- **Delivery Method**: In-app notifications (bell icon with badge count)
- **Notification Panel**: Dropdown list, mark as read, click to navigate

---

## 7. UI/UX SPECIFICATIONS

### 7.1 Design Principles
- **Clean and Minimal**: No unnecessary elements
- **Color-Coded Status**: Consistent colors for task/project statuses
- **One-Click Actions**: Start/Stop timer should be single-click
- **Responsive Tables**: Data tables with sorting, filtering, pagination
- **Dark/Light Mode**: Optional, default light

### 7.2 Color Scheme for Statuses

| Status | Color | Hex |
|---|---|---|
| Pending | Gray | #9CA3AF |
| In Progress | Blue | #3B82F6 |
| Submitted | Yellow/Amber | #F59E0B |
| Under Review | Purple | #8B5CF6 |
| Revision Requested | Orange | #F97316 |
| Completed | Green | #10B981 |
| Cancelled | Red | #EF4444 |
| Overdue | Dark Red | #DC2626 |

### 7.3 Navigation Structure

```
SIDEBAR NAVIGATION
├── 🏠 Dashboard (role-based)
├── 📁 Projects
│   ├── All Projects (Admin/Manager)
│   └── Project Detail → Tasks
├── ✅ Tasks
│   ├── All Tasks (Admin)
│   ├── My Project Tasks (Manager)
│   └── My Tasks (Member)
├── ⏱ Time Entries
│   ├── All Time Logs (Admin)
│   ├── Project Time Logs (Manager)
│   └── My Time Log (Member)
├── 📎 Files
│   └── Project File Browser
├── 📊 Reports (Admin/Manager)
│   ├── Project Report
│   ├── Member Report
│   └── Iteration Report
├── 👥 Users (Admin only)
└── ⚙️ Settings (Admin only)

TOP BAR
├── 🔔 Notifications (badge count)
├── ⏱ Active Timer Indicator (Member)
├── 👤 Profile Dropdown
│   ├── My Profile
│   └── Logout
```

---

## 8. TECHNICAL SPECIFICATIONS FOR ANTIGRAVITY IDE

### 8.1 Antigravity IDE Configuration

| Aspect | Specification |
|---|---|
| **App Type** | Web Application (Full Stack) |
| **Database** | Built-in database (SQLite or Antigravity's internal DB) |
| **Authentication** | Built-in auth module with role-based access |
| **File Storage** | Local file system on the host machine |
| **Hosting** | Local PC — app runs as a web server on a configurable port |
| **Access** | LAN access via `http://{server-ip}:{port}` |
| **Real-Time Updates** | Polling every 30 seconds for notifications and timer sync |

### 8.2 Cline Agent Implementation Steps

The following is the recommended build sequence for Cline agent prompts:

#### Phase 1: Foundation
```
Step 1: Create database tables (users, projects, tasks, 
        task_iterations, time_entries, file_attachments, 
        notifications, activity_log)
Step 2: Create authentication system (login, session, role check)
Step 3: Create user management CRUD (Admin only)
Step 4: Create navigation layout with sidebar and top bar
```

#### Phase 2: Core Features
```
Step 5: Create Project CRUD with file upload
Step 6: Create Task CRUD with assignment and status workflow
Step 7: Create Iteration system (auto-create on task creation 
        and on revision request)
Step 8: Create Time Tracking (start/stop mechanism with 
        time_entry records)
```

#### Phase 3: Workflows
```
Step 9: Create Task Submission flow (stop timer + remarks + files)
Step 10: Create Review flow (approve or request revision)
Step 11: Create Notification system
Step 12: Create File browser/manager per project
```

#### Phase 4: Dashboards & Reports
```
Step 13: Build Admin Dashboard with stats and overview
Step 14: Build Manager Dashboard with reviews and team view
Step 15: Build Member Dashboard with task list and active timer
Step 16: Build Reports pages (project, member, iteration)
```

#### Phase 5: Polish
```
Step 17: Add activity logging across all actions
Step 18: Add search and filters on all list pages
Step 19: Test all workflows end-to-end
Step 20: Configure for LAN deployment
```

### 8.3 LAN Deployment Configuration

```
Server Setup:
1. Antigravity app runs on the host PC
2. Configure to listen on 0.0.0.0 (all network interfaces)
3. Set port (e.g., 8080)
4. Access URL: http://192.168.x.x:8080
5. File uploads stored at: C:\WTMS\uploads\ (or configured path)
6. Database stored at: C:\WTMS\data\wtms.db
7. Windows Firewall: Allow inbound on port 8080
8. Optional: Create a shortcut/service to auto-start
```

---

## 9. BUSINESS RULES AND VALIDATIONS

| # | Rule |
|---|---|
| BR-01 | A project must have exactly one assigned Manager |
| BR-02 | A task must belong to exactly one project |
| BR-03 | A task can be assigned to only one Member at a time (per iteration) |
| BR-04 | Only one timer can be active per Member at any time |
| BR-05 | Starting a new task timer auto-pauses any currently running timer |
| BR-06 | A task cannot be submitted without stopping the timer |
| BR-07 | A task cannot be approved/sent for revision unless status is "Submitted" |
| BR-08 | Requesting a revision automatically creates a new iteration |
| BR-09 | Task total_time_spent is always the sum of all time entries across all iterations |
| BR-10 | Project progress % = (completed tasks / total tasks) × 100 |
| BR-11 | Completed tasks and their time entries cannot be edited (locked) |
| BR-12 | Deactivated users cannot log in but their historical data is preserved |
| BR-13 | Files cannot be deleted once uploaded (audit trail) |
| BR-14 | All timestamps use server time (to ensure consistency across LAN clients) |
| BR-15 | Member remarks are required when submitting a task |
| BR-16 | Manager revision reason is required when requesting a revision |

---

## 10. SAMPLE SEED DATA

For initial setup and testing:

### Default Admin Account
```
Email: admin@wtms.local
Password: Admin@123
Role: Admin
```

### Sample Users
```
Manager: manager1@wtms.local / Manager@123
Member 1: member1@wtms.local / Member@123
Member 2: member2@wtms.local / Member@123
```

---

## 11. FUTURE ENHANCEMENTS (Out of Scope for V1)

| # | Enhancement | Priority |
|---|---|---|
| FE-01 | Email notifications (requires SMTP) | Medium |
| FE-02 | Gantt chart view for project timeline | Low |
| FE-03 | Drag-and-drop task board (Kanban) | Medium |
| FE-04 | Client portal (external access for clients) | Low |
| FE-05 | Mobile responsive optimization | Medium |
| FE-06 | Automated daily/weekly email reports | Low |
| FE-07 | Task dependencies (Task B blocked by Task A) | Medium |
| FE-08 | Billing/invoicing based on time entries | Low |
| FE-09 | Integration with external tools (Slack, etc.) | Low |
| FE-10 | Database backup and restore utility | High |

---

## 12. ACCEPTANCE CRITERIA CHECKLIST

| # | Criteria | Status |
|---|---|---|
| AC-01 | Admin can create users with roles and manage them | ⬜ |
| AC-02 | Admin/Manager can create projects with attachments | ⬜ |
| AC-03 | Admin assigns manager to project | ⬜ |
| AC-04 | Manager can break project into tasks and assign to members | ⬜ |
| AC-05 | Member sees assigned tasks on dashboard with notification | ⬜ |
| AC-06 | Member can click Start and timer begins with auto-recorded start time | ⬜ |
| AC-07 | Member can pause and resume (multiple time entries per iteration) | ⬜ |
| AC-08 | Member can submit task with remarks and optional file upload | ⬜ |
| AC-09 | Manager receives notification of submission | ⬜ |
| AC-10 | Manager can approve task (marks as completed) | ⬜ |
| AC-11 | Manager can request revision with reason (creates new iteration) | ⬜ |
| AC-12 | System distinguishes between initial work and revision iterations | ⬜ |
| AC-13 | Total time shows sum across ALL iterations | ⬜ |
| AC-14 | Iteration history shows complete audit trail per task | ⬜ |
| AC-15 | Files stored under organized project/task/iteration folders | ⬜ |
| AC-16 | All team members can view/download project files | ⬜ |
| AC-17 | Admin can see all project progress and task details | ⬜ |
| AC-18 | System accessible via IP on LAN | ⬜ |
| AC-19 | Only one timer active per member at any time | ⬜ |
| AC-20 | Reports show time breakdown by project, task, member, and iteration | ⬜ |

---

**This PRD is ready to be used as the foundation for building the WTMS application in Antigravity IDE using Cline Agent. Each section maps directly to pages, components, database tables, and workflows that Cline can build sequentially following the Phase 1-5 implementation plan.**