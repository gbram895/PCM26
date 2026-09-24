// Live stage playback: animates a pre-computed stage result along the course profile with commentary.
var PCM = globalThis.PCM || (globalThis.PCM = {});

PCM.Live = (function () {
  const { U, Riders } = PCM;
  const BASE_MS = 18000;
  let st = null; // { sr, progress, speed, raf, last, events, shown, ... }

  function buildEvents(G, race, stage, sr) {
    const evs = [{ km: 0, kind: 'start', rids: [] }].concat(sr.events || []);
    if (stage.type === 'flat' && !(sr.brk && sr.brk.success)) evs.push({ km: Math.max(1, stage.km - 3), kind: 'sprint', rids: [] });
    evs.push({ km: stage.km, kind: 'finish', rids: sr.results.slice(0, 3).map(x => x[0]) });
    evs.sort((a, b) => a.km - b.km);
    const mine = new Set(G.teams[G.playerTeamId].riders);
    return evs.map(ev => ({ ...ev, mine: (ev.rids || []).some(id => mine.has(id)) }));
  }

  function gapAt(sr, stage, km, maxGap) {
    const b = sr.brk;
    if (!b || km < b.formKm) return null;
    if (!b.success && km >= b.catchKm) return null;
    const peakKm = Math.max(stage.km * 0.45, b.formKm + 5);
    const endKm = b.success ? stage.km : b.catchKm;
    if (km <= peakKm) return maxGap * (km - b.formKm) / Math.max(1, peakKm - b.formKm);
    const endGap = b.success ? b.gap : 0;
    return maxGap + (endGap - maxGap) * (km - peakKm) / Math.max(1, endKm - peakKm);
  }

  function marker(cls, label, x, y, below) {
    const anchor = x > 900 ? 'end' : x < 100 ? 'start' : 'middle';
    return `<g class="marker ${cls}" transform="translate(${x.toFixed(1)},${y.toFixed(1)})"><circle r="7"/><text y="${below ? 24 : -12}" text-anchor="${anchor}">${label}</text></g>`;
  }

  function draw() {
    const { G, race, stage, sr, geom, el } = st;
    const km = st.progress * stage.km;
    const gap = gapAt(sr, stage, km, st.maxGap);
    let html = '';
    const pelLabel = stage.type === 'itt' ? 'On course' : (stage.type === 'mountain' && km > stage.km * 0.8) ? 'Favourites' : 'Peloton';
    if (gap !== null && sr.brk) {
      const bk = Math.min(stage.km, km + gap / 3600 * 42);
      html += marker('m-brk', `Break (${sr.brk.rids.length})`, geom.xkm(bk), geom.ykm(bk));
    }
    html += marker('m-pel', pelLabel, geom.xkm(km), geom.ykm(km), gap !== null);
    el.markers.innerHTML = html;
    el.togo.textContent = Math.max(0, stage.km - km).toFixed(1) + ' km';
    el.gap.textContent = gap !== null ? U.gap(gap) : (sr.brk && !sr.brk.success && km >= sr.brk.catchKm ? 'Caught' : '–');
    el.time.textContent = U.time(st.progress * sr.T0);

    while (st.shown < st.events.length && st.events[st.shown].km <= km + 0.001) {
      const ev = st.events[st.shown++];
      const div = document.createElement('div');
      div.className = 'ev' + (ev.mine ? ' mine' : '');
      div.innerHTML = `<span class="km">${ev.kind === 'finish' ? 'Finish' : 'km ' + Math.round(ev.km)}</span><span>${PCM.UI.evText(ev, race, stage)}</span>`;
      el.feed.prepend(div);
    }
    if (st.progress >= 1) {
      el.done.hidden = false;
      if (!st.finished) { st.finished = true; st.onDone && st.onDone(); }
    }
  }

  function frame(ts) {
    if (!st) return;
    if (st.last == null) st.last = ts;
    const dt = ts - st.last;
    st.last = ts;
    st.progress = Math.min(1, st.progress + dt * st.speed / BASE_MS);
    draw();
    if (st.progress < 1) st.raf = requestAnimationFrame(frame);
  }

  function start(container, { G, race, stage, sr, onDone }) {
    if (!container) return;
    const resume = st && st.sr === sr;
    const prev = resume ? st : null;
    if (st && st.raf) cancelAnimationFrame(st.raf);
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    st = {
      G, race, stage, sr, onDone,
      geom: PCM.UI.profileGeom(stage),
      events: buildEvents(G, race, stage, sr),
      progress: prev ? prev.progress : 0,
      speed: prev ? prev.speed : (reduced ? 8 : 1),
      shown: 0, last: null, finished: prev ? prev.finished : false,
      maxGap: sr.brk ? (sr.brk.success ? Math.max(sr.brk.gap * 1.5, 180) : 120 + (sr.n * 53 % 240)) : 0,
      el: {
        markers: container.querySelector('#markers'), togo: container.querySelector('#lv-togo'), gap: container.querySelector('#lv-gap'),
        time: container.querySelector('#lv-time'), feed: container.querySelector('#lv-feed'), done: container.querySelector('#lv-done'),
      },
    };
    draw();
    if (st.progress < 1) st.raf = requestAnimationFrame(frame);
  }

  // pause drawing but keep progress so a re-render can resume
  function stop() { if (st && st.raf) { cancelAnimationFrame(st.raf); st.raf = null; } if (st) st.last = null; }
  function speed(s) { if (st) st.speed = s; }
  function skip() { if (st) { st.progress = 1; draw(); } }

  return { start, stop, speed, skip };
})();
