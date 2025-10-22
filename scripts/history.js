/* 
['WillH19', '774791902347292672']
['jalennaran', '777420886881054720']
['jewishpoosayslay', '778145469917573120']
['cwby', '778145867629854720']
['obamaba', '778146236627886080']
['PrinceAiden', '783494897797017600']
['Benhewitt16', '783500537361719296']
['bradybennigson', '810300650150809600']
['GodPurdy', '860798805627486208']
['jjjjames', '1142954929573928960']
*/

// scripts/history.js
import { jget, LEAGUE_ID, getPlayersMap } from './api.js';
import { el, sanitizeName } from './ui.js';

/* ----------------------- Cache helpers ----------------------- */
const TEAM_CACHE = new Map();                // runtime cache (per page load)
const LS_KEY = 'teamHistory:v1';             // bump to invalidate old cache

function loadPersist() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); }
  catch { return {}; }
}
const PERSIST = loadPersist();

function persist(uid, data) {
  PERSIST[uid] = data;
  try { localStorage.setItem(LS_KEY, JSON.stringify(PERSIST)); } catch {}
}

/* ----------------------- Data walkers ------------------------ */
// Walk back through linked seasons (most-recent → oldest)
async function collectSeasons(startLeagueId) {
  const seasons = [];  // [{ leagueId, league, users, rosters, ownerByRoster }]
  let lid = startLeagueId;
  while (lid) {
    const league = await jget(`/league/${lid}`);
    const [users, rosters] = await Promise.all([
      jget(`/league/${lid}/users`),
      jget(`/league/${lid}/rosters`),
    ]);
    const userById = Object.fromEntries(users.map(u => [u.user_id, u]));
    const ownerByRoster = {};
    rosters.forEach(r => (ownerByRoster[r.roster_id] = userById[r.owner_id]));
    seasons.push({ leagueId: lid, league, users, rosters, ownerByRoster });
    lid = league.previous_league_id || null;
  }
  seasons.sort((a,b) => Number(b.league.season||0) - Number(a.league.season||0));
  return seasons;
}

// Try to get champion roster_ids for a league via winners bracket
async function getChampionsForLeague(leagueId) {
  try {
    const bracket = await jget(`/league/${leagueId}/winners_bracket`);
    if (!Array.isArray(bracket) || !bracket.length) return new Set();
    const maxRound = Math.max(...bracket.map(b => b.round || 0));
    const finals = bracket.filter(b => b.round === maxRound);
    const winners = new Set();
    for (const node of finals) {
      const a = node?.t1_from?.roster_id ?? node?.t1 ?? node?.r1;
      const b = node?.t2_from?.roster_id ?? node?.t2 ?? node?.r2;
      const ap = Number(node?.t1_points ?? node?.p1 ?? 0);
      const bp = Number(node?.t2_points ?? node?.p2 ?? 0);
      if (a && b) winners.add(ap >= bp ? a : b);
    }
    return winners;
  } catch {
    return new Set();
  }
}

/* ----------------------- Lazy loader ------------------------- */
// Throttle helper for bursts of requests
async function runWithLimit(fns, n = 8) {
  const out = new Array(fns.length);
  let i = 0;
  async function worker() {
    while (i < fns.length) {
      const idx = i++;
      out[idx] = await fns[idx]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, fns.length) }, worker));
  return out;
}

