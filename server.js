'use strict';

// Logic Arrows — сервер мультиплеєра.
// Тільки вбудовані модулі Node: жодних npm-залежностей. Треба лиш Node.js 18+.
// Запуск:  node server.js        (потом открыть http://localhost:3000)

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LEN = 6;
const MAX_PLAYERS = 8;
const MAX_FRAME = 8 * 1024 * 1024;

// ==================== МИНІМАЛЬНИЙ WebSocket (RFC 6455) ====================
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

class WsConn extends EventEmitter {
    constructor(socket) {
        super();
        this.socket = socket;
        this.readyState = WsConn.OPEN;
        this.buf = Buffer.alloc(0);
        this.fragOp = null;
        this.frags = [];
        this.alive = true;
        socket.setNoDelay(true);
        socket.on('data', (chunk) => {
            this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
            this._parse();
        });
        socket.on('close', () => this._down());
        socket.on('error', () => this._down());
    }

    static get OPEN() { return 1; }
    static get CLOSED() { return 3; }

    _down() {
        if (this.readyState === WsConn.CLOSED) return;
        this.readyState = WsConn.CLOSED;
        this.emit('close');
    }

    _fail() {
        this.socket.destroy();
        this._down();
    }

    _parse() {
        for (;;) {
            if (this.readyState === WsConn.CLOSED) return;
            if (this.buf.length < 2) return;
            const b0 = this.buf[0], b1 = this.buf[1];
            const fin = (b0 & 0x80) !== 0;
            const op = b0 & 0x0f;
            const masked = (b1 & 0x80) !== 0;
            let len = b1 & 0x7f;
            let off = 2;

            if (len === 126) {
                if (this.buf.length < 4) return;
                len = this.buf.readUInt16BE(2);
                off = 4;
            } else if (len === 127) {
                if (this.buf.length < 10) return;
                if (this.buf.readUInt32BE(2) !== 0) return this._fail();
                len = this.buf.readUInt32BE(6);
                off = 10;
            }
            if (len > MAX_FRAME) return this._fail();
            if (masked && this.buf.length < off + 4) return;

            const mask = masked ? this.buf.slice(off, off + 4) : null;
            if (masked) off += 4;
            if (this.buf.length < off + len) return;

            let payload = this.buf.slice(off, off + len);
            if (masked) {
                const out = Buffer.allocUnsafe(len);
                for (let i = 0; i < len; i++) out[i] = payload[i] ^ mask[i & 3];
                payload = out;
            }
            this.buf = this.buf.slice(off + len);
            this._frame(fin, op, payload);
        }
    }

    _frame(fin, op, payload) {
        if (op === 0x0) {
            if (this.fragOp === null) return;
            this.frags.push(payload);
            if (!fin) return;
            const merged = Buffer.concat(this.frags);
            const first = this.fragOp;
            this.frags = [];
            this.fragOp = null;
            this._data(first, merged);
            return;
        }
        if (op === 0x8) {
            this._write(0x8, payload.slice(0, 123));
            this.socket.end();
            this._down();
            return;
        }
        if (op === 0x9) { this._write(0xA, payload); return; }
        if (op === 0xA) { this.alive = true; return; }
        if (op === 0x1 || op === 0x2) {
            if (!fin) { this.fragOp = op; this.frags = [payload]; return; }
            this._data(op, payload);
            return;
        }
        this._fail();
    }

    _data(op, payload) {
        if (op === 0x1) this.emit('message', payload.toString('utf8'));
    }

    _write(op, payload) {
        if (this.readyState !== WsConn.OPEN) return false;
        const len = payload.length;
        let header;
        if (len < 126) {
            header = Buffer.allocUnsafe(2);
            header[0] = 0x80 | op;
            header[1] = len;
        } else if (len < 65536) {
            header = Buffer.allocUnsafe(4);
            header[0] = 0x80 | op;
            header[1] = 126;
            header.writeUInt16BE(len, 2);
        } else {
            header = Buffer.allocUnsafe(10);
            header[0] = 0x80 | op;
            header[1] = 127;
            header.writeUInt32BE(0, 2);
            header.writeUInt32BE(len, 6);
        }
        return this.socket.write(Buffer.concat([header, payload]));
    }

