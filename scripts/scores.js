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
    else if (typeof v === 'boolean') {
      if (v) n.setAttribute(k, '');
      // if false, don't set the attribute at all
    }
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

function createDriveInfoPill(summaryData, isLive) {
  if (!summaryData || !isLive) return null;
  
  // Drives data comes from summary API, not scoreboard
  const drives = summaryData?.drives;
  if (!drives || !drives.current) return null;
  
  const currentDrive = drives.current;
  
  // Extract drive information
  const playCount = currentDrive?.plays || 0;
  const yards = currentDrive?.yards || 0;
  const timeElapsed = currentDrive?.timeElapsed?.displayValue || currentDrive?.displayValue;
  
  // Get current down and distance from summary
  const situation = summaryData?.situation;
  const downDistance = situation?.downDistanceText || situation?.shortDownDistanceText;
  const yardLine = situation?.yardLineText || situation?.possessionText;
  
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

function createFootballField(comp, homeColor, awayColor, gameState, summaryData) {
  if (!comp) return null;
  
  const teams = comp?.competitors || [];
  const home = teams.find(c => c.homeAway === 'home');
  const away = teams.find(c => c.homeAway === 'away');
  
  const homeLogo = home?.team?.logos?.[0]?.href || home?.team?.logo;
  const awayLogo = away?.team?.logos?.[0]?.href || away?.team?.logo;
  const homeAbbr = home?.team?.abbreviation;
  const awayAbbr = away?.team?.abbreviation;
  
  // Situation data comes from summary API
  const sit = summaryData?.situation;
  const stat = comp?.status;
  const state = gameState || stat?.type?.state;
  
  // Debug logging for troubleshooting
  if (state === 'in' && !sit) {
    console.warn('Football field: Live game but no situation data available', {
      homeAbbr,
      awayAbbr,
      hasSummaryData: !!summaryData,
      situationKeys: summaryData ? Object.keys(summaryData) : []
    });
  }
  
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
  
  // Add yard line markers (numbers at each 10-yard line)
  // Positions correspond to yard lines: 10, 20, 30, 40, 50, 40, 30, 20, 10
  const yardMarkers = [
    { position: 18, label: '10' },   // Home 10
    { position: 26, label: '20' },   // Home 20
    { position: 34, label: '30' },   // Home 30
    { position: 42, label: '40' },   // Home 40
    { position: 50, label: '50' },   // 50 yard line
    { position: 58, label: '40' },   // Away 40
    { position: 66, label: '30' },   // Away 30
    { position: 74, label: '20' },   // Away 20
    { position: 82, label: '10' },   // Away 10
  ];
  
  yardMarkers.forEach(({ position, label }) => {
    const marker = el('div', { 
      class: 'yard-marker',
      style: `left: ${position}%;`
    }, label);
    fieldContainer.appendChild(marker);
  });
  
  // Add team labels at endzones
  const yardLabels = el('div', { class: 'yard-labels' },
    el('span', {}, homeAbbr || 'HOME'),
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
      
      // Calculate ball position on the actual 100-yard field (0-100)
      let fieldPosition;
      if (isHomeTerritory) {
        fieldPosition = yardLine; // Home 25 = position 25
      } else {
        fieldPosition = 100 - yardLine; // Away 25 = position 75
      }
      
      // Convert to percentage accounting for 10% endzones on each side
      // The playable field is 80% of the container (10% left endzone + 80% field + 10% right endzone)
      const ballPosition = 10 + (fieldPosition * 0.8); // Map 0-100 yards to 10%-90% of container
      
      // Determine possession and drive color
      let driveColor = homeColor;
      const isPossHome = possAbbr === homeAbbr;
      const isPossAway = possAbbr === awayAbbr;
      
      if (isPossAway) {
        driveColor = awayColor;
      }
      
      field.style.setProperty('--drive-color', driveColor);
      
      // Add drive progress bar
      let driveProgressEl = null;
      
      if (isPossHome) {
        // Home driving towards away (left to right) - from home endzone (10%) to ball
        const driveWidth = ballPosition - 10;
        driveProgressEl = el('div', {
          class: 'drive-progress',
          style: `left: 10%; width: ${driveWidth}%;`
        });
      } else if (isPossAway) {
        // Away driving towards home (right to left) - from away endzone (90%) to ball
        const driveWidth = 90 - ballPosition;
        driveProgressEl = el('div', {
          class: 'drive-progress',
          style: `right: 10%; width: ${driveWidth}%;`
        });
      }
      
      // Add ball marker
      const ballMarker = el('div', {
        class: 'ball-marker',
        style: `left: ${ballPosition}%;`
      });
      
      // Add possession indicator with arrow
      const arrowSymbol = isPossHome ? '→' : isPossAway ? '←' : '';
      const possessionLabel = el('div', {
        class: 'possession-team',
        style: `left: ${ballPosition}%;`
      }, `${arrowSymbol} ${possAbbr || ''} ${arrowSymbol}`);
      
      ballMarker.appendChild(possessionLabel);
      
      if (driveProgressEl) fieldContainer.appendChild(driveProgressEl);
      fieldContainer.appendChild(ballMarker);
      
      // Debug: Confirm ball marker was added
      console.log('✅ Football field: Ball marker added', {
        team: possAbbr,
        yardLine: yardLineText,
        position: `${ballPosition.toFixed(1)}%`,
        direction: isPossHome ? 'home→away' : 'away→home'
      });
      
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
function teamBlock(c, { side, hasBall, isHome } = { side: 'away', hasBall: false, isHome: false }) {
  const logo = c?.team?.logos?.[0]?.href || c?.team?.logo;
  const abbr = c?.team?.abbreviation || c?.team?.displayName || '—';
  const score = c?.score ?? '';
  const rec = c?.records?.[0]?.summary || '';
  
  // Build abbreviation display with icons
  let abbrDisplay = abbr;
  if (hasBall && isHome) {
    abbrDisplay = `🏈 🏠 ${abbr}`;
  } else if (hasBall) {
    abbrDisplay = `🏈 ${abbr}`;
  } else if (isHome) {
    abbrDisplay = `🏠 ${abbr}`;
  }
  
  return el('div', { class: `team-col ${side}` },
    el('div', { class: 'team-row' },
      el('div', { class: 'logo-wrap' },
        logo ? el('img', { class: 'logo', src: logo, alt: abbr, loading: 'lazy' }) : null
      ),
      el('div', { class: 'info' },
        el('div', { class: 'abbr' }, abbrDisplay),
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
      teamBlock(away, { side: 'away', hasBall: awayHasBall, isHome: false }),
      el('div', { class: 'center-col' },
        live ? badge('LIVE', 'live') : post ? badge('FINAL', 'final') : badge('UPCOMING', 'pre'),
        el('div', { class: 'status' }, statusLine),
        sit?.downDistanceText ? el('div', { class: 'chips one' }, el('span', { class: 'chip' }, sit.downDistanceText)) : null,
        bNames.length ? el('div', { class: 'chips tv-inside' }, ...bNames.map((n) => el('span', { class: 'chip' }, n))) : null
      ),
      teamBlock(home, { side: 'home', hasBall: homeHasBall, isHome: true })
    )
    // Note: Drive info pill will be added after fetching summary data
  );

  // Store summary data cache on the card
  let summaryDataCache = null;
  
  // For live games, fetch summary data immediately to show drive info
  if (live) {
    (async () => {
      try {
        const res = await fetch(ESPN_SUMMARY(eventId));
        if (res.ok) {
          summaryDataCache = await res.json();
          
          // Add drive info pill if it doesn't exist
          if (!card.querySelector('.drive-info-pill')) {
            const drivePill = createDriveInfoPill(summaryDataCache, live);
            if (drivePill) {
              card.appendChild(drivePill);
            }
          }
        }
      } catch (err) {
        console.warn('Could not fetch summary for drive info:', err);
      }
    })();
  }

  // Click to expand/collapse details
  let detailsLoaded = false;
  card.addEventListener('click', async (e) => {
    // Don't collapse if clicking interactive elements
    if (e.target.closest('a, button, .game-info-tabs, .win-probability, .details-grid')) return;
    const open = card.classList.toggle('expanded');
    
    // Fetch summary data if not cached yet - MUST await before creating field
    if (open && !summaryDataCache) {
      try {
        const res = await fetch(ESPN_SUMMARY(eventId));
        if (res.ok) {
          summaryDataCache = await res.json();
        }
      } catch (err) {
        console.warn('Could not fetch summary data:', err);
      }
    }
    
    // Handle football field - now summaryDataCache will be populated
    let field = card.querySelector('.football-field');
    
    if (open && !field) {
      // Create field with fully loaded summary data
      field = createFootballField(comp, homeC, awayC, state, summaryDataCache);
      
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
        const built = await buildDetails(evt, summaryDataCache);
        det.replaceWith(built);
        detailsLoaded = true;
      } catch (err) {
        det.textContent = 'Could not load game details.';
        console.error(err);
      }
    } else if (!open && det) {
      det.remove();
    }
    
    // Trigger polling check when expanding/collapsing
    if (typeof window.checkScoreboardPolling === 'function') {
      window.checkScoreboardPolling();
    }
  });

  return card;
}


/* --------------------------- Details (expanded) -------------------------- */
async function buildDetails(evt, summaryDataCache = null) {
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
    // Use cached summary data if available, otherwise fetch it
    let sum = summaryDataCache;
    if (!sum) {
      const res = await fetch(ESPN_SUMMARY(eventId));
      if (res.ok) {
        sum = await res.json();
      }
    }
    
    if (sum) {
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

  // Extract win probability data from summary
  let winProbGraph = null;
  try {
    let sum = summaryDataCache;
    if (!sum) {
      const res = await fetch(ESPN_SUMMARY(eventId));
      if (res.ok) {
        sum = await res.json();
      }
    }
    
    if (sum && sum.winprobability && sum.winprobability.length > 0) {
      // Get team colors
      const homeColor = colorHex(home?.team?.color) || '#222';
      const awayColor = colorHex(away?.team?.color) || '#222';
      
      winProbGraph = renderWinProbabilityGraph(
        sum.winprobability,
        sum.drives,
        homeAbbr,
        awayAbbr,
        home?.team?.logos?.[0]?.href || home?.team?.logo,
        away?.team?.logos?.[0]?.href || away?.team?.logo,
        homeColor,
        awayColor
      );
    }
  } catch (e) {
    console.warn("Win probability fetch failed", e);
  }

  // Create details container
  const detailsContainer = el('div', { class: 'details' });
  
  // Add game info tabs if summary data available
  let gameInfoTabs = null;
  try {
    let sum = summaryDataCache;
    if (!sum) {
      const res = await fetch(ESPN_SUMMARY(eventId));
      if (res.ok) {
        sum = await res.json();
      }
    }
    
    if (sum) {
      gameInfoTabs = renderGameInfoTabs(sum, homeAbbr, awayAbbr);
    }
  } catch (e) {
    console.warn("Game info tabs fetch failed", e);
  }
  
  if (gameInfoTabs) {
    detailsContainer.appendChild(gameInfoTabs);
  }
  
  // Add win probability graph if available
  if (winProbGraph) {
    detailsContainer.appendChild(winProbGraph);
  }
  
  // Add 3-column grid: Away Top | Linescore (center) | Home Top
  detailsContainer.appendChild(
    el('div', { class: 'details-grid' },
      renderTopList('away', awayAbbr, topByTeam.get(awayAbbr) || []),
      renderLinescore(lines),
      renderTopList('home', homeAbbr, topByTeam.get(homeAbbr) || []),
    )
  );
  
  return detailsContainer;
}

/* ------------------------- Game Info Tabs ------------------------- */
function renderGameInfoTabs(summaryData, homeAbbr, awayAbbr) {
  const container = el('div', { class: 'game-info-tabs' });
  
  // Tab buttons
  const tabButtons = el('div', { class: 'tab-buttons' },
    el('button', { class: 'tab-btn active', 'data-tab': 'venue' }, 'Venue Stats'),
    el('button', { class: 'tab-btn', 'data-tab': 'leaders' }, 'Game Leaders'),
    el('button', { class: 'tab-btn', 'data-tab': 'drives' }, 'Drives'),
    el('button', { class: 'tab-btn', 'data-tab': 'stats' }, 'Game Stats')
  );
  
  // Tab content container
  const tabContent = el('div', { class: 'tab-content' });
  
  // Venue Stats Tab
  const venueTab = renderVenueTab(summaryData);
  venueTab.classList.add('tab-pane', 'active');
  venueTab.setAttribute('data-tab-content', 'venue');
  
  // Game Leaders Tab
  const leadersTab = renderGameLeadersTab(summaryData);
  leadersTab.classList.add('tab-pane');
  leadersTab.setAttribute('data-tab-content', 'leaders');
  
  // Drives Tab
  const drivesTab = renderDrivesTab(summaryData);
  drivesTab.classList.add('tab-pane');
  drivesTab.setAttribute('data-tab-content', 'drives');
  
  // Game Stats Tab
  const statsTab = renderGameStatsTab(summaryData, homeAbbr, awayAbbr);
  statsTab.classList.add('tab-pane');
  statsTab.setAttribute('data-tab-content', 'stats');
  
  tabContent.appendChild(venueTab);
  tabContent.appendChild(leadersTab);
  tabContent.appendChild(drivesTab);
  tabContent.appendChild(statsTab);
  
  container.appendChild(tabButtons);
  container.appendChild(tabContent);
  
  // Add tab switching logic
  tabButtons.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent card collapse
      const targetTab = btn.getAttribute('data-tab');
      
      // Update active button
      tabButtons.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      // Update active content
      tabContent.querySelectorAll('.tab-pane').forEach(pane => {
        if (pane.getAttribute('data-tab-content') === targetTab) {
          pane.classList.add('active');
        } else {
          pane.classList.remove('active');
        }
      });
    });
  });
  
  // Prevent clicks inside tab content from closing the card
  container.addEventListener('click', (e) => {
    e.stopPropagation();
  });
  
  return container;
}

