// scripts/api.js
export const SLEEPER_BASE = 'https://api.sleeper.app/v1';
export const LEAGUE_ID = '1180395246100484096';

// --- fetch helpers ---
export async function jget(path) {
  const res = await fetch(`${SLEEPER_BASE}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${path}`);
  return res.json();
}
export async function jgetAbs(url) {
  const res = await fetch(url, { credentials: 'omit' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

// --- players map cache ---
export async function getPlayersMap() {
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

// --- averages up to week ---
const __avgCache = new Map();
export async function getAvgByRosterUpTo(cutoffWeek) {
  const key = String(Math.max(0, cutoffWeek));
  if (__avgCache.has(key)) return __avgCache.get(key);

  if (cutoffWeek < 1) { __avgCache.set(key, {}); return {}; }

  const totals = Object.create(null);
  const counts = Object.create(null);

  for (let wk = 1; wk <= cutoffWeek; wk++) {
    const weekMatchups = await jget(`/league/${LEAGUE_ID}/matchups/${wk}`);
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

// --- season/week/league bundle ---
export async function getCurrentSeason() {
  try {
    const league = await jget(`/league/${LEAGUE_ID}`);
    return league?.season || new Date().getFullYear();
  } catch {
    return new Date().getFullYear();
  }
}
export async function getCurrentWeek() {
  const state = await jget('/state/nfl');
  return state.display_week ?? state.week ?? state.leg ?? 1;
}
export async function getLeagueBundle() {
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

// --- team normalization ---
export const TEAM_ALIAS = { JAC:'JAX', WSH:'WAS', LA:'LAR', STL:'LAR', SD:'LAC', OAK:'LV' };
export function normTeam(t) {
  if (!t) return '';
  const up = String(t).toUpperCase();
  return TEAM_ALIAS[up] || up;
}

// --- projections + schedule context for a given week ---
export async function getWeekContextFromSleeperSafe(season, week, teamByPid = {}) {
  const PROJ_API = 'https://api.sleeper.com'; // projections & schedule
  const POS_LIST = ['QB','RB','WR','TE','K','DEF'];

  const oppByPid  = Object.create(null);
  const avgByPid  = Object.create(null);
  const oppByTeam = Object.create(null);

  // 1) projections -> opponent
  await Promise.all(POS_LIST.map(async pos => {
    try {
      const url = `${PROJ_API}/projections/nfl/${season}/${week}?season_type=regular&position=${pos}`;
      const arr = await jgetAbs(url);
      (arr || []).forEach(rec => {
        const pid = rec?.player_id || rec?.player?.player_id || rec?.id;
        const opp = rec?.opponent ?? rec?.opp ?? rec?.team_opponent ?? rec?.stats?.opponent ?? rec?.metadata?.opponent ?? '';
        if (pid && opp && !oppByPid[pid]) oppByPid[pid] = String(opp).toUpperCase();
      });
    } catch (e) {
      console.warn('projections fail', pos, e);
    }
  }));

  // 2) season averages (use projections week-by-week, up to week-1)
  await Promise.all(POS_LIST.map(async pos => {
    try {
      const weeks = Array.from({ length: Math.max(0, week - 1) }, (_, i) => i + 1);
      const totals = Object.create(null);
      const games  = Object.create(null);

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
          games[pid]  = (games[pid]  || 0) + 1;
        });
      }));

      for (const pid in totals) {
        if (games[pid] > 0) avgByPid[pid] = totals[pid] / games[pid];
      }
    } catch (e) {
      console.warn(`season avg fail ${pos}`, e);
    }
  }));

  // 3) schedule fallback -> opponent by team, fill missing player opps
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

      // Add BYE for non-playing teams
      const NFL = ['ARI','ATL','BAL','BUF','CAR','CHI','CIN','CLE','DAL','DEN','DET','GB','HOU','IND','JAX','KC','LAC','LAR','LV','MIA','MIN','NE','NO','NYG','NYJ','PHI','PIT','SEA','SF','TB','TEN','WAS'];
      NFL.forEach(t => { if (!playing.has(t)) oppByTeam[t] = 'BYE'; });

      // Fill missing oppByPid using team map
      Object.entries(teamByPid).forEach(([pid, team]) => {
        const t = normTeam(team);
        if ((!oppByPid[pid] || !String(oppByPid[pid]).trim()) && t && oppByTeam[t]) {
          oppByPid[pid] = oppByTeam[t];
        }
      });
    }
  } catch (e) {
    console.warn('schedule fallback fail', e);
  }

  return { oppByPid, avgByPid, oppByTeam };
}
