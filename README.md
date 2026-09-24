# PCM26 · Directeur Sportif

A pro cycling team management sim that runs entirely in the browser. No build step, no dependencies.

## Play

Open `index.html` in a browser, or serve the folder:

```sh
npm start   # http://localhost:8080
```

Progress is saved automatically in the browser's localStorage. Use **Game → Show save code** to move a career between devices.

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

The engine files (`core`, `data`, `riders`, `race`, `game`) have no DOM access, so they run in Node for testing:

```sh
npm test        # add -- -v to print every race winner
```

All teams, races and riders are fictional.
