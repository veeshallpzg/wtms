'use strict';

const { app, BrowserWindow, Tray, Menu, shell, dialog, powerMonitor, nativeImage } = require('electron');
const path = require('path');
const { fork } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');

// ── Single instance ───────────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }

// ── Constants ─────────────────────────────────────────────────────────────────
const PORT       = 8080;
let   SERVER_URL = `http://localhost:${PORT}`;   // may be overridden to remote in client mode

// ── State ─────────────────────────────────────────────────────────────────────
let mainWindow    = null;
let splashWindow  = null;
let tray          = null;
let serverProcess = null;

// ── Data directory (writable, survives app updates) ───────────────────────────
const dataDir = app.getPath('userData');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
process.env.WTMS_DATA_DIR = dataDir;
process.env.WTMS_BACKUP_DIR = app.isPackaged ? 'D:\\wtmslocal\\BKP' : path.join(__dirname, 'BKP');
process.env.TZ = 'Asia/Kolkata';

// ── Server config (server vs client mode) ─────────────────────────────────────
const CONFIG_PATH = path.join(dataDir, 'wtms-server-config.json');
let appConfig = null;

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch (_) {}
    return null;
}

function saveConfig(cfg) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

// Returns true only when this machine has the server's static IP
function isServerPC() {
    const nets = os.networkInterfaces();
    for (const iface of Object.values(nets)) {
        for (const entry of iface) {
            if (!entry.internal && entry.family === 'IPv4' && entry.address === '192.168.29.251') {
                return true;
            }
        }
    }
    return false;
}

function showSetupWindow() {
    return new Promise((resolve) => {
        const { ipcMain } = require('electron');
        const setupWin = new BrowserWindow({
            width: 500, height: 420,
            frame: true, resizable: false, center: true,
            alwaysOnTop: true,
            title: 'WTMS – First Time Setup',
            backgroundColor: '#1f2335',
            webPreferences: { nodeIntegration: true, contextIsolation: false }
        });
        Menu.setApplicationMenu(null);
        setupWin.loadFile(appPath('electron-setup.html'));

        ipcMain.once('wtms-setup-done', (_e, cfg) => {
            saveConfig(cfg);
            setupWin.destroy();
            resolve(cfg);
        });
        // If user closes without completing, default to server mode
        setupWin.on('closed', () => resolve({ mode: 'server' }));
    });
}

function waitForRemoteServer(url) {
    return new Promise((resolve, reject) => {
        const poll = (attempts = 0) => {
            if (attempts > 20) { reject(new Error('Server not reachable after 20 seconds.')); return; }
            const req = http.get(url, () => resolve());
            req.on('error', () => setTimeout(() => poll(attempts + 1), 1000));
            req.setTimeout(1000, () => req.destroy());
            req.end();
        };
        poll();
    });
}

// ── Paths ─────────────────────────────────────────────────────────────────────
function appPath(...parts) {
    return app.isPackaged
        ? path.join(process.resourcesPath, 'app', ...parts)
        : path.join(__dirname, ...parts);
}

function assetPath(name) {
    const candidates = [
        appPath('assets', name),
        appPath('public', 'images', name),
    ];
    for (const p of candidates) if (fs.existsSync(p)) return p;
    return null;
}

// ── Splash window ─────────────────────────────────────────────────────────────
function createSplash() {
    splashWindow = new BrowserWindow({
        width: 420, height: 280,
        frame: false, transparent: false,
        resizable: false, center: true,
        alwaysOnTop: true, skipTaskbar: true,
        backgroundColor: '#1f2335',
        webPreferences: { nodeIntegration: false }
    });
    splashWindow.loadFile(appPath('electron-splash.html'));
}

