const playerList = document.getElementById('players');
const roster = document.getElementById('roster');

// Sleeper config for my league
const SLEEPER_BASE = 'https://api.sleeper.app/v1';
const LEAGUE_ID = '1180395246100484096';

// Generic JSON fetch
async function jget(path) {
  const res = await fetch(`${SLEEPER_BASE}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${path}`);
  return res.json();
}

// Cache the big players map in localStorage (shrunk to essentials)
async function getPlayersMap() {
  const key = 'sleeper_players_map_v1';
  const cached = localStorage.getItem(key);
  if (cached) return JSON.parse(cached);
  const data = await jget('/players/nfl'); // ~5MB
  const slim = {};
  for (const [pid, p] of Object.entries(data)) {
    slim[pid] = { fn: p.full_name, pos: p.position, team: p.team };
  }
  localStorage.setItem(key, JSON.stringify(slim));
  return slim;
}

// NFL current week (display_week preferred)
async function getCurrentWeek() {
  const state = await jget('/state/nfl');
  return state.display_week ?? state.week ?? state.leg ?? 1;
}

// Bundle core league info
async function getLeagueBundle() {
  const [league, users, rosters] = await Promise.all([
    jget(`/league/${LEAGUE_ID}`),
    jget(`/league/${LEAGUE_ID}/users`),
    jget(`/league/${LEAGUE_ID}/rosters`),
  ]);
  const userById = {};
  users.forEach(u => userById[u.user_id] = u);
  const ownerByRoster = {};
  rosters.forEach(r => ownerByRoster[r.roster_id] = userById[r.owner_id]);
  return { league, users, rosters, userById, ownerByRoster };
}

// UI helpers
function avatarURL(avatarId, thumb=false) {
  if (!avatarId) return null;
  return `https://sleepercdn.com/avatars/${thumb ? 'thumbs/' : ''}${avatarId}`;
}
function el(tag, attrs={}, ...children) {
  const e = document.createElement(tag);
  Object.entries(attrs).forEach(([k,v]) => {
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else e.setAttribute(k, v);
  });
  children.forEach(c => e.append(c));
  return e;
}


function showPage(id) {
  // Hide/show sections
  document.querySelectorAll("main section").forEach(sec => sec.classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");

  // Active menu
  document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));
  document.querySelectorAll('.menu-item').forEach(item => {
    if (item.getAttribute('onclick').includes(id)) item.classList.add('active');
  });

  // Loaders by page
  if (id === 'standings')    loadStandings();
  if (id === 'rosters')      loadRosters();
  if (id === 'matchups')     loadMatchups();
  if (id === 'transactions') loadTransactions();
  if (id === 'drafts')       loadDrafts();
}



const toggleButton = document.getElementById('toggleSidebar');
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('overlay');
const contentWrapper = document.getElementById('content-wrapper');

toggleButton.addEventListener('click', () => {
    sidebar.classList.toggle('visible');
    toggleButton.classList.toggle('open');
    overlay.classList.toggle('visible');
    contentWrapper.classList.toggle('blurred');
});

// Also close sidebar if clicking outside (overlay click)
overlay.addEventListener('click', () => {
    sidebar.classList.remove('visible');
    toggleButton.classList.remove('open');
    overlay.classList.remove('visible');
    contentWrapper.classList.remove('blurred');
});

// Close sidebar when clicking menu items too
const menuItems = document.querySelectorAll('.menu-item');
menuItems.forEach(item => {
    item.addEventListener('click', () => {
        sidebar.classList.remove('visible');
        toggleButton.classList.remove('open');
        overlay.classList.remove('visible');
        contentWrapper.classList.remove('blurred');
    });
});

//standings page

