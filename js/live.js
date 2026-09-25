// Live stage: steps the kilometre-by-kilometre simulation in real time and lets the player give orders.
var PCM = globalThis.PCM || (globalThis.PCM = {});

PCM.Live = (function () {
  const { U, Riders } = PCM;
  const MS_PER_KM = 700; // 1× speed: a 180 km stage takes about two minutes
  let st = null;

  const ORDER_HELP = {
    auto: 'Let the team car decide',
    follow: 'Stay in the wheels',
    pull: 'Ride on the front: raises the group\'s pace, costs energy',
    help: 'Drop back to the leader and pace him',
    save: 'Sit at the back and save energy (easier to lose the wheel)',
  };

  function energyClass(e) { return e >= 60 ? 'hi' : e >= 30 ? 'mid' : 'lo'; }
  function name(r) { return U.esc(Riders.shortName(r)); }

  function start(container, { sim, G, race, stage, onDone }) {
    if (!container) return;
    const prev = st && st.sim === sim ? st : null;
    stop();
    st = {
      container, sim, G, race, stage, onDone, raf: null, last: null, acc: 0,
      speed: prev ? prev.speed : 1, paused: prev ? prev.paused : false, finished: sim.done && !!prev && prev.finished,
      el: {
        markers: container.querySelector('#markers'), togo: container.querySelector('#lv-togo'), where: container.querySelector('#lv-where'),
        time: container.querySelector('#lv-time'), groups: container.querySelector('#lv-groups'), mine: container.querySelector('#lv-mine'),
        feed: container.querySelector('#lv-feed'), done: container.querySelector('#lv-done'), pause: container.querySelector('[data-act=livepause]'),
      },
    };
    buildMine();
    rebuildFeed();
    markSpeed();
    draw();
    if (sim.done) finishUp();
    else st.raf = requestAnimationFrame(frame);
  }

  function frame(ts) {
    if (!st) return;
    if (st.last == null) st.last = ts;
    const dt = Math.min(250, ts - st.last);
    st.last = ts;
    if (!st.paused && !st.sim.done) {
      st.acc += dt * st.speed;
      let stepped = false;
      while (st.acc >= MS_PER_KM && !st.sim.done) { PCM.StageSim.step(st.sim); st.acc -= MS_PER_KM; stepped = true; }
      if (stepped) draw();
    }
    if (st.sim.done) { draw(); finishUp(); return; }
    st.raf = requestAnimationFrame(frame);
  }

  function finishUp() {
    if (!st) return;
    if (!st.finished) { st.finished = true; st.onDone && st.onDone(); }
    if (st.el.done) st.el.done.hidden = false;
    if (st.el.pause) st.el.pause.disabled = true;
  }

  // ---------------- drawing ----------------
  function draw() {
    const { sim, el } = st;
    const v = PCM.StageSim.view(sim);
    const geom = PCM.UI.profileGeom(st.stage);
    // markers: the first three groups plus any group holding one of our riders
    const shown = v.groups.filter((g, i) => i < 3 || g.riders.some(x => x.mine)).slice(0, 5);
    el.markers.innerHTML = shown.map((g, i) => {
      const km = Math.max(0, v.km - g.gap / 80);
      const x = geom.xkm(km), y = geom.ykm(km);
      const mine = g.riders.some(r => r.mine);
      const anchor = x > 900 ? 'end' : x < 100 ? 'start' : 'middle';
      return `<g class="marker ${i === 0 ? 'm-brk' : 'm-pel'}${mine ? ' m-mine' : ''}" transform="translate(${x.toFixed(1)},${y.toFixed(1)})"><circle r="${g.size > 15 ? 8 : 6}"/>` +
        `<text y="${[-12, 24, -26, 38, -40][i]}" text-anchor="${anchor}">${g.label}${g.size > 1 ? ' (' + g.size + ')' : ''}${g.gap ? ' ' + U.gap(g.gap) : ''}</text></g>`;
    }).join('');
    el.togo.textContent = Math.max(0, v.togo).toFixed(0) + ' km';
    el.where.textContent = sim.done ? 'Finish' : v.where;
    el.time.textContent = U.time(v.time);

    // groups on the road
    const G = st.G;
    el.groups.innerHTML = v.groups.slice(0, 8).map(g => {
      const mine = g.riders.filter(x => x.mine);
      const others = g.riders.filter(x => !x.mine && (x.gcPos <= 5 || (x.role === 'leader' && x.r.a && Riders.ovr(x.r) >= 82))).sort((a, b) => a.gcPos - b.gcPos).slice(0, 4);
      const names = mine.map(x => `<b class="mine-name">${name(x.r)}</b>`).concat(others.map(x => name(x.r) + (x.gcPos <= 3 && !sim.oneday ? ` <span class="jer ${x.gcPos === 1 ? 'y' : 'w'}">${x.gcPos === 1 ? 'GC' : x.gcPos}</span>` : ''))).join(', ');
      return `<div class="lgroup${mine.length ? ' has-mine' : ''}"><div class="row between"><b>${g.label}</b><span class="num">${g.size} rider${g.size > 1 ? 's' : ''} · ${g.gap ? U.gap(g.gap) : 'leading'}</span></div>
        ${names ? `<div class="small">${names}${g.size > mine.length + others.length ? ' …' : ''}</div>` : ''}</div>`;
    }).join('') + (v.groups.length > 8 ? `<div class="small muted">+ ${v.groups.length - 8} more groups</div>` : '');

    // our riders
    for (const x of sim.riders.filter(x => x.mine)) {
      const row = el.mine.querySelector(`[data-rid="${x.rid}"]`);
      if (!row) continue;
      const g = PCM.StageSim.groupOf(sim, x);
      const label = x.out ? 'Abandoned' : g ? (v.groups.find(vg => vg.id === g.id) || {}).label + (g.t - (sim.groups[0] ? sim.groups[0].t : 0) > 0 ? ' ' + U.gap(g.t - sim.groups[0].t) : '') : '';
      row.querySelector('.lv-where').textContent = label;
      const bar = row.querySelector('.meter > i');
      bar.style.width = Math.max(0, x.energy) + '%';
      row.querySelector('.meter').className = 'meter energy ' + energyClass(x.energy);
      row.querySelector('.lv-e').textContent = Math.round(x.energy);
      row.querySelector('.lv-act').textContent = x.burst > 0 ? 'Attacking!' : x.act === 'pull' ? 'On the front' : x.act === 'help' ? 'Helping leader' : x.act === 'save' ? 'Saving energy' : '';
      const sel = row.querySelector('select');
      if (sel && document.activeElement !== sel && sel.value !== x.order) sel.value = x.order;
      const btn = row.querySelector('[data-act=liveattack]');
      if (btn) btn.disabled = x.out || sim.done || x.burst > 0 || x.cooldown > 0 || x.energy < 8;
      if (x.out) { row.classList.add('out'); if (sel) sel.disabled = true; }
    }

    // commentary
    while (st.shownEv < sim.events.length) addEvent(sim.events[st.shownEv++]);
  }

  function buildMine() {
    const { sim, el } = st;
    const mine = sim.riders.filter(x => x.mine);
    if (!mine.length) { el.mine.innerHTML = '<div class="empty">None of our riders are racing.</div>'; return; }
    el.mine.innerHTML = mine.map(x => `<div class="lv-rider" data-rid="${x.rid}">
      <div class="row between"><span><b>${name(x.r)}</b> <span class="small muted">${{ leader: 'Leader', sprinter: 'Sprinter', dom: 'Domestique', free: 'Free role' }[x.role] || ''}</span></span><span class="small lv-where"></span></div>
      <div class="row lv-energy"><span class="label">Energy</span><div class="meter energy"><i></i></div><b class="num lv-e"></b><span class="small lv-act"></span></div>
      <div class="row">
        <select data-change="liveorder" data-id="${x.rid}" aria-label="Order for ${name(x.r)}">${Object.entries(PCM.StageSim.ORDERS).map(([k, l]) => `<option value="${k}" title="${ORDER_HELP[k]}" ${x.order === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <button class="btn sm" data-act="liveattack" data-id="${x.rid}" title="Launch an attack: a big effort for a few kilometres">Attack</button>
      </div></div>`).join('');
  }

  function rebuildFeed() {
    st.el.feed.innerHTML = '';
    st.shownEv = 0;
    addEvent({ km: 0, kind: 'start', rids: [] });
  }
  function addEvent(ev) {
    const mineSet = new Set(st.sim.riders.filter(x => x.mine).map(x => x.rid));
    const div = document.createElement('div');
    div.className = 'ev' + ((ev.rids || []).some(id => mineSet.has(id)) ? ' mine' : '');
    div.innerHTML = `<span class="km">${ev.kind === 'finish' ? 'Finish' : 'km ' + Math.round(ev.km)}</span><span>${PCM.UI.evText(ev, st.race, st.stage)}</span>`;
    st.el.feed.prepend(div);
  }
  function addFinish(results) {
    if (!st || !results || !results.length) return;
    addEvent({ km: st.stage.km, kind: 'finish', rids: results.slice(0, 3).map(r => r[0]) });
  }

  function markSpeed() {
    if (!st) return;
    st.container.querySelectorAll('[data-act=livespeed]').forEach(b => b.classList.toggle('primary', +b.dataset.s === st.speed));
    if (st.el.pause) st.el.pause.textContent = st.paused ? '▶ Resume' : '⏸ Pause';
  }

  // ---------------- controls ----------------
  function stop() { if (st && st.raf) cancelAnimationFrame(st.raf); if (st) { st.raf = null; st.last = null; } }
  function speed(s) { if (st) { st.speed = s; st.paused = false; markSpeed(); } }
  function togglePause() { if (st && !st.sim.done) { st.paused = !st.paused; markSpeed(); } }
  function skip() {
    if (!st) return;
    while (!st.sim.done) PCM.StageSim.step(st.sim);
    draw();
    finishUp();
  }
  function refresh() { if (st) draw(); }

  return { start, stop, speed, togglePause, skip, refresh, addFinish };
})();
