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
const SEED = arg('--seed', null);

// ---------- helpers ----------
const sleep = ms => new Promise(r => setTimeout(r, ms));
function norm(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, ''); }
function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }

async function api(params) {
  const qs = new URLSearchParams({ format: 'json', formatversion: '2', ...params }).toString();
  const file = path.join(CACHE, crypto.createHash('sha1').update(qs).digest('hex') + '.json');
  if (!REFRESH && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  if (OFFLINE) return null;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const res = await fetch(API + '?' + qs, { headers: { 'User-Agent': UA, 'Api-User-Agent': UA, 'Accept': 'application/json' } });
      if (res.status === 429 || res.status >= 500) {
        const wait = Math.min(120, +res.headers.get('retry-after') || 30);
        process.stdout.write(`\n  Wikipedia asked us to slow down; waiting ${wait}s…`);
        await sleep(wait * 1000);
        throw new Error('HTTP ' + res.status);
      }
      const j = await res.json();
      fs.mkdirSync(CACHE, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(j));
      await sleep(1100); // stay well under anonymous API limits
      return j;
    } catch (e) {
      if (attempt === 7) throw new Error(`Wikipedia request failed (${e.message}). Is en.wikipedia.org reachable?`);
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

// "List of <season> UCI WorldTeams and riders": one section per team with
// {{Cycling squad rider|name=[[Page|Name]]|nat=XXX|birthdate={{birth date and age2|...|ref Y|M|D|birth Y|M|D}}}}
function parseRiderLine(line) {
  if (!/Cycling squad rider/i.test(line)) return null;
  const link = /name\s*=\s*\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/.exec(line);
  if (!link) return null;
  const nat = (/\|\s*nat\s*=\s*([A-Z]{3})/.exec(line) || [])[1] || null;
  const nums = ((/birth date(?: and age2?)?\s*\|([^}]*)\}\}/i.exec(line) || [])[1] || '').split('|').map(x => x.trim()).filter(x => /^\d+$/.test(x));
  const born = nums.length >= 3 ? `${nums[nums.length - 3]}-${nums[nums.length - 2].padStart(2, '0')}-${nums[nums.length - 1].padStart(2, '0')}` : null;
  return { title: link[1].trim(), display: (link[2] || link[1]).replace(/\s*\(.*\)\s*$/, '').trim(), nat, born };
}
function parseTeamList(text) {
  const teams = [];
  let cur = null;
  for (const line of text.split('\n')) {
    const h = /^===\s*(.+?)\s*===\s*$/.exec(line);
    if (h) { cur = { name: h[1].replace(/\[\[|\]\]/g, ''), roster: [], updated: 0 }; teams.push(cur); continue; }
    if (cur && /\{\{\s*updated\s*\|/i.test(line)) cur.updated = updatedDate(line);
    const r = cur && parseRiderLine(line);
    if (r) cur.roster.push(r);
  }
  return teams.filter(t => t.roster.length >= 10);
}
// A team article's "Team roster" section, in the same {{Cycling squad rider}} format
function parseSquad(text) {
  const sec = sections(text).find(s => /roster|squad/i.test(s.title) && !/staff|former/i.test(s.title));
  const body = sec ? sec.full : '';
  const roster = body.split('\n').map(parseRiderLine).filter(Boolean);
  roster.updated = updatedDate(body);
  return roster;
}
function updatedDate(text) {
  const m = /\{\{\s*updated\s*\|\s*([^<|}]+)/i.exec(text || '');
  const t = m ? Date.parse(m[1].replace(/\.$/, '').trim()) : NaN;
  return isNaN(t) ? 0 : t;
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

// match "Jefferson Cepeda" to "Jefferson Alveiro Cepeda": exact first, then same first and last name
function findOverride(overrides, name) {
  const exact = overrides.get(norm(name));
  if (exact) return exact;
  const parts = name.split(/\s+/);
  if (parts.length < 3) return null;
  for (const [, ov] of overrides) {
    const o = ov.name.split(/\s+/);
    if (norm(o[0]) === norm(parts[0]) && norm(o[o.length - 1]) === norm(parts[parts.length - 1])) return ov;
  }
  return null;
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
  [/tudor/i, 'SUI', '#b3001b', '#ffffff'], [/bardiani/i, 'ITA', '#4caf50', '#111111'], [/burgos/i, 'ESP', '#6a1b9a', '#ffffff'],
  [/caja rural/i, 'ESP', '#007a3d', '#ffffff'], [/kern/i, 'ESP', '#d7263d', '#ffffff'], [/euskaltel/i, 'ESP', '#ff6f00', '#ffffff'],
  [/mbh/i, 'HUN', '#003a70', '#e4002b'], [/modern adventure/i, 'USA', '#1f2937', '#f59e0b'], [/solution tech|nippo/i, 'ITA', '#e11d48', '#111111'],
  [/flanders/i, 'BEL', '#ffd200', '#111111'], [/novo nordisk/i, 'USA', '#0033a0', '#ffffff'], [/polti/i, 'ITA', '#d90429', '#ffffff'],
  [/unibet/i, 'NED', '#147b45', '#111111'], [/q36/i, 'SUI', '#222222', '#9aa0a6'], [/totalenergies/i, 'FRA', '#00a0e3', '#e30613'],
];
function teamStyle(name, riders) {
  for (const [re, nat, c1, c2] of TEAM_STYLE) if (re.test(name)) return { nat, c1, c2 };
  const counts = {};
  for (const r of riders) if (r.nat) counts[r.nat] = (counts[r.nat] || 0) + 1;
  const nat = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'UNK';
  const hue = Math.floor(hash(name) * 360);
  return { nat, c1: `hsl(${hue} 65% 42%)`, c2: '#ffffff' };
}
const TEAM_CODES = [[/uae/i, 'UAD'], [/visma/i, 'TVL'], [/red bull|bora/i, 'RBH'], [/lidl/i, 'LTK'], [/ineos/i, 'IGD'], [/soudal|quick/i, 'SOQ'],
  [/alpecin/i, 'APT'], [/\bef\b|education/i, 'EFE'], [/decathlon/i, 'DCT'], [/groupama|fdj/i, 'GFC'], [/movistar/i, 'MOV'], [/bahrain/i, 'TBV'],
  [/jayco/i, 'JAY'], [/cofidis/i, 'COF'], [/q36/i, 'PQT'], [/tudor/i, 'TUD'], [/totalenergies/i, 'TEN'], [/unibet/i, 'URR'],
  [/bardiani/i, 'BCS'], [/burgos/i, 'BBH'], [/caja rural/i, 'CJR'], [/kern/i, 'EKP'], [/euskaltel/i, 'EUS'], [/mbh/i, 'MBH'],
  [/modern adventure/i, 'MAP'], [/solution tech|nippo/i, 'STN'], [/flanders/i, 'TFB'], [/novo nordisk/i, 'TNN'], [/polti/i, 'PTV'], [/picnic|postnl/i, 'TPP'], [/lotto|intermarch/i, 'LOI'], [/astana|xds/i, 'XAT'], [/uno-?x/i, 'UXM'], [/nsn|israel/i, 'NSN']];
function teamId(name, used) {
  for (const [re, code] of TEAM_CODES) if (re.test(name) && !used.has(code)) { used.add(code); return code; }
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
  if (fs.existsSync(custom)) return fs.readFileSync(custom, 'utf8').split('\n').map(x => x.trim()).filter(x => x && !x.startsWith('#')).map(name => ({ name, season: `${SEASON} ${name} season` }));
  // The Teams section uses {{UCI team code}} templates, so ask for the page's resolved links
  // and keep the "<season> <team> season" articles (WorldTeams plus invited ProTeams).
  const j = await api({ action: 'parse', page: `${SEASON} UCI World Tour`, prop: 'links', redirects: '1' });
  if (!j || !j.parse) throw new Error(`Could not load "${SEASON} UCI World Tour" from Wikipedia.`);
  const re = new RegExp(`^${SEASON} (.+) season$`);
  return j.parse.links.filter(l => l.exists !== false && re.test(l.title)).map(l => ({ season: l.title, name: l.title.match(re)[1] }));
}

// Hand-written roster file (no network needed): "## Team" headers, then "Name | NAT | birth year | type"
function parseSeed(text) {
  const teams = [];
  let cur = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('# ')) continue;
    if (line.startsWith('## ')) {
      const m = /^##\s*(.+?)\s*(?:\[([^\]]*)\])?\s*$/.exec(line);
      const tags = (m[2] || '').toLowerCase();
      cur = { name: m[1], riders: [], tier: /continental/.test(tags) ? 'CT' : /proteam/.test(tags) ? 'PRO' : 'WT', autoInvite: /auto-invite/.test(tags) };
      teams.push(cur);
      continue;
    }
    if (!cur || line.startsWith('#')) continue;
    const [name, nat, year, type] = line.split('|').map(x => x.trim());
    if (!name) continue;
    cur.riders.push({ name, nat: (nat || 'UNK').toUpperCase(), born: year ? `${year}-07-01` : null, type: type || null });
  }
  return teams;
}
function seedLevel(name, age) {
  const ageAdj = age <= 20 ? -3 : age <= 22 ? -1.5 : age <= 24 ? -0.5 : age <= 31 ? 0.5 : age <= 34 ? 0 : -1.5;
  return Math.round((72 + ageAdj + (hash(name) - 0.5) * 4) * 10) / 10;
}
function assemble(rawTeams, overrides) {
  const used = new Set();
  const out = [];
  let tuned = 0, estimated = 0;
  for (const t of rawTeams) {
    const riders = t.riders.map(r => {
      const age = r.born ? SEASON - +r.born.slice(0, 4) : 27;
      const ov = findOverride(overrides, r.name);
      const type = (ov && ov.type) || r.type || 'rouleur';
      const level = ov && ov.level ? ov.level : r.level || Math.round((seedLevel(r.name, age) - (t.tier === 'CT' ? 6 : t.tier === 'PRO' ? 1.5 : 0)) * 10) / 10;
      if (ov) tuned++; else estimated++;
      const parts = r.name.split(' ');
      return { name: r.name, first: parts[0], last: parts.slice(1).join(' ') || parts[0], nat: r.nat || 'UNK', born: r.born || `${SEASON - 27}-07-01`, type, level };
    });
    out.push({ id: teamId(t.name, used), name: t.name, tier: t.tier || 'WT', autoInvite: !!t.autoInvite, ...teamStyle(t.name, riders), riders });
  }
  return { out, tuned, estimated };
}
function writeOut(out, source, extra) {
  const strength = t => { const l = t.riders.map(r => r.level).sort((a, b) => b - a).slice(0, 10); return l.reduce((a, b) => a + b, 0) / l.length; };
  const wt = out.filter(t => t.tier !== 'PRO').sort((a, b) => strength(b) - strength(a));
  wt.forEach((t, i) => { t.prestige = i < 3 ? 5 : i < 7 ? 4 : i < 11 ? 3 : i < 15 ? 2 : 1; });
  for (const t of out) if (t.tier === 'PRO') t.prestige = t.autoInvite ? 2 : 1; else if (t.tier === 'CT') t.prestige = 1;
  const tierOrder = { WT: 0, PRO: 1, CT: 2 };
  out.sort((a, b) => tierOrder[a.tier || 'WT'] - tierOrder[b.tier || 'WT'] || b.prestige - a.prestige || strength(b) - strength(a));
  const data = { season: SEASON, source, built: new Date().toISOString().slice(0, 10), teams: out };
  fs.writeFileSync(OUT, `// Generated by tools/build-real-db.js on ${data.built} from ${source}.\n` +
    `// Ratings are estimates.\nvar PCM = globalThis.PCM || (globalThis.PCM = {});\nPCM.REAL = ${JSON.stringify(data, null, 1)};\n`);
  const total = out.reduce((n, t) => n + t.riders.length, 0);
  console.log(`Wrote ${path.relative(ROOT, OUT)}: ${out.length} teams, ${total} riders${extra ? ' (' + extra + ')' : ''}.`);
  for (const t of out) console.log(`  ${t.id.padEnd(4)} ${t.name.padEnd(34)} ${String(t.riders.length).padStart(2)} riders  ★${t.prestige}  top: ${t.riders.slice().sort((a, b) => b.level - a.level).slice(0, 3).map(r => r.name).join(', ')}`);
}

async function main() {
  loadNations();
  const overrides = loadOverrides();
  if (SEED) {
    const raw = parseSeed(fs.readFileSync(path.resolve(SEED), 'utf8'));
    const { out, tuned, estimated } = assemble(raw, overrides);
    writeOut(out, 'the roster list in tools/real', `${tuned} hand-rated, ${estimated} estimated`);
    return;
  }
  const teams = [];
  const list = await wikitext(`List of ${SEASON} UCI WorldTeams and riders`);
  if (list) teams.push(...parseTeamList(list.text));
  if (teams.length) console.log(`Found ${teams.length} teams on "List of ${SEASON} UCI WorldTeams and riders".`);
  const teamNames = teams.length ? [] : await teamList();
  for (const { name, season } of teamNames) {
    let page = await wikitext(season);
    let roster = page ? parseRoster(page.text) : [];
    if (roster.length < 15) {
      const tp = await wikitext(name);
      const r2 = tp ? parseRoster(tp.text) : [];
      if (r2.length > roster.length) roster = r2;
    }
    if (roster.length < 15) { console.log(`  skip ${name}: no roster found`); continue; }
    teams.push({ name, roster });
  }
  for (const t of teams) t.tier = 'WT';
  // ProTeams: team names from the ProTeams list page, squads from each team's article.
  // Those linked from the World Tour page get automatic invitations to every WorldTour race.
  if (!args.includes('--no-proteams')) {
    const wtLinks = await api({ action: 'parse', page: `${SEASON} UCI World Tour`, prop: 'links', redirects: '1' });
    const invited = new Set(((wtLinks && wtLinks.parse && wtLinks.parse.links) || []).map(l => l.title));
    const pl = await api({ action: 'parse', page: `List of ${SEASON} UCI ProTeams and Continental teams`, prop: 'links', section: '1', redirects: '1' });
    const names = ((pl && pl.parse && pl.parse.links) || []).filter(l => l.ns === 0 && l.exists !== false && !NAT_BY_NAME[norm(l.title)] && !/^(\d{4}|uci|union|part )/i.test(l.title)).map(l => l.title);
    for (const title of names) {
      const page = await wikitext(title);
      const roster = page ? parseSquad(page.text) : [];
      if (roster.length < 10) { console.log(`  skip ProTeam ${title}: no roster found`); continue; }
      teams.push({ name: title.replace(/\s*\((cycling team|men's team)\)\s*$/i, ''), roster, updated: roster.updated, tier: 'PRO', autoInvite: invited.has(title) });
    }
    console.log(`Found ${teams.filter(t => t.tier === 'PRO').length} ProTeams (${teams.filter(t => t.autoInvite).length} with automatic invitations).`);
  }
  // Continental teams: squads from team articles, fetched 50 at a time. Only rosters marked as updated
  // since November of the previous year are used, so stale squads don't creep in.
  if (!args.includes('--no-continental')) {
    const cl = await api({ action: 'parse', page: `List of ${SEASON} UCI ProTeams and Continental teams`, prop: 'links', section: '2', redirects: '1' });
    const known = new Set(teams.map(t => t.name));
    const titles = ((cl && cl.parse && cl.parse.links) || []).filter(l => l.ns === 0 && l.exists !== false && !NAT_BY_NAME[norm(l.title)] && !/^(\d{4}|uci|union|list of)/i.test(l.title)).map(l => l.title);
    const since = Date.parse(`${SEASON - 1}-11-01`);
    let stale = 0, empty = 0;
    for (let i = 0; i < titles.length; i += 50) {
      const j = await api({ action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main', redirects: '1', titles: titles.slice(i, i + 50).join('|') });
      for (const p of (j && j.query && j.query.pages) || []) {
        const content = p.revisions && p.revisions[0] && (p.revisions[0].slots ? p.revisions[0].slots.main.content : p.revisions[0].content);
        if (!content || known.has(p.title)) continue;
        const roster = parseSquad(content);
        if (roster.length < 8) { empty++; continue; }
        if (!roster.updated || roster.updated < since) { stale++; continue; }
        // Continental squads are capped at 16; longer lists include past seasons further down the page
        const squad = roster.slice(0, 16);
        squad.updated = roster.updated;
        teams.push({ name: p.title.replace(/\s*\((cycling team|men's team|team|cycling)\)\s*$/i, ''), roster: squad, updated: roster.updated, tier: 'CT' });
      }
      process.stdout.write(`\r  continental team pages ${Math.min(titles.length, i + 50)}/${titles.length}`);
    }
    console.log(`\nFound ${teams.filter(t => t.tier === 'CT').length} Continental teams with ${SEASON} squads (skipped ${stale} outdated, ${empty} without a squad).`);
  }
  // a rider listed by two teams (a transfer one page hasn't caught up with) stays with the most recently updated roster
  const owner = new Map();
  for (const t of teams) for (const r of t.roster) {
    const cur = owner.get(r.title);
    if (!cur || (t.updated || 0) > (cur.updated || 0)) owner.set(r.title, t);
  }
  let dupes = 0;
  for (const t of teams) { const n = t.roster.length; t.roster = t.roster.filter(r => owner.get(r.title) === t); dupes += n - t.roster.length; }
  if (dupes) console.log(`Resolved ${dupes} riders listed by two teams.`);
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

  if (!teams.length) throw new Error('No team rosters could be read from Wikipedia; js/data-real.js was left unchanged.');
  // rider types typed by hand in the seed roster fill gaps where Wikipedia has no rider type
  const seedTypes = new Map();
  const seedFile = path.join(__dirname, 'real', `rosters-${SEASON}.txt`);
  if (fs.existsSync(seedFile)) for (const t of parseSeed(fs.readFileSync(seedFile, 'utf8'))) for (const r of t.riders) if (r.type) seedTypes.set(norm(r.name), r.type);
  const used = new Set();
  const out = [];
  let noBirth = 0, estimated = 0, tuned = 0;
  for (const t of teams) {
    const riders = [];
    for (const r of t.roster) {
      const inf = info.get(r.title) || (r.born ? { born: r.born, ridertype: '', role: '', wins: 0, page: r.title } : null);
      if (!inf) continue;
      if (/directeur|manager|coach|staff|owner/i.test(inf.role) && !/rider/i.test(inf.role)) continue;
      const display = r.display || inf.page.replace(/\s*\(.*\)\s*$/, '');
      const born = r.born || inf.born;
      const age = born ? SEASON - +born.slice(0, 4) : 27;
      if (age > 42 || age < 17) continue;
      if (!born) noBirth++;
      const ov = findOverride(overrides, display);
      const type = (ov && ov.type) || typeFrom(inf.ridertype) || (seedTypes.get(norm(display))) || 'rouleur';
      const level = ov && ov.level ? ov.level : Math.round((estimateLevel(display, age, inf.wins) - (t.tier === 'CT' ? 6 : t.tier === 'PRO' ? 1.5 : 0)) * 10) / 10;
      if (ov) tuned++; else estimated++;
      const parts = display.split(' ');
      riders.push({ name: display, first: parts[0], last: parts.slice(1).join(' ') || parts[0], nat: r.nat || 'UNK', born: born || `${SEASON - 27}-07-01`, type, level });
    }
    if (riders.length < (t.tier === 'CT' ? 8 : 15)) { console.log(`  skip ${t.name}: only ${riders.length} riders with cyclist pages`); continue; }
    out.push({ id: teamId(t.name, used), name: t.name, tier: t.tier || 'WT', autoInvite: !!t.autoInvite, ...teamStyle(t.name, riders), riders });
  }
  // prestige from squad strength
  const strength = t => { const l = t.riders.map(r => r.level).sort((a, b) => b - a).slice(0, 10); return l.reduce((a, b) => a + b, 0) / l.length; };
  const wt = out.filter(t => t.tier !== 'PRO').sort((a, b) => strength(b) - strength(a));
  wt.forEach((t, i) => { t.prestige = i < 3 ? 5 : i < 7 ? 4 : i < 11 ? 3 : i < 15 ? 2 : 1; });
  for (const t of out) if (t.tier === 'PRO') t.prestige = t.autoInvite ? 2 : 1; else if (t.tier === 'CT') t.prestige = 1;
  const tierOrder = { WT: 0, PRO: 1, CT: 2 };
  out.sort((a, b) => tierOrder[a.tier || 'WT'] - tierOrder[b.tier || 'WT'] || b.prestige - a.prestige || strength(b) - strength(a));

  const data = { season: SEASON, source: 'Wikipedia', built: new Date().toISOString().slice(0, 10), teams: out };
  fs.writeFileSync(OUT, `// Generated by tools/build-real-db.js on ${data.built} from English Wikipedia (CC BY-SA 4.0).\n` +
    `// Ratings are estimates. This file is ignored by git: keep it local.\nvar PCM = globalThis.PCM || (globalThis.PCM = {});\nPCM.REAL = ${JSON.stringify(data, null, 1)};\n`);
  const total = out.reduce((n, t) => n + t.riders.length, 0);
  console.log(`Wrote ${path.relative(ROOT, OUT)}: ${out.length} teams, ${total} riders (${tuned} hand-rated, ${estimated} estimated, ${noBirth} without birthdate).`);
  for (const t of out) console.log(`  ${t.id.padEnd(4)} ${t.name.padEnd(34)} ${String(t.riders.length).padStart(2)} riders  ★${t.prestige}  top: ${t.riders.slice().sort((a, b) => b.level - a.level).slice(0, 3).map(r => r.name).join(', ')}`);
}

module.exports = { parseSquad, parseTeamList, parseSeed, assemble, parseRoster, parseRider, flagCode, typeFrom, estimateLevel, sections, links, loadNations, norm };
if (require.main === module) main().catch(e => { console.error('\n' + e.message); process.exit(1); });