// Load a single team’s history on demand (and cache it)
async function getTeamHistory(uid, seasons, playersMap) {
  // RAM cache
  if (TEAM_CACHE.has(uid)) return TEAM_CACHE.get(uid);
  // localStorage cache
  if (PERSIST[uid]) {
    TEAM_CACHE.set(uid, PERSIST[uid]);
    return PERSIST[uid];
  }

  const weeklyPoints = [];
  const playerTotals = {};
  const trades = [];
  const WEEK_CAP = 18;

  for (const season of seasons) {
    const userByRoster = season.ownerByRoster;

    // Limit to regular season + a few playoff weeks to cut requests
    const playoffStart = Number(season.league?.settings?.playoff_week_start || 15);
    const maxWeek = Math.min(playoffStart + 3, WEEK_CAP);
    const weeks = Array.from({ length: maxWeek }, (_, i) => i + 1);

    // Prepare request functions (so we can throttle)
    const matchupFns = weeks.map(w => () => jget(`/league/${season.leagueId}/matchups/${w}`).catch(() => []));
    const txFns      = weeks.map(w => () => jget(`/league/${season.leagueId}/transactions/${w}`).catch(() => []));

    const [matchupsByWeek, txByWeek] = await Promise.all([
      runWithLimit(matchupFns, 8),
      runWithLimit(txFns, 6),
    ]);

    // Aggregate matchups for just this user
    matchupsByWeek.forEach((arr, i) => {
      const wk = i + 1;
      for (const m of (arr || [])) {
        if (!m?.roster_id) continue;
        const u = userByRoster[m.roster_id];
        if (u?.user_id !== uid) continue;

        weeklyPoints.push({ pts: Number(m.points || 0), tag: `${season.league.season || '?'} W${wk}` });
        const ppts = m.players_points || {};
        for (const [pid, pts] of Object.entries(ppts)) {
          playerTotals[pid] = (playerTotals[pid] || 0) + Number(pts || 0);
        }
      }
    });

    // Aggregate trades for just this user
    txByWeek.forEach((arr, i) => {
      const wk = i + 1;
      for (const tx of (arr || [])) {
        if ((tx.type || '').toLowerCase() !== 'trade') continue;
        const rids = tx.roster_ids || [];
        for (const rid of rids) {
          const u = userByRoster[rid];
          if (u?.user_id !== uid) continue;

          const gained = Object.entries(tx.adds || {}).filter(([, to]) => to === rid).map(([pid]) => pid);
          const sent   = Object.entries(tx.drops || {}).filter(([, from]) => from === rid).map(([pid]) => pid);
          trades.push({
            season: season.league.season || '—',
            week: wk,
            gained,
            sent,
            picks: (tx.draft_picks || []).filter(pk => pk.owner_id === rid || pk.previous_owner_id === rid),
          });
        }
      }
    });
  }

  // Compute top 5 and MVP
  weeklyPoints.sort((a, b) => b.pts - a.pts);
  const topWeeks = weeklyPoints.slice(0, 5);

  let mvp = null;
  for (const [pid, total] of Object.entries(playerTotals)) {
    if (!mvp || total > mvp.pts) {
      const p = playersMap[pid] || {};
      mvp = { pid, name: p.fn || pid, pos: p.pos || '', team: p.team || '', pts: total };
    }
  }

  const result = { topWeeks, mvp, trades };
  TEAM_CACHE.set(uid, result);
  persist(uid, result);
  return result;
}

/* ----------------------- Renderer ---------------------------- */
function renderTeamHistoryInto(body, data, playersMap) {
  const inner = el('div', { class: 'history-inner' });
  body.innerHTML = '';
  body.append(inner);

  // Top 5 scoring weeks
  const weeksSection = el('div', { class: 'history-section' });
  weeksSection.append(el('div', { class: 'history-section-title', html: 'Top 5 Scoring Weeks' }));
  if (data.topWeeks?.length) {
    const list = el('div', { class: 'top-weeks' });
    data.topWeeks.forEach(w => {
      list.append(el('div', { class: 'week-stat', html: `${w.tag}: <strong>${w.pts.toFixed(2)}</strong>` }));
    });
    weeksSection.append(list);
  } else {
    weeksSection.append(el('div', { class: 'history-stat', html: '—' }));
  }
  inner.append(weeksSection);

  // MVP
  const mvpSection = el('div', { class: 'history-section' });
  mvpSection.append(el('div', { class: 'history-section-title', html: 'Team MVP (all-time)' }));
  if (data.mvp) {
    const m = data.mvp;
    const meta = [m.pos, m.team].filter(Boolean).join(' • ');
    mvpSection.append(el('div', { class: 'mvp-info', html: `${m.name}${meta ? ' — ' + meta : ''} · <strong>${m.pts.toFixed(2)} pts</strong>` }));
  } else {
    mvpSection.append(el('div', { class: 'history-stat', html: '—' }));
  }
  inner.append(mvpSection);

  // Trades
  const tradesSection = el('div', { class: 'history-section' });
  tradesSection.append(el('div', { class: 'history-section-title', html: 'All Trades' }));
  if (data.trades?.length) {
    const wrap = el('div', { class: 'trade-list' });
    data.trades
      .sort((a,b) => (b.season - a.season) || (b.week - a.week))
      .forEach(tr => {
        const pills = el('div', { class: 'trade-pills' });
        tr.gained.forEach(pid => {
          const p = playersMap[pid] || {};
          const meta = [p.pos, p.team].filter(Boolean).join(' • ');
          pills.append(el('span', { class: 'pill gain', html: `<span class="player-name">${p.fn || pid}</span>${meta ? `<small>${meta}</small>` : ''}` }));
        });
        tr.sent.forEach(pid => {
          const p = playersMap[pid] || {};
          const meta = [p.pos, p.team].filter(Boolean).join(' • ');
          pills.append(el('span', { class: 'pill loss', html: `<span class="player-name">${p.fn || pid}</span>${meta ? `<small>${meta}</small>` : ''}` }));
        });
        (tr.picks || []).forEach(pk => {
          const yr = pk.season || '—';
          const rd = pk.round ? `R${pk.round}` : 'R?';
          pills.append(el('span', { class: 'pill pick', html: `${yr} ${rd}` }));
        });
        const row = el('div', { class: 'trade-date', html: `<strong>${tr.season}</strong> · Week ${tr.week}` });
        wrap.append(row, pills);
      });
    tradesSection.append(wrap);
  } else {
    tradesSection.append(el('div', { class: 'history-stat', html: 'No trades recorded.' }));
  }
  inner.append(tradesSection);
}

