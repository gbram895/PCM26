// Riders: generation, ratings, salaries, development.
var PCM = globalThis.PCM || (globalThis.PCM = {});

PCM.Riders = (function () {
  const { R, U, DATA } = PCM;
  const ATTR_KEYS = DATA.ATTRS.map(a => a.k);

  // Specialty scores (what the rider is good at)
  function specScores(a) {
    return {
      gc: a.mo * 0.45 + a.mm * 0.1 + a.tt * 0.2 + a.res * 0.1 + a.re * 0.1 + a.st * 0.05,
      climber: a.mo * 0.65 + a.mm * 0.15 + a.st * 0.05 + a.re * 0.15,
      sprinter: a.sp * 0.6 + a.acc * 0.2 + a.fl * 0.15 + a.st * 0.05,
      puncheur: a.hi * 0.6 + a.acc * 0.15 + a.mm * 0.1 + a.st * 0.15,
      cobbles: a.co * 0.6 + a.fl * 0.2 + a.st * 0.1 + a.res * 0.1,
      tt: a.tt * 0.75 + a.prl * 0.1 + a.fl * 0.15,
      rouleur: a.fl * 0.5 + a.st * 0.2 + a.res * 0.15 + a.brk * 0.15 - 4,
    };
  }

  function specialty(r) {
    const s = specScores(r.a);
    let best = 'rouleur', bv = -1;
    for (const k in s) if (s[k] > bv) { bv = s[k]; best = k; }
    // climbers who can also time trial are GC riders
    if (best === 'climber' && s.gc >= s.climber - 1.5) best = 'gc';
    // keep the rider's own profile when it's nearly as strong as the best one
    if (r.type && s[r.type] !== undefined && s[r.type] >= bv - 1.5) best = r.type;
    return best;
  }

  function ovr(r) {
    const s = specScores(r.a);
    return Math.max(...Object.values(s));
  }

  function age(r, year) { return year - r.born; }

  function salaryAsk(r, year) {
    const o = ovr(r);
    const a = age(r, year);
    let eff = o;
    if (a <= 24) eff += Math.max(0, r.pot - o) * (a <= 21 ? 0.35 : 0.25);
    if (a >= 33) eff -= (a - 32) * 1.2;
    const base = 25000 * Math.exp((eff - 60) * 0.16);
    return Math.max(30000, Math.round(base / 5000) * 5000);
  }

  // transfer fee asked by the current team
  function transferValue(r, year) {
    if (!r.teamId) return 0;
    const yrs = Math.max(0, r.contractEnd - year) + 0.5;
    const a = age(r, year);
    const youth = a <= 23 ? 1.4 : a <= 26 ? 1.15 : a >= 32 ? 0.6 : 1;
    return Math.round(salaryAsk(r, year) * yrs * 1.3 * youth / 10000) * 10000;
  }

  let nextId = 1;
  function setNextId(n) { nextId = n; }
  function getNextId() { return nextId; }

  function pickNation(homeNat) {
    const keys = Object.keys(DATA.NATIONS);
    return R.weighted(keys, k => DATA.NATIONS[k].w * (k === homeNat ? 3 : 1));
  }

  function makeName(nat) {
    const n = DATA.NATIONS[nat];
    return { first: R.pick(n.first), last: R.pick(n.last) };
  }

  // quality ~ target specialty score; type = template key
  function create({ type, quality, year, ageYears, pot, nat, homeNat }) {
    nat = nat || pickNation(homeNat);
    const tpl = DATA.TEMPLATES[type];
    const a = {};
    for (const k of ATTR_KEYS) a[k] = U.clamp(quality + tpl[k] + R.normal(0, 2.2), 40, 90);
    const nm = makeName(nat);
    const r = {
      id: nextId++, first: nm.first, last: nm.last, nat,
      born: year - ageYears, a, pot: 0, type,
      teamId: null, salary: 0, contractEnd: year,
      form: U.clamp(R.normal(58, 6), 40, 75), fatigue: R.int(0, 10), morale: 65,
      injury: 0, plan: 'normal', focus: defaultFocus(type),
      season: blankSeason(), career: { wins: 0, pts: 0, days: 0 }, palmares: [],
    };
    const o = ovr(r);
    r.pot = Math.round(Math.max(o + 0.5, pot || o + 0.5) * 10) / 10;
    return r;
  }

  function blankSeason() { return { days: 0, wins: 0, pts: 0, top10: 0 }; }

  function defaultFocus(type) {
    return { gc: 'mountain', climber: 'mountain', sprinter: 'sprint', puncheur: 'hills', cobbles: 'cobbles', tt: 'tt', rouleur: 'endurance' }[type] || 'balanced';
  }

  // young rider: potential first, current below it
  function createYouth(year, homeNat, potBase) {
    const type = R.weighted(Object.keys(DATA.TEMPLATES), t => ({ gc: 1.2, climber: 1.4, sprinter: 1.2, puncheur: 1.2, cobbles: 1, tt: 0.8, rouleur: 1.5 }[t]));
    const ageYears = R.int(19, 22);
    const pot = U.clamp(potBase !== undefined ? potBase : R.normal(72, 5), 62, 88);
    const gapYears = 26 - ageYears;
    const quality = pot - gapYears * R.range(2.2, 3.6) - 1;
    const r = create({ type, quality, year, ageYears, homeNat });
    r.pot = U.round(Math.max(ovr(r) + 1, pot), 1);
    return r;
  }

  // One week of training for a rider not racing
  // o: { formTarget, growthMult, focusAttrs, fatigueAdd, moraleAdd } from peaks and training camps
  function trainWeek(r, year, o = {}) {
    const load = DATA.TRAINING_LOAD[r.plan] || DATA.TRAINING_LOAD.normal;
    const recover = (10 + (r.a.re - 60) / 4) * load.fatigue;
    r.fatigue = U.clamp(r.fatigue - recover, 0, 100);
    if (r.plan === 'intense') r.fatigue = U.clamp(r.fatigue + 3, 0, 100);
    if (r.injury > 0) {
      r.injury--;
      r.form = U.clamp(r.form - 3, 30, 99);
      return;
    }
    const target = o.formTarget !== undefined ? o.formTarget : load.form;
    r.form = U.clamp(r.form + (target - r.form) * (o.formTarget !== undefined ? 0.3 : 0.18) + R.normal(0, 1.3), 30, 99);
    r.morale = U.clamp(r.morale + (62 - r.morale) * 0.05 + (o.moraleAdd || 0), 10, 100);
    if (o.fatigueAdd) r.fatigue = U.clamp(r.fatigue + o.fatigueAdd, 0, 100);
    if (o.formTarget === undefined && r.form > 78) r.form -= 2; // top form fades without a target

    const a = age(r, year);
    const cur = ovr(r);
    if ((load.growth > 0 || o.growthMult) && cur < r.pot) {
      const ageMult = a <= 21 ? 1.6 : a <= 24 ? 1.2 : a <= 27 ? 0.7 : 0.25;
      const focus = DATA.TRAINING_FOCUS[r.focus] || DATA.TRAINING_FOCUS.balanced;
      const attrs = o.focusAttrs || focus.attrs;
      const gain = 0.05 * Math.max(load.growth, 1) * (o.growthMult || 1) * ageMult * U.clamp((r.pot - cur) / 4, 0.2, 1.5);
      for (const k of attrs) r.a[k] = Math.min(90, r.a[k] + gain * (!o.focusAttrs && r.focus === 'balanced' ? 0.4 : 1));
    }
  }

  // Off-season development/aging. Returns delta ovr.
  function ageAndDevelop(r, newYear) {
    const a = newYear - r.born;
    const before = ovr(r);
    let delta;
    const gap = Math.max(0, r.pot - before);
    if (a <= 23) delta = gap * R.range(0.25, 0.45);
    else if (a <= 26) delta = gap * R.range(0.15, 0.35);
    else if (a <= 29) delta = gap * R.range(0, 0.2) + R.normal(0, 0.4);
    else if (a <= 31) delta = R.normal(-0.4, 0.6);
    else if (a <= 33) delta = R.normal(-1.2, 0.7);
    else delta = R.normal(-2.2, 0.9);

    // potential can shift for young riders (late bloomers / busts)
    if (a <= 24) r.pot = U.round(U.clamp(r.pot + R.normal(0, 1.2), 50, 90), 1);

    const tpl = DATA.TEMPLATES[r.type] || DATA.TEMPLATES.rouleur;
    const keys = ATTR_KEYS.slice().sort((x, y) => tpl[y] - tpl[x]);
    keys.forEach((k, i) => {
      const w = delta >= 0 ? (i < 3 ? 1 : 0.5) : (k === 'st' || k === 're' ? 1.2 : 0.9);
      r.a[k] = U.clamp(r.a[k] + delta * w + R.normal(0, 0.3), 35, Math.max(90, r.a[k]));
    });
    if (r.pot < ovr(r)) r.pot = U.round(ovr(r), 1);
    return ovr(r) - before;
  }

  // older saves only had 8 attributes: derive the PCM extras from them
  function ensureAttrs(r) {
    const a = r.a;
    if (a.mm !== undefined) return false;
    const j = k => ((r.id * 7919 + k * 104729) % 7) - 3; // small fixed per-rider variation
    a.mm = U.clamp((a.mo + a.hi) / 2 + j(1) * 0.5, 35, 95);
    a.prl = U.clamp(a.tt + j(2) * 0.6, 35, 95);
    a.acc = U.clamp(a.sp - 2 + j(3) * 0.8, 35, 95);
    a.dh = U.clamp((a.fl + a.mo) / 2 + j(4), 35, 95);
    a.res = U.clamp(a.st + j(5) * 0.7, 35, 95);
    a.brk = U.clamp((a.fl + a.st) / 2 - 3 + j(6), 35, 95);
    return true;
  }

  function fullName(r) { return r.first + ' ' + r.last; }
  function shortName(r) { return r.first[0] + '. ' + r.last; }

  return { specScores, specialty, ovr, age, salaryAsk, transferValue, create, createYouth, trainWeek, ageAndDevelop,
    fullName, shortName, blankSeason, ensureAttrs, defaultFocus, setNextId, getNextId, ATTR_KEYS };
})();
