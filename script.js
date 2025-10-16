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

async function jgetAbs(url) {
  const res = await fetch(url, { credentials: 'omit' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
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

// ----- Season-to-date team averages up to (and including) cutoffWeek -----
const __avgCache = new Map(); // key = cutoffWeek, val = {rid -> avg}

async function getAvgByRosterUpTo(cutoffWeek) {
  const key = String(Math.max(0, cutoffWeek));
  if (__avgCache.has(key)) return __avgCache.get(key);

  // Nothing to average before Week 1
  if (cutoffWeek < 1) { __avgCache.set(key, {}); return {}; }

  const totals = Object.create(null);
  const counts = Object.create(null);

  for (let wk = 1; wk <= cutoffWeek; wk++) {
    const weekMatchups = await jget(`/league/${LEAGUE_ID}/matchups/${wk}`);
    // Count exactly one game per roster per week (defensive de-dupe)
    const seen = new Set(); // `${wk}:${roster_id}`
    for (const m of weekMatchups) {
      const rid = m.roster_id;
      const tag = `${wk}:${rid}`;
      if (seen.has(tag)) continue;
      seen.add(tag);
      const pts = Number(m.points ?? 0);
      totals[rid] = (totals[rid] || 0) + pts;
      counts[rid] = (counts[rid] || 0) + 1;
    }
  }

  const avgByRoster = Object.create(null);
  for (const rid in totals) {
    avgByRoster[rid] = totals[rid] / Math.max(1, counts[rid]);
  }
  __avgCache.set(key, avgByRoster);
  return avgByRoster;
}


// Hide or rename certain users
const HIDDEN_USERS = {
  // use their Sleeper display_name or team_name as keys
  "jewishpoosayslay": "Eitan's Team",     // replace the team name
  "jewishpoosayslay": "Eitan's Team",         // replace the username
};

// Helper to filter out unwanted team names/usernames
function sanitizeName(name) {
  if (!name) return name;
  return HIDDEN_USERS[name] || name;
}

async function getCurrentSeason() {
  try {
    const league = await jget(`/league/${LEAGUE_ID}`);
    return league?.season || new Date().getFullYear();
  } catch {
    return new Date().getFullYear();
  }
}

// Normalize schedule/team codes to Sleeper-style abbreviations
const TEAM_ALIAS = {
  JAC: 'JAX',
  WSH: 'WAS',
  LA:  'LAR',   // older feeds sometimes use "LA" for Rams
  STL: 'LAR',   // very old Rams code
  SD:  'LAC',   // old Chargers code
  OAK: 'LV'     // old Raiders code
};
function normTeam(t) {
  if (!t) return '';
  const up = String(t).toUpperCase();
  return TEAM_ALIAS[up] || up;
}

// teamByPid is a map like { "PLAYER_ID": "KC", ... } built during render
// REPLACE the first line of the function with these two lines:
async function getWeekContextFromSleeperSafe(season, week, teamByPid = {}) {
  const PROJ_API = 'https://api.sleeper.com';      // projections & schedule OK here
  const APP_API  = 'https://api.sleeper.app/v1';   // v1 app API matches player ids
  const POS_LIST = ['QB','RB','WR','TE','K','DEF'];

  const oppByPid  = Object.create(null);
  const avgByPid  = Object.create(null);
  const oppByTeam = Object.create(null);

  // 1) projections -> opponent  (UNCHANGED except the base)
  await Promise.all(POS_LIST.map(async pos => {
    try {
      const url = `${PROJ_API}/projections/nfl/${season}/${week}?season_type=regular&position=${pos}`;
      const arr = await jgetAbs(url);
      (arr || []).forEach(rec => {
        const pid = rec?.player_id || rec?.player?.player_id || rec?.id;
        const opp = rec?.opponent ?? rec?.opp ?? rec?.team_opponent ?? rec?.stats?.opponent ?? rec?.metadata?.opponent ?? '';
        if (pid && opp && !oppByPid[pid]) oppByPid[pid] = String(opp).toUpperCase();
      });
    } catch (e) { console.warn('projections fail', pos, e); }
  }));

    // 2) season averages (use projections endpoint instead of stats)
  await Promise.all(POS_LIST.map(async pos => {
    try {
      const weeks = Array.from({ length: week - 1 }, (_, i) => i + 1); // all weeks before current
      const totals = Object.create(null);
      const games = Object.create(null);

      // pull weekly projections and sum fantasy points
      await Promise.all(weeks.map(async w => {
        const url = `${PROJ_API}/projections/nfl/${season}/${w}?season_type=regular&position=${pos}`;
        const arr = await jgetAbs(url);
        (arr || []).forEach(rec => {
          const pid = rec?.player_id || rec?.id;
          const stats = rec?.stats || {};
          const pts =
            stats.fantasy_points_ppr ??
            stats.fantasy_points ??
            stats.pts_ppr ??
            stats.ppr ??
            0;
          if (!pid || !pts) return;
          totals[pid] = (totals[pid] || 0) + pts;
          games[pid] = (games[pid] || 0) + 1;
        });
      }));

    // compute averages
    for (const pid in totals) {
      if (games[pid] > 0) avgByPid[pid] = totals[pid] / games[pid];
    }
  } catch (e) {
    console.warn(`season avg fail ${pos}`, e);
  }
}));



  // 3) schedule fallback -> oppByTeam  (UNCHANGED except the base)
  try {
    const sched = await jgetAbs(`${PROJ_API}/schedule/nfl/${season}/${week}`);  
    if (Array.isArray(sched)) {
      const playing = new Set();
      sched.forEach(g => {
        const rawHome = g?.home_team;
        const rawAway = g?.away_team;
        const home = normTeam(rawHome);
        const away = normTeam(rawAway);
        if (!home || !away) return;
        playing.add(home); playing.add(away);
        oppByTeam[home] = `vs ${away}`;
        oppByTeam[away] = `@ ${home}`;
      });

    // Sleeper-style canonical list (already used elsewhere)
    const NFL = ['ARI','ATL','BAL','BUF','CAR','CHI','CIN','CLE','DAL','DEN','DET','GB','HOU','IND','JAX','KC','LAC','LAR','LV','MIA','MIN','NE','NO','NYG','NYJ','PHI','PIT','SEA','SF','TB','TEN','WAS'];
    NFL.forEach(t => { if (!playing.has(t)) oppByTeam[t] = 'BYE'; });

    // Fill missing player opponents from team map (handles 0-proj / injured)
    Object.entries(teamByPid).forEach(([pid, team]) => {
      const t = normTeam(team);
      if ((!oppByPid[pid] || !String(oppByPid[pid]).trim()) && t && oppByTeam[t]) {
        oppByPid[pid] = oppByTeam[t];
      }
    });
  }
} catch (e) { console.warn('schedule fallback fail', e); }
return { oppByPid, avgByPid, oppByTeam };   // <-- return oppByTeam too
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
      const teamName = sanitizeName((u?.metadata?.team_name) || u?.display_name || `Roster ${r.roster_id}`);
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

// Rosters page (expandable tiles; Starters/Bench/IR/Taxi; sorted & colored)
// SAFER Rosters: renders first, then hydrates matchup + avg
async function loadRosters() {
  const root = document.getElementById('rosters-root');
  root.textContent = 'Loading rosters...';

  // helpers
  const POS_ORDER = { QB:0, RB:1, WR:2, TE:3, K:4, DST:5, DEF:5 };
  const byPosThenName = arr => arr.sort((a,b)=>{
    const ak = POS_ORDER[a.pos] ?? 99, bk = POS_ORDER[b.pos] ?? 99;
    if (ak !== bk) return ak - bk;
    return (a.fn||'').localeCompare(b.fn||'');
  });
  const posKey = p => (p.pos === 'DEF' ? 'DST' : (p.pos||''));
  const posClass = p => ((p.pos||'').toLowerCase() === 'def' ? 'dst' : (p.pos||'').toLowerCase());

  try {
    // base data
    const [week, leagueBundle, playersMap] = await Promise.all([
      getCurrentWeek(),
      getLeagueBundle(),   // { rosters, ownerByRoster }
      getPlayersMap()
    ]);
    const { rosters, ownerByRoster } = leagueBundle;
    const teamByPid = {};

    // starters from matchups (if this fails, we still render without starters emphasis)
    let startersByRoster = {};
    try {
      const matchups = await jget(`/league/${LEAGUE_ID}/matchups/${week}`);
      matchups.forEach(m => { if (m?.roster_id) startersByRoster[m.roster_id] = (m.starters||[]).filter(Boolean); });
    } catch (e) {
      console.warn('matchups fetch failed', e);
    }

    // render skeleton
    root.innerHTML = '';
    rosters.forEach(r => {
      const owner = ownerByRoster[r.roster_id];
      const teamName = (owner?.metadata?.team_name) || owner?.display_name || `Roster ${r.roster_id}`;

      const all = (r.players||[]).filter(Boolean);
      const ir  = (r.reserve||[]).filter(Boolean);
      const taxi= (r.taxi||[]).filter(Boolean);
      const starters = (startersByRoster[r.roster_id]||[]).filter(Boolean);
      const exclude = new Set([...starters, ...ir, ...taxi]);
      const bench = all.filter(pid => !exclude.has(pid));

      const pick = (pid) => {
        const p = playersMap[pid] || {};
        const pos = p.pos === 'DEF' ? 'DST' : p.pos;
        const team = p.team || '';
        teamByPid[pid] = team;                 // <<< NEW: save team for fallback
        return { pid, fn: p.fn || pid, pos, team };
      };


      const startersList = byPosThenName(starters.map(pick));
      const benchList    = byPosThenName(bench.map(pick));
      const irList       = byPosThenName(ir.map(pick));
      const taxiList     = byPosThenName(taxi.map(pick));

      // card
      const card   = el('div', { class:'news-card ros-card' });
      const header = el('div', { class:'ros-header', role:'button', tabindex:'0' });
      header.append(el('div', { class:'ros-title', html: teamName }),
                    el('div', { class:'pmeta', html:`Week ${week}` }));
      const body   = el('div', { class:'ros-body' });
      const inner  = el('div', { class:'ros-inner' });

      inner.append(section('Starters', startersList, true));
      inner.append(section('Bench', benchList));
      inner.append(section('IR', irList));
      inner.append(section('Taxi', taxiList));

      body.append(inner);
      card.append(header, body);
      const toggle = () => body.classList.toggle('open');
      header.addEventListener('click', toggle);
      header.addEventListener('keydown', e => { if (e.key==='Enter'||e.key===' ') { e.preventDefault(); toggle(); } });

      root.append(card);
    });

    if (!root.children.length) root.textContent = 'No rosters found.';

    // hydrate matchup + avg AFTER render (non-fatal if it fails)
    const season = await getCurrentSeason();
    const { oppByPid, avgByPid, oppByTeam } = await getWeekContextFromSleeperSafe(season, week, teamByPid);

    document.querySelectorAll('[data-pid]').forEach(node => {
      const pid = node.getAttribute('data-pid');
      let opp = oppByPid[pid];
      if (!opp) {
        const team = normTeam(teamByPid[pid] || '');
        if (team && oppByTeam && oppByTeam[team]) opp = oppByTeam[team];
      }
      const avg = avgByPid[pid];
      const mEl = node.querySelector('.badge.mup');
      const aEl = node.querySelector('.badge.avg');

      if (mEl) {
        let label = '––';
        if (opp) {
          const s = String(opp).trim().toUpperCase();
          if (s === 'BYE') label = 'BYE/OUT';
          else if (s.startsWith('@') || s.startsWith('VS')) label = s;
          else label = `vs ${s}`;
        }
        mEl.textContent = label;
      }
      if (aEl) aEl.textContent = (avg != null && isFinite(avg)) ? `${avg.toFixed(1)} avg` : '—';
    });


    // ===== helpers used above =====
    function section(title, items, emphasize=false) {
      const wrap = el('div', {});
      wrap.append(el('div', { class:'group-title', html:title }));
      if (!items.length) {
        wrap.append(rowSkeleton(null));
        return wrap;
      }
      items.forEach(p => wrap.append(rowSkeleton(p, emphasize)));
      return wrap;
    }

    function rowSkeleton(p, emphasize=false) {
      // If p is null, render an empty row
      const row = el('div', { class:'player-row', ...(p? { 'data-pid': p.pid } : {}) });

      // left: position
      row.append(el('div', {}, el('span', { class:`pos ${p? posClass(p):''}`, html: p? posKey(p): '—' })));

      // middle: name + team
      const name = p ? (emphasize ? `<strong>${p.fn}</strong>` : p.fn) : 'No players';
      const meta = p ? (p.team || '') : '';
      row.append(el('div', {}, el('div', { html:name }), el('div', { class:'pmeta', html:meta })));

      // right badges: matchup + avg (filled later)
      row.append(el('div', { class:'cell' }, el('span', { class:'badge mup', html:'...' })));
      row.append(el('div', { class:'cell' }, el('span', { class:'badge avg', html:'...' })));

      return row;
    }

    function normalizeOpp(opp) {
      const s = String(opp).trim();
      if (!s) return '––';
      if (s.startsWith('@') || s.startsWith('vs')) return s;
      return `vs ${s.toUpperCase()}`;
    }

  } catch (err) {
    console.error('loadRosters fatal:', err);
    const root = document.getElementById('rosters-root');
    root.textContent = 'Failed to load rosters.';
  }
}



//matchups page

async function loadMatchups() {
  const root = document.getElementById('matchups-root');
  root.textContent = 'Loading matchups...';
  try {
    const [week, { ownerByRoster }, players] = await Promise.all([
      getCurrentWeek(),
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
        el('div', { class: 'match-title', html: `Week ${week} · ${nameA} <span style="opacity:.6">vs</span> ${nameB}` }),
        el('div', { class: 'match-avg',   html: `Avg: ${isFinite(aAvg) ? aAvg.toFixed(1) : '—'} — ${isFinite(bAvg) ? bAvg.toFixed(1) : '—'}` })
      );

      const score = el('div', { class: 'match-score', html: `${(a?.points ?? 0).toFixed(2)} — ${(b?.points ?? 0).toFixed(2)}` });

      header.append(left, score);
      card.append(header);

      // Body (hidden by default)
      const body = el('div', { class: 'match-body' });
      const grid = el('div', { class: 'match-grid' });
      grid.append(
        buildTeamCol(a, nameA, players),
        buildTeamCol(b, nameB, players)
      );
      body.append(grid);
      card.append(body);

      // Toggle logic
      const toggle = () => body.classList.toggle('open');
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

// Helper: build a team column with Starters + Bench

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

// Helper: one player line

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
  // Name + meta
  const name = hasPlayer
    // fallbacks cover DST/team defenses which often lack p.fn
    ? (p.fn || p.name || p.fullname || p.displayName || p.team || String(pid))
    : 'Empty';
  const meta = hasPlayer ? [p.team].filter(Boolean).join(' · ') : '';
  row.append(
    el('div', {},
      el('div', { html: name, class: hasPlayer ? '' : 'empty-name' }),
      el('div', { class: 'pmeta', html: meta })
    )
  );
  // Points (keep 0.00 even for empty)
  row.append(el('div', { class: 'pts', html: Number(pts).toFixed(2) }));
  return row;
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

// Helper: map position -> CSS class
function posClass(pos) {
  const p = (pos || 'UNK').toUpperCase();
  return ['QB','RB','WR','TE','K','DST'].includes(p) ? `pos-${p}` : 'pos-UNK';
}
function shortName(name, max=16) {
  if (!name) return '';
  return name.length > max ? name.slice(0, max-1) + '…' : name;
}
function teamNameFromUser(u) {
  return (u?.metadata?.team_name) || u?.display_name || '—';
}
function avatarURLSafe(u) {
  return u?.avatar ? avatarURL(u.avatar, true) : null;
}

async function loadDrafts() {
  const root = document.getElementById('drafts-root');
  root.textContent = 'Loading drafts...';

  try {
    const players = await getPlayersMap();

    // Walk back through all linked seasons, gathering drafts + local owner maps
    const collected = []; // [{leagueId, draft, ownerByRoster}]
    let lid = LEAGUE_ID;

    while (lid) {
      const league = await jget(`/league/${lid}`);
      const [users, rosters, drafts] = await Promise.all([
        jget(`/league/${lid}/users`),
        jget(`/league/${lid}/rosters`),
        jget(`/league/${lid}/drafts`)
      ]);

      const userById = {};
      users.forEach(u => userById[u.user_id] = u);
      const ownerByRoster = {};
      rosters.forEach(r => ownerByRoster[r.roster_id] = userById[r.owner_id]);

      drafts.forEach(d => collected.push({ leagueId: lid, draft: d, ownerByRoster }));
      lid = league.previous_league_id || null; // move to previous season
    }

    if (!collected.length) { root.textContent = 'No drafts found.'; return; }

    // Sort newest → oldest (by season then start_time if present)
    collected.sort((a, b) => {
      const sa = Number(a.draft.season || 0), sb = Number(b.draft.season || 0);
      if (sb !== sa) return sb - sa;
      const ta = a.draft.start_time || 0, tb = b.draft.start_time || 0;
      return (tb - ta);
    });

    root.innerHTML = '';
    for (const { draft: d, ownerByRoster } of collected) {
      const card = el('div', { class: 'news-card draft-card' });

      const start = d.start_time ? new Date(d.start_time).toLocaleString() : 'unknown';
      const title = el('strong', {
        html: `${d.metadata?.name || 'Draft'} — ${d.season || ''} (${d.settings?.rounds || '?'} rounds)`
      });
      const meta = el('div', { class: 'draft-meta', html: `Type: ${d.type} · Status: ${d.status} · Start: ${start}` });

      const scroller = el('div', { class: 'draft-scroller' });
      const board = el('div', { class: 'draft-board' });
      scroller.append(board);
      card.append(title, meta, scroller);
      root.append(card);

      // Fetch picks and render as colored tiles
      const picks = await jget(`/draft/${d.draft_id}/picks`);

      // Keep Sleeper's order if pick_no exists; otherwise by (round, pick)
      picks.sort((a, b) => {
        const ao = (a.pick_no ?? ((a.round ?? 0) * 1000 + (a.pick ?? 0)));
        const bo = (b.pick_no ?? ((b.round ?? 0) * 1000 + (b.pick ?? 0)));
        return ao - bo;
      });

      picks.forEach(pk => {
        const p = players[pk.player_id] || {};
        const owner = ownerByRoster[pk.roster_id];

        const node = el('div', { class: `tile ${posClass(p.pos)}` });
        const rn = `R${pk.round ?? '?'} · P${(pk.pick_no ?? pk.pick ?? '?')}`;

        const line1 = el('div', { class: 'line1' });
        line1.append(
          el('div', { html: `${shortName(p.fn || pk.player_id, 18)}` }),
          el('div', { html: rn })
        );

        const line2 = el('div', {
          class: 'line2',
          html: `${p.pos ? p.pos : '?'} ${p.team ? '· '+p.team : ''}`
        });

        const line3 = el('div', { class: 'line3' });
        const av = avatarURLSafe(owner);
        if (av) line3.append(el('img', { class: 'avatar', src: av, alt: 'avatar' }));
        line3.append(el('span', { html: shortName(teamNameFromUser(owner), 18) }));

        node.append(line1, line2, line3);
        board.append(node);
      });
    }
  } catch (e) {
    console.error(e);
    root.textContent = 'Failed to load drafts.';
  }
}


// Power Rankings (located within standings)

// Auto-proxy when running on localhost to avoid CORS; use no proxy on a hosted site.
const PR_PROXY = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? 'https://corsproxy.io/?'
  : '';


async function loadPowerRankings() {
  const container = document.getElementById('power-rankings');
  if (!container) return; // nothing to render into
  const metricSelect = document.getElementById('pr-metric');

  container.innerHTML = '<div class="power-card"><span>Loading…</span></div>';

  try {
    // 1) Base data
    const [rostersRes, usersRes, stateRes] = await Promise.all([
      fetch(`${PR_PROXY}https://api.sleeper.app/v1/league/${LEAGUE_ID}/rosters`),
      fetch(`${PR_PROXY}https://api.sleeper.app/v1/league/${LEAGUE_ID}/users`),
      fetch(`${PR_PROXY}https://api.sleeper.app/v1/state/nfl`)
    ]);
    if (!rostersRes.ok || !usersRes.ok || !stateRes.ok) {
      throw new Error(`HTTP ${rostersRes.status}/${usersRes.status}/${stateRes.status}`);
    }
    const [rosters, users, state] = await Promise.all([
      rostersRes.json(), usersRes.json(), stateRes.json()
    ]);

    // Build team shells keyed by roster_id
    const teams = new Map();
    for (const r of rosters) {
      const owner = users.find(u => u.user_id === r.owner_id);
      const wins   = r.settings?.wins ?? 0;
      const losses = r.settings?.losses ?? 0;
      const ties   = r.settings?.ties ?? 0;
      const games  = Math.max(wins + losses + ties, 1);
      teams.set(r.roster_id, {
        rosterId: r.roster_id,
        name: owner?.display_name || owner?.username || 'Unknown',
        wins, losses, ties,
        winPct: wins / games,
        weekly: [],
        avg: 0, high: 0, low: 0, fpts: 0,
        power: 0
      });
    }

    // 2) Pull all weeks’ matchups up to current week (skip silently on errors)
    const currentWeek = Math.max(1, parseInt(state?.week || '1', 10));
    for (let wk = 1; wk < currentWeek; wk++) {
      const res = await fetch(`${PR_PROXY}https://api.sleeper.app/v1/league/${LEAGUE_ID}/matchups/${wk}`);
      if (!res.ok) continue;
      const matchups = await res.json();
      for (const m of matchups) {
        const team = teams.get(m.roster_id);
        if (!team) continue;
        team.weekly.push(Number(m.points ?? 0));
      }
    }

    // 3) Compute AVG/HIGH/LOW/TOTAL and Oberon power
    for (const t of teams.values()) {
      if (t.weekly.length) {
        const nonZeroWeeks = t.weekly.filter(w => w > 0);
        t.fpts = t.weekly.reduce((a, b) => a + b, 0);
        t.avg  = t.fpts / t.weekly.length;
        t.high = Math.max(...t.weekly);
        t.low  = nonZeroWeeks.length ? Math.min(...nonZeroWeeks) : t.high;
      } else {
        t.fpts = 0; t.avg = 0; t.high = 0; t.low = 0;
      }

      // Oberon Mt. Power Rating:
      // Power = ((avg * 6) + ((high + low) * 2) + ((win% * 200) * 2)) / 10
      t.power = (
        (t.avg * 6) +
        ((t.high + t.low) * 2) +
        ((t.winPct * 200) * 2)
      ) / 10;
    }

    // 4) Sort by selected metric (defaults to power)
    const arr = [...teams.values()];
    const metric = metricSelect?.value || 'power';
    const sorters = {
      power:  (a, b) => b.power - a.power || b.avg - a.avg,
      wins:   (a, b) => b.wins  - a.wins  || b.avg - a.avg,
      points: (a, b) => b.fpts  - a.fpts  || b.wins - a.wins,
    };
    arr.sort(sorters[metric] || sorters.power);

    // 5) Render
    container.innerHTML = arr.map((t, i) => `
      <div class="power-card">
        <span class="rank">#${i + 1}</span>
        <span class="team-name">${escapeHtml(t.name)}</span>
        <span class="tag">${t.wins}-${t.losses}${t.ties ? '-' + t.ties : ''} (${(t.winPct*100).toFixed(0)}% W%)</span>
        <span class="points">
          PWR: ${t.power.toFixed(1)}<br>
          AVG: ${t.avg.toFixed(2)} | HI: ${t.high.toFixed(2)} | LO: ${t.low.toFixed(2)}
        </span>
      </div>
    `).join('');
  } catch (err) {
    console.error('Power Rankings Error:', err);
    container.innerHTML = '<div class="power-card"><span style="color:#c00;">Failed to load rankings. See console.</span></div>';
  }
}

// tiny escaper (safe, no globals touched)

function escapeHtml(s=''){
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

//Power Rankings wiring (no nav overrides)

(function wirePowerRankings() {
  const standingsSection = document.getElementById('standings');
  if (!standingsSection) return;

  // Load once if Standings is already visible on first paint
  if (!standingsSection.classList.contains('hidden')) {
    loadPowerRankings();
  }

  // Re-load whenever the Standings section is shown (class "hidden" toggled)
  const obs = new MutationObserver(() => {
    if (!standingsSection.classList.contains('hidden')) {
      loadPowerRankings();
    }
  });
  obs.observe(standingsSection, { attributes: true, attributeFilter: ['class'] });

  // Controls
  document.getElementById('pr-refresh')?.addEventListener('click', loadPowerRankings);
  document.getElementById('pr-metric')?.addEventListener('change', loadPowerRankings);
})();


showPage('home');