function renderVenueTab(summaryData) {
  const gameInfo = summaryData?.gameInfo || {};
  const venue = gameInfo?.venue || {};
  const weather = gameInfo?.weather || {};
  
  const items = [];
  
  if (gameInfo.attendance) {
    items.push(el('div', { class: 'info-row' },
      el('span', { class: 'info-label' }, 'Attendance:'),
      el('span', { class: 'info-value' }, gameInfo.attendance.toLocaleString())
    ));
  }
  
  if (venue.fullName) {
    items.push(el('div', { class: 'info-row' },
      el('span', { class: 'info-label' }, 'Venue:'),
      el('span', { class: 'info-value' }, venue.fullName)
    ));
  }
  
  if (venue.address?.city && venue.address?.state) {
    items.push(el('div', { class: 'info-row' },
      el('span', { class: 'info-label' }, 'Location:'),
      el('span', { class: 'info-value' }, `${venue.address.city}, ${venue.address.state}`)
    ));
  }
  
  if (venue.capacity) {
    items.push(el('div', { class: 'info-row' },
      el('span', { class: 'info-label' }, 'Capacity:'),
      el('span', { class: 'info-value' }, venue.capacity.toLocaleString())
    ));
  }
  
  // Surface type
  const surfaceType = venue.grass ? 'Grass' : 'Artificial Turf';
  items.push(el('div', { class: 'info-row' },
    el('span', { class: 'info-label' }, 'Surface:'),
    el('span', { class: 'info-value' }, surfaceType)
  ));
  
  // Indoor/Outdoor
  const indoorOutdoor = venue.indoor ? 'Indoor' : 'Outdoor';
  items.push(el('div', { class: 'info-row' },
    el('span', { class: 'info-label' }, 'Type:'),
    el('span', { class: 'info-value' }, indoorOutdoor)
  ));
  
  // Weather (only if outdoor)
  if (!venue.indoor && weather.displayValue) {
    items.push(el('div', { class: 'info-row' },
      el('span', { class: 'info-label' }, 'Weather:'),
      el('span', { class: 'info-value' }, weather.displayValue)
    ));
    
    if (weather.temperature) {
      items.push(el('div', { class: 'info-row' },
        el('span', { class: 'info-label' }, 'Temperature:'),
        el('span', { class: 'info-value' }, `${weather.temperature}°F`)
      ));
    }
  } else if (venue.indoor) {
    items.push(el('div', { class: 'info-row' },
      el('span', { class: 'info-label' }, 'Weather:'),
      el('span', { class: 'info-value' }, 'Indoor')
    ));
  }
  
  return el('div', {}, ...items);
}

