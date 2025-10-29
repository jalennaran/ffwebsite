// scripts/matchups.js
import { getCurrentWeek, getLeagueBundle, getPlayersMap, getAvgByRosterUpTo, jget, LEAGUE_ID } from './api.js';
import { el, sanitizeName } from './ui.js';

/* ----------------------- Skeleton Loader ----------------------- */

function createMatchupSkeleton() {
  const card = el('div', { class: 'skeleton-match-card' });
  
  const header = el('div', { class: 'skeleton-match-header' },
    el('div', { class: 'skeleton-match-left' },
      el('div', { class: 'skeleton skeleton-line title' }),
      el('div', { class: 'skeleton skeleton-line avg' })
    ),
    el('div', { class: 'skeleton skeleton-line score' })
  );
  
  card.appendChild(header);
  return card;
}

function createMatchupSkeletons(count = 6) {
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    fragment.appendChild(createMatchupSkeleton());
  }
  return fragment;
}

function createExpandedMatchupSkeleton() {
  const body = el('div', { class: 'skeleton-match-body' });
  const scroller = el('div', { class: 'skeleton-match-scroller' });
  const grid = el('div', { class: 'skeleton-match-grid' });
  
  // Create two team columns
  for (let team = 0; team < 2; team++) {
    const col = el('div', { class: 'skeleton-team-col' });
    col.appendChild(el('div', { class: 'skeleton skeleton-team-name' }));
    
    // Starters section
    col.appendChild(el('div', { class: 'skeleton skeleton-group-title' }));
    for (let i = 0; i < 9; i++) {
      const row = el('div', { class: 'skeleton-player-row' },
        el('div', {}, el('div', { class: 'skeleton skeleton-pos' })),
        el('div', {}, el('div', { class: 'skeleton skeleton-img' })),
        el('div', { class: 'skeleton-player-info' },
          el('div', { class: 'skeleton skeleton-name' }),
          el('div', { class: 'skeleton skeleton-team' })
        ),
        el('div', {}, el('div', { class: 'skeleton skeleton-pts' }))
      );
      col.appendChild(row);
    }
    
    // Bench section
    col.appendChild(el('div', { class: 'skeleton skeleton-group-title' }));
    for (let i = 0; i < 6; i++) {
      const row = el('div', { class: 'skeleton-player-row' },
        el('div', {}, el('div', { class: 'skeleton skeleton-pos' })),
        el('div', {}, el('div', { class: 'skeleton skeleton-img' })),
        el('div', { class: 'skeleton-player-info' },
          el('div', { class: 'skeleton skeleton-name' }),
          el('div', { class: 'skeleton skeleton-team' })
        ),
        el('div', {}, el('div', { class: 'skeleton skeleton-pts' }))
      );
      col.appendChild(row);
    }
    
    grid.appendChild(col);
  }
  
  scroller.appendChild(grid);
  body.appendChild(scroller);
  return body;
}

/* ----------------------- Main Load Function ----------------------- */

let currentWeek = null;

