// Kilometre-by-kilometre stage simulation with groups, energy and rider orders.
// Used for every road stage: run instantly for quick results, or stepped live so the player can give orders.
var PCM = globalThis.PCM || (globalThis.PCM = {});

PCM.StageSim = (function () {
  const { R, U, DATA } = PCM;

  // a rider more than TOL points below the group's pace gets dropped
  const TOL = { flat: 12, rolling: 3.2, climb: 2.2, descent: 9, cobbles: 2.8 };
  // energy used per km before effort and stamina multipliers
  const DRAIN = { flat: 0.28, rolling: 0.5, climb: 0.85, descent: 0.1, cobbles: 0.8 };
  // share of a kilometre's time gained per point of pace; climbs are slower, so each point counts for less
  const PACE_K = { flat: 0.0065, rolling: 0.005, climb: 0.0028, descent: 0.005, cobbles: 0.0048 };
  // how far below the pace a rider can be before losing the wheel on a climb, by category
  const CLIMB_TOL = { 4: 5, 3: 4, 2: 3, 1: 2.4, HC: 2.2 };
  // PCM-style orders; attack and bottle are one-off actions
  const ORDERS = { auto: 'Auto', follow: 'Follow', pull: 'Tempo', save: 'Sit on', help: 'Protect leader', leadout: 'Lead-out' };
  const BOTTLES = 3;
  const effortBonus = e => (e - 6) * 0.8;                 // pace added when riding at effort e
  const effortCost = e => 0.6 + e * 0.16;                  // energy multiplier when working at effort e
  const TERRAIN_LABEL = { flat: 'Flat', rolling: 'Rolling', climb: 'Climb', descent: 'Descent', cobbles: 'Cobbles' };

  const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
  const quant = (sorted, q) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0;

  function secPerKm(seg) {
    if (seg.terr === 'climb') return 3600 / Math.max(12, 38 - seg.grade * 3);
    return { flat: 80, rolling: 92, descent: 62, cobbles: 88 }[seg.terr];
  }
  function elevAt(stage, km) {
    const pts = stage.profile;
    const f = U.clamp(km / stage.km, 0, 1) * (pts.length - 1);
    const i = Math.floor(f), j = Math.min(pts.length - 1, i + 1);
    return pts[i] + (pts[j] - pts[i]) * (f - i);
  }

  // terrain for every kilometre of the stage
  function buildCourse(stage) {
    const n = Math.max(1, Math.ceil(stage.km));
    const sectors = [];
    if (stage.type === 'cobbles' && stage.sectors) {
      for (let i = 0; i < stage.sectors; i++) sectors.push(Math.round(stage.km * 0.3 + i * (stage.km * 0.66 / stage.sectors)));
    }
    const segs = [];
    for (let k = 0; k < n; k++) {
      let grade = (elevAt(stage, k + 1) - elevAt(stage, k)) / 10, climb = -1, terr = 'flat';
      stage.climbs.forEach((c, i) => { if (k >= c.km - c.len && k < c.km) { climb = i; grade = c.grade; } });
      if (climb >= 0) terr = grade < 4.5 && stage.climbs[climb].cat === '4' ? 'rolling' : 'climb';
      else if (grade > 2.5) terr = 'rolling';
      else if (grade < -2.5) terr = 'descent';
      if (sectors.some(s => k >= s && k < s + 2)) terr = 'cobbles';
      // the short climbs of the cobbled Classics are cobbled bergs
      if (stage.type === 'cobbles' && climb >= 0) terr = 'cobbles';
      segs.push({ k, terr, grade: U.round(grade, 1), climb });
    }
    return segs;
  }

  function abil(a, seg) {
    switch (seg.terr) {
      case 'flat': return a.fl * 0.75 + a.st * 0.25;
      case 'rolling': return a.hi * 0.6 + a.mm * 0.25 + a.fl * 0.15;
      case 'climb': return seg.grade >= 6 ? a.mo * 0.85 + a.re * 0.15 : a.mm * 0.75 + a.hi * 0.25;
      case 'cobbles': return seg.grade > 3 ? a.co * 0.6 + a.hi * 0.4 : a.co * 0.75 + a.fl * 0.25;
      default: return a.dh * 0.7 + a.fl * 0.3;
    }
  }

  // ---------------- setup ----------------
  function create(G, race) {
    const stage = race.stages[race.cur];
    const day = race.cur, oneday = race.kind === 'oneday';
    const gc = oneday ? [] : PCM.Race.gcOrder(race);
    const gcPos = new Map(gc.map((e, i) => [e.rid, i + 1]));
    const leadT = gc.length ? race.st[gc[0].rid].t : 0;
    const riders = [];
    const events = [];
    const abandons = [];
    for (const e of race.entries) {
      const st = race.st[e.rid];
      if (st.out) continue;
      const r = G.riders[e.rid];
      if (!oneday && r.fatigue > 80 && R.chance(0.15)) {
        abandons.push(e.rid);
        events.push({ km: R.int(10, Math.max(11, stage.km - 5)), kind: 'abandon', rids: [e.rid], why: 'illness' });
        continue;
      }
      let adj = (r.form - 60) / 8 - Math.max(0, r.fatigue - 25) / 7 + (r.morale - 60) / 20 + (st.df || 0);
      if (!oneday) adj -= day * Math.max(0, 72 - r.a.re) * 0.012;
      if (R.chance(0.02)) adj -= R.range(4, 9); // a bad day
      const energy = U.clamp(100 - Math.max(0, r.fatigue - 15) * 0.8, 35, 100);
      riders.push({
        rid: e.rid, teamId: e.teamId, role: e.role, r, adj, energy, startEnergy: energy,
        order: 'auto', act: 'follow', burst: 0, cooldown: 0, out: false, eff: 0, support: 0, shelter: 0,
        effort: 8, needed: 4, bottles: BOTTLES, lastBottle: -99,
        gcGap: oneday ? 0 : st.t - leadT, gcPos: gcPos.get(e.rid) || 999, mine: e.teamId === G.playerTeamId,
      });
    }
    const byRid = new Map(riders.map(x => [x.rid, x]));
    const teams = {};
    for (const x of riders) {
      const t = teams[x.teamId] || (teams[x.teamId] = { riders: [], leader: null, sprinter: null });
      t.riders.push(x);
      if (x.role === 'leader' && !t.leader) t.leader = x;
      if (x.role === 'sprinter' && !t.sprinter) t.sprinter = x;
    }
    return {
      G, race, stage, oneday, course: buildCourse(stage), riders, byRid, teams,
      groups: [{ id: 1, riders: riders.slice(), t: 0, dt: 0, pace: 70 }], nextGid: 2,
      k: 0, done: false, events, abandons, kom: [], brk: null, chasers: new Map(),
      chaseFactor: R.range(0.6, 1.45), tactics: race.tactics || {}, playerTeam: G.playerTeamId,
    };
  }

  // ---------------- orders ----------------
  function setOrder(sim, rid, order) {
    const x = sim.byRid.get(rid);
    if (x && ORDERS[order]) x.order = order;
  }
  function attack(sim, rid) {
    const x = sim.byRid.get(rid);
    if (!x || x.out || x.burst > 0 || x.cooldown > 0 || x.energy < 8) return false;
    // acceleration and the chosen effort decide how hard the jump is
    x.burst = Math.max(2, 4.5 + (x.r.a.acc - 70) * 0.05 + (x.effort - 8) * 0.5);
    x.cooldown = 6;
    x.act = 'attack';
    return true;
  }
  function setEffort(sim, rid, v) {
    const x = sim.byRid.get(rid);
    if (x) x.effort = U.clamp(Math.round(v), 1, 10);
  }
  // a bottle or gel: some energy back, three per stage, at least 15 km apart
  function eat(sim, rid) {
    const x = sim.byRid.get(rid);
    if (!x || x.out || x.bottles <= 0 || sim.k - x.lastBottle < 15 || x.energy >= 98) return false;
    x.bottles--;
    x.lastBottle = sim.k;
    x.energy = Math.min(100, x.energy + 8);
    return true;
  }
  function teamOrder(sim, teamId, order) {
    const t = sim.teams[teamId];
    if (!t) return;
    const alive = t.riders.filter(x => !x.out);
    if (order === 'chase') {
      // the two freshest domestiques in the main group pull, everyone else follows
      const pel = mainGroup(sim);
      const doms = alive.filter(x => x.role !== 'leader' && x.role !== 'sprinter' && pel && pel.riders.includes(x)).sort((a, b) => b.energy - a.energy);
      for (const x of alive) x.order = 'follow';
      doms.slice(0, 2).forEach(x => { x.order = 'pull'; });
    } else if (order === 'protect') {
      for (const x of alive) x.order = x === t.leader ? 'follow' : 'help';
    } else if (order === 'tempo') {
      // two domestiques with the leader set a hard tempo for him
      const g = t.leader && groupOf(sim, t.leader);
      const doms = alive.filter(x => x !== t.leader && x.role !== 'sprinter' && g && g.riders.includes(x)).sort((a, b) => b.energy - a.energy);
      doms.slice(0, 2).forEach(x => { x.order = 'pull'; x.effort = 8; });
    } else if (order === 'leadout') {
      for (const x of alive) x.order = x === t.sprinter || x === t.leader ? 'follow' : 'leadout';
    } else {
      for (const x of alive) x.order = order;
    }
  }

  // ---------------- helpers ----------------
  function groupOf(sim, x) { return sim.groups.find(g => g.riders.includes(x)); }
  // the peloton is the biggest group that isn't a gruppetto of dropped riders: once the front of the race
  // has shrunk, the group containing most of the remaining favourites keeps the name
  function mainGroup(sim) {
    let best = null, bestScore = -1;
    for (const g of sim.groups) {
      const favs = g.riders.filter(x => x.role === 'leader' || x.gcPos <= 20).length;
      const score = g.riders.length + favs * 6;
      if (score > bestScore) { best = g; bestScore = score; }
    }
    return best;
  }
  function sortGroups(sim) { sim.groups = sim.groups.filter(g => g.riders.length).sort((a, b) => a.t - b.t); }
  function notable(sim, x) { return x.mine || x.role === 'leader' && (x.gcPos <= 10 || sim.oneday) || x.gcPos <= 3; }
  function event(sim, kind, rids, extra) { sim.events.push({ km: sim.k + 1, kind, rids, ...extra }); }

  // ---------------- AI ----------------
  function decideChasers(sim, pel, remaining) {
    const chasers = new Map();
    if (!pel) return chasers;
    const ahead = sim.groups.filter(g => g.t < pel.t);
    const stage = sim.stage;
    const lastKm = remaining;
    // lead-out trains in a flat finale
    if (stage.type === 'flat' && lastKm <= 6) {
      for (const [tid, t] of Object.entries(sim.teams)) if (t.sprinter && pel.riders.includes(t.sprinter)) chasers.set(tid, 1);
    }
    if (!ahead.length) return chasers;
    const gap = pel.t - sim.groups[0].t; // gap to the head of the race
    const frontRiders = ahead.flatMap(g => g.riders);
    const early = sim.k < Math.min(45, stage.km * 0.3);
    // GC threat in the break: the leader's team and threatened teams ride
    if (!sim.oneday) {
      const threat = frontRiders.filter(x => x.gcGap < Math.max(90, gap + 30) && x.gcPos <= 30);
      if (threat.length) {
        const leaderTeam = sim.riders.find(x => x.gcPos === 1);
        if (leaderTeam) chasers.set(leaderTeam.teamId, 2);
      }
    }
    if (frontRiders.length > 10 && early) {
      for (const [tid, t] of Object.entries(sim.teams)) if (t.leader && pel.riders.includes(t.leader)) chasers.set(tid, Math.max(chasers.get(tid) || 0, 1));
    }
    if (early) return chasers;
    const allowed = remaining * (stage.type === 'flat' ? 1.1 : stage.type === 'mountain' ? 3 : 1.5) * sim.chaseFactor + 25;
    if (gap < allowed) return chasers;
    const panic = gap > allowed * 1.8 ? 2 : 1;
    for (const [tid, t] of Object.entries(sim.teams)) {
      const inPel = x => x && pel.riders.includes(x) && x.energy > 25;
      const want = (stage.type === 'flat' && inPel(t.sprinter)) ||
        ((stage.type === 'hilly' || stage.type === 'cobbles' || stage.lateClimbs) && inPel(t.leader)) ||
        (stage.type === 'mountain' && inPel(t.leader) && t.leader.gcPos <= 5);
      // teams with a rider in the leading group let others do the work
      if (want && !sim.groups[0].riders.some(x => x.teamId === tid)) chasers.set(tid, Math.max(chasers.get(tid) || 0, panic));
    }
    return chasers;
  }

  function aiDecide(sim, seg, pel, remaining) {
    const stage = sim.stage;
    if (sim.k % 5 === 0 || remaining <= 6) {
      const next = decideChasers(sim, pel, remaining);
      // a team that has started chasing keeps going until the gap is closed
      const gapAhead = pel && sim.groups[0] !== pel ? pel.t - sim.groups[0].t : 0;
      if (gapAhead > 20) for (const [tid, n] of sim.chasers) if (!next.has(tid)) next.set(tid, n);
      sim.chasers = next;
    }
    const early = sim.k < Math.min(45, stage.km * 0.3);
    const front = sim.groups[0];
    const breakGap = pel && front !== pel ? pel.t - front.t : 0;
    const breakSize = pel ? sim.groups.filter(g => g.t < pel.t).reduce((n, g) => n + g.riders.length, 0) : 0;
    const lastClimb = stage.climbs[stage.climbs.length - 1];
    const onFinalClimb = seg.terr === 'climb' && (seg.climb === stage.climbs.length - 1 || remaining < 30);
    const pulling = new Map();

    for (const x of sim.riders) {
      if (x.out) continue;
      const g = groupOf(sim, x);
      if (!g) continue;
      if (x.cooldown > 0) x.cooldown--;
      if (x.order !== 'auto') {
        if (x.burst <= 0) x.act = x.order === 'leadout' ? (remaining <= 5 ? 'pull' : 'follow') : x.order;
        if (x.order === 'leadout') x.leadout = true;
      }
      else if (x.burst <= 0) {
        x.leadout = false;
        if (x.energy < 55 && x.bottles > 0 && R.chance(0.2)) eat(sim, x.rid);
        x.act = 'follow';
        if (g === pel) {
          const quota = sim.chasers.get(x.teamId) || 0;
          const used = pulling.get(x.teamId) || 0;
          if (quota > used && x.role !== 'leader' && x.role !== 'sprinter' && x.energy > 18) {
            x.act = 'pull'; pulling.set(x.teamId, used + 1);
            x.effort = remaining <= 6 ? 9 : quota > 1 ? 9 : 8;
            if (remaining <= 6) x.leadout = true;
          }
          // GC teams set tempo on the decisive climbs
          const t = sim.teams[x.teamId];
          if (x.act === 'follow' && stage.type === 'mountain' && onFinalClimb && t.leader && t.leader !== x && g.riders.includes(t.leader) &&
            t.leader.gcPos <= 8 && x.role === 'dom' && x.energy > 25 && !pulling.get(x.teamId)) { x.act = 'pull'; pulling.set(x.teamId, 1); }
        }
        if (x.energy < 30 && x.act === 'follow' && seg.terr !== 'climb') x.act = 'save';
      }
      // attacks (only riders on auto; the player launches attacks by hand)
      if (x.order !== 'auto' || x.burst > 0 || x.cooldown > 0 || x.energy < 15) continue;
      const tact = sim.tactics[x.teamId];
      const aggr = tact === 'agg' ? 1.7 : tact === 'cons' ? 0.5 : 1;
      let p = 0;
      if (early && g === pel && x.role !== 'leader' && x.role !== 'sprinter' && (sim.oneday || sim.race.cur === 0 || x.gcGap > 120 || x.gcPos > 20) && breakSize < 9 && (breakGap < 45 || breakSize === 0)) {
        p = 0.006 * (x.role === 'free' ? 4 : 1) * (seg.terr === 'flat' ? 1 : 1.6) * (stage.type === 'flat' ? 0.5 : 1);
      } else if (g !== pel && g.riders.length > 1 && remaining < 20 && g === front) {
        p = 0.04; // break riders fight for the win
      } else if (stage.type === 'mountain' && onFinalClimb && (x.role === 'leader' || x.gcPos <= 10)) {
        p = 0.05 * U.clamp((abil(x.r.a, seg) + x.adj - g.pace) / 4 + 1, 0.3, 2);
      } else if ((stage.type === 'hilly' || stage.lateClimbs) && remaining < 15 && seg.terr !== 'flat' && (x.role === 'leader' || x.role === 'free')) {
        p = 0.05;
      } else if (stage.type === 'cobbles' && seg.terr === 'cobbles' && remaining < 70 && (x.role === 'leader' || x.r.a.co > 76)) {
        p = 0.06;
      } else if (seg.terr === 'climb' && stage.type === 'mountain' && lastClimb && seg.climb === stage.climbs.length - 2 && x.role === 'leader' && x.gcPos > 3) {
        p = 0.015;
      } else if (stage.type === 'flat' && remaining < 8 && remaining > 2 && x.role === 'free') {
        p = 0.01;
      }
      if (p && R.chance(p * aggr)) attack(sim, x.rid);
    }
  }

  // ---------------- one kilometre ----------------
  function step(sim) {
    if (sim.done) return;
    const seg = sim.course[sim.k];
    const stage = sim.stage;
    const remaining = stage.km - sim.k;
    sortGroups(sim);
    const pel = mainGroup(sim);
    aiDecide(sim, seg, pel, remaining);

    // crashes
    const pCrash = seg.terr === 'cobbles' ? 0.0012 : seg.terr === 'descent' ? 0.00008 : 0.000025;
    for (const g of sim.groups) for (const x of g.riders.slice()) {
      if (!R.chance(pCrash)) continue;
      g.riders.splice(g.riders.indexOf(x), 1);
      if (R.chance(0.35)) {
        x.out = true;
        x.r.injury = R.int(1, 6);
        sim.abandons.push(x.rid);
        event(sim, 'abandon', [x.rid], { why: 'crash' });
      } else {
        x.energy = Math.max(0, x.energy - 6);
        x.r.fatigue = U.clamp(x.r.fatigue + 8, 0, 100);
        sim.groups.push({ id: sim.nextGid++, riders: [x], t: g.t + R.range(20, 90), dt: 0, pace: 60 });
        event(sim, 'crash', [x.rid]);
      }
    }

    // leaders get shelter and pacing from teammates in their group
    for (const g of sim.groups) {
      for (const x of g.riders) { x.support = 0; x.shelter = 0; }
      if (seg.terr === 'flat' || seg.terr === 'descent') continue;
      const byTeam = {};
      for (const x of g.riders) (byTeam[x.teamId] || (byTeam[x.teamId] = [])).push(x);
      for (const tid in byTeam) {
        const lead = sim.teams[tid].leader;
        if (!lead || !g.riders.includes(lead)) continue;
        const helpers = byTeam[tid].filter(x => x !== lead && x.energy > 15 && x.act !== 'attack').length;
        lead.support = Math.min(1.5, helpers * 0.4);
        lead.shelter = Math.min(1.5, helpers * 0.5);
      }
    }

    // helpers drop back to their leader's group
    for (const x of sim.riders) {
      if (x.out || x.act !== 'help') continue;
      const lead = sim.teams[x.teamId].leader;
      if (!lead || lead.out || lead === x) continue;
      const gx = groupOf(sim, x), gl = groupOf(sim, lead);
      if (gx && gl && gx !== gl && gl.t > gx.t && gl.t - gx.t < 120) {
        gx.riders.splice(gx.riders.indexOf(x), 1);
        gl.riders.push(x);
      }
    }

    // pace, attacks and drops for every group
    const finalClimb = seg.terr === 'climb' && (seg.climb === stage.climbs.length - 1 || remaining < 30);
    const newGroups = [];
    for (const g of sim.groups) {
      if (!g.riders.length) continue;
      for (const x of g.riders) {
        const tact = sim.tactics[x.teamId];
        let v = abil(x.r.a, seg) + x.adj + x.burst + x.support + (tact === 'agg' ? 0.3 : tact === 'cons' ? -0.2 : 0);
        if (g !== pel && g.riders.length <= 15 && pel && g.t < pel.t) v += (x.r.a.brk - 70) * 0.06; // breakaway specialists
        if (x.energy < 35) v -= x.energy <= 0 ? 10 : (35 - x.energy) * 0.28;
        x.eff = v + R.normal(0, 0.5);
      }
      const small = g !== pel && g.riders.length <= 15;
      // riders on the front ride above their normal level while they have the legs for it
      // helpers only drive the pace when their leader's group is chasing someone
      const chasing = sim.groups.some(o => o !== g && o.riders.length && o.t < g.t);
      const pullers = g.riders.filter(x => (x.act === 'pull' || (x.act === 'help' && chasing && g.riders.includes(sim.teams[x.teamId].leader))) && x.energy > 10 && x.burst <= 0);
      const effs = g.riders.map(x => x.eff).sort((a, b) => a - b);
      let pace;
      const workers = g.riders.filter(x => x.burst <= 0 && x.act !== 'save');
      if (small) pace = mean((workers.length ? workers : g.riders).map(x => x.eff)) + (g.riders.length === 1 ? -0.5 : g.riders.length <= 3 ? 0.3 : 0.8);
      else if (pullers.length) {
        const best = pullers.map(x => x.eff + effortBonus(x.effort)).sort((a, b) => b - a).slice(0, 3);
        pace = mean(best) + Math.min(1.5, 0.3 * (pullers.length - 1));
      }
      else if (seg.terr === 'climb') pace = quant(effs, finalClimb ? 0.6 : 0.45) - (finalClimb ? 1 : 1.5);
      else pace = quant(effs, 0.55) - (g === pel ? 6 : 1); // an unchallenged peloton soft-pedals; other big groups organise
      if (!isFinite(pace)) pace = mean(effs);
      g.pace = pace;
      g.pullers = pullers;
      // sheltering in a big bunch on flat roads makes it hard to be dropped
      const bunch = g.riders.length > 15;
      const tol = seg.terr === 'climb' ? (CLIMB_TOL[stage.climbs[seg.climb].cat] || 2.2) - Math.max(0, seg.grade - 6) * 0.15
        : seg.terr === 'flat' || seg.terr === 'descent' ? (bunch ? 18 : 8)
        : seg.terr === 'rolling' ? (bunch ? 5 : 3.2) : TOL[seg.terr];
      const escaped = g.riders.filter(x => x.burst > 0 && x.eff > pace + 1.2);
      // no splits inside the bunch in the last 3 km of a flat stage (same-time rule)
      const neutral = stage.type === 'flat' && remaining <= 3;
      // off the climbs a fast bunch still carries most riders along in the draft
      const dropPace = bunch && seg.terr !== 'climb' && seg.terr !== 'cobbles' ? Math.min(pace, quant(effs, 0.5) + (seg.terr === 'rolling' ? 1 : 4)) : pace;
      for (const x of g.riders) x.needed = pullers.includes(x) ? x.effort : x.burst > 0 ? 10 : U.clamp(5 + (dropPace - x.eff) * 5 / Math.max(1, tol), 1, 10);
      const dropped = neutral ? [] : g.riders.filter(x => !escaped.includes(x) && !pullers.includes(x) &&
        (x.eff < dropPace - tol - x.shelter + (x.act === 'save' ? 1 : 0) || (x.order === 'follow' && x.effort < 10 && x.needed > x.effort + 0.5)));
      if (escaped.length && escaped.length < g.riders.length) {
        g.riders = g.riders.filter(x => !escaped.includes(x));
        // attackers bridge across to a group less than 30 s up the road
        const ahead = sim.groups.filter(a => a !== g && a.riders.length && a.t < g.t && g.t - a.t < 30).sort((a, b) => b.t - a.t)[0];
        if (ahead) ahead.riders.push(...escaped);
        else newGroups.push({ id: sim.nextGid++, riders: escaped, t: g.t - 1, dt: 0, pace: mean(escaped.map(x => x.eff)) });
        const shown = escaped.filter(x => notable(sim, x) || escaped.length <= 2);
        if (shown.length) event(sim, 'attack', shown.slice(0, 3).map(x => x.rid), { terr: seg.terr });
      }
      if (dropped.length && dropped.length < g.riders.length) {
        g.riders = g.riders.filter(x => !dropped.includes(x));
        newGroups.push({ id: sim.nextGid++, riders: dropped, t: g.t + 0.5, dt: 0, pace: mean(dropped.map(x => x.eff)) });
        const shown = dropped.filter(x => notable(sim, x));
        if (shown.length) event(sim, 'dropped', shown.slice(0, 4).map(x => x.rid));
      }
    }
    sim.groups.push(...newGroups);

    // time and energy
    const base = secPerKm(seg);
    for (const g of sim.groups) {
      if (!g.riders.length) continue;
      let p = g.pace;
      if (seg.terr !== 'climb' && seg.terr !== 'cobbles' && g.riders.length > 1) p += Math.min(3, Math.sqrt(g.riders.length) * 0.45);
      g.dt = base * (1 - PACE_K[seg.terr] * (p - 72));
      g.t += g.dt;
      const big = g.riders.length > 15;
      for (const x of g.riders) {
        let d = DRAIN[seg.terr] * (seg.terr === 'climb' ? 0.4 + seg.grade * 0.08 : 1);
        let m;
        if (x.burst > 0) m = 3.5 * (0.6 + x.effort * 0.05);
        else if ((g.pullers || []).includes(x)) m = effortCost(x.effort);
        else if (x.act === 'help') m = 1.05;
        else if (!big) m = x.act === 'save' ? 1.0 : 1.45; // in a small group, sitting on means skipping turns
        else if (x.act === 'save') m = 0.7;
        else m = (seg.terr === 'flat' || seg.terr === 'descent' ? 0.75 : 1) * (0.75 + x.needed * 0.04);
        const before = x.energy;
        x.energy = Math.max(0, x.energy - d * m * (1.3 - (x.r.a.st * 0.7 + x.r.a.res * 0.3) / 100));
        if (before >= 10 && x.energy < 10 && notable(sim, x)) event(sim, 'empty', [x.rid]);
      }
    }
    for (const x of sim.riders) if (x.burst > 0) { x.burst = Math.max(0, x.burst - 1.5); if (x.burst <= 0 && x.act === 'attack') x.act = x.order === 'auto' ? 'follow' : x.order; }

    // groups that catch the one ahead merge
    sortGroups(sim);
    const merged = [];
    for (const g of sim.groups) {
      const last = merged[merged.length - 1];
      if (last && g.t - last.t < 3 && g.dt <= last.dt + 0.2) {
        if (sim.brk && !sim.brk.catchKm && last.riders.some(x => sim.brk.set.has(x.rid)) && g.riders.length > last.riders.length && g === mainGroup(sim)) {
          sim.brk.catchKm = sim.k + 1;
          event(sim, 'catch', [...sim.brk.set]);
        }
        last.riders.push(...g.riders);
      } else merged.push(g);
    }
    sim.groups = merged;

    // mountain points at the top of each climb (a summit finish is scored from the stage result)
    if (seg.climb >= 0) {
      const c = stage.climbs[seg.climb];
      if (sim.k + 1 === c.km && c.km < stage.km - 0.5) {
        const order = sim.groups.flatMap(g => g.riders.slice().sort((a, b) => b.eff - a.eff));
        const pts = DATA.KOM_POINTS[c.cat] || [];
        sim.kom.push({ i: seg.climb, rids: order.slice(0, Math.max(3, pts.length)).map(x => x.rid) });
        if (order.length) event(sim, 'kom', [order[0].rid], { climb: seg.climb });
      }
    }

    // the day's breakaway
    const main = mainGroup(sim);
    if (!sim.brk && main && sim.groups[0] !== main && main.t - sim.groups[0].t >= 30 && sim.k < stage.km * 0.6) {
      const rids = sim.groups.filter(g => g.t < main.t).flatMap(g => g.riders.map(x => x.rid));
      sim.brk = { set: new Set(rids), formKm: sim.k + 1, catchKm: null };
      event(sim, 'break', rids);
    }

    sim.k++;
    if (sim.k >= sim.course.length) sim.done = true;
  }

  function runToEnd(sim) { while (!sim.done) step(sim); }

  // ---------------- finish ----------------
  function finish(sim) {
    const { G, race, stage } = sim;
    sortGroups(sim);
    const head = sim.groups[0];
    const results = [];
    for (const g of sim.groups) {
      const scored = g.riders.map(x => {
        let s = PCM.Race.finishAbility(x.r.a, stage) + x.adj * 0.5 + U.clamp((x.energy - 40) * 0.06, -4, 1.5) + R.normal(0, 1.8);
        if (stage.type !== 'mountain') {
          const mates = g.riders.filter(y => y !== x && y.teamId === x.teamId && y.energy > 15 && (y.role === 'dom' || y.role === 'free'))
            .reduce((n, y) => n + (y.leadout ? 1.4 : 0.6), 0);
          if (x.role === 'sprinter') s += Math.min(2.5, mates * 0.6);
          else if (x.role === 'leader' && !sim.teams[x.teamId].sprinter) s += Math.min(1.5, mates * 0.3);
        }
        return { x, s };
      }).sort((a, b) => b.s - a.s);
      for (const o of scored) results.push({ rid: o.x.rid, gap: Math.round(g.t - head.t) });
    }
    results.forEach((r, i) => { r.pos = i + 1; });
    const winner = results[0] && results[0].rid;
    const brk = sim.brk ? {
      rids: [...sim.brk.set], success: sim.brk.set.has(winner), formKm: sim.brk.formKm,
      catchKm: sim.brk.catchKm || null, gap: 0,
    } : null;
    if (brk && brk.success) {
      const firstNon = results.find(r => !sim.brk.set.has(r.rid));
      brk.gap = firstNon ? firstNon.gap : 0;
    }
    const energyUsed = new Map(sim.riders.filter(x => !x.out).map(x => [x.rid, x.startEnergy - x.energy]));
    return PCM.Race.applyStageResult(G, race, stage, {
      results, T0: Math.round(head.t), komOrders: sim.kom, events: sim.events.slice(), abandons: sim.abandons.slice(),
      brk, energyUsed, racing: sim.riders.filter(x => !x.out).map(x => ({ rid: x.rid, role: x.role, tact: sim.tactics[x.teamId] })),
    });
  }

  // ---------------- view model for the live screen ----------------
  function view(sim) {
    sortGroups(sim);
    const main = mainGroup(sim);
    const head = sim.groups[0];
    const seg = sim.course[Math.min(sim.k, sim.course.length - 1)];
    const groups = sim.groups.map((g, i) => {
      let label;
      if (g === main) label = 'Peloton';
      else if (g.t < (main ? main.t : 0)) label = i === 0 ? (g.riders.length === 1 ? 'Solo leader' : 'Leaders') : 'Chasers';
      else label = g.riders.length >= 15 && i === sim.groups.length - 1 ? 'Gruppetto' : 'Dropped';
      return { id: g.id, label, gap: g.t - head.t, size: g.riders.length, riders: g.riders };
    });
    let where = TERRAIN_LABEL[seg.terr];
    if (seg.climb >= 0) {
      const c = sim.stage.climbs[seg.climb];
      where = `${c.name} (${c.cat === 'HC' ? 'HC' : 'cat. ' + c.cat}), ${seg.grade}% · ${Math.max(0, c.km - sim.k)} km to the top`;
    } else if (seg.terr !== 'flat') where += ` ${seg.grade > 0 ? '+' : ''}${seg.grade}%`;
    return { km: sim.k, togo: sim.stage.km - sim.k, groups, where, time: head ? head.t : 0, terr: seg.terr };
  }

  return { create, step, runToEnd, finish, setOrder, setEffort, attack, eat, teamOrder, view, groupOf, ORDERS, BOTTLES };
})();
