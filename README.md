# PCM26 · Directeur Sportif

A pro cycling team management sim that runs entirely in the browser. No build step, no dependencies.

## Play

Open `index.html` in a browser, or serve the folder:

```sh
npm start   # http://localhost:8080
```

Progress is saved automatically in the browser's localStorage. Use **Game → Show save code** to move a career between devices.

## Real peloton (optional)

The game ships with a fictional world. To play with the real 2026 WorldTeam riders, build the roster yourself from Wikipedia (needs internet access to `en.wikipedia.org`):

```sh
npm run build:real
```

This writes `js/data-real.js`, which git ignores so real rider data never lands in this public repo. A **Real peloton** option then appears on the new-game screen, with real race names.

- Rosters, nationalities and birthdates come from Wikipedia's team season pages and rider articles.
- Ratings are estimates. About 150 well-known riders are hand-rated in `tools/real/ratings.csv`; everyone else is estimated from age and the major wins listed on their Wikipedia page. Edit the CSV and re-run to change them.
- Responses are cached in `tools/real/cache/`. Use `--refresh` to re-download, or `--season 2027` for another year.
- To choose teams yourself, list their Wikipedia article titles in `tools/real/teams.txt`, one per line.

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
| `test/sim.test.js` | Headless test that plays three full seasons |
| `tools/build-real-db.js` | Builds the optional real-peloton roster from Wikipedia |
| `test/real.test.js` | Tests the roster parsers and a season on a real-style database |

The engine files (`core`, `data`, `riders`, `race`, `game`) have no DOM access, so they run in Node for testing:

```sh
npm test        # add -- -v to print every race winner
```

All teams, races and riders are fictional.