async function loadMatchupsForWeek(week) {
  const root = document.getElementById('matchups-root');
  
  // Show skeleton loaders immediately
  root.innerHTML = '';
  root.appendChild(createMatchupSkeletons(6));
  
  try {
    const [{ ownerByRoster }, players] = await Promise.all([
      getLeagueBundle(),
      getPlayersMap()
    ]);

    const avgByRoster = await getAvgByRosterUpTo(Math.max(0, week - 1));
    const matchups = await jget(`/league/${LEAGUE_ID}/matchups/${week}`);
    const byId = {};
    matchups.forEach(m => { (byId[m.matchup_id] ||= []).push(m); });

    root.innerHTML = '';
    Object.values(byId).forEach(pair => {
      const a = pair[0], b = pair[1] || {};
      const aOwn = ownerByRoster[a?.roster_id], bOwn = ownerByRoster[b?.roster_id];
      const nameA = sanitizeName((aOwn?.metadata?.team_name) || aOwn?.display_name || `Roster ${a?.roster_id ?? '?'}`);
      const nameB = sanitizeName((bOwn?.metadata?.team_name) || bOwn?.display_name || (b ? `Roster ${b.roster_id}` : 'BYE'));

      // Card
      const card  = el('div', { class: 'news-card match-card' });
      const header = el('div', { class: 'match-header', role: 'button', tabindex: '0' });

      const aAvg = avgByRoster[a?.roster_id];
      const bAvg = avgByRoster[b?.roster_id];

      const left = el('div', { class: 'match-left' });
      left.append(
        el('div', { class: 'match-title', html: `Week ${week} · ${nameA} vs ${nameB}` }),
        el('div', { class: 'match-avg',   html: `Avg: ${isFinite(aAvg) ? aAvg.toFixed(1) : '—'} — ${isFinite(bAvg) ? bAvg.toFixed(1) : '—'}` })
      );

      const score = el('div', { class: 'match-score', html: `${(a?.points ?? 0).toFixed(2)} — ${(b?.points ?? 0).toFixed(2)}` });

      header.append(left, score);
      card.append(header);

      // Body (hidden by default)
      const body = el('div', { class: 'match-body' });

      // scroller + wide grid (same behavior as drafts)
      const scroller = el('div', { class: 'match-scroller' });
      const grid = el('div', { class: 'match-grid' });
      grid.append(
        buildTeamCol(a, nameA, players),
        buildTeamCol(b, nameB, players)
      );
      scroller.append(grid);
      body.append(scroller);
      card.append(body);

      // Track if content has been loaded
      let contentLoaded = false;
      const actualContent = scroller.cloneNode(true);

      // Toggle logic with skeleton
      const toggle = () => {
        const isOpening = !body.classList.contains('open');
        
        if (isOpening && !contentLoaded) {
          // Show skeleton while loading
          const skeleton = createExpandedMatchupSkeleton();
          body.innerHTML = '';
          body.appendChild(skeleton);
          body.classList.add('open');
          
          // Replace with actual content after a brief moment
          setTimeout(() => {
            body.innerHTML = '';
            body.appendChild(scroller);
            contentLoaded = true;
          }, 300);
        } else {
          body.classList.toggle('open');
        }
      };
      
      header.addEventListener('click', toggle);
      header.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });

      root.append(card);
    });

    if (!root.children.length) root.textContent = `No matchups found for Week ${week}.`;

  } catch (e) {
    console.error(e);
    root.textContent = 'Failed to load matchups.';
  }
}

function buildTeamCol(entry, teamName, players) {
  const col = el('div', { class: 'team-col' });
  col.append(el('span', { class: 'team-name', html: teamName }));

  if (!entry || !entry.roster_id) {
    col.append(el('div', { class: 'pmeta', html: 'No data (BYE or missing).' }));
    return col;
  }

  const starters = (entry.starters || []).filter(Boolean);        // array of player_ids
  const all = (entry.players || []).filter(Boolean);               // all active players in matchup
  const bench = all.filter(pid => !starters.includes(pid));        // bench = all - starters
  const ppts = entry.players_points || {};                         // { player_id: points }

  // Starters
  col.append(el('div', { class: 'group-title', html: 'Starters' }));
  const startersWrap = el('div', { class: 'group' });
  starters.forEach(pid => startersWrap.append(playerRow(pid, ppts[pid] ?? 0, players)));
  if (!starters.length) startersWrap.append(el('div', { class: 'pmeta', html: '—' }));
  col.append(startersWrap);

  // Bench
  col.append(el('div', { class: 'group-title', html: 'Bench' }));
  const benchWrap = el('div', { class: 'group' });
  bench.forEach(pid => benchWrap.append(playerRow(pid, ppts[pid] ?? 0, players)));
  if (!bench.length) benchWrap.append(el('div', { class: 'pmeta', html: '—' }));
  col.append(benchWrap);

  return col;
}

