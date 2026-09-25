// Race engine: course generation and stage simulation. No DOM access here.
var PCM = globalThis.PCM || (globalThis.PCM = {});

PCM.Race = (function () {
  const { R, U, DATA, Riders } = PCM;

  const TYPE_OF = { F: 'flat', H: 'hilly', M: 'mountain', MS: 'mountain', ITT: 'itt', ITTS: 'itt', C: 'cobbles' };

  // sigma: randomness, k/quad: seconds lost per point of deficit, tol: deficit tolerated before losing time,
  // win: gap (s) that still counts as same group, speed km/h, fat: fatigue per stage
  const PARAMS = {
    flat: { sigma: 2.0, k: 14, quad: 0.2, tol: 11, win: 20, speed: 44, fat: 2.2, pBreak: 0.12, breakSize: [2, 5] },
    hilly: { sigma: 2.4, k: 8, quad: 0.3, tol: 2.5, win: 6, speed: 41, fat: 3.2, pBreak: 0.4, breakSize: [4, 9] },
    mountain: { sigma: 2.1, k: 9, quad: 0.3, tol: 0.8, win: 4, speed: 35, fat: 4.6, pBreak: 0.5, breakSize: [5, 14] },
    itt: { sigma: 1.2, k: 0.33, quad: 0, tol: 0, win: 0, speed: 48, fat: 1.6, pBreak: 0, breakSize: [0, 0] },
    cobbles: { sigma: 3.2, k: 10, quad: 0.45, tol: 1.5, win: 8, speed: 43, fat: 4.0, pBreak: 0.2, breakSize: [4, 8] },
  };

  const CLIMB_SPEC = {
    HC: { len: [12, 19], grade: [6.5, 8.5] },
    1: { len: [8, 13], grade: [6, 7.6] },
    2: { len: [5, 9], grade: [5, 6.5] },
    3: { len: [3, 5.5], grade: [4.5, 6] },
    4: { len: [1, 3], grade: [4, 7.5] },
  };

  function makeClimb(cat, crest, country) {
    const spec = CLIMB_SPEC[cat];
    const prefixes = DATA.CLIMB_PREFIX[country] || ['Côte de'];
    const len = U.round(R.range(spec.len[0], spec.len[1]), 1);
    return {
      name: R.pick(prefixes) + ' ' + R.pick(DATA.CLIMB_NAMES),
      cat: String(cat), len, grade: U.round(R.range(spec.grade[0], spec.grade[1]), 1),
      km: Math.max(Math.round(crest), Math.ceil(len) + 2),
    };
  }

  function spread(count, from, to) {
    const out = [];
    for (let i = 0; i < count; i++) out.push(from + (to - from) * ((i + R.range(0.2, 0.8)) / count));
    return out;
  }

  function buildStage(code, n, country, opts = {}) {
    const type = opts.type || TYPE_OF[code];
    const summit = code === 'MS';
    let km;
    if (opts.km) km = opts.km;
    else if (type === 'itt') km = code === 'ITTS' ? R.int(7, 16) : R.int(26, 44);
    else if (type === 'flat') km = R.int(165, 215);
    else if (type === 'hilly') km = R.int(155, 200);
    else if (type === 'mountain') km = R.int(135, 195);
    else km = R.int(170, 210);

    const climbs = [];
    let sectors = 0;
    const oneday = !!opts.oneday;
    if (type === 'flat') {
      if (opts.lateClimbs) {
        climbs.push(makeClimb(3, km - R.int(22, 28), country));
        climbs.push(makeClimb(4, km - R.int(5, 7), country));
      } else {
        const c = R.int(0, 2);
        spread(c, 20, km * 0.6).forEach(x => climbs.push(makeClimb(R.chance(0.7) ? 4 : 3, x, country)));
      }
    } else if (type === 'hilly') {
      const c = oneday ? R.int(8, 11) : R.int(3, 6);
      const xs = spread(c - 1, km * (oneday ? 0.35 : 0.2), km - 25);
      xs.forEach(x => climbs.push(makeClimb(R.pick([4, 3, 3, 2]), x, country)));
      climbs.push(makeClimb(R.pick(oneday ? [3, 2] : [4, 3, 3]), km - R.int(opts.oneday ? 12 : 1, 16), country));
    } else if (type === 'mountain') {
      const c = oneday ? 5 : R.int(3, 5);
      const xs = spread(c - 1, km * 0.15, km * 0.75);
      xs.forEach(x => climbs.push(makeClimb(R.pick([3, 2, 2, 1, 1, 'HC']), x, country)));
      if (summit) climbs.push(makeClimb(R.chance(0.45) ? 'HC' : 1, km, country));
      else climbs.push(makeClimb(oneday ? 2 : R.pick([1, 1, 'HC', 2]), km - R.int(12, 26), country));
    } else if (type === 'cobbles') {
      sectors = opts.flatCobbles ? R.int(26, 30) : R.int(10, 22);
      if (!opts.flatCobbles) {
        const c = oneday ? R.int(12, 17) : R.int(0, 3);
        spread(c, km * 0.4, km - 15).forEach(x => climbs.push(makeClimb(4, x, country)));
      }
    } else if (type === 'itt' && km > 25 && R.chance(0.4)) {
      climbs.push(makeClimb(R.pick([3, 4]), km * R.range(0.3, 0.7), country));
    }
    climbs.sort((a, b) => a.km - b.km);
    for (const c of climbs) c.km = Math.min(c.km, km);

    return { n, code, type, summit, km, climbs, sectors, lateClimbs: !!opts.lateClimbs, profile: buildProfile(km, type, climbs, summit) };
  }

  function buildProfile(km, type, climbs, summit) {
    const steps = 120;
    const base = type === 'mountain' ? R.int(300, 800) : R.int(20, 250);
    const ph1 = R.range(0, 6), ph2 = R.range(0, 6);
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const x = km * i / steps;
      let e = base + 35 * Math.sin(x / 17 + ph1) + 18 * Math.sin(x / 6.3 + ph2);
      for (const c of climbs) {
        const gain = c.len * c.grade * 10;
        const start = c.km - c.len;
        const desc = c.len * 1.2;
        if (x >= start && x <= c.km) e += gain * Math.pow((x - start) / c.len, 1.15);
        else if (x > c.km && x <= c.km + desc && !(summit && c.km >= km - 0.5)) e += gain * (1 - (x - c.km) / desc);
      }
      pts.push(Math.max(0, Math.round(e)));
    }
    return pts;
  }

  function instantiate(tpl, year) {
    const race = {
      id: tpl.id + '-' + year, tplId: tpl.id, name: tpl.name, country: tpl.country, week: tpl.week, weeks: tpl.weeks,
      kind: tpl.kind, cls: tpl.cls, year, status: 'upcoming', stages: [], cur: 0,
    };
    if (tpl.kind === 'oneday') {
      race.stages.push(buildStage(tpl.type === 'mountain' ? 'M' : tpl.type[0].toUpperCase(), 1, tpl.country,
        { type: tpl.type, km: tpl.km, oneday: true, lateClimbs: tpl.lateClimbs, flatCobbles: tpl.flatCobbles }));
    } else {
      const pat = DATA.PATTERNS[tpl.pattern].slice(0, tpl.stages);
      pat.forEach((code, i) => race.stages.push(buildStage(code, i + 1, tpl.country)));
    }
    return race;
  }

  // ---------- abilities ----------
  function raceAbility(a, stage) {
    switch (stage.type) {
      case 'flat': return stage.lateClimbs ? a.fl * 0.35 + a.st * 0.3 + a.hi * 0.2 + a.sp * 0.15 : a.fl * 0.55 + a.st * 0.25 + a.sp * 0.2;
      case 'hilly': return a.hi * 0.5 + a.mm * 0.2 + a.st * 0.15 + a.mo * 0.15;
      case 'mountain': return a.mo * 0.65 + a.mm * 0.07 + a.st * 0.13 + a.re * 0.15;
      case 'itt': return stage.km <= 16 ? a.prl * 0.75 + a.tt * 0.15 + a.fl * 0.1 : a.tt * 0.85 + a.fl * 0.15;
      case 'cobbles': return a.co * 0.62 + a.fl * 0.18 + a.st * 0.1 + a.res * 0.1;
    }
    return 50;
  }
  function finishAbility(a, stage) {
    switch (stage.type) {
      case 'flat': return a.sp * 0.7 + a.acc * 0.15 + a.fl * 0.15;
      case 'hilly': return a.hi * 0.45 + a.sp * 0.3 + a.acc * 0.25;
      case 'mountain': return stage.summit ? raceAbility(a, stage) : a.mo * 0.35 + a.mm * 0.15 + a.dh * 0.15 + a.hi * 0.15 + a.acc * 0.2;
      case 'itt': return raceAbility(a, stage);
      case 'cobbles': return a.co * 0.45 + a.sp * 0.35 + a.acc * 0.2;
    }
    return 50;
  }
  const STAGE_WEIGHT = { MS: 3, M: 2, ITT: 2.2, ITTS: 0.7, H: 1, F: 0.2, C: 0.8 };
  // What makes a rider a good leader for this race
  function raceKey(r, race) {
    if (race.kind === 'oneday') {
      const s = race.stages[0];
      return raceAbility(r.a, s) * 0.6 + finishAbility(r.a, s) * 0.4;
    }
    let t = 0, w = 0;
    for (const s of race.stages) { const sw = STAGE_WEIGHT[s.code] || 1; t += raceAbility(r.a, s) * sw; w += sw; }
    return t / w + (r.a.re - 65) * 0.08;
  }
  function sprintKey(r) { return r.a.sp * 0.85 + r.a.fl * 0.15; }
  function supportKey(r, race) {
    let t = 0;
    for (const s of race.stages) {
      const v = s.type === 'mountain' ? r.a.mo : s.type === 'hilly' ? r.a.hi : s.type === 'cobbles' ? (r.a.co + r.a.fl) / 2 : s.type === 'itt' ? r.a.tt * 0.3 + r.a.fl * 0.7 : r.a.fl;
      t += v;
    }
    return t / race.stages.length * 0.75 + r.a.st * 0.1 + r.a.re * 0.15;
  }
  function fitness(r) { return (r.form - 60) / 8 - Math.max(0, r.fatigue - 25) / 6; }
  function flatStageCount(race) { return race.stages.filter(s => s.type === 'flat' && !s.lateClimbs).length; }
  function rosterSize(race) { return race.cls === 'GT' ? 8 : 7; }

  // Pick riders + roles for a team (used by AI and "auto pick")
  function selectRoster(G, team, race) {
    const n = rosterSize(race);
    let avail = team.riders.map(id => G.riders[id]).filter(r => r && r.injury === 0);
    const fresh = avail.filter(r => r.fatigue < 70);
    if (fresh.length >= n) avail = fresh;
    if (!avail.length) return [];
    const picked = [];
    const leader = U.maxBy(avail, r => raceKey(r, race) + fitness(r) - r.season.days * (race.cls === 'GT' ? 0.03 : 0.07) + R.normal(0, 1.2));
    picked.push({ rid: leader.id, role: 'leader' });
    const flats = flatStageCount(race);
    const wantSprinter = race.kind === 'oneday' ? race.stages[0].type === 'flat' : flats >= 2;
    let pool = avail.filter(r => r !== leader);
    if (wantSprinter && pool.length) {
      const sp = U.maxBy(pool, r => sprintKey(r) + fitness(r));
      if (race.kind !== 'oneday' || sprintKey(sp) > raceKey(leader, race)) {
        picked.push({ rid: sp.id, role: 'sprinter' });
        pool = pool.filter(r => r !== sp);
      }
    }
    const ranked = pool.map(r => ({ r, s: supportKey(r, race) * 0.7 + raceKey(r, race) * 0.3 + fitness(r) - r.season.days * 0.05 + R.normal(0, 1.2) }))
      .sort((x, y) => y.s - x.s);
    for (const x of ranked) {
      if (picked.length >= n) break;
      picked.push({ rid: x.r.id, role: 'dom' });
    }
    // best remaining non-leader by race key gets freedom
    const doms = picked.filter(p => p.role === 'dom');
    if (doms.length >= 3) {
      const f = U.maxBy(doms, p => raceKey(G.riders[p.rid], race));
      f.role = 'free';
    }
    return picked;
  }

  // ---------- race runtime ----------
  function start(G, race, entriesByTeam) {
    race.entries = [];
    race.st = {};
    for (const teamId in entriesByTeam) {
      for (const e of entriesByTeam[teamId]) {
        race.entries.push({ rid: e.rid, teamId, role: e.role });
        race.st[e.rid] = { t: 0, pts: 0, kom: 0, out: false, pos: 0, df: U.round(R.normal(0, 1.8), 2) };
      }
    }
    race.tactics = {};
    race.stageResults = [];
    race.cur = 0;
    race.status = 'running';
  }

  function youthAge(G) { return 25; }

  function gcOrder(race) {
    return race.entries.filter(e => !race.st[e.rid].out)
      .sort((a, b) => race.st[a.rid].t - race.st[b.rid].t || race.st[a.rid].pos - race.st[b.rid].pos);
  }

  // assign time gaps from scores, grouping riders that finish together
  function place(list, P, stage, scale = 1) {
    if (!list.length) return [];
    const byScore = list.slice().sort((a, b) => b.score - a.score);
    const lead = byScore[0].score;
    for (const e of byScore) {
      const d = Math.max(0, lead - e.score - P.tol);
      e.raw = stage.type === 'itt' ? d * P.k * stage.km + R.range(0, 0.9) : (d * P.k + d * d * P.quad) * scale;
    }
    byScore.sort((a, b) => a.raw - b.raw);
    const groups = [];
    let g = null, prev = -1e9;
    for (const e of byScore) {
      if (!g || e.raw - prev > P.win) { g = { gap: e.raw, riders: [] }; groups.push(g); }
      g.riders.push(e);
      prev = e.raw;
    }
    const out = [];
    for (const grp of groups) {
      grp.riders.sort((a, b) => (stage.type === 'itt' ? a.raw - b.raw : b.fin - a.fin));
      for (const e of grp.riders) out.push({ e, gap: stage.type === 'itt' ? e.raw : grp.gap });
    }
    return out;
  }

  // descents and long valleys regroup riders on stages without a summit finish
  function stageScale(stage, oneday) {
    if (oneday) return 1.3;
    if (stage.type === 'mountain') return stage.summit ? 1 : 0.6;
    if (stage.type === 'hilly') return 0.7;
    return 1;
  }

  function awardPoints(G, rid, pts) {
    if (!pts) return;
    const r = G.riders[rid];
    r.season.pts += pts;
    r.career.pts += pts;
    const team = G.teams[r.teamId];
    if (team) {
      team.season.pts += pts;
      team.cash += pts * DATA.PRIZE_PER_POINT;
      if (team.id === G.playerTeamId) PCM.Game.ledger(G, 'Prize money', pts * DATA.PRIZE_PER_POINT, true);
    }
  }

  function addWin(G, rid, label, big) {
    const r = G.riders[rid];
    r.season.wins++;
    r.career.wins++;
    r.palmares.push(G.year + ' · ' + label);
    r.morale = U.clamp(r.morale + (big ? 20 : 10), 0, 100);
    const team = G.teams[r.teamId];
    if (team) team.season.wins++;
  }

  // Time trials use the score-based engine; every other stage is raced kilometre by kilometre.
  function runStage(G, race) {
    const stage = race.stages[race.cur];
    if (stage.type === 'itt' || !PCM.StageSim) return legacyStage(G, race);
    const sim = PCM.StageSim.create(G, race);
    PCM.StageSim.runToEnd(sim);
    return PCM.StageSim.finish(sim);
  }

  function legacyStage(G, race) {
    const stage = race.stages[race.cur];
    const day = race.cur;
    const P = PARAMS[stage.type];
    const oneday = race.kind === 'oneday';
    const active = race.entries.filter(e => !race.st[e.rid].out);
    const events = [];
    const abandons = [];

    // team support values
    const rel = { mountain: 'mo', hilly: 'hi', flat: 'fl', cobbles: 'co', itt: null }[stage.type];
    const teamSup = {};
    for (const e of active) {
      const ts = teamSup[e.teamId] || (teamSup[e.teamId] = { support: 0, leadout: 0, hasSprinter: false });
      const a = G.riders[e.rid].a;
      if (e.role === 'sprinter') ts.hasSprinter = true;
      if (e.role === 'dom' && rel) ts.support += Math.max(0, a[rel] - 62) / 12;
      if ((e.role === 'dom' || e.role === 'free') && stage.type !== 'mountain' && stage.type !== 'itt') ts.leadout += Math.max(0, (a.sp + a.fl) / 2 - 62) / 10;
    }
    for (const t in teamSup) { teamSup[t].support = Math.min(3, teamSup[t].support); teamSup[t].leadout = Math.min(3, teamSup[t].leadout); }

    // GC context for breakaway eligibility
    const gc = oneday ? [] : gcOrder(race);
    const gcTop = new Set(day >= 1 ? gc.slice(0, 15).map(e => e.rid) : []);

    const list = active.map(e => {
      const r = G.riders[e.rid];
      const tact = race.tactics[e.teamId] || 'bal';
      let sig = P.sigma * (tact === 'agg' ? 1.25 : tact === 'cons' ? 0.85 : 1);
      let adj = (r.form - 60) / 8 - Math.max(0, r.fatigue - 25) / 7 + (r.morale - 60) / 20 + race.st[e.rid].df;
      if (!oneday) adj -= day * Math.max(0, 72 - r.a.re) * 0.012;
      if (oneday && stage.km > 230) adj += (r.a.st - 70) * 0.1 * ((stage.km - 230) / 40);
      adj += tact === 'agg' ? 0.7 : tact === 'cons' ? -0.5 : 0;
      const ts = teamSup[e.teamId];
      let score = raceAbility(r.a, stage) + adj + R.normal(0, sig);
      if (e.role === 'dom') score -= 1.5;
      if (e.role === 'leader') score += ts.support;
      if (R.chance(0.025)) score -= R.range(5, 12);
      let fin = finishAbility(r.a, stage) + adj * 0.5 + R.normal(0, stage.type === 'flat' ? 2.8 : 2);
      if (e.role === 'sprinter' || (e.role === 'leader' && !ts.hasSprinter)) fin += ts.leadout * (e.role === 'sprinter' ? 1 : 0.5);
      return { rid: e.rid, teamId: e.teamId, role: e.role, tact, score, fin, crashed: false };
    });

    // crashes & illness
    const pCrash = stage.type === 'cobbles' ? 0.011 : stage.type === 'flat' ? 0.005 : stage.type === 'itt' ? 0.001 : 0.004;
    for (const x of list) {
      const r = G.riders[x.rid];
      if (R.chance(pCrash)) {
        const km = R.int(5, Math.max(6, stage.km - 3));
        if (R.chance(0.35)) {
          x.out = true;
          r.injury = R.int(1, 6);
          events.push({ km, kind: 'abandon', rids: [x.rid], why: 'crash' });
        } else {
          x.score -= R.range(1, 6);
          r.fatigue = U.clamp(r.fatigue + 8, 0, 100);
          events.push({ km, kind: 'crash', rids: [x.rid] });
        }
      } else if (!oneday && r.fatigue > 80 && R.chance(0.15)) {
        x.out = true;
        events.push({ km: R.int(10, stage.km - 5), kind: 'abandon', rids: [x.rid], why: 'illness' });
      }
    }
    const racing = list.filter(x => !x.out);
    for (const x of list) if (x.out) { race.st[x.rid].out = true; abandons.push(x.rid); }

    // breakaway
    let brk = null;
    if (stage.type !== 'itt') {
      const cands = racing.filter(x => x.role !== 'leader' && !(x.role === 'sprinter' && stage.type === 'flat') && !gcTop.has(x.rid));
      const size = Math.min(cands.length, R.int(P.breakSize[0], P.breakSize[1]));
      if (size > 0) {
        const riders = R.weightedN(cands, size, x => (x.role === 'free' ? 4 : x.role === 'dom' ? 1 : 1.6) *
          (x.tact === 'agg' ? 2 : x.tact === 'cons' ? 0.5 : 1) * Math.exp((x.score - 70) / 5));
        let p = P.pBreak;
        if (stage.type === 'mountain' && stage.summit) p = 0.28;
        if (oneday) p *= 0.55;
        if (!oneday && day >= race.stages.length / 2) p += 0.15;
        if (race.cls === 'GT') p += 0.04;
        const success = R.chance(p);
        const formKm = R.int(3, Math.min(30, Math.max(4, Math.floor(stage.km * 0.2))));
        brk = { rids: riders.map(x => x.rid), success, formKm, catchKm: success ? null : Math.round(stage.km * R.range(0.62, 0.97)) };
        events.push({ km: formKm, kind: 'break', rids: brk.rids });
      }
    }

    // results
    let placed;
    if (brk && brk.success) {
      const set = new Set(brk.rids);
      const front = place(racing.filter(x => set.has(x.rid)), P, stage, 0.45);
      const rest = place(racing.filter(x => !set.has(x.rid)), P, stage, stageScale(stage, oneday));
      const margins = { flat: [10, 60], hilly: [30, 240], mountain: [60, 480], cobbles: [20, 150] }[stage.type];
      const lastFront = front.length ? front[front.length - 1].gap : 0;
      const offset = lastFront + R.range(margins[0], margins[1]);
      brk.gap = Math.round(offset);
      placed = front.concat(rest.map(p => ({ e: p.e, gap: p.gap + offset })));
    } else {
      if (brk) {
        const set = new Set(brk.rids);
        for (const x of racing) if (set.has(x.rid)) { x.score -= 1.5; x.fin -= 3; }
        events.push({ km: brk.catchKm, kind: 'catch', rids: brk.rids });
      }
      placed = place(racing, P, stage, stageScale(stage, oneday));
    }
    const T0 = Math.round(stage.km / P.speed * 3600 * R.range(0.97, 1.03));

    const results = placed.map((p, i) => ({ rid: p.e.rid, pos: i + 1, gap: Math.round(p.gap) }));
    // winner's gap may be >0 due to ITT noise; normalise
    const g0 = results.length ? results[0].gap : 0;
    for (const x of results) x.gap -= g0;

    // mountain points: the break takes the climbs it was ahead on, otherwise the best climbers
    const komOrders = [];
    const racingIds = racing.map(x => x.rid);
    stage.climbs.forEach((c, i) => {
      let order;
      if (brk && (brk.success || c.km < brk.catchKm) && c.km > brk.formKm) {
        order = brk.rids.filter(id => !race.st[id].out).map(id => ({ id, v: G.riders[id].a.mo + R.normal(0, 3) }))
          .sort((a, b) => b.v - a.v).map(o => o.id);
      } else {
        order = racingIds.map(id => ({ id, v: G.riders[id].a.mo * 0.9 + R.normal(0, 5) })).sort((a, b) => b.v - a.v).slice(0, 8).map(o => o.id);
      }
      komOrders.push({ i, rids: order });
      if (order.length) events.push({ km: c.km, kind: 'kom', rids: [order[0]], climb: i });
    });
    return applyStageResult(G, race, stage, {
      results, T0, komOrders, events, abandons,
      brk: brk ? { rids: brk.rids, success: brk.success, formKm: brk.formKm, catchKm: brk.catchKm, gap: brk.gap || 0 } : null,
      racing: racing.map(x => ({ rid: x.rid, role: x.role, tact: x.tact, inBreak: !!(brk && brk.rids.includes(x.rid)) })),
    });
  }

  // Bookkeeping shared by both stage engines: GC times, classifications, fatigue, UCI points, wins.
  function applyStageResult(G, race, stage, d) {
    const oneday = race.kind === 'oneday';
    const P = PARAMS[stage.type];
    const results = d.results;
    const T0 = d.T0;
    for (const rid of d.abandons) if (race.st[rid]) race.st[rid].out = true;

    // GC times + bonuses
    const bonus = (!oneday && stage.type !== 'itt') ? [10, 6, 4] : [];
    results.forEach((x, i) => {
      const st = race.st[x.rid];
      st.t += T0 + x.gap - (bonus[i] || 0);
      st.pos += x.pos;
    });

    // points classification
    const tbl = DATA.STAGE_POINTS[stage.type];
    results.slice(0, tbl.length).forEach((x, i) => { race.st[x.rid].pts += tbl[i]; });

    // mountains classification (a summit finish is scored from the stage result)
    const komLog = [];
    stage.climbs.forEach((c, i) => {
      let order;
      if (i === stage.climbs.length - 1 && stage.summit && c.km >= stage.km - 0.5) order = results.map(x => x.rid);
      else order = ((d.komOrders || []).find(o => o.i === i) || { rids: [] }).rids.filter(id => race.st[id] && !race.st[id].out);
      const pts = DATA.KOM_POINTS[c.cat] || [];
      pts.forEach((p, j) => { if (order[j] !== undefined) race.st[order[j]].kom += p; });
      komLog.push({ i, rids: order.slice(0, 3) });
    });
    const events = (d.events || []).slice().sort((a, b) => a.km - b.km);

    // fatigue, race days, morale
    for (const x of d.racing) {
      const r = G.riders[x.rid];
      let f;
      if (d.energyUsed) f = P.fat * (1.25 - r.a.re / 100) * 0.5 + (d.energyUsed.get(x.rid) || 0) * 0.05;
      else {
        f = P.fat * (1.25 - r.a.re / 100) * (x.role === 'dom' ? 1.15 : 1) * (x.tact === 'agg' ? 1.3 : x.tact === 'cons' ? 0.8 : 1);
        if (x.inBreak) f += 2;
      }
      r.fatigue = U.clamp(r.fatigue + f, 0, 100);
      if (!oneday) r.fatigue = U.clamp(r.fatigue - (1.5 + (r.a.re - 50) / 20), 0, 100);
      r.season.days++;
      r.career.days++;
    }

    // UCI points / wins for the stage (one-day races award their full scale here)
    const table = oneday ? DATA.UCI[race.cls].oneday : DATA.UCI[race.cls].stage;
    results.slice(0, table.length).forEach((x, i) => awardPoints(G, x.rid, table[i]));
    results.slice(0, 10).forEach(x => { G.riders[x.rid].season.top10++; });
    if (results.length) {
      const w = results[0].rid;
      addWin(G, w, oneday ? race.name : race.name + ' – Stage ' + stage.n, oneday && race.cls === 'MON');
    }
    logTeamResults(G, race, results, oneday ? 'oneday' : 'stage');

    const sr = {
      n: stage.n, type: stage.type, T0, results: results.map(x => [x.rid, x.gap]), komLog, events, abandons: d.abandons,
      brk: d.brk,
      gcLeader: oneday ? null : gcOrder(race)[0]?.rid,
    };
    race.stageResults.push(sr);
    race.cur++;
    if (race.cur >= race.stages.length) finish(G, race);
    return sr;
  }

  // record best team placings for board objectives
  function logTeamResults(G, race, results, kind) {
    const seen = new Set();
    for (const x of results.slice(0, 20)) {
      const t = G.riders[x.rid].teamId;
      if (!t || seen.has(t)) continue;
      seen.add(t);
      G.teams[t].log.push({ race: race.tplId, cls: race.cls, kind, pos: x.pos });
    }
  }

  function standings(G, race) {
    const gc = gcOrder(race);
    const lead = gc.length ? race.st[gc[0].rid].t : 0;
    const out = { gc: gc.map(e => [e.rid, race.st[e.rid].t - lead]) };
    const alive = gc.map(e => e.rid);
    const gcIdx = new Map(alive.map((id, i) => [id, i]));
    out.pts = alive.filter(id => race.st[id].pts > 0).sort((a, b) => race.st[b].pts - race.st[a].pts || gcIdx.get(a) - gcIdx.get(b)).map(id => [id, race.st[id].pts]);
    out.kom = alive.filter(id => race.st[id].kom > 0).sort((a, b) => race.st[b].kom - race.st[a].kom || gcIdx.get(a) - gcIdx.get(b)).map(id => [id, race.st[id].kom]);
    out.youth = out.gc.filter(([id]) => Riders.age(G.riders[id], G.year) <= youthAge(G));
    // team classification: sum of best 3 GC times
    const teams = {};
    for (const [id, gap] of out.gc) {
      const t = G.riders[id].teamId;
      (teams[t] || (teams[t] = [])).push(gap);
    }
    out.teams = Object.entries(teams).filter(([, a]) => a.length >= 3).map(([t, a]) => [t, a.slice(0, 3).reduce((s, x) => s + x, 0)])
      .sort((a, b) => a[1] - b[1]);
    return out;
  }

  function finish(G, race) {
    race.status = 'done';
    const oneday = race.kind === 'oneday';
    const st = oneday ? null : standings(G, race);
    if (oneday) {
      const res = race.stageResults[0].results;
      race.final = { gc: res.slice(), pts: [], kom: [], youth: [], teams: [] };
      race.winner = res.length ? res[0][0] : null;
    } else {
      race.final = st;
      race.winner = st.gc.length ? st.gc[0][0] : null;
      const U_ = DATA.UCI[race.cls];
      st.gc.slice(0, U_.gc.length).forEach(([id], i) => awardPoints(G, id, U_.gc[i]));
      st.pts.slice(0, U_.jersey.length).forEach(([id], i) => awardPoints(G, id, U_.jersey[i]));
      st.kom.slice(0, U_.jersey.length).forEach(([id], i) => awardPoints(G, id, Math.round(U_.jersey[i] * 0.8)));
      if (race.winner) addWin(G, race.winner, race.name + ' – GC', race.cls === 'GT');
      if (st.pts.length) G.riders[st.pts[0][0]].palmares.push(G.year + ' · ' + race.name + ' – Points');
      if (st.kom.length) G.riders[st.kom[0][0]].palmares.push(G.year + ' · ' + race.name + ' – Mountains');
      logTeamResults(G, race, st.gc.map(([id], i) => ({ rid: id, pos: i + 1 })), 'gc');
    }

    // form: racing sharpens riders who aren't exhausted
    for (const e of race.entries) {
      const r = G.riders[e.rid];
      // racing sharpens form, but real peaks only come from building towards a target race
      if (r.fatigue < 55) r.form = U.clamp(r.form + Math.min(4, race.stages.length * 0.3 + 1), 0, Math.max(r.form, 82));
      else r.form = U.clamp(r.form - 3, 30, 99);
    }

    // trim stored data
    const mine = new Set(G.teams[G.playerTeamId].riders);
    const keep = (arr, n) => arr.filter((x, i) => i < n || mine.has(x[0]));
    race.stageResults.forEach((sr, i) => {
      sr.results = keep(sr.results, 30);
      if (i < race.stageResults.length - 1) delete sr.events; // last stage keeps events for live playback
    });
    race.final.gc = keep(race.final.gc, 40);
    race.final.pts = (race.final.pts || []).slice(0, 15);
    race.final.kom = (race.final.kom || []).slice(0, 15);
    race.final.youth = (race.final.youth || []).slice(0, 15);
    race.entrants = race.entries.map(e => [e.rid, e.teamId, e.role]).filter(x => x[1] === G.playerTeamId);
    delete race.st;
    delete race.entries;

    if (race.winner) {
      const w = G.riders[race.winner];
      PCM.Game.news(G, `${Riders.fullName(w)} (${G.teams[w.teamId]?.name || 'free agent'}) wins ${race.name}.`, w.teamId === G.playerTeamId);
      if (race.cls === 'GT' || race.cls === 'MON') G.honours.push({ year: G.year, race: race.name, rid: race.winner, name: Riders.fullName(w), team: G.teams[w.teamId]?.name || '' });
    }
  }

  return { buildStage, instantiate, selectRoster, start, runStage, applyStageResult, standings, gcOrder, raceKey, sprintKey, rosterSize,
    raceAbility, finishAbility, PARAMS, youthAge };
})();
