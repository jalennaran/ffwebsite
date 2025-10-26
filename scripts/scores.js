// scripts/scores.js
import { el as uiEl } from './ui.js';

const ESPN_SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';
const ESPN_SUMMARY = (id) =>
  `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${id}`;

/* ----------------------- Skeleton Loaders ----------------------- */

// Popular NFL team colors for skeleton loading
const TEAM_COLORS = [
  ['#D50A0A', '#FFB612'], // Chiefs, 49ers
  ['#0080C6', '#FFB81C'], // Chargers, Rams
  ['#002244', '#869397'], // Patriots, Eagles
  ['#FB4F14', '#000000'], // Bengals, Bears
  ['#004C54', '#008E97'], // Jaguars, Dolphins
  ['#241773', '#FFB612'], // Vikings, Ravens
  ['#A5ACAF', '#000000'], // Raiders, Cowboys
  ['#002244', '#69BE28'], // Seahawks, Packers
  ['#773141', '#FFB612'], // Washington, Saints
  ['#0076B6', '#002244'], // Lions, Colts
  ['#D3BC8D', '#101820'], // 49ers, Falcons
  ['#002244', '#C60C30'], // Texans, Cardinals
];

function getRandomTeamColors() {
  return TEAM_COLORS[Math.floor(Math.random() * TEAM_COLORS.length)];
}

function createSkeletonScoreCard() {
  const [awayColor, homeColor] = getRandomTeamColors();
  
  const card = el('div', { 
    class: 'skeleton-score-card',
    style: `--away:${awayColor};--home:${homeColor}`
  });
  
  const grid = el('div', { class: 'skeleton-score-grid' },
    // Away team
    el('div', { class: 'skeleton-team-col away' },
      el('div', { class: 'skeleton-team-row' },
        el('div', {}, el('div', { class: 'skeleton skeleton-logo' })),
        el('div', { class: 'skeleton-team-info' },
          el('div', { class: 'skeleton skeleton-abbr' }),
          el('div', { class: 'skeleton skeleton-record' })
        ),
        el('div', { class: 'skeleton skeleton-score' })
      )
    ),
    // Center column
    el('div', { class: 'skeleton-center-col' },
      el('div', { class: 'skeleton skeleton-pill' }),
      el('div', { class: 'skeleton skeleton-status' })
    ),
    // Home team
    el('div', { class: 'skeleton-team-col home' },
      el('div', { class: 'skeleton-team-row' },
        el('div', {}, el('div', { class: 'skeleton skeleton-logo' })),
        el('div', { class: 'skeleton-team-info' },
          el('div', { class: 'skeleton skeleton-abbr' }),
          el('div', { class: 'skeleton skeleton-record' })
        ),
        el('div', { class: 'skeleton skeleton-score' })
      )
    )
  );
  
  card.appendChild(grid);
  return card;
}

function createSkeletonScoreboards() {
  const fragment = document.createDocumentFragment();
  
  // Create section headers and skeleton cards
  const sections = [
    { title: 'Live', count: 2 },
    { title: 'Upcoming', count: 8 },
    { title: 'Final', count: 4 }
  ];
  
  sections.forEach(({ title, count }) => {
    fragment.appendChild(el('h3', { class: 'sb-section' }, title));
    for (let i = 0; i < count; i++) {
      fragment.appendChild(createSkeletonScoreCard());
    }
  });
  
  return fragment;
}