function playerRow(pid, pts, players) {
  const p = players[pid] || {};
  const posRaw  = p.pos || '';
  const posKey  = posRaw === 'DEF' ? 'DST' : posRaw;
  const posClass = posRaw === 'DEF' ? 'dst' : posRaw.toLowerCase();
  // treat only true empty slots as empty (pid missing/zero), not missing first names
  const hasPlayer = pid && pid !== '0' && pid !== 0;
  const row = el('div', { class: 'player-row' });
  
  // Position pill (blank oval if unknown)
  if (posKey) {
    row.append(el('div', {}, el('span', { class: `pos ${posClass}`, html: posKey })));
  } else {
    row.append(el('div', {}, el('span', { class: 'pos empty', html: '&nbsp;' })));
  }
  
  // Player image or team logo for defenses
  if (hasPlayer) {
    let imgUrl;
    if (p.pos === 'DEF' || p.pos === 'DST') {
      // Use team logo for defenses
      imgUrl = `https://sleepercdn.com/images/team_logos/nfl/${(p.team || '').toLowerCase()}.png`;
    } else {
      // Use player headshot for regular players
      imgUrl = `https://sleepercdn.com/content/nfl/players/thumb/${pid}.jpg`;
    }
    const img = el('img', { 
      class: 'player-thumbnail',
      src: imgUrl,
      alt: p.fn || p.name || 'Player',
      onerror: "this.style.display='none'"
    });
    row.append(el('div', { class: 'player-img-cell' }, img));
  } else {
    row.append(el('div', { class: 'player-img-cell' }));
  }
  
  // Name + meta
  const name = hasPlayer
    // fallbacks cover DST/team defenses which often lack p.fn
    ? (p.fn || p.name || p.fullname || p.displayName || p.team || String(pid))
    : 'Empty';
  const meta = hasPlayer ? [p.team].filter(Boolean).join(' · ') : '';

  const nameDiv = el('div', { class: hasPlayer ? 'player-name' : 'empty-name', html: name });
  
  // Add modal functionality if it's a real player
  if (hasPlayer) {
    nameDiv.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      const { openPlayerPanel } = await import('./player-panel.js');
      openPlayerPanel(pid);
    });
  }
  
  row.append(
    el('div', {},
      nameDiv,
      el('div', { class: 'pmeta', html: meta })
    )
  );
  // Points (keep 0.00 even for empty)
  row.append(el('div', { class: 'pts', html: Number(pts).toFixed(2) }));
  return row;
}

/* ----------------------- Week Selector ----------------------- */

export default async function loadMatchups() {
  const weekSelectorContainer = document.getElementById('matchups-week-selector');
  
  // Get current week
  currentWeek = await getCurrentWeek();
  
  // Initialize week selector
  if (weekSelectorContainer) {
    const handleWeekChange = (newWeek) => {
      currentWeek = newWeek;
      
      // Update display
      const weekDisplay = document.getElementById('matchups-current-week');
      if (weekDisplay) weekDisplay.textContent = newWeek;
      
      // Update button states
      const prevBtn = document.getElementById('matchups-prev-week');
      const nextBtn = document.getElementById('matchups-next-week');
      if (prevBtn) prevBtn.disabled = newWeek <= 1;
      if (nextBtn) nextBtn.disabled = newWeek >= 18;
      
      // Reload matchups
      loadMatchupsForWeek(newWeek);
    };
    
    // Create week selector with navigation
    const prevBtn = el('button', { 
      class: 'week-nav-btn prev', 
      id: 'matchups-prev-week',
      disabled: currentWeek <= 1 
    }, '◄');
    
    const nextBtn = el('button', { 
      class: 'week-nav-btn next', 
      id: 'matchups-next-week',
      disabled: currentWeek >= 18 
    }, '►');
    
    const weekNumberDisplay = el('span', { class: 'week-number', id: 'matchups-current-week' }, currentWeek);
    const weekNumberInput = el('input', { 
      type: 'number', 
      class: 'week-number-input', 
      id: 'matchups-week-input',
      min: '1',
      max: '18',
      value: currentWeek
    });
    
    const weekSelector = el('div', { class: 'week-selector' },
      el('div', { class: 'week-nav' },
        prevBtn,
        el('div', { class: 'week-display' },
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
        weekNumberInput.value = currentWeek;
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
        weekNumberInput.value = currentWeek;
        weekNumberDisplay.style.display = 'block';
        weekNumberInput.style.display = 'none';
      }
    });
    
    // Arrow button handlers
    prevBtn.addEventListener('click', () => {
      if (currentWeek > 1) handleWeekChange(currentWeek - 1);
    });
    
    nextBtn.addEventListener('click', () => {
      if (currentWeek < 18) handleWeekChange(currentWeek + 1);
    });
  }
  
  // Load initial matchups
  await loadMatchupsForWeek(currentWeek);
}
