// UI: renders every screen from game state. Event handling is delegated via data-act / data-change attributes.
var PCM = globalThis.PCM || (globalThis.PCM = {});

PCM.UI = (function () {
  const { U, DATA, Riders, Race, Game } = PCM;
  const h = U.esc;
  const W = DATA.SEASON_WEEKS;

  let G = null;
  let root = null;
  let toastTimer = null;
  const S = {
    view: 'dashboard', squadSort: { k: 'ovr', d: -1 }, mktSort: { k: 'ovr', d: -1 },
    mkt: { q: '', spec: '', maxAge: '', minOvr: '', maxSal: '', fa: false },
    raceTab: 'stage', stageView: null, sel: null, tactic: 'bal', live: null, modal: null, standTab: 'teams',
    newTeam: null, world: 'fictional', slots: null, saveStatus: '', confirmDel: null, toast: '', io: '', ioMsg: '',
  };

  // ---------- small helpers ----------
  const flag = nat => DATA.natFlag(nat);
  const me = () => Game.player(G);
  const isMine = rid => G.riders[rid] && G.riders[rid].teamId === G.playerTeamId;
  function rLink(r, full) {
    if (!r) return '<span class="muted">(retired)</span>';
    return `<a class="rname" data-act="rider" data-id="${r.id}" tabindex="0">${flag(r.nat)} ${h(full ? Riders.fullName(r) : Riders.shortName(r))}</a>`;
  }
  function tCell(tid) {
    const t = G.teams[tid];
    if (!t) return '<span class="muted">Free agent</span>';
    return `<span class="tdot" style="background:${t.c1}"></span>${h(t.name)}`;
  }
  function jersey(t) { return `<span class="jersey" style="background:linear-gradient(135deg, ${t.c1} 55%, ${t.c2} 55%)"></span>`; }
  function aCls(v) { return v >= 80 ? 'a5' : v >= 75 ? 'a4' : v >= 70 ? 'a3' : v >= 65 ? 'a2' : 'a1'; }
  function stars(pot) {
    const n = U.clamp((pot - 60) / 5, 0.5, 5);
    const full = Math.floor(n), half = n - full >= 0.5;
    let s = '★'.repeat(full) + (half ? '½' : '');
    return `<span class="stars" title="Potential ${pot.toFixed(0)}">${s}<span class="off">${'★'.repeat(5 - full - (half ? 1 : 0))}</span></span>`;
  }
  // scouting fog: other teams' potential is an estimate
  function scoutPot(r) { return isMine(r.id) ? r.pot : r.pot + (((r.id * 37) % 5) - 2) * 0.9; }
  function meter(v, cls) { return `<div class="meter ${cls || ''}" title="${Math.round(v)}"><i style="width:${U.clamp(v, 0, 100)}%"></i></div>`; }
  const TYPE_LABEL = { flat: 'Flat', hilly: 'Hilly', mountain: 'Mountain', itt: 'Time trial', cobbles: 'Cobbles' };
  function sType(st) { return `<span class="stype ${st.type}">${st.type === 'mountain' && st.summit ? 'Summit finish' : TYPE_LABEL[st.type]}</span>`; }
  function clsPill(c) { return `<span class="pill ${c}">${{ GT: 'Grand Tour', WT: 'WorldTour', PRO: 'ProSeries', MON: 'Monument', CL: 'Classic' }[c]}</span>`; }
  function spec(r) { return DATA.SPECIALTIES[Riders.specialty(r)].label; }
  function age(r) { return Riders.age(r, G.year); }
  function sortRows(rows, sort, getters) {
    const g = getters[sort.k] || getters.ovr;
    return rows.sort((a, b) => { const x = g(a), y = g(b); return (x > y ? 1 : x < y ? -1 : 0) * sort.d; });
  }
  function th(label, key, sort, act, cls = '') {
    const arrow = sort.k === key ? (sort.d < 0 ? ' ▾' : ' ▴') : '';
    return `<th class="sort ${cls}" data-act="${act}" data-k="${key}">${label}${arrow}</th>`;
  }
  function toast(msg) {
    S.toast = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { S.toast = ''; const t = document.querySelector('.toast'); if (t) t.remove(); }, 3200);
  }
  function commit(urgent) { if (G) PCM.Saves.autosave(G, urgent); render(); }

  // ---------- saving ----------
  function ago(iso) {
    if (!iso) return 'earlier';
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' h ago';
    if (s < 172800) return 'yesterday';
    return new Date(iso).toLocaleDateString();
  }
  function refreshSlots() { PCM.Saves.list().then(l => { S.slots = l; render(); }).catch(() => {}); }
  function slotsHtml(inGame) {
    if (!S.slots) return '<div class="empty">Loading saves…</div>';
    return `<div class="tablewrap"><table><tbody>${S.slots.map(sl => {
      const label = PCM.Saves.slotLabel(sl.slot);
      const info = sl.empty ? '<span class="muted">Empty</span>' : `<b>${h(sl.team)}</b> <span class="small muted">· ${sl.week > 41 ? 'end of' : 'week ' + sl.week} ${sl.year}${sl.world === 'real' ? ' · real peloton' : ''}</span><div class="small muted">${sl.where === 'cloud' ? 'Claude account' : 'This browser'} · ${ago(sl.savedAt)}</div>`;
      const confirm = S.confirmDel === sl.slot;
      const btns = [
        inGame && sl.slot !== 'auto' ? `<button class="btn sm ${sl.empty ? 'primary' : ''}" data-act="saveslot" data-slot="${sl.slot}">${sl.empty ? 'Save here' : 'Overwrite'}</button>` : '',
        !sl.empty ? `<button class="btn sm ${inGame ? '' : 'primary'}" data-act="loadslot" data-slot="${sl.slot}">Load</button>` : '',
        !sl.empty ? (confirm ? `<button class="btn sm danger" data-act="delslot" data-slot="${sl.slot}">Confirm delete</button>` : `<button class="btn sm danger" data-act="delslot-ask" data-slot="${sl.slot}">Delete</button>`) : '',
      ].join('');
      return `<tr><td style="width:90px"><span class="label">${label}</span></td><td style="white-space:normal">${info}</td><td class="r"><div class="row" style="justify-content:flex-end">${btns}</div></td></tr>`;
    }).join('')}</tbody></table></div>`;
  }
  function fileTools(inGame) {
    return `<div class="row">${inGame ? '<button class="btn" data-act="savefile">Save to file</button>' : ''}<label class="btn">Load from file…<input type="file" id="iofile" accept=".json,.txt" hidden></label>
        ${inGame ? '<button class="btn" data-act="copysave">Copy save code</button>' : ''}</div>
      <details ${S.io ? 'open' : ''}><summary class="small">Paste a save code</summary>
        <div class="stack" style="margin-top:8px"><textarea id="io" rows="3" placeholder="Paste a save code here">${h(S.io)}</textarea>
        <div class="row"><button class="btn" data-act="import">Load pasted code</button></div></div></details>
      ${S.ioMsg ? `<div class="msg small">${h(S.ioMsg)}</div>` : ''}`;
  }
  async function quickSave() {
    const slot = G.lastSlot || '1';
    try {
      const m = await PCM.Saves.save(G, slot);
      S.saveStatus = 'Saved ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      toast(`Saved to ${PCM.Saves.slotLabel(slot)} (${m.where === 'cloud' ? 'your Claude account' : 'this browser'})`);
    } catch (e) { toast(e.message || 'Save failed'); }
    render();
  }
  async function loadGame(fn, okMsg) {
    try {
      const g = await fn();
      G = g;
      Object.assign(S, { view: 'dashboard', sel: null, live: null, modal: null, io: '', ioMsg: '', confirmDel: null });
      commit();
      toast(okMsg || 'Career loaded');
    } catch (e) {
      S.ioMsg = e && e.message && !/JSON|Unexpected|atob|decod|invalid/i.test(e.message) ? e.message : 'That save could not be read. Check it was copied completely.';
      render();
    }
  }

  // ---------- course profile ----------
  function profileGeom(stage, o = {}) {
    const Wd = o.w || 1000, H = o.h || 220;
    const padL = o.mini ? 0 : 44, padR = o.mini ? 0 : 14, padT = o.mini ? 2 : 40, padB = o.mini ? 0 : 24;
    const pts = stage.profile;
    const max = Math.max(400, Math.max(...pts) * 1.08);
    const x = i => padL + i / (pts.length - 1) * (Wd - padL - padR);
    const y = e => padT + (1 - e / max) * (H - padT - padB);
    const xkm = km => padL + U.clamp(km / stage.km, 0, 1) * (Wd - padL - padR);
    const elevAt = km => {
      const f = U.clamp(km / stage.km, 0, 1) * (pts.length - 1);
      const i = Math.floor(f), j = Math.min(pts.length - 1, i + 1);
      return pts[i] + (pts[j] - pts[i]) * (f - i);
    };
    return { Wd, H, padL, padR, padT, padB, max, x, y, xkm, ykm: km => y(elevAt(km)), base: H - padB };
  }
  function profileSVG(stage, o = {}) {
    const g = profileGeom(stage, o);
    const pts = stage.profile;
    let d = `M${g.x(0)},${g.base}`;
    pts.forEach((e, i) => { d += ` L${g.x(i).toFixed(1)},${g.y(e).toFixed(1)}`; });
    d += ` L${g.x(pts.length - 1)},${g.base} Z`;
    let edge = 'M' + pts.map((e, i) => `${g.x(i).toFixed(1)},${g.y(e).toFixed(1)}`).join(' L');
    if (o.mini) {
      return `<svg viewBox="0 0 ${g.Wd} ${g.H}" preserveAspectRatio="none" aria-hidden="true"><path class="area" d="${d}"/></svg>`;
    }
    let axis = '';
    const step = stage.km > 150 ? 50 : stage.km > 60 ? 20 : 5;
    for (let k = 0; k <= stage.km; k += step) axis += `<text x="${g.xkm(k)}" y="${g.H - 6}" text-anchor="middle">${k}</text>`;
    axis += `<text x="${g.padL - 6}" y="${g.y(0)}" text-anchor="end">0 m</text><text x="${g.padL - 6}" y="${g.y(g.max) + 10}" text-anchor="end">${Math.round(g.max / 100) * 100}</text>`;
    let climbs = '';
    stage.climbs.forEach(c => {
      const cx = g.xkm(c.km), cy = g.ykm(c.km);
      const lab = c.cat === 'HC' ? 'HC' : c.cat;
      climbs += `<g class="climb"><title>${h(c.name)} · ${c.cat === 'HC' ? 'HC' : 'Cat. ' + c.cat} · ${c.len} km at ${c.grade}%</title>
        <line x1="${cx}" y1="${cy}" x2="${cx}" y2="${g.padT - 12}" stroke="currentColor" stroke-dasharray="2 3" opacity=".45"/>
        <circle class="cat" cx="${cx}" cy="${g.padT - 22}" r="10"/><text class="cat-t" x="${cx}" y="${g.padT - 18.5}" text-anchor="middle">${lab}</text></g>`;
    });
    const fx = g.xkm(stage.km);
    const finish = `<rect class="flag" x="${fx - 3}" y="${g.ykm(stage.km) - 18}" width="3" height="18"/><rect class="flag" x="${fx - 13}" y="${g.ykm(stage.km) - 18}" width="10" height="7"/>`;
    return `<svg viewBox="0 0 ${g.Wd} ${g.H}" role="img" aria-label="Stage profile, ${stage.km} km">
      <g class="axis">${axis}</g><path class="area" d="${d}"/><path class="edge" d="${edge}"/>${climbs}${finish}${o.extra || ''}</svg>`;
  }

  // ---------- shell ----------
  function continueLabel() {
    if (G.fired) return 'Find a new job';
    const cr = Game.currentRace(G);
    if (cr && cr.status !== 'done') return cr.status === 'running' ? 'Back to race' : 'Go to race';
    if (G.week > W) return 'End season';
    return 'Continue ▸';
  }
  function topbar() {
    const t = me();
    const nr = Game.nextRace(G);
    const sub = G.week > W ? 'Season finished' : nr ? (nr.week <= G.week ? 'Race week: ' + nr.name : 'Next: ' + nr.name + ' (wk ' + nr.week + ')') : '';
    return `<header class="topbar">
      <div class="brand">PCM<b>26</b></div>
      <div class="teamtag">${jersey(t)}<span class="name">${h(t.name)}</span></div>
      <div class="spacer"></div>
      <div class="clock"><div class="wk">${G.week > W ? 'Off-season' : 'Week ' + G.week} · ${G.year}</div><div class="sub small muted">${h(sub)}</div></div>
      <div class="cash num ${t.cash < 0 ? 'neg' : ''}" title="Bank balance">${U.money(t.cash)}</div>
      <button class="btn savebtn" data-act="quicksave" title="Save to ${h(PCM.Saves.slotLabel(G.lastSlot || '1'))} (Ctrl+S)">Save</button>
      <button class="btn go" data-act="continue">${continueLabel()}</button>
    </header>`;
  }
  const NAV = [['dashboard', 'Home'], ['squad', 'Squad'], ['race', 'Race'], ['calendar', 'Calendar'], ['standings', 'Standings'],
    ['transfers', 'Transfers'], ['finances', 'Finances'], ['club', 'Club'], ['options', 'Game']];
  function nav() {
    const cr = Game.currentRace(G);
    const pending = cr && cr.status !== 'done';
    return `<nav class="nav">${NAV.map(([k, l]) => `<button class="${S.view === k ? 'on' : ''}" data-act="nav" data-view="${k}">${l}${k === 'race' && pending ? '<span class="dot"></span>' : ''}</button>`).join('')}</nav>`;
  }

  function render() {
    if (!root) return;
    if (S.live && S.view !== 'race') { PCM.Live.stop(); S.live = null; }
    if (!G) { root.innerHTML = newGameView() + toastHtml(); return; }
    const scrollY = window.scrollY;
    const liveRunning = S.live && document.getElementById('live');
    if (liveRunning) PCM.Live.stop();
    root.innerHTML = `<div class="app">${topbar()}${nav()}<main class="main" id="view">${viewHtml()}</main></div>${modalHtml()}${toastHtml()}`;
    window.scrollTo(0, scrollY);
    if (S.live) {
      const race = G.calendar.find(r => r.id === S.live.raceId);
      PCM.Live.start(document.getElementById('live'), { G, race, stage: race.stages[S.live.sr.n - 1], sr: S.live.sr, onDone: () => { S.live.done = true; } });
    }
  }
  function toastHtml() { return S.toast ? `<div class="toast" role="status">${h(S.toast)}</div>` : ''; }

  function viewHtml() {
    switch (S.view) {
      case 'squad': return squadView();
      case 'race': return raceView();
      case 'calendar': return calendarView();
      case 'standings': return standingsView();
      case 'transfers': return transfersView();
      case 'finances': return financesView();
      case 'club': return clubView();
      case 'options': return optionsView();
      default: return dashboardView();
    }
  }

  // ---------- new game ----------
  function newGameView() {
    const real = S.world === 'real' && Game.realAvailable();
    const worldPick = !Game.realAvailable() ? '' : `<div class="row"><span class="label">Rider database</span>
        <button class="btn sm ${real ? '' : 'primary'}" data-act="world" data-w="fictional">Fictional world</button>
        <button class="btn sm ${real ? 'primary' : ''}" data-act="world" data-w="real" ${Game.realAvailable() ? '' : 'disabled'}>Real peloton ${Game.realAvailable() ? PCM.REAL.season : ''}</button>
        <span class="small muted">${Game.realAvailable() ? (real ? `Real riders and races. ${PCM.REAL.teams.reduce((n, t) => n + t.riders.length, 0)} riders from ${h(PCM.REAL.source || 'public data')}; ratings are estimates.` : 'Generated riders, teams and races.') : 'Real peloton not installed: run <code>npm run build:real</code>.'}</span></div>`;
    const cards = Game.teamDefs(real ? 'real' : 'fictional').map(t => `<button class="teamcard ${S.newTeam === t.id ? 'on' : ''}" data-act="pickteam" data-id="${t.id}">
        <div class="kit" style="background:linear-gradient(90deg, ${t.c1} 70%, ${t.c2} 70%)"></div>
        <h3>${h(t.name)}</h3>
        <div class="row between small"><span>${flag(t.nat)} ${h(DATA.natName(t.nat))}</span>${stars(60 + t.prestige * 5)}</div>
        ${t.riders ? `<div class="small muted">Leaders: ${h(t.riders.slice().sort((a, b) => b.level - a.level).slice(0, 2).map(x => x.last).join(', '))}</div>` : ''}
        <div class="small muted">${['Underdog wildcard squad', 'Small budget, big ambitions', 'Solid mid-table WorldTour team', 'Contender with star riders', 'Superteam: win everything'][t.prestige - 1]}</div>
      </button>`).join('');
    return `<div class="intro">
      <div class="stack">
        <div class="label">Pro cycling team manager</div>
        <h1>PCM<b style="background:var(--leader);color:var(--leader-ink);padding:0 8px;border-radius:4px;margin-left:4px">26</b> · Directeur Sportif</h1>
        <p class="lede">Take charge of a professional road team. Pick riders for 25 races from the spring Classics to three Grand Tours, set tactics stage by stage, train your squad, balance the books and sign the next generation of champions.</p>
      </div>
      ${S.slots && S.slots.some(x => !x.empty) ? `<div class="panel"><header><h2>Continue your career</h2><span class="small muted">Saves in ${PCM.Saves.where() === 'Claude account' ? 'your Claude account and this browser' : 'this browser'}</span></header>${slotsHtml(false)}</div>` : ''}
      <div class="panel">
        <header><h2>Choose your team</h2><span class="muted small">Stars show the team's standing. Bigger teams have deeper squads and tougher board objectives.</span></header>
        ${worldPick}
        <div class="teamcards">${cards}</div>
        <div class="row">
          <div class="field"><label class="label" for="mgr">Your name</label><input type="text" id="mgr" maxlength="30" value="${h(S.mgr || '')}" placeholder="Manager"></div>
          <div class="field"><label class="label" for="cname">Rename team (optional)</label><input type="text" id="cname" maxlength="40" value="${h(S.cname || '')}" placeholder="Keep original name"></div>
          <div class="spacer" style="flex:1"></div>
          <button class="btn go" data-act="startgame" ${S.newTeam ? '' : 'disabled'}>Start career ▸</button>
        </div>
      </div>
      <div class="panel">
        <h3>Load a save file or code</h3>
        ${fileTools(false)}
      </div>
    </div>`;
  }

  // ---------- dashboard ----------
  function dashboardView() {
    const t = me();
    const rank = Game.teamRanking(G).indexOf(t) + 1;
    const nr = Game.nextRace(G);
    let nextPanel;
    if (nr) {
      const now = nr.week <= G.week;
      nextPanel = `<div class="panel"><header><h3>${now ? 'This week' : 'Next race'}</h3>${clsPill(nr.cls)}</header>
        <div><h2>${flag(nr.country)} ${h(nr.name)}</h2><div class="muted small">Week ${nr.week}${nr.weeks > 1 ? '–' + (nr.week + nr.weeks - 1) : ''} · ${nr.kind === 'oneday' ? 'One-day race, ' + nr.stages[0].km + ' km' : nr.stages.length + ' stages'}</div></div>
        <div class="row">${nr.stages.slice(0, 21).map(s => `<div class="mini" title="Stage ${s.n}: ${TYPE_LABEL[s.type]} ${s.km} km">${profileSVG(s, { mini: true, w: 120, h: 28 })}</div>`).join('')}</div>
        <div class="row">${now ? `<button class="btn primary" data-act="nav" data-view="race">Open race</button>` : `<span class="muted small">${nr.week - G.week} week(s) away</span>`}<button class="btn" data-act="nav" data-view="calendar">Calendar</button></div></div>`;
    } else {
      nextPanel = `<div class="panel"><h3>Season complete</h3><p>All races are done. Press <b>End season</b> to review the year and move on.</p></div>`;
    }
    const objs = G.board.objectives.map(o => { const e = Game.evalObjective(G, o); return `<div class="obj"><span>${h(o.text)}</span><span class="pill ${e.done ? 'good' : 'warn'}">${h(e.progress)}</span></div>`; }).join('');
    const riders = t.riders.map(id => G.riders[id]);
    const inForm = riders.slice().sort((a, b) => b.form - a.form).slice(0, 5);
    const injured = riders.filter(r => r.injury > 0);
    const tired = riders.filter(r => r.fatigue >= 45).sort((a, b) => b.fatigue - a.fatigue).slice(0, 5);
    return `<div class="pagehead"><div><div class="label">Sports director · ${h(G.manager)}</div><h1>${h(t.name)}</h1></div>
      <div class="stats">
        <div class="stat"><span class="label">Team ranking</span><span class="v">${U.ordinal(rank)}</span></div>
        <div class="stat"><span class="label">UCI points</span><span class="v num">${t.season.pts}</span></div>
        <div class="stat"><span class="label">Wins</span><span class="v num">${t.season.wins}</span></div>
        <div class="stat"><span class="label">Board</span><span class="v num">${G.board.confidence}%</span></div>
      </div></div>
      <div class="grid g2">
        ${nextPanel}
        <div class="panel"><header><h3>Board objectives</h3><button class="btn sm" data-act="nav" data-view="club">Club</button></header>${objs}</div>
        <div class="panel"><header><h3>Inbox</h3></header>${G.inbox.slice(0, 5).map(m => `<div class="inbox-item"><div class="row between"><b>${h(m.title)}</b><span class="small muted">Wk ${m.week}, ${m.year}</span></div><p class="small">${h(m.body)}</p></div>`).join('') || '<div class="empty">No messages</div>'}</div>
        <div class="panel"><header><h3>Squad status</h3><button class="btn sm" data-act="nav" data-view="squad">Squad</button></header>
          <div><div class="label">Best form</div>${inForm.map(r => `<div class="row between small">${rLink(r)}<span class="num">${Math.round(r.form)}</span></div>`).join('')}</div>
          <div><div class="label">Injured</div>${injured.length ? injured.map(r => `<div class="row between small">${rLink(r)}<span class="pill bad">${r.injury} wk</span></div>`).join('') : '<span class="small muted">Nobody</span>'}</div>
          <div><div class="label">Tired (fatigue 45+)</div>${tired.length ? tired.map(r => `<div class="row between small">${rLink(r)}<span class="num">${Math.round(r.fatigue)}</span></div>`).join('') : '<span class="small muted">Everyone is fresh</span>'}</div>
        </div>
        <div class="panel"><header><h3>Peloton news</h3></header><ul class="plain news small">${G.news.slice(0, 12).map(n => `<li class="${n.mine ? 'mine' : ''}"><span class="muted">Wk ${n.week}</span> ${h(n.text)}</li>`).join('') || '<li class="muted">The season has not started yet.</li>'}</ul></div>
      </div>`;
  }

  // ---------- squad ----------
  const riderGetters = {
    name: r => r.last, age: r => -r.born, spec: r => Riders.specialty(r), ovr: r => Riders.ovr(r), pot: r => r.pot,
    form: r => r.form, fatigue: r => r.fatigue, days: r => r.season.days, wins: r => r.season.wins, pts: r => r.season.pts,
    contract: r => r.contractEnd, salary: r => r.salary, team: r => r.teamId || '', ask: r => Riders.salaryAsk(r, G.year),
  };
  DATA.ATTRS.forEach(a => { riderGetters[a.k] = r => r.a[a.k]; });

  function squadView() {
    const t = me();
    const riders = sortRows(t.riders.map(id => G.riders[id]), S.squadSort, riderGetters);
    const expiring = riders.filter(r => r.contractEnd <= G.year).length;
    const s = S.squadSort;
    const rows = riders.map(r => `<tr class="click" data-act="rider" data-id="${r.id}">
      <td>${rLink(r)}${r.injury ? ' <span class="pill bad">inj ' + r.injury + 'w</span>' : ''}</td>
      <td class="r">${age(r)}</td><td>${spec(r)}</td>
      <td class="at ${aCls(Riders.ovr(r))}">${Riders.ovr(r).toFixed(0)}</td><td>${stars(r.pot)}</td>
      ${DATA.ATTRS.map(a => `<td class="at ${aCls(r.a[a.k])}">${Math.round(r.a[a.k])}</td>`).join('')}
      <td class="r">${Math.round(r.form)}</td><td class="r" style="color:${r.fatigue > 50 ? 'var(--bad)' : 'inherit'}">${Math.round(r.fatigue)}</td>
      <td class="r">${r.season.days}</td><td class="r">${r.season.wins}</td><td class="r">${r.season.pts}</td>
      <td class="r">${r.contractEnd <= G.year ? `<span class="pill warn">${r.contractEnd}</span>` : r.contractEnd}</td><td class="r">${U.money(r.salary)}</td>
      <td><select data-change="plan" data-id="${r.id}" aria-label="Training load">${Object.entries(DATA.TRAINING_LOAD).map(([k, v]) => `<option value="${k}" ${r.plan === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></td>
      <td><select data-change="focus" data-id="${r.id}" aria-label="Training focus">${Object.entries(DATA.TRAINING_FOCUS).map(([k, v]) => `<option value="${k}" ${r.focus === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></td>
    </tr>`).join('');
    return `<div class="pagehead"><div><div class="label">${h(t.name)}</div><h1>Squad</h1></div>
      <div class="stats">
        <div class="stat"><span class="label">Riders</span><span class="v num">${t.riders.length}/${Game.MAX_ROSTER}</span></div>
        <div class="stat"><span class="label">Payroll / yr</span><span class="v num">${U.money(Game.payroll(G, t))}</span></div>
        <div class="stat"><span class="label">Team strength</span><span class="v num">${Game.teamStrength(G, t).toFixed(1)}</span></div>
        <div class="stat"><span class="label">Expiring</span><span class="v num">${expiring}</span></div>
      </div></div>
      <div class="panel">
        <div class="row between"><div class="row small"><span class="label">Set everyone's training load</span>${Object.entries(DATA.TRAINING_LOAD).map(([k, v]) => `<button class="btn sm" data-act="bulkplan" data-plan="${k}">${v.label}</button>`).join('')}</div>
        <span class="small muted">Intense training builds form and develops young riders faster but adds fatigue. Rest clears fatigue.</span></div>
        <div class="tablewrap"><table>
          <thead><tr>${th('Rider', 'name', s, 'sortsquad')}${th('Age', 'age', s, 'sortsquad', 'r')}${th('Type', 'spec', s, 'sortsquad')}${th('OVR', 'ovr', s, 'sortsquad', 'c')}${th('POT', 'pot', s, 'sortsquad')}
          ${DATA.ATTRS.map(a => th(a.label, a.k, s, 'sortsquad', 'c')).join('')}
          ${th('Form', 'form', s, 'sortsquad', 'r')}${th('Fat', 'fatigue', s, 'sortsquad', 'r')}${th('Days', 'days', s, 'sortsquad', 'r')}${th('Wins', 'wins', s, 'sortsquad', 'r')}${th('Pts', 'pts', s, 'sortsquad', 'r')}
          ${th('Until', 'contract', s, 'sortsquad', 'r')}${th('Salary', 'salary', s, 'sortsquad', 'r')}<th>Load</th><th>Focus</th></tr></thead>
          <tbody>${rows}</tbody></table></div>
      </div>`;
  }

  // ---------- race ----------
  function ensureSelection(race) {
    if (S.sel && S.sel.raceId === race.id) return;
    const picks = {};
    for (const p of Race.selectRoster(G, me(), race)) picks[p.rid] = p.role;
    S.sel = { raceId: race.id, picks };
  }
  function raceView() {
    const race = Game.currentRace(G);
    if (!race) {
      const nr = Game.nextRace(G);
      return `<div class="pagehead"><div><div class="label">Race</div><h1>No race this week</h1></div></div>
        <div class="panel"><p>${nr ? `Next up: <b>${h(nr.name)}</b> in week ${nr.week}. Press <b>Continue</b> to move to the next week.` : 'The season is over.'}</p>
        <div class="row"><button class="btn primary" data-act="tonextrace">Skip to next race week ▸▸</button></div></div>`;
    }
    if (race.status === 'upcoming') return preRaceView(race);
    return runningRaceView(race);
  }

  function stageTable(race) {
    return `<div class="tablewrap"><table><thead><tr><th>#</th><th>Type</th><th class="r">Km</th><th>Profile</th><th>Main climbs</th></tr></thead><tbody>
      ${race.stages.map(s => `<tr class="${race.cur === s.n - 1 && race.status === 'running' ? 'mine' : ''}"><td class="pos">${s.n}</td><td>${sType(s)}</td><td class="r">${s.km}</td>
        <td class="mini">${profileSVG(s, { mini: true, w: 120, h: 28 })}</td>
        <td class="small">${s.climbs.filter(c => c.cat === 'HC' || +c.cat <= 2).slice(-3).map(c => h(c.name) + ' (' + (c.cat === 'HC' ? 'HC' : c.cat) + ')').join(', ') || (s.sectors ? s.sectors + ' cobbled sectors' : '<span class="muted">–</span>')}</td></tr>`).join('')}
    </tbody></table></div>`;
  }

  function preRaceView(race) {
    ensureSelection(race);
    const n = Race.rosterSize(race);
    const picks = S.sel.picks;
    const count = Object.keys(picks).length;
    const riders = me().riders.map(id => G.riders[id]).sort((a, b) => Race.raceKey(b, race) - Race.raceKey(a, race));
    const rows = riders.map(r => {
      const on = picks[r.id] !== undefined;
      const dis = r.injury > 0;
      return `<tr class="${on ? 'mine' : ''}">
        <td><input type="checkbox" data-change="pick" data-id="${r.id}" ${on ? 'checked' : ''} ${dis ? 'disabled' : ''} aria-label="Select ${h(Riders.fullName(r))}"></td>
        <td>${rLink(r)}${dis ? ' <span class="pill bad">injured</span>' : ''}</td><td>${spec(r)}</td>
        <td class="at ${aCls(Riders.ovr(r))}">${Riders.ovr(r).toFixed(0)}</td>
        <td class="at ${aCls(Race.raceKey(r, race))}" title="How well this rider suits this race">${Race.raceKey(r, race).toFixed(0)}</td>
        <td class="at ${aCls(Race.sprintKey(r))}">${Race.sprintKey(r).toFixed(0)}</td>
        <td>${meter(r.form, 'form')}</td><td>${meter(r.fatigue, 'fat')}</td><td class="r">${r.season.days}</td>
        <td>${on ? `<select data-change="role" data-id="${r.id}" aria-label="Role">${[['leader', 'Leader'], ['sprinter', 'Sprinter'], ['dom', 'Domestique'], ['free', 'Free role']].map(([k, l]) => `<option value="${k}" ${picks[r.id] === k ? 'selected' : ''}>${l}</option>`).join('')}</select>` : ''}</td>
      </tr>`;
    }).join('');
    const leaders = Object.values(picks).filter(x => x === 'leader').length;
    const warn = leaders === 0 ? 'No leader selected: nobody will get team support.' : leaders > 1 ? 'More than one leader splits the team: only the first gets full support.' : '';
    return `<div class="pagehead"><div><div class="label">${clsPill(race.cls)} · Week ${race.week}</div><h1>${flag(race.country)} ${h(race.name)}</h1></div>
      <div class="stats"><div class="stat"><span class="label">${race.kind === 'oneday' ? 'Distance' : 'Stages'}</span><span class="v num">${race.kind === 'oneday' ? race.stages[0].km + ' km' : race.stages.length}</span></div>
      <div class="stat"><span class="label">Total</span><span class="v num">${U.sum(race.stages, s => s.km)} km</span></div></div></div>
      ${race.kind === 'oneday' ? `<div class="panel profile">${profileSVG(race.stages[0])}<div class="small muted">${sType(race.stages[0])} ${race.stages[0].sectors ? race.stages[0].sectors + ' cobbled sectors · ' : ''}${race.stages[0].climbs.length} categorised climbs</div></div>` : `<div class="panel"><h3>Route</h3>${stageTable(race)}</div>`}
      <div class="panel">
        <header><h3>Pick your ${n} riders</h3><span class="pill ${count === n ? 'good' : 'warn'}">${count} / ${n} selected</span></header>
        <p class="small muted">Leader gets support from domestiques. Sprinter gets a lead-out on flat finishes. Free-role riders go for breakaways. "Fit" rates how well a rider suits this route.</p>
        <div class="tablewrap"><table><thead><tr><th></th><th>Rider</th><th>Type</th><th class="c">OVR</th><th class="c">Fit</th><th class="c">SPR</th><th>Form</th><th>Fatigue</th><th class="r">Days</th><th>Role</th></tr></thead><tbody>${rows}</tbody></table></div>
        ${warn ? `<div class="msg bad small">${warn}</div>` : ''}
        <div class="row"><button class="btn" data-act="autopick">Auto-pick</button><button class="btn" data-act="clearpick">Clear</button><span style="flex:1"></span>
          <button class="btn" data-act="autorace" ${count ? '' : 'disabled'}>Simulate whole race</button>
          <button class="btn go" data-act="startrace" ${count ? '' : 'disabled'}>Start race ▸</button></div>
      </div>`;
  }

  const TACTICS = {
    cons: ['Conservative', 'Ride safe: less fatigue, slightly slower.'],
    bal: ['Balanced', 'Normal racing.'],
    agg: ['Aggressive', 'Attack and chase breaks: faster but riskier and more tiring.'],
  };

  function runningRaceView(race) {
    const done = race.status === 'done';
    const stage = done ? null : race.stages[race.cur];
    const oneday = race.kind === 'oneday';
    let head;
    if (done) {
      const w = G.riders[race.winner];
      head = `<div class="panel"><header><h3>${oneday ? 'Result' : 'Final classification'}</h3><span class="pill good">Finished</span></header>
        <p>${w ? `<b>${rLink(w, true)}</b> (${tCell(w.teamId)}) wins ${h(race.name)}.` : ''} Press <b>Continue</b> in the top bar to move on.</p></div>`;
    } else if (S.live) {
      head = '';
    } else {
      head = `<div class="panel profile">
        <header><h3>${oneday ? 'Race' : 'Stage ' + stage.n + ' of ' + race.stages.length} · ${stage.km} km</h3><span>${sType(stage)}${stage.sectors ? ' <span class="pill">' + stage.sectors + ' cobbled sectors</span>' : ''}</span></header>
        ${profileSVG(stage)}
        ${`<div class="row small">${stage.climbs.map(c => `<span class="pill" title="${c.len} km at ${c.grade}%">km ${c.km} · ${h(c.name)} (${c.cat === 'HC' ? 'HC' : 'Cat ' + c.cat})</span>`).join('') || '<span class="muted">No categorised climbs</span>'}</div>`}
        ${`<div class="row between">
          <div class="row"><span class="label">Team tactic</span>${Object.entries(TACTICS).map(([k, [l, d]]) => `<button class="btn sm ${S.tactic === k ? 'primary' : ''}" data-act="tactic" data-t="${k}" title="${d}">${l}</button>`).join('')}<span class="small muted">${TACTICS[S.tactic][1]}</span></div>
          <div class="row"><button class="btn" data-act="simrest">Sim to finish</button><button class="btn" data-act="quickstage">Quick result</button><button class="btn go" data-act="watch">Watch ${oneday ? 'race' : 'stage'} ▸</button></div>
        </div>`}
      </div>`;
    }
    const live = S.live ? `<div class="panel" id="live">${liveShell(race, race.stages[S.live.sr.n - 1])}</div>` : '';
    const showResults = !S.live && (race.stageResults.length > 0);
    const myStatus = done ? '' : myRidersPanel(race);
    return `<div class="pagehead"><div><div class="label">${clsPill(race.cls)} · ${oneday ? 'One-day race' : 'Stage race'}</div><h1>${flag(race.country)} ${h(race.name)}</h1></div>${raceStats(race)}</div>
      ${head}${live}${showResults ? resultsPanel(race) : ''}${myStatus}
      ${!oneday ? `<div class="panel"><h3>Route</h3>${stageTable(race)}</div>` : ''}`;
  }

  function raceStats(race) {
    if (race.kind === 'oneday') return '';
    const st = race.status === 'done' ? race.final : Race.standings(G, race);
    if (!st.gc.length) return '';
    const lead = G.riders[st.gc[0][0]];
    const mineIdx = st.gc.findIndex(([id]) => isMine(id));
    return `<div class="stats"><div class="stat"><span class="label">Leader <span class="jer y">GC</span></span><span class="v" style="font-size:20px">${rLink(lead)}</span></div>
      ${mineIdx >= 0 ? `<div class="stat"><span class="label">Our best</span><span class="v num" style="font-size:20px">${U.ordinal(mineIdx + 1)} ${U.gap(st.gc[mineIdx][1])}</span></div>` : ''}</div>`;
  }

  function myRidersPanel(race) {
    if (!race.entries) return '';
    const st = Race.standings(G, race);
    const pos = new Map(st.gc.map(([id, g], i) => [id, [i + 1, g]]));
    const mine = race.entries.filter(e => e.teamId === G.playerTeamId);
    return `<div class="panel"><h3>Our riders</h3><div class="tablewrap"><table><thead><tr><th>Rider</th><th>Role</th><th class="r">GC</th><th class="r">Gap</th><th>Form</th><th>Fatigue</th></tr></thead><tbody>
      ${mine.map(e => { const r = G.riders[e.rid]; const p = pos.get(e.rid); return `<tr><td>${rLink(r)}</td><td>${{ leader: 'Leader', sprinter: 'Sprinter', dom: 'Domestique', free: 'Free role' }[e.role]}</td>
        <td class="r">${race.st[e.rid].out ? '<span class="pill bad">DNF</span>' : p ? p[0] : ''}</td><td class="r">${p && race.kind !== 'oneday' ? U.gap(p[1]) : ''}</td><td>${meter(r.form, 'form')}</td><td>${meter(r.fatigue, 'fat')}</td></tr>`; }).join('')}
      </tbody></table></div></div>`;
  }

  // Result tables are shared by the live race view and the calendar modal
  function withMine(list, n) { return list.filter((x, i) => i < n || isMine(x[0])); }
  function leaderJerseys(st) {
    const j = {};
    const add = (id, c, l) => { if (id !== undefined) (j[id] || (j[id] = [])).push(`<span class="jer ${c}">${l}</span>`); };
    if (st.gc && st.gc[0]) add(st.gc[0][0], 'y', 'GC');
    if (st.pts && st.pts[0]) add(st.pts[0][0], 'g', 'PTS');
    if (st.kom && st.kom[0]) add(st.kom[0][0], 'p', 'KOM');
    if (st.youth && st.youth[0]) add(st.youth[0][0], 'w', 'U25');
    return j;
  }
  function resultRows(list, fmt, jerseys = {}, n = 30) {
    return withMine(list, n).map(([id, v]) => {
      const r = G.riders[id];
      const pos = list.findIndex(x => x[0] === id) + 1;
      return `<tr class="${isMine(id) ? 'mine' : ''}"><td class="pos">${pos}</td><td>${rLink(r)}${(jerseys[id] || []).join('')}</td><td>${r ? tCell(r.teamId) : ''}</td><td class="r num">${fmt(v, pos)}</td></tr>`;
    }).join('');
  }
  function resultsTable(list, head, fmt, jerseys, n) {
    if (!list || !list.length) return '<div class="empty">No classification</div>';
    return `<div class="tablewrap"><table><thead><tr><th>#</th><th>Rider</th><th>Team</th><th class="r">${head}</th></tr></thead><tbody>${resultRows(list, fmt, jerseys, n)}</tbody></table></div>`;
  }
  function stageResultTable(race, sr) {
    const brk = sr.brk && sr.brk.success ? new Set(sr.brk.rids) : new Set();
    const rows = withMine(sr.results, 30).map(([id, gap]) => {
      const r = G.riders[id];
      const pos = sr.results.findIndex(x => x[0] === id) + 1;
      return `<tr class="${isMine(id) ? 'mine' : ''}"><td class="pos">${pos}</td><td>${rLink(r)}${brk.has(id) ? ' <span class="pill" title="Rode in the breakaway">break</span>' : ''}</td><td>${r ? tCell(r.teamId) : ''}</td><td class="r num">${pos === 1 ? U.time(sr.T0) : U.gap(gap)}</td></tr>`;
    }).join('');
    const ab = (sr.abandons || []).map(id => G.riders[id]).filter(Boolean);
    return `<div class="tablewrap"><table><thead><tr><th>#</th><th>Rider</th><th>Team</th><th class="r">Time</th></tr></thead><tbody>${rows}</tbody></table></div>
      ${ab.length ? `<p class="small muted">Abandoned: ${ab.map(r => rLink(r)).join(', ')}</p>` : ''}`;
  }
  function classificationTabs(race, st, stageIdx, prefix) {
    const tab = S.raceTab;
    const oneday = race.kind === 'oneday';
    const tabs = oneday ? [['stage', 'Result']] : [['stage', 'Stage'], ['gc', 'General'], ['pts', 'Points'], ['kom', 'Mountains'], ['youth', 'Youth'], ['teams', 'Teams']];
    const jerseys = leaderJerseys(st);
    let body;
    const sr = race.stageResults[stageIdx];
    if (tab === 'stage' || oneday) body = sr ? stageResultTable(race, sr) : '<div class="empty">No stage raced yet</div>';
    else if (tab === 'gc') body = resultsTable(st.gc, 'Gap', (v, p) => p === 1 ? 'Leader' : U.gap(v), jerseys, 40);
    else if (tab === 'pts') body = resultsTable(st.pts, 'Points', v => v, jerseys, 15);
    else if (tab === 'kom') body = resultsTable(st.kom, 'Points', v => v, jerseys, 15);
    else if (tab === 'youth') body = resultsTable(st.youth, 'Gap', (v, p) => U.gap(v - (st.youth[0] ? st.youth[0][1] : 0)), jerseys, 15);
    else if (tab === 'teams') body = st.teams && st.teams.length ? `<div class="tablewrap"><table><thead><tr><th>#</th><th>Team</th><th class="r">Gap</th></tr></thead><tbody>${st.teams.map(([t, v], i) => `<tr class="${t === G.playerTeamId ? 'mine' : ''}"><td class="pos">${i + 1}</td><td>${tCell(t)}</td><td class="r">${i ? U.gap(v - st.teams[0][1]) : U.time(v)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No classification</div>';
    const stagePicker = !oneday && race.stageResults.length > 1 && (tab === 'stage') ? `<select data-change="${prefix}stage" aria-label="Stage">${race.stageResults.map((s, i) => `<option value="${i}" ${i === stageIdx ? 'selected' : ''}>Stage ${s.n}</option>`).join('')}</select>` : '';
    return `<div class="row between"><div class="tabs">${tabs.map(([k, l]) => `<button class="${tab === k || (oneday && k === 'stage') ? 'on' : ''}" data-act="racetab" data-t="${k}">${l}</button>`).join('')}</div>${stagePicker}</div>${body}`;
  }
  function resultsPanel(race) {
    const st = race.status === 'done' ? race.final : Race.standings(G, race);
    const idx = S.stageView !== null && S.stageView < race.stageResults.length ? S.stageView : race.stageResults.length - 1;
    const sr = race.stageResults[idx];
    const w = sr && G.riders[sr.results[0]?.[0]];
    return `<div class="panel"><header><h3>${race.kind === 'oneday' ? 'Result' : 'Results after stage ' + race.stageResults[race.stageResults.length - 1].n}</h3>
      ${w && race.kind !== 'oneday' ? `<span class="small">Stage ${sr.n} winner: ${rLink(w)}</span>` : ''}</header>${classificationTabs(race, st, idx, 'race')}</div>`;
  }

  // ---------- live stage ----------
  function liveShell(race, stage) {
    return `<header><h3>Live · ${race.kind === 'oneday' ? h(race.name) : 'Stage ' + stage.n}</h3>
      <div class="row"><span class="label">Speed</span><button class="btn sm" data-act="livespeed" data-s="1">1×</button><button class="btn sm" data-act="livespeed" data-s="3">3×</button><button class="btn sm" data-act="livespeed" data-s="8">8×</button><button class="btn sm" data-act="liveskip">Skip to finish</button></div></header>
      <div class="profile course">${profileSVG(stage, { extra: '<g id="markers"></g>' })}</div>
      <div class="readout"><div class="stat"><span class="label">To go</span><span class="v num" id="lv-togo">${stage.km} km</span></div>
        <div class="stat"><span class="label">Breakaway</span><span class="v num" id="lv-gap">–</span></div>
        <div class="stat"><span class="label">Race time</span><span class="v num" id="lv-time">0'00"</span></div></div>
      <div class="feed" id="lv-feed" aria-live="polite"></div>
      <div class="row" id="lv-done" hidden><button class="btn go" data-act="liveclose">Show results ▸</button></div>`;
  }
  function names(rids) { return rids.map(id => { const r = G.riders[id]; return r ? `<b>${h(Riders.shortName(r))}</b>` : '?'; }); }
  function evText(ev, race, stage) {
    const n = names(ev.rids || []);
    switch (ev.kind) {
      case 'start': return `The flag drops. ${stage.km} km ${race.kind === 'oneday' ? 'of racing' : 'on today\'s menu'}.`;
      case 'break': return `A breakaway of ${n.length} goes clear: ${n.slice(0, 5).join(', ')}${n.length > 5 ? ` and ${n.length - 5} more` : ''}.`;
      case 'kom': { const c = stage.climbs[ev.climb]; return `${n[0]} is first over the ${h(c.name)} (${c.cat === 'HC' ? 'HC' : 'cat. ' + c.cat}).`; }
      case 'crash': return `Crash! ${n[0]} goes down but gets back on the bike.`;
      case 'abandon': return `${n[0]} abandons after ${ev.why === 'crash' ? 'a heavy crash' : 'falling ill'}.`;
      case 'catch': return `The breakaway is caught with ${stage.km - ev.km} km to go.`;
      case 'attack': return stage.type === 'cobbles' ? `${n[0]} surges on the cobbles${n[1] ? ', ' + n[1] + ' gives chase' : ''}!` : `${n[0]} attacks${n[1] ? '! ' + n[1] + ' tries to follow.' : '!'}`;
      case 'sprint': return 'The sprint trains are winding up for the finish.';
      case 'finish': return `${n[0]} wins${race.kind === 'oneday' ? ' ' + h(race.name) : ''}! ${n[1] ? n[1] + ' is second' : ''}${n[2] ? ', ' + n[2] + ' third.' : '.'}`;
    }
    return '';
  }

  // ---------- calendar ----------
  function bestOurs(race) {
    if (race.status !== 'done' || !race.final) return '';
    const ids = new Set((race.entrants || []).map(x => x[0]));
    const idx = race.final.gc.findIndex(([id]) => ids.has(id));
    const stageWins = race.kind === 'stage' ? race.stageResults.filter(s => ids.has(s.results[0]?.[0])).length : 0;
    return (idx >= 0 ? U.ordinal(idx + 1) : 'DNF') + (stageWins ? ` · ${stageWins} stage win${stageWins > 1 ? 's' : ''}` : '');
  }
  function calendarView() {
    const rows = G.calendar.map(r => {
      const cur = G.week >= r.week && G.week < r.week + r.weeks;
      const w = r.winner ? G.riders[r.winner] : null;
      const status = r.status === 'done' ? '<span class="pill good">Done</span>' : r.status === 'running' ? '<span class="pill warn">Racing</span>' : cur ? '<span class="pill warn">This week</span>' : '';
      const types = r.kind === 'oneday' ? sType(r.stages[0]) : `<span class="small muted">${r.stages.length} stages</span>`;
      return `<tr class="click ${cur ? 'mine' : ''}" data-act="${r.status === 'done' ? 'raceresults' : cur ? 'nav' : ''}" data-id="${r.id}" data-view="race">
        <td class="r">${r.week}${r.weeks > 1 ? '–' + (r.week + r.weeks - 1) : ''}</td><td><b>${flag(r.country)} ${h(r.name)}</b></td><td>${clsPill(r.cls)}</td><td>${types}</td>
        <td>${status}</td><td>${w ? rLink(w) + ' <span class="small muted">' + h(G.teams[w.teamId]?.name || '') + '</span>' : ''}</td><td>${bestOurs(r)}</td></tr>`;
    }).join('');
    return `<div class="pagehead"><div><div class="label">Season ${G.year}</div><h1>Calendar</h1></div></div>
      <div class="panel"><p class="small muted">Every team rides every race. Click a finished race for full results.</p>
      <div class="tablewrap"><table><thead><tr><th class="r">Week</th><th>Race</th><th>Class</th><th>Profile</th><th>Status</th><th>Winner</th><th>Our result</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }
  function raceResultsModal(race) {
    const idx = S.stageView !== null && S.stageView < race.stageResults.length ? S.stageView : race.stageResults.length - 1;
    return `<header><div><div class="label">${clsPill(race.cls)} · Week ${race.week}, ${race.year}</div><h2>${flag(race.country)} ${h(race.name)}</h2></div><button class="x" data-act="closemodal" aria-label="Close">×</button></header>
      ${classificationTabs(race, race.final, idx, 'modal')}`;
  }

  // ---------- standings ----------
  function standingsView() {
    const tab = S.standTab;
    let body = '';
    if (tab === 'teams') {
      body = `<div class="tablewrap"><table><thead><tr><th>#</th><th>Team</th><th class="r">UCI pts</th><th class="r">Wins</th><th class="r">Riders</th><th class="r">Strength</th><th class="r">Expected</th></tr></thead><tbody>
        ${Game.teamRanking(G).map((t, i) => `<tr class="${t.id === G.playerTeamId ? 'mine' : ''}"><td class="pos">${i + 1}</td><td>${jersey(t).replace('class="jersey"', 'class="jersey" style="display:inline-block;vertical-align:-3px;margin-right:6px"')}${h(t.name)}</td><td class="r">${t.season.pts}</td><td class="r">${t.season.wins}</td><td class="r">${t.riders.length}</td><td class="r">${Game.teamStrength(G, t).toFixed(1)}</td><td class="r">${U.ordinal(t.expRank)}</td></tr>`).join('')}
      </tbody></table></div>`;
    } else if (tab === 'riders') {
      const list = Game.riderRanking(G);
      body = list.length ? `<div class="tablewrap"><table><thead><tr><th>#</th><th>Rider</th><th>Team</th><th>Type</th><th class="r">Age</th><th class="r">Pts</th><th class="r">Wins</th><th class="r">Days</th></tr></thead><tbody>
        ${list.filter((r, i) => i < 80 || isMine(r.id)).map(r => `<tr class="${isMine(r.id) ? 'mine' : ''}"><td class="pos">${list.indexOf(r) + 1}</td><td>${rLink(r)}</td><td>${tCell(r.teamId)}</td><td>${spec(r)}</td><td class="r">${age(r)}</td><td class="r">${r.season.pts}</td><td class="r">${r.season.wins}</td><td class="r">${r.season.days}</td></tr>`).join('')}
      </tbody></table></div>` : '<div class="empty">No points scored yet this season.</div>';
    } else if (tab === 'honours') {
      body = G.honours.length ? `<div class="tablewrap"><table><thead><tr><th>Year</th><th>Race</th><th>Winner</th><th>Team</th></tr></thead><tbody>
        ${G.honours.slice().reverse().map(x => `<tr class="${x.team === me().name ? 'mine' : ''}"><td>${x.year}</td><td>${h(x.race)}</td><td>${G.riders[x.rid] ? rLink(G.riders[x.rid], true) : h(x.name)}</td><td>${h(x.team)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Grand Tour and Monument winners will appear here.</div>';
    } else {
      body = G.history.length ? `<div class="tablewrap"><table><thead><tr><th>Season</th><th>Top team</th><th>Top rider</th><th>Our rank</th></tr></thead><tbody>
        ${G.history.slice().reverse().map(y => `<tr><td>${y.year}</td><td>${h(G.teams[y.ranking[0][0]]?.name || '')} (${y.ranking[0][1]} pts)</td><td>${h(y.topRiders[0]?.[0] || '')} <span class="muted small">${h(y.topRiders[0]?.[1] || '')}</span></td><td>${U.ordinal(y.ranking.findIndex(x => x[0] === G.playerTeamId) + 1)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Finished seasons will be listed here.</div>';
    }
    return `<div class="pagehead"><div><div class="label">Season ${G.year}</div><h1>Standings</h1></div></div>
      <div class="panel"><div class="tabs">${[['teams', 'Team ranking'], ['riders', 'Rider ranking'], ['honours', 'Honours'], ['history', 'History']].map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-act="standtab" data-t="${k}">${l}</button>`).join('')}</div>${body}</div>`;
  }

  // ---------- transfers ----------
  function transfersView() {
    const f = S.mkt;
    let list = Object.values(G.riders).filter(r => r.teamId !== G.playerTeamId);
    if (f.fa) list = list.filter(r => !r.teamId);
    if (f.spec) list = list.filter(r => Riders.specialty(r) === f.spec);
    if (f.maxAge) list = list.filter(r => age(r) <= +f.maxAge);
    if (f.minOvr) list = list.filter(r => Riders.ovr(r) >= +f.minOvr);
    if (f.maxSal) list = list.filter(r => Riders.salaryAsk(r, G.year) <= +f.maxSal * 1000);
    if (f.q) { const q = f.q.toLowerCase(); list = list.filter(r => Riders.fullName(r).toLowerCase().includes(q)); }
    const total = list.length;
    list = sortRows(list, S.mktSort, riderGetters).slice(0, 100);
    const s = S.mktSort;
    const t = me();
    const rows = list.map(r => `<tr class="click" data-act="rider" data-id="${r.id}"><td>${rLink(r)}</td><td class="r">${age(r)}</td><td>${spec(r)}</td>
      <td class="at ${aCls(Riders.ovr(r))}">${Riders.ovr(r).toFixed(0)}</td><td>${stars(scoutPot(r))}</td>
      ${DATA.ATTRS.map(a => `<td class="at ${aCls(r.a[a.k])}">${Math.round(r.a[a.k])}</td>`).join('')}
      <td>${tCell(r.teamId)}</td><td class="r">${r.teamId ? r.contractEnd : '–'}</td><td class="r">${U.money(Game.askingSalary(G, r))}</td><td class="r">${r.teamId ? U.money(Game.askingFee(G, r)) : '<span class="pill good">Free</span>'}</td></tr>`).join('');
    return `<div class="pagehead"><div><div class="label">Scouting</div><h1>Transfer market</h1></div>
      <div class="stats"><div class="stat"><span class="label">Bank</span><span class="v num">${U.money(t.cash)}</span></div><div class="stat"><span class="label">Roster</span><span class="v num">${t.riders.length}/${Game.MAX_ROSTER}</span></div></div></div>
      <div class="panel">
        <div class="row">
          <div class="field"><label class="label" for="mq">Name</label><input type="text" id="mq" data-change="mkt" data-k="q" value="${h(f.q)}" placeholder="Search"></div>
          <div class="field"><label class="label" for="ms">Type</label><select id="ms" data-change="mkt" data-k="spec"><option value="">Any</option>${Object.entries(DATA.SPECIALTIES).map(([k, v]) => `<option value="${k}" ${f.spec === k ? 'selected' : ''}>${v.long}</option>`).join('')}</select></div>
          <div class="field"><label class="label" for="ma">Max age</label><input type="number" id="ma" data-change="mkt" data-k="maxAge" value="${h(f.maxAge)}" min="18" max="40" style="width:80px"></div>
          <div class="field"><label class="label" for="mo">Min OVR</label><input type="number" id="mo" data-change="mkt" data-k="minOvr" value="${h(f.minOvr)}" min="40" max="90" style="width:80px"></div>
          <div class="field"><label class="label" for="mx">Max salary (k€)</label><input type="number" id="mx" data-change="mkt" data-k="maxSal" value="${h(f.maxSal)}" min="0" step="50" style="width:110px"></div>
          <label class="row small" style="align-self:flex-end"><input type="checkbox" id="mf" data-change="mkt" data-k="fa" ${f.fa ? 'checked' : ''}> Free agents only</label>
        </div>
        <p class="small muted">Showing ${list.length} of ${total} riders. Potential for other teams' riders is a scout's estimate. Riders under contract cost a transfer fee.</p>
        <div class="tablewrap"><table><thead><tr>${th('Rider', 'name', s, 'sortmkt')}${th('Age', 'age', s, 'sortmkt', 'r')}${th('Type', 'spec', s, 'sortmkt')}${th('OVR', 'ovr', s, 'sortmkt', 'c')}${th('POT', 'pot', s, 'sortmkt')}
          ${DATA.ATTRS.map(a => th(a.label, a.k, s, 'sortmkt', 'c')).join('')}${th('Team', 'team', s, 'sortmkt')}${th('Until', 'contract', s, 'sortmkt', 'r')}${th('Wants', 'ask', s, 'sortmkt', 'r')}<th class="r">Fee</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="18" class="empty">No riders match these filters.</td></tr>'}</tbody></table></div>
      </div>`;
  }

  // ---------- finances ----------
  function financesView() {
    const t = me();
    const pay = Game.payroll(G, t);
    const ops = t.sponsor * 0.1;
    const weekly = (t.sponsor - pay - ops) / W;
    const salaries = t.riders.map(id => G.riders[id]).sort((a, b) => b.salary - a.salary);
    return `<div class="pagehead"><div><div class="label">${h(t.name)}</div><h1>Finances</h1></div>
      <div class="stats">
        <div class="stat"><span class="label">Bank</span><span class="v num" style="color:${t.cash < 0 ? 'var(--bad)' : 'inherit'}">${U.money(t.cash)}</span></div>
        <div class="stat"><span class="label">Sponsor / yr</span><span class="v num">${U.money(t.sponsor)}</span></div>
        <div class="stat"><span class="label">Payroll / yr</span><span class="v num">${U.money(pay)}</span></div>
        <div class="stat"><span class="label">Weekly net</span><span class="v num" style="color:${weekly < 0 ? 'var(--bad)' : 'var(--good)'}">${U.money(weekly)}</span></div>
      </div></div>
      <div class="grid g2">
        <div class="panel"><h3>How money works</h3><p class="small">The sponsor pays ${U.money(t.sponsor / W)} per race week. Salaries (${U.money(pay / W)}) and staff costs (${U.money(ops / W)}) go out every week. Each UCI point earns ${U.money(DATA.PRIZE_PER_POINT)} in prize money. At season end the sponsor adjusts the budget based on your ranking versus expectations. A negative balance hurts board confidence.</p></div>
        <div class="panel"><h3>Top salaries</h3><div class="tablewrap"><table><tbody>${salaries.slice(0, 8).map(r => `<tr><td>${rLink(r)}</td><td class="r">${U.money(r.salary)}</td><td class="r small muted">until ${r.contractEnd}</td></tr>`).join('')}</tbody></table></div></div>
      </div>
      <div class="panel"><h3>Ledger</h3><div class="tablewrap"><table><thead><tr><th>When</th><th>Item</th><th class="r">Amount</th></tr></thead><tbody>
        ${G.ledger.slice(0, 80).map(l => `<tr><td class="small muted">Wk ${l.week}, ${l.year}</td><td>${h(l.desc)}</td><td class="r num" style="color:${l.amount < 0 ? 'var(--bad)' : 'var(--good)'}">${U.money(l.amount)}</td></tr>`).join('') || '<tr><td colspan="3" class="empty">No transactions yet</td></tr>'}
      </tbody></table></div></div>`;
  }

  // ---------- club ----------
  function clubView() {
    const t = me();
    const conf = G.board.confidence;
    const mood = conf >= 75 ? ['Delighted', 'good'] : conf >= 50 ? ['Satisfied', 'good'] : conf >= 30 ? ['Concerned', 'warn'] : ['Losing patience', 'bad'];
    const honours = G.honours.filter(x => x.team === t.name);
    return `<div class="pagehead"><div><div class="label">Club</div><h1>${h(t.name)}</h1></div>
      <div class="stats"><div class="stat"><span class="label">Nation</span><span class="v">${flag(t.nat)}</span></div><div class="stat"><span class="label">Standing</span><span class="v">${stars(60 + t.prestige * 5)}</span></div></div></div>
      <div class="grid g2">
        <div class="panel"><header><h3>Board confidence</h3><span class="pill ${mood[1]}">${mood[0]}</span></header>
          ${meter(conf)}<p class="small muted">Each objective met at season end raises confidence; each one missed lowers it. Drop too low and you'll be dismissed.</p>
          ${G.board.objectives.map(o => { const e = Game.evalObjective(G, o); return `<div class="obj"><span>${h(o.text)}</span><span class="pill ${e.done ? 'good' : 'warn'}">${h(e.progress)}</span></div>`; }).join('')}
        </div>
        <div class="panel"><h3>Team history</h3>${t.history.length ? `<div class="tablewrap"><table><thead><tr><th>Season</th><th class="r">Rank</th><th class="r">Points</th><th class="r">Wins</th></tr></thead><tbody>${t.history.slice().reverse().map(x => `<tr><td>${x.year}</td><td class="r">${U.ordinal(x.rank)}</td><td class="r">${x.pts}</td><td class="r">${x.wins}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Your first season is under way.</div>'}</div>
        <div class="panel"><h3>Trophy cabinet</h3>${honours.length ? honours.slice().reverse().map(x => `<div class="row between small"><span><b>${h(x.race)}</b> ${x.year}</span><span>${h(x.name)}</span></div>`).join('') : '<div class="empty">No Grand Tours or Monuments yet.</div>'}</div>
      </div>`;
  }

  // ---------- options ----------
  function optionsView() {
    return `<div class="pagehead"><div><div class="label">Game</div><h1>Save & settings</h1></div></div>
      <div class="grid g2">
        <div class="panel" style="grid-column:1 / -1"><header><h3>Save slots</h3><span class="small muted">${PCM.Saves.isCloud() ? 'Stored in your Claude account, so they follow you to any device.' : 'Stored in this browser.'} The game autosaves after every action; <b>Save</b> in the top bar (or Ctrl+S) writes to ${h(PCM.Saves.slotLabel(G.lastSlot || '1'))}.</span></header>
          ${slotsHtml(true)}
          ${fileTools(true)}
        </div>
        <div class="panel"><h3>New career</h3><p class="small">Start over with a new team. Your autosave will be replaced; saved slots are kept.</p><div class="row"><button class="btn danger" data-act="newgame-ask">Start new career</button></div></div>
        <div class="panel"><h3>How to play</h3>
          <ul class="small" style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:4px">
            <li><b>Continue</b> moves the calendar one week. Riders who aren't racing train according to their load and focus.</li>
            <li>In a race week, pick your riders and roles, then play each stage: <b>Watch</b> for live commentary, <b>Quick result</b> to skip ahead.</li>
            <li><b>Form</b> helps and <b>fatigue</b> hurts. Rotate riders so your leaders arrive fresh at their goals.</li>
            <li>Leaders gain from strong domestiques on climbs; sprinters gain from a lead-out. Free-role riders hunt breakaways.</li>
            <li>Young riders improve towards their potential (stars). Riders over 30 slowly decline.</li>
            <li>Renew contracts before the season ends or riders leave. Sign talent on the Transfers page.</li>
            <li>Meet the board's objectives to keep your job and grow the sponsor budget.</li>
          </ul></div>
      </div>`;
  }

  // ---------- modals ----------
  function modalHtml() {
    const m = S.modal;
    if (!m) return '';
    let inner = '', cls = '';
    if (m.type === 'rider') inner = riderModal(G.riders[m.id]);
    else if (m.type === 'race') { inner = raceResultsModal(G.calendar.find(r => r.id === m.id)); cls = 'wide'; }
    else if (m.type === 'confirmEnd') inner = confirmEndModal();
    else if (m.type === 'summary') inner = summaryModal(G.pendingSummary);
    else if (m.type === 'jobs') inner = jobsModal();
    else if (m.type === 'newgame') inner = `<header><h2>Start a new career?</h2><button class="x" data-act="closemodal" aria-label="Close">×</button></header><p>This replaces your current save. Export a save code first if you want to keep it.</p><div class="row"><button class="btn" data-act="closemodal">Cancel</button><button class="btn danger" data-act="newgame">Yes, start over</button></div>`;
    if (!inner) return '';
    return `<div class="modal-bg" data-act="bgclose"><div class="modal ${cls}" role="dialog" aria-modal="true">${inner}</div></div>`;
  }

  function riderModal(r) {
    if (!r) return '';
    const m = S.modal;
    const mine = r.teamId === G.playerTeamId;
    const o = Riders.ovr(r);
    const pot = mine ? r.pot : scoutPot(r);
    const attrs = DATA.ATTRS.map(a => `<div class="attr"><span class="small">${a.long}</span>${meter((r.a[a.k] - 40) * 2)}<b class="num">${Math.round(r.a[a.k])}</b></div>`).join('');
    const ask = Game.askingSalary(G, r);
    let actions = '';
    if (mine) {
      const canRenew = r.contractEnd <= G.year + 1;
      actions = `<div class="panel"><h4>Training</h4><div class="row">
          <div class="field"><label class="label" for="m-plan">Load</label><select id="m-plan" data-change="plan" data-id="${r.id}">${Object.entries(DATA.TRAINING_LOAD).map(([k, v]) => `<option value="${k}" ${r.plan === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></div>
          <div class="field"><label class="label" for="m-focus">Focus</label><select id="m-focus" data-change="focus" data-id="${r.id}">${Object.entries(DATA.TRAINING_FOCUS).map(([k, v]) => `<option value="${k}" ${r.focus === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></div>
        </div></div>
        <div class="panel"><h4>Contract</h4><p class="small">${U.money(r.salary)} per year until the end of ${r.contractEnd}.</p>
          ${canRenew ? `<div class="row"><div class="field"><label class="label" for="rn-sal">Salary (€/yr)</label><input type="number" id="rn-sal" value="${ask}" step="5000" min="0" style="width:130px"></div>
            <div class="field"><label class="label" for="rn-yrs">Extend until</label><select id="rn-yrs">${[1, 2, 3, 4].map(y => `<option value="${y}" ${y === 2 ? 'selected' : ''}>${G.year + y}</option>`).join('')}</select></div>
            <button class="btn primary" data-act="renew" data-id="${r.id}" style="align-self:flex-end">Offer extension</button></div><p class="small muted">He's asking about ${U.money(ask)} per year.</p>` : '<p class="small muted">You can discuss an extension in the final year of his contract.</p>'}
          <div class="row">${m.confirmRelease ? `<span class="small">Release for ${U.money(Game.releaseCost(G, r))} settlement?</span><button class="btn danger sm" data-act="release" data-id="${r.id}">Confirm release</button><button class="btn sm" data-act="release-cancel">Cancel</button>` : `<button class="btn danger sm" data-act="release-ask">Release rider…</button>`}</div>
        </div>`;
    } else {
      const fee = Game.askingFee(G, r);
      const endBase = G.week > W ? G.year : G.year - 1;
      actions = `<div class="panel"><h4>${r.teamId ? 'Transfer offer' : 'Sign free agent'}</h4>
        ${r.teamId ? `<p class="small">${h(G.teams[r.teamId].name)} want <b>${U.money(fee)}</b> as a transfer fee. Contract runs until ${r.contractEnd}.</p>` : ''}
        <div class="row"><div class="field"><label class="label" for="of-sal">Salary (€/yr)</label><input type="number" id="of-sal" value="${ask}" step="5000" min="0" style="width:130px"></div>
          <div class="field"><label class="label" for="of-yrs">Contract until</label><select id="of-yrs">${[1, 2, 3].map(y => `<option value="${y}" ${y === 2 ? 'selected' : ''}>${endBase + y}</option>`).join('')}</select></div>
          <button class="btn primary" data-act="offer" data-id="${r.id}" style="align-self:flex-end">Make offer</button></div>
        <p class="small muted">He's asking about ${U.money(ask)} per year. You have ${U.money(me().cash)} in the bank.</p></div>`;
    }
    return `<header><div class="row" style="gap:16px"><div class="bigovr num">${o.toFixed(0)}</div><div><div class="label">${h(DATA.SPECIALTIES[Riders.specialty(r)].long)} · ${age(r)} years · ${flag(r.nat)} ${h(DATA.natName(r.nat))}</div><h2>${h(Riders.fullName(r))}</h2><div class="small">${tCell(r.teamId)} · Potential ${stars(pot)}${mine ? '' : ' <span class="muted">(scouted)</span>'}</div></div></div><button class="x" data-act="closemodal" aria-label="Close">×</button></header>
      ${m.msg ? `<div class="msg ${m.ok ? 'good' : 'bad'}">${h(m.msg)}</div>` : ''}
      <div class="attrs">${attrs}</div>
      <div class="stats small">
        <div class="stat"><span class="label">Form</span><span class="v num">${Math.round(r.form)}</span></div>
        <div class="stat"><span class="label">Fatigue</span><span class="v num">${Math.round(r.fatigue)}</span></div>
        <div class="stat"><span class="label">Morale</span><span class="v num">${Math.round(r.morale)}</span></div>
        <div class="stat"><span class="label">Race days</span><span class="v num">${r.season.days}</span></div>
        <div class="stat"><span class="label">Wins</span><span class="v num">${r.season.wins} <span class="small muted">(${r.career.wins} career)</span></span></div>
        <div class="stat"><span class="label">UCI pts</span><span class="v num">${r.season.pts}</span></div>
        ${r.injury ? `<div class="stat"><span class="label">Injured</span><span class="v" style="color:var(--bad)">${r.injury} wk</span></div>` : ''}
      </div>
      ${actions}
      ${r.palmares.length ? `<div><div class="label">Palmarès</div><ul class="plain small">${r.palmares.slice(-12).reverse().map(p => `<li>${h(p)}</li>`).join('')}</ul></div>` : ''}`;
  }

  function confirmEndModal() {
    const exp = me().riders.map(id => G.riders[id]).filter(r => r.contractEnd <= G.year);
    return `<header><h2>End the ${G.year} season?</h2><button class="x" data-act="closemodal" aria-label="Close">×</button></header>
      <p>The board will review your objectives, riders will age and develop, and contracts that end in ${G.year} will expire.</p>
      ${exp.length ? `<div class="msg bad"><b>${exp.length} rider(s) will leave:</b> ${exp.map(r => rLink(r)).join(', ')}. Click a name to offer an extension first.</div>` : '<div class="msg good">No contracts are expiring.</div>'}
      <div class="row"><button class="btn" data-act="closemodal">Not yet</button><button class="btn go" data-act="endseason">End season ▸</button></div>`;
  }
  function summaryModal(s) {
    if (!s) return '';
    const dev = s.developments.slice().sort((a, b) => b.delta - a.delta);
    return `<header><div><div class="label">Season review</div><h2>${s.year}: ${U.ordinal(s.rank)} in the team ranking</h2></div><button class="x" data-act="closesummary" aria-label="Close">×</button></header>
      <div>${s.objectives.map(o => `<div class="obj"><span>${h(o.text)}</span><span class="pill ${o.done ? 'good' : 'bad'}">${o.done ? 'Met' : 'Missed'}</span></div>`).join('')}</div>
      <div class="stats"><div class="stat"><span class="label">Board confidence</span><span class="v num">${s.confidence}%</span></div>
        <div class="stat"><span class="label">Sponsor budget</span><span class="v num">${U.money(s.sponsorNew)}</span><span class="small ${s.sponsorNew >= s.sponsorOld ? '' : 'muted'}">was ${U.money(s.sponsorOld)}</span></div>
        <div class="stat"><span class="label">Bank</span><span class="v num">${U.money(s.cash)}</span></div></div>
      ${s.fired ? '<div class="msg bad"><b>The board has dismissed you.</b> Other teams are interested in hiring you.</div>' : ''}
      <div class="grid g2">
        <div><div class="label">Biggest improvers</div>${dev.slice(0, 5).map(d => `<div class="row between small"><span>${h(d.name)}</span><span class="num" style="color:var(--good)">${d.delta >= 0 ? '+' : ''}${d.delta.toFixed(1)} → ${d.ovr.toFixed(0)}</span></div>`).join('')}</div>
        <div><div class="label">Declines</div>${dev.slice(-4).reverse().filter(d => d.delta < 0).map(d => `<div class="row between small"><span>${h(d.name)}</span><span class="num" style="color:var(--bad)">${d.delta.toFixed(1)} → ${d.ovr.toFixed(0)}</span></div>`).join('') || '<span class="small muted">None</span>'}</div>
      </div>
      ${s.left.length ? `<p class="small"><b>Left the team:</b> ${h(s.left.join(', '))}</p>` : ''}${s.retired.length ? `<p class="small"><b>Retired:</b> ${h(s.retired.join(', '))}</p>` : ''}
      <div class="row"><button class="btn go" data-act="closesummary">${s.fired ? 'See job offers' : 'Start ' + (s.year + 1) + ' season ▸'}</button></div>`;
  }
  function jobsModal() {
    const offers = Game.jobOffers(G);
    return `<header><h2>Job offers</h2></header><p>Pick your next team. You'll keep the same world and calendar.</p>
      <div class="teamcards">${offers.map(t => `<button class="teamcard" data-act="takejob" data-id="${t.id}"><div class="kit" style="background:linear-gradient(90deg, ${t.c1} 70%, ${t.c2} 70%)"></div><h3>${h(t.name)}</h3><div class="row between small"><span>${flag(t.nat)} Strength ${Game.teamStrength(G, t).toFixed(1)}</span>${stars(60 + t.prestige * 5)}</div></button>`).join('')}</div>`;
  }

  // ---------- actions ----------
  function startNewGame() {
    const mgr = (document.getElementById('mgr')?.value || '').trim() || 'Manager';
    const cname = document.getElementById('cname')?.value || '';
    G = Game.newGame({ teamId: S.newTeam, manager: mgr, customName: cname, world: S.world });
    Object.assign(S, { view: 'dashboard', sel: null, live: null, modal: null, io: '', ioMsg: '' });
    commit();
  }
  function loadFromString(str) { return loadGame(() => PCM.Saves.decode(str)); }

  function onContinue() {
    if (G.fired) { S.modal = { type: 'jobs' }; render(); return; }
    const cr = Game.currentRace(G);
    if (cr && cr.status !== 'done') { S.view = 'race'; render(); return; }
    if (G.week > W) { S.modal = { type: 'confirmEnd' }; render(); return; }
    const res = Game.advance(G);
    S.stageView = null;
    if (res.status === 'race') { S.view = 'race'; S.raceTab = 'stage'; S.tactic = 'bal'; toast('Race week: ' + res.race.name); }
    else if (res.status === 'season-end') toast('All races done. Press End season when ready.');
    commit(true);
  }
  function skipToRace() {
    let guard = 0;
    while (guard++ < 60) {
      const cr = Game.currentRace(G);
      if ((cr && cr.status !== 'done') || G.week > W) break;
      Game.advance(G);
    }
    S.view = 'race'; S.raceTab = 'stage'; S.stageView = null;
    commit();
  }
  function playerEntries() {
    return Object.entries(S.sel.picks).map(([rid, role]) => ({ rid: +rid, role }));
  }
  function runStage(watch) {
    const race = Game.currentRace(G);
    if (!race || race.status !== 'running') return;
    const sr = Game.simStage(G, race, S.tactic);
    S.stageView = null;
    if (race.kind === 'stage' || race.status === 'done') S.raceTab = S.raceTab || 'stage';
    if (watch) S.live = { raceId: race.id, sr, done: false };
    commit(race.status === 'done');
  }

  function handleClick(e) {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    if (el.tagName === 'TR' && e.target.closest('select, input, a, button') && !e.target.closest('a.rname')) return;
    if (act === 'bgclose') { if (e.target === el) { closeModal(); } return; }
    if (act !== 'rider') e.preventDefault();
    const id = el.dataset.id;
    switch (act) {
      case 'pickteam': S.newTeam = id; S.mgr = document.getElementById('mgr')?.value || ''; S.cname = document.getElementById('cname')?.value || ''; render(); break;
      case 'startgame': startNewGame(); break;
      case 'world': S.world = el.dataset.w; S.newTeam = null; S.mgr = document.getElementById('mgr')?.value || ''; S.cname = document.getElementById('cname')?.value || ''; render(); break;
      case 'quicksave': quickSave(); break;
      case 'saveslot': PCM.Saves.save(G, el.dataset.slot).then(m => { toast(`Saved to ${PCM.Saves.slotLabel(m.slot)}`); render(); }, err => toast(err.message || 'Save failed')); break;
      case 'loadslot': { const sl = el.dataset.slot; loadGame(() => PCM.Saves.load(sl), 'Loaded ' + PCM.Saves.slotLabel(sl)); break; }
      case 'delslot-ask': S.confirmDel = el.dataset.slot; render(); break;
      case 'delslot': S.confirmDel = null; PCM.Saves.remove(el.dataset.slot).then(() => toast('Save deleted'), err => toast(err.message || 'Delete failed')); break;
      case 'savefile': PCM.Saves.saveFile(G).then(() => toast('Save file created'), err => { if (!err || err.code !== 'declined') toast('Could not create the file. Use Copy save code instead.'); }); break;
      case 'nav': if (S.live) { PCM.Live.stop(); S.live = null; } S.view = el.dataset.view; S.modal = null; S.stageView = null; render(); window.scrollTo(0, 0); break;
      case 'continue': onContinue(); break;
      case 'tonextrace': skipToRace(); break;
      case 'rider': e.preventDefault(); S.modal = { type: 'rider', id: +id }; render(); break;
      case 'closemodal': closeModal(); break;
      case 'sortsquad': case 'sortmkt': {
        const s = act === 'sortsquad' ? S.squadSort : S.mktSort;
        const k = el.dataset.k;
        if (s.k === k) s.d *= -1; else { s.k = k; s.d = (k === 'name' || k === 'spec' || k === 'team' || k === 'contract' || k === 'age') ? 1 : -1; }
        render(); break;
      }
      case 'bulkplan': for (const rid of me().riders) G.riders[rid].plan = el.dataset.plan; toast('Training load set for all riders'); commit(); break;
      case 'autopick': S.sel = null; ensureSelection(Game.currentRace(G)); render(); break;
      case 'clearpick': S.sel.picks = {}; render(); break;
      case 'startrace': case 'autorace': {
        const race = Game.currentRace(G);
        Game.startRace(G, race, playerEntries());
        S.raceTab = 'stage'; S.stageView = null; S.tactic = 'bal';
        if (act === 'autorace') { while (race.status !== 'done') Game.simStage(G, race, 'bal'); S.raceTab = race.kind === 'oneday' ? 'stage' : 'gc'; }
        commit(); break;
      }
      case 'tactic': S.tactic = el.dataset.t; render(); break;
      case 'watch': runStage(true); break;
      case 'quickstage': runStage(false); break;
      case 'simrest': {
        const race = Game.currentRace(G);
        while (race.status === 'running') Game.simStage(G, race, S.tactic);
        S.raceTab = race.kind === 'oneday' ? 'stage' : 'gc'; S.stageView = null;
        commit(); break;
      }
      case 'livespeed': PCM.Live.speed(+el.dataset.s); break;
      case 'liveskip': PCM.Live.skip(); break;
      case 'liveclose': PCM.Live.stop(); S.live = null; S.raceTab = 'stage'; render(); break;
      case 'racetab': S.raceTab = el.dataset.t; render(); break;
      case 'raceresults': S.modal = { type: 'race', id }; S.raceTab = 'gc'; S.stageView = null; { const r = G.calendar.find(x => x.id === id); if (r.kind === 'oneday') S.raceTab = 'stage'; } render(); break;
      case 'standtab': S.standTab = el.dataset.t; render(); break;
      case 'renew': {
        const res = Game.renew(G, +id, +document.getElementById('rn-sal').value, +document.getElementById('rn-yrs').value);
        S.modal.msg = res.msg; S.modal.ok = res.ok; commit(); break;
      }
      case 'offer': {
        const res = Game.offer(G, +id, +document.getElementById('of-sal').value, +document.getElementById('of-yrs').value);
        S.modal.msg = res.msg; S.modal.ok = res.ok; commit(); break;
      }
      case 'release-ask': S.modal.confirmRelease = true; render(); break;
      case 'release-cancel': S.modal.confirmRelease = false; render(); break;
      case 'release': {
        const res = Game.release(G, +id);
        if (res.ok) { S.modal = null; toast(res.msg); } else { S.modal.msg = res.msg; S.modal.ok = false; }
        commit(); break;
      }
      case 'endseason': Game.endSeason(G); S.modal = { type: 'summary' }; S.sel = null; commit(true); break;
      case 'closesummary': G.pendingSummary = null; S.modal = G.fired ? { type: 'jobs' } : null; S.view = 'dashboard'; commit(); break;
      case 'takejob': Game.takeJob(G, id); S.modal = null; S.view = 'dashboard'; toast('Welcome to ' + G.teams[id].name); commit(); break;
      case 'copysave': {
        // clipboard must be written inside the click, so prepare the code ahead and copy on the second click if needed
        const done = ok => { S.ioMsg = ok ? `Save code copied (${Math.round(S.io.length / 1024)} KB). Paste it into the game on another device.` : 'Copy failed. Select the code below and copy it manually.'; render(); };
        if (S.io && S.ioFor === G) { try { navigator.clipboard.writeText(S.io).then(() => done(true), () => done(false)); } catch (err) { done(false); } break; }
        PCM.Saves.encode(G).then(code => {
          S.io = code; S.ioFor = G;
          try { navigator.clipboard.writeText(code).then(() => done(true), () => { S.ioMsg = 'Save code ready below. Click Copy save code again, or copy it manually.'; render(); }); } catch (err) { done(false); }
        });
        break;
      }
      case 'import': { const v = document.getElementById('io')?.value || ''; if (v.trim()) loadFromString(v); break; }
      case 'newgame-ask': S.modal = { type: 'newgame' }; render(); break;
      case 'newgame': PCM.Saves.flushAuto(); G = null; S.modal = null; S.newTeam = null; S.io = ''; S.ioMsg = ''; refreshSlots(); render(); break;
    }
  }
  function closeModal() {
    if (!S.modal) return;
    if (S.modal.type === 'summary') { G.pendingSummary = null; S.modal = G.fired ? { type: 'jobs' } : null; commit(); return; }
    if (S.modal.type === 'jobs') return; // must pick a team
    S.modal = null;
    render();
  }
  function handleChange(e) {
    const el = e.target;
    if (el.id === 'iofile' && el.files && el.files[0]) {
      const fr = new FileReader();
      fr.onload = () => loadFromString(String(fr.result));
      el.value = '';
      fr.readAsText(el.files[0]);
      return;
    }
    const act = el.dataset.change;
    if (!act) return;
    const id = +el.dataset.id;
    switch (act) {
      case 'plan': G.riders[id].plan = el.value; Game.save(G); if (S.modal) render(); break;
      case 'focus': G.riders[id].focus = el.value; Game.save(G); if (S.modal) render(); break;
      case 'pick': {
        if (el.checked) {
          const n = Race.rosterSize(Game.currentRace(G));
          if (Object.keys(S.sel.picks).length >= n) { toast(`You can only take ${n} riders.`); el.checked = false; return; }
          S.sel.picks[id] = 'dom';
        } else delete S.sel.picks[id];
        render(); break;
      }
      case 'role': S.sel.picks[id] = el.value; render(); break;
      case 'mkt': S.mkt[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.value; render(); break;
      case 'racestage': case 'modalstage': S.stageView = +el.value; S.raceTab = 'stage'; render(); break;
    }
  }

  function init(el) {
    root = el;
    document.addEventListener('click', handleClick);
    document.addEventListener('change', handleChange);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeModal();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && G) { e.preventDefault(); quickSave(); }
      if (e.key === 'Enter' && e.target.matches('a.rname, [data-act].teamcard')) e.target.click();
    });
    PCM.Saves.onChange(refreshSlots);
    PCM.Saves.init();
    refreshSlots();
    // make sure the latest progress reaches the cloud when the page is closed or hidden
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') PCM.Saves.flushAuto(); });
    window.addEventListener('pagehide', () => PCM.Saves.flushAuto());
    render();
  }

  return { init, render, profileGeom, profileSVG, evText, get G() { return G; } };
})();