// ── Main window ───────────────────────────────────────────────────────────────
function createMainWindow() {
    const icon = assetPath('icon.ico') || assetPath('lucidlogo.webp');

    mainWindow = new BrowserWindow({
        width: 1280, height: 820,
        minWidth: 960, minHeight: 600,
        title: 'WTMS – Work Time Management System',
        icon: icon || undefined,
        show: false,
        autoHideMenuBar: true,
        backgroundColor: '#1a1a1a',
        webPreferences: { nodeIntegration: false, contextIsolation: true }
    });

    // Remove native menu bar completely
    Menu.setApplicationMenu(null);

    mainWindow.loadURL(SERVER_URL);
    mainWindow.maximize();

    mainWindow.once('ready-to-show', () => {
        if (splashWindow && !splashWindow.isDestroyed()) {
            splashWindow.close();
            splashWindow = null;
        }
        mainWindow.show();
        mainWindow.focus();
    });

    // Close → hide to tray
    mainWindow.on('close', (e) => {
        if (!app.isQuitting) {
            e.preventDefault();
            mainWindow.hide();
            if (tray) tray.displayBalloon({
                iconType: 'info',
                title: 'WTMS is still running',
                content: 'Use the tray icon to open or quit.'
            });
        }
    });
}

// ── System tray ───────────────────────────────────────────────────────────────
function createTray() {
    const iconFile = assetPath('tray.ico') || assetPath('tray.png')
                  || assetPath('icon.ico') || assetPath('lucidlogo.webp');
    if (!iconFile) return;

    tray = new Tray(iconFile);
    tray.setToolTip('WTMS – Work Time Management');

    const menu = Menu.buildFromTemplate([
        {
            label: 'Open WTMS',
            click: () => {
                if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
                else createMainWindow();
            }
        },
        {
            label: 'Open in Browser',
            click: () => shell.openExternal(SERVER_URL)
        },
        { type: 'separator' },
        {
            label: 'Data Folder',
            click: () => shell.openPath(dataDir)
        },
        { type: 'separator' },
        {
            label: 'Quit WTMS',
            click: () => { app.isQuitting = true; app.quit(); }
        }
    ]);

    tray.setContextMenu(menu);
    tray.on('double-click', () => {
        if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
    });
}

// ── Server management ─────────────────────────────────────────────────────────
function startServer() {
    return new Promise((resolve, reject) => {
        const serverScript = appPath('server.js');
        const cwd          = appPath();

        serverProcess = fork(serverScript, [], {
            env:    { ...process.env },
            cwd:    cwd,
            silent: true
        });

        serverProcess.stdout.on('data', (buf) => {
            const msg = buf.toString();
            console.log('[WTMS]', msg.trim());

            // Push progress updates to the splash window so it doesn't look frozen
            if (splashWindow && !splashWindow.isDestroyed()) {
                let label = null;
                if (msg.includes('Loaded existing database') || msg.includes('Created new database')) {
                    label = 'Loading database';
                } else if (msg.includes('Database tables created') || msg.includes('Database initialized successfully')) {
                    label = 'Preparing tables';
                } else if (msg.includes('WTMS Server running')) {
                    label = 'Ready';
                }
                if (label) {
                    splashWindow.webContents
                        .executeJavaScript(`var el=document.getElementById('status-text');if(el)el.textContent=${JSON.stringify(label)};`)
                        .catch(() => {});
                }
            }

            if (msg.includes('WTMS Server running')) resolve();
        });

        serverProcess.stderr.on('data', (buf) => {
            console.error('[WTMS ERR]', buf.toString().trim());
        });

        serverProcess.on('error', reject);

        serverProcess.on('exit', (code) => {
            if (!app.isQuitting && code !== 0) {
                console.error(`Server exited with code ${code}`);
            }
        });

        // Fallback: poll until the server responds
        const poll = (attempts = 0) => {
            if (attempts > 40) { reject(new Error('Server did not start in time.')); return; }
            const req = http.get(SERVER_URL, () => resolve());
            req.on('error', () => setTimeout(() => poll(attempts + 1), 500));
            req.setTimeout(400, () => req.destroy());
            req.end();
        };
        setTimeout(() => poll(), 500);
    });
}

