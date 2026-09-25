// Management: staff, scouting missions, youth academy, sponsor deals, equipment and contract negotiation.
var PCM = globalThis.PCM || (globalThis.PCM = {});

PCM.Mgmt = (function () {
  const { R, U, DATA, Riders } = PCM;
  const W = DATA.SEASON_WEEKS;

  const ROLES = {
    ds: { label: 'Directeur sportif', max: 2, text: 'Race-day tactics: a small bonus for every rider in every race' },
    coach: { label: 'Coach', max: 3, text: 'Training: riders develop faster' },
    doctor: { label: 'Doctor', max: 2, text: 'Recovery: less fatigue, faster return from injury' },
    scout: { label: 'Scout', max: 3, text: 'Scouting missions and better potential estimates' },
  };
  const EQUIP = {
    road: { label: 'Road bikes', text: 'Every road stage', perLevel: 0.3 },
    tt: { label: 'Time trial bikes', text: 'Time trials and prologues', perLevel: 0.5 },
  };
  const EQUIP_COST = [0, 0, 400000, 800000, 1400000, 2200000]; // cost to reach each level
  const ACADEMY_COST = [0, 0, 500000, 1000000, 1800000, 3000000];

  // ---------------- helpers ----------------
  const player = G => G.teams[G.playerTeamId];
  function staffName() {
    const nat = R.weighted(Object.keys(DATA.NATIONS), k => DATA.NATIONS[k].w);
    const n = DATA.NATIONS[nat];
    return { name: R.pick(n.first) + ' ' + R.pick(n.last), nat };
  }
  function staffSalary(rating) { return Math.round(35000 * Math.pow(rating, 1.6) / 5000) * 5000; }
  function makeStaff(G, role, rating) {
    const nm = staffName();
    const rt = U.round(U.clamp(rating, 1, 5), 1);
    return { id: 's' + (G.staffSeq = (G.staffSeq || 0) + 1), role, rating: rt, salary: staffSalary(rt), until: G.year + R.int(1, 2), ...nm };
  }
  function staffOf(G, role) { return (G.staff || []).filter(s => s.role === role); }
  function best(G, role) { return Math.max(0, ...staffOf(G, role).map(s => s.rating)); }
  function total(G, role) { return staffOf(G, role).reduce((n, s) => n + s.rating, 0); }

  // ---------------- setup / migration ----------------
  function init(G) {
    const t = player(G);
    const base = 1.5 + t.prestige * 0.5;
    if (!G.staff) {
      G.staff = [makeStaff(G, 'ds', base + R.range(-0.3, 0.3)), makeStaff(G, 'coach', base + R.range(-0.5, 0.2)),
        makeStaff(G, 'doctor', base - 0.5 + R.range(-0.3, 0.3)), makeStaff(G, 'scout', base - 0.5 + R.range(-0.3, 0.3))];
    }
    if (!G.staffMarket) refreshMarket(G);
    if (!G.missions) G.missions = [];
    if (!G.scouted) G.scouted = {};
    if (!G.academy) G.academy = { level: Math.max(1, Math.round(t.prestige / 2)), riders: [] };
    for (const id in G.teams) {
      const tm = G.teams[id];
      if (!tm.equip) { const l = U.clamp(Math.round(tm.prestige / 1.4) + 1, 1, 5); tm.equip = { road: l, tt: l }; }
    }
    if (!t.deal) t.deal = { name: 'Standard deal', base: t.sponsor, perWin: 0, perPoint: 0, paidWins: 0, paidPts: 0 };
  }
  function refreshMarket(G) {
    G.staffMarket = [];
    for (const role of Object.keys(ROLES)) for (let i = 0; i < 4; i++) G.staffMarket.push(makeStaff(G, role, R.range(1, 5)));
  }

  // ---------------- effects used by the game ----------------
  function growthMult(G, r) { return r.teamId === G.playerTeamId ? 0.8 + total(G, 'coach') * 0.08 : 1; }
  function recoverMult(G, r) { return r.teamId === G.playerTeamId ? 0.9 + total(G, 'doctor') * 0.05 : 1; }
  function raceBonus(G, teamId, terrain) {
    const t = G.teams[teamId];
    if (!t) return 0;
    const eq = t.equip || { road: 3, tt: 3 };
    let b = terrain === 'itt' ? (eq.tt - 3) * EQUIP.tt.perLevel : (eq.road - 3) * EQUIP.road.perLevel;
    if (teamId === G.playerTeamId) b += (best(G, 'ds') - 2.5) * 0.15;
    return b;
  }
  // how far off a scout's potential estimate is for a rider we haven't scouted
  function potError(G, r) {
    if (r.teamId === G.playerTeamId || (G.scouted && G.scouted[r.id])) return 0;
    const skill = best(G, 'scout');
    return (((r.id * 37) % 5) - 2) * Math.max(0.3, 1.5 - skill * 0.25);
  }

  // ---------------- weekly & season hooks ----------------
  function weekly(G, ledger, inbox) {
    const t = player(G);
    // staff wages
    const wages = (G.staff || []).reduce((n, s) => n + s.salary, 0) / W;
    if (wages) { t.cash -= wages; ledger(G, 'Staff salaries', -wages); }
    // doctors help injured riders back sooner
    for (const id of t.riders) { const r = G.riders[id]; if (r.injury > 0 && R.chance(total(G, 'doctor') * 0.06)) r.injury--; }
    // sponsor performance bonuses
    const d = t.deal;
    if (d && (d.perWin || d.perPoint)) {
      const bonus = (t.season.wins - d.paidWins) * d.perWin + (t.season.pts - d.paidPts) * d.perPoint;
      d.paidWins = t.season.wins; d.paidPts = t.season.pts;
      if (bonus > 0) { t.cash += bonus; ledger(G, 'Sponsor performance bonus', bonus, true); }
    }
    // scouting missions
    for (const m of G.missions.filter(m => !m.done && G.week >= m.end)) {
      m.done = true;
      const found = Object.values(G.riders).filter(r => r.nat === m.nat && !r.academy);
      for (const r of found) G.scouted[r.id] = true;
      const prospects = found.filter(r => Riders.age(r, G.year) <= 23 && r.teamId !== t.id).sort((a, b) => b.pot - a.pot).slice(0, 5);
      const sc = G.staff.find(s => s.id === m.scoutId);
      inbox(G, `Scouting report: ${DATA.natName(m.nat)}`, `${sc ? sc.name : 'Our scout'} has assessed ${found.length} riders. Top prospects: ` +
        (prospects.map(r => `${Riders.fullName(r)} (${Riders.age(r, G.year)}, potential ${Math.round(r.pot)}${r.teamId ? ', ' + G.teams[r.teamId].name : ', free agent'})`).join('; ') || 'none worth noting') + '. Their true potential is now shown.');
    }
  }
  function startMission(G, scoutId, nat) {
    const sc = (G.staff || []).find(s => s.id === scoutId && s.role === 'scout');
    if (!sc) return { ok: false, msg: 'Pick one of your scouts.' };
    if (G.missions.some(m => m.scoutId === scoutId && !m.done)) return { ok: false, msg: `${sc.name} is already on a mission.` };
    if (!nat) return { ok: false, msg: 'Pick a country to scout.' };
    const weeks = Math.max(2, Math.round(5 - sc.rating * 0.6));
    G.missions.push({ id: 'm' + Date.now().toString(36), scoutId, nat, start: G.week, end: G.week + weeks, done: false });
    return { ok: true, msg: `${sc.name} leaves to scout ${DATA.natName(nat)}. Report in ${weeks} weeks.` };
  }

  function seasonEnd(G, inbox) {
    const t = player(G);
    // staff contracts
    const leaving = (G.staff || []).filter(s => s.until < G.year);
    G.staff = (G.staff || []).filter(s => s.until >= G.year);
    if (leaving.length) inbox(G, 'Staff contracts ended', `${leaving.map(s => `${s.name} (${ROLES[s.role].label})`).join(', ')} left the team. Hire replacements on the Club page.`);
    refreshMarket(G);
    // academy intake
    const lvl = G.academy.level;
    const n = 1 + Math.floor(lvl / 2) + (R.chance(0.3) ? 1 : 0);
    const fresh = [];
    for (let i = 0; i < n; i++) {
      const r = Riders.createYouth(G.year, t.nat, 64 + lvl * 3.5 + R.normal(0, 4));
      r.born = G.year - R.int(18, 19);
      r.academy = true;
      r.teamId = null;
      G.riders[r.id] = r;
      G.academy.riders.push(r.id);
      G.scouted[r.id] = true;
      fresh.push(r);
    }
    inbox(G, 'Youth academy intake', `${fresh.length} new riders joined the academy: ${fresh.map(r => `${Riders.fullName(r)} (potential ${Math.round(r.pot)})`).join(', ')}. Promote the best to the pro team from the Club page.`);
    // sponsor offers for next season
    const base = t.sponsor;
    G.sponsorOffers = [
      { name: 'Loyal partner', base: Math.round(base * 1.03 / 10000) * 10000, perWin: 0, perPoint: 0, text: 'A steady budget with no strings attached.' },
      { name: 'Results-driven sponsor', base: Math.round(base * 0.88 / 10000) * 10000, perWin: Math.round(base * 0.006 / 1000) * 1000, perPoint: Math.round(base / 250000) * 10, text: 'Lower base, paid extra for every win and UCI point.' },
      { name: 'Ambitious newcomer', base: Math.round(base * 0.95 / 10000) * 10000, perWin: Math.round(base * 0.012 / 1000) * 1000, perPoint: 0, text: 'Loves winners: a big bonus per victory.' },
    ];
    t.deal = { name: 'Loyal partner', base: G.sponsorOffers[0].base, perWin: 0, perPoint: 0, paidWins: 0, paidPts: 0 };
    t.sponsor = t.deal.base;
  }
  function chooseSponsor(G, i) {
    const o = (G.sponsorOffers || [])[i];
    if (!o) return;
    const t = player(G);
    t.deal = { name: o.name, base: o.base, perWin: o.perWin, perPoint: o.perPoint, paidWins: t.season.wins, paidPts: t.season.pts };
    t.sponsor = o.base;
    G.sponsorOffers = null;
  }

  // ---------------- staff hiring ----------------
  function hire(G, id) {
    const s = (G.staffMarket || []).find(x => x.id === id);
    if (!s) return { ok: false, msg: 'That candidate is no longer available.' };
    if (staffOf(G, s.role).length >= ROLES[s.role].max) return { ok: false, msg: `You already have ${ROLES[s.role].max} ${ROLES[s.role].label.toLowerCase()}s. Release one first.` };
    const t = player(G);
    const fee = Math.round(s.salary * 0.25 / 1000) * 1000;
    if (t.cash < fee) return { ok: false, msg: `Hiring costs a ${U.money(fee)} signing fee.` };
    t.cash -= fee;
    G.staffMarket = G.staffMarket.filter(x => x !== s);
    s.until = G.year + 2;
    G.staff.push(s);
    return { ok: true, msg: `${s.name} joins as ${ROLES[s.role].label.toLowerCase()} (${U.money(s.salary)}/yr).`, fee };
  }
  function fire(G, id) {
    const s = (G.staff || []).find(x => x.id === id);
    if (!s) return { ok: false, msg: '' };
    const cost = Math.round(s.salary * 0.5 / 1000) * 1000;
    player(G).cash -= cost;
    G.staff = G.staff.filter(x => x !== s);
    G.missions = G.missions.filter(m => m.scoutId !== id || m.done);
    return { ok: true, msg: `${s.name} released (${U.money(cost)} settlement).`, cost };
  }

  // ---------------- equipment & academy ----------------
  function upgradeEquip(G, kind) {
    const t = player(G);
    const lvl = t.equip[kind];
    if (lvl >= 5) return { ok: false, msg: 'Already the best equipment available.' };
    const cost = EQUIP_COST[lvl + 1];
    if (t.cash < cost) return { ok: false, msg: `The upgrade costs ${U.money(cost)}.` };
    t.cash -= cost;
    t.equip[kind] = lvl + 1;
    return { ok: true, msg: `${EQUIP[kind].label} upgraded to level ${lvl + 1}.`, cost };
  }
  function upgradeAcademy(G) {
    const t = player(G);
    const lvl = G.academy.level;
    if (lvl >= 5) return { ok: false, msg: 'The academy is already top class.' };
    const cost = ACADEMY_COST[lvl + 1];
    if (t.cash < cost) return { ok: false, msg: `The upgrade costs ${U.money(cost)}.` };
    t.cash -= cost;
    G.academy.level = lvl + 1;
    return { ok: true, msg: `Youth academy upgraded to level ${lvl + 1}: better talents from next season.`, cost };
  }
  function promote(G, rid, signTo) {
    const r = G.riders[rid];
    const t = player(G);
    if (!r || !r.academy) return { ok: false, msg: '' };
    if (t.riders.length >= 30) return { ok: false, msg: 'The pro squad is full (30 riders).' };
    r.academy = false;
    G.academy.riders = G.academy.riders.filter(x => x !== rid);
    signTo(G, r, t, Math.max(35000, Riders.salaryAsk(r, G.year)), G.year + 2);
    return { ok: true, msg: `${Riders.fullName(r)} turns pro with us.` };
  }
  function releaseAcademy(G, rid) {
    const r = G.riders[rid];
    if (!r || !r.academy) return;
    r.academy = false;
    G.academy.riders = G.academy.riders.filter(x => x !== rid);
    G.freeAgents.push(rid);
  }

  // ---------------- contract negotiation ----------------
  // terms: { salary, years, bonus (one-off signing bonus), role ('' | 'leader' | 'free') }
  function preferredYears(G, r) { const a = Riders.age(r, G.year); return a <= 24 ? 3 : a >= 32 ? 1 : 2; }
  function evaluate(G, r, terms, ask) {
    let value = terms.salary + (terms.bonus || 0) / Math.max(1, terms.years) * 0.9;
    const spec = Riders.specialty(r);
    if (terms.role === 'leader' && Riders.ovr(r) >= 76) value += ask * 0.08;
    if (terms.role === 'free' && (spec === 'puncheur' || spec === 'rouleur' || spec === 'cobbles')) value += ask * 0.04;
    if (Math.abs(terms.years - preferredYears(G, r)) >= 2) value -= ask * 0.05;
    return value;
  }
  function negotiate(G, rid, terms, askingSalary) {
    const r = G.riders[rid];
    const talks = r.talks && r.talks.year === G.year ? r.talks : (r.talks = { year: G.year, round: 0, ask: askingSalary(G, r), until: 0 });
    if (talks.until > G.week) return { status: 'closed', msg: `${Riders.fullName(r)} doesn't want to talk again until week ${talks.until}.` };
    const value = evaluate(G, r, terms, talks.ask);
    talks.round++;
    if (value >= talks.ask * 0.97) { r.talks = null; return { status: 'accepted', msg: `${Riders.fullName(r)} accepts!` }; }
    if (talks.round >= 4) {
      talks.until = G.week + 4; talks.round = 0;
      r.morale = U.clamp(r.morale - 5, 0, 100);
      return { status: 'rejected', msg: `${Riders.fullName(r)} walks away from the table. Try again in 4 weeks.` };
    }
    if (value >= talks.ask * 0.85) {
      talks.ask = Math.round(((talks.ask + value) / 2 + talks.ask * 0.02) / 5000) * 5000;
      return { status: 'counter', ask: talks.ask, msg: `${Riders.fullName(r)} counters: ${U.money(talks.ask)} a year${preferredYears(G, r) !== terms.years ? `, ideally for ${preferredYears(G, r)} year${preferredYears(G, r) > 1 ? 's' : ''}` : ''}.` };
    }
    r.morale = U.clamp(r.morale - 2, 0, 100);
    return { status: 'rejected', msg: `${Riders.fullName(r)} finds that offer insulting. He's asking around ${U.money(talks.ask)} a year. (${4 - talks.round} rounds left)` };
  }
  function currentAsk(G, r, askingSalary) { return r.talks && r.talks.year === G.year ? r.talks.ask : askingSalary(G, r); }

  return { ROLES, EQUIP, EQUIP_COST, ACADEMY_COST, init, weekly, seasonEnd, chooseSponsor, hire, fire, startMission, upgradeEquip, upgradeAcademy,
    promote, releaseAcademy, negotiate, currentAsk, preferredYears, growthMult, recoverMult, raceBonus, potError, staffOf, best, staffSalary };
})();
