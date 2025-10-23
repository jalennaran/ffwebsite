// scripts/scores.js
import { el as uiEl } from './ui.js';

const ESPN_SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';
const ESPN_SUMMARY = (id) =>
  `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${id}`;

/* ------------------------- DOM helper (null-safe) ------------------------- */
function elSafe(tag, attrs = {}, ...kids) {
  const clean = [];
  for (const k of kids) if (k !== null && k !== undefined && k !== false) clean.push(k);
  if (typeof uiEl === 'function') return uiEl(tag, attrs, ...clean);
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null) continue;
    if (k === 'class') n.className = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const c of clean) n.append(typeof c === 'string' ? document.createTextNode(c) : c);
  return n;
}
const el = elSafe;

/* ------------------------------- Utilities ------------------------------- */
const colorHex = (c) =>
  !c ? null : c.startsWith('#') ? c : /^[0-9a-fA-F]{3,6}$/.test(c) ? `#${c}` : null;

const fmtPre = (evt) => {
  try {
    return new Date(evt?.date).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  } catch { return 'Upcoming'; }
};
const fmtLive = (status) =>
  [status?.period ? `Q${status.period}` : '', status?.displayClock ?? ''].filter(Boolean).join(' ');
const fmtPost = (status) => status?.type?.shortDetail || 'Final';

const byStateRank = (evt) => {
  const s = evt.competitions?.[0]?.status?.type?.state || evt?.status?.type?.state;
  return s === 'in' ? 0 : s === 'pre' ? 1 : 2;
};

const badge = (text, cls = '') => el('span', { class: `pill ${cls}` }, text);
const possArrow = (side) =>
  el('span', { class: side === 'away' ? 'pos-arrow left' : 'pos-arrow right', title: 'Possession' });

function computeProgress(sit, possAbbr) {
  if (!sit) return null;
  const txt = (sit.yardLineText || sit?.yardLine?.text || sit?.ballSpot || '').toString();
  const m = txt.match(/\b([A-Z]{2,3})\s+(\d{1,2})\b/);
  if (!m) {
    const n = typeof sit.yardLine === 'number' ? sit.yardLine : null;
    return n == null ? null : Math.max(0, Math.min(100, n));
  }
  const side = m[1], n = parseInt(m[2], 10);
  if (!(n >= 1 && n <= 50)) return null;
  return side === possAbbr ? n : 100 - n;
}

/* ------------------------ Fantasy helpers (PPR) -------------------------- */
const _nk = s => String(s ?? '').toLowerCase().replace(/\s+/g,'');

// merge one stat group (Passing/Rushing/Receiving/Fumbles) into a running total
function addCounts(total, groupName, stats) {
  const g = _nk(groupName);
  if (!Array.isArray(stats)) return total;

  for (const s of stats) {
    const k = _nk(s?.name || s?.displayName || s?.shortDisplayName || s?.label);
    const raw = (typeof s?.value === 'number') ? s.value
      : parseFloat(String(s?.displayValue ?? '').replace(/[^0-9.\-]/g,''));
    const val = Number.isFinite(raw) ? raw : 0;

    if (g.includes('passing')) {
      if (k.includes('yards'))                          total.passYds += val;
      if (k.includes('touchdown') || k === 'td')        total.passTD  += val;
      if (k.includes('interception') || k === 'int')    total.int     += val;
    } else if (g.includes('rushing')) {
      if (k.includes('yards'))                          total.rushYds += val;
      if (k.includes('touchdown') || k === 'td')        total.rushTD  += val;
    } else if (g.includes('receiving')) {
      if (k.includes('reception') || k === 'rec')       total.rec     += val;
      if (k.includes('yards'))                          total.recYds  += val;
      if (k.includes('touchdown') || k === 'td')        total.recTD   += val;
    } else if (g.includes('fumble') || k.includes('fumbleslost') || (k.includes('fumble') && k.includes('lost'))) {
      total.fumLost += val;
    }
  }
  return total;
}

function pprFantasy(agg) {
  const pass = (agg.passYds || 0) * 0.04 + (agg.passTD || 0) * 4 + (agg.int || 0) * -2;
  const rush = (agg.rushYds || 0) * 0.1 + (agg.rushTD || 0) * 6;
  const recv = (agg.recYds || 0) * 0.1 + (agg.recTD || 0) * 6 + (agg.rec || 0) * 1;
  const misc = (agg.fumLost || 0) * -2;
  return +(pass + rush + recv + misc).toFixed(1);
}