    send(str) { return this._write(0x1, Buffer.from(String(str), 'utf8')); }
    ping() { return this._write(0x9, Buffer.alloc(0)); }
    close() { this._write(0x8, Buffer.alloc(0)); this.socket.end(); this._down(); }
    terminate() { this.socket.destroy(); this._down(); }
}

function attachWebSocket(server, onConnection) {
    server.on('upgrade', (req, socket, head) => {
        const key = req.headers['sec-websocket-key'];
        if (!key || req.headers.upgrade === undefined) {
            socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
            socket.destroy();
            return;
        }
        const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
        socket.write('HTTP/1.1 101 Switching Protocols\r\n' +
            'Upgrade: websocket\r\n' +
            'Connection: Upgrade\r\n' +
            'Sec-WebSocket-Accept: ' + accept + '\r\n\r\n');
        const ws = new WsConn(socket);
        if (head && head.length) { ws.buf = head; ws._parse(); }
        onConnection(ws, req);
    });
}
// ==================== /WebSocket ====================

// ==================== КІМНАТИ ====================
const rooms = new Map();

function newRoomCode() {
    for (let i = 0; i < 300; i++) {
        let code = '';
        for (let j = 0; j < CODE_LEN; j++) code += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
        if (!rooms.has(code)) return code;
    }
    return null;
}

function safeId(raw, fallback) {
    const id = String(raw == null ? '' : raw).replace(/[^A-Za-z0-9]/g, '').slice(0, 16);
    return id || fallback;
}