function renderGameLeadersTab(summaryData) {
  const teams = summaryData?.boxscore?.players || [];
  
  if (teams.length < 2) {
    return el('div', { class: 'info-row' }, 'No leader data available');
  }
  
  const awayTeam = teams[0];
  const homeTeam = teams[1];
  
  const categories = [
    { name: 'passing', label: 'Passing Yards', statIndex: 1 }, // YDS is index 1
    { name: 'rushing', label: 'Rushing Yards', statIndex: 1 }, // YDS is index 1
    { name: 'receiving', label: 'Receiving Yards', statIndex: 1 }, // YDS is index 1
    { name: 'defensive', label: 'Sacks', statIndex: 2 }, // SACKS is index 2
    { name: 'defensive', label: 'Tackles', statIndex: 0 } // TOT is index 0
  ];
  
  const leadersContainer = el('div', { class: 'leaders-container' });
  
  categories.forEach((category, idx) => {
    // Get stats for this category from both teams
    const awayStats = awayTeam.statistics?.find(s => s.name?.toLowerCase() === category.name);
    const homeStats = homeTeam.statistics?.find(s => s.name?.toLowerCase() === category.name);
    
    if (!awayStats || !homeStats) return;
    
    // For defensive stats, we need to handle sacks vs tackles differently
    let awayLeader, homeLeader;
    
    if (category.label === 'Tackles') {
      // Find player with most tackles
      awayLeader = awayStats.athletes?.reduce((max, a) => {
        const tackles = parseFloat(a.stats?.[category.statIndex] || 0);
        const maxTackles = parseFloat(max?.stats?.[category.statIndex] || 0);
        return tackles > maxTackles ? a : max;
      }, awayStats.athletes?.[0]);
      
      homeLeader = homeStats.athletes?.reduce((max, a) => {
        const tackles = parseFloat(a.stats?.[category.statIndex] || 0);
        const maxTackles = parseFloat(max?.stats?.[category.statIndex] || 0);
        return tackles > maxTackles ? a : max;
      }, homeStats.athletes?.[0]);
    } else if (category.label === 'Sacks') {
      // Find player with most sacks
      awayLeader = awayStats.athletes?.reduce((max, a) => {
        const sacks = parseFloat(a.stats?.[category.statIndex] || 0);
        const maxSacks = parseFloat(max?.stats?.[category.statIndex] || 0);
        return sacks > maxSacks ? a : max;
      }, awayStats.athletes?.[0]);
      
      homeLeader = homeStats.athletes?.reduce((max, a) => {
        const sacks = parseFloat(a.stats?.[category.statIndex] || 0);
        const maxSacks = parseFloat(max?.stats?.[category.statIndex] || 0);
        return sacks > maxSacks ? a : max;
      }, homeStats.athletes?.[0]);
    } else {
      // For passing, rushing, receiving - first athlete is the leader
      awayLeader = awayStats.athletes?.[0];
      homeLeader = homeStats.athletes?.[0];
    }
    
    if (!awayLeader || !homeLeader) return;
    
    const awayAthlete = awayLeader.athlete || {};
    const homeAthlete = homeLeader.athlete || {};
    const awayValue = awayLeader.stats?.[category.statIndex] || '0';
    const homeValue = homeLeader.stats?.[category.statIndex] || '0';
    const statLabel = awayStats.labels?.[category.statIndex] || category.label;
    
    // Create leader row
    const leaderRow = el('div', { class: 'leader-row' },
      // Away player (left side: headshot -> name -> stat)
      el('div', { class: 'leader-player away' },
        awayAthlete.headshot?.href ? el('img', { 
          class: 'leader-headshot', 
          src: awayAthlete.headshot.href, 
          alt: awayAthlete.displayName 
        }) : null,
        el('div', { class: 'leader-info' },
          el('div', { class: 'leader-name' }, awayAthlete.displayName || 'Unknown'),
          el('div', { class: 'leader-team' }, awayTeam.team?.abbreviation || '')
        ),
        el('div', { class: 'leader-stat' }, awayValue)
      ),
      
      // Category label
      el('div', { class: 'leader-category' }, category.label),
      
      // Home player (right side: stat -> name -> headshot)
      el('div', { class: 'leader-player home' },
        el('div', { class: 'leader-stat' }, homeValue),
        el('div', { class: 'leader-info' },
          el('div', { class: 'leader-name' }, homeAthlete.displayName || 'Unknown'),
          el('div', { class: 'leader-team' }, homeTeam.team?.abbreviation || '')
        ),
        homeAthlete.headshot?.href ? el('img', { 
          class: 'leader-headshot', 
          src: homeAthlete.headshot.href, 
          alt: homeAthlete.displayName 
        }) : null
      )
    );
    
    leadersContainer.appendChild(leaderRow);
  });
  
  return leadersContainer;
}