function createExpandedDetailsSkeleton(awayColor, homeColor) {
  const details = el('div', { class: 'details details-grid' });
  
  // Away top performers
  const awayTop = el('div', { class: 'toplist away' },
    el('div', { class: 'toplist-title' }, el('div', { class: 'skeleton', style: 'height: 16px; width: 150px; margin-bottom: 8px;' }))
  );
  for (let i = 0; i < 3; i++) {
    awayTop.appendChild(
      el('div', { class: 'toplist-row' },
        el('div', { class: 'skeleton', style: 'height: 16px; width: 120px;' }),
        el('div', { class: 'skeleton', style: 'height: 16px; width: 40px;' }),
        el('div', { class: 'skeleton', style: 'height: 14px; width: 100%; margin-top: 4px;' })
      )
    );
  }
  
  // Linescore (center)
  const linescore = el('div', { class: 'linescore' });
  // Header row
  linescore.appendChild(
    el('div', { class: 'ls-row head' },
      el('span', { class: 'ls-cell team' }, el('div', { class: 'skeleton', style: 'height: 14px; width: 60px;' })),
      ...Array.from({ length: 4 }, () => el('span', { class: 'ls-cell' }, el('div', { class: 'skeleton', style: 'height: 14px; width: 20px; margin: 0 auto;' }))),
      el('span', { class: 'ls-cell total' }, el('div', { class: 'skeleton', style: 'height: 14px; width: 20px; margin: 0 auto;' }))
    )
  );
  // Team rows
  for (let i = 0; i < 2; i++) {
    linescore.appendChild(
      el('div', { class: 'ls-row' },
        el('span', { class: 'ls-cell team' }, el('div', { class: 'skeleton', style: 'height: 16px; width: 70px;' })),
        ...Array.from({ length: 4 }, () => el('span', { class: 'ls-cell' }, el('div', { class: 'skeleton', style: 'height: 16px; width: 20px; margin: 0 auto;' }))),
        el('span', { class: 'ls-cell total' }, el('div', { class: 'skeleton', style: 'height: 16px; width: 20px; margin: 0 auto;' }))
      )
    );
  }
  
  // Home top performers
  const homeTop = el('div', { class: 'toplist home' },
    el('div', { class: 'toplist-title' }, el('div', { class: 'skeleton', style: 'height: 16px; width: 150px; margin-bottom: 8px; margin-left: auto;' }))
  );
  for (let i = 0; i < 3; i++) {
    homeTop.appendChild(
      el('div', { class: 'toplist-row' },
        el('div', { class: 'skeleton', style: 'height: 16px; width: 120px;' }),
        el('div', { class: 'skeleton', style: 'height: 16px; width: 40px;' }),
        el('div', { class: 'skeleton', style: 'height: 14px; width: 100%; margin-top: 4px;' })
      )
    );
  }
  
  details.appendChild(awayTop);
  details.appendChild(linescore);
  details.appendChild(homeTop);
  
  return details;
}

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

/* ----------------------- Drive Info Pill ----------------------- */

function createDriveInfoPill(comp, isLive) {
  if (!comp || !isLive) return null;
  
  const drives = comp?.drives;
  if (!drives || !drives.current) return null;
  
  const currentDrive = drives.current;
  
  // Extract drive information
  const playCount = currentDrive?.plays || 0;
  const yards = currentDrive?.yards || 0;
  const timeElapsed = currentDrive?.timeElapsed?.displayValue || currentDrive?.displayValue;
  
  // Get current down and distance
  const sit = comp?.situation;
  const downDistance = sit?.downDistanceText || sit?.shortDownDistanceText;
  const yardLine = sit?.yardLineText || sit?.possessionText;
  
  // Build drive description
  const parts = [];
  
  if (playCount > 0) {
    parts.push(`${playCount}-play`);
  }
  
  if (yards !== 0) {
    parts.push(`${yards} yds`);
  }
  
  if (timeElapsed) {
    parts.push(timeElapsed);
  }
  
  // Add down & distance and field position
  if (downDistance || yardLine) {
    const position = [downDistance, yardLine].filter(Boolean).join(' at ');
    if (position) {
      parts.push(position);
    }
  }
  
  if (parts.length === 0) return null;
  
  const driveText = parts.join(' – ');
  
  return el('div', { class: 'drive-info-pill' }, driveText);
}

/* ----------------------- Football Field Visualization ----------------------- */