function compactLine(c) {
  const parts = [];

  // --- Passing ---
  if (c.passYds || c.passTD || c.int) {
    const seg = [];
    if (c.passYds) seg.push(`${c.passYds} PYDS`);
    if (c.passTD) seg.push(`${c.passTD} PTD`);
    if (c.int) seg.push(`${c.int} INT`);
    parts.push(seg.join(", "));
  }

  // --- Rushing ---
  // Some ESPN stat groups include carries ("CAR" or "ATT") — we can add a field for it.
  if (c.rushAtt || c.rushYds || c.rushTD) {
    const seg = [];
    if (c.rushAtt) seg.push(`${c.rushAtt} CAR`);
    if (c.rushYds) seg.push(`${c.rushYds} RYDS`);
    if (c.rushTD) seg.push(`${c.rushTD} RTD`);
    parts.push(seg.join(", "));
  }

  // --- Receiving ---
  if (c.rec || c.recYds || c.recTD) {
    const seg = [];
    if (c.rec) seg.push(`${c.rec} REC`);
    if (c.recYds) seg.push(`${c.recYds} YDS`);
    if (c.recTD) seg.push(`${c.recTD} TD`);
    parts.push(seg.join(", "));
  }

  // Join all three segments together
  return parts.length ? parts.join(" • ") : "";
}


/* --------------- Team block (logo → info → score center) ---------------- */
function teamBlock(c, { side, hasBall } = { side: 'away', hasBall: false }) {
  const logo = c?.team?.logos?.[0]?.href || c?.team?.logo;
  const abbr = c?.team?.abbreviation || c?.team?.displayName || '—';
  const score = c?.score ?? '';
  const rec = c?.records?.[0]?.summary || '';
  return el('div', { class: `team-col ${side}` },
    el('div', { class: 'team-row' },
      el('div', { class: 'logo-wrap' },
        hasBall ? possArrow(side) : null,
        logo ? el('img', { class: 'logo', src: logo, alt: abbr, loading: 'lazy' }) : null
      ),
      el('div', { class: 'info' },
        el('div', { class: 'abbr' }, abbr),
        rec ? el('div', { class: 'record' }, rec) : null
      ),
      el('div', { class: 'big-score' }, score)
    )
  );
}

/* ------------------------------- Game card ------------------------------- */
function gameCard(evt) {
  const comp = evt.competitions?.[0];
  const stat = comp?.status || evt?.status;
  const teams = comp?.competitors || [];
  theHome: {
  }
  const home = teams.find((c) => c.homeAway === 'home') || teams[0];
  const away = teams.find((c) => c.homeAway === 'away') || teams[1];

  const state = stat?.type?.state;
  const live = state === 'in';
  const post = state === 'post';

  const homeC = colorHex(home?.team?.color) || '#222';
  const awayC = colorHex(away?.team?.color) || '#222';

  const statusLine = live ? fmtLive(stat) : post ? fmtPost(stat) : fmtPre(evt);
  const bNames = comp?.broadcasts?.flatMap((b) => b?.names || [])?.filter(Boolean) || [];

  const sit = comp?.situation;
  const possAbbr = sit?.possession;
  const awayHasBall = live && possAbbr && away?.team?.abbreviation === possAbbr;
  const homeHasBall = live && possAbbr && home?.team?.abbreviation === possAbbr;
  const prog = live ? computeProgress(sit, possAbbr) : null;
  const isRZ = !!sit?.isRedZone;

  const card = el('article',
    { class: `score-card ${live ? 'live' : post ? 'final' : 'pre'}`, style: `--home:${homeC};--away:${awayC}` },
    el('div', { class: 'score-grid' },
      teamBlock(away, { side: 'away', hasBall: !!awayHasBall }),
      el('div', { class: 'center-col' },
        live ? badge('LIVE', 'live') : post ? badge('FINAL', 'final') : badge('UPCOMING', 'pre'),
        el('div', { class: 'status' }, statusLine),
        sit?.downDistanceText ? el('div', { class: 'chips one' }, el('span', { class: 'chip' }, sit.downDistanceText)) : null,
        bNames.length ? el('div', { class: 'chips tv-inside' }, ...bNames.map((n) => el('span', { class: 'chip' }, n))) : null
      ),
      teamBlock(home, { side: 'home', hasBall: !!homeHasBall })
    ),
    live && prog != null
      ? el('div', { class: `drivebar ${isRZ ? 'rz' : ''}` },
          el('div', { class: 'drivebar-fill', style: `width:${Math.max(0, Math.min(100, prog))}%;` }))
      : null
  );

  // Click to expand/collapse details
  card.addEventListener('click', async (e) => {
    if (e.target.closest('a')) return;
    const open = card.classList.toggle('expanded');
    let det = card.querySelector('.details');
    if (open && !det) {
      det = el('div', { class: 'details' }, el('div', { class: 'loading' }, 'Loading details...'));
      card.appendChild(det);
      try {
        const built = await buildDetails(evt);
        det.replaceWith(built);
      } catch (err) {
        det.textContent = 'Could not load game details.';
        console.error(err);
      }
    }
  });

  return card;
}