async function loadStandings() {
  const root = document.getElementById('standings-root');
  root.textContent = 'Loading standings...';
  try {
    const { rosters, ownerByRoster } = await getLeagueBundle();
    const rows = rosters.map(r => {
      const u = ownerByRoster[r.roster_id];
      const teamName = (u?.metadata?.team_name) || u?.display_name || `Roster ${r.roster_id}`;
      const wins = r.settings?.wins ?? 0;
      const losses = r.settings?.losses ?? 0;
      const pts = (r.settings?.fpts ?? 0) + (r.settings?.fpts_decimal ?? 0)/100;
      return { teamName, wins, losses, pts, avatar: u?.avatar };
    }).sort((a,b) => b.wins - a.wins || b.pts - a.pts);

    const table = el('table', { class: 'standings-table' });
    table.append(el('thead', {},
      el('tr', {}, el('th', {}, 'Rank'), el('th', {}, 'Team'),
        el('th', {}, 'W'), el('th', {}, 'L'), el('th', {}, 'PF'))));
    const tbody = el('tbody');
    rows.forEach((r,i) => {
      const av = r.avatar ? el('img', { src: avatarURL(r.avatar, true), width:24, height:24, style:'border-radius:50%;vertical-align:middle;margin-right:8px' }) : '';
      tbody.append(el('tr', {},
        el('td', {}, String(i+1)),
        el('td', {}, el('span', {}, av), document.createTextNode(r.teamName)),
        el('td', {}, String(r.wins)),
        el('td', {}, String(r.losses)),
        el('td', {}, r.pts.toFixed(2))
      ));
    });
    table.append(tbody);
    root.innerHTML = '';
    root.append(table);
  } catch (e) { root.textContent = 'Failed to load standings.'; console.error(e); }
}

// Rosters page

async function loadRosters() {
  const root = document.getElementById('rosters-root');
  root.textContent = 'Loading rosters...';
  try {
    const [{ rosters, ownerByRoster }, players] = await Promise.all([getLeagueBundle(), getPlayersMap()]);
    root.innerHTML = '';
    rosters.forEach(r => {
      const owner = ownerByRoster[r.roster_id];
      const teamName = (owner?.metadata?.team_name) || owner?.display_name || `Roster ${r.roster_id}`;
      const card = el('div', { class: 'news-card' });
      const title = el('strong', { html: teamName });
      const list = el('ul');
      (r.players || []).forEach(pid => {
        const p = players[pid] || {};
        list.append(el('li', {}, `${p.fn ?? pid} ${p.pos ? '('+p.pos+')' : ''} ${p.team ? '– '+p.team : ''}`));
      });
      card.append(title, list);
      root.append(card);
    });
  } catch (e) { root.textContent = 'Failed to load rosters.'; console.error(e); }
}

//matchups page

async function loadMatchups() {
  const root = document.getElementById('matchups-root');
  root.textContent = 'Loading matchups...';
  try {
    const [week, { ownerByRoster }] = await Promise.all([getCurrentWeek(), getLeagueBundle()]);
    const matchups = await jget(`/league/${LEAGUE_ID}/matchups/${week}`);
    const byId = {};
    matchups.forEach(m => { (byId[m.matchup_id] ||= []).push(m); });

    root.innerHTML = '';
    Object.values(byId).forEach(pair => {
      const a = pair[0], b = pair[1] || {};
      const aOwn = ownerByRoster[a?.roster_id], bOwn = ownerByRoster[b?.roster_id];
      const nameA = (aOwn?.metadata?.team_name) || aOwn?.display_name || `Roster ${a?.roster_id ?? '?'}`;
      const nameB = (bOwn?.metadata?.team_name) || bOwn?.display_name || (b ? `Roster ${b.roster_id}` : 'BYE');
      const card = el('div', { class: 'news-card' });
      card.append(
        el('strong', { html: `Week ${week} · ${nameA} vs ${nameB}` }),
        el('p', { html: `<b>${(a?.points ?? 0).toFixed(2)}</b> — <b>${(b?.points ?? 0).toFixed(2)}</b>` })
      );
      root.append(card);
    });
    if (!root.children.length) root.textContent = `No matchups found for Week ${week}.`;
  } catch (e) { root.textContent = 'Failed to load matchups.'; console.error(e); }
}


// transactions page