function renderDrivesTab(summaryData) {
  const drives = summaryData?.drives?.previous || [];
  
  if (drives.length === 0) {
    return el('div', { class: 'info-row' }, 'No drive data available');
  }
  
  const driveElements = drives.map((drive, index) => {
    const team = drive.team?.abbreviation || 'Team';
    const description = drive.description || '';
    const result = drive.result || '';
    
    const driveHeader = el('div', { class: 'drive-header' },
      el('span', { class: 'drive-number' }, `Drive ${index + 1}`),
      el('span', { class: 'drive-team' }, team),
      el('span', { class: 'drive-result' }, result)
    );
    
    const driveInfo = el('div', { class: 'drive-info' }, description);
    
    const driveContainer = el('div', { class: 'drive-item' }, driveHeader, driveInfo);
    
    // Check if this drive had scoring plays
    const plays = drive.plays || [];
    const scoringPlays = plays.filter(p => p.scoringPlay);
    
    if (scoringPlays.length > 0) {
      scoringPlays.forEach(play => {
        const scoreText = `${play.awayScore}-${play.homeScore}`;
        const playDesc = play.text || '';
        
        driveContainer.appendChild(
          el('div', { class: 'scoring-play' },
            el('div', { class: 'scoring-play-desc' }, playDesc),
            el('div', { class: 'scoring-play-score' }, `Score: ${scoreText}`)
          )
        );
      });
    }
    
    return driveContainer;
  });
  
  return el('div', { class: 'drives-list' }, ...driveElements);
}

