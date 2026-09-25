// Headless smoke test: plays full seasons with auto-selected rosters and checks invariants.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

for (const f of ['core', 'data', 'riders', 'race', 'stagesim', 'game']) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8'), { filename: f + '.js' });
}
const { Game, Riders, U } = globalThis.PCM;
const verbose = process.argv.includes('-v');

const G = Game.newGame({ teamId: 'MER', manager: 'Test', seed: 42 });
assert.strictEqual(Object.keys(G.teams).length, 18);
for (const t of Object.values(G.teams)) assert.ok(t.riders.length >= 25, 'roster size');

function playSeason() {
  let guard = 0;
  while (guard++ < 200) {
    const res = Game.advance(G);
    if (res.status === 'race') {
      Game.autoRace(G, res.race);
      if (verbose) {
        const w = G.riders[res.race.winner];
        const extra = res.race.kind === 'stage' ? ' | 2nd ' + U.gap(res.race.final.gc[1][1]) + ' 10th ' + U.gap(res.race.final.gc[9][1]) : '';
        console.log(`  wk${res.race.week} ${res.race.name.padEnd(28)} ${Riders.fullName(w)} (${Riders.specialty(w)}, ${Riders.ovr(w).toFixed(1)}) ${w.teamId}${extra}`);
      }
    } else if (res.status === 'season-end') {
      return Game.endSeason(G);
    }
  }
  throw new Error('season did not end');
}

for (let s = 0; s < 3; s++) {
  const year = G.year;
  const sum = playSeason();
  assert.ok(G.calendar.every(r => r.status === 'upcoming'), 'new calendar');
  const ranking = G.history[G.history.length - 1].ranking;
  console.log(`Season ${year}: player rank ${sum.rank}, confidence ${sum.confidence}, cash ${U.money(sum.cash)}, sponsor ${U.money(sum.sponsorNew)}`);
  console.log('  top teams:', ranking.slice(0, 5).map(x => `${x[0]} ${x[1]}pts/${x[2]}w`).join(', '));
  console.log('  top riders:', G.history[G.history.length - 1].topRiders.slice(0, 3).map(x => `${x[0]} ${x[2]}`).join(', '));
  for (const t of Object.values(G.teams)) {
    for (const id of t.riders) assert.strictEqual(G.riders[id].teamId, t.id, 'team membership consistent');
    if (t.id !== G.playerTeamId) assert.ok(t.riders.length >= 20 && t.riders.length <= 30, `AI roster ${t.id} ${t.riders.length}`);
  }
  for (const id of G.freeAgents) assert.strictEqual(G.riders[id].teamId, null);
  if (G.fired) Game.takeJob(G, Game.jobOffers(G)[0].id);
}

// save round trip
const str = Game.serialize(G);
const G2 = Game.deserialize(str);
assert.strictEqual(G2.year, G.year);
console.log('Save size: ' + Math.round(str.length / 1024) + ' KB');

// transfers
const fa = G.freeAgents.map(id => G.riders[id]).sort((a, b) => Riders.ovr(b) - Riders.ovr(a))[0];
const ask = Game.askingSalary(G, fa);
assert.ok(!Game.offer(G, fa.id, ask * 0.5, 2).ok, 'lowball rejected');
const res = Game.offer(G, fa.id, ask, 2);
console.log('Offer:', res.msg);
console.log('OK');