async function loadTransactions() {
  const root = document.getElementById('tx-root');
  root.textContent = 'Loading transactions...';

  // Helpers
  const fmtTime = (ms) => new Date(ms).toLocaleString();
  const fmtPlayer = (pid, players) => {
    const p = players[pid] || {};
    const name = p.fn || pid;
    const meta = [p.pos, p.team].filter(Boolean).join(' • ');
    return { name, meta };
  };
  const fmtPick = (pk) => {
    // pk: { season, round, roster_id, owner_id, previous_owner_id }
    const yr = pk.season || '—';
    const rd = pk.round ? `R${pk.round}` : 'R?';
    return `${yr} ${rd}`;
  };

  try {
    const [week, { ownerByRoster }, players] = await Promise.all([
      getCurrentWeek(),
      getLeagueBundle(),
      getPlayersMap()
    ]);

    const txs = await jget(`/league/${LEAGUE_ID}/transactions/${week}`);
    if (!txs.length) { root.textContent = `No transactions for Week ${week}.`; return; }

    root.innerHTML = '';
    txs.forEach(tx => {
      const type = (tx.type || '').toLowerCase(); // trade, free_agent, waiver, commissioner, etc.
      const when = fmtTime(tx.created || tx.status_updated || Date.now());

      // Base card
      const card = el('div', { class: 'news-card tx-card' });
      const header = el('div', { class: 'tx-header' });
      const icon = el('div', { class: 'tx-icon' });
      const title = el('div', { class: 'tx-title' });

      // Choose icon + title
      if (type === 'trade') {
        icon.textContent = '🔄';
        const teams = (tx.roster_ids || []).map(rid => {
          const u = ownerByRoster[rid];
          return (u?.metadata?.team_name) || u?.display_name || `Roster ${rid}`;
        }).join(' & ');
        title.textContent = `TRADE · ${teams}`;
      } else if (type === 'waiver') {
        icon.textContent = '🪙';
        // usually one recipient roster in adds
        const rid = tx.adds ? Object.values(tx.adds)[0] : null;
        const u = rid ? ownerByRoster[rid] : null;
        const team = (u?.metadata?.team_name) || u?.display_name || (rid ? `Roster ${rid}` : '—');
        title.textContent = `WAIVER · ${team}`;
      } else if (type === 'free_agent') {
        icon.textContent = '🆓';
        const rid = tx.adds ? Object.values(tx.adds)[0] : (tx.drops ? Object.values(tx.drops)[0] : null);
        const u = rid ? ownerByRoster[rid] : null;
        const team = (u?.metadata?.team_name) || u?.display_name || (rid ? `Roster ${rid}` : '—');
        title.textContent = `FREE AGENT · ${team}`;
      } else {
        icon.textContent = '🛠️';
        title.textContent = `${(tx.type || 'TRANSACTION').toUpperCase()}`;
      }

      header.append(icon, title);
      card.append(header);
      card.append(el('div', { class: 'tx-meta', html: when }));

      // Render bodies by type
      if (type === 'trade') {
        // Build per-roster gains/losses
        const adds = tx.adds || {};  // { player_id: roster_id }
        const drops = tx.drops || {}; // { player_id: roster_id }
        const picks = tx.draft_picks || []; // each has owner changes

        // index picks gained/lost by roster
        const pickGainsBy = {};
        const pickLossBy = {};
        picks.forEach(pk => {
          // when traded, owner_id = new owner after trade; previous_owner_id = old
          (pickGainsBy[pk.owner_id] ||= []).push(pk);
          (pickLossBy[pk.previous_owner_id] ||= []).push(pk);
        });

        const grid = el('div', { class: 'tx-grid' });

        (tx.roster_ids || []).forEach(rid => {
          const u = ownerByRoster[rid];
          const team = (u?.metadata?.team_name) || u?.display_name || `Roster ${rid}`;

          // Gains: players whose adds[...] === rid
          const gains = Object.entries(adds)
            .filter(([, to]) => to === rid)
            .map(([pid]) => ({ ...fmtPlayer(pid, players), pid }));

          // Losses: players whose drops[...] === rid
          const losses = Object.entries(drops)
            .filter(([, from]) => from === rid)
            .map(([pid]) => ({ ...fmtPlayer(pid, players), pid }));

          const pickGains = pickGainsBy[rid] || [];
          const pickLosses = pickLossBy[rid] || [];

          const col = el('div', { class: 'tx-team' });
          col.append(el('span', { class: 'tx-team-name', html: team }));

          if (gains.length || pickGains.length) {
            col.append(el('div', { class: 'tx-section-label', html: 'Gained' }));
            const wrap = el('div', { class: 'pills' });
            gains.forEach(p => {
              const pill = el('span', { class: 'pill gain', html: p.name + (p.meta ? `<small>${p.meta}</small>` : '') });
              wrap.append(pill);
            });
            pickGains.forEach(pk => {
              wrap.append(el('span', { class: 'pill gain pick', html: fmtPick(pk) }));
            });
            col.append(wrap);
          }

          if (losses.length || pickLosses.length) {
            col.append(el('div', { class: 'tx-section-label', html: 'Sent' }));
            const wrap = el('div', { class: 'pills' });
            losses.forEach(p => {
              const pill = el('span', { class: 'pill loss', html: p.name + (p.meta ? `<small>${p.meta}</small>` : '') });
              wrap.append(pill);
            });
            pickLosses.forEach(pk => {
              wrap.append(el('span', { class: 'pill loss pick', html: fmtPick(pk) }));
            });
            col.append(wrap);
          }

          // Handle odd cases (no adds/drops recorded)
          if (!col.querySelector('.pills')) {
            col.append(el('div', { class: 'tx-section-label', html: 'No changes recorded' }));
          }

          grid.append(col);
        });

        card.append(grid);

      } else {
        // Single-owner style (waiver/free_agent/commissioner)
        const adds = tx.adds ? Object.keys(tx.adds).map(pid => fmtPlayer(pid, players)) : [];
        const drops = tx.drops ? Object.keys(tx.drops).map(pid => fmtPlayer(pid, players)) : [];
        const single = el('div', { class: 'tx-single' });
        const rows = [];

        if (adds.length) {
          const row = el('div', { class: 'tx-badges' });
          row.append(el('span', { class: 'tx-badge', html: 'Added' }));
          const pills = el('div', { class: 'pills' });
          adds.forEach(p => pills.append(el('span', { class: 'pill gain', html: p.name + (p.meta ? `<small>${p.meta}</small>` : '') })));
          row.append(pills);
          rows.push(row);
        }
        if (drops.length) {
          const row = el('div', { class: 'tx-badges' });
          row.append(el('span', { class: 'tx-badge', html: 'Dropped' }));
          const pills = el('div', { class: 'pills' });
          drops.forEach(p => pills.append(el('span', { class: 'pill loss', html: p.name + (p.meta ? `<small>${p.meta}</small>` : '') })));
          row.append(pills);
          rows.push(row);
        }

        if (!rows.length) {
          single.append(el('div', { class: 'tx-meta', html: 'No player movement recorded.' }));
        } else {
          rows.forEach(r => single.append(r));
        }

        // FAAB info for waivers
        if (type === 'waiver' && typeof tx.waiver_bid === 'number') {
          single.append(el('div', { class: 'tx-meta', html: `FAAB: ${tx.waiver_bid}` }));
        }

        card.append(single);
      }

      root.append(card);
    });
  } catch (e) {
    console.error(e);
    root.textContent = 'Failed to load transactions.';
  }
}


