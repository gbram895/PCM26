// Core utilities: seeded RNG + formatting helpers. No DOM access here.
var PCM = globalThis.PCM || (globalThis.PCM = {});

(function () {
  let s = 1;

  const R = {
    seed(v) { s = (v >>> 0) || 1; },
    getState() { return s; },
    setState(v) { s = (v >>> 0) || 1; },
    // mulberry32
    next() {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    range(a, b) { return a + (b - a) * R.next(); },
    int(a, b) { return Math.floor(a + (b - a + 1) * R.next()); },
    chance(p) { return R.next() < p; },
    pick(arr) { return arr[Math.floor(R.next() * arr.length)]; },
    normal(mu = 0, sd = 1) {
      let u = 0;
      while (!u) u = R.next();
      const v = R.next();
      return mu + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(R.next() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
    // pick one item using weight function
    weighted(items, wfn) {
      let total = 0;
      const ws = items.map(it => { const w = Math.max(0, wfn(it)); total += w; return w; });
      if (total <= 0) return R.pick(items);
      let x = R.next() * total;
      for (let i = 0; i < items.length; i++) { x -= ws[i]; if (x <= 0) return items[i]; }
      return items[items.length - 1];
    },
    // pick n distinct items by weight
    weightedN(items, n, wfn) {
      const pool = items.slice();
      const out = [];
      while (out.length < n && pool.length) {
        const it = R.weighted(pool, wfn);
        out.push(it);
        pool.splice(pool.indexOf(it), 1);
      }
      return out;
    },
  };

  const U = {
    clamp(v, a, b) { return v < a ? a : v > b ? b : v; },
    round(v, d = 0) { const m = Math.pow(10, d); return Math.round(v * m) / m; },
    sum(arr, fn = x => x) { let t = 0; for (const x of arr) t += fn(x); return t; },
    avg(arr, fn = x => x) { return arr.length ? U.sum(arr, fn) / arr.length : 0; },
    maxBy(arr, fn) { let best = null, bv = -Infinity; for (const x of arr) { const v = fn(x); if (v > bv) { bv = v; best = x; } } return best; },
    money(v) {
      const neg = v < 0; v = Math.abs(v);
      let s;
      if (v >= 1e6) s = '€' + (v / 1e6).toFixed(v >= 1e7 ? 1 : 2) + 'M';
      else if (v >= 1e3) s = '€' + Math.round(v / 1e3) + 'k';
      else s = '€' + Math.round(v);
      return neg ? '-' + s : s;
    },
    time(sec) {
      sec = Math.round(sec);
      const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
      return (h ? h + 'h' + String(m).padStart(2, '0') + "'" : m + "'") + String(s).padStart(2, '0') + '"';
    },
    gap(sec) {
      sec = Math.round(sec);
      if (sec <= 0) return 's.t.';
      const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
      if (h) return '+' + h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
      return '+' + m + ':' + String(s).padStart(2, '0');
    },
    ordinal(n) {
      const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
      return n + (s[(v - 20) % 10] || s[v] || s[0]);
    },
    esc(str) {
      return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    },
  };

  PCM.R = R;
  PCM.U = U;
})();