function renderGameStatsTab(summaryData, homeAbbr, awayAbbr) {
  const teams = summaryData?.boxscore?.teams || [];
  
  if (teams.length < 2) {
    return el('div', { class: 'info-row' }, 'No team stats available');
  }
  
  const awayTeam = teams.find(t => t.homeAway === 'away') || teams[0];
  const homeTeam = teams.find(t => t.homeAway === 'home') || teams[1];
  
  // Get key stats to display
  const keyStats = [
    'firstDowns',
    'totalYards',
    'netPassingYards',
    'rushingYards',
    'turnovers',
    'possessionTime',
    'thirdDownEff',
    'fourthDownEff',
    'totalPenaltiesYards'
  ];
  
  const statsGrid = el('div', { class: 'stats-grid' });
  
  // Header row
  statsGrid.appendChild(
    el('div', { class: 'stats-row stats-header' },
      el('div', { class: 'stats-team' }, awayAbbr),
      el('div', { class: 'stats-label' }, 'Stat'),
      el('div', { class: 'stats-team' }, homeAbbr)
    )
  );
  
  // Get all unique stat names from both teams
  const awayStats = awayTeam.statistics || [];
  const homeStats = homeTeam.statistics || [];
  
  // Filter to key stats
  const statsToShow = awayStats.filter(s => keyStats.includes(s.name));
  
  statsToShow.forEach(awayStat => {
    const homeStat = homeStats.find(s => s.name === awayStat.name);
    
    if (homeStat) {
      statsGrid.appendChild(
        el('div', { class: 'stats-row' },
          el('div', { class: 'stats-value' }, awayStat.displayValue),
          el('div', { class: 'stats-label' }, awayStat.label),
          el('div', { class: 'stats-value' }, homeStat.displayValue)
        )
      );
    }
  });
  
  return statsGrid;
}

