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

// --- fast caches for usage scoring & team depth
const __usageCache = new Map();           // key: `${season}:${endWeek}:${pid}`
const __teamDepthCache = new Map();       // key: `TD:${season}:${endWeek}:${team}`

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

// --- weekly points for a player in my league
export async function getPlayerWeeklyLeaguePoints(pid, endWeek) {
  const out = [];
  for (let w = 1; w <= endWeek; w++) {
    try {
      const mus = await jget(`/league/${LEAGUE_ID}/matchups/${w}`);
      // find first entry that contains this player in players_points
      let pts = 0;
      for (const m of mus) {
        if (m?.players_points && pid in m.players_points) {
          pts = Number(m.players_points[pid] || 0);
          break;
        }
      }
      out.push({ week: w, pts });
    } catch { out.push({ week: w, pts: 0 }); }
  }
  return out;
}

// --- depth chart from players map (best-effort using Sleeper fields)
export function buildDepthChart(team, pos, playersMap) {
  const T = String(team || '').toUpperCase();
  const P = String(pos || '').toUpperCase().replace('DEF','DST');
  const rows = [];
  for (const [id, p] of Object.entries(playersMap)) {
    if (!p) continue;
    const t = String(p.team || '').toUpperCase();
    const pp = String(p.pos || '').toUpperCase().replace('DEF','DST');
    if (t === T && pp === P) {
      const order = (p.depth_chart_order != null) ? Number(p.depth_chart_order) : 999;
      const spot  = p.depth_chart_position || P;
      rows.push({ player_id: id, name: p.fn || id, order, spot });
    }
  }
  rows.sort((a,b)=> a.order - b.order || a.name.localeCompare(b.name));
  return rows;
}

//one-week NFL stat line (PPR) for a player
export async function getPlayerWeekStats(season, week, pid) {
  try {
    const arr = await jgetAbs(`https://api.sleeper.com/stats/nfl/${season}/${week}?season_type=regular&player_id=${pid}`);
    const rec = Array.isArray(arr) ? arr.find(x => (x.player_id===pid || x.id===pid)) : null;
    if (!rec) return null;
    const s = rec.stats || {};
    const ppr = s.fantasy_points_ppr ?? s.fantasy_points ?? s.ppr ?? 0;
    return { week, ppr: Number(ppr || 0), stats: s, team: rec.team, opponent: rec.opponent || rec.opp };
  } catch { return null; }
}

// Sum a list of keys from a stat object, tolerant of aliases
function __sumStat(s, keys) {
  for (const k of keys) { if (s && s[k] != null) return Number(s[k]) || 0; }
  return 0;
}

// Get a player's total usage over the last N weeks (QB/RB/WR/TE/K)
export async function getRecentUsageScore(season, endWeek, pid, pos, lastN=3) {
  const ck = `${season}:${endWeek}:${pid}`;
  if (__usageCache.has(ck)) return __usageCache.get(ck);
  const start = Math.max(1, endWeek - (lastN - 1));
  let score = 0;
  for (let w = start; w <= endWeek; w++) {
    try {
      const arr = await jgetAbs(`https://api.sleeper.com/stats/nfl/${season}/${w}?season_type=regular&player_id=${pid}`);
      const rec = Array.isArray(arr) ? arr.find(x => x.player_id===pid || x.id===pid) : null;
      const s = rec?.stats || {};
      if (pos === 'QB') {
        score += __sumStat(s, ['pass_att','pass_attempts','passing_attempts','pa']);
      } else if (pos === 'RB') {
        const rush = __sumStat(s, ['rush_att','rush_attempts','rushing_attempts','ra']);
        const tgt  = __sumStat(s, ['tgt','targets','rec_tgt','receiving_targets']);
        score += rush + tgt; // touches + targets
      } else if (pos === 'WR' || pos === 'TE') {
        score += __sumStat(s, ['tgt','targets','rec_tgt','receiving_targets']); // target share proxy
      } else if (pos === 'K') {
        const fga = __sumStat(s, ['fga','kicking_fg_attempts','field_goals_attempts']);
        const xpa = __sumStat(s, ['xpa','kicking_xp_attempts','extra_points_attempts']);
        score += fga + xpa;
      } else if (pos === 'DEF' || pos === 'DST') {
        score += 1; // just to include
      }
    } catch {}
  }
  __usageCache.set(ck, score);
  return score;
}

// Build a full-team depth chart using recent usage as ranking.
// Returns { QB: [...], RB: [...], WR1:[...], WR2:[...], WR3:[...], TE:[...], K:[...], DST:[...] }
export async function buildTeamDepthByUsage(team, season, endWeek, playersMap) {
  const T = String(team || '').toUpperCase();
  const k = `TD:${season}:${endWeek}:${T}`;
  if (__teamDepthCache.has(k)) return __teamDepthCache.get(k);
  // try localStorage
  try {
    const fromLS = localStorage.getItem(k);
    if (fromLS) {
      const val = JSON.parse(fromLS);
      __teamDepthCache.set(k, val);
      return val;
    }
  } catch {}
  const bucket = { QB:[], RB:[], WR:[], TE:[], K:[], DST:[] };

  // collect all players on that NFL team by position
  for (const [pid, p] of Object.entries(playersMap)) {
    if (!p) continue;
    const pos = (p.pos || '').toUpperCase();
    const t   = (p.team || '').toUpperCase();
    if (t !== T) continue;
    if (!['QB','RB','WR','TE','K','DEF','DST'].includes(pos)) continue;
    const normPos = (pos === 'DEF') ? 'DST' : pos;
    bucket[normPos].push({ pid, name: p.fn || pid, pos: normPos });
  }

  // score & sort each bucket
  for (const key of Object.keys(bucket)) {
    const arr = bucket[key];
    await Promise.all(arr.map(async (r) => {
      r.usage = await getRecentUsageScore(season, endWeek, r.pid, r.pos, 3);
      // Light tiebreaker: prefer players that had a depth_chart_order in the static blob
      const pm = playersMap[r.pid];
      r.order = (pm && pm.depth_chart_order != null) ? Number(pm.depth_chart_order) : 999;
    }));
    arr.sort((a,b)=> (b.usage - a.usage) || (a.order - b.order) || a.name.localeCompare(b.name));
  }

  // split WR into WR1/WR2/WR3 (top 3)
  const wr1 = bucket.WR[0] ? [bucket.WR[0]] : [];
  const wr2 = bucket.WR[1] ? [bucket.WR[1]] : [];
  const wr3 = bucket.WR[2] ? [bucket.WR[2]] : [];
  const result = {
    QB: bucket.QB,
    RB: bucket.RB,
    WR1: wr1, WR2: wr2, WR3: wr3,
    TE: bucket.TE,
    K:  bucket.K,
    DST: bucket.DST
  };
  __teamDepthCache.set(k, result);
  try { localStorage.setItem(k, JSON.stringify(result)); } catch {}
  return result;
}
