// Launcher: removes VS Code's ELECTRON_RUN_AS_NODE before starting Electron
const { spawn } = require('child_process');
const path = require('path');

const electronPath = require('electron');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, ['.'], {
    stdio: 'inherit',
    windowsHide: false,
    env
});

child.on('close', (code) => process.exit(code ?? 0));