// drafts page

async function loadDrafts() {
  const root = document.getElementById('drafts-root');
  root.textContent = 'Loading drafts...';
  try {
    const drafts = await jget(`/league/${LEAGUE_ID}/drafts`);
    if (!drafts.length) { root.textContent = 'No drafts found.'; return; }
    const players = await getPlayersMap();

    root.innerHTML = '';
    drafts.forEach(d => {
      const card = el('div', { class: 'news-card' });
      const start = d.start_time ? new Date(d.start_time).toLocaleString() : 'unknown';
      const btn = el('button', {}, 'View Picks');

      btn.addEventListener('click', async () => {
        btn.disabled = true;
        const picks = await jget(`/draft/${d.draft_id}/picks`);
        const list = el('ul');
        picks.forEach(pk => {
          const p = players[pk.player_id] || {};
          const name = p.fn || pk.player_id;
          list.append(el('li', {}, `Rnd ${pk.round} · Pick ${pk.pick_no || pk.pick} — Roster ${pk.roster_id} — ${name}${p.pos ? ' ('+p.pos+')' : ''}${p.team ? ' – '+p.team : ''}`));
        });
        card.append(list);
      });

      card.append(
        el('strong', { html: `${d.metadata?.name || 'Draft'} — ${d.season || ''} (${d.settings?.rounds || '?'} rounds)` }),
        el('p', { html: `Type: ${d.type} · Status: ${d.status} · Start: ${start}` }),
        btn
      );
      root.append(card);
    });
  } catch (e) { root.textContent = 'Failed to load drafts.'; console.error(e); }
}


showPage('home');
