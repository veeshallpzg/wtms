const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = process.env.WTMS_DATA_DIR ? path.join(process.env.WTMS_DATA_DIR, 'wtms.db') : path.join(__dirname, 'wtms.db');

let db = null;

async function initializeDatabase() {
    // Provide explicit WASM path so sql.js finds it immediately in both dev and
    // packaged Electron builds (avoids any path-resolution overhead at startup)
    const SQL = await initSqlJs({
        locateFile: file => path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', file)
    });

    // Load existing database or create new one
    let isNewDb = false;
    if (fs.existsSync(DB_PATH)) {
        const fileBuffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(fileBuffer);
        console.log('Loaded existing database');
    } else {
        db = new SQL.Database();
        isNewDb = true;
        console.log('Created new database');
    }

    // Create tables
    createTables();

    // Run migrations for existing databases
    const migrated = runMigrations();

    // Insert seed data if users table is empty
    const userCount = db.exec("SELECT COUNT(*) FROM users")[0]?.values[0][0] || 0;
    let seeded = false;
    if (userCount === 0) {
        insertSeedData();
        seeded = true;
    }

    // Only persist to disk if something actually changed (new DB, migrations ran, or seed inserted)
    if (isNewDb || migrated || seeded) {
        saveDatabase();
    }

    return db;
}

function createTables() {
    // Users table
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            full_name VARCHAR(100) NOT NULL,
            email VARCHAR(150) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            role VARCHAR(20) NOT NULL CHECK(role IN ('admin', 'manager', 'member')),
            is_active INTEGER DEFAULT 1,
            avatar_url VARCHAR(255),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Projects table
    db.run(`
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
        )
    `);

    // Tasks table
    db.run(`
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
            actual_end_date DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id),
            FOREIGN KEY (assigned_to) REFERENCES users(id),
            FOREIGN KEY (assigned_by) REFERENCES users(id)
        )
    `);

    // Task Iterations table
    db.run(`
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
        )
    `);

    // Time Entries table
    db.run(`
        CREATE TABLE IF NOT EXISTS time_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL,
            iteration_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            start_time DATETIME NOT NULL,
            end_time DATETIME,
            duration_minutes DECIMAL(10,2),
            remarks TEXT,
            is_active INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (task_id) REFERENCES tasks(id),
            FOREIGN KEY (iteration_id) REFERENCES task_iterations(id),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    // File Attachments table
    db.run(`
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
        )
    `);

    // Notifications table
    db.run(`
        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            type VARCHAR(30) CHECK(type IN ('task_assigned', 'task_submitted', 'revision_requested', 'task_completed', 'project_created', 'file_uploaded')),
            title VARCHAR(200) NOT NULL,
            message TEXT NOT NULL,
            reference_type VARCHAR(20) CHECK(reference_type IN ('project', 'task', 'iteration', 'file')),
            reference_id INTEGER NOT NULL,
            is_read INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    // Activity Log table
    db.run(`
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
        )
    `);

    // Project Members table (Many-to-Many)
    db.run(`
        CREATE TABLE IF NOT EXISTS project_members (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id),
            FOREIGN KEY (user_id) REFERENCES users(id),
            UNIQUE(project_id, user_id)
        )
    `);

    // Project Managers junction table — additional co-managers per project
    db.run(`
        CREATE TABLE IF NOT EXISTS project_managers (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            user_id    INTEGER NOT NULL,
            added_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id),
            FOREIGN KEY (user_id)    REFERENCES users(id),
            UNIQUE(project_id, user_id)
        )
    `);
    db.run("CREATE INDEX IF NOT EXISTS idx_project_managers_project ON project_managers(project_id)");
    db.run("CREATE INDEX IF NOT EXISTS idx_project_managers_user    ON project_managers(user_id)");

    // Project Sequences table — yearly counter for LU-YY-NNN-MMM project code generation
    db.run(`
        CREATE TABLE IF NOT EXISTS project_sequences (
            year    INTEGER PRIMARY KEY,
            next_seq INTEGER NOT NULL DEFAULT 1
        )
    `);

    // Indexes for hot query paths
    db.run("CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to     ON tasks(assigned_to)");
    db.run("CREATE INDEX IF NOT EXISTS idx_tasks_project_id      ON tasks(project_id)");
    db.run("CREATE INDEX IF NOT EXISTS idx_tasks_status          ON tasks(status)");
    db.run("CREATE INDEX IF NOT EXISTS idx_time_entries_user_active ON time_entries(user_id, is_active)");
    db.run("CREATE INDEX IF NOT EXISTS idx_time_entries_task_id  ON time_entries(task_id)");
    db.run("CREATE INDEX IF NOT EXISTS idx_time_entries_iter_id  ON time_entries(iteration_id)");
    db.run("CREATE INDEX IF NOT EXISTS idx_task_iter_task_num    ON task_iterations(task_id, iteration_number)");
    db.run("CREATE INDEX IF NOT EXISTS idx_notifications_user    ON notifications(user_id, is_read)");
    db.run("CREATE INDEX IF NOT EXISTS idx_activity_log_entity   ON activity_log(entity_type, entity_id)");

    console.log('Database tables created');
}