function safeName(raw) {
    const name = String(raw == null ? '' : raw).replace(/[\u0000-\u001f<>"'`]/g, '').trim().slice(0, 32);
    return name || 'Гравець';
}

function sendTo(ws, payload) {
    if (ws.readyState === WsConn.OPEN) ws.send(JSON.stringify(payload));
}

function sendError(ws, message) {
    sendTo(ws, { type: 'error', message });
}

function rosterOf(room) {
    return Array.from(room.players, ([id, ws]) => ({ id, name: ws.__mp.name }));
}

function broadcastRoster(room) {
    const msg = { type: 'players_update', players: rosterOf(room), hostId: room.hostId };
    for (const ws of room.players.values()) sendTo(ws, msg);
}

function handleLeave(ws) {
    const code = ws.__mp.roomCode;
    if (!code) return;
    const room = rooms.get(code);
    ws.__mp.roomCode = null;
    if (!room) return;
    const id = ws.__mp.playerId;
    const wasHost = room.hostId === id;
    room.players.delete(id);

    if (wasHost) {
        rooms.delete(code);
        console.log(`[room ${code}] host left -> closed`);
        for (const peer of room.players.values()) sendTo(peer, { type: 'room_closed', code });
        return;
    }
    console.log(`[room ${code}] ${id} left (${room.players.size} online)`);
    if (room.players.size === 0) { rooms.delete(code); return; }
    broadcastRoster(room);
}

function handleIncoming(ws, raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return sendError(ws, 'Некоректний JSON'); }
    if (!msg || typeof msg.type !== 'string') return;

    switch (msg.type) {
        case 'create_room': {
            if (ws.__mp.roomCode) return sendError(ws, 'Ви вже в кімнаті');
            const code = newRoomCode();
            if (!code) return sendError(ws, 'Не вдалося створити код');
            const id = safeId(msg.id, crypto.randomBytes(6).toString('hex'));
            ws.__mp.playerId = id;
            ws.__mp.name = safeName(msg.name);
            ws.__mp.roomCode = code;
            const room = { code, hostId: id, players: new Map([[id, ws]]), state: null, createdAt: Date.now() };
            rooms.set(code, room);
            console.log(`[room ${code}] created by ${id}`);
            sendTo(ws, { type: 'room_created', code, hostId: id, players: rosterOf(room) });
            break;
        }

        case 'join_room': {
            if (ws.__mp.roomCode) return sendError(ws, 'Ви вже в кімнаті');
            const code = String(msg.code || '').trim().toUpperCase();
            const room = rooms.get(code);
            if (!room) return sendError(ws, 'Кімнату не знайдено');
            if (room.players.size >= MAX_PLAYERS) return sendError(ws, 'Кімната заповнена');
            let id = safeId(msg.id, crypto.randomBytes(6).toString('hex'));
            if (room.players.has(id)) id = crypto.randomBytes(6).toString('hex');
            ws.__mp.playerId = id;
            ws.__mp.name = safeName(msg.name);
            ws.__mp.roomCode = code;
            room.players.set(id, ws);
            console.log(`[room ${code}] ${id} joined (${room.players.size} online)`);
            sendTo(ws, { type: 'room_joined', code, hostId: room.hostId, players: rosterOf(room) });
            if (room.state) sendTo(ws, { type: 'host_state', state: room.state });
            broadcastRoster(room);
            break;
        }

        case 'host_state': {
            const room = rooms.get(ws.__mp.roomCode);
            if (!room || room.hostId !== ws.__mp.playerId) return;
            if (!Array.isArray(msg.state)) return;
            room.state = msg.state;
            const payload = JSON.stringify({ type: 'host_state', state: msg.state, hash: msg.hash });
            for (const [id, peer] of room.players) {
                if (id === room.hostId) continue;
                if (peer.readyState === WsConn.OPEN) peer.send(payload);
            }
            break;
        }

        case 'guest_action': {
            const room = rooms.get(ws.__mp.roomCode);
            if (!room || room.hostId === ws.__mp.playerId || !msg.action) return;
            const host = room.players.get(room.hostId);
            if (host) sendTo(host, { type: 'guest_action', action: msg.action, playerId: ws.__mp.playerId });
            break;
        }

        case 'kick_player': {
            const room = rooms.get(ws.__mp.roomCode);
            if (!room || room.hostId !== ws.__mp.playerId) return;
            const targetId = String(msg.playerId);
            const target = room.players.get(targetId);
            if (!target || target === ws) return;
            room.players.delete(targetId);
            target.__mp.roomCode = null;
            sendTo(target, { type: 'kicked', code: room.code });
            console.log(`[room ${room.code}] ${targetId} kicked`);
            broadcastRoster(room);
            break;
        }

        case 'leave_room':
        case 'close_room':
            handleLeave(ws);
            break;

        case 'get_state': {
            const room = rooms.get(ws.__mp.roomCode);
            if (room && room.state) sendTo(ws, { type: 'host_state', state: room.state });
            break;
        }

        case 'ping':
            sendTo(ws, { type: 'pong', t: msg.t });
            break;
    }
}

// ==================== СТАТИКА ====================
const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2'
};

const server = http.createServer((req, res) => {
    let pathname = '/';
    try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch (e) { /* лишаємо / */ }

    if (pathname === '/healthz') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
        return;
    }

    const rel = pathname.replace(/^\/+/, '') || 'index.html';
    const file = path.resolve(ROOT, rel);
    if (file !== path.resolve(ROOT) && !file.startsWith(path.resolve(ROOT) + path.sep)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Forbidden');
        return;
    }

    fs.readFile(file, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Not found: ' + rel);
            return;
        }
        res.writeHead(200, {
            'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
            'Cache-Control': 'no-store'
        });
        res.end(data);
    });
});

const live = new Set();

attachWebSocket(server, (ws) => {
    ws.__mp = { playerId: null, name: 'Гравець', roomCode: null };
    live.add(ws);
    ws.on('message', (text) => handleIncoming(ws, text));
    ws.on('close', () => { live.delete(ws); handleLeave(ws); });
});

setInterval(() => {
    for (const ws of live) {
        if (!ws.alive) { ws.terminate(); continue; }
        ws.alive = false;
        ws.ping();
    }
}, 30000).unref();

server.listen(PORT, () => {
    console.log(`Logic Arrows: http://localhost:${PORT}   (мультиплеєр: ws://localhost:${PORT})`);
});
