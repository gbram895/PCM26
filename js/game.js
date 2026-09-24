// Game state: world generation, weekly loop, finances, transfers, board, season rollover, save/load.
var PCM = globalThis.PCM || (globalThis.PCM = {});

PCM.Game = (function () {
  const { R, U, DATA, Riders, Race } = PCM;
  const W = DATA.SEASON_WEEKS;
  const START_YEAR = 2026;
  const MAX_ROSTER = 30;
  const MIN_ROSTER = 16;
  const SAVE_KEY = 'pcm26-save-v1';

  // ---------------- generation ----------------
  const SLOT_TYPES = ['gc', 'gc', 'climber', 'climber', 'climber', 'sprinter', 'sprinter', 'puncheur', 'puncheur', 'puncheur',
    'cobbles', 'cobbles', 'cobbles', 'tt', 'tt', 'rouleur', 'rouleur', 'rouleur', 'rouleur', 'rouleur', 'rouleur', 'rouleur', 'climber', 'rouleur'];

  function genTeamRiders(G, team) {
    const p = team.prestige;
    const seenLead = {};
    SLOT_TYPES.forEach((type, i) => {
      let q;
      if (!seenLead[type] && type !== 'rouleur') { seenLead[type] = true; q = 68 + p * 1.6 + R.normal(0, 2); }
      else if (type === 'rouleur') q = 60 + p * 1.1 + R.normal(0, 2.5);
      else q = 63 + p * 1.3 + R.normal(0, 2.5);
      if (i === 0 && p >= 4) q += 1.5;
      const ageYears = Math.round(U.clamp(R.normal(28, 3.6), 21, 37));
      const r = Riders.create({ type, quality: q, year: G.year, ageYears, homeNat: team.nat });
      const o = Riders.ovr(r);
      r.pot = U.round(ageYears < 26 ? o + (26 - ageYears) * R.range(0.8, 2.2) : o + R.range(0, 0.8), 1);
      signTo(G, r, team, Riders.salaryAsk(r, G.year) * R.range(0.85, 1.15), G.year + R.int(0, 2));
    });
    for (let i = 0; i < 3; i++) {
      const r = Riders.createYouth(G.year, team.nat, 68 + p * 2.5 + R.normal(0, 3));
      signTo(G, r, team, Riders.salaryAsk(r, G.year), G.year + R.int(1, 2));
    }
  }

  function signTo(G, r, team, salary, contractEnd) {
    G.riders[r.id] = r;
    if (r.teamId && G.teams[r.teamId]) {
      const old = G.teams[r.teamId];
      old.riders = old.riders.filter(id => id !== r.id);
    }
    G.freeAgents = G.freeAgents.filter(id => id !== r.id);
    r.teamId = team.id;
    r.salary = Math.round(salary / 1000) * 1000;
    r.contractEnd = contractEnd;
    if (!team.riders.includes(r.id)) team.riders.push(r.id);
  }

  function toFreeAgency(G, r) {
    if (r.teamId && G.teams[r.teamId]) {
      const t = G.teams[r.teamId];
      t.riders = t.riders.filter(id => id !== r.id);
    }
    r.teamId = null;
    r.salary = 0;
    if (!G.freeAgents.includes(r.id)) G.freeAgents.push(r.id);
  }

  function addFreeAgents(G, youth, vets) {
    for (let i = 0; i < youth; i++) {
      const r = Riders.createYouth(G.year, null);
      G.riders[r.id] = r;
      G.freeAgents.push(r.id);
    }
    for (let i = 0; i < vets; i++) {
      const type = R.pick(Object.keys(DATA.TEMPLATES));
      const r = Riders.create({ type, quality: R.range(60, 71), year: G.year, ageYears: R.int(24, 34) });
      G.riders[r.id] = r;
      G.freeAgents.push(r.id);
    }
  }

  // Real-world rosters come from js/data-real.js (built by tools/build-real-db.js)
  function realAvailable() { return !!(PCM.REAL && PCM.REAL.teams && PCM.REAL.teams.length); }
  function teamDefs(world) { return world === 'real' && realAvailable() ? PCM.REAL.teams : DATA.TEAMS; }

  function realRider(G, def) {
    const born = parseInt(String(def.born).slice(0, 4), 10) || (G.year - 27);
    const ageYears = U.clamp(G.year - born, 18, 42);
    const type = DATA.TEMPLATES[def.type] ? def.type : 'rouleur';
    const r = Riders.create({ type, quality: def.level - 4, year: G.year, ageYears, nat: 'BEL' });
    const d = def.level - Riders.ovr(r);
    for (const k of Riders.ATTR_KEYS) r.a[k] = U.clamp(r.a[k] + d, 35, 95);
    r.first = def.first || '';
    r.last = def.last || def.name;
    r.nat = def.nat || 'UNK';
    r.born = born;
    const o = Riders.ovr(r);
    r.pot = U.round(ageYears <= 25 ? Math.min(95, o + (26 - ageYears) * R.range(0.6, 1.8)) : o + R.range(0, 0.6), 1);
    r.real = true;
    return r;
  }
  function genRealTeam(G, team, def) {
    for (const rd of def.riders) {
      const r = realRider(G, rd);
      signTo(G, r, team, Riders.salaryAsk(r, G.year) * R.range(0.85, 1.15), G.year + R.int(0, 2));
    }
    // top up thin rosters with fictional neo-pros
    while (team.riders.length < 24) {
      const r = Riders.createYouth(G.year, team.nat, 66 + team.prestige * 2.5 + R.normal(0, 3));
      signTo(G, r, team, Riders.salaryAsk(r, G.year), G.year + R.int(1, 2));
    }
  }
  function calendarFor(G) {
    return DATA.CALENDAR.map(tpl => Race.instantiate(G.world === 'real' && tpl.realName ? { ...tpl, name: tpl.realName } : tpl, G.year));
  }

  function newGame({ teamId, manager, seed, customName, world }) {
    seed = seed || (Math.floor(Math.random() * 1e9) + 1);
    R.seed(seed);
    Riders.setNextId(1);
    const G = {
      version: 1, seed, year: START_YEAR, week: 1, playerTeamId: teamId, manager: manager || 'Manager',
      teams: {}, riders: {}, freeAgents: [], calendar: [], news: [], inbox: [], ledger: [], honours: [], history: [],
      board: { confidence: 60, objectives: [] }, fired: false, pendingSummary: null,
      world: world === 'real' && realAvailable() ? 'real' : 'fictional',
    };
    const defs = teamDefs(G.world);
    for (const t of defs) {
      G.teams[t.id] = {
        id: t.id, name: t.name, nat: t.nat, prestige: t.prestige, c1: t.c1, c2: t.c2,
        riders: [], cash: 0, sponsor: 0, season: { pts: 0, wins: 0 }, log: [], history: [], expRank: 0,
      };
    }
    if (customName && customName.trim()) G.teams[teamId].name = customName.trim().slice(0, 40);
    if (G.world === 'real') defs.forEach(d => genRealTeam(G, G.teams[d.id], d));
    else for (const id in G.teams) genTeamRiders(G, G.teams[id]);
    for (const id in G.teams) {
      const t = G.teams[id];
      t.sponsor = Math.round((payroll(G, t) * 1.12 + 250000 * t.prestige + 800000) / 10000) * 10000;
      t.cash = Math.round(t.sponsor * 0.15 / 10000) * 10000;
    }
    addFreeAgents(G, 30, 18);
    G.calendar = calendarFor(G);
    computeExpectedRanks(G);
    setObjectives(G);
    const team = G.teams[teamId];
    inbox(G, 'Welcome to ' + team.name,
      `The board has appointed you as sports director for the ${G.year} season. Our sponsor budget is ${U.money(team.sponsor)} per season and we have ${U.money(team.cash)} in the bank. ` +
      `Check your objectives on the Club page, set training plans on the Squad page, then press Continue to start the season.`);
    return G;
  }

  // ---------------- helpers ----------------
  function payroll(G, team) { return U.sum(team.riders, id => G.riders[id].salary); }
  function player(G) { return G.teams[G.playerTeamId]; }
  function currentRace(G) { return G.calendar.find(r => G.week >= r.week && G.week < r.week + r.weeks) || null; }
  function nextRace(G) { return G.calendar.find(r => r.status !== 'done' && r.week + r.weeks > G.week) || null; }

  function news(G, text, mine) {
    G.news.unshift({ year: G.year, week: G.week, text, mine: !!mine });
    if (G.news.length > 120) G.news.length = 120;
  }
  function inbox(G, title, body) {
    G.inbox.unshift({ year: G.year, week: G.week, title, body, read: false });
    if (G.inbox.length > 60) G.inbox.length = 60;
  }
  function ledger(G, desc, amount, merge) {
    const top = G.ledger[0];
    if (merge && top && top.year === G.year && top.week === G.week && top.desc === desc) top.amount += amount;
    else G.ledger.unshift({ year: G.year, week: G.week, desc, amount: Math.round(amount) });
    if (G.ledger.length > 300) G.ledger.length = 300;
  }

  function teamRanking(G) {
    return Object.values(G.teams).sort((a, b) => b.season.pts - a.season.pts || b.season.wins - a.season.wins);
  }
  function riderRanking(G) {
    return Object.values(G.riders).filter(r => r.season.pts > 0).sort((a, b) => b.season.pts - a.season.pts);
  }
  function teamStrength(G, team) {
    const o = team.riders.map(id => Riders.ovr(G.riders[id])).sort((a, b) => b - a).slice(0, 12);
    return U.avg(o);
  }
  function computeExpectedRanks(G) {
    Object.values(G.teams).sort((a, b) => teamStrength(G, b) - teamStrength(G, a)).forEach((t, i) => { t.expRank = i + 1; });
  }

  // ---------------- board ----------------
  const SPECIAL = {
    5: { id: 'gtwin', text: 'Win a Grand Tour' },
    4: { id: 'gtpod', text: 'Finish on a Grand Tour podium or win a Monument' },
    3: { id: 'gt10', text: 'Top 10 in a Grand Tour or top 5 in a Monument' },
    2: { id: 'wtstage', text: 'Win a WorldTour or Grand Tour stage' },
    1: { id: 'mon10', text: 'Finish in the top 10 of a Monument' },
  };
  function setObjectives(G) {
    const t = player(G);
    const tier = U.clamp(Math.round(6 - t.expRank / 3.6), 1, 5); // expectations follow squad strength
    const rankTarget = Math.min(18, t.expRank + 2);
    const wins = [2, 4, 8, 14, 22][tier - 1];
    G.board.objectives = [
      { id: 'rank', target: rankTarget, text: `Finish in the top ${rankTarget} of the team ranking` },
      { id: 'wins', target: wins, text: `Win at least ${wins} races or stages` },
      { id: SPECIAL[tier].id, text: SPECIAL[tier].text },
    ];
  }
  function evalObjective(G, o) {
    const t = player(G);
    const log = t.log;
    switch (o.id) {
      case 'rank': { const pos = teamRanking(G).indexOf(t) + 1; return { done: pos <= o.target, progress: 'Currently ' + U.ordinal(pos) }; }
      case 'wins': return { done: t.season.wins >= o.target, progress: t.season.wins + ' / ' + o.target };
      case 'gtwin': { const d = log.some(l => l.cls === 'GT' && l.kind === 'gc' && l.pos === 1); return { done: d, progress: d ? 'Achieved' : 'Not yet' }; }
      case 'gtpod': { const d = log.some(l => (l.cls === 'GT' && l.kind === 'gc' && l.pos <= 3) || (l.cls === 'MON' && l.pos === 1)); return { done: d, progress: d ? 'Achieved' : 'Not yet' }; }
      case 'gt10': { const d = log.some(l => (l.cls === 'GT' && l.kind === 'gc' && l.pos <= 10) || (l.cls === 'MON' && l.pos <= 5)); return { done: d, progress: d ? 'Achieved' : 'Not yet' }; }
      case 'wtstage': { const d = log.some(l => (l.cls === 'GT' || l.cls === 'WT') && l.kind === 'stage' && l.pos === 1); return { done: d, progress: d ? 'Achieved' : 'Not yet' }; }
      case 'mon10': { const d = log.some(l => l.cls === 'MON' && l.pos <= 10); return { done: d, progress: d ? 'Achieved' : 'Not yet' }; }
    }
    return { done: false, progress: '' };
  }

  // ---------------- race interaction ----------------
  function startRace(G, race, playerEntries) {
    const byTeam = {};
    for (const id in G.teams) {
      if (id === G.playerTeamId) byTeam[id] = playerEntries;
      else byTeam[id] = Race.selectRoster(G, G.teams[id], race);
    }
    Race.start(G, race, byTeam);
    race.racers = race.entries.map(e => e.rid);
  }
  function aiTactics(G, race) {
    const stage = race.stages[race.cur];
    for (const id in G.teams) {
      if (id === G.playerTeamId) continue;
      race.tactics[id] = stage.type !== 'itt' && stage.type !== 'flat' && R.chance(0.25) ? 'agg' : R.chance(0.15) ? 'cons' : 'bal';
    }
  }
  function simStage(G, race, playerTactic) {
    aiTactics(G, race);
    race.tactics[G.playerTeamId] = playerTactic || 'bal';
    return Race.runStage(G, race);
  }

  // ---------------- weekly loop ----------------
  function processWeek(G, racers) {
    const racing = new Set(racers || []);
    const allIds = Object.keys(G.riders);
    for (const id of allIds) {
      const r = G.riders[id];
      if (racing.has(r.id)) {
        r.fatigue = U.clamp(r.fatigue - 4, 0, 100);
        continue;
      }
      Riders.trainWeek(r, G.year);
    }
    // finances
    for (const id in G.teams) {
      const t = G.teams[id];
      const inc = t.sponsor / W;
      const sal = payroll(G, t) / W;
      const ops = t.sponsor * 0.1 / W;
      t.cash += inc - sal - ops;
      if (id === G.playerTeamId) {
        ledger(G, 'Sponsor income', inc);
        ledger(G, 'Rider salaries', -sal);
        ledger(G, 'Staff & operations', -ops);
      }
    }
    // AI squads top up if depleted
    for (const id in G.teams) {
      if (id === G.playerTeamId) continue;
      const t = G.teams[id];
      if (t.riders.length < 22) aiFill(G, t, 23);
    }
    randomEvents(G);
    G.week++;
    if (G.week === 30) {
      const exp = player(G).riders.map(id => G.riders[id]).filter(r => r.contractEnd <= G.year);
      if (exp.length) inbox(G, 'Contracts expiring', `${exp.length} rider(s) have contracts ending this season: ${exp.map(Riders.fullName).join(', ')}. Renew them from their profile or they will leave at season end.`);
    }
    if (G.week === 21) {
      const pos = teamRanking(G).indexOf(player(G)) + 1;
      inbox(G, 'Mid-season review', `The board notes we are ${U.ordinal(pos)} in the team ranking with ${player(G).season.wins} wins. ` + (pos <= G.board.objectives[0].target ? 'They are pleased so far.' : 'They expect improvement.'));
    }
  }

  function randomEvents(G) {
    const t = player(G);
    if (R.chance(0.05) && t.riders.length) {
      const r = G.riders[R.pick(t.riders)];
      if (r.injury === 0) {
        r.injury = R.int(1, 3);
        inbox(G, 'Training injury', `${Riders.fullName(r)} crashed in training and will be out for ${r.injury} week(s).`);
      }
    }
    if (R.chance(0.025)) {
      const amt = R.int(5, 20) * 10000;
      t.cash += amt;
      ledger(G, 'Sponsor activation bonus', amt);
      inbox(G, 'Sponsor bonus', `Our sponsor is happy with the team's exposure and paid a bonus of ${U.money(amt)}.`);
    }
  }

  // Continue button. Returns {status: 'race'|'advanced'|'season-end'}
  function advance(G) {
    const race = currentRace(G);
    if (race && race.status !== 'done') return { status: 'race', race };
    if (G.week > W) return { status: 'season-end' };
    if (race && race.status === 'done' && race.week === G.week) {
      for (let i = 0; i < race.weeks; i++) processWeek(G, race.racers);
      delete race.racers;
    } else {
      processWeek(G, []);
    }
    const nr = currentRace(G);
    if (nr && nr.status !== 'done') return { status: 'race', race: nr };
    if (G.week > W) return { status: 'season-end' };
    return { status: 'advanced' };
  }

  // quickly play a whole race for the player with auto-selection
  function autoRace(G, race) {
    startRace(G, race, Race.selectRoster(G, player(G), race));
    while (race.status !== 'done') simStage(G, race, 'bal');
  }

  // ---------------- transfers ----------------
  function askingSalary(G, r) {
    const t = player(G);
    let ask = Riders.salaryAsk(r, G.year);
    const from = r.teamId ? G.teams[r.teamId] : null;
    if (from && from.id !== t.id) ask *= 1 + Math.max(0, from.prestige - t.prestige) * 0.08 + 0.05;
    if (r.teamId === t.id && r.morale < 40) ask *= 1.15;
    return Math.round(ask / 5000) * 5000;
  }
  function askingFee(G, r) {
    if (!r.teamId || r.teamId === G.playerTeamId) return 0;
    const team = G.teams[r.teamId];
    const top = team.riders.map(id => G.riders[id]).sort((a, b) => Riders.ovr(b) - Riders.ovr(a)).slice(0, 3);
    return Math.round(Riders.transferValue(r, G.year) * (top.includes(r) ? 1.6 : 1) / 10000) * 10000;
  }
  function offer(G, rid, salary, years) {
    const r = G.riders[rid];
    const t = player(G);
    if (!r || r.teamId === t.id) return { ok: false, msg: 'Rider is already in your team.' };
    if (t.riders.length >= MAX_ROSTER) return { ok: false, msg: `Your roster is full (${MAX_ROSTER} riders max).` };
    if (inRunningRace(G, rid)) return { ok: false, msg: 'Rider is currently racing. Try again next week.' };
    const fee = askingFee(G, r);
    if (r.teamId) {
      const from = G.teams[r.teamId];
      if (from.riders.length <= 22) return { ok: false, msg: `${from.name} can't afford to lose riders right now.` };
    }
    if (t.cash < fee) return { ok: false, msg: `You need ${U.money(fee)} for the transfer fee.` };
    const ask = askingSalary(G, r);
    if (salary < ask * 0.97) return { ok: false, msg: `${Riders.fullName(r)} rejects the offer. He wants around ${U.money(ask)} per year.` };
    if (fee) {
      t.cash -= fee;
      G.teams[r.teamId].cash += fee;
      ledger(G, 'Transfer fee: ' + Riders.fullName(r), -fee);
    }
    const fromName = r.teamId ? G.teams[r.teamId].name : 'free agency';
    signTo(G, r, t, salary, G.year + years - (G.week > W ? 0 : 1));
    r.morale = 72;
    r.plan = 'normal';
    news(G, `${t.name} sign ${Riders.fullName(r)} from ${fromName}.`, true);
    return { ok: true, msg: `${Riders.fullName(r)} signed until end of ${r.contractEnd}!` };
  }
  function renew(G, rid, salary, years) {
    const r = G.riders[rid];
    if (r.teamId !== G.playerTeamId) return { ok: false, msg: 'Not your rider.' };
    if (r.contractEnd > G.year + 1) return { ok: false, msg: 'Contract has more than a year left; talk again later.' };
    const ask = askingSalary(G, r);
    if (salary < ask * 0.95) return { ok: false, msg: `${Riders.fullName(r)} wants around ${U.money(ask)} per year.` };
    r.salary = Math.round(salary / 1000) * 1000;
    r.contractEnd = G.year + years;
    r.morale = U.clamp(r.morale + 8, 0, 100);
    return { ok: true, msg: `${Riders.fullName(r)} extends until end of ${r.contractEnd}.` };
  }
  function releaseCost(G, r) {
    const seasonsLeft = Math.max(0, r.contractEnd - G.year) + Math.max(0, (W - G.week + 1) / W);
    return Math.round(r.salary * seasonsLeft * 0.5 / 1000) * 1000;
  }
  function release(G, rid) {
    const r = G.riders[rid];
    const t = player(G);
    if (r.teamId !== t.id) return { ok: false, msg: 'Not your rider.' };
    if (inRunningRace(G, rid)) return { ok: false, msg: 'Rider is currently racing.' };
    const cost = releaseCost(G, r);
    t.cash -= cost;
    ledger(G, 'Contract termination: ' + Riders.fullName(r), -cost);
    toFreeAgency(G, r);
    news(G, `${t.name} release ${Riders.fullName(r)}.`, true);
    return { ok: true, msg: `${Riders.fullName(r)} released (${U.money(cost)} settlement).` };
  }
  function inRunningRace(G, rid) {
    return G.calendar.some(r => r.status === 'running' && r.entries.some(e => e.rid === rid));
  }

  function aiValue(G, r) {
    const a = Riders.age(r, G.year);
    return Riders.ovr(r) + (a <= 23 ? (r.pot - Riders.ovr(r)) * 0.5 : 0) - (a >= 33 ? 3 : 0);
  }
  function aiFill(G, team, target) {
    let budget = team.sponsor * 0.8 - payroll(G, team) + Math.max(0, team.cash) * 0.3;
    const pool = G.freeAgents.map(id => G.riders[id]).sort((a, b) => aiValue(G, b) - aiValue(G, a));
    for (const r of pool) {
      if (team.riders.length >= target) break;
      const sal = Riders.salaryAsk(r, G.year);
      if (sal > budget && team.riders.length >= 20) continue;
      signTo(G, r, team, sal, G.year + R.int(1, 2));
      budget -= sal;
    }
  }

  // ---------------- season end ----------------
  function endSeason(G) {
    const year = G.year;
    const t = player(G);
    const ranking = teamRanking(G);
    const rank = ranking.indexOf(t) + 1;
    const objectives = G.board.objectives.map(o => ({ text: o.text, ...evalObjective(G, o) }));
    const met = objectives.filter(o => o.done).length;
    let conf = G.board.confidence + met * 12 - (objectives.length - met) * 12 + (t.cash >= 0 ? 4 : -15);
    conf = U.clamp(conf, 0, 100);
    G.board.confidence = conf;
    const fired = conf <= 15;

    G.history.push({
      year,
      ranking: ranking.map(x => [x.id, x.season.pts, x.season.wins]),
      topRiders: riderRanking(G).slice(0, 10).map(r => [Riders.fullName(r), r.teamId ? G.teams[r.teamId].name : '', r.season.pts]),
    });
    ranking.forEach((x, i) => x.history.push({ year, rank: i + 1, pts: x.season.pts, wins: x.season.wins, name: x.name }));

    // sponsors react to results
    const sponsorOld = t.sponsor;
    for (const x of ranking) {
      const pos = ranking.indexOf(x) + 1;
      const f = U.clamp(1 + (x.expRank - pos) * 0.018 + R.normal(0.01, 0.02), 0.9, 1.12);
      // sponsors won't fund far beyond what the squad costs
      const cap = payroll(G, x) * 1.4 + 2e6;
      x.sponsor = Math.max(3e6, Math.round(Math.min(x.sponsor * f, Math.max(cap, x.sponsor * 0.95)) / 10000) * 10000);
    }

    // aging / development
    const newYear = year + 1;
    const developments = [];
    for (const id in G.riders) {
      const r = G.riders[id];
      const d = Riders.ageAndDevelop(r, newYear);
      if (r.teamId === t.id) developments.push({ name: Riders.fullName(r), delta: d, ovr: Riders.ovr(r) });
    }
    // retirements
    const retired = [];
    for (const id of Object.keys(G.riders)) {
      const r = G.riders[id];
      const a = newYear - r.born;
      const o = Riders.ovr(r);
      let p = a >= 38 ? 1 : a >= 34 ? (a - 33) * 0.22 : (a >= 30 && o < 62) ? 0.3 : 0;
      if (!r.teamId && a >= 31) p = Math.max(p, 0.5);
      if (R.chance(p)) {
        if (r.teamId === t.id) retired.push(Riders.fullName(r));
        if (r.teamId) G.teams[r.teamId].riders = G.teams[r.teamId].riders.filter(x => x !== r.id);
        G.freeAgents = G.freeAgents.filter(x => x !== r.id);
        delete G.riders[id];
      }
    }
    // expiring contracts
    const left = [];
    for (const id in G.teams) {
      const team = G.teams[id];
      const avg = teamStrength(G, team);
      for (const rid of team.riders.slice()) {
        const r = G.riders[rid];
        if (r.contractEnd > year) continue;
        if (id === t.id) { left.push(Riders.fullName(r)); toFreeAgency(G, r); continue; }
        const keep = Riders.ovr(r) >= avg - 5 ? 0.85 : 0.45;
        if (R.chance(keep)) { r.salary = Riders.salaryAsk(r, newYear); r.contractEnd = year + R.int(1, 3); }
        else toFreeAgency(G, r);
      }
    }

    G.year = newYear;
    G.week = 1;
    // unsigned riders drift out of the sport
    const fas = G.freeAgents.map(id => G.riders[id]).sort((a, b) => aiValue(G, b) - aiValue(G, a));
    for (const r of fas.slice(90)) { delete G.riders[r.id]; }
    G.freeAgents = fas.slice(0, 90).map(r => r.id);
    addFreeAgents(G, 42, 10);
    // AI roster building, stronger teams pick first
    const order = Object.values(G.teams).filter(x => x.id !== t.id).sort((a, b) => b.sponsor - a.sponsor);
    for (let pass = 0; pass < 3; pass++) for (const team of order) aiFill(G, team, 24 + pass);
    for (const team of order) {
      while (team.riders.length > MAX_ROSTER) {
        const worst = U.maxBy(team.riders.map(i => G.riders[i]), r => -aiValue(G, r));
        toFreeAgency(G, worst);
      }
    }

    // reset season
    for (const id in G.riders) {
      const r = G.riders[id];
      r.season = Riders.blankSeason();
      r.form = U.clamp(R.normal(55, 5), 40, 70);
      r.fatigue = 0;
      r.injury = 0;
      r.morale = U.clamp((r.morale + 65) / 2, 30, 90);
    }
    for (const id in G.teams) { G.teams[id].season = { pts: 0, wins: 0 }; G.teams[id].log = []; }
    G.calendar = calendarFor(G);
    computeExpectedRanks(G);

    const summary = { year, rank, objectives, confidence: conf, fired, retired, left, developments, sponsorOld, sponsorNew: t.sponsor, cash: t.cash };
    if (fired) {
      G.fired = true;
      inbox(G, 'You have been dismissed', `After finishing ${U.ordinal(rank)} and meeting ${met}/${objectives.length} objectives, the board of ${t.name} has terminated your contract.`);
    } else {
      setObjectives(G);
      inbox(G, `Season ${G.year} begins`, `We finished ${U.ordinal(rank)} last season. New sponsor budget: ${U.money(t.sponsor)}. ` +
        (left.length ? `Riders who left: ${left.join(', ')}. ` : '') + (retired.length ? `Retired: ${retired.join(', ')}. ` : '') +
        `Squad size: ${t.riders.length}. Check the transfer market for new talent.`);
      if (t.riders.length < 20) inbox(G, 'Squad too small', `We only have ${t.riders.length} riders. Sign riders on the Transfers page — the board wants at least 20.`);
    }
    G.pendingSummary = summary;
    return summary;
  }

  function jobOffers(G) {
    const cur = player(G);
    return Object.values(G.teams).filter(t => t.id !== cur.id && t.prestige <= Math.max(1, cur.prestige - 1)).sort((a, b) => b.prestige - a.prestige);
  }
  function takeJob(G, teamId) {
    G.playerTeamId = teamId;
    G.fired = false;
    G.board.confidence = 55;
    computeExpectedRanks(G);
    setObjectives(G);
    inbox(G, 'New job: ' + G.teams[teamId].name, `You've been hired as sports director of ${G.teams[teamId].name}. A fresh start!`);
  }

  // ---------------- save / load ----------------
  function serialize(G) {
    G.rng = R.getState();
    G.nextId = Riders.getNextId();
    return JSON.stringify(G);
  }
  function deserialize(str) {
    const G = JSON.parse(str);
    if (!G || !G.teams || !G.riders) throw new Error('Not a valid save file');
    R.setState(G.rng || 1);
    Riders.setNextId(G.nextId || (Math.max(0, ...Object.keys(G.riders).map(Number)) + 1));
    return G;
  }
  function save(G) {
    try { localStorage.setItem(SAVE_KEY, serialize(G)); return true; } catch (e) { return false; }
  }
  function load() {
    try { const s = localStorage.getItem(SAVE_KEY); return s ? deserialize(s) : null; } catch (e) { return null; }
  }
  function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } }

  return {
    newGame, realAvailable, teamDefs, advance, processWeek, startRace, simStage, autoRace, currentRace, nextRace, endSeason, jobOffers, takeJob,
    offer, renew, release, releaseCost, askingSalary, askingFee, payroll, player, teamRanking, riderRanking, teamStrength,
    evalObjective, news, inbox, ledger, serialize, deserialize, save, load, clearSave, inRunningRace,
    MAX_ROSTER, MIN_ROSTER,
  };
})();