/* ------------------------- Win Probability Graph ------------------------- */
function renderWinProbabilityGraph(winProbData, drivesData, homeAbbr, awayAbbr, homeLogo, awayLogo, homeColor, awayColor) {
  if (!winProbData || winProbData.length === 0) return null;

  // Build a map of playId -> play details for timing information
  const playMap = new Map();
  const previousDrives = drivesData?.previous || [];
  
  for (const drive of previousDrives) {
    const plays = drive?.plays || [];
    for (const play of plays) {
      playMap.set(play.id, {
        period: play.period?.number || 1,
        clock: play.clock?.displayValue || '',
        homeScore: play.homeScore || 0,
        awayScore: play.awayScore || 0
      });
    }
  }

  // Get current win probability (last entry)
  const currentProb = winProbData[winProbData.length - 1];
  const homeWinPct = (currentProb.homeWinPercentage * 100).toFixed(1);
  const awayWinPct = ((1 - currentProb.homeWinPercentage) * 100).toFixed(1);

  // Create container
  const container = el('div', { 
    class: 'win-probability',
    style: `--home-color: ${homeColor}; --away-color: ${awayColor};`
  });

  // Header with team logos and current percentages
  const header = el('div', { class: 'win-prob-header' },
    el('div', { class: 'win-prob-team' },
      awayLogo ? el('img', { src: awayLogo, alt: awayAbbr }) : null,
      el('span', {}, awayAbbr),
      el('span', { class: 'win-prob-percentage' }, `${awayWinPct}%`)
    ),
    el('div', { class: 'win-prob-team' },
      el('span', { class: 'win-prob-percentage' }, `${homeWinPct}%`),
      el('span', {}, homeAbbr),
      homeLogo ? el('img', { src: homeLogo, alt: homeAbbr }) : null
    )
  );

  // Create SVG graph
  const width = 100; // percentage
  const height = 120; // pixels
  const padding = 0;

  // Map data points to coordinates
  const points = winProbData.map((item, index) => {
    const x = (index / (winProbData.length - 1)) * 100;
    const y = 100 - (item.homeWinPercentage * 100); // Invert Y (0 = top, 100 = bottom)
    return { x, y, homeWinPct: item.homeWinPercentage };
  });

  // Create SVG path string
  const pathData = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  
  // Create area fill paths - fill from line to 50% mark
  // Home area: from 50% line down to the probability line (when home is winning)
  let homeAreaPath = `M 0 50 L ${points[0].x} ${points[0].y} `;
  points.forEach(p => {
    homeAreaPath += `L ${p.x} ${Math.max(p.y, 50)} `;
  });
  homeAreaPath += `L 100 50 Z`;
  
  // Away area: from 50% line up to the probability line (when away is winning)
  let awayAreaPath = `M 0 50 L ${points[0].x} ${points[0].y} `;
  points.forEach(p => {
    awayAreaPath += `L ${p.x} ${Math.min(p.y, 50)} `;
  });
  awayAreaPath += `L 100 50 Z`;

  // Create SVG
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'win-prob-svg');
  svg.setAttribute('viewBox', `0 0 100 100`);
  svg.setAttribute('preserveAspectRatio', 'none');

  // Add gradient fills
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  
  // Home gradient
  const homeGradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
  homeGradient.setAttribute('id', `homeGrad-${homeAbbr}`);
  homeGradient.setAttribute('x1', '0');
  homeGradient.setAttribute('y1', '1');
  homeGradient.setAttribute('x2', '0');
  homeGradient.setAttribute('y2', '0');
  const homeStop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
  homeStop1.setAttribute('offset', '0%');
  homeStop1.setAttribute('stop-color', homeColor);
  homeStop1.setAttribute('stop-opacity', '0.35');
  const homeStop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
  homeStop2.setAttribute('offset', '100%');
  homeStop2.setAttribute('stop-color', homeColor);
  homeStop2.setAttribute('stop-opacity', '0.05');
  homeGradient.appendChild(homeStop1);
  homeGradient.appendChild(homeStop2);
  
  // Away gradient
  const awayGradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
  awayGradient.setAttribute('id', `awayGrad-${awayAbbr}`);
  awayGradient.setAttribute('x1', '0');
  awayGradient.setAttribute('y1', '0');
  awayGradient.setAttribute('x2', '0');
  awayGradient.setAttribute('y2', '1');
  const awayStop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
  awayStop1.setAttribute('offset', '0%');
  awayStop1.setAttribute('stop-color', awayColor);
  awayStop1.setAttribute('stop-opacity', '0.35');
  const awayStop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
  awayStop2.setAttribute('offset', '100%');
  awayStop2.setAttribute('stop-color', awayColor);
  awayStop2.setAttribute('stop-opacity', '0.05');
  awayGradient.appendChild(awayStop1);
  awayGradient.appendChild(awayStop2);
  
  defs.appendChild(homeGradient);
  defs.appendChild(awayGradient);
  svg.appendChild(defs);

  // Add 50% reference line
  const refLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  refLine.setAttribute('x1', '0');
  refLine.setAttribute('y1', '50');
  refLine.setAttribute('x2', '100');
  refLine.setAttribute('y2', '50');
  refLine.setAttribute('stroke', 'rgba(255,255,255,0.2)');
  refLine.setAttribute('stroke-width', '0.3');
  refLine.setAttribute('stroke-dasharray', '2,2');
  svg.appendChild(refLine);

  // Add area fills - swap colors so away is bottom, home is top
  const homeArea = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  homeArea.setAttribute('d', homeAreaPath);
  homeArea.setAttribute('fill', `url(#awayGrad-${awayAbbr})`);
  homeArea.setAttribute('class', 'win-prob-area-home');
  svg.appendChild(homeArea);

  const awayArea = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  awayArea.setAttribute('d', awayAreaPath);
  awayArea.setAttribute('fill', `url(#homeGrad-${homeAbbr})`);
  awayArea.setAttribute('class', 'win-prob-area-away');
  svg.appendChild(awayArea);

  // Add the main line - thin and clean
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', pathData);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', '#ffffff');
  path.setAttribute('stroke-width', '0.5');
  path.setAttribute('vector-effect', 'non-scaling-stroke');
  path.setAttribute('class', 'win-prob-line');
  svg.appendChild(path);

  // Chart container with proper aspect ratio
  const chartContainer = el('div', { class: 'win-prob-chart' });
  chartContainer.appendChild(svg);

  // Quarter labels (approximate)
  const quarters = el('div', { class: 'win-prob-quarters' },
    el('span', {}, 'Q1'),
    el('span', {}, 'Q2'),
    el('span', {}, 'Q3'),
    el('span', {}, 'Q4')
  );

  container.appendChild(header);
  container.appendChild(chartContainer);
  container.appendChild(quarters);

  // Prevent clicks on win probability from closing the card
  container.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  return container;
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
  
  // Timer for polling
  let timer = null;
  
  // Add week selector
  const weekSelectorContainer = document.getElementById('week-selector-container');
  if (weekSelectorContainer) {
    const currentWeekData = await fetchScoreboard({});
    const currentWeek = currentWeekData?.week?.number || 1;
    const seasonType = currentWeekData?.season?.type || 2; // 2 = regular season
    
    // Get selected week from params or use current week
    const selectedWeek = params.week || currentWeek;
    
    // Week navigation handlers
    const handleWeekChange = async (newWeek) => {
      params.week = newWeek;
      params.seasontype = seasonType;
      
      // Update display
      const weekDisplay = document.getElementById('current-week-display');
      if (weekDisplay) weekDisplay.textContent = newWeek;
      
      // Update button states
      const prevBtn = document.getElementById('prev-week');
      const nextBtn = document.getElementById('next-week');
      if (prevBtn) prevBtn.disabled = newWeek <= 1;
      if (nextBtn) nextBtn.disabled = newWeek >= 18;
      
      // Clear timer if it exists
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      
      // Reload with new week
      expandedGames.clear();
      await renderOnce(true);
      
      // Restart polling only if there are live games
      const hasLiveGames = root.querySelectorAll('.score-card.live').length > 0;
      if (hasLiveGames) {
        timer = window.setTimeout(async function tick() {
          const hasLiveGames = await renderOnce(false);
          if (hasLiveGames) {
            timer = window.setTimeout(tick, pollMs);
          } else {
            timer = null;
          }
        }, pollMs);
      }
    };
    
    // Create week selector with navigation
    const prevBtn = el('button', { 
      class: 'week-nav-btn prev', 
      id: 'prev-week',
      disabled: selectedWeek <= 1 
    }, '◄');
    
    const nextBtn = el('button', { 
      class: 'week-nav-btn next', 
      id: 'next-week',
      disabled: selectedWeek >= 18 
    }, '►');
    
    const weekNumberDisplay = el('span', { class: 'week-number', id: 'current-week-display' }, selectedWeek);
    const weekNumberInput = el('input', { 
      type: 'number', 
      class: 'week-number-input', 
      id: 'week-number-input',
      min: '1',
      max: '18',
      value: selectedWeek
    });
    
    const weekSelector = el('div', { class: 'week-selector' },
      el('div', { class: 'week-nav' },
        prevBtn,
        el('div', { class: 'week-display', id: 'week-display-container' },
          el('span', { class: 'week-label' }, 'WEEK'),
          weekNumberDisplay,
          weekNumberInput
        ),
        nextBtn
      )
    );
    
    weekSelectorContainer.innerHTML = '';
    weekSelectorContainer.appendChild(weekSelector);
    
    // Toggle between display and input on click
    weekNumberDisplay.addEventListener('click', (e) => {
      e.stopPropagation();
      weekNumberDisplay.style.display = 'none';
      weekNumberInput.style.display = 'block';
      weekNumberInput.focus();
      weekNumberInput.select();
    });
    
    // Handle input submission
    const submitWeekInput = () => {
      const inputWeek = parseInt(weekNumberInput.value);
      if (inputWeek >= 1 && inputWeek <= 18) {
        weekNumberDisplay.style.display = 'block';
        weekNumberInput.style.display = 'none';
        handleWeekChange(inputWeek);
      } else {
        // Reset to current week if invalid
        weekNumberInput.value = parseInt(weekNumberDisplay.textContent);
        weekNumberDisplay.style.display = 'block';
        weekNumberInput.style.display = 'none';
      }
    };
    
    weekNumberInput.addEventListener('blur', submitWeekInput);
    weekNumberInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitWeekInput();
      } else if (e.key === 'Escape') {
        // Cancel edit
        weekNumberInput.value = parseInt(weekNumberDisplay.textContent);
        weekNumberDisplay.style.display = 'block';
        weekNumberInput.style.display = 'none';
      }
    });
    
    // Attach event listeners after elements are in DOM
    prevBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const currentDisplayedWeek = parseInt(document.getElementById('current-week-display').textContent);
      if (currentDisplayedWeek > 1) {
        handleWeekChange(currentDisplayedWeek - 1);
      }
    });
    
    nextBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const currentDisplayedWeek = parseInt(document.getElementById('current-week-display').textContent);
      if (currentDisplayedWeek < 18) {
        handleWeekChange(currentDisplayedWeek + 1);
      }
    });
  }
  
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
    
    // Check if there are any expanded live games
    const hasExpandedLiveGames = Array.from(root.querySelectorAll('.score-card.live.expanded')).length > 0;
    return hasExpandedLiveGames;
  };

  // Function to check if polling should be active
  const checkPolling = () => {
    const hasExpandedLiveGames = root.querySelectorAll('.score-card.live.expanded').length > 0;
    
    if (hasExpandedLiveGames && !timer) {
      // Start polling
      timer = window.setTimeout(async function tick() {
        const stillNeedsPolling = await renderOnce(false);
        if (stillNeedsPolling) {
          timer = window.setTimeout(tick, pollMs);
        } else {
          timer = null;
        }
      }, pollMs);
    } else if (!hasExpandedLiveGames && timer) {
      // Stop polling
      clearTimeout(timer);
      timer = null;
    }
  };
  
  // Expose function globally so cards can trigger it
  window.checkScoreboardPolling = checkPolling;

  // Initial load with skeleton
  const initialNeedsPolling = await renderOnce(true);

  // Only start polling if there are expanded live games
  if (initialNeedsPolling) {
    timer = window.setTimeout(async function tick() {
      const stillNeedsPolling = await renderOnce(false); // Subsequent updates without skeleton
      // Only continue polling if there are expanded live games
      if (stillNeedsPolling) {
        timer = window.setTimeout(tick, pollMs);
      } else {
        timer = null;
      }
    }, pollMs);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && timer) { clearTimeout(timer); timer = null; }
    else if (!document.hidden && !timer) {
      // Only restart polling if there are expanded live games
      checkPolling();
    }
  });
}
