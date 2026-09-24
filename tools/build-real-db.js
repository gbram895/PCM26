#!/usr/bin/env node
// Builds js/data-real.js (the "Real peloton" rider database) from public Wikipedia data:
//   1. the season's UCI World Tour page gives the list of WorldTeams
//   2. each team's season page (or team page) gives the roster and nationalities
//   3. each rider's page gives birthdate, rider type and major wins
//   4. ratings come from tools/real/ratings.csv (hand-tuned) or an estimate from age + major wins
//
// Usage: node tools/build-real-db.js [--season 2026] [--refresh] [--offline]
// Wikipedia text is CC BY-SA. The output file is ignored by git; keep it on your own machine.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const CACHE = path.join(__dirname, 'real', 'cache');
const OUT = path.join(ROOT, 'js', 'data-real.js');
const API = 'https://en.wikipedia.org/w/api.php';
const UA = 'PCM26-roster-builder/1.0 (https://github.com/gbram895/PCM26; personal game project)';

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const SEASON = +arg('--season', 2026);
const REFRESH = args.includes('--refresh');
const OFFLINE = args.includes('--offline');

// ---------- helpers ----------
const sleep = ms => new Promise(r => setTimeout(r, ms));
function norm(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, ''); }
function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }

async function api(params) {
  const qs = new URLSearchParams({ format: 'json', formatversion: '2', ...params }).toString();
  const file = path.join(CACHE, crypto.createHash('sha1').update(qs).digest('hex') + '.json');
  if (!REFRESH && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  if (OFFLINE) return null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(API + '?' + qs, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
      if (res.status === 429 || res.status >= 500) throw new Error('HTTP ' + res.status);
      const j = await res.json();
      fs.mkdirSync(CACHE, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(j));
      await sleep(150);
      return j;
    } catch (e) {
      if (attempt === 3) throw new Error(`Wikipedia request failed (${e.message}). Is en.wikipedia.org reachable?`);
      await sleep(1000 * 2 ** attempt);
    }
  }
}
async function wikitext(title) {
  const j = await api({ action: 'parse', page: title, prop: 'wikitext', redirects: '1' });
  return j && j.parse ? { title: j.parse.title, text: j.parse.wikitext } : null;
}

// ---------- wikitext parsing ----------
const LINK_RE = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g;

