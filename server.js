process.env.TZ = 'Asia/Kolkata'; // IST — must be before any Date usage

const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const multer = require('multer');

const { initializeDatabase, getDatabase, saveDatabase, scheduleSave } = require('./database/init');

const app = express();
const PORT = process.env.PORT || 8080;

// ── Fixed email domain — all user emails must end with this ───────────────────
const EMAIL_DOMAIN = '@lucid.wtms';
// Accepts a prefix like "john" or a full email like "john@anything" — always
// returns "john@lucid.wtms"
function normalizeEmail(input) {
    const prefix = ((input || '').trim().split('@')[0]).toLowerCase();
    return prefix + EMAIL_DOMAIN;
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session configuration
app.use(session({
    secret: 'lucid-wtms-secret-2026',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Ensure uploads directory exists
const uploadsDir = process.env.WTMS_DATA_DIR ? path.join(process.env.WTMS_DATA_DIR, 'uploads') : path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer — memory storage so we decide the final path per-route
const upload = multer({ storage: multer.memoryStorage() });

// Serve uploaded files (profile photos, project files, etc.)
app.use('/uploads', express.static(uploadsDir));

// Write (or overwrite) project_info.txt inside the project's upload folder
function saveProjectInfoFile(project, contacts = [], managerName = '', createdByName = '') {
    try {
        const safeCode = String(project.project_code).replace(/[^a-zA-Z0-9\-_]/g, '_');
        const projectDir = path.join(uploadsDir, safeCode);
        if (!fs.existsSync(projectDir)) {
            fs.mkdirSync(projectDir, { recursive: true });
        }

        const line  = '─'.repeat(60);
        const pad   = (label, value) => `  ${(label + ':').padEnd(20)}${value || '—'}`;
        const now   = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });

        let txt = [
            line,
            `  PROJECT INFORMATION`,
            line,
            pad('Project Name',   project.project_name),
            pad('Project Code',   project.project_code),
            pad('Client',         project.client_name),
            pad('Manager',        managerName),
            pad('Status',         project.status ? project.status.replace(/_/g,' ').toUpperCase() : ''),
            pad('Priority',       project.priority ? project.priority.toUpperCase() : ''),
            pad('Start Date',     project.start_date),
            pad('Due Date',       project.due_date),
            '',
            `  DESCRIPTION`,
            line,
            project.description ? ('  ' + project.description.replace(/\n/g, '\n  ')) : '  —',
            '',
        ].join('\n');

        if (contacts && contacts.length > 0) {
            txt += `\n  CONTACT PERSONS\n${line}\n`;
            contacts.forEach((c, i) => {
                txt += `  Contact ${i + 1}\n`;
                txt += pad('  Name',   c.contact_name || c.name);
                txt += '\n';
                txt += pad('  Phone',  c.contact_phone || c.phone);
                txt += '\n';
                txt += pad('  Email',  c.contact_email || c.email);
                txt += '\n';
                if (i < contacts.length - 1) txt += '\n';
            });
        }

        txt += `\n${line}\n`;
        txt += pad('Created By',  createdByName);
        txt += '\n';
        txt += pad('Last Updated', now);
        txt += `\n${line}\n`;

        fs.writeFileSync(path.join(projectDir, 'project_info.txt'), txt, 'utf8');
    } catch (e) {
        console.error('saveProjectInfoFile error:', e.message);
    }
}

// Save an uploaded file buffer into uploads/{projectCode}/ preserving original name
function saveUploadedFile(projectCode, originalname, buffer) {
    // Sanitise the code so it is always safe as a folder name
    const safeCode = String(projectCode).replace(/[^a-zA-Z0-9\-_]/g, '_');
    const projectDir = path.join(uploadsDir, safeCode);
    if (!fs.existsSync(projectDir)) {
        fs.mkdirSync(projectDir, { recursive: true });
    }
    const ext = path.extname(originalname);
    const base = path.basename(originalname, ext);
    let filename = originalname;
    let counter = 1;
    while (fs.existsSync(path.join(projectDir, filename))) {
        filename = `${base}_${counter}${ext}`;
        counter++;
    }
    fs.writeFileSync(path.join(projectDir, filename), buffer);
    return `${safeCode}/${filename}`;
}

// Returns current IST datetime as "YYYY-MM-DD HH:MM:SS"
function nowIST() {
    const d = new Date(); // local time = IST (TZ set above)
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// Returns today's date in IST as "YYYY-MM-DD"
function todayIST() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

// ── In-memory heartbeat tracker: userId → last ping timestamp ────────────────
const userLastSeen = new Map();

// ── Pause ALL currently active timers (called by auto-pause triggers) ─────────
// serverOnly=true → only pause timers belonging to admin/server-PC users (used on screen lock)
function autoPauseAllTimers(reason, serverOnly = false) {
    const activeEntries = dbAll(`
        SELECT te.*, t.assigned_to, u.role
        FROM time_entries te
        JOIN tasks t ON te.task_id = t.id
        JOIN users u ON te.user_id = u.id
        WHERE te.is_active = 1
        ${serverOnly ? "AND u.role = 'admin'" : ''}
    `);
    if (activeEntries.length === 0) return 0;

    const now = nowIST();
    for (const te of activeEntries) {
        const dur = (new Date(now) - new Date(te.start_time)) / (1000 * 60);
        dbRun(`UPDATE time_entries SET end_time=?, duration_minutes=?, is_active=0, pause_type='auto', remarks=? WHERE id=?`,
            [now, Math.max(0, dur), reason, te.id]);

        const iterTime = dbGet("SELECT SUM(duration_minutes) as total FROM time_entries WHERE iteration_id=?", [te.iteration_id]);
        dbRun("UPDATE task_iterations SET total_time_spent=? WHERE id=?", [iterTime.total || 0, te.iteration_id]);

        const taskTotal = dbGet("SELECT SUM(duration_minutes) as total FROM time_entries WHERE task_id=?", [te.task_id]);
        dbRun("UPDATE tasks SET total_time_spent=?, status='paused', updated_at=CURRENT_TIMESTAMP WHERE id=?", [taskTotal.total || 0, te.task_id]);
    }
    saveDatabase();
    console.log(`[AUTO-PAUSE] ${activeEntries.length} timer(s) paused — ${reason}`);
    return activeEntries.length;
}

// ── Check if a user is a manager (primary or co-manager) on a project ─────────
function isProjectManager(userId, projectId) {
    const project = dbGet("SELECT manager_id FROM projects WHERE id = ?", [projectId]);
    if (!project) return false;
    if (project.manager_id === userId) return true;
    const pm = dbGet("SELECT id FROM project_managers WHERE project_id = ? AND user_id = ?", [projectId, userId]);
    return !!pm;
}

// Generate next LU-YY-NNN-MMM project code using atomic yearly sequence counter.
// Safe in single-process Node.js (sql.js ops are synchronous — no async gaps).
function generateProjectCode() {
    const d    = new Date();
    const year = d.getFullYear();
    const yy   = String(year).slice(-2);
    const mmm  = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][d.getMonth()];

    // Insert row for this year if it doesn't exist yet (starting at 0)
    dbRun('INSERT OR IGNORE INTO project_sequences (year, next_seq) VALUES (?, 0)', [year]);
    // Atomically increment
    dbRun('UPDATE project_sequences SET next_seq = next_seq + 1 WHERE year = ?', [year]);
    // Read back the new value
    const row = dbGet('SELECT next_seq FROM project_sequences WHERE year = ?', [year]);

    const nnn = String(row.next_seq).padStart(3, '0'); // min 3 digits, expands naturally beyond 999
    return `LU-${yy}-${nnn}-${mmm}`;
}

// Database helper functions
function dbGet(sql, params = []) {
    const db = getDatabase();
    const stmt = db.prepare(sql);
    if (params.length > 0) {
        stmt.bind(params);
    }
    if (stmt.step()) {
        const row = stmt.getAsObject();
        stmt.free();
        return row;
    }
    stmt.free();
    return null;
}

function dbAll(sql, params = []) {
    const db = getDatabase();
    const stmt = db.prepare(sql);
    if (params.length > 0) {
        stmt.bind(params);
    }
    const results = [];
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

function dbRun(sql, params = []) {
    const db = getDatabase();
    db.run(sql, params);
    scheduleSave();
    return db.getRowsModified();
}

// Run INSERT and return the new row's ID
function dbInsert(sql, params = []) {
    const db = getDatabase();
    db.run(sql, params);
    const result = db.exec("SELECT last_insert_rowid()");
    const lastId = result[0]?.values[0][0] || null;
    scheduleSave();
    return lastId;
}

// Authentication middleware
function requireAuth(req, res, next) {
    if (!req.session.user) {
        // Check if this is an API call (expects JSON)
        const acceptHeader = req.headers.accept || '';
        if (acceptHeader.includes('application/json')) {
            return res.status(401).json({ error: 'Please login first', redirect: '/login' });
        }
        return res.redirect('/login');
    }
    next();
}

function requireRole(roles) {
    return (req, res, next) => {
        if (!req.session.user) {
            return res.status(401).json({ error: 'Please login first' });
        }
        if (!roles.includes(req.session.user.role)) {
            return res.status(403).json({ error: 'Access denied: You do not have permission to perform this action' });
        }
        next();
    };
}

// ==================== ROUTES ====================

// Login page
app.get('/login', (req, res) => {
    if (req.session.user) {
        return res.redirect(req.session.user.role === 'client' ? '/client' : '/dashboard');
    }
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Login handler
app.post('/login', (req, res) => {
    const { email, password } = req.body;
    const normalizedEmail = normalizeEmail(email);

    const user = dbGet("SELECT * FROM users WHERE email = ? AND is_active = 1", [normalizedEmail]);

    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
        return res.status(401).json({ error: 'Invalid email or password' });
    }

    req.session.user = {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role
    };

    res.json({ success: true, redirect: user.role === 'client' ? '/client' : '/dashboard' });
});

// Logout
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// Dashboard - redirect clients away
app.get('/dashboard', requireAuth, (req, res) => {
    if (req.session.user.role === 'client') return res.redirect('/client');
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Client portal
app.get('/client', requireAuth, (req, res) => {
    if (req.session.user.role !== 'client') return res.redirect('/dashboard');
    res.sendFile(path.join(__dirname, 'public', 'client.html'));
});

// API: Get current user
app.get('/api/user', requireAuth, (req, res) => {
    res.json(req.session.user);
});

// API: Get all users (Admin only)
app.get('/api/users', requireAuth, requireRole(['admin']), (req, res) => {
    const users = dbAll("SELECT id, full_name, email, role, is_active, created_at FROM users ORDER BY created_at DESC");
    res.json(users);
});

// API: Create user (Admin only)
app.post('/api/users', requireAuth, requireRole(['admin']), (req, res) => {
    const { full_name, password, role } = req.body;
    const email = normalizeEmail(req.body.email);
    const project_ids = req.body.project_ids; // may be string, array, or undefined

    // Check if email already exists
    const existingUser = dbGet("SELECT id FROM users WHERE email = ?", [email]);
    if (existingUser) {
        return res.status(400).json({ error: 'Username already exists' });
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const newUserId = dbInsert(
        "INSERT INTO users (full_name, email, password_hash, role, is_active) VALUES (?, ?, ?, ?, 1)",
        [full_name, email, passwordHash, role]
    );

    // Save project assignments for client role
    if (role === 'client' && project_ids) {
        const ids = Array.isArray(project_ids) ? project_ids : [project_ids];
        for (const pid of ids) {
            if (pid) dbRun('INSERT OR IGNORE INTO project_members (project_id, user_id) VALUES (?, ?)', [pid, newUserId]);
        }
    }

    res.json({ success: true });
});

// API: Update user (Admin only)
app.put('/api/users/:id', requireAuth, requireRole(['admin']), (req, res) => {
    const { id } = req.params;
    const { full_name, role, is_active } = req.body;
    const email = normalizeEmail(req.body.email);
    const project_ids = req.body.project_ids;

    dbRun(
        "UPDATE users SET full_name = ?, email = ?, role = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [full_name, email, role, is_active, id]
    );

    // Sync project assignments for client role
    dbRun('DELETE FROM project_members WHERE user_id = ?', [id]);
    if (role === 'client' && project_ids) {
        const ids = Array.isArray(project_ids) ? project_ids : [project_ids];
        for (const pid of ids) {
            if (pid) dbRun('INSERT OR IGNORE INTO project_members (project_id, user_id) VALUES (?, ?)', [pid, id]);
        }
    }

    res.json({ success: true });
});

// API: Get own profile (all roles)
app.get('/api/profile', requireAuth, (req, res) => {
    const user = dbGet(
        `SELECT id, full_name, email, role, is_active, avatar_url, created_at,
                date_of_birth, anniversary_date, aadhar_number, pan_number, blood_group, joining_date
         FROM users WHERE id = ?`,
        [req.session.user.id]
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
});

// API: Update own profile (all roles) — multipart to support photo upload
app.put('/api/profile', requireAuth, upload.single('profile_photo'), async (req, res) => {
    const { full_name, email, current_password, new_password, confirm_password,
            date_of_birth, anniversary_date, aadhar_number, pan_number, blood_group, joining_date } = req.body;
    const userId = req.session.user.id;

    if (!full_name || !full_name.trim())
        return res.status(400).json({ error: 'Full name is required' });
    if (!email || !email.trim())
        return res.status(400).json({ error: 'Username is required' });

    const normalizedEmail = normalizeEmail(email);
    const existing = dbGet("SELECT id FROM users WHERE email = ? AND id != ?", [normalizedEmail, userId]);
    if (existing) return res.status(400).json({ error: 'Username is already in use by another account' });

    const userRow = dbGet("SELECT * FROM users WHERE id = ?", [userId]);
    if (!userRow) return res.status(404).json({ error: 'User not found' });

    let newHash = userRow.password_hash;
    if (new_password) {
        if (!current_password)
            return res.status(400).json({ error: 'Current password is required to set a new password' });
        const match = await bcrypt.compare(current_password, userRow.password_hash);
        if (!match)
            return res.status(400).json({ error: 'Current password is incorrect' });
        if (new_password.length < 6)
            return res.status(400).json({ error: 'New password must be at least 6 characters' });
        if (new_password !== confirm_password)
            return res.status(400).json({ error: 'New passwords do not match' });
        newHash = await bcrypt.hash(new_password, 12);
    }

    // Handle profile photo upload
    let avatarUrl = userRow.avatar_url || null;
    if (req.file) {
        const photosDir = path.join(uploadsDir, 'profile_photos');
        if (!fs.existsSync(photosDir)) fs.mkdirSync(photosDir, { recursive: true });
        const ext = path.extname(req.file.originalname).toLowerCase() || '.jpg';
        const filename = `${userId}${ext}`;
        fs.writeFileSync(path.join(photosDir, filename), req.file.buffer);
        avatarUrl = `profile_photos/${filename}`;
    }

    dbRun(
        `UPDATE users SET full_name=?, email=?, password_hash=?, avatar_url=?,
                          date_of_birth=?, anniversary_date=?, aadhar_number=?, pan_number=?,
                          blood_group=?, joining_date=?, updated_at=CURRENT_TIMESTAMP
         WHERE id=?`,
        [full_name.trim(), normalizedEmail, newHash, avatarUrl,
         date_of_birth || null, anniversary_date || null,
         aadhar_number || null, pan_number || null,
         blood_group || null, joining_date || null, userId]
    );

    req.session.user.full_name = full_name.trim();
    req.session.user.email     = normalizedEmail;

    saveDatabase();
    res.json({ success: true, full_name: full_name.trim(), email: normalizedEmail, avatar_url: avatarUrl });
});

// API: Delete user (Admin only) - soft delete
app.delete('/api/users/:id', requireAuth, requireRole(['admin']), (req, res) => {
    const { id } = req.params;

    dbRun("UPDATE users SET is_active = 0 WHERE id = ?", [id]);

    res.json({ success: true });
});

// API: Get all projects
app.get('/api/projects', requireAuth, (req, res) => {
    const user = req.session.user;
    let projects;

    const projectQuery = `
        SELECT p.*, u.full_name as manager_name,
               (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) as total_tasks,
               (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND status = 'completed') as completed_tasks
        FROM projects p
        LEFT JOIN users u ON p.manager_id = u.id
    `;

    if (user.role === 'admin') {
        projects = dbAll(projectQuery + " WHERE p.status != 'archived' ORDER BY p.created_at DESC");
    } else if (user.role === 'manager') {
        projects = dbAll(projectQuery + `
            WHERE (p.manager_id = ? OR p.id IN (SELECT project_id FROM project_managers WHERE user_id = ?))
              AND p.status != 'archived' ORDER BY p.created_at DESC
        `, [user.id, user.id]);
    } else if (user.role === 'client') {
        projects = dbAll(projectQuery + `
            INNER JOIN project_members pm ON p.id = pm.project_id
            WHERE pm.user_id = ? AND p.status != 'archived'
            ORDER BY p.created_at DESC
        `, [user.id]);
    } else {
        // Member - get projects they are assigned to
        projects = dbAll(projectQuery + `
            INNER JOIN tasks t ON p.id = t.project_id
            WHERE t.assigned_to = ? AND p.status != 'archived'
            GROUP BY p.id
            ORDER BY p.created_at DESC
        `, [user.id]);
    }

    // Compute progress percent and attach additional managers
    for (const project of projects) {
        project.progress_percent = project.total_tasks > 0
            ? Math.round((project.completed_tasks / project.total_tasks) * 100)
            : 0;
        const coManagers = dbAll(`
            SELECT u.id, u.full_name FROM project_managers pm
            JOIN users u ON pm.user_id = u.id
            WHERE pm.project_id = ?
        `, [project.id]);
        project.additional_managers = coManagers;
        const allManagerNames = [project.manager_name, ...coManagers.map(m => m.full_name)];
        project.all_managers_display = allManagerNames.join(', ');
    }

    res.json(projects);
});

// API: Create project (with optional file uploads)
app.post('/api/projects', requireAuth, requireRole(['admin', 'manager']), upload.array('project_files', 10), (req, res) => {
    const { project_name, client_name, description, manager_id, additional_manager_ids, priority, start_date, due_date } = req.body;
    const user = req.session.user;
    const files = req.files || [];

    // Always generate server-side — any user-supplied project_code in the payload is ignored
    const code = generateProjectCode();

    // For admin: use selected manager_id, if not selected, use admin's id
    let mgrId;
    if (user.role === 'admin') {
        mgrId = manager_id ? parseInt(manager_id) : user.id;
    } else {
        mgrId = user.id;
    }

    dbRun(`
        INSERT INTO projects (project_name, project_code, client_name, description, manager_id, priority, start_date, due_date, created_by, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'not_started')
    `, [project_name, code, client_name, description, mgrId, priority, start_date, due_date, user.id]);

    // Get the created project
    const project = dbGet("SELECT * FROM projects WHERE project_code = ?", [code]);

    // Save contacts
    let savedContacts = [];
    try {
        const contacts = req.body.contacts ? JSON.parse(req.body.contacts) : [];
        for (const c of contacts) {
            if (!c.name && !c.contact_name) continue;
            dbRun(
                `INSERT INTO project_contacts (project_id, contact_name, contact_phone, contact_email) VALUES (?, ?, ?, ?)`,
                [project.id, c.name || c.contact_name, c.phone || c.contact_phone || null, c.email || c.contact_email || null]
            );
        }
        savedContacts = contacts;
    } catch (e) { console.error('Contacts save error:', e.message); }

    // Write project_info.txt into the project folder
    const managerRow = dbGet('SELECT full_name FROM users WHERE id = ?', [mgrId]);
    saveProjectInfoFile(project, savedContacts, managerRow ? managerRow.full_name : '', user.full_name);

    // Upload files if any
    if (files.length > 0) {
        for (const file of files) {
            const filePath = saveUploadedFile(project.project_code, file.originalname, file.buffer);
            dbRun(`
                INSERT INTO file_attachments (project_id, uploaded_by, file_name, file_path, file_size, file_type, upload_type, description)
                VALUES (?, ?, ?, ?, ?, ?, 'reference', ?)
            `, [project.id, user.id, file.originalname, filePath, file.size, file.mimetype, '']);
        }
    }

    // Save additional co-managers
    const extraMgrIds = additional_manager_ids
        ? (Array.isArray(additional_manager_ids) ? additional_manager_ids : additional_manager_ids.split(','))
              .map(x => parseInt(x)).filter(x => !isNaN(x) && x !== mgrId)
        : [];
    for (const emId of extraMgrIds) {
        try {
            dbRun("INSERT OR IGNORE INTO project_managers (project_id, user_id) VALUES (?, ?)", [project.id, emId]);
        } catch (_) {}
    }

    // Create notifications for all managers
    const allMgrIds = [mgrId, ...extraMgrIds];
    for (const mid of allMgrIds) {
        if (user.id !== mid) {
            dbRun(`
                INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id)
                VALUES (?, 'project_created', 'New project assigned', ?, 'project', ?)
            `, [mid, `New project "${project_name}" has been assigned to you`, project.id]);
        }
    }

    // Log activity
    dbRun(`
        INSERT INTO activity_log (user_id, action, entity_type, entity_id, details)
        VALUES (?, 'created', 'project', ?, ?)
    `, [user.id, project.id, JSON.stringify({ project_name, project_code: code, files_count: files.length })]);

    res.json({ success: true, project, files_uploaded: files.length });
});

// API: Get single project
app.get('/api/projects/:id', requireAuth, (req, res) => {
    const { id } = req.params;
    const user = req.session.user;

    const project = dbGet(`
        SELECT p.*, u.full_name as manager_name 
        FROM projects p 
        LEFT JOIN users u ON p.manager_id = u.id 
        WHERE p.id = ?
    `, [id]);

    if (!project) {
        return res.status(404).json({ error: 'Project not found' });
    }

    // Check access
    if (user.role === 'member') {
        const hasAccess = dbGet(`
            SELECT id FROM tasks WHERE project_id = ? AND assigned_to = ?
        `, [id, user.id]);

        if (!hasAccess) {
            return res.status(403).json({ error: 'Access denied' });
        }
    }

    let contacts = [];
    try {
        contacts = dbAll(
            `SELECT id, contact_name, contact_phone, contact_email FROM project_contacts WHERE project_id = ? ORDER BY id ASC`,
            [id]
        );
    } catch (e) { /* table may not exist on first run before migration */ }

    const additionalManagers = dbAll(`
        SELECT u.id, u.full_name FROM project_managers pm
        JOIN users u ON pm.user_id = u.id
        WHERE pm.project_id = ?
    `, [id]);

    res.json({ ...project, contacts, additional_managers: additionalManagers });
});

// API: Update project
app.put('/api/projects/:id', requireAuth, requireRole(['admin', 'manager']), (req, res) => {
    const { id } = req.params;
    const { project_name, client_name, description, status, priority, start_date, due_date, contacts: contactsRaw, additional_manager_ids } = req.body;
    const user = req.session.user;

    const currentProject = dbGet("SELECT * FROM projects WHERE id = ?", [id]);
    if (!currentProject) return res.status(404).json({ error: 'Project not found' });

    // Check ownership for managers
    if (user.role === 'manager' && !isProjectManager(user.id, id)) {
        return res.status(403).json({ error: 'Access denied' });
    }

    // Track client_review transitions if status is changing
    const oldStatus = currentProject.status;
    const now = nowIST();
    if (status && status !== oldStatus) {
        if (status === 'client_review') {
            // Stop all active timers in this project
            const activeTasks = dbAll(`
                SELECT te.id, te.start_time, te.task_id FROM time_entries te
                INNER JOIN tasks t ON te.task_id = t.id
                WHERE t.project_id = ? AND te.is_active = 1
            `, [id]);
            for (const te of activeTasks) {
                const dur = Math.max(0, (new Date(now) - new Date(te.start_time)) / (1000 * 60));
                dbRun('UPDATE time_entries SET end_time=?, duration_minutes=?, is_active=0 WHERE id=?', [now, dur, te.id]);
            }
            if (activeTasks.length > 0) {
                const taskIds = [...new Set(activeTasks.map(te => te.task_id))];
                for (const tid of taskIds) {
                    const tot = dbGet('SELECT SUM(duration_minutes) as total FROM time_entries WHERE task_id=?', [tid]);
                    dbRun('UPDATE tasks SET total_time_spent=? WHERE id=?', [tot.total || 0, tid]);
                }
            }
            dbRun("INSERT INTO project_reviews (project_id, submitted_at, submitted_by) VALUES (?,?,?)", [id, now, user.id]);
        } else if (oldStatus === 'client_review') {
            // Close the open review cycle
            const review = dbGet("SELECT * FROM project_reviews WHERE project_id=? AND responded_at IS NULL ORDER BY id DESC LIMIT 1", [id]);
            if (review) {
                const reviewMinutes = (new Date(now) - new Date(review.submitted_at)) / (1000 * 60);
                const responseType = status === 'completed' ? 'approved' : 'revision_requested';
                dbRun('UPDATE project_reviews SET responded_at=?, response_type=?, review_minutes=? WHERE id=?',
                    [now, responseType, reviewMinutes, review.id]);
            }
        }
    }

    const extra = status === 'completed' && oldStatus !== 'completed' ? ', actual_end_date=?' : '';
    const updateParams = status === 'completed' && oldStatus !== 'completed'
        ? [project_name, client_name, description, status, priority, start_date, due_date, now, id]
        : [project_name, client_name, description, status, priority, start_date, due_date, id];

    dbRun(`
        UPDATE projects
        SET project_name = ?, client_name = ?, description = ?, status = ?, priority = ?,
            start_date = ?, due_date = ?, updated_at = CURRENT_TIMESTAMP${extra}
        WHERE id = ?
    `, updateParams);

    // Replace contacts
    try {
        const contacts = contactsRaw ? (typeof contactsRaw === 'string' ? JSON.parse(contactsRaw) : contactsRaw) : [];
        dbRun('DELETE FROM project_contacts WHERE project_id = ?', [id]);
        for (const c of contacts) {
            if (!c.name && !c.contact_name) continue;
            dbRun(
                `INSERT INTO project_contacts (project_id, contact_name, contact_phone, contact_email) VALUES (?, ?, ?, ?)`,
                [id, c.name || c.contact_name, c.phone || c.contact_phone || null, c.email || c.contact_email || null]
            );
        }
    } catch (e) { console.error('Contacts update error:', e.message); }

    // Replace additional co-managers
    try {
        const primaryMgrId = currentProject.manager_id;
        const extraMgrIds = additional_manager_ids
            ? (Array.isArray(additional_manager_ids) ? additional_manager_ids : additional_manager_ids.split(','))
                  .map(x => parseInt(x)).filter(x => !isNaN(x) && x !== primaryMgrId)
            : [];
        dbRun('DELETE FROM project_managers WHERE project_id = ?', [id]);
        for (const emId of extraMgrIds) {
            dbRun("INSERT OR IGNORE INTO project_managers (project_id, user_id) VALUES (?, ?)", [id, emId]);
        }
    } catch (e) { console.error('Co-managers update error:', e.message); }

    // Update project_info.txt with new details
    try {
        const updatedProject = dbGet('SELECT * FROM projects WHERE id = ?', [id]);
        const updatedContacts = dbAll('SELECT * FROM project_contacts WHERE project_id = ? ORDER BY id ASC', [id]);
        const updatedManager = dbGet('SELECT full_name FROM users WHERE id = ?', [updatedProject.manager_id]);
        const createdBy = dbGet('SELECT full_name FROM users WHERE id = ?', [updatedProject.created_by]);
        saveProjectInfoFile(updatedProject, updatedContacts, updatedManager ? updatedManager.full_name : '', createdBy ? createdBy.full_name : '');
    } catch (e) { console.error('project_info.txt update error:', e.message); }

    res.json({ success: true });
});

// API: Quick status change (clickable badge in project table)
app.patch('/api/projects/:id/status', requireAuth, requireRole(['admin', 'manager']), (req, res) => {
    const { id } = req.params;
    const { status: newStatus } = req.body;
    const user = req.session.user;

    const VALID = ['not_started', 'in_progress', 'on_hold', 'client_review', 'completed', 'archived'];
    if (!VALID.includes(newStatus)) return res.status(400).json({ error: 'Invalid status' });

    const project = dbGet("SELECT * FROM projects WHERE id = ?", [id]);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    if (user.role === 'manager' && !isProjectManager(user.id, id))
        return res.status(403).json({ error: 'Access denied' });

    const oldStatus = project.status;
    if (oldStatus === newStatus) return res.json({ success: true });

    const now = nowIST();

    // Entering client_review: stop active timers, record review start
    if (newStatus === 'client_review') {
        const activeTasks = dbAll(`
            SELECT te.id, te.start_time, te.task_id FROM time_entries te
            INNER JOIN tasks t ON te.task_id = t.id
            WHERE t.project_id = ? AND te.is_active = 1
        `, [id]);
        for (const te of activeTasks) {
            const dur = Math.max(0, (new Date(now) - new Date(te.start_time)) / (1000 * 60));
            dbRun('UPDATE time_entries SET end_time=?, duration_minutes=?, is_active=0 WHERE id=?', [now, dur, te.id]);
        }
        if (activeTasks.length > 0) {
            const taskIds = [...new Set(activeTasks.map(te => te.task_id))];
            for (const tid of taskIds) {
                const tot = dbGet('SELECT SUM(duration_minutes) as total FROM time_entries WHERE task_id=?', [tid]);
                dbRun('UPDATE tasks SET total_time_spent=? WHERE id=?', [tot.total || 0, tid]);
            }
        }
        dbRun("INSERT INTO project_reviews (project_id, submitted_at, submitted_by) VALUES (?,?,?)", [id, now, user.id]);
    }

    // Leaving client_review: close the open review cycle, calculate review time
    if (oldStatus === 'client_review') {
        const review = dbGet("SELECT * FROM project_reviews WHERE project_id=? AND responded_at IS NULL ORDER BY id DESC LIMIT 1", [id]);
        if (review) {
            const reviewMinutes = (new Date(now) - new Date(review.submitted_at)) / (1000 * 60);
            const responseType = newStatus === 'completed' ? 'approved' : 'revision_requested';
            dbRun('UPDATE project_reviews SET responded_at=?, response_type=?, review_minutes=? WHERE id=?',
                [now, responseType, reviewMinutes, review.id]);
        }
    }

    const extra = newStatus === 'completed' && oldStatus !== 'completed' ? ', actual_end_date=?' : '';
    const params = newStatus === 'completed' && oldStatus !== 'completed'
        ? [newStatus, now, id] : [newStatus, id];
    dbRun(`UPDATE projects SET status=?, updated_at=CURRENT_TIMESTAMP${extra} WHERE id=?`, params);

    saveDatabase();
    res.json({ success: true, old_status: oldStatus, new_status: newStatus });
});

// API: Submit project for client review
app.post('/api/projects/:id/submit-for-review', requireAuth, requireRole(['admin', 'manager']), (req, res) => {
    const { id } = req.params;
    const user = req.session.user;

    const project = dbGet("SELECT * FROM projects WHERE id = ?", [id]);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    if (user.role === 'manager' && !isProjectManager(user.id, id))
        return res.status(403).json({ error: 'Access denied' });

    if (project.status === 'client_review')
        return res.status(400).json({ error: 'Project is already in client review' });

    if (!['in_progress', 'not_started'].includes(project.status))
        return res.status(400).json({ error: 'Only active projects can be submitted for review' });

    // Stop all active timers on tasks in this project
    const activeTasks = dbAll(`
        SELECT te.id, te.start_time FROM time_entries te
        INNER JOIN tasks t ON te.task_id = t.id
        WHERE t.project_id = ? AND te.is_active = 1
    `, [id]);
    const now = nowIST();
    for (const te of activeTasks) {
        const dur = Math.max(0, (new Date(now) - new Date(te.start_time)) / (1000 * 60));
        dbRun('UPDATE time_entries SET end_time=?, duration_minutes=?, is_active=0 WHERE id=?', [now, dur, te.id]);
    }
    // Recalculate task totals for affected tasks
    if (activeTasks.length > 0) {
        const affectedTaskIds = dbAll(`SELECT DISTINCT task_id FROM time_entries WHERE id IN (${activeTasks.map(() => '?').join(',')})`, activeTasks.map(te => te.id));
        for (const { task_id } of affectedTaskIds) {
            const tot = dbGet('SELECT SUM(duration_minutes) as total FROM time_entries WHERE task_id=?', [task_id]);
            dbRun('UPDATE tasks SET total_time_spent=? WHERE id=?', [tot.total || 0, task_id]);
        }
    }

    // Change project status
    dbRun("UPDATE projects SET status='client_review', updated_at=CURRENT_TIMESTAMP WHERE id=?", [id]);

    // Record the review cycle
    const reviewId = dbInsert('INSERT INTO project_reviews (project_id, submitted_at, submitted_by) VALUES (?,?,?)', [id, now, user.id]);

    // Notify all members assigned to tasks in this project
    const members = dbAll(`SELECT DISTINCT assigned_to FROM tasks WHERE project_id=?`, [id]);
    for (const m of members) {
        dbRun(`INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id)
               VALUES (?, 'task_submitted', 'Project submitted for client review', ?, 'project', ?)`,
            [m.assigned_to, `"${project.project_name}" has been submitted for client review. Timers are paused.`, id]);
    }

    saveDatabase();
    res.json({ success: true, review_id: reviewId, timers_stopped: activeTasks.length });
});

// API: Mark client review responded
app.post('/api/projects/:id/mark-reviewed', requireAuth, requireRole(['admin', 'manager']), (req, res) => {
    const { id } = req.params;
    const { response_type, response_notes } = req.body;
    const user = req.session.user;

    if (!['approved', 'revision_requested'].includes(response_type))
        return res.status(400).json({ error: 'response_type must be approved or revision_requested' });

    const project = dbGet("SELECT * FROM projects WHERE id = ?", [id]);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    if (user.role === 'manager' && !isProjectManager(user.id, id))
        return res.status(403).json({ error: 'Access denied' });

    if (project.status !== 'client_review')
        return res.status(400).json({ error: 'Project is not in client review' });

    // Find the open review cycle
    const review = dbGet("SELECT * FROM project_reviews WHERE project_id=? AND responded_at IS NULL ORDER BY id DESC LIMIT 1", [id]);
    if (!review) return res.status(400).json({ error: 'No open review found' });

    const now = nowIST();
    const reviewMinutes = (new Date(now) - new Date(review.submitted_at)) / (1000 * 60);

    dbRun(`UPDATE project_reviews SET responded_at=?, response_type=?, response_notes=?, review_minutes=? WHERE id=?`,
        [now, response_type, response_notes || '', reviewMinutes, review.id]);

    const newStatus = response_type === 'approved' ? 'completed' : 'in_progress';
    const extra = response_type === 'approved' ? ', actual_end_date=?' : '';
    const params = response_type === 'approved'
        ? [newStatus, now, id]
        : [newStatus, id];
    dbRun(`UPDATE projects SET status=?, updated_at=CURRENT_TIMESTAMP${extra} WHERE id=?`, params);

    saveDatabase();
    res.json({ success: true, review_minutes: Math.round(reviewMinutes), new_status: newStatus });
});

// API: Get review history for a project
app.get('/api/projects/:id/reviews', requireAuth, (req, res) => {
    const { id } = req.params;
    const user = req.session.user;

    // Clients can only see reviews for their assigned projects
    if (user.role === 'client') {
        const access = dbGet('SELECT id FROM project_members WHERE project_id=? AND user_id=?', [id, user.id]);
        if (!access) return res.status(403).json({ error: 'Access denied' });
    }

    const reviews = dbAll(`
        SELECT pr.*, u.full_name AS submitted_by_name
        FROM project_reviews pr
        LEFT JOIN users u ON pr.submitted_by = u.id
        WHERE pr.project_id = ?
        ORDER BY pr.id ASC
    `, [id]);
    res.json(reviews);
});

// API: Delete (archive) project — admin can delete any, manager can delete their own
app.delete('/api/projects/:id', requireAuth, requireRole(['admin', 'manager']), (req, res) => {
    const { id } = req.params;
    const user = req.session.user;

    const project = dbGet("SELECT * FROM projects WHERE id = ?", [id]);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    if (user.role === 'manager' && !isProjectManager(user.id, id))
        return res.status(403).json({ error: 'Access denied' });

    dbRun("UPDATE projects SET status = 'archived', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [id]);

    dbRun(`INSERT INTO activity_log (user_id, action, entity_type, entity_id, details)
           VALUES (?, 'archived', 'project', ?, ?)`,
        [user.id, id, JSON.stringify({ project_name: project.project_name })]);

    saveDatabase();
    res.json({ success: true });
});

// API: Get files for a project
app.get('/api/projects/:id/files', requireAuth, (req, res) => {
    const { id } = req.params;
    const user = req.session.user;

    // Check access - user must be member of the project
    if (user.role === 'member') {
        const hasAccess = dbGet(`
            SELECT id FROM tasks WHERE project_id = ? AND assigned_to = ?
        `, [id, user.id]);

        if (!hasAccess) {
            return res.status(403).json({ error: 'Access denied' });
        }
    }

    const files = dbAll(`
        SELECT f.*, u.full_name as uploaded_by_name
        FROM file_attachments f
        LEFT JOIN users u ON f.uploaded_by = u.id
        WHERE f.project_id = ?
        ORDER BY f.created_at DESC
    `, [id]);

    res.json(files);
});

// API: Upload file to project
app.post('/api/projects/:id/files', requireAuth, upload.single('file'), (req, res) => {
    const { id } = req.params;
    const user = req.session.user;

    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const { upload_type, description } = req.body;
    const proj = dbGet('SELECT project_code FROM projects WHERE id = ?', [id]);
    const filePath = saveUploadedFile(proj ? proj.project_code : id, req.file.originalname, req.file.buffer);

    const newFileId = dbInsert(`
        INSERT INTO file_attachments (project_id, uploaded_by, file_name, file_path, file_size, file_type, upload_type, description)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
        id,
        user.id,
        req.file.originalname,
        filePath,
        req.file.size,
        req.file.mimetype,
        upload_type || 'reference',
        description || ''
    ]);

    // Get file record
    const file = newFileId ? dbGet("SELECT * FROM file_attachments WHERE id = ?", [newFileId]) : null;

    // Get project info for notification
    const project = dbGet("SELECT project_name, manager_id FROM projects WHERE id = ?", [id]);

    // Notify manager if uploader is not the manager
    if (project.manager_id !== user.id) {
        dbRun(`
            INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id)
            VALUES (?, 'file_uploaded', 'File uploaded to project', ?, 'project', ?)
        `, [project.manager_id, `${user.fullName} uploaded "${req.file.originalname}" to project "${project.project_name}"`, id]);
    }

    // Log activity
    dbRun(`
        INSERT INTO activity_log (user_id, action, entity_type, entity_id, details)
        VALUES (?, 'uploaded', 'file', ?, ?)
    `, [user.id, file.id, JSON.stringify({ file_name: req.file.originalname, project_id: id })]);

    res.json({ success: true, file });
});

// API: Delete project file
app.delete('/api/projects/:projectId/files/:fileId', requireAuth, (req, res) => {
    const { projectId, fileId } = req.params;
    const user = req.session.user;

    // Check if file exists
    const file = dbGet("SELECT * FROM file_attachments WHERE id = ? AND project_id = ?", [fileId, projectId]);
    if (!file) {
        return res.status(404).json({ error: 'File not found' });
    }

    // Only uploader, manager, or admin can delete
    if (file.uploaded_by !== user.id && user.role !== 'admin' && user.role !== 'manager') {
        return res.status(403).json({ error: 'Access denied' });
    }

    // Delete from database
    dbRun("DELETE FROM file_attachments WHERE id = ?", [fileId]);

    // Delete physical file
    const filePath = path.join(uploadsDir, file.file_path);
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }

    res.json({ success: true });
});

// API: Download project file
app.get('/api/projects/:projectId/files/:fileId/download', requireAuth, (req, res) => {
    const { projectId, fileId } = req.params;
    const user = req.session.user;

    // Check if file exists
    const file = dbGet("SELECT * FROM file_attachments WHERE id = ? AND project_id = ?", [fileId, projectId]);
    if (!file) {
        return res.status(404).json({ error: 'File not found' });
    }

    // Check access - members need to be part of the project
    if (user.role === 'member') {
        const hasAccess = dbGet(`
            SELECT id FROM tasks WHERE project_id = ? AND assigned_to = ?
        `, [projectId, user.id]);

        if (!hasAccess) {
            return res.status(403).json({ error: 'Access denied' });
        }
    }

    const filePath = path.join(uploadsDir, file.file_path);
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found on server' });
    }

    res.download(filePath, file.file_name);
});

// API: Get tasks for a project
app.get('/api/projects/:id/tasks', requireAuth, (req, res) => {
    const { id } = req.params;
    const user = req.session.user;

    let tasks;
    if (user.role === 'member') {
        tasks = dbAll(`
            SELECT t.*, p.status as project_status, u.full_name as assigned_to_name
            FROM tasks t
            LEFT JOIN projects p ON t.project_id = p.id
            LEFT JOIN users u ON t.assigned_to = u.id
            WHERE t.project_id = ? AND t.assigned_to = ?
            ORDER BY t.created_at DESC
        `, [id, user.id]);
    } else {
        tasks = dbAll(`
            SELECT t.*, p.status as project_status, u.full_name as assigned_to_name
            FROM tasks t
            LEFT JOIN projects p ON t.project_id = p.id
            LEFT JOIN users u ON t.assigned_to = u.id
            WHERE t.project_id = ?
            ORDER BY t.created_at DESC
        `, [id]);
    }

    res.json(tasks);
});

// API: Get all tasks (for admin/manager)
app.get('/api/tasks', requireAuth, (req, res) => {
    const user = req.session.user;
    let tasks;

    if (user.role === 'member') {
        tasks = dbAll(`
            SELECT t.*, p.project_name, p.project_code, p.status as project_status, u.full_name as assigned_to_name
            FROM tasks t
            LEFT JOIN projects p ON t.project_id = p.id
            LEFT JOIN users u ON t.assigned_to = u.id
            WHERE t.assigned_to = ?
            ORDER BY t.created_at DESC
        `, [user.id]);
    } else if (user.role === 'manager') {
        tasks = dbAll(`
            SELECT t.*, p.project_name, p.project_code, p.status as project_status, u.full_name as assigned_to_name
            FROM tasks t
            LEFT JOIN projects p ON t.project_id = p.id
            LEFT JOIN users u ON t.assigned_to = u.id
            WHERE (p.manager_id = ? OR p.id IN (SELECT project_id FROM project_managers WHERE user_id = ?))
            ORDER BY t.created_at DESC
        `, [user.id, user.id]);
    } else {
        tasks = dbAll(`
            SELECT t.*, p.project_name, p.project_code, p.status as project_status, u.full_name as assigned_to_name
            FROM tasks t
            LEFT JOIN projects p ON t.project_id = p.id
            LEFT JOIN users u ON t.assigned_to = u.id
            ORDER BY t.created_at DESC
        `);
    }

    res.json(tasks);
});

// API: Create task (with optional file uploads)
app.post('/api/tasks', requireAuth, requireRole(['admin', 'manager']), upload.array('task_files', 10), (req, res) => {
    // Normalize fields in case multer gives arrays for duplicate form field names
    const normalize = v => {
        if (v === undefined || v === null) return null;
        if (Array.isArray(v)) { const vals = v.filter(x => x !== ''); return vals.length > 0 ? vals[vals.length - 1] : null; }
        return v === '' ? null : v;
    };
    const project_id = normalize(req.body.project_id);
    const task_title = normalize(req.body.task_title);
    const task_description = normalize(req.body.task_description);
    const assigned_to = normalize(req.body.assigned_to);
    const priority = normalize(req.body.priority) || 'medium';
    const estimated_hours = normalize(req.body.estimated_hours);
    const due_date = normalize(req.body.due_date);
    const task_category = normalize(req.body.task_category) || 'project_requirement';
    const user = req.session.user;
    const files = req.files || [];

    if (!project_id || !task_title || !assigned_to) {
        return res.status(400).json({ error: 'Project, task title, and assigned member are required.' });
    }

    // Check project ownership for managers
    if (user.role === 'manager' && !isProjectManager(user.id, project_id)) {
        return res.status(403).json({ error: 'Access denied' });
    }

    // Create task
    const newTaskId = dbInsert(`
        INSERT INTO tasks (project_id, task_title, task_description, assigned_to, assigned_by, priority, estimated_hours, due_date, status, task_category)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `, [project_id, task_title, task_description, assigned_to, user.id, priority, estimated_hours, due_date, task_category]);

    if (!newTaskId) {
        return res.status(500).json({ error: 'Failed to create task. Please check that the project and member are valid.' });
    }

    // Get the newly created task
    const task = dbGet("SELECT * FROM tasks WHERE id = ?", [newTaskId]);

    // Create first iteration (initial)
    dbRun(`
        INSERT INTO task_iterations (task_id, iteration_number, iteration_type, assigned_to)
        VALUES (?, 1, 'initial', ?)
    `, [task.id, assigned_to]);

    // Get the iteration
    const iteration = dbGet("SELECT * FROM task_iterations WHERE task_id = ? AND iteration_number = 1", [task.id]);

    // Upload files if any
    if (files.length > 0) {
        for (const file of files) {
            dbRun(`
                INSERT INTO file_attachments (project_id, task_id, iteration_id, uploaded_by, file_name, file_path, file_size, file_type, upload_type, description)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'reference', ?)
            `, [project_id, task.id, iteration.id, user.id, file.originalname, file.filename, file.size, file.mimetype, '']);
        }
    }

    // Create notification for assigned member
    const project = dbGet("SELECT project_name FROM projects WHERE id = ?", [project_id]);
    dbRun(`
        INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id)
        VALUES (?, 'task_assigned', 'New task assigned', ?, 'task', ?)
    `, [assigned_to, `New task "${task_title}" assigned in project "${project.project_name}"`, task.id]);

    // Log activity
    dbRun(`
        INSERT INTO activity_log (user_id, action, entity_type, entity_id, details)
        VALUES (?, 'created', 'task', ?, ?)
    `, [user.id, task.id, JSON.stringify({ task_title, project_id, files_count: files.length })]);

    res.json({ success: true, task, files_uploaded: files.length });
});

// API: Get single task with iterations
app.get('/api/tasks/:id', requireAuth, (req, res) => {
    const { id } = req.params;
    const user = req.session.user;

    const task = dbGet(`
        SELECT t.*, p.project_name, p.project_code, 
               u1.full_name as assigned_to_name, u2.full_name as assigned_by_name
        FROM tasks t
        LEFT JOIN projects p ON t.project_id = p.id
        LEFT JOIN users u1 ON t.assigned_to = u1.id
        LEFT JOIN users u2 ON t.assigned_by = u2.id
        WHERE t.id = ?
    `, [id]);

    if (!task) {
        return res.status(404).json({ error: 'Task not found' });
    }

    // Get iterations
    const iterations = dbAll(`
        SELECT * FROM task_iterations WHERE task_id = ? ORDER BY iteration_number ASC
    `, [id]);

    // Get time entries for each iteration
    for (let iter of iterations) {
        iter.timeEntries = dbAll(`
            SELECT * FROM time_entries WHERE iteration_id = ? ORDER BY start_time ASC
        `, [iter.id]);
    }

    // Get files
    const files = dbAll(`
        SELECT f.*, u.full_name as uploaded_by_name
        FROM file_attachments f
        LEFT JOIN users u ON f.uploaded_by = u.id
        WHERE f.task_id = ?
        ORDER BY f.created_at DESC
    `, [id]);

    res.json({ task, iterations, files });
});

// API: Update task — admin can edit any, manager can edit tasks in their projects
app.put('/api/tasks/:id', requireAuth, requireRole(['admin', 'manager']), (req, res) => {
    const { id } = req.params;
    const { task_title, task_description, assigned_to, status, priority, estimated_hours, due_date, task_category } = req.body;
    const user = req.session.user;

    const task = dbGet(`
        SELECT t.* FROM tasks t
        WHERE t.id = ?
    `, [id]);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    if (user.role === 'manager' && !isProjectManager(user.id, task.project_id))
        return res.status(403).json({ error: 'Access denied' });

    dbRun(`
        UPDATE tasks
        SET task_title    = COALESCE(?, task_title),
            task_description = COALESCE(?, task_description),
            assigned_to   = COALESCE(?, assigned_to),
            status        = CASE WHEN ? IS NOT NULL AND ? != '' THEN ? ELSE status END,
            priority      = COALESCE(?, priority),
            estimated_hours = COALESCE(?, estimated_hours),
            due_date      = COALESCE(?, due_date),
            task_category = COALESCE(?, task_category),
            updated_at    = CURRENT_TIMESTAMP
        WHERE id = ?
    `, [
        task_title    || null,
        task_description !== undefined ? task_description : null,
        assigned_to   ? parseInt(assigned_to) : null,
        status || null, status || null, status || null,
        priority      || null,
        estimated_hours !== undefined && estimated_hours !== '' ? estimated_hours : null,
        due_date      || null,
        task_category || null,
        id
    ]);

    dbRun(`INSERT INTO activity_log (user_id, action, entity_type, entity_id, details)
           VALUES (?, 'updated', 'task', ?, ?)`,
        [user.id, id, JSON.stringify({ task_title: task_title || task.task_title })]);

    saveDatabase();
    res.json({ success: true });
});

// API: Delete (cancel) task — admin can delete any, manager can delete tasks in their projects
app.delete('/api/tasks/:id', requireAuth, requireRole(['admin', 'manager']), (req, res) => {
    const { id } = req.params;
    const user = req.session.user;

    const task = dbGet(`SELECT * FROM tasks WHERE id = ?`, [id]);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    if (user.role === 'manager' && !isProjectManager(user.id, task.project_id))
        return res.status(403).json({ error: 'Access denied' });

    // Stop any active timer first
    const active = dbGet("SELECT * FROM time_entries WHERE task_id = ? AND is_active = 1", [id]);
    if (active) {
        const now = nowIST();
        const dur = Math.max(0, (new Date(now) - new Date(active.start_time)) / (1000 * 60));
        dbRun("UPDATE time_entries SET end_time=?, duration_minutes=?, is_active=0 WHERE id=?", [now, dur, active.id]);
    }

    dbRun("UPDATE tasks SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [id]);

    dbRun(`INSERT INTO activity_log (user_id, action, entity_type, entity_id, details)
           VALUES (?, 'cancelled', 'task', ?, ?)`,
        [user.id, id, JSON.stringify({ task_title: task.task_title })]);

    saveDatabase();
    res.json({ success: true });
});

// API: Start timer on task
app.post('/api/tasks/:id/start-timer', requireAuth, requireRole(['member', 'manager']), (req, res) => {
    const { id } = req.params;
    const user = req.session.user;

    console.log(`[TIMER] Start timer request - Task ID: ${id}, User: ${user.email} (${user.id})`);

    // Check if task is assigned to this user
    const task = dbGet("SELECT * FROM tasks WHERE id = ?", [id]);
    console.log(`[TIMER] Task found:`, task ? `ID=${task.id}, assigned_to=${task.assigned_to}` : 'NOT FOUND');

    if (!task) {
        return res.status(404).json({ error: 'Task not found' });
    }

    if (task.assigned_to !== user.id) {
        console.log(`[TIMER] Access denied - Task assigned to ${task.assigned_to}, but user is ${user.id}`);
        return res.status(403).json({ error: 'Task not assigned to you' });
    }

    // Block timer if project is in client review
    const taskProject = dbGet("SELECT status FROM projects WHERE id = ?", [task.project_id]);
    if (taskProject && taskProject.status === 'client_review') {
        return res.status(400).json({ error: 'Project is awaiting client review. Timers are paused until the client responds.' });
    }

    // Stop any running timer for this user
    const runningTimer = dbGet("SELECT * FROM time_entries WHERE user_id = ? AND is_active = 1", [user.id]);
    if (runningTimer) {
        const endTime = nowIST();
        const startTime = new Date(runningTimer.start_time);
        const durationMinutes = Math.max(0, (new Date(endTime) - startTime) / (1000 * 60));

        dbRun(`
            UPDATE time_entries
            SET end_time = ?, duration_minutes = ?, is_active = 0
            WHERE id = ?
        `, [endTime, durationMinutes, runningTimer.id]);

        // Update old task's total time so interrupted session is not lost
        const oldIterTime = dbGet("SELECT SUM(duration_minutes) as total FROM time_entries WHERE iteration_id = ?", [runningTimer.iteration_id]);
        dbRun("UPDATE task_iterations SET total_time_spent = ? WHERE id = ?", [oldIterTime.total || 0, runningTimer.iteration_id]);
        const oldTaskTotal = dbGet("SELECT SUM(duration_minutes) as total FROM time_entries WHERE task_id = ?", [runningTimer.task_id]);
        dbRun("UPDATE tasks SET total_time_spent = ?, status = 'paused', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [oldTaskTotal.total || 0, runningTimer.task_id]);
    }

    // Get current iteration
    let iteration = dbGet("SELECT * FROM task_iterations WHERE task_id = ? AND iteration_number = ?", [id, task.current_iteration]);

    // If no iteration exists, create one automatically
    if (!iteration) {
        console.log(`Creating missing iteration for task ${id}`);
        dbRun(`
            INSERT INTO task_iterations (task_id, iteration_number, iteration_type, assigned_to)
            VALUES (?, 1, 'initial', ?)
        `, [id, user.id]);

        // Get the newly created iteration
        iteration = dbGet("SELECT * FROM task_iterations WHERE task_id = ? AND iteration_number = 1", [id]);

        if (!iteration) {
            return res.status(400).json({ error: 'Failed to create task iteration. Please contact your manager.' });
        }
    }

    // Create new time entry
    const startTime = nowIST();
    const newTimeEntryId = dbInsert(`
        INSERT INTO time_entries (task_id, iteration_id, user_id, start_time, is_active)
        VALUES (?, ?, ?, ?, 1)
    `, [id, iteration.id, user.id, startTime]);

    // Update task status if pending or revision_requested
    if (task.status === 'pending' || task.status === 'revision_requested') {
        dbRun("UPDATE tasks SET status = 'in_progress', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [id]);
    }

    // Update iteration started_at if first start
    if (!iteration.started_at) {
        dbRun("UPDATE task_iterations SET started_at = ? WHERE id = ?", [startTime, iteration.id]);
    }

    // Get the created time entry
    const timeEntry = newTimeEntryId ? dbGet("SELECT * FROM time_entries WHERE id = ?", [newTimeEntryId]) : null;

    res.json({ success: true, timeEntry });
});

// API: Stop timer on task
app.post('/api/tasks/:id/stop-timer', requireAuth, requireRole(['member', 'manager']), (req, res) => {
    const { id } = req.params;
    const user = req.session.user;

    // Find running timer for this user on this task
    const timeEntry = dbGet(`
        SELECT te.*, t.current_iteration 
        FROM time_entries te
        JOIN tasks t ON te.task_id = t.id
        WHERE te.task_id = ? AND te.user_id = ? AND te.is_active = 1
    `, [id, user.id]);

    if (!timeEntry) {
        return res.status(400).json({ error: 'No running timer found for this task' });
    }

    const endTime = nowIST();
    const startTime = new Date(timeEntry.start_time);
    const durationMinutes = Math.max(0, (new Date(endTime) - startTime) / (1000 * 60));

    dbRun(`
        UPDATE time_entries
        SET end_time = ?, duration_minutes = ?, is_active = 0
        WHERE id = ?
    `, [endTime, durationMinutes, timeEntry.id]);

    // Update iteration total time
    const iterTime = dbGet("SELECT SUM(duration_minutes) as total FROM time_entries WHERE iteration_id = ?", [timeEntry.iteration_id]);
    dbRun("UPDATE task_iterations SET total_time_spent = ? WHERE id = ?", [iterTime.total || 0, timeEntry.iteration_id]);

    // Update task total time
    const taskTotalTime = dbGet("SELECT SUM(duration_minutes) as total FROM time_entries WHERE task_id = ?", [id]);
    dbRun("UPDATE tasks SET total_time_spent = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [taskTotalTime.total || 0, id]);

    res.json({ success: true });
});

// API: Pause timer on task (member only)
app.post('/api/tasks/:id/pause-timer', requireAuth, requireRole(['member', 'manager']), (req, res) => {
    const { id } = req.params;
    const { pause_type, pause_remark } = req.body;
    const user = req.session.user;

    const task = dbGet("SELECT * FROM tasks WHERE id = ? AND assigned_to = ?", [id, user.id]);
    if (!task) return res.status(403).json({ error: 'Task not assigned to you' });
    if (task.status !== 'in_progress') return res.status(400).json({ error: 'Task is not in progress' });

    const timeEntry = dbGet("SELECT * FROM time_entries WHERE task_id = ? AND user_id = ? AND is_active = 1", [id, user.id]);
    const endTime = nowIST();

    if (timeEntry) {
        const dur = Math.max(0, (new Date(endTime) - new Date(timeEntry.start_time)) / (1000 * 60));
        dbRun(`UPDATE time_entries SET end_time=?, duration_minutes=?, is_active=0, pause_type=?, remarks=? WHERE id=?`,
            [endTime, dur, pause_type || 'other', pause_remark || null, timeEntry.id]);

        const iterTime = dbGet("SELECT SUM(duration_minutes) as total FROM time_entries WHERE iteration_id=?", [timeEntry.iteration_id]);
        dbRun("UPDATE task_iterations SET total_time_spent=? WHERE id=?", [iterTime.total || 0, timeEntry.iteration_id]);

        const taskTotal = dbGet("SELECT SUM(duration_minutes) as total FROM time_entries WHERE task_id=?", [id]);
        dbRun("UPDATE tasks SET total_time_spent=?, status='paused', updated_at=CURRENT_TIMESTAMP WHERE id=?", [taskTotal.total || 0, id]);
    } else {
        dbRun("UPDATE tasks SET status='paused', updated_at=CURRENT_TIMESTAMP WHERE id=?", [id]);
    }

    saveDatabase();
    res.json({ success: true });
});

// API: Resume a paused task (member only)
app.post('/api/tasks/:id/resume-timer', requireAuth, requireRole(['member', 'manager']), (req, res) => {
    const { id } = req.params;
    const user = req.session.user;

    const task = dbGet("SELECT * FROM tasks WHERE id = ? AND assigned_to = ?", [id, user.id]);
    if (!task) return res.status(403).json({ error: 'Task not assigned to you' });
    if (task.status !== 'paused') return res.status(400).json({ error: 'Task is not paused' });

    const taskProject = dbGet("SELECT status FROM projects WHERE id = ?", [task.project_id]);
    if (taskProject && taskProject.status === 'client_review') {
        return res.status(400).json({ error: 'Project is awaiting client review. Timers are paused until the client responds.' });
    }

    // Stop any other running timer for this user first
    const otherRunning = dbGet("SELECT * FROM time_entries WHERE user_id = ? AND is_active = 1", [user.id]);
    if (otherRunning) {
        const endTime = nowIST();
        const dur = Math.max(0, (new Date(endTime) - new Date(otherRunning.start_time)) / (1000 * 60));
        dbRun(`UPDATE time_entries SET end_time=?, duration_minutes=?, is_active=0 WHERE id=?`, [endTime, dur, otherRunning.id]);
        const oldIterTime = dbGet("SELECT SUM(duration_minutes) as total FROM time_entries WHERE iteration_id=?", [otherRunning.iteration_id]);
        dbRun("UPDATE task_iterations SET total_time_spent=? WHERE id=?", [oldIterTime.total || 0, otherRunning.iteration_id]);
        const oldTaskTotal = dbGet("SELECT SUM(duration_minutes) as total FROM time_entries WHERE task_id=?", [otherRunning.task_id]);
        dbRun("UPDATE tasks SET total_time_spent=?, status='paused', updated_at=CURRENT_TIMESTAMP WHERE id=?", [oldTaskTotal.total || 0, otherRunning.task_id]);
    }

    const iteration = dbGet("SELECT * FROM task_iterations WHERE task_id = ? AND iteration_number = ?", [id, task.current_iteration]);
    if (!iteration) return res.status(400).json({ error: 'Task iteration not found' });

    const startTime = nowIST();
    const newEntryId = dbInsert(
        "INSERT INTO time_entries (task_id, iteration_id, user_id, start_time, is_active) VALUES (?, ?, ?, ?, 1)",
        [id, iteration.id, user.id, startTime]
    );

    dbRun("UPDATE tasks SET status='in_progress', updated_at=CURRENT_TIMESTAMP WHERE id=?", [id]);

    const timeEntry = newEntryId ? dbGet("SELECT * FROM time_entries WHERE id = ?", [newEntryId]) : null;
    saveDatabase();
    res.json({ success: true, timeEntry });
});

// API: Get work sessions for a task
app.get('/api/tasks/:id/sessions', requireAuth, (req, res) => {
    const { id } = req.params;
    const sessions = dbAll(`
        SELECT te.id, te.start_time, te.end_time, te.duration_minutes,
               te.pause_type, te.remarks, te.is_active, u.full_name as user_name
        FROM time_entries te
        JOIN users u ON te.user_id = u.id
        WHERE te.task_id = ?
        ORDER BY te.start_time ASC
    `, [id]);
    res.json(sessions);
});

// API: Auto-pause all timers (called by Electron on system events — localhost only)
app.post('/api/system/auto-pause', (req, res) => {
    const addr = req.socket.remoteAddress;
    const isLocal = addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
    if (!isLocal && req.headers['x-electron-internal'] !== 'true') {
        return res.status(403).json({ error: 'Forbidden' });
    }
    const { reason, server_only } = req.body;
    const count = autoPauseAllTimers(reason || 'Auto-paused', !!server_only);
    res.json({ success: true, paused_count: count });
});

// API: Heartbeat — keeps the user "active" so the inactivity guard doesn't fire
app.post('/api/heartbeat', requireAuth, (req, res) => {
    userLastSeen.set(req.session.user.id, Date.now());
    res.json({ ok: true });
});

// API: Get running timer for current user
app.get('/api/timer/running', requireAuth, (req, res) => {
    const user = req.session.user;

    const runningTimer = dbGet(`
        SELECT te.*, t.task_title, t.current_iteration, p.project_name
        FROM time_entries te
        JOIN tasks t ON te.task_id = t.id
        JOIN projects p ON t.project_id = p.id
        WHERE te.user_id = ? AND te.is_active = 1
    `, [user.id]);

    res.json(runningTimer || null);
});

// API: Submit task
app.post('/api/tasks/:id/submit', requireAuth, requireRole(['member', 'manager']), upload.array('files', 10), (req, res) => {
    const { id } = req.params;
    const { remarks } = req.body;
    const user = req.session.user;

    // Check if task is assigned to this user
    const task = dbGet("SELECT * FROM tasks WHERE id = ? AND assigned_to = ?", [id, user.id]);
    if (!task) {
        return res.status(403).json({ error: 'Task not assigned to you' });
    }

    // Stop timer if running
    const runningTimer = dbGet("SELECT * FROM time_entries WHERE task_id = ? AND user_id = ? AND is_active = 1", [id, user.id]);
    if (runningTimer) {
        const endTime = nowIST();
        const startTime = new Date(runningTimer.start_time);
        const durationMinutes = Math.max(0, (new Date(endTime) - startTime) / (1000 * 60));

        dbRun(`
            UPDATE time_entries
            SET end_time = ?, duration_minutes = ?, is_active = 0
            WHERE id = ?
        `, [endTime, durationMinutes, runningTimer.id]);

        // Update iteration total time
        const iterTime = dbGet("SELECT SUM(duration_minutes) as total FROM time_entries WHERE iteration_id = ?", [runningTimer.iteration_id]);
        dbRun("UPDATE task_iterations SET total_time_spent = ? WHERE id = ?", [iterTime.total || 0, runningTimer.iteration_id]);

        // Update task total time
        const taskTotalTime = dbGet("SELECT SUM(duration_minutes) as total FROM time_entries WHERE task_id = ?", [id]);
        dbRun("UPDATE tasks SET total_time_spent = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [taskTotalTime.total || 0, id]);
    }

    // Get current iteration
    const iteration = dbGet("SELECT * FROM task_iterations WHERE task_id = ? AND iteration_number = ?", [id, task.current_iteration]);

    // Update iteration
    const submittedAt = nowIST();
    dbRun(`
        UPDATE task_iterations 
        SET submitted_at = ?, member_remarks = ?, review_status = 'pending'
        WHERE id = ?
    `, [submittedAt, remarks, iteration.id]);

    // Update task status
    dbRun("UPDATE tasks SET status = 'submitted', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [id]);

    // Save any uploaded files linked to this task + iteration
    const uploadedFiles = req.files || [];
    const taskProj = dbGet('SELECT project_code FROM projects WHERE id = ?', [task.project_id]);
    for (const file of uploadedFiles) {
        const filePath = saveUploadedFile(taskProj ? taskProj.project_code : task.project_id, file.originalname, file.buffer);
        dbInsert(`
            INSERT INTO file_attachments (project_id, task_id, iteration_id, uploaded_by, file_name, file_path, file_size, file_type, upload_type, description)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'deliverable', 'Submitted with task')
        `, [task.project_id, id, iteration.id, user.id, file.originalname, filePath, file.size, file.mimetype]);
    }

    // Get project manager to notify
    const project = dbGet("SELECT manager_id, project_name FROM projects WHERE id = ?", [task.project_id]);

    // Notify manager
    dbRun(`
        INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id)
        VALUES (?, 'task_submitted', 'Task submitted for review', ?, 'task', ?)
    `, [project.manager_id, `${user.fullName} submitted "${task.task_title}" for review`, id]);

    // Log activity
    dbRun(`
            INSERT INTO activity_log (user_id, action, entity_type, entity_id, details)
            VALUES (?, 'submitted', 'task', ?, ?)
        `, [user.id, id, JSON.stringify({ task_title: task.task_title })]);

    res.json({ success: true });
});

// API: Get files attached to a task
app.get('/api/tasks/:id/files', requireAuth, (req, res) => {
    const { id } = req.params;
    const files = dbAll(`
        SELECT f.*, u.full_name as uploaded_by_name
        FROM file_attachments f
        LEFT JOIN users u ON f.uploaded_by = u.id
        WHERE f.task_id = ?
        ORDER BY f.created_at DESC
    `, [id]);
    res.json(files);
});

// API: Download a task file
app.get('/api/tasks/:id/files/:fileId/download', requireAuth, (req, res) => {
    const { id, fileId } = req.params;
    const file = dbGet("SELECT * FROM file_attachments WHERE id = ? AND task_id = ?", [fileId, id]);
    if (!file) return res.status(404).json({ error: 'File not found' });
    const filePath = path.join(uploadsDir, file.file_path);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on server' });
    res.download(filePath, file.file_name);
});

// API: Review task (approve or request revision)
app.post('/api/tasks/:id/review', requireAuth, requireRole(['admin', 'manager']), (req, res) => {
    const { id } = req.params;
    const { action, remarks, revision_reason } = req.body; // action: 'approve' or 'revision'
    const user = req.session.user;

    const task = dbGet("SELECT * FROM tasks WHERE id = ?", [id]);
    if (!task) {
        return res.status(404).json({ error: 'Task not found' });
    }

    // Check manager access
    if (user.role === 'manager' && !isProjectManager(user.id, task.project_id)) {
        return res.status(403).json({ error: 'Access denied' });
    }

    if (action === 'approve') {
        // Approve task
        const completedAt = nowIST();

        dbRun("UPDATE tasks SET status = 'completed', actual_end_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [completedAt, id]);

        // Update iteration review status
        const iteration = dbGet("SELECT * FROM task_iterations WHERE task_id = ? AND iteration_number = ?", [id, task.current_iteration]);
        dbRun(`
            UPDATE task_iterations 
            SET review_status = 'approved', review_remarks = ?, reviewed_at = ?
            WHERE id = ?
        `, [remarks, completedAt, iteration.id]);

        // Notify member
        dbRun(`
            INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id)
            VALUES (?, 'task_completed', 'Task approved', ?, 'task', ?)
        `, [task.assigned_to, `Your task "${task.task_title}" has been approved`, id]);

        // Log activity
        dbRun(`
            INSERT INTO activity_log (user_id, action, entity_type, entity_id, details)
            VALUES (?, 'approved', 'task', ?, ?)
        `, [user.id, id, JSON.stringify({ task_title: task.task_title })]);

    } else if (action === 'revision') {
        // Request revision - create new iteration
        const reviewedAt = nowIST();

        // Update current iteration
        const iteration = dbGet("SELECT * FROM task_iterations WHERE task_id = ? AND iteration_number = ?", [id, task.current_iteration]);
        dbRun(`
            UPDATE task_iterations 
            SET review_status = 'revision_requested', review_remarks = ?, reviewed_at = ?
            WHERE id = ?
        `, [remarks, reviewedAt, iteration.id]);

        // Create new iteration
        const newIterationNum = task.current_iteration + 1;
        dbRun(`
            INSERT INTO task_iterations (task_id, iteration_number, iteration_type, revision_reason, assigned_to)
            VALUES (?, ?, 'revision', ?, ?)
        `, [id, newIterationNum, revision_reason, task.assigned_to]);

        // Update task
        dbRun("UPDATE tasks SET status = 'revision_requested', current_iteration = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [newIterationNum, id]);

        // Notify member
        dbRun(`
            INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id)
            VALUES (?, 'revision_requested', 'Revision requested', ?, 'task', ?)
        `, [task.assigned_to, `Revision requested for "${task.task_title}": ${revision_reason}`, id]);

        // Log activity
        dbRun(`
            INSERT INTO activity_log (user_id, action, entity_type, entity_id, details)
            VALUES (?, 'revision_requested', 'task', ?, ?)
        `, [user.id, id, JSON.stringify({ task_title: task.task_title, revision_reason })]);
    }

    res.json({ success: true });
});

// API: Get members (for task assignment) — includes calling manager as assignable worker
app.get('/api/members', requireAuth, requireRole(['admin', 'manager']), (req, res) => {
    const user = req.session.user;
    const members = dbAll("SELECT id, full_name, email, role FROM users WHERE role = 'member' AND is_active = 1 ORDER BY full_name");
    // Prepend the manager themselves so they can self-assign
    if (user.role === 'manager') {
        const self = dbGet("SELECT id, full_name, email, role FROM users WHERE id = ?", [user.id]);
        if (self) members.unshift({ ...self, _isSelf: true });
    }
    res.json(members);
});

// API: Get managers (for project assignment)
app.get('/api/managers', requireAuth, requireRole(['admin']), (req, res) => {
    const managers = dbAll("SELECT id, full_name, email FROM users WHERE role = 'manager' AND is_active = 1");
    res.json(managers);
});

// API: Get notifications
app.get('/api/notifications', requireAuth, (req, res) => {
    const user = req.session.user;
    const notifications = dbAll(`
        SELECT * FROM notifications 
        WHERE user_id = ? 
        ORDER BY created_at DESC 
        LIMIT 50
    `, [user.id]);
    res.json(notifications);
});

// API: Mark notification as read
app.put('/api/notifications/:id/read', requireAuth, (req, res) => {
    const { id } = req.params;
    const user = req.session.user;

    dbRun("UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?", [id, user.id]);
    res.json({ success: true });
});

// API: Get unread notification count
app.get('/api/notifications/unread-count', requireAuth, (req, res) => {
    const user = req.session.user;
    const result = dbGet("SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0", [user.id]);
    res.json({ count: result.count });
});

// API: Get dashboard stats
app.get('/api/dashboard/stats', requireAuth, (req, res) => {
    const user = req.session.user;
    let stats = {};

    if (user.role === 'admin') {
        stats.totalProjects = dbGet("SELECT COUNT(*) as count FROM projects WHERE status != 'archived'").count;
        stats.activeProjects = dbGet("SELECT COUNT(*) as count FROM projects WHERE status = 'in_progress'").count;
        stats.totalTasks = dbGet("SELECT COUNT(*) as count FROM tasks").count;
        stats.pendingReviews = dbGet("SELECT COUNT(*) as count FROM tasks WHERE status = 'submitted'").count;
        const statusRows = dbAll("SELECT status, COUNT(*) as count FROM tasks GROUP BY status");
        stats.taskStatusCounts = {};
        for (const r of statusRows) stats.taskStatusCounts[r.status] = r.count;
    } else if (user.role === 'manager') {
        stats.totalProjects = dbGet(`SELECT COUNT(*) as count FROM projects WHERE (manager_id = ? OR id IN (SELECT project_id FROM project_managers WHERE user_id = ?)) AND status != 'archived'`, [user.id, user.id]).count;
        stats.activeProjects = dbGet(`SELECT COUNT(*) as count FROM projects WHERE (manager_id = ? OR id IN (SELECT project_id FROM project_managers WHERE user_id = ?)) AND status = 'in_progress'`, [user.id, user.id]).count;
        stats.totalTasks = dbGet(`
            SELECT COUNT(*) as count FROM tasks t
            JOIN projects p ON t.project_id = p.id
            WHERE (p.manager_id = ? OR p.id IN (SELECT project_id FROM project_managers WHERE user_id = ?))
        `, [user.id, user.id]).count;
        stats.pendingReviews = dbGet(`
            SELECT COUNT(*) as count FROM tasks t
            JOIN projects p ON t.project_id = p.id
            WHERE (p.manager_id = ? OR p.id IN (SELECT project_id FROM project_managers WHERE user_id = ?)) AND t.status = 'submitted'
        `, [user.id, user.id]).count;
        const statusRows = dbAll(`
            SELECT t.status, COUNT(*) as count FROM tasks t
            JOIN projects p ON t.project_id = p.id
            WHERE (p.manager_id = ? OR p.id IN (SELECT project_id FROM project_managers WHERE user_id = ?)) GROUP BY t.status
        `, [user.id, user.id]);
        stats.taskStatusCounts = {};
        for (const r of statusRows) stats.taskStatusCounts[r.status] = r.count;
    } else {
        stats.myTasks = dbGet("SELECT COUNT(*) as count FROM tasks WHERE assigned_to = ?", [user.id]).count;
        stats.pendingTasks = dbGet("SELECT COUNT(*) as count FROM tasks WHERE assigned_to = ? AND status IN ('pending', 'revision_requested')", [user.id]).count;
        stats.completedTasks = dbGet("SELECT COUNT(*) as count FROM tasks WHERE assigned_to = ? AND status = 'completed'", [user.id]).count;

        // Today's time (IST date)
        const today = todayIST();
        const todayTime = dbGet(`
            SELECT SUM(duration_minutes) as total
            FROM time_entries
            WHERE user_id = ? AND date(start_time) = ?
        `, [user.id, today]);
        stats.todayMinutes = todayTime.total || 0;

        // Weekly time (last 7 days) for bar chart
        const weeklyRows = dbAll(`
            SELECT date(start_time) as day, SUM(duration_minutes) as total
            FROM time_entries
            WHERE user_id = ? AND date(start_time) >= date('now', '-6 days')
            GROUP BY date(start_time)
        `, [user.id]);
        const weeklyMap = {};
        for (const r of weeklyRows) weeklyMap[r.day] = r.total || 0;
        stats.weeklyTime = [];
        stats.weeklyLabels = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const pad = n => String(n).padStart(2, '0');
            const dayStr = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
            stats.weeklyTime.push(Math.round((weeklyMap[dayStr] || 0) / 60 * 10) / 10);
            stats.weeklyLabels.push(d.toLocaleDateString('en', { weekday: 'short' }));
        }
    }

    res.json(stats);
});

// API: Get time entries for current user
app.get('/api/time-entries', requireAuth, (req, res) => {
    const user = req.session.user;
    let entries;

    if (user.role === 'admin') {
        entries = dbAll(`
            SELECT te.*, t.task_title, p.project_name, u.full_name as member_name
            FROM time_entries te
            JOIN tasks t ON te.task_id = t.id
            JOIN projects p ON t.project_id = p.id
            JOIN users u ON te.user_id = u.id
            ORDER BY te.start_time DESC
            LIMIT 200
        `);
    } else if (user.role === 'manager') {
        entries = dbAll(`
            SELECT te.*, t.task_title, p.project_name, u.full_name as member_name
            FROM time_entries te
            JOIN tasks t ON te.task_id = t.id
            JOIN projects p ON t.project_id = p.id
            JOIN users u ON te.user_id = u.id
            WHERE (p.manager_id = ? OR p.id IN (SELECT project_id FROM project_managers WHERE user_id = ?))
            ORDER BY te.start_time DESC
            LIMIT 200
        `, [user.id, user.id]);
    } else {
        entries = dbAll(`
            SELECT te.*, t.task_title, p.project_name, u.full_name as member_name
            FROM time_entries te
            JOIN tasks t ON te.task_id = t.id
            JOIN projects p ON t.project_id = p.id
            JOIN users u ON te.user_id = u.id
            WHERE te.user_id = ?
            ORDER BY te.start_time DESC
            LIMIT 200
        `, [user.id]);
    }

    res.json(entries);
});

// ==================== REPORTS API ====================

// API: Project Time Report
app.get('/api/reports/project-time', requireAuth, requireRole(['admin', 'manager']), (req, res) => {
    const user = req.session.user;
    const { project_id } = req.query;

    let projects;
    if (user.role === 'admin') {
        projects = dbAll(`
            SELECT p.id, p.project_name, p.project_code, p.status,
                   u.full_name as manager_name,
                   (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) as total_tasks,
                   (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND status = 'completed') as completed_tasks,
                   (SELECT SUM(total_time_spent) FROM tasks WHERE project_id = p.id) as total_time_minutes,
                   (SELECT COALESCE(SUM(review_minutes),0) FROM project_reviews WHERE project_id = p.id AND responded_at IS NOT NULL) as client_review_minutes,
                   (SELECT COUNT(*) FROM project_reviews WHERE project_id = p.id) as review_cycles
            FROM projects p
            LEFT JOIN users u ON p.manager_id = u.id
            WHERE p.status != 'archived'
            ${project_id ? 'AND p.id = ?' : ''}
            ORDER BY p.created_at DESC
        `, project_id ? [project_id] : []);
    } else {
        projects = dbAll(`
            SELECT p.id, p.project_name, p.project_code, p.status,
                   u.full_name as manager_name,
                   (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) as total_tasks,
                   (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND status = 'completed') as completed_tasks,
                   (SELECT SUM(total_time_spent) FROM tasks WHERE project_id = p.id) as total_time_minutes,
                   (SELECT COALESCE(SUM(review_minutes),0) FROM project_reviews WHERE project_id = p.id AND responded_at IS NOT NULL) as client_review_minutes,
                   (SELECT COUNT(*) FROM project_reviews WHERE project_id = p.id) as review_cycles
            FROM projects p
            LEFT JOIN users u ON p.manager_id = u.id
            WHERE (p.manager_id = ? OR p.id IN (SELECT project_id FROM project_managers WHERE user_id = ?)) AND p.status != 'archived'
            ${project_id ? 'AND p.id = ?' : ''}
            ORDER BY p.created_at DESC
        `, project_id ? [user.id, user.id, project_id] : [user.id, user.id]);
    }

    // Get task breakdown for each project
    for (let project of projects) {
        project.tasks = dbAll(`
            SELECT t.id, t.task_title, t.status, t.total_time_spent, t.current_iteration,
                   u.full_name as assigned_to_name,
                   (SELECT COUNT(*) FROM task_iterations WHERE task_id = t.id) as iteration_count
            FROM tasks t
            LEFT JOIN users u ON t.assigned_to = u.id
            WHERE t.project_id = ?
            ORDER BY t.created_at DESC
        `, [project.id]);

        // Calculate initial vs revision time
        for (let task of project.tasks) {
            const initialTime = dbGet(`
                SELECT SUM(total_time_spent) as total 
                FROM task_iterations 
                WHERE task_id = ? AND iteration_type = 'initial'
            `, [task.id]);

            const revisionTime = dbGet(`
                SELECT SUM(total_time_spent) as total 
                FROM task_iterations 
                WHERE task_id = ? AND iteration_type = 'revision'
            `, [task.id]);

            task.initial_time = initialTime.total || 0;
            task.revision_time = revisionTime.total || 0;
        }
    }

    res.json(projects);
});

// API: Member Time Report
app.get('/api/reports/member-time', requireAuth, requireRole(['admin', 'manager']), (req, res) => {
    const user = req.session.user;
    const { start_date, end_date, member_id } = req.query;

    let members;
    if (user.role === 'admin') {
        members = dbAll(`
            SELECT u.id, u.full_name, u.email,
                   (SELECT COUNT(*) FROM tasks WHERE assigned_to = u.id) as total_tasks,
                   (SELECT COUNT(*) FROM tasks WHERE assigned_to = u.id AND status = 'completed') as completed_tasks,
                   (SELECT SUM(duration_minutes) FROM time_entries WHERE user_id = u.id) as total_time_minutes
            FROM users u
            WHERE u.role = 'member' AND u.is_active = 1
            ${member_id ? 'AND u.id = ?' : ''}
            ORDER BY u.full_name
        `, member_id ? [member_id] : []);
    } else {
        // Manager sees only their team members
        members = dbAll(`
            SELECT DISTINCT u.id, u.full_name, u.email,
                   (SELECT COUNT(*) FROM tasks WHERE assigned_to = u.id) as total_tasks,
                   (SELECT COUNT(*) FROM tasks WHERE assigned_to = u.id AND status = 'completed') as completed_tasks,
                   (SELECT SUM(te.duration_minutes) FROM time_entries te
                    JOIN tasks t ON te.task_id = t.id
                    JOIN projects p ON t.project_id = p.id
                    WHERE te.user_id = u.id AND p.manager_id = ?) as total_time_minutes
            FROM users u
            JOIN tasks t ON u.id = t.assigned_to
            JOIN projects p ON t.project_id = p.id
            WHERE u.role = 'member' AND u.is_active = 1 AND p.manager_id = ?
            ${member_id ? 'AND u.id = ?' : ''}
            ORDER BY u.full_name
        `, member_id ? [user.id, user.id, member_id] : [user.id, user.id]);
    }

    // Get daily breakdown for each member
    for (let member of members) {
        let timeQuery = `
            SELECT date(te.start_time) as work_date,
                   SUM(te.duration_minutes) as daily_minutes,
                   COUNT(*) as entries_count
            FROM time_entries te
            WHERE te.user_id = ?
        `;
        const params = [member.id];

        if (start_date) {
            timeQuery += ` AND date(te.start_time) >= ?`;
            params.push(start_date);
        }
        if (end_date) {
            timeQuery += ` AND date(te.start_time) <= ?`;
            params.push(end_date);
        }

        timeQuery += ` GROUP BY date(te.start_time) ORDER BY work_date DESC`;

        member.dailyBreakdown = dbAll(timeQuery, params);
    }

    res.json(members);
});

// API: Member Detail Report — working time + pause breakdown per member
app.get('/api/reports/member-detail/:id', requireAuth, requireRole(['admin', 'manager']), (req, res) => {
    const { id } = req.params;
    const { start_date, end_date } = req.query;
    const user = req.session.user;

    // Access check: managers can only see their own team members
    const member = dbGet("SELECT id, full_name, email, role, joining_date FROM users WHERE id = ? AND is_active = 1", [id]);
    if (!member) return res.status(404).json({ error: 'Member not found' });
    if (user.role === 'manager') {
        const inTeam = dbGet(`
            SELECT 1 FROM tasks t JOIN projects p ON t.project_id = p.id
            WHERE t.assigned_to = ? AND p.manager_id = ? LIMIT 1
        `, [id, user.id]);
        if (!inTeam) return res.status(403).json({ error: 'Access denied' });
    }

    // Build date filter clause
    const dateClauses = [];
    const baseParams = [Number(id)];
    if (start_date) { dateClauses.push("AND date(te.start_time) >= ?"); baseParams.push(start_date); }
    if (end_date)   { dateClauses.push("AND date(te.start_time) <= ?"); baseParams.push(end_date); }
    const dateFilter = dateClauses.join(' ');

    // All completed entries for this member in range, ordered so same-iteration entries are consecutive
    const entries = dbAll(`
        SELECT te.id, te.iteration_id, te.task_id, te.start_time, te.end_time,
               te.duration_minutes, te.pause_type,
               t.task_title, t.status as task_status,
               p.project_name
        FROM time_entries te
        JOIN tasks t ON te.task_id = t.id
        JOIN projects p ON t.project_id = p.id
        WHERE te.user_id = ? AND te.is_active = 0 AND te.end_time IS NOT NULL
        ${dateFilter}
        ORDER BY te.iteration_id, te.start_time ASC
    `, baseParams);

    // Compute pause-gap breakdown
    let workingMin = 0, breakMin = 0, meetingMin = 0, doneForDayMin = 0, otherMin = 0, autoMin = 0, onCallMin = 0;
    const taskMap = {};   // task_id → { task_title, project_name, task_status, working_minutes }
    const dayMap  = {};   // 'YYYY-MM-DD' → { working, break, meeting, done_for_day, other, auto, on_call }

    for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        const dur = Math.max(0, e.duration_minutes || 0);
        workingMin += dur;

        const dayKey = e.start_time ? e.start_time.substring(0, 10) : null;
        if (dayKey) {
            if (!dayMap[dayKey]) dayMap[dayKey] = { working: 0, break: 0, meeting: 0, done_for_day: 0, other: 0, auto: 0, on_call: 0 };
            dayMap[dayKey].working += dur;
        }

        if (!taskMap[e.task_id]) taskMap[e.task_id] = { task_title: e.task_title, project_name: e.project_name, task_status: e.task_status, working_minutes: 0 };
        taskMap[e.task_id].working_minutes += dur;

        // Gap to next entry in same iteration
        const next = entries[i + 1];
        if (e.pause_type && next && next.iteration_id === e.iteration_id && e.end_time && next.start_time) {
            const gap = Math.max(0, (new Date(next.start_time) - new Date(e.end_time)) / (1000 * 60));
            if (e.pause_type === 'break')        { breakMin += gap;      if (dayKey) dayMap[dayKey].break += gap; }
            else if (e.pause_type === 'meeting') { meetingMin += gap;    if (dayKey) dayMap[dayKey].meeting += gap; }
            else if (e.pause_type === 'done_for_day') { doneForDayMin += gap; if (dayKey) dayMap[dayKey].done_for_day += gap; }
            else if (e.pause_type === 'on_call') { onCallMin += gap;     if (dayKey) dayMap[dayKey].on_call += gap; }
            else if (e.pause_type === 'other')   { otherMin += gap;      if (dayKey) dayMap[dayKey].other += gap; }
            else if (e.pause_type === 'auto')    { autoMin += gap;       if (dayKey) dayMap[dayKey].auto += gap; }
        }
    }

    const tasks = Object.entries(taskMap).map(([task_id, v]) => ({ task_id: Number(task_id), ...v }))
        .sort((a, b) => b.working_minutes - a.working_minutes);

    const daily = Object.entries(dayMap)
        .map(([work_date, v]) => ({ work_date, ...v }))
        .sort((a, b) => b.work_date.localeCompare(a.work_date));

    // Task counts (across all time, not filtered by date range for accuracy)
    const counts = dbGet(`
        SELECT COUNT(*) as total_tasks,
               SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed_tasks,
               SUM(CASE WHEN status='in_progress' THEN 1 ELSE 0 END) as in_progress_tasks
        FROM tasks WHERE assigned_to = ?
    `, [id]);

    res.json({
        member,
        summary: {
            working_minutes:     Math.round(workingMin),
            break_minutes:       Math.round(breakMin),
            meeting_minutes:     Math.round(meetingMin),
            done_for_day_minutes: Math.round(doneForDayMin),
            on_call_minutes:     Math.round(onCallMin),
            other_minutes:       Math.round(otherMin),
            auto_minutes:        Math.round(autoMin),
            total_tasks:         counts?.total_tasks || 0,
            completed_tasks:     counts?.completed_tasks || 0,
            in_progress_tasks:   counts?.in_progress_tasks || 0,
            active_days:         daily.length,
        },
        tasks,
        daily,
    });
});

// API: Members list for report dropdowns (all non-client active users)
app.get('/api/reports/members-list', requireAuth, requireRole(['admin', 'manager']), (req, res) => {
    const user = req.session.user;
    let members;
    if (user.role === 'admin') {
        members = dbAll(
            "SELECT id, full_name, email FROM users WHERE role != 'client' AND is_active = 1 ORDER BY full_name"
        );
    } else {
        members = dbAll(`
            SELECT DISTINCT u.id, u.full_name, u.email
            FROM users u
            JOIN tasks t ON u.id = t.assigned_to
            JOIN projects p ON t.project_id = p.id
            WHERE u.role != 'client' AND u.is_active = 1
              AND (p.manager_id = ? OR p.id IN (SELECT project_id FROM project_managers WHERE user_id = ?))
            ORDER BY u.full_name
        `, [user.id, user.id]);
    }
    res.json(members);
});

// API: Individual Member Timeline (detailed timestamps)
app.get('/api/reports/member-timeline/:id', requireAuth, requireRole(['admin', 'manager']), (req, res) => {
    const { id } = req.params;
    const { start_date, end_date } = req.query;
    const user = req.session.user;

    const member = dbGet("SELECT id, full_name, email, role, joining_date FROM users WHERE id = ? AND is_active = 1", [id]);
    if (!member) return res.status(404).json({ error: 'Member not found' });
    if (user.role === 'manager') {
        const inTeam = dbGet(`
            SELECT 1 FROM tasks t JOIN projects p ON t.project_id = p.id
            WHERE t.assigned_to = ? AND p.manager_id = ? LIMIT 1
        `, [id, user.id]);
        if (!inTeam) return res.status(403).json({ error: 'Access denied' });
    }

    const dateClauses = [];
    const params = [Number(id)];
    if (start_date) { dateClauses.push("AND date(te.start_time) >= ?"); params.push(start_date); }
    if (end_date)   { dateClauses.push("AND date(te.start_time) <= ?"); params.push(end_date); }
    const dateFilter = dateClauses.join(' ');

    // Fetch all completed entries ordered chronologically
    const entries = dbAll(`
        SELECT te.id, te.iteration_id, te.task_id, te.start_time, te.end_time,
               te.duration_minutes, te.pause_type,
               t.task_title, t.status AS task_status,
               p.project_name
        FROM time_entries te
        JOIN tasks t ON te.task_id = t.id
        JOIN projects p ON t.project_id = p.id
        WHERE te.user_id = ? AND te.is_active = 0 AND te.end_time IS NOT NULL
        ${dateFilter}
        ORDER BY te.start_time ASC
    `, params);

    // Index entries by iteration so we can find the next sibling quickly
    const byIteration = {};
    entries.forEach(e => {
        if (!byIteration[e.iteration_id]) byIteration[e.iteration_id] = [];
        byIteration[e.iteration_id].push(e);
    });

    // Build flat timeline: work segments + interleaved pause events
    const timeline = [];
    entries.forEach(e => {
        timeline.push({
            type: 'work',
            start_time: e.start_time,
            end_time: e.end_time,
            duration_minutes: Math.max(0, Math.round((e.duration_minutes || 0) * 10) / 10),
            task_title: e.task_title,
            project_name: e.project_name,
            task_status: e.task_status,
            task_id: e.task_id,
            iteration_id: e.iteration_id,
        });

        if (e.pause_type && e.end_time) {
            const iterList = byIteration[e.iteration_id];
            const pos = iterList.indexOf(e);
            const next = iterList[pos + 1];
            if (next && next.start_time) {
                const gapMin = Math.max(0, (new Date(next.start_time) - new Date(e.end_time)) / 60000);
                if (gapMin > 0) {
                    timeline.push({
                        type: e.pause_type,   // 'break' | 'meeting' | 'done_for_day' | 'other' | 'auto'
                        start_time: e.end_time,
                        end_time: next.start_time,
                        duration_minutes: Math.round(gapMin * 10) / 10,
                        task_title: e.task_title,
                        project_name: e.project_name,
                        task_id: e.task_id,
                        iteration_id: e.iteration_id,
                    });
                }
            }
        }
    });

    // Final sort by start_time (pause events may be out-of-order relative to cross-iteration work)
    timeline.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

    res.json({ member, timeline });
});

// API: Task Iteration Report
app.get('/api/reports/task-iterations', requireAuth, requireRole(['admin', 'manager']), (req, res) => {
    const user = req.session.user;
    const { project_id } = req.query;

    let tasks;
    if (user.role === 'admin') {
        tasks = dbAll(`
            SELECT t.*, t.task_category, p.project_name, p.project_code, u.full_name as assigned_to_name
            FROM tasks t
            LEFT JOIN projects p ON t.project_id = p.id
            LEFT JOIN users u ON t.assigned_to = u.id
            ${project_id ? 'WHERE t.project_id = ?' : ''}
            ORDER BY t.created_at DESC
        `, project_id ? [project_id] : []);
    } else {
        tasks = dbAll(`
            SELECT t.*, t.task_category, p.project_name, p.project_code, u.full_name as assigned_to_name
            FROM tasks t
            LEFT JOIN projects p ON t.project_id = p.id
            LEFT JOIN users u ON t.assigned_to = u.id
            WHERE p.manager_id = ?
            ${project_id ? 'AND t.project_id = ?' : ''}
            ORDER BY t.created_at DESC
        `, project_id ? [user.id, project_id] : [user.id]);
    }

    // Get iteration details for each task
    for (let task of tasks) {
        task.iterations = dbAll(`
            SELECT ti.*,
                   u.full_name as assigned_to_name
            FROM task_iterations ti
            LEFT JOIN users u ON ti.assigned_to = u.id
            WHERE ti.task_id = ?
            ORDER BY ti.iteration_number ASC
        `, [task.id]);

        // Calculate revision cost
        const revisionIterations = task.iterations.filter(i => i.iteration_type === 'revision');
        task.revision_count = revisionIterations.length;
        task.revision_time = revisionIterations.reduce((sum, i) => sum + (i.total_time_spent || 0), 0);
        task.initial_time = task.iterations.find(i => i.iteration_type === 'initial')?.total_time_spent || 0;
    }

    res.json(tasks);
});

// API: Project Progress Report
app.get('/api/reports/project-progress', requireAuth, requireRole(['admin', 'manager']), (req, res) => {
    const user = req.session.user;

    let projects;
    if (user.role === 'admin') {
        projects = dbAll(`
            SELECT p.*, u.full_name as manager_name
            FROM projects p
            LEFT JOIN users u ON p.manager_id = u.id
            WHERE p.status != 'archived'
            ORDER BY p.created_at DESC
        `);
    } else {
        projects = dbAll(`
            SELECT p.*, u.full_name as manager_name
            FROM projects p
            LEFT JOIN users u ON p.manager_id = u.id
            WHERE p.manager_id = ? AND p.status != 'archived'
            ORDER BY p.created_at DESC
        `, [user.id]);
    }

    // Get progress stats for each project
    for (let project of projects) {
        const taskStats = dbGet(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN status = 'submitted' THEN 1 ELSE 0 END) as submitted,
                SUM(CASE WHEN status = 'revision_requested' THEN 1 ELSE 0 END) as revision_requested,
                SUM(CASE WHEN due_date < date('now', '+5 hours', '+30 minutes') AND status NOT IN ('completed', 'cancelled') THEN 1 ELSE 0 END) as overdue
            FROM tasks 
            WHERE project_id = ?
        `, [project.id]);

        project.task_stats = taskStats;
        project.progress_percent = taskStats.total > 0 ? Math.round((taskStats.completed / taskStats.total) * 100) : 0;

        // Get total time spent
        const timeSpent = dbGet(`
            SELECT SUM(total_time_spent) as total FROM tasks WHERE project_id = ?
        `, [project.id]);
        project.total_time_minutes = timeSpent.total || 0;
    }

    res.json(projects);
});

// API: Individual Project Detail Report
app.get('/api/reports/project-detail/:id', requireAuth, requireRole(['admin', 'manager']), (req, res) => {
    const { id } = req.params;
    const user = req.session.user;

    const project = dbGet(`
        SELECT p.*, u.full_name as manager_name, cb.full_name as created_by_name
        FROM projects p
        LEFT JOIN users u  ON p.manager_id  = u.id
        LEFT JOIN users cb ON p.created_by   = cb.id
        WHERE p.id = ?
    `, [id]);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    if (user.role === 'manager' && project.manager_id !== user.id)
        return res.status(403).json({ error: 'Access denied' });

    // Member efforts: total time per task (ALL iterations combined — internal revisions included)
    const memberEfforts = dbAll(`
        SELECT
            t.id            as task_id,
            t.task_title,
            t.status        as task_status,
            t.task_category,
            t.due_date,
            u.full_name     as member_name,
            COUNT(DISTINCT ti.id)                                            as total_iterations,
            COALESCE(SUM(te.duration_minutes), 0)                           as total_minutes
        FROM tasks t
        JOIN users u ON t.assigned_to = u.id
        LEFT JOIN task_iterations ti ON ti.task_id = t.id
        LEFT JOIN time_entries te   ON te.task_id  = t.id AND te.duration_minutes IS NOT NULL
        WHERE t.project_id = ?
        GROUP BY t.id
        ORDER BY t.created_at ASC
    `, [id]);

    // Client review cycles (chronological)
    const reviewCycles = dbAll(`
        SELECT pr.*, u.full_name as submitted_by_name
        FROM project_reviews pr
        LEFT JOIN users u ON pr.submitted_by = u.id
        WHERE pr.project_id = ?
        ORDER BY pr.submitted_at ASC
    `, [id]);

    // For each cycle where client requested revision, find task iterations
    // created AFTER responded_at and BEFORE the next cycle's submitted_at
    for (let i = 0; i < reviewCycles.length; i++) {
        const cycle = reviewCycles[i];
        if (cycle.response_type === 'revision_requested' && cycle.responded_at) {
            const nextStart = reviewCycles[i + 1] ? reviewCycles[i + 1].submitted_at : null;
            cycle.revision_work = dbAll(`
                SELECT
                    ti.id, ti.iteration_number, ti.created_at,
                    t.task_title,
                    u.full_name                           as member_name,
                    COALESCE(SUM(te.duration_minutes), 0) as revision_minutes
                FROM task_iterations ti
                JOIN tasks t ON ti.task_id    = t.id
                JOIN users u ON ti.assigned_to = u.id
                LEFT JOIN time_entries te ON te.iteration_id = ti.id AND te.duration_minutes IS NOT NULL
                WHERE t.project_id = ?
                  AND ti.iteration_type = 'revision'
                  AND ti.created_at > ?
                  ${nextStart ? 'AND ti.created_at < ?' : ''}
                GROUP BY ti.id
                ORDER BY ti.created_at ASC
            `, nextStart ? [id, cycle.responded_at, nextStart] : [id, cycle.responded_at]);
        } else {
            cycle.revision_work = [];
        }
    }

    const totalTeamMins   = memberEfforts.reduce((s, t) => s + (t.total_minutes || 0), 0);
    const totalClientMins = reviewCycles.reduce((s, r) => s + (r.review_minutes  || 0), 0);

    res.json({
        project,
        summary: {
            total_team_minutes:          totalTeamMins,
            total_client_review_minutes: totalClientMins,
            total_tasks:                 memberEfforts.length,
            completed_tasks:             memberEfforts.filter(t => t.task_status === 'completed').length,
            total_review_cycles:         reviewCycles.length,
            has_open_review:             reviewCycles.some(r => !r.responded_at)
        },
        member_efforts: memberEfforts,
        review_cycles:  reviewCycles
    });
});

// API: Export Report (CSV format)
app.get('/api/reports/export', requireAuth, requireRole(['admin', 'manager']), (req, res) => {
    const user = req.session.user;
    const { type, project_id, start_date, end_date } = req.query;

    let data = [];
    let filename = 'report.csv';

    if (type === 'project-time') {
        const projects = dbAll(`
            SELECT p.project_name, p.project_code, p.status, u.full_name as manager_name,
                   (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) as total_tasks,
                   (SELECT SUM(total_time_spent) FROM tasks WHERE project_id = p.id) as total_minutes,
                   (SELECT COALESCE(SUM(review_minutes),0) FROM project_reviews WHERE project_id = p.id AND responded_at IS NOT NULL) as review_minutes,
                   (SELECT COUNT(*) FROM project_reviews WHERE project_id = p.id) as review_cycles
            FROM projects p
            LEFT JOIN users u ON p.manager_id = u.id
            WHERE p.status != 'archived'
            ${user.role === 'manager' ? 'AND p.manager_id = ?' : ''}
        `, user.role === 'manager' ? [user.id] : []);

        data = projects.map(p => ({
            'Project Code': p.project_code,
            'Project Name': p.project_name,
            'Manager': p.manager_name,
            'Status': p.status,
            'Total Tasks': p.total_tasks,
            'Total Hours': ((p.total_minutes || 0) / 60).toFixed(2),
            'Client Review Hours': ((p.review_minutes || 0) / 60).toFixed(2),
            'Review Cycles': p.review_cycles || 0
        }));
        filename = 'project_time_report.csv';

    } else if (type === 'task-iterations') {
        const tasks = dbAll(`
            SELECT t.task_title, t.task_category, t.status, t.current_iteration,
                   t.total_time_spent, t.estimated_hours,
                   p.project_name, p.project_code,
                   u.full_name as assigned_to_name
            FROM tasks t
            LEFT JOIN projects p ON t.project_id = p.id
            LEFT JOIN users u ON t.assigned_to = u.id
            WHERE p.status != 'archived'
            ${user.role === 'manager' ? 'AND p.manager_id = ?' : ''}
            ${project_id ? 'AND t.project_id = ?' : ''}
            ORDER BY p.project_name, t.created_at
        `, (() => {
            const p = [];
            if (user.role === 'manager') p.push(user.id);
            if (project_id) p.push(project_id);
            return p;
        })());

        data = tasks.map(t => ({
            'Project Code': t.project_code,
            'Project Name': t.project_name,
            'Task': t.task_title,
            'Category': t.task_category === 'client_request' ? 'Client Request' : 'Project Requirement',
            'Assignee': t.assigned_to_name,
            'Status': t.status,
            'Iterations': t.current_iteration,
            'Est. Hours': t.estimated_hours || '',
            'Time Spent Hours': ((t.total_time_spent || 0) / 60).toFixed(2)
        }));
        filename = 'task_iterations_report.csv';

    } else if (type === 'member-time') {
        const members = dbAll(`
            SELECT u.full_name, u.email,
                   (SELECT SUM(duration_minutes) FROM time_entries WHERE user_id = u.id) as total_minutes
            FROM users u
            WHERE u.role = 'member' AND u.is_active = 1
        `);

        data = members.map(m => ({
            'Member Name': m.full_name,
            'Email': m.email,
            'Total Hours': ((m.total_minutes || 0) / 60).toFixed(2)
        }));
        filename = 'member_time_report.csv';
    }

    // Convert to CSV
    if (data.length > 0) {
        const headers = Object.keys(data[0]);
        const csvRows = [headers.join(',')];
        for (const row of data) {
            csvRows.push(headers.map(h => JSON.stringify(row[h] || '')).join(','));
        }

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(csvRows.join('\n'));
    } else {
        res.json({ message: 'No data to export' });
    }
});

// API: File upload
app.post('/api/upload', requireAuth, upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const { project_id, task_id, iteration_id, upload_type, description } = req.body;
    const user = req.session.user;
    const uploadProj = dbGet('SELECT project_code FROM projects WHERE id = ?', [project_id]);
    const filePath = saveUploadedFile(uploadProj ? uploadProj.project_code : project_id, req.file.originalname, req.file.buffer);

    dbRun(`
        INSERT INTO file_attachments (project_id, task_id, iteration_id, uploaded_by, file_name, file_path, file_size, file_type, upload_type, description)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
        project_id,
        task_id || null,
        iteration_id || null,
        user.id,
        req.file.originalname,
        filePath,
        req.file.size,
        req.file.mimetype,
        upload_type || 'reference',
        description || ''
    ]);

    // Notify relevant users
    if (task_id) {
        const task = dbGet("SELECT assigned_to, task_title FROM tasks WHERE id = ?", [task_id]);
        const project = dbGet("SELECT manager_id, project_name FROM projects WHERE id = ?", [project_id]);

        // Notify manager
        if (project.manager_id !== user.id) {
            dbRun(`
                INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id)
                VALUES (?, 'file_uploaded', 'File uploaded', ?, 'file', ?)
            `, [project.manager_id, `New file "${req.file.originalname}" uploaded to "${task.task_title}"`, project_id]);
        }

        // Notify assigned member if not uploader
        if (task.assigned_to !== user.id) {
            dbRun(`
                INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id)
                VALUES (?, 'file_uploaded', 'File uploaded', ?, 'file', ?)
            `, [task.assigned_to, `New file "${req.file.originalname}" uploaded to your task`, project_id]);
        }
    }

    res.json({ success: true, file: req.file });
});

// ─────────────────────────────────────────────
//  CLIENT PORTAL API  (read-only, role=client)
// ─────────────────────────────────────────────

// Helper: verify requesting user is a client and owns the resource
function requireClient(req, res) {
    if (!req.session.user || req.session.user.role !== 'client') {
        res.status(403).json({ error: 'Access denied' });
        return false;
    }
    return true;
}

// GET /api/client/dashboard — summary stats for the logged-in client
app.get('/api/client/dashboard', requireAuth, (req, res) => {
    if (!requireClient(req, res)) return;
    const clientId = req.session.user.id;

    const projects = dbAll(`
        SELECT p.id FROM projects p
        INNER JOIN project_members pm ON p.id = pm.project_id
        WHERE pm.user_id = ?
    `, [clientId]);

    const projectIds = projects.map(p => p.id);
    if (projectIds.length === 0) {
        return res.json({ total_projects: 0, total_tasks: 0, completed_tasks: 0,
            in_progress_tasks: 0, pending_tasks: 0, overall_progress_percent: 0 });
    }

    const placeholders = projectIds.map(() => '?').join(',');
    const tasks = dbAll(`SELECT status FROM tasks WHERE project_id IN (${placeholders})`, projectIds);

    const total_tasks     = tasks.length;
    const completed_tasks = tasks.filter(t => t.status === 'completed').length;
    const in_progress     = tasks.filter(t => t.status === 'in_progress').length;
    const pending         = tasks.filter(t => t.status === 'pending').length;

    const reviewRow = dbGet(`SELECT COALESCE(SUM(review_minutes),0) as total FROM project_reviews WHERE project_id IN (${placeholders}) AND responded_at IS NOT NULL`, projectIds);

    res.json({
        total_projects: projectIds.length,
        total_tasks,
        completed_tasks,
        in_progress_tasks: in_progress,
        pending_tasks: pending,
        overall_progress_percent: total_tasks > 0 ? Math.round((completed_tasks / total_tasks) * 100) : 0,
        total_client_review_minutes: reviewRow ? reviewRow.total : 0
    });
});

// GET /api/client/projects — all projects assigned to this client with full detail
app.get('/api/client/projects', requireAuth, (req, res) => {
    if (!requireClient(req, res)) return;
    const clientId = req.session.user.id;

    const projects = dbAll(`
        SELECT p.*,
               u.full_name AS manager_name,
               (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) AS total_tasks,
               (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND status = 'completed') AS completed_tasks,
               (SELECT COALESCE(SUM(total_time_spent),0) FROM tasks WHERE project_id = p.id) AS total_hours_spent,
               (SELECT COALESCE(SUM(review_minutes),0) FROM project_reviews WHERE project_id = p.id AND responded_at IS NOT NULL) AS client_review_minutes,
               (SELECT COUNT(*) FROM project_reviews WHERE project_id = p.id AND responded_at IS NULL) AS pending_review
        FROM projects p
        INNER JOIN project_members pm ON p.id = pm.project_id
        LEFT JOIN users u ON p.manager_id = u.id
        WHERE pm.user_id = ?
        ORDER BY p.created_at DESC
    `, [clientId]);

    for (const p of projects) {
        p.progress_percent = p.total_tasks > 0
            ? Math.round((p.completed_tasks / p.total_tasks) * 100) : 0;
    }

    res.json(projects);
});

// GET /api/client/projects/:id/tasks — all tasks for one of the client's projects
app.get('/api/client/projects/:id/tasks', requireAuth, (req, res) => {
    if (!requireClient(req, res)) return;
    const clientId  = req.session.user.id;
    const projectId = req.params.id;

    // Verify client has access to this project
    const access = dbGet('SELECT id FROM project_members WHERE project_id = ? AND user_id = ?', [projectId, clientId]);
    if (!access) return res.status(403).json({ error: 'Access denied' });

    const tasks = dbAll(`
        SELECT t.id, t.task_title, t.task_description, t.status, t.priority,
               t.due_date, t.estimated_hours, t.total_time_spent, t.current_iteration,
               t.created_at, t.actual_end_date, t.task_category,
               u.full_name AS assigned_to_name
        FROM tasks t
        LEFT JOIN users u ON t.assigned_to = u.id
        WHERE t.project_id = ?
        ORDER BY t.created_at ASC
    `, [projectId]);

    res.json(tasks);
});

// GET /api/client/assigned-projects/:userId — admin fetches a client's project assignments (for edit modal)
app.get('/api/client/assigned-projects/:userId', requireAuth, requireRole(['admin']), (req, res) => {
    const assignments = dbAll(
        'SELECT project_id FROM project_members WHERE user_id = ?',
        [req.params.userId]
    );
    res.json(assignments.map(a => a.project_id));
});

// ─────────────────────────────────────────────

// Serve static HTML files
app.get('/', (req, res) => {
    if (req.session.user) {
        return res.redirect(req.session.user.role === 'client' ? '/client' : '/dashboard');
    }
    res.redirect('/login');
});

// Create public directory for static files
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
}

// Initialize database and start server
async function startServer() {
    try {
        await initializeDatabase();
        console.log('Database initialized successfully');

        // ── Sanitize: clamp any negative duration_minutes to 0 and recalculate totals ─
        {
            const _db = getDatabase();
            _db.run("UPDATE time_entries SET duration_minutes = 0 WHERE duration_minutes < 0");
            _db.run(`
                UPDATE tasks SET total_time_spent = COALESCE(
                    (SELECT MAX(0, SUM(COALESCE(duration_minutes,0))) FROM time_entries WHERE task_id = tasks.id), 0
                )
            `);
            _db.run(`
                UPDATE task_iterations SET total_time_spent = COALESCE(
                    (SELECT MAX(0, SUM(COALESCE(duration_minutes,0))) FROM time_entries WHERE iteration_id = task_iterations.id), 0
                )
            `);
            saveDatabase();
        }

        // ── IPC from Electron main process (before-quit, etc.) ───────────────
        process.on('message', (msg) => {
            if (msg && msg.type === 'auto-pause') {
                autoPauseAllTimers(msg.reason || 'Auto-paused', !!msg.server_only);
            }
        });

        // ── Background job: end-of-day auto-pause at 20:00 IST ──────────────
        let lastEndOfDayDate = null;
        setInterval(() => {
            const now = new Date();
            const h = now.getHours(), m = now.getMinutes();
            const today = todayIST();
            if (h === 20 && m < 5 && lastEndOfDayDate !== today) {
                lastEndOfDayDate = today;
                autoPauseAllTimers('Auto-paused: End of working day (8 PM)');
            }
        }, 60 * 1000); // check every minute

        // ── Background job: max 12-hour continuous timer guard ───────────────
        setInterval(() => {
            const activeEntries = dbAll("SELECT * FROM time_entries WHERE is_active = 1");
            const now = new Date();
            for (const te of activeEntries) {
                const durMins = (now - new Date(te.start_time)) / (1000 * 60);
                if (durMins > 720) { // 12 hours
                    autoPauseAllTimers('Auto-paused: Timer exceeded 12-hour maximum');
                    break; // autoPauseAllTimers handles all entries
                }
            }
        }, 15 * 60 * 1000); // check every 15 minutes

        // ── Background job: inactivity heartbeat guard ───────────────────────
        // If a member hasn't pinged /api/heartbeat for 10 min and has an active
        // timer, pause it (catches browser closes, PC sleeps missed by Electron)
        setInterval(() => {
            const activeEntries = dbAll(`
                SELECT te.*, t.assigned_to
                FROM time_entries te JOIN tasks t ON te.task_id = t.id
                WHERE te.is_active = 1
            `);
            const now = Date.now();
            const pausedTasks = new Set();
            for (const te of activeEntries) {
                const lastSeen = userLastSeen.get(te.assigned_to);
                if (!lastSeen) continue; // user never sent a heartbeat — skip
                if ((now - lastSeen) > 10 * 60 * 1000) { // 10 min inactive
                    if (pausedTasks.has(te.task_id)) continue;
                    pausedTasks.add(te.task_id);
                    const endTime = nowIST();
                    const dur = Math.max(0, (new Date(endTime) - new Date(te.start_time)) / (1000 * 60));
                    dbRun(`UPDATE time_entries SET end_time=?, duration_minutes=?, is_active=0, pause_type='auto', remarks='Auto-paused: Session timeout' WHERE id=?`,
                        [endTime, dur, te.id]);
                    const iterTime = dbGet("SELECT SUM(duration_minutes) as total FROM time_entries WHERE iteration_id=?", [te.iteration_id]);
                    dbRun("UPDATE task_iterations SET total_time_spent=? WHERE id=?", [iterTime.total || 0, te.iteration_id]);
                    const taskTotal = dbGet("SELECT SUM(duration_minutes) as total FROM time_entries WHERE task_id=?", [te.task_id]);
                    dbRun("UPDATE tasks SET total_time_spent=?, status='paused', updated_at=CURRENT_TIMESTAMP WHERE id=?", [taskTotal.total || 0, te.task_id]);
                    console.log(`[HEARTBEAT-GUARD] Paused task ${te.task_id} — user ${te.assigned_to} inactive >10 min`);
                }
            }
            if (pausedTasks.size > 0) saveDatabase();
        }, 5 * 60 * 1000); // check every 5 minutes

        app.listen(PORT, '0.0.0.0', () => {
            console.log(`WTMS Server running on http://localhost:${PORT}`);
            console.log(`Access via LAN: http://<your-ip>:${PORT}`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();
