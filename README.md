# PCM26 · Directeur Sportif

A pro cycling team management sim that runs entirely in the browser. No build step, no dependencies.

## Play

Open `index.html` in a browser, or serve the folder:

```sh
npm start   # http://localhost:8080
```

### Saving

You don't need to do anything: the game saves after every action and reopens straight into your career.

- On the published claude.ai page, saves live in your Claude account, so you can carry on from any device. Run from local files, they live in that browser.
- The top bar shows **✓ Saved** or **Saving…**. Click it (or press Ctrl/Cmd+S) to save immediately.
- Starting a new career keeps the old one in a save slot. Extra slots, save files and save codes are under **Game → More save options**.

## Real peloton

The game also has a real world: the 18 WorldTeams of 2026 with real race names. Build its roster with:

```sh
npm run build:real        # from tools/real/rosters-2026.txt (no internet needed)
npm run build:real:wiki   # or download full rosters from Wikipedia (needs access to en.wikipedia.org)
```

This writes `js/data-real.js` (ignored by git). The **Real peloton** option then appears on the new-game screen and becomes the default.

- `tools/real/rosters-2026.txt` holds the 18 WorldTeams, 16 ProTeams and 14 Continental teams (about 1,080 riders) from Wikipedia (CC BY-SA 4.0), with nationality, birth year and rider type. Edit it to add mid-season transfers, then rebuild.
- Continental teams don't ride WorldTour races and can't be managed; they're a pool of young talent on the transfer market (filter by **Team level**). Only Continental teams whose Wikipedia squad was updated for the season are included, since most of those articles are years out of date.
- ProTeams only ride races they're invited to. The top three ProTeams (Cofidis, Pinarello–Q36.5 and Tudor in 2026, then the best three by points each season) are invited everywhere; the rest get wildcards that favour races in their home country.
- Ratings are estimates. About 200 riders are hand-rated in `tools/real/ratings.csv`; the rest are estimated. Edit the CSV and rebuild to change them.
- Race routes and climb names are generated, not the real courses.

## What you do

- **Choose a team:** WorldTeams or ProTeams (real 2026 peloton, or a fictional world).
- **Riders with PCM-style stats:** flat, mountain, medium mountain, hills, time trial, prologue, cobbles, sprint, acceleration, downhill, endurance, resistance, recovery and breakaway.
- **Plan the season** on the Planning page: a race programme per rider, target races where form peaks, training camps (altitude, sprint, TT, cobbles recon, team building), and the board's objective for every race.
- **Race live, kilometre by kilometre:** each rider has an energy tank and an effort level. Give orders (Auto, Follow, Tempo, Sit on, Protect leader, Lead-out), launch attacks, hand out bottles, use team orders (Chase, Tempo for leader, Protect leader, Lead-out train), and watch groups, gaps and race radio. Pause, play at ½× to 10×, or skip.
- **Run the club:** hire and release staff (directeurs sportifs, coaches, doctors, scouts), send scouts on missions to discover prospects, grow a youth academy, pick a sponsor deal each season, upgrade road and TT bikes, and negotiate contracts (salary, length, signing bonus, promised role).
- **Keep the board happy** across seasons: rider development and aging, retirements, transfers, and invitations for ProTeams.

## Code layout

| File | Purpose |
| --- | --- |
| `js/core.js` | Seeded RNG and formatting helpers |
| `js/data.js` | Nations and name pools, teams, calendar, points tables |
| `js/riders.js` | Rider generation, ratings, salaries, training and aging |
| `js/race.js` | Course generation, time trials and stage bookkeeping (GC, points, mountains) |
| `js/stagesim.js` | Kilometre-by-kilometre road-stage engine: groups, energy, attacks, chases, rider orders |
| `js/game.js` | World generation, weekly loop, finances, transfers, board, season rollover, save/load |
| `js/ui.js` | All screens and event handling |
| `js/live.js` | Live stage screen: speed, pause, orders, energy bars, groups and race radio |
| `js/management.js` | Staff, scouting missions, youth academy, sponsor deals, equipment, contract negotiation |
| `js/saves.js` | Save slots (Claude account or browser), save files and codes |
| `test/sim.test.js` | Headless test that plays three full seasons |
| `tools/build-real-db.js` | Builds the optional real-peloton roster from Wikipedia |
| `test/real.test.js` | Tests the roster parsers and a season on a real-style database |

The engine files (`core`, `data`, `riders`, `race`, `game`) have no DOM access, so they run in Node for testing:

```sh
npm test        # add -- -v to print every race winner
```

All teams, races and riders are fictional.