/* --------------------------- Details (expanded) -------------------------- */
async function buildDetails(evt) {
  const comp = evt.competitions?.[0];
  const eventId = evt?.id || comp?.id;

  // Linescore from scoreboard payload
  const lines = (comp?.competitors || []).map(c => ({
    teamAbbr:  c?.team?.abbreviation || '',
    teamShort: c?.team?.shortDisplayName || c?.team?.name || '',
    periods:   (c?.linescores || []).map(ls => ls?.value ?? 0),
    total:     Number(c?.score ?? 0),
  }));

  // Helper: safe fantasy calc (use your global if present)
  const calcFantasy =
    (typeof pprFantasy === "function")
      ? pprFantasy
      : (c) =>
          (c.passYds/25) + (c.passTD*4) - (c.int*2) +
          (c.rushYds/10) + (c.rushTD*6) +
          (c.rec*1) + (c.recYds/10) + (c.recTD*6) -
          (c.fumLost*2);

  // Robust number parser (handles "19/31", "--", "1", "1.0")
  const toNum = (v) => {
    if (v == null) return 0;
    const s = String(v).trim();
    if (!s || s === "--") return 0;
    // pick the last numeric chunk (e.g., "19/31" -> "31" if we ever used it; we mostly read YDS/TD/INT directly)
    const m = s.match(/-?\d+(\.\d+)?/g);
    return m ? Number(m[m.length - 1]) : 0;
  };

  // Map label text to a normalized key
  const norm = (label="") => label.toLowerCase().replace(/\s+/g, "");

  // Pull top performers from summary endpoint
  const topByTeam = new Map();
  try {
    const res = await fetch(ESPN_SUMMARY(eventId));
    if (res.ok) {
      const sum = await res.json();

      for (const side of (sum?.boxscore?.players || [])) {
        const teamAbbr =
          side?.team?.abbreviation ||
          side?.team?.shortDisplayName ||
          "Team";

        // aggregate stats per athlete across all groups
        const aggByAthlete = new Map();

        for (const group of (side?.statistics || [])) {
          const groupName = (group?.name || "").toLowerCase(); // "passing","rushing","receiving","fumbles" etc.
          const labels = (group?.labels || []).map(String);

          for (const a of (group?.athletes || [])) {
            const who = a?.athlete;
            const id  = who?.id || who?.uid || who?.displayName;
            if (!id) continue;

            // build labels->value map for this athlete in this group
            const vals = (a?.stats || []);
            const L = Math.min(labels.length, vals.length);
            const kv = {};
            for (let i = 0; i < L; i++) {
              kv[norm(labels[i])] = vals[i];
            }

            // ensure entry exists
            const entry = aggByAthlete.get(id) || {
              who,
              count: {
                passYds: 0, passTD: 0, int: 0,
                rushYds: 0, rushTD: 0,
                rec: 0,   recYds: 0,  recTD: 0,
                fumLost: 0
              }
            };

            // translate per group
            if (groupName.includes("passing")) {
              entry.count.passYds += toNum(kv["yds"]);
              entry.count.passTD  += toNum(kv["td"]);
              entry.count.int     += toNum(kv["int"]);
            } else if (groupName.includes("rushing")) {
              entry.count.rushAtt += toNum(kv["car"]) || toNum(kv["att"]);
              entry.count.rushYds += toNum(kv["yds"]);
              entry.count.rushTD  += toNum(kv["td"]);
            } else if (groupName.includes("receiving")) {
              // labels are often "REC","YDS","TD","LG","TGTS"
              entry.count.rec    += toNum(kv["rec"]);
              entry.count.recYds += toNum(kv["yds"]);
              entry.count.recTD  += toNum(kv["td"]);
            } else if (groupName.includes("fumbles")) {
              // sometimes labels include "LOST"
              entry.count.fumLost += toNum(kv["lost"]);
            }
            // (ignore other groups)

            aggByAthlete.set(id, entry);
          }
        }

        // Build list with fantasy points
        const list = [];
        for (const { who, count } of aggByAthlete.values()) {
          list.push({
            name: who?.displayName || "Player",
            pos:  who?.position?.abbreviation || "",
            pts:  Number(calcFantasy(count).toFixed(1)),
            line: (typeof compactLine === "function") ? compactLine(count) : ""
          });
        }

        list.sort((x, y) => y.pts - x.pts);
        topByTeam.set(teamAbbr, list.slice(0, 3));
      }
    }
  } catch (e) {
    console.warn("summary fetch failed", e);
  }

  // Identify away/home for columns
  const teams = comp?.competitors || [];
  const away = teams.find(c => c.homeAway === 'away');
  const home = teams.find(c => c.homeAway === 'home');
  const awayAbbr = away?.team?.abbreviation || '';
  const homeAbbr = home?.team?.abbreviation || '';

  if (!topByTeam.size) {
    topByTeam.set(awayAbbr, [{ name:'No stats yet', pos:'', pts:0, line:'' }]);
    topByTeam.set(homeAbbr, [{ name:'No stats yet', pos:'', pts:0, line:'' }]);
  }

  // 3-column grid: Away Top | Linescore (center) | Home Top
  return el('div', { class: 'details details-grid' },
    renderTopList('away', awayAbbr, topByTeam.get(awayAbbr) || []),
    renderLinescore(lines),
    renderTopList('home', homeAbbr, topByTeam.get(homeAbbr) || []),
  );
}

