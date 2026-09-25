// Tests for the real-peloton pipeline: Wikipedia parsers (offline samples) and a season on a real-style database.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const B = require('../tools/build-real-db.js');

// ---- parsers ----
B.loadNations();
const season = `
==Team roster==
{| class="wikitable"
! Rider !! Date of birth
|-
| {{flagathlete|[[Anna Example]]|SLO}} || {{dts|1998|9|21}}
|-
| {{flagicon|BEL}} [[Bert Sample (cyclist)|Bert Sample]] || {{dts|2001|1|5}}
|-
| {{flagicon|Colombia}}
| [[Carl Placeholder]]
|}
==Season victories==
[[Some Race]]
`;
const roster = B.parseRoster(season);
assert.deepStrictEqual(roster.map(r => [r.title, r.nat]), [['Anna Example', 'SLO'], ['Bert Sample (cyclist)', 'BEL'], ['Carl Placeholder', 'COL']]);

const riderPage = `{{Infobox cyclist
| name = Anna Example
| birth_date = {{birth date and age|df=yes|1998|9|21}}
| ridertype = Climber, puncheur
| role = Rider
| majorwins =
;Grand Tours
:Tour de Example
::1 individual stage (2024)
;One-day races
:[[Example Classic]] (2023)<br>[[Other Classic]] (2025)
}}
'''Anna Example''' is a cyclist.`;
const info = B.parseRider(riderPage);
assert.strictEqual(info.born, '1998-09-21');
assert.strictEqual(B.typeFrom(info.ridertype), 'climber');
assert.ok(info.wins >= 3, 'counts major wins: ' + info.wins);
assert.strictEqual(B.parseRider('Just an article'), null);
assert.strictEqual(B.typeFrom('Sprinter'), 'sprinter');
assert.strictEqual(B.typeFrom('All-rounder'), 'gc');
assert.strictEqual(B.typeFrom('Classics specialist'), 'cobbles');
assert.ok(B.estimateLevel('X', 28, 20) > B.estimateLevel('X', 28, 0));
console.log('parsers OK');

// ---- game on a real-style database (placeholder names) ----
for (const f of ['core', 'data', 'riders', 'race', 'stagesim', 'game']) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8'), { filename: f + '.js' });
}
const { Game, Riders, DATA } = globalThis.PCM;
const types = ['gc', 'climber', 'sprinter', 'puncheur', 'cobbles', 'tt', 'rouleur'];
const nats = ['SLO', 'BEL', 'COL', 'LUX', 'MEX', 'KAZ'];
globalThis.PCM.REAL = {
  season: 2026, source: 'test fixture',
  teams: Array.from({ length: 18 }, (_, t) => ({
    id: 'T' + String(t).padStart(2, '0'), name: 'Fixture Team ' + t, nat: nats[t % nats.length], prestige: 1 + (t % 5), c1: '#123456', c2: '#ffffff',
    riders: Array.from({ length: t === 0 ? 12 : 27 }, (_, i) => ({
      name: `Rider ${t}-${i}`, first: 'Rider', last: `${t}-${i}`, nat: nats[(t + i) % nats.length],
      born: `${1990 + (i % 16)}-05-01`, type: types[i % types.length], level: i === 0 ? 93 : 66 + (i % 12),
    })),
  })),
};
assert.ok(Game.realAvailable());
const G = Game.newGame({ teamId: 'T03', world: 'real', seed: 5 });
assert.strictEqual(G.world, 'real');
assert.strictEqual(Object.keys(G.teams).length, 18);
assert.ok(G.teams.T00.riders.length >= 24, 'thin roster topped up');
const star = G.riders[G.teams.T01.riders[0]];
assert.strictEqual(Riders.fullName(star), 'Rider 1-0');
assert.ok(Math.abs(Riders.ovr(star) - 93) < 0.6, 'rating hits target level: ' + Riders.ovr(star));
assert.strictEqual(star.nat, 'BEL');
assert.ok(DATA.natFlag('LUX') !== '🏳️' && DATA.natName('KAZ') === 'Kazakhstan');
assert.ok(G.calendar.some(r => r.name === 'Tour de France'), 'real race names');

let guard = 0;
while (guard++ < 200) {
  const res = Game.advance(G);
  if (res.status === 'race') Game.autoRace(G, res.race);
  else if (res.status === 'season-end') break;
}
const sum = Game.endSeason(G);
assert.ok(star.pot >= Riders.ovr(star) - 0.01);
assert.ok(Math.max(...Object.values(star.a)) > 90, 'elite attributes survive the off-season');
console.log(`real world season OK: player rank ${sum.rank}, TdF won by ${G.honours.find(h => h.race === 'Tour de France')?.name}`);
