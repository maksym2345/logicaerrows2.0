// Протокольний тест сервера мультиплеєра. Запуск: node server.js, потім node tools/mp-protocol-test.mjs
const BASE = 'ws://localhost:3000';
let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
    if (cond) { pass++; console.log('  PASS  ' + name); }
    else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + JSON.stringify(extra) : '')); }
};

function makeClient() {
    const ws = new WebSocket(BASE);
    const msgs = [];
    const waiters = [];
    const open = new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws error')); });
    ws.onmessage = (ev) => {
        const m = JSON.parse(ev.data);
        const i = waiters.findIndex(w => w.pred(m));
        if (i >= 0) { const w = waiters.splice(i, 1)[0]; clearTimeout(w.timer); w.res(m); }
        else msgs.push(m);
    };
    return {
        ws, open,
        send: (o) => ws.send(JSON.stringify(o)),
        wait: (pred, label, ms = 3000) => new Promise((res, rej) => {
            const i = msgs.findIndex(pred);
            if (i >= 0) return res(msgs.splice(i, 1)[0]);
            const w = { pred, res, timer: setTimeout(() => rej(new Error('timeout waiting for ' + label)), ms) };
            waiters.push(w);
        }),
        close: () => ws.close()
    };
}

const t = (p) => { const c = makeClient(); return c.open.then(() => c); };

(async () => {
    console.log('--- створення кімнати ---');
    const host = await t();
    host.send({ type: 'create_room', id: 'host1111', name: 'Хост' });
    const created = await host.wait(m => m.type === 'room_created', 'room_created');
    ok('room_created з кодом', typeof created.code === 'string' && created.code.length === 6, created);
    ok('room_created несе hostId і players', created.hostId === 'host1111' && created.players.length === 1, created);
    const code = created.code;

    console.log('--- вхід гостя + початковий стан ---');
    host.send({ type: 'host_state', state: [{ type: 'source', x: 3, y: 4 }], hash: 'h0' });
    const guest = await t();
    guest.send({ type: 'join_room', code, id: 'guest222', name: 'Гість' });
    const joined = await guest.wait(m => m.type === 'room_joined', 'room_joined');
    ok('room_joined: id гостя збережено', joined.players.some(p => p.id === 'guest222'), joined);
    ok('room_joined: hostId вказаний', joined.hostId === 'host1111', joined);
    const replay = await guest.wait(m => m.type === 'host_state', 'host_state replay');
    ok('гість отримав стан одразу при вході', Array.isArray(replay.state) && replay.state[0].x === 3, replay);
    const rosterHost = await host.wait(m => m.type === 'players_update' && m.players.length === 2, 'players_update host');
    ok('хост бачить 2 гравців', rosterHost.players.length === 2, rosterHost);

    console.log('--- синхронізація host -> guest ---');
    host.send({ type: 'host_state', state: [{ type: 'source', x: 3, y: 4 }, { type: 'arrow', x: 5, y: 6 }], hash: 'h1' });
    const st1 = await guest.wait(m => m.type === 'host_state' && m.state.length === 2, 'host_state h1');
    ok('гость отримав оновлення стану', st1.state[1].type === 'arrow', st1);

    console.log('--- дія guest -> host ---');
    guest.send({ type: 'guest_action', action: { type: 'place', x: 9, y: 9, data: { type: 'lamp', x: 9, y: 9 } } });
    const act = await host.wait(m => m.type === 'guest_action', 'guest_action');
    ok('хост отримав дію гостя', act.action.x === 9 && act.playerId === 'guest222', act);

    console.log('--- помилки ---');
    const bad = await t();
    bad.send({ type: 'join_room', code: 'XXXXXX', id: 'zzz', name: 'Хто' });
    const err = await bad.wait(m => m.type === 'error', 'error');
    ok('неіснуючий код -> помилка', /не знайдено/i.test(err.message), err);
    bad.close();

    console.log('--- кік ---');
    host.send({ type: 'kick_player', playerId: 'guest222' });
    const kicked = await guest.wait(m => m.type === 'kicked', 'kicked');
    ok('вигнаному надіслано kicked', !!kicked, kicked);
    const roster2 = await host.wait(m => m.type === 'players_update' && m.players.length === 1, 'roster after kick');
    ok('після кіка залишився лише хост', roster2.players.length === 1, roster2);

    console.log('--- хост виходить -> кімната закривається ---');
    const g3 = await t();
    g3.send({ type: 'join_room', code, id: 'guest333', name: 'Гість3' });
    await g3.wait(m => m.type === 'room_joined', 'room_joined 2');
    host.close();
    const closed = await g3.wait(m => m.type === 'room_closed', 'room_closed');
    ok('гості отримали room_closed', !!closed, closed);
    g3.close();
    const late = await t();
    late.send({ type: 'join_room', code, id: 'guest444', name: 'Пізно' });
    const err2 = await late.wait(m => m.type === 'error', 'error after close');
    ok('кімната після виходу хоста видалена', /не знайдено/i.test(err2.message), err2);
    late.close();

    const health = await fetch('http://localhost:3000/healthz').then(r => r.json());
    ok('healthz доступний', health.ok === true, health);
    const page = await fetch('http://localhost:3000/').then(r => r.text());
    ok('index.html віддається сервером', page.includes('mp-create-btn'), page.slice(0, 40));
    const trav = await fetch('http://localhost:3000/../../Windows/win.ini').then(r => r.status);
    ok('path traversal заблоковано', trav === 404 || trav === 403, trav);

    console.log(`\nРЕЗУЛЬТАТ: ${pass} pass, ${fail} fail`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('ВЖИВКА:' + e.message); process.exit(2); });