function createFootballField(comp, homeColor, awayColor, gameState) {
  if (!comp) return null;
  
  const teams = comp?.competitors || [];
  const home = teams.find(c => c.homeAway === 'home');
  const away = teams.find(c => c.homeAway === 'away');
  
  const homeLogo = home?.team?.logos?.[0]?.href || home?.team?.logo;
  const awayLogo = away?.team?.logos?.[0]?.href || away?.team?.logo;
  const homeAbbr = home?.team?.abbreviation;
  const awayAbbr = away?.team?.abbreviation;
  
  const sit = comp?.situation;
  const stat = comp?.status;
  const state = gameState || stat?.type?.state;
  
  // Show field for pre-game and live games, but not for final games
  if (state === 'post') return null;
  
  // Create field container
  const field = el('div', { 
    class: 'football-field',
    style: `--home-alpha: ${homeColor}40; --away-alpha: ${awayColor}40; --drive-color: ${homeColor};`
  });
  
  const fieldContainer = el('div', { class: 'field-container' });
  
  // Add end zones with team logos
  const homeEndzone = el('div', { class: 'home-endzone' },
    homeLogo ? el('img', { class: 'endzone-logo', src: homeLogo, alt: homeAbbr }) : null
  );
  
  const awayEndzone = el('div', { class: 'away-endzone' },
    awayLogo ? el('img', { class: 'endzone-logo', src: awayLogo, alt: awayAbbr }) : null
  );
  
  fieldContainer.appendChild(homeEndzone);
  fieldContainer.appendChild(awayEndzone);
  
  // Add yard line labels
  const yardLabels = el('div', { class: 'yard-labels' },
    el('span', {}, homeAbbr || 'HOME'),
    el('span', {}, '50'),
    el('span', {}, awayAbbr || 'AWAY')
  );
  
  // If game is live, add ball position and drive progress
  if (state === 'in' && sit) {
    const possAbbr = sit?.possession;
    
    // Parse yard line (e.g., "MIA 35", "ATL 50")
    const yardLineText = sit?.yardLineText || sit?.yardLine?.text || '';
    const yardMatch = yardLineText.match(/\b([A-Z]{2,3})\s+(\d{1,2})\b/);
    
    if (yardMatch) {
      const [, yardTeam, yardNum] = yardMatch;
      const yardLine = parseInt(yardNum, 10);
      
      // Determine which team's territory (home is left, away is right)
      const isHomeTerritory = yardTeam === homeAbbr;
      
      // Calculate ball position (0-100, where 0 is home endzone, 100 is away endzone)
      let ballPosition;
      if (isHomeTerritory) {
        ballPosition = yardLine; // Home 25 = position 25
      } else {
        ballPosition = 100 - yardLine; // Away 25 = position 75
      }
      
      // Determine possession and drive color
      let driveColor = homeColor;
      if (possAbbr === awayAbbr) {
        driveColor = awayColor;
      }
      
      field.style.setProperty('--drive-color', driveColor);
      
      // Add drive progress bar
      let driveProgressEl = null;
      const isPossHome = possAbbr === homeAbbr;
      
      if (isPossHome) {
        // Home driving towards away (left to right)
        driveProgressEl = el('div', {
          class: 'drive-progress',
          style: `left: 10%; width: ${ballPosition - 10}%;`
        });
      } else {
        // Away driving towards home (right to left)
        driveProgressEl = el('div', {
          class: 'drive-progress',
          style: `right: 10%; width: ${100 - ballPosition - 10}%;`
        });
      }
      
      // Add ball marker
      const ballMarker = el('div', {
        class: 'ball-marker',
        style: `left: ${ballPosition}%;`
      });
      
      // Add possession indicator
      const possessionLabel = el('div', {
        class: 'possession-team',
        style: `left: ${ballPosition}%;`
      }, possAbbr || '');
      
      ballMarker.appendChild(possessionLabel);
      
      if (driveProgressEl) fieldContainer.appendChild(driveProgressEl);
      fieldContainer.appendChild(ballMarker);
      
      // Add field info
      const fieldInfo = el('div', { class: 'field-info' });
      if (sit?.downDistanceText) {
        fieldInfo.appendChild(el('div', { class: 'field-info-item' }, sit.downDistanceText));
      }
      if (sit?.possessionText) {
        fieldInfo.appendChild(el('div', { class: 'field-info-item' }, sit.possessionText));
      }
      
      field.appendChild(fieldContainer);
      field.appendChild(yardLabels);
      if (fieldInfo.children.length) field.appendChild(fieldInfo);
      
      return field;
    }
  }
  
  // For pre-game, just show empty field with end zones
  field.appendChild(fieldContainer);
  field.appendChild(yardLabels);
  
  return field;
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
        logo ? el('img', { class: 'logo', src: logo, alt: abbr, loading: 'lazy' }) : null
      ),
      el('div', { class: 'info' },
        el('div', { class: 'abbr' }, hasBall ? `🏈 ${abbr}` : abbr),
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

  const eventId = evt?.id || comp?.id;

  const card = el('article',
    { 
      class: `score-card ${live ? 'live' : post ? 'final' : 'pre'}`, 
      style: `--home:${homeC};--away:${awayC}`,
      'data-event-id': eventId
    },
    el('div', { class: 'score-grid' },
      teamBlock(away, { side: 'away', hasBall: awayHasBall }),
      el('div', { class: 'center-col' },
        live ? badge('LIVE', 'live') : post ? badge('FINAL', 'final') : badge('UPCOMING', 'pre'),
        el('div', { class: 'status' }, statusLine),
        sit?.downDistanceText ? el('div', { class: 'chips one' }, el('span', { class: 'chip' }, sit.downDistanceText)) : null,
        bNames.length ? el('div', { class: 'chips tv-inside' }, ...bNames.map((n) => el('span', { class: 'chip' }, n))) : null
      ),
      teamBlock(home, { side: 'home', hasBall: homeHasBall })
    ),
    createDriveInfoPill(comp, live)
  );

  // Click to expand/collapse details
  let detailsLoaded = false;
  card.addEventListener('click', async (e) => {
    if (e.target.closest('a')) return;
    const open = card.classList.toggle('expanded');
    
    // Handle football field
    let field = card.querySelector('.football-field');
    
    if (open && !field) {
      field = createFootballField(comp, homeC, awayC, state);
      
      // Insert field first
      const detailsElement = card.querySelector('.details');
      if (field) {
        card.insertBefore(field, detailsElement);
      }
    } else if (!open && field) {
      field.remove();
    }
    
    // Handle details
    let det = card.querySelector('.details');
    if (open && !det) {
      // Show skeleton while loading
      det = createExpandedDetailsSkeleton(awayC, homeC);
      card.appendChild(det);
      
      try {
        const built = await buildDetails(evt);
        det.replaceWith(built);
        detailsLoaded = true;
      } catch (err) {
        det.textContent = 'Could not load game details.';
        console.error(err);
      }
    } else if (!open && det) {
      det.remove();
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
  
  // Track expanded games by event ID
  const expandedGames = new Set();

  const renderOnce = async (isInitialLoad = false) => {
    try {
      // Save currently expanded game IDs before re-rendering
      if (!isInitialLoad) {
        document.querySelectorAll('.score-card.expanded').forEach(card => {
          const eventId = card.getAttribute('data-event-id');
          if (eventId) expandedGames.add(eventId);
        });
      }
      
      // Show skeleton loaders on initial load only
      if (isInitialLoad) {
        root.innerHTML = '';
        root.appendChild(createSkeletonScoreboards());
      }

      const data = await fetchScoreboard(params);
      const events = (data?.events || []).slice().sort((a, b) => byStateRank(a) - byStateRank(b));

      if (isInitialLoad) {
        root.textContent = '';
      }
      
      if (!events.length) {
        root.innerHTML = '';
        root.appendChild(el('div', { class: 'empty' }, 'No games found.'));
        return;
      }

      // For updates (not initial load), smoothly update existing cards
      if (!isInitialLoad) {
        const existingCards = new Map();
        root.querySelectorAll('.score-card').forEach(card => {
          const eventId = card.getAttribute('data-event-id');
          if (eventId) existingCards.set(eventId, card);
        });
        
        // Update each event
        let currentSection = null;
        
        for (const evt of events) {
          const eventId = evt?.id || evt.competitions?.[0]?.id;
          const state = evt.competitions?.[0]?.status?.type?.state ?? 'pre';
          const sectionLabel = state === 'in' ? 'Live' : state === 'post' ? 'Final' : 'Upcoming';
          
          // Check if we need to add/update section header
          if (currentSection !== sectionLabel) {
            currentSection = sectionLabel;
            let sectionHeader = root.querySelector(`h3.sb-section[data-section="${sectionLabel}"]`);
            if (!sectionHeader) {
              sectionHeader = el('h3', { class: 'sb-section', 'data-section': sectionLabel }, sectionLabel);
              // Find the right place to insert
              const sections = Array.from(root.querySelectorAll('h3.sb-section'));
              const sectionOrder = { 'Live': 0, 'Upcoming': 1, 'Final': 2 };
              let inserted = false;
              for (const section of sections) {
                const sectionType = section.getAttribute('data-section');
                if (sectionOrder[sectionLabel] < sectionOrder[sectionType]) {
                  section.parentNode.insertBefore(sectionHeader, section);
                  inserted = true;
                  break;
                }
              }
              if (!inserted) {
                root.appendChild(sectionHeader);
              }
            }
          }
          
          const existingCard = existingCards.get(eventId);
          
          if (existingCard) {
            // Update existing card in place
            const wasExpanded = existingCard.classList.contains('expanded');
            const newCard = gameCard(evt);
            
            // Preserve expansion state
            if (wasExpanded) {
              expandedGames.add(eventId);
            }
            
            // Smooth transition
            existingCard.style.opacity = '1';
            existingCard.replaceWith(newCard);
            
            // Re-expand if it was expanded
            if (wasExpanded) {
              setTimeout(() => newCard.click(), 0);
            }
            
            existingCards.delete(eventId);
          } else {
            // Add new card
            const newCard = gameCard(evt);
            
            // Find the right section to add it to
            const sectionHeader = root.querySelector(`h3.sb-section[data-section="${sectionLabel}"]`);
            if (sectionHeader) {
              // Insert after section header
              let nextElement = sectionHeader.nextElementSibling;
              let inserted = false;
              
              // Find the right position (before next section or at end of current section)
              while (nextElement) {
                if (nextElement.tagName === 'H3' && nextElement.classList.contains('sb-section')) {
                  sectionHeader.parentNode.insertBefore(newCard, nextElement);
                  inserted = true;
                  break;
                }
                nextElement = nextElement.nextElementSibling;
              }
              
              if (!inserted) {
                // Add at the end of this section
                let lastInSection = sectionHeader;
                nextElement = sectionHeader.nextElementSibling;
                while (nextElement && nextElement.tagName !== 'H3') {
                  lastInSection = nextElement;
                  nextElement = nextElement.nextElementSibling;
                }
                lastInSection.parentNode.insertBefore(newCard, lastInSection.nextSibling);
              }
            } else {
              root.appendChild(newCard);
            }
            
            // Restore expansion if needed
            if (expandedGames.has(eventId)) {
              setTimeout(() => newCard.click(), 0);
            }
          }
        }
        
        // Remove any cards that no longer exist
        existingCards.forEach(card => {
          card.style.transition = 'opacity 0.3s ease';
          card.style.opacity = '0';
          setTimeout(() => card.remove(), 300);
        });
        
      } else {
        // Initial load - render everything fresh
        const frag = document.createDocumentFragment();
        let lastState = null;

        for (const evt of events) {
          const state = evt.competitions?.[0]?.status?.type?.state ?? 'pre';
          if (state !== lastState) {
            const label = state === 'in' ? 'Live' : state === 'post' ? 'Final' : 'Upcoming';
            frag.appendChild(el('h3', { class: 'sb-section', 'data-section': label }, label));
            lastState = state;
          }
          const card = gameCard(evt);
          
          // Restore expanded state if this game was previously expanded
          const eventId = evt?.id || evt.competitions?.[0]?.id;
          if (expandedGames.has(eventId)) {
            setTimeout(() => card.click(), 0);
          }
          
          frag.appendChild(card);
        }

        root.appendChild(frag);
      }
    } catch (e) {
      root.textContent = 'Could not load scores.';
      console.error(e);
    }
  };

  await renderOnce(true); // Initial load with skeleton

  let timer = window.setTimeout(async function tick() {
    await renderOnce(false); // Subsequent updates without skeleton
    timer = window.setTimeout(tick, pollMs);
  }, pollMs);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && timer) { clearTimeout(timer); timer = null; }
    else if (!document.hidden && !timer) {
      timer = window.setTimeout(async function tick() {
        await renderOnce(false);
        timer = window.setTimeout(tick, pollMs);
      }, pollMs);
    }
  });
}