/* ----------------------- Page entry -------------------------- */
export default async function loadHistory() {
  const root = document.getElementById('history-root');
  root.textContent = 'Loading teams…';

  try {
    const [playersMap, seasons] = await Promise.all([
      getPlayersMap(),
      collectSeasons(LEAGUE_ID),
    ]);

    // Manual championship overrides: user_id -> number of titles
    const manualChampions = {
      '774791902347292672': 1, // Will
      '777420886881054720': 1, // Jalen
      '778145469917573120': 1, // Eitan
    };

    if (!seasons.length) {
      root.textContent = 'No linked seasons found.';
      return;
    }

    // Build light franchise map (names + champion count only)
    const franchiseByUser = new Map();

    for (const s of seasons) {
      const { ownerByRoster } = s;
      for (const r of s.rosters) {
        const u = ownerByRoster[r.roster_id];
        if (!u) continue;
        if (!franchiseByUser.has(u.user_id)) {
          franchiseByUser.set(u.user_id, {
            userId: u.user_id,
            display: sanitizeName(u.metadata?.team_name || u.display_name || u.username || 'Unknown'),
            championships: 0,
          });
        } else {
          // prefer the most descriptive display seen
          const fr = franchiseByUser.get(u.user_id);
          const nm = sanitizeName(u.metadata?.team_name || u.display_name || u.username || 'Unknown');
          if (nm && nm.length > fr.display.length) fr.display = nm;
        }
      }
    }

    // Auto champions via winners bracket
    const championsPerSeason = new Map();
    for (const s of seasons) {
      championsPerSeason.set(s.leagueId, await getChampionsForLeague(s.leagueId));
    }
    for (const s of seasons) {
      const champs = championsPerSeason.get(s.leagueId) || new Set();
      const { ownerByRoster } = s;
      for (const rid of champs) {
        const u = ownerByRoster[rid];
        if (!u) continue;
        const fr = franchiseByUser.get(u.user_id);
        if (fr) fr.championships += 1;
      }
    }

    // Manual additive override
    for (const [uid, extra] of Object.entries(manualChampions)) {
      const fr = franchiseByUser.get(uid);
      if (fr) fr.championships = (fr.championships || 0) + extra;
    }

    // Render list (current season ordering)
    const current = seasons[0];
    const rows = current.rosters
      .map(r => current.ownerByRoster[r.roster_id]?.user_id)
      .filter(Boolean);

    root.innerHTML = '';
    rows.forEach(uid => {
      const fr = franchiseByUser.get(uid);
      const display = fr?.display || 'Unknown Team';

      const card = el('div', { class: 'history-card' });
      const header = el('div', { class: 'history-header', role: 'button', tabindex: '0' });
      header.append(
        el('div', { class: 'history-title', html: sanitizeName(display) }),
        el('div', { class: 'champion-badge', html: fr?.championships ? `🏆 ${fr.championships}× Champion` : '—' })
      );

      const body = el('div', { class: 'history-content' });
      const inner = el('div', { class: 'history-inner', html: 'Open to load…' });
      body.append(inner);

      const toggle = async () => {
        body.classList.toggle('open');
        if (!body.classList.contains('open')) return;

        if (!body.dataset.loaded) {
          inner.textContent = 'Loading…';
          try {
            const data = await getTeamHistory(uid, seasons, playersMap);
            renderTeamHistoryInto(body, data, playersMap);
            body.dataset.loaded = '1';
          } catch (e) {
            console.error('history load err', e);
            inner.textContent = 'Failed to load team history.';
          }
        }
      };

      header.addEventListener('click', toggle);
      header.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
      });

      card.append(header, body);
      root.append(card);
    });

    if (!root.children.length) root.textContent = 'No teams found for history.';
  } catch (err) {
    console.error('loadHistory error:', err);
    root.textContent = 'Failed to load league history.';
  }
}