const { app, BrowserWindow, Menu, dialog, shell, session } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

// YouTube embeds require an http(s) origin/referer. Loading the game from
// file:// makes every embed fail with error 153, so the game is served from a
// small local HTTP server instead. The port is fixed so localStorage keeps
// working between launches.
const HOST = '127.0.0.1';
const PORT = 47821;
const MAX_PORT_ATTEMPTS = 10;

// Let the game start YouTube playback from a logic signal (no click needed).
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.mp3': 'audio/mpeg',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg'
};

let mainWindow;
let server;
let serverPort = PORT;

function createServer() {
    return http.createServer((req, res) => {
        let pathname;
        try {
            pathname = decodeURIComponent(new URL(req.url, `http://${HOST}`).pathname);
        } catch (e) {
            res.writeHead(400);
            res.end('Bad request');
            return;
        }

        const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
        const root = path.resolve(__dirname);
        const filePath = path.resolve(root, relative);
        if (filePath !== root && !filePath.startsWith(root + path.sep)) {
            res.writeHead(403);
            res.end('Forbidden');
            return;
        }

        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('Not found');
                return;
            }
            res.writeHead(200, {
                'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
                'Cache-Control': 'no-cache'
            });
            res.end(data);
        });
    });
}

function listen(port, attempt = 0) {
    return new Promise((resolve, reject) => {
        server.once('error', (err) => {
            if (err.code === 'EADDRINUSE' && attempt < MAX_PORT_ATTEMPTS) {
                resolve(listen(port + 1, attempt + 1));
                return;
            }
            reject(err);
        });
        server.listen(port, HOST, () => resolve(port));
    });
}

async function startServer() {
    server = createServer();
    serverPort = await listen(PORT);
    if (serverPort !== PORT) {
        console.warn(`Port ${PORT} is busy, using ${serverPort}. Local saves use a new origin.`);
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        title: 'Logic Arrows',
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            // Used by "ДІСПЛЕЙ МЕДІА 2.0" to embed any website. Sites that send
            // X-Frame-Options/CSP cannot be shown in a normal iframe, but they
            // load normally in Electron's out-of-process webview.
            webviewTag: true
        }
    });

    mainWindow.loadURL(`http://${HOST}:${serverPort}/index.html`);

    // Links such as "Watch on YouTube" open in the system browser instead of
    // an empty Electron window.
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (/^https?:\/\//i.test(url)) {
            shell.openExternal(url);
        }
        return { action: 'deny' };
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

function stopServer() {
    if (server) {
        try { server.close(); } catch (e) {}
        server = null;
    }
}

if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });

    Menu.setApplicationMenu(null);

    // The website display is sandboxed, but it can still ask for camera,
    // microphone, geolocation, etc. Keep those denied; fullscreen is needed
    // for video sites. Links that try to open a popup go to the real browser.
    app.on('web-contents-created', (_event, contents) => {
        if (contents.getType() !== 'webview') return;
        contents.setWindowOpenHandler(({ url }) => {
            if (/^https?:\/\//i.test(url)) shell.openExternal(url);
            return { action: 'deny' };
        });
    });

    app.whenReady().then(async () => {
        try {
            await startServer();
            const webSession = session.fromPartition('persist:logic-arrows-web');
            webSession.setPermissionRequestHandler((_webContents, permission, callback) => {
                const allowed = permission === 'fullscreen' ||
                    permission === 'pointerLock' ||
                    permission === 'clipboard-sanitized-write';
                callback(allowed);
            });
        } catch (err) {
            dialog.showErrorBox('Logic Arrows', `Не вдалося запустити локальний сервер:\n${err.message}`);
            app.quit();
            return;
        }
        createWindow();
    });

    app.on('window-all-closed', () => {
        stopServer();
        app.quit();
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });

    app.on('before-quit', stopServer);
}