function renderTopList(side, abbr, list) {
  return el('div', { class: `toplist ${side}` },
    el('div', { class: 'toplist-title' }, `${abbr} Top Fantasy`),
    ...list.map(p =>
      el('div', { class: 'toplist-row' },
        el('span', { class: 'name' }, p.name),
        el('span', { class: 'pts'  }, String(p.pts)),
        p.line ? el('div', { class: 'line' }, p.line) : null
      )
    )
  );
}


function renderLinescore(lines) {
  const header = el('div', { class: 'ls-row head' },
    el('span', { class: 'ls-cell team' }, 'Team'),
    ...Array.from({ length: 4 }, (_, i) => el('span', { class: 'ls-cell' }, String(i + 1))),
    el('span', { class: 'ls-cell total' }, 'T')
  );
  const rows = lines.map((l) =>
    el('div', { class: 'ls-row' },
      el('span', { class: 'ls-cell team' }, l.teamShort || l.teamAbbr),
      ...Array.from({ length: 4 }, (_, i) => el('span', { class: 'ls-cell' }, String(l.periods[i] ?? 0))),
      el('span', { class: 'ls-cell total' }, String(l.total ?? 0))
    )
  );
  return el('div', { class: 'linescore' }, header, ...rows);
}

/* ------------------------- fetch + render loop --------------------------- */
async function fetchScoreboard(params = {}) {
  const url = new URL(ESPN_SCOREBOARD);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { mode: 'cors' });
  if (!res.ok) throw new Error(`Scoreboard fetch failed: ${res.status}`);
  return res.json();
}

export default async function loadScores({ params = {}, pollMs = 20000 } = {}) {
  const root = document.getElementById('nfl-scoreboard-root');
  if (!root) return;

  const renderOnce = async () => {
    try {
      root.textContent = 'Loading NFL scores...';

      const data = await fetchScoreboard(params);
      const events = (data?.events || []).slice().sort((a, b) => byStateRank(a) - byStateRank(b));

      root.textContent = '';
      if (!events.length) {
        root.appendChild(el('div', { class: 'empty' }, 'No games found.'));
        return;
      }

      const frag = document.createDocumentFragment();
      let lastState = null;

      for (const evt of events) {
        const state = evt.competitions?.[0]?.status?.type?.state ?? 'pre';
        if (state !== lastState) {
          const label = state === 'in' ? 'Live' : state === 'post' ? 'Final' : 'Upcoming';
          frag.appendChild(el('h3', { class: 'sb-section' }, label));
          lastState = state;
        }
        frag.appendChild(gameCard(evt));
      }

      root.appendChild(frag);
    } catch (e) {
      root.textContent = 'Could not load scores.';
      console.error(e);
    }
  };

  await renderOnce();

  let timer = window.setTimeout(async function tick() {
    await renderOnce();
    timer = window.setTimeout(tick, pollMs);
  }, pollMs);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && timer) { clearTimeout(timer); timer = null; }
    else if (!document.hidden && !timer) {
      timer = window.setTimeout(async function tick() {
        await renderOnce();
        timer = window.setTimeout(tick, pollMs);
      }, pollMs);
    }
  });
}
