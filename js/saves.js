// Save slots: compressed saves stored in the player's Claude account (published page, `db` capability)
// or in this browser (localStorage) when running from local files. Also save files and save codes.
var PCM = globalThis.PCM || (globalThis.PCM = {});

PCM.Saves = (function () {
  const { Game } = PCM;
  const SLOTS = ['auto', '1', '2', '3'];
  const LOCAL_PREFIX = 'pcm26-slot-';
  const CODE_PREFIX = 'PCM26:gz:';
  const CHUNK = 180000; // characters per cloud document (limit is 256 KiB)
  const CLOUD_AUTOSAVE_MS = 20000;

  let cloud = null;      // { db, uid }
  let downloads = null;
  let ready = false;
  let readyWaiters = [];
  let queue = Promise.resolve();
  let pendingAuto = null, autoTimer = null;
  const listeners = [];

  function slotLabel(slot) { return slot === 'auto' ? 'Autosave' : 'Slot ' + slot; }
  function where() { return cloud ? 'Claude account' : 'This browser'; }
  function onChange(fn) { listeners.push(fn); }
  function notify() { for (const fn of listeners) try { fn(); } catch (e) { /* ignore */ } }

  // ---------- encoding ----------
  function toB64(buf) {
    const bytes = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function fromB64(str) {
    const s = atob(str);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  async function encode(G) {
    const json = Game.serialize(G);
    if (typeof CompressionStream === 'undefined') return json;
    const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
    return CODE_PREFIX + toB64(await new Response(stream).arrayBuffer());
  }
  async function decode(code) {
    code = String(code).trim();
    if (code.startsWith(CODE_PREFIX)) {
      const stream = new Blob([fromB64(code.slice(CODE_PREFIX.length).replace(/\s+/g, ''))]).stream().pipeThrough(new DecompressionStream('gzip'));
      code = await new Response(stream).text();
    }
    return Game.deserialize(code);
  }
  function meta(G, slot, size) {
    const t = G.teams[G.playerTeamId];
    return { slot, team: t ? t.name : '', manager: G.manager, year: G.year, week: G.week, world: G.world || 'fictional', savedAt: new Date().toISOString(), size };
  }

  // ---------- local storage ----------
  function localGet(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function localSet(key, val) { try { localStorage.setItem(key, val); return true; } catch (e) { return false; } }
  function localDel(key) { try { localStorage.removeItem(key); } catch (e) { /* ignore */ } }
  function localList() {
    const out = [];
    for (const slot of SLOTS) {
      const m = localGet(LOCAL_PREFIX + slot + '-meta');
      if (m) try { out.push({ ...JSON.parse(m), where: 'local' }); } catch (e) { /* ignore */ }
    }
    // legacy single autosave from earlier versions
    if (!out.some(x => x.slot === 'auto')) {
      const legacy = Game.load();
      if (legacy) out.push({ ...meta(legacy, 'auto', 0), savedAt: null, where: 'local', legacy: true });
    }
    return out;
  }

  // ---------- cloud (db capability) ----------
  const slotDoc = slot => cloud.db.doc(`data/users/${cloud.uid}/slot-${slot}`);
  function serial(fn) { const p = queue.then(fn, fn); queue = p.catch(() => {}); return p; }
  async function cloudWrite(slot, code, m) {
    return serial(async () => {
      const ref = slotDoc(slot);
      const token = Date.now().toString(36);
      const parts = [];
      for (let i = 0; i < code.length; i += CHUNK) parts.push(code.slice(i, i + CHUNK));
      for (let i = 0; i < parts.length; i++) await ref.collection('chunks').doc(String(i)).set({ token, d: parts[i] });
      const prev = await ref.get();
      await ref.set({ ...m, token, chunks: parts.length });
      const prevChunks = prev.exists ? (prev.data().chunks || 0) : 0;
      for (let i = parts.length; i < prevChunks; i++) await ref.collection('chunks').doc(String(i)).delete();
    });
  }
  async function cloudRead(slot) {
    const ref = slotDoc(slot);
    const snap = await ref.get();
    if (!snap.exists) return null;
    const m = snap.data();
    let code = '';
    for (let i = 0; i < m.chunks; i++) {
      const c = await ref.collection('chunks').doc(String(i)).get();
      if (!c.exists || c.data().token !== m.token) throw new Error('This save is incomplete. It may still be uploading from another device.');
      code += c.data().d;
    }
    return code;
  }
  async function cloudList() {
    const out = [];
    for (const slot of SLOTS) {
      const snap = await slotDoc(slot).get();
      if (snap.exists) out.push({ ...snap.data(), where: 'cloud' });
    }
    return out;
  }
  async function cloudDelete(slot) {
    return serial(async () => {
      const ref = slotDoc(slot);
      const snap = await ref.get();
      const n = snap.exists ? snap.data().chunks || 0 : 0;
      await ref.delete();
      for (let i = 0; i < n; i++) await ref.collection('chunks').doc(String(i)).delete();
    });
  }

  // ---------- public API ----------
  async function init() {
    try {
      if (typeof window !== 'undefined' && window.claude && typeof window.claude.use === 'function') {
        const [db, user, dl] = await Promise.all([window.claude.use('db'), window.claude.use('user'), window.claude.use('downloads')]);
        downloads = dl;
        const uid = user && (await user.id());
        if (db && uid) {
          cloud = { db, uid };
          // probe once: a view-only viewer has an id but cannot write
          try { await db.doc(`data/users/${uid}/probe`).set({ at: Date.now() }); } catch (e) { cloud = null; }
        }
      }
    } catch (e) { cloud = null; }
    ready = true;
    readyWaiters.forEach(fn => fn());
    readyWaiters = [];
    notify();
  }
  function whenReady() { return ready ? Promise.resolve() : new Promise(r => readyWaiters.push(r)); }

  async function list() {
    await whenReady();
    const local = localList();
    let remote = [];
    if (cloud) { try { remote = await cloudList(); } catch (e) { remote = []; } }
    const bySlot = {};
    for (const s of [...local, ...remote]) {
      const cur = bySlot[s.slot];
      if (!cur || (s.savedAt || '') > (cur.savedAt || '')) bySlot[s.slot] = s;
    }
    return SLOTS.map(slot => bySlot[slot] || { slot, empty: true });
  }

  async function save(G, slot) {
    await whenReady();
    if (slot !== 'auto') G.lastSlot = slot;
    const code = await encode(G);
    const m = meta(G, slot, code.length);
    if (cloud) {
      await cloudWrite(slot, code, m);
    } else if (!localSet(LOCAL_PREFIX + slot, code) || !localSet(LOCAL_PREFIX + slot + '-meta', JSON.stringify(m))) {
      throw new Error('This browser has no room left for saves. Delete a slot or save to a file.');
    }
    notify();
    return { ...m, where: cloud ? 'cloud' : 'local' };
  }

  async function load(slot, from) {
    await whenReady();
    let code = null;
    if (from !== 'local' && cloud) code = await cloudRead(slot);
    if (!code) code = localGet(LOCAL_PREFIX + slot);
    if (!code && slot === 'auto') { const g = Game.load(); if (g) return g; }
    if (!code) throw new Error(slotLabel(slot) + ' is empty.');
    return decode(code);
  }

  async function remove(slot) {
    await whenReady();
    localDel(LOCAL_PREFIX + slot);
    localDel(LOCAL_PREFIX + slot + '-meta');
    if (slot === 'auto') Game.clearSave();
    if (cloud) await cloudDelete(slot);
    notify();
  }

  // Called after every action: instant local autosave, cloud autosave coalesced to one write per pause
  function autosave(G, urgent) {
    Game.save(G);
    localSet(LOCAL_PREFIX + 'auto-meta', JSON.stringify({ ...meta(G, 'auto', 0), local: 'legacy' }));
    if (!cloud) return;
    pendingAuto = G;
    clearTimeout(autoTimer);
    autoTimer = setTimeout(flushAuto, urgent ? 1500 : CLOUD_AUTOSAVE_MS);
  }
  async function flushAuto() {
    clearTimeout(autoTimer);
    const G = pendingAuto;
    pendingAuto = null;
    if (!G || !cloud) return;
    try { await save(G, 'auto'); } catch (e) { /* next autosave retries */ }
  }

  async function saveFile(G) {
    const t = G.teams[G.playerTeamId];
    const name = `PCM26 ${t ? t.name : 'career'} ${G.year} wk${Math.min(G.week, 41)}.json`.replace(/[\\/:*?"<>|]/g, '');
    const code = await encode(G);
    if (downloads) {
      await downloads.save({ filename: name, data: code });
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([code], { type: 'application/json' }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  return { init, list, save, load, remove, autosave, flushAuto, saveFile, encode, decode, onChange, slotLabel, where, isCloud: () => !!cloud, SLOTS };
})();