function runMigrations() {
    let changed = false;

    // Add actual_end_date to tasks table if it doesn't exist
    try {
        db.run("ALTER TABLE tasks ADD COLUMN actual_end_date DATETIME");
        console.log('Migration: Added actual_end_date column to tasks');
        changed = true;
    } catch (e) {
        // Column already exists, ignore
    }

    // Create project_sequences table if it doesn't exist (for existing databases)
    db.run(`
        CREATE TABLE IF NOT EXISTS project_sequences (
            year     INTEGER PRIMARY KEY,
            next_seq INTEGER NOT NULL DEFAULT 1
        )
    `);

    // Extend role CHECK constraint to include 'client'.
    // SQLite cannot ALTER a CHECK constraint — probe first, recreate table if needed.
    try {
        db.run("INSERT INTO users (full_name, email, password_hash, role, is_active) VALUES ('_probe','_probe@_','_','client',0)");
        db.run("DELETE FROM users WHERE email = '_probe@_'");
        // Probe succeeded — constraint already allows 'client'
    } catch (e) {
        // Constraint rejects 'client' — recreate the table with the updated constraint
        db.run(`
            CREATE TABLE users_v2 (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                full_name     VARCHAR(100) NOT NULL,
                email         VARCHAR(150) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                role          VARCHAR(20)  NOT NULL CHECK(role IN ('admin','manager','member','client')),
                is_active     INTEGER DEFAULT 1,
                avatar_url    VARCHAR(255),
                created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        db.run(`INSERT INTO users_v2 SELECT * FROM users`);
        db.run(`DROP TABLE users`);
        db.run(`ALTER TABLE users_v2 RENAME TO users`);
        console.log('Migration: role CHECK constraint updated to include client');
        changed = true;
    }

    // ── Extend projects.status CHECK to include 'client_review' ──────────────
    try {
        db.run("INSERT INTO projects (project_name,project_code,manager_id,status,priority,created_by) VALUES('_p','_probe_cr',1,'client_review','medium',1)");
        db.run("DELETE FROM projects WHERE project_code='_probe_cr'");
        // Probe succeeded — constraint already allows 'client_review'
    } catch (e) {
        db.run(`
            CREATE TABLE projects_v2 (
                id             INTEGER PRIMARY KEY AUTOINCREMENT,
                project_name   VARCHAR(200) NOT NULL,
                project_code   VARCHAR(50)  UNIQUE NOT NULL,
                client_name    VARCHAR(150),
                description    TEXT,
                manager_id     INTEGER NOT NULL,
                status         VARCHAR(20) DEFAULT 'not_started'
                               CHECK(status IN ('not_started','in_progress','on_hold','completed','archived','client_review')),
                priority       VARCHAR(20) DEFAULT 'medium'
                               CHECK(priority IN ('low','medium','high','critical')),
                start_date     DATE,
                due_date       DATE,
                actual_end_date DATE,
                created_by     INTEGER NOT NULL,
                created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (manager_id)  REFERENCES users(id),
                FOREIGN KEY (created_by)  REFERENCES users(id)
            )
        `);
        db.run(`INSERT INTO projects_v2 SELECT * FROM projects`);
        db.run(`DROP TABLE projects`);
        db.run(`ALTER TABLE projects_v2 RENAME TO projects`);
        console.log('Migration: projects.status CHECK updated to include client_review');
        changed = true;
    }

    // ── Create project_reviews table ─────────────────────────────────────────
    db.run(`
        CREATE TABLE IF NOT EXISTS project_reviews (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id     INTEGER NOT NULL,
            submitted_at   DATETIME NOT NULL,
            responded_at   DATETIME,
            response_type  VARCHAR(30) CHECK(response_type IN ('approved','revision_requested')),
            response_notes TEXT,
            review_minutes DECIMAL(10,2),
            submitted_by   INTEGER NOT NULL,
            FOREIGN KEY (project_id)  REFERENCES projects(id),
            FOREIGN KEY (submitted_by) REFERENCES users(id)
        )
    `);

    // ── Add task_category column to tasks ─────────────────────────────────────
    try {
        db.run("ALTER TABLE tasks ADD COLUMN task_category VARCHAR(30) DEFAULT 'project_requirement'");
        console.log('Migration: Added task_category column to tasks');
        changed = true;
    } catch (e) {
        // Column already exists, ignore
    }

    // ── Extend tasks.status CHECK to include 'paused' ─────────────────────────
    try {
        db.run("INSERT INTO tasks (project_id,task_title,assigned_to,assigned_by,status) VALUES(1,'_probe_paused',1,1,'paused')");
        db.run("DELETE FROM tasks WHERE task_title='_probe_paused'");
        // Probe succeeded — constraint already allows 'paused'
    } catch (e) {
        db.run(`
            CREATE TABLE tasks_v2 (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id       INTEGER NOT NULL,
                task_title       VARCHAR(200) NOT NULL,
                task_description TEXT,
                assigned_to      INTEGER NOT NULL,
                assigned_by      INTEGER NOT NULL,
                status           VARCHAR(30) DEFAULT 'pending'
                                 CHECK(status IN ('pending','in_progress','paused','submitted','under_review','revision_requested','completed','cancelled')),
                priority         VARCHAR(20) DEFAULT 'medium'
                                 CHECK(priority IN ('low','medium','high','critical')),
                current_iteration INTEGER DEFAULT 1,
                estimated_hours  DECIMAL(8,2),
                total_time_spent DECIMAL(10,2) DEFAULT 0,
                due_date         DATE,
                actual_end_date  DATETIME,
                task_category    VARCHAR(30) DEFAULT 'project_requirement',
                created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id)  REFERENCES projects(id),
                FOREIGN KEY (assigned_to) REFERENCES users(id),
                FOREIGN KEY (assigned_by) REFERENCES users(id)
            )
        `);
        db.run(`INSERT INTO tasks_v2 SELECT id,project_id,task_title,task_description,assigned_to,assigned_by,status,priority,current_iteration,estimated_hours,total_time_spent,due_date,actual_end_date,COALESCE(task_category,'project_requirement'),created_at,updated_at FROM tasks`);
        db.run(`DROP TABLE tasks`);
        db.run(`ALTER TABLE tasks_v2 RENAME TO tasks`);
        console.log('Migration: tasks.status CHECK updated to include paused');
        changed = true;
    }

    // ── Add pause_type column to time_entries ─────────────────────────────────
    try {
        db.run("ALTER TABLE time_entries ADD COLUMN pause_type VARCHAR(30)");
        console.log('Migration: Added pause_type column to time_entries');
        changed = true;
    } catch (e) {
        // Column already exists, ignore
    }

    // ── Add extended profile columns to users ─────────────────────────────────
    const profileCols = [
        "ALTER TABLE users ADD COLUMN date_of_birth DATE",
        "ALTER TABLE users ADD COLUMN anniversary_date DATE",
        "ALTER TABLE users ADD COLUMN aadhar_number VARCHAR(20)",
        "ALTER TABLE users ADD COLUMN pan_number VARCHAR(20)",
        "ALTER TABLE users ADD COLUMN blood_group VARCHAR(10)",
        "ALTER TABLE users ADD COLUMN joining_date DATE"
    ];
    for (const sql of profileCols) {
        try { db.run(sql); changed = true; } catch(e) { /* column already exists */ }
    }

    // ── Create project_contacts table ─────────────────────────────────────────
    db.run(`
        CREATE TABLE IF NOT EXISTS project_contacts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            contact_name VARCHAR(100) NOT NULL,
            contact_phone VARCHAR(30),
            contact_email VARCHAR(150),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id)
        )
    `);
    console.log('Migration: project_contacts table ensured');

    // ── Migrate legacy @wtms.local and @zurich.wtms emails to @lucid.wtms ──────
    try {
        const legacyUsers = db.exec("SELECT id, email FROM users WHERE email LIKE '%@wtms.local' OR email LIKE '%@zurich.wtms'");
        if (legacyUsers.length && legacyUsers[0].values.length) {
            for (const [uid, oldEmail] of legacyUsers[0].values) {
                const prefix = oldEmail.split('@')[0];
                const newEmail = prefix + '@lucid.wtms';
                db.run("UPDATE users SET email = ? WHERE id = ?", [newEmail, uid]);
            }
            console.log('Migration: legacy emails updated to @lucid.wtms');
            changed = true;
        }
    } catch (e) { console.error('Email migration error:', e.message); }

    // ── Create project_managers table if it doesn't exist ─────────────────────
    db.run(`
        CREATE TABLE IF NOT EXISTS project_managers (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            user_id    INTEGER NOT NULL,
            added_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id),
            FOREIGN KEY (user_id)    REFERENCES users(id),
            UNIQUE(project_id, user_id)
        )
    `);
    db.run("CREATE INDEX IF NOT EXISTS idx_project_managers_project ON project_managers(project_id)");
    db.run("CREATE INDEX IF NOT EXISTS idx_project_managers_user    ON project_managers(user_id)");

    console.log('Migrations complete');
    return changed;
}

function insertSeedData() {
    const passwordHash = bcrypt.hashSync('password123', 10);

    // ========== USERS ==========
    // Admin only - all other users to be created manually
    db.run("INSERT INTO users (full_name, email, password_hash, role, is_active) VALUES (?, ?, ?, ?, ?)",
        ['System Admin', 'admin@lucid.wtms', passwordHash, 'admin', 1]);

    console.log('Database initialized with admin user only.');
    console.log('Login: admin@lucid.wtms / password123');
}

// Immediate, synchronous save — use at shutdown or after critical batch operations.
function saveDatabase() {
    if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; }
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
}

// Debounced save — coalesces rapid writes into a single disk flush after 800 ms of
// inactivity.  Keeps reads/writes in-memory fast while still persisting promptly.
let _saveTimer = null;
function scheduleSave() {
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => {
        _saveTimer = null;
        try {
            const data = db.export();
            fs.writeFileSync(DB_PATH, Buffer.from(data));
        } catch (e) {
            console.error('[DB] scheduleSave error:', e.message);
        }
    }, 800);
}

function getDatabase() {
    return db;
}

module.exports = {
    initializeDatabase,
    getDatabase,
    saveDatabase,
    scheduleSave
};