function sections(text) {
  const out = [];
  const re = /^(={2,6})\s*(.+?)\s*\1\s*$/gm;
  let m, last = null;
  while ((m = re.exec(text))) {
    if (last) last.body = text.slice(last.start, m.index);
    last = { level: m[1].length, title: m[2].replace(/\[\[|\]\]|'''?/g, ''), start: re.lastIndex };
    out.push(last);
  }
  if (last) last.body = text.slice(last.start);
  // include nested subsections in each section's body
  return out.map((s, i) => {
    let end = out.length;
    for (let j = i + 1; j < out.length; j++) if (out[j].level <= s.level) { end = j; break; }
    return { ...s, full: [s.body, ...out.slice(i + 1, end).map(x => x.body)].join('\n') };
  });
}

function links(text) {
  const out = [];
  let m;
  LINK_RE.lastIndex = 0;
  while ((m = LINK_RE.exec(text))) {
    const target = m[1].trim();
    if (/^(file|image|category|wikipedia|template|help|special):/i.test(target)) continue;
    out.push({ target, label: (m[2] || target).trim(), index: m.index });
  }
  return out;
}

const NAT_BY_NAME = {};
function loadNations() {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'data.js'), 'utf8');
  const re = /([A-Z]{3}): \['([^']+)', '[A-Z]{2}'\]/g;
  let m;
  while ((m = re.exec(src))) NAT_BY_NAME[norm(m[2])] = m[1];
  Object.assign(NAT_BY_NAME, { unitedkingdom: 'GBR', england: 'GBR', scotland: 'GBR', wales: 'GBR', unitedstatesofamerica: 'USA', czechia: 'CZE' });
}
// Flag templates: {{flagathlete|[[Name]]|SLO}}, {{flagicon|SLO}}, {{flag|Slovenia}}, {{flagIOCathlete|...}}
function flagCode(chunk) {
  const re = /\{\{\s*(flag[a-z]*)\s*\|([^{}]*)\}\}/gi;
  let m;
  while ((m = re.exec(chunk))) {
    const params = m[2].replace(/\[\[[^\]]*\]\]/g, '').split('|').map(x => x.trim()).filter(x => x && !x.includes('='));
    for (const p of params) {
      if (/^[A-Z]{3}$/.test(p)) return p;
      if (NAT_BY_NAME[norm(p)]) return NAT_BY_NAME[norm(p)];
    }
  }
  return null;
}

// Roster: every link in the roster section, with the nationality flag found on the same line (or just before it)
function parseRoster(text) {
  const secs = sections(text);
  const sec = secs.find(s => /roster|squad|team members/i.test(s.title) && !/staff|former|transfer/i.test(s.title)) ||
    secs.find(s => /riders/i.test(s.title));
  if (!sec) return [];
  const riders = [];
  let pendingFlag = null, pendingAge = 0;
  for (const line of sec.full.split('\n')) {
    if (/staff|directeur|manager/i.test(line) && !/\[\[/.test(line)) break;
    const code = flagCode(line);
    const ls = links(line).filter(l => !NAT_BY_NAME[norm(l.label)] && !/\bteam\b|cycling|season|uci|tour\b/i.test(l.target));
    if (!ls.length) { if (code) { pendingFlag = code; pendingAge = 0; } else if (++pendingAge > 3) pendingFlag = null; continue; }
    for (const l of ls) riders.push({ title: l.target, nat: code || pendingFlag });
    pendingFlag = null;
  }
  const seen = new Set();
  return riders.filter(r => (seen.has(r.title) ? false : seen.add(r.title)));
}

function infoboxField(text, key) {
  const re = new RegExp('^\\s*\\|\\s*' + key + '\\s*=([\\s\\S]*?)(?=^\\s*\\|\\s*[a-z_0-9]+\\s*=|^\\}\\})', 'mi');
  const m = re.exec(text);
  return m ? m[1].trim() : '';
}
function parseRider(text) {
  if (!/\{\{\s*infobox (cyclist|cycling)/i.test(text)) return null;
  const bd = infoboxField(text, 'birth_date');
  let born = null;
  const m = /(\d{4})\s*\|\s*(\d{1,2})\s*\|\s*(\d{1,2})/.exec(bd) || /(\d{4})-(\d{2})-(\d{2})/.exec(bd);
  if (m) born = `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  else { const y = /(19|20)\d{2}/.exec(bd); if (y) born = y[0] + '-07-01'; }
  const clean = s => s.replace(/<ref[\s\S]*?(<\/ref>|\/>)/g, '').replace(/\{\{[^{}]*\}\}/g, ' ').replace(LINK_RE, (a, t, l) => l || t).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const wins = infoboxField(text, 'majorwins');
  // count win entries: bulleted lines, <br> separated lines or listed stage/classification items
  const winCount = wins ? wins.split(/\n|<br\s*\/?>/i).map(clean).filter(x => x && !/^(grand tours?|stage races?|one-day races and classics|single-day races|other|general classification)$/i.test(x) && x.length > 2).length : 0;
  return {
    born,
    ridertype: clean(infoboxField(text, 'ridertype')),
    role: clean(infoboxField(text, 'role')),
    birthPlace: clean(infoboxField(text, 'birth_place')),
    wins: winCount,
  };
}

const TYPE_RULES = [
  [/sprint/i, 'sprinter'], [/time[ -]?trial/i, 'tt'], [/climb/i, 'climber'], [/all[ -]?round|grand tour|general classification|stage race/i, 'gc'],
  [/puncheur|hill|ardennes/i, 'puncheur'], [/classic|cobble|rouleur/i, 'cobbles'], [/domestique|lead[ -]?out|helper/i, 'rouleur'],
];
function typeFrom(ridertype) {
  let best = null, bi = Infinity;
  for (const [re, t] of TYPE_RULES) { const m = re.exec(ridertype || ''); if (m && m.index < bi) { bi = m.index; best = t; } }
  return best;
}
function estimateLevel(name, age, wins) {
  const ageAdj = age <= 20 ? -4 : age <= 22 ? -2.5 : age <= 24 ? -1 : age <= 31 ? 1 : age <= 34 ? 0 : -1.5;
  const winAdj = Math.min(9, 3 * Math.log2(1 + wins));
  return Math.max(62, Math.min(86, Math.round((69 + ageAdj + winAdj + (hash(name) - 0.5) * 3) * 10) / 10));
}

function loadOverrides() {
  const file = path.join(__dirname, 'real', 'ratings.csv');
  const map = new Map();
  if (!fs.existsSync(file)) return map;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim() || line.startsWith('#') || line.startsWith('name,')) continue;
    const [name, type, level] = line.split(',').map(x => x.trim());
    map.set(norm(name), { name, type, level: +level });
  }
  return map;
}

// ---------- teams ----------
const TEAM_STYLE = [
  [/uae/i, 'UAE', '#e30613', '#111111'], [/visma/i, 'NED', '#ffd200', '#111111'], [/soudal|quick/i, 'BEL', '#0033a0', '#ffffff'],
  [/ineos/i, 'GBR', '#8e1b2e', '#ffffff'], [/red bull|bora/i, 'GER', '#1b1f3b', '#e21b3c'], [/lidl/i, 'USA', '#0050aa', '#ffe500'],
  [/alpecin/i, 'BEL', '#0f2d52', '#e30613'], [/\bef\b|education/i, 'USA', '#ff3e8a', '#1a1a4a'], [/decathlon/i, 'FRA', '#0082c3', '#ffffff'],
  [/groupama|fdj/i, 'FRA', '#003da5', '#e4002b'], [/movistar/i, 'ESP', '#004b93', '#62b346'], [/bahrain/i, 'BRN', '#c8102e', '#002f6c'],
  [/jayco/i, 'AUS', '#0b5aa2', '#f28c28'], [/picnic|postnl/i, 'NED', '#e5002b', '#ffffff'], [/intermarch/i, 'BEL', '#0a4ea3', '#ffd200'],
  [/lotto/i, 'BEL', '#d71920', '#ffffff'], [/uno-?x/i, 'NOR', '#d4002e', '#ffffff'], [/astana|xds/i, 'KAZ', '#00aeef', '#ffd200'],
  [/nsn|israel/i, 'SUI', '#1c3f94', '#ffffff'], [/cofidis/i, 'FRA', '#d0021b', '#ffffff'], [/arkéa|arkea/i, 'FRA', '#ee2e24', '#111111'],
  [/tudor/i, 'SUI', '#b3001b', '#ffffff'], [/q36/i, 'SUI', '#222222', '#9aa0a6'], [/totalenergies/i, 'FRA', '#00a0e3', '#e30613'],
];
function teamStyle(name, riders) {
  for (const [re, nat, c1, c2] of TEAM_STYLE) if (re.test(name)) return { nat, c1, c2 };
  const counts = {};
  for (const r of riders) if (r.nat) counts[r.nat] = (counts[r.nat] || 0) + 1;
  const nat = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'UNK';
  const hue = Math.floor(hash(name) * 360);
  return { nat, c1: `hsl(${hue} 65% 42%)`, c2: '#ffffff' };
}
function teamId(name, used) {
  const words = name.replace(/[^A-Za-z\s-]/g, '').split(/[\s-]+/).filter(Boolean);
  let id = words.map(w => w[0]).join('').toUpperCase().slice(0, 3);
  if (id.length < 3) id = (words[0] || 'TEAM').toUpperCase().slice(0, 3);
  let n = 2, base = id;
  while (used.has(id)) id = base.slice(0, 2) + n++;
  used.add(id);
  return id;
}

async function teamList() {
  const custom = path.join(__dirname, 'real', 'teams.txt');
  if (fs.existsSync(custom)) return fs.readFileSync(custom, 'utf8').split('\n').map(x => x.trim()).filter(x => x && !x.startsWith('#'));
  const page = await wikitext(`${SEASON} UCI World Tour`);
  if (!page) throw new Error(`Could not load "${SEASON} UCI World Tour" from Wikipedia.`);
  const sec = sections(page.text).find(s => /^teams$|uci worldteams|participating teams/i.test(s.title)) || sections(page.text).find(s => /team/i.test(s.title));
  const cands = links(sec ? sec.full : page.text).map(l => l.target)
    .filter(t => !NAT_BY_NAME[norm(t)] && !/^\d{4}|uci|union|world tour|proteam|continental/i.test(t));
  return [...new Set(cands)];
}

async function main() {
  loadNations();
  const overrides = loadOverrides();
  const teamNames = await teamList();
  console.log(`Found ${teamNames.length} candidate teams on the ${SEASON} UCI World Tour page.`);
  const teams = [];
  for (const name of teamNames) {
    let page = await wikitext(`${SEASON} ${name} season`);
    let roster = page ? parseRoster(page.text) : [];
    if (roster.length < 15) {
      const tp = await wikitext(name);
      const r2 = tp ? parseRoster(tp.text) : [];
      if (r2.length > roster.length) roster = r2;
    }
    if (roster.length < 15) { console.log(`  skip ${name}: no roster found`); continue; }
    teams.push({ name, roster });
    if (teams.length >= 18 && !fs.existsSync(path.join(__dirname, 'real', 'teams.txt'))) break;
  }
  // rider pages, 50 per request
  const titles = [...new Set(teams.flatMap(t => t.roster.map(r => r.title)))];
  const info = new Map();
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const j = await api({ action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main', redirects: '1', titles: batch.join('|') });
    if (!j || !j.query) continue;
    const redirect = new Map((j.query.redirects || []).map(r => [r.to, r.from]));
    const normalized = new Map((j.query.normalized || []).map(r => [r.to, r.from]));
    for (const p of j.query.pages || []) {
      const content = p.revisions && p.revisions[0] && (p.revisions[0].slots ? p.revisions[0].slots.main.content : p.revisions[0].content);
      if (!content) continue;
      const parsed = parseRider(content);
      if (!parsed) continue;
      let from = p.title;
      if (redirect.has(from)) from = redirect.get(from);
      if (normalized.has(from)) from = normalized.get(from);
      info.set(from, { ...parsed, page: p.title });
    }
    process.stdout.write(`\r  rider pages ${Math.min(titles.length, i + 50)}/${titles.length}`);
  }
  console.log('');

  const used = new Set();
  const out = [];
  let noBirth = 0, estimated = 0, tuned = 0;
  for (const t of teams) {
    const riders = [];
    for (const r of t.roster) {
      const inf = info.get(r.title);
      if (!inf) continue;
      if (/directeur|manager|coach|staff|owner/i.test(inf.role) && !/rider/i.test(inf.role)) continue;
      const display = inf.page.replace(/\s*\(.*\)\s*$/, '');
      const born = inf.born;
      const age = born ? SEASON - +born.slice(0, 4) : 27;
      if (age > 42 || age < 17) continue;
      if (!born) noBirth++;
      const ov = overrides.get(norm(display));
      const type = (ov && ov.type) || typeFrom(inf.ridertype) || 'rouleur';
      const level = ov && ov.level ? ov.level : estimateLevel(display, age, inf.wins);
      if (ov) tuned++; else estimated++;
      const parts = display.split(' ');
      riders.push({ name: display, first: parts[0], last: parts.slice(1).join(' ') || parts[0], nat: r.nat || 'UNK', born: born || `${SEASON - 27}-07-01`, type, level });
    }
    if (riders.length < 15) { console.log(`  skip ${t.name}: only ${riders.length} riders with cyclist pages`); continue; }
    out.push({ id: teamId(t.name, used), name: t.name, ...teamStyle(t.name, riders), riders });
  }
  // prestige from squad strength
  const strength = t => { const l = t.riders.map(r => r.level).sort((a, b) => b - a).slice(0, 10); return l.reduce((a, b) => a + b, 0) / l.length; };
  out.sort((a, b) => strength(b) - strength(a)).forEach((t, i) => { t.prestige = i < 3 ? 5 : i < 7 ? 4 : i < 11 ? 3 : i < 15 ? 2 : 1; });

  const data = { season: SEASON, source: 'Wikipedia', built: new Date().toISOString().slice(0, 10), teams: out };
  fs.writeFileSync(OUT, `// Generated by tools/build-real-db.js on ${data.built} from English Wikipedia (CC BY-SA 4.0).\n` +
    `// Ratings are estimates. This file is ignored by git: keep it local.\nvar PCM = globalThis.PCM || (globalThis.PCM = {});\nPCM.REAL = ${JSON.stringify(data, null, 1)};\n`);
  const total = out.reduce((n, t) => n + t.riders.length, 0);
  console.log(`Wrote ${path.relative(ROOT, OUT)}: ${out.length} teams, ${total} riders (${tuned} hand-rated, ${estimated} estimated, ${noBirth} without birthdate).`);
  for (const t of out) console.log(`  ${t.id.padEnd(4)} ${t.name.padEnd(34)} ${String(t.riders.length).padStart(2)} riders  ★${t.prestige}  top: ${t.riders.slice().sort((a, b) => b.level - a.level).slice(0, 3).map(r => r.name).join(', ')}`);
}

module.exports = { parseRoster, parseRider, flagCode, typeFrom, estimateLevel, sections, links, loadNations, norm };
if (require.main === module) main().catch(e => { console.error('\n' + e.message); process.exit(1); });
