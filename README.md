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
npm run build:real        # from tools/real/rosters-2026.txt (hand-written, no internet needed)
npm run build:real:wiki   # or download full rosters from Wikipedia (needs access to en.wikipedia.org)
```

This writes `js/data-real.js` (ignored by git). The **Real peloton** option then appears on the new-game screen and becomes the default.

- `tools/real/rosters-2026.txt` lists about 300 riders written from memory. Lesser-known riders and late transfers may be out of date: edit the file and rebuild. Squads with fewer than 24 riders are topped up with fictional neo-pros.
- Ratings are estimates. About 200 riders are hand-rated in `tools/real/ratings.csv`; the rest are estimated. Edit the CSV and rebuild to change them.
- Race routes and climb names are generated, not the real courses.

## What you do

- **Choose one of 18 fictional teams**, from a superteam to an underdog wildcard. Each team has its own budget, squad depth and board expectations.
- **Race a 25-event season**: spring Classics and cobbled Monuments, week-long stage races, and three 21-stage Grand Tours.
- **Pick 7–8 riders per race and give them roles**: leader, sprinter, domestique or free role. Domestiques pace their leader on climbs, lead-out men help sprinters, and free-role riders go for breakaways.
- **Play each stage**: set a team tactic (conservative, balanced, aggressive), then watch a live commentary of the stage on its elevation profile or skip straight to the result. Stage races have GC, points, mountains, youth and team classifications.
- **Manage form and fatigue**: set each rider's weekly training load and focus. Rotate riders so leaders arrive fresh for their goals.
- **Develop riders**: young riders grow towards their potential; veterans decline and eventually retire.
- **Run the business**: sponsor income, salaries and prize money. Sign free agents or buy riders from rival teams, renew contracts, release riders.
- **Keep the board happy**: meet three season objectives or risk the sack (you'll get offers from smaller teams if you're fired).
- **Build a dynasty**: seasons roll over with aging, retirements, new youth prospects, AI transfers and sponsor changes.

## Code layout

| File | Purpose |
| --- | --- |
| `js/core.js` | Seeded RNG and formatting helpers |
| `js/data.js` | Nations and name pools, teams, calendar, points tables |
| `js/riders.js` | Rider generation, ratings, salaries, training and aging |
| `js/race.js` | Course generation and the stage simulation engine |
| `js/game.js` | World generation, weekly loop, finances, transfers, board, season rollover, save/load |
| `js/ui.js` | All screens and event handling |
| `js/live.js` | Live stage playback |
| `js/saves.js` | Save slots (Claude account or browser), save files and codes |
| `test/sim.test.js` | Headless test that plays three full seasons |
| `tools/build-real-db.js` | Builds the optional real-peloton roster from Wikipedia |
| `test/real.test.js` | Tests the roster parsers and a season on a real-style database |

The engine files (`core`, `data`, `riders`, `race`, `game`) have no DOM access, so they run in Node for testing:

```sh
npm test        # add -- -v to print every race winner
```

All teams, races and riders are fictional.