// ── Auto-pause helper: notifies server to pause all running timers ─────────────
// serverOnly=true → only pauses timers for admin users (used on screen lock, not suspend/shutdown)
function autoPauseAll(reason, serverOnly = false) {
    // Client mode has no local server to pause
    if (appConfig && appConfig.mode === 'client') return;
    // First try IPC (fast, works even during quit)
    if (serverProcess) {
        try { serverProcess.send({ type: 'auto-pause', reason, server_only: serverOnly }); } catch (_) {}
    }
    // Also fire HTTP as a backup (asynchronous, best-effort)
    try {
        const body = JSON.stringify({ reason, server_only: serverOnly });
        const req = http.request({
            hostname: 'localhost', port: PORT,
            path: '/api/system/auto-pause', method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-electron-internal': 'true', 'Content-Length': Buffer.byteLength(body) }
        }, () => {});
        req.on('error', () => {});
        req.write(body);
        req.end();
    } catch (_) {}
}

// ── System event listeners (suspend / shutdown / screen lock) ─────────────────
app.whenReady().then(() => {
    // System going to sleep / laptop lid closed / hibernate
    powerMonitor.on('suspend', () => {
        console.log('[POWER] System suspending — auto-pausing timers');
        autoPauseAll('Auto-paused: System went to sleep');
    });

    // Graceful OS shutdown or restart
    powerMonitor.on('shutdown', () => {
        console.log('[POWER] System shutting down — auto-pausing timers');
        autoPauseAll('Auto-paused: System shut down');
    });

    // Screen locked (Win+L, auto-lock policy)
    // Only pause the server/admin user's timers — remote members are still working
    powerMonitor.on('lock-screen', () => {
        console.log('[POWER] Screen locked — auto-pausing server-side timers only');
        autoPauseAll('Auto-paused: Screen locked', true);
    });

    // System resumed — prompt renderer to offer task resume
    powerMonitor.on('resume', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.executeJavaScript('window.dispatchEvent(new CustomEvent("wtms-system-resumed"))').catch(() => {});
        }
    });

    // Screen unlocked — same prompt
    powerMonitor.on('unlock-screen', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.executeJavaScript('window.dispatchEvent(new CustomEvent("wtms-system-resumed"))').catch(() => {});
        }
    });
});

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
    // Register WTMS to start automatically on Windows login
    app.setLoginItemSettings({ openAtLogin: true, openAsHidden: false, name: 'WTMS' });

    // Determine mode: server PC is identified by its static LAN IP.
    // Any other PC is always forced into client mode, even if a stale config says otherwise.
    appConfig = loadConfig();
    if (!isServerPC()) {
        appConfig = { mode: 'client', serverUrl: 'http://192.168.29.251:8080' };
        saveConfig(appConfig);
    } else if (!appConfig) {
        appConfig = { mode: 'server' };
        saveConfig(appConfig);
    }

    // In client mode, point to the remote server instead of localhost
    if (appConfig.mode === 'client' && appConfig.serverUrl) {
        SERVER_URL = appConfig.serverUrl.replace(/\/$/, '');
    }

    createSplash();
    createTray();

    try {
        if (appConfig.mode === 'client') {
            // Don't start a local server — connect to the remote server PC
            if (splashWindow && !splashWindow.isDestroyed()) {
                splashWindow.webContents
                    .executeJavaScript(`var el=document.getElementById('status-text');if(el)el.textContent='Connecting to server\u2026';`)
                    .catch(() => {});
            }
            await waitForRemoteServer(SERVER_URL);
        } else {
            await startServer();
        }
        createMainWindow();
    } catch (err) {
        if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
        const msg = appConfig.mode === 'client'
            ? `Could not reach the WTMS server at:\n${SERVER_URL}\n\nMake sure the server PC is on and WTMS is running there.`
            : `Could not start the server:\n\n${err.message}`;
        dialog.showErrorBox('WTMS – Startup Error', msg);
        app.quit();
    }
});

app.on('second-instance', () => {
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
    }
});

// Keep running when all windows are closed (tray mode)
app.on('window-all-closed', () => { /* intentional no-op */ });

app.on('before-quit', () => {
    app.isQuitting = true;
    autoPauseAll('Auto-paused: App closed');
    if (serverProcess) {
        // Give server 400 ms to process the IPC pause before killing it
        setTimeout(() => {
            try { serverProcess.kill(); } catch (_) {}
        }, 400);
    }
});