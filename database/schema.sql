-- Work Time Management System (WTMS) Database Schema
-- SQLite Database

-- ============================================
-- USERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK(role IN ('admin', 'manager', 'member')),
    is_active BOOLEAN DEFAULT 1,
    avatar_url VARCHAR(255),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- PROJECTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_name VARCHAR(200) NOT NULL,
    project_code VARCHAR(50) UNIQUE NOT NULL,
    client_name VARCHAR(150),
    description TEXT,
    manager_id INTEGER NOT NULL,
    status VARCHAR(20) DEFAULT 'not_started' CHECK(status IN ('not_started', 'in_progress', 'on_hold', 'completed', 'archived')),
    priority VARCHAR(20) DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high', 'critical')),
    start_date DATE,
    due_date DATE,
    actual_end_date DATE,
    created_by INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (manager_id) REFERENCES users(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- ============================================
-- TASKS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    task_title VARCHAR(200) NOT NULL,
    task_description TEXT,
    assigned_to INTEGER NOT NULL,
    assigned_by INTEGER NOT NULL,
    status VARCHAR(30) DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'submitted', 'under_review', 'revision_requested', 'completed', 'cancelled')),
    priority VARCHAR(20) DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high', 'critical')),
    current_iteration INTEGER DEFAULT 1,
    estimated_hours DECIMAL(8,2),
    total_time_spent DECIMAL(10,2) DEFAULT 0,
    due_date DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id),
    FOREIGN KEY (assigned_to) REFERENCES users(id),
    FOREIGN KEY (assigned_by) REFERENCES users(id)
);

-- ============================================
-- TASK_ITERATIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS task_iterations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    iteration_number INTEGER NOT NULL,
    iteration_type VARCHAR(20) DEFAULT 'initial' CHECK(iteration_type IN ('initial', 'revision')),
    revision_reason TEXT,
    started_at DATETIME,
    submitted_at DATETIME,
    reviewed_at DATETIME,
    review_status VARCHAR(30) DEFAULT 'pending' CHECK(review_status IN ('pending', 'approved', 'revision_requested')),
    review_remarks TEXT,
    member_remarks TEXT,
    total_time_spent DECIMAL(10,2) DEFAULT 0,
    assigned_to INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks(id),
    FOREIGN KEY (assigned_to) REFERENCES users(id)
);

-- ============================================
-- TIME_ENTRIES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS time_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    iteration_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    start_time DATETIME NOT NULL,
    end_time DATETIME,
    duration_minutes DECIMAL(10,2),
    remarks TEXT,
    is_active BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks(id),
    FOREIGN KEY (iteration_id) REFERENCES task_iterations(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ============================================
-- FILE_ATTACHMENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS file_attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    task_id INTEGER,
    iteration_id INTEGER,
    uploaded_by INTEGER NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size BIGINT,
    file_type VARCHAR(50),
    upload_type VARCHAR(30) CHECK(upload_type IN ('client_input', 'deliverable', 'reference', 'revision_input')),
    description VARCHAR(500),
    version INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id),
    FOREIGN KEY (task_id) REFERENCES tasks(id),
    FOREIGN KEY (iteration_id) REFERENCES task_iterations(id),
    FOREIGN KEY (uploaded_by) REFERENCES users(id)
);

-- ============================================
-- NOTIFICATIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type VARCHAR(30) CHECK(type IN ('task_assigned', 'task_submitted', 'revision_requested', 'task_completed', 'project_created', 'file_uploaded')),
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    reference_type VARCHAR(20) CHECK(reference_type IN ('project', 'task', 'iteration', 'file')),
    reference_id INTEGER NOT NULL,
    is_read BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ============================================
-- ACTIVITY_LOG TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id INTEGER NOT NULL,
    details TEXT,
    ip_address VARCHAR(45),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ============================================
-- PROJECT_MEMBERS TABLE (Many-to-Many)
-- ============================================
CREATE TABLE IF NOT EXISTS project_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(project_id, user_id)
);

-- ============================================
-- DEFAULT SEED DATA
-- ============================================

-- Default Admin Account
INSERT INTO users (full_name, email, password_hash, role, is_active) 
VALUES ('System Admin', 'admin@wtms.local', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYIq.z7NQee', 'admin', 1);

-- Sample Manager
INSERT INTO users (full_name, email, password_hash, role, is_active) 
VALUES ('John Manager', 'manager1@wtms.local', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYIq.z7NQee', 'manager', 1);

-- Sample Members
INSERT INTO users (full_name, email, password_hash, role, is_active) 
VALUES ('Alice Member', 'member1@wtms.local', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYIq.z7NQee', 'member', 1);

INSERT INTO users (full_name, email, password_hash, role, is_active) 
VALUES ('Bob Member', 'member2@wtms.local', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYIq.z7NQee', 'member', 1);

-- Note: Password hash above is for 'password123' (for testing)
-- Default login credentials:
-- Admin: admin@wtms.local / password123
-- Manager: manager1@wtms.local / password123  
-- Member: member1@wtms.local / password123
-- Member: member2@wtms.local / password123
