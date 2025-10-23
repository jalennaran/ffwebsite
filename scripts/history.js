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
import { jget, LEAGUE_ID, getPlayersMap, getCurrentWeek } from './api.js';
import { el, sanitizeName } from './ui.js';

/* ----------------------- Cache helpers ----------------------- */
const TEAM_CACHE = new Map();                // runtime cache (per page load)
const LS_KEY = 'teamHistory:v9';             // bump to invalidate old cache

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
async function getTeamHistory(uid, seasons, playersMap, currentWeek = 18) {
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
  const positionPoints = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 }; // Track starter points by position
  const headToHeadRecords = {}; // Track W-L vs each opponent: opponentUserId -> { wins, losses, opponentName }
  const seasonStats = []; // Track stats per season: { season, wins, losses, pointsFor, pointsAgainst }
  const weeklyTrend = []; // Track all weekly scores with season context
  const gameByGame = []; // Track individual games: { season, week, pointsFor, pointsAgainst }
  const leagueWeeklyAverages = {}; // Track league average for each week: "season_week" -> average

  for (const season of seasons) {
    const userByRoster = season.ownerByRoster;

    // Limit to regular season + a few playoff weeks to cut requests
    const playoffStart = Number(season.league?.settings?.playoff_week_start || 15);
    const maxWeek = Math.min(playoffStart + 3, WEEK_CAP);
    const seasonYear = season.league.season || '?';
    
    // For current season (2025), exclude current week (incomplete data)
    const isCurrentSeason = seasonYear === '2025';
    const effectiveMaxWeek = isCurrentSeason ? Math.min(maxWeek, currentWeek - 1) : maxWeek;
    
    const weeks = Array.from({ length: effectiveMaxWeek }, (_, i) => i + 1);

    // Prepare request functions (so we can throttle)
    const matchupFns = weeks.map(w => () => jget(`/league/${season.leagueId}/matchups/${w}`).catch(() => []));
    const txFns      = weeks.map(w => () => jget(`/league/${season.leagueId}/transactions/${w}`).catch(() => []));

    const [matchupsByWeek, txByWeek] = await Promise.all([
      runWithLimit(matchupFns, 8),
      runWithLimit(txFns, 6),
    ]);

    // Track season-level stats
    let seasonWins = 0;
    let seasonLosses = 0;
    let seasonPointsFor = 0;
    let seasonPointsAgainst = 0;

    // Aggregate matchups for just this user
    matchupsByWeek.forEach((arr, i) => {
      const wk = i + 1;
      
      // Skip week 18 entirely
      if (wk === 18) return;
      
      // Calculate league average for this week
      const weekKey = `${seasonYear}_${wk}`;
      if (!leagueWeeklyAverages[weekKey] && arr && arr.length > 0) {
        const weekTotal = arr.reduce((sum, m) => sum + (Number(m.points) || 0), 0);
        const weekAvg = weekTotal / arr.length;
        leagueWeeklyAverages[weekKey] = weekAvg;
      }
      
      for (const m of (arr || [])) {
        if (!m?.roster_id) continue;
        const u = userByRoster[m.roster_id];
        if (u?.user_id !== uid) continue;

        const myPoints = Number(m.points || 0);
        weeklyPoints.push({ pts: myPoints, tag: `${seasonYear} W${wk}` });
        
        // Track weekly trend with season context
        weeklyTrend.push({
          season: seasonYear,
          week: wk,
          points: myPoints
        });
        
        // Only count regular season points for season stats
        if (wk < playoffStart) {
          seasonPointsFor += myPoints;
        }
        
        const ppts = m.players_points || {};
        for (const [pid, pts] of Object.entries(ppts)) {
          playerTotals[pid] = (playerTotals[pid] || 0) + Number(pts || 0);
        }
        
        // Track position points from starters only
        const starters = (m.starters || []).filter(Boolean);
        for (const pid of starters) {
          const pts = ppts[pid] || 0;
          const player = playersMap[pid];
          if (player && player.pos) {
            const pos = player.pos;
            if (positionPoints[pos] !== undefined) {
              positionPoints[pos] += Number(pts);
            }
          }
        }
        
        // Track head-to-head record
        const opponent = (arr || []).find(opp => 
          opp?.roster_id !== m.roster_id && 
          opp?.matchup_id === m.matchup_id
        );
        if (opponent) {
          const oppPoints = Number(opponent.points || 0);
          
          // Track individual game for luck vs skill matrix
          gameByGame.push({
            season: seasonYear,
            week: wk,
            pointsFor: myPoints,
            pointsAgainst: oppPoints
          });
          
          // Only count regular season games for season stats
          if (wk < playoffStart) {
            seasonPointsAgainst += oppPoints;
          }
          
          const oppUser = userByRoster[opponent.roster_id];
          if (oppUser) {
            const oppUserId = oppUser.user_id;
            const oppName = sanitizeName(oppUser.metadata?.team_name || oppUser.display_name || `Team ${opponent.roster_id}`);
            
            if (!headToHeadRecords[oppUserId]) {
              headToHeadRecords[oppUserId] = { wins: 0, losses: 0, opponentName: oppName };
            }
            
            if (myPoints > oppPoints) {
              headToHeadRecords[oppUserId].wins++;
              // Only count regular season W/L for season stats
              if (wk < playoffStart) {
                seasonWins++;
              }
            } else if (myPoints < oppPoints) {
              headToHeadRecords[oppUserId].losses++;
              // Only count regular season W/L for season stats
              if (wk < playoffStart) {
                seasonLosses++;
              }
            }
          }
        }
      }
    });
    
    // Store season stats
    if (seasonWins > 0 || seasonLosses > 0) {
      seasonStats.push({
        season: seasonYear,
        wins: seasonWins,
        losses: seasonLosses,
        pointsFor: seasonPointsFor,
        pointsAgainst: seasonPointsAgainst
      });
    }

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

  // Compute LVP (players appearing in at least 2 seasons)
  const playerSeasons = {}; // Track which seasons each player appeared in
  
  for (const season of seasons) {
    const userByRoster = season.ownerByRoster;
    const playoffStart = Number(season.league?.settings?.playoff_week_start || 15);
    const maxWeek = Math.min(playoffStart + 3, 18);
    const weeks = Array.from({ length: maxWeek }, (_, i) => i + 1);
    
    const matchupFns = weeks.map(w => () => jget(`/league/${season.leagueId}/matchups/${w}`).catch(() => []));
    const matchupsByWeek = await runWithLimit(matchupFns, 8);
    
    matchupsByWeek.forEach((arr) => {
      for (const m of (arr || [])) {
        if (!m?.roster_id) continue;
        const u = userByRoster[m.roster_id];
        if (u?.user_id !== uid) continue;
        
        const ppts = m.players_points || {};
        for (const pid of Object.keys(ppts)) {
          if (!playerSeasons[pid]) playerSeasons[pid] = new Set();
          playerSeasons[pid].add(season.league.season || '?');
        }
      }
    });
  }
  
  // Find LVP: player with at least 2 seasons and lowest total points
  let lvp = null;
  for (const [pid, total] of Object.entries(playerTotals)) {
    const seasonsCount = playerSeasons[pid]?.size || 0;
    if (seasonsCount >= 2) {
      if (!lvp || total < lvp.pts) {
        const p = playersMap[pid] || {};
        lvp = { 
          pid, 
          name: p.fn || pid, 
          pos: p.pos || '', 
          team: p.team || '', 
          pts: total,
          seasons: seasonsCount
        };
      }
    }
  }

  const result = { topWeeks, mvp, lvp, trades, positionPoints, headToHeadRecords, seasonStats, weeklyTrend, gameByGame, leagueWeeklyAverages };
  TEAM_CACHE.set(uid, result);
  persist(uid, result);
  return result;
}

/* ----------------------- Renderer ---------------------------- */
function renderTeamHistoryInto(body, data, playersMap) {
  const inner = el('div', { class: 'history-inner' });
  body.innerHTML = '';
  body.append(inner);

  // Create two-column layout for main stats
  const statsGrid = el('div', { class: 'team-stats-grid' });
  
  // Left column - Text stats
  const leftColumn = el('div', { class: 'team-stats-column' });
  
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
  leftColumn.append(weeksSection);

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
  leftColumn.append(mvpSection);

  // LVP
  const lvpSection = el('div', { class: 'history-section' });
  lvpSection.append(el('div', { class: 'history-section-title', html: 'Team LVP (2+ seasons)' }));
  if (data.lvp) {
    const l = data.lvp;
    const meta = [l.pos, l.team].filter(Boolean).join(' • ');
    lvpSection.append(el('div', { class: 'mvp-info', html: `${l.name}${meta ? ' — ' + meta : ''} · <strong>${l.pts.toFixed(2)} pts</strong> (${l.seasons} seasons)` }));
  } else {
    lvpSection.append(el('div', { class: 'history-stat', html: 'No players with 2+ seasons' }));
  }
  leftColumn.append(lvpSection);

  // Biggest Rivals
  const rivalsSection = el('div', { class: 'history-section' });
  rivalsSection.append(el('div', { class: 'history-section-title', html: 'Biggest Rivals' }));
  
  if (data.headToHeadRecords && Object.keys(data.headToHeadRecords).length > 0) {
    // Find top 3 rivals (most total games, then closest record)
    const rivals = Object.entries(data.headToHeadRecords)
      .map(([oppId, record]) => ({
        ...record,
        oppId,
        totalGames: record.wins + record.losses,
        diff: Math.abs(record.wins - record.losses)
      }))
      .filter(r => r.totalGames > 0)
      .sort((a, b) => {
        // Sort by total games first (more games = bigger rivalry)
        if (b.totalGames !== a.totalGames) return b.totalGames - a.totalGames;
        // Then by closeness (smaller diff = closer rivalry)
        return a.diff - b.diff;
      })
      .slice(0, 3);
    
    if (rivals.length > 0) {
      const rivalsList = el('div', { class: 'rivals-list' });
      rivals.forEach(rival => {
        rivalsList.append(
          el('div', { class: 'history-stat' }, 
            `vs ${rival.opponentName} · `,
            el('strong', {}, `${rival.wins}-${rival.losses}`),
            ` (${rival.totalGames} games)`
          )
        );
      });
      rivalsSection.append(rivalsList);
    } else {
      rivalsSection.append(el('div', { class: 'history-stat', html: 'No matchup data' }));
    }
  } else {
    rivalsSection.append(el('div', { class: 'history-stat', html: 'No head-to-head data' }));
  }
  leftColumn.append(rivalsSection);
  
  // Right column - Pie Chart
  const rightColumn = el('div', { class: 'team-chart-column' });
  const posSection = el('div', { class: 'history-section' });
  posSection.append(el('div', { class: 'history-section-title', html: 'Points by Position' }));
  
  if (data.positionPoints) {
    const positions = ['QB', 'RB', 'WR', 'TE'];
    const chartData = positions.map(pos => data.positionPoints[pos] || 0);
    const total = chartData.reduce((sum, val) => sum + val, 0);
    
    if (total > 0) {
      const chartWrapper = el('div', { class: 'chart-wrapper' });
      const chartCanvas = el('canvas', { id: `pos-chart-${Date.now()}` });
      chartWrapper.append(chartCanvas);
      posSection.append(chartWrapper);
      
      // Render chart after DOM insertion
      setTimeout(() => {
        const ctx = chartCanvas.getContext('2d');
        // Use draft card colors
        const colors = {
          QB: 'rgba(177, 44, 126, 0.9)',      // Pink/Magenta
          RB: 'rgba(46, 167, 98, 0.9)',       // Green
          WR: 'rgba(66, 133, 244, 0.9)',      // Blue
          TE: 'rgba(230, 150, 44, 0.9)'       // Orange
        };
        
        const borderColors = {
          QB: 'rgba(244, 211, 233, 0.8)',
          RB: 'rgba(215, 245, 228, 0.8)',
          WR: 'rgba(217, 232, 255, 0.8)',
          TE: 'rgba(248, 227, 199, 0.8)'
        };
        
        new Chart(ctx, {
          type: 'pie',
          data: {
            labels: positions.map((pos, i) => {
              const pts = chartData[i];
              const pct = ((pts / total) * 100).toFixed(1);
              return `${pos} (${pct}%)`;
            }),
            datasets: [{
              data: chartData,
              backgroundColor: positions.map(pos => colors[pos]),
              borderColor: positions.map(pos => borderColors[pos]),
              borderWidth: 2
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
              legend: {
                position: 'bottom',
                labels: {
                  color: 'rgba(255, 255, 255, 0.9)',
                  font: { 
                    size: 13,
                    family: "'Outfit', sans-serif"
                  },
                  padding: 12,
                  boxWidth: 15,
                  boxHeight: 15
                }
              },
              tooltip: {
                backgroundColor: 'rgba(15, 10, 29, 0.95)',
                titleColor: '#ffffff',
                bodyColor: '#ffffff',
                borderColor: 'rgba(255, 255, 255, 0.1)',
                borderWidth: 1,
                padding: 12,
                bodyFont: {
                  size: 13
                },
                callbacks: {
                  label: function(context) {
                    const pos = positions[context.dataIndex];
                    const pts = context.parsed;
                    const pct = ((pts / total) * 100).toFixed(1);
                    return `${pos}: ${pts.toFixed(2)} pts (${pct}%)`;
                  }
                }
              }
            }
          }
        });
      }, 100);
    } else {
      posSection.append(el('div', { class: 'history-stat', html: 'No starter data available' }));
    }
  } else {
    posSection.append(el('div', { class: 'history-stat', html: 'No position data' }));
  }
  rightColumn.append(posSection);
  
  // Add both columns to grid
  statsGrid.append(leftColumn, rightColumn);
  inner.append(statsGrid);

  // Analytics Card with Multiple Charts
  const analyticsCard = el('div', { class: 'analytics-card' });
  const analyticsTitle = el('div', { class: 'history-section-title', html: '📊 Team Analytics' });
  analyticsCard.append(analyticsTitle);
  
  const chartsGrid = el('div', { class: 'charts-grid' });
  
  // 1. Luck vs Skill Matrix (Scatter Plot)
  if (data.gameByGame && data.gameByGame.length > 0) {
    const luckSkillSection = el('div', { class: 'chart-section' });
    luckSkillSection.append(el('div', { class: 'chart-section-title', html: 'Luck vs Skill Matrix' }));
    const luckSkillWrapper = el('div', { class: 'chart-wrapper-inline' });
    const luckSkillCanvas = el('canvas', { id: `luck-skill-${Date.now()}` });
    luckSkillWrapper.append(luckSkillCanvas);
    luckSkillSection.append(luckSkillWrapper);
    chartsGrid.append(luckSkillSection);
    
    setTimeout(() => {
      const ctx = luckSkillCanvas.getContext('2d');
      
      // Each game is a separate point
      const scatterData = data.gameByGame.map(g => ({
        x: g.pointsFor,
        y: g.pointsAgainst,
        label: `${g.season} W${g.week}`
      }));
      
      new Chart(ctx, {
        type: 'scatter',
        data: {
          datasets: [{
            label: 'Games',
            data: scatterData,
            backgroundColor: 'rgba(66, 133, 244, 0.6)',
            borderColor: 'rgba(217, 232, 255, 0.8)',
            borderWidth: 1,
            pointRadius: 4,
            pointHoverRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: 'rgba(15, 10, 29, 0.95)',
              titleColor: '#ffffff',
              bodyColor: '#ffffff',
              borderColor: 'rgba(255, 255, 255, 0.1)',
              borderWidth: 1,
              padding: 12,
              callbacks: {
                title: (items) => items[0].raw.label,
                label: (context) => {
                  return [
                    `Points For: ${context.parsed.x.toFixed(2)} (Skill)`,
                    `Points Against: ${context.parsed.y.toFixed(2)} (Luck)`
                  ];
                }
              }
            }
          },
          scales: {
            x: {
              title: {
                display: true,
                text: 'Points Scored (Skill) →',
                color: 'rgba(255, 255, 255, 0.8)',
                font: { size: 12, family: "'Outfit', sans-serif" }
              },
              ticks: {
                color: 'rgba(255, 255, 255, 0.7)',
                font: { size: 11 }
              },
              grid: {
                color: 'rgba(255, 255, 255, 0.05)'
              }
            },
            y: {
              title: {
                display: true,
                text: '← Points Against (Luck)',
                color: 'rgba(255, 255, 255, 0.8)',
                font: { size: 12, family: "'Outfit', sans-serif" }
              },
              ticks: {
                color: 'rgba(255, 255, 255, 0.7)',
                font: { size: 11 }
              },
              grid: {
                color: 'rgba(255, 255, 255, 0.05)'
              }
            }
          }
        }
      });
    }, 150);
  }
  
  // 2. Season-by-Season Record Chart
  if (data.seasonStats && data.seasonStats.length > 0) {
    const recordSection = el('div', { class: 'chart-section' });
    recordSection.append(el('div', { class: 'chart-section-title', html: 'Season Records' }));
    const recordWrapper = el('div', { class: 'chart-wrapper-inline' });
    const recordCanvas = el('canvas', { id: `record-${Date.now()}` });
    recordWrapper.append(recordCanvas);
    recordSection.append(recordWrapper);
    chartsGrid.append(recordSection);
    
    setTimeout(() => {
      const ctx = recordCanvas.getContext('2d');
      
      // Sort by season ascending (2022 -> 2025)
      const sortedStats = [...data.seasonStats].sort((a, b) => a.season - b.season);
      
      const seasons = sortedStats.map(s => s.season);
      const wins = sortedStats.map(s => s.wins);
      const losses = sortedStats.map(s => s.losses);
      
      new Chart(ctx, {
        type: 'bar',
        data: {
          labels: seasons,
          datasets: [
            {
              label: 'Wins',
              data: wins,
              backgroundColor: 'rgba(46, 167, 98, 0.8)',
              borderColor: 'rgba(215, 245, 228, 0.9)',
              borderWidth: 1
            },
            {
              label: 'Losses',
              data: losses,
              backgroundColor: 'rgba(177, 44, 126, 0.8)',
              borderColor: 'rgba(244, 211, 233, 0.9)',
              borderWidth: 1
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: {
              labels: {
                color: 'rgba(255, 255, 255, 0.9)',
                font: { size: 12, family: "'Outfit', sans-serif" },
                boxWidth: 12,
                padding: 10
              }
            },
            tooltip: {
              backgroundColor: 'rgba(15, 10, 29, 0.95)',
              titleColor: '#ffffff',
              bodyColor: '#ffffff',
              borderColor: 'rgba(255, 255, 255, 0.1)',
              borderWidth: 1,
              padding: 12
            }
          },
          scales: {
            x: {
              stacked: false,
              ticks: {
                color: 'rgba(255, 255, 255, 0.7)',
                font: { size: 11 }
              },
              grid: {
                display: false
              }
            },
            y: {
              stacked: false,
              beginAtZero: true,
              ticks: {
                color: 'rgba(255, 255, 255, 0.7)',
                font: { size: 11 },
                stepSize: 1
              },
              grid: {
                color: 'rgba(255, 255, 255, 0.05)'
              }
            }
          }
        }
      });
    }, 200);
  }
  
  // 3. Points Per Week Trend
  if (data.weeklyTrend && data.weeklyTrend.length > 0) {
    const trendSection = el('div', { class: 'chart-section chart-section-wide' });
    trendSection.append(el('div', { class: 'chart-section-title', html: 'Weekly Points Trend' }));
    const trendWrapper = el('div', { class: 'chart-wrapper-inline' });
    const trendCanvas = el('canvas', { id: `trend-${Date.now()}` });
    trendWrapper.append(trendCanvas);
    trendSection.append(trendWrapper);
    chartsGrid.append(trendSection);
    
    setTimeout(() => {
      const ctx = trendCanvas.getContext('2d');
      
      // Sort by season (ascending) then by week (ascending) to ensure chronological order
      const sortedTrend = [...data.weeklyTrend].sort((a, b) => {
        if (a.season !== b.season) return a.season - b.season;
        return a.week - b.week;
      });
      
      const labels = sortedTrend.map(w => `${w.season} W${w.week}`);
      const points = sortedTrend.map(w => w.points);
      
      // Calculate league averages for each corresponding week
      const leagueAvgs = sortedTrend.map(w => {
        const weekKey = `${w.season}_${w.week}`;
        return data.leagueWeeklyAverages[weekKey] || null;
      });
      
      const maxPoint = Math.max(...points);
      const maxIndex = points.indexOf(maxPoint);
      
      new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [
            {
              label: 'Points Scored',
              data: points,
              borderColor: 'rgba(66, 133, 244, 0.9)',
              backgroundColor: 'rgba(66, 133, 244, 0.1)',
              borderWidth: 2,
              fill: true,
              tension: 0.4,
              pointRadius: (context) => context.dataIndex === maxIndex ? 6 : 3,
              pointBackgroundColor: (context) => context.dataIndex === maxIndex ? 'rgba(230, 150, 44, 1)' : 'rgba(66, 133, 244, 0.9)',
              pointBorderColor: (context) => context.dataIndex === maxIndex ? 'rgba(248, 227, 199, 1)' : 'rgba(217, 232, 255, 0.9)',
              pointBorderWidth: 2
            },
            {
              label: 'League Average',
              data: leagueAvgs,
              borderColor: 'rgba(255, 255, 255, 0.3)',
              borderWidth: 2,
              borderDash: [5, 5],
              pointRadius: 0,
              fill: false
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: {
              labels: {
                color: 'rgba(255, 255, 255, 0.9)',
                font: { size: 12, family: "'Outfit', sans-serif" },
                boxWidth: 12,
                padding: 10
              }
            },
            tooltip: {
              backgroundColor: 'rgba(15, 10, 29, 0.95)',
              titleColor: '#ffffff',
              bodyColor: '#ffffff',
              borderColor: 'rgba(255, 255, 255, 0.1)',
              borderWidth: 1,
              padding: 12
            }
          },
          scales: {
            x: {
              ticks: {
                color: 'rgba(255, 255, 255, 0.7)',
                font: { size: 10 },
                maxRotation: 45,
                minRotation: 45
              },
              grid: {
                display: false
              }
            },
            y: {
              beginAtZero: true,
              ticks: {
                color: 'rgba(255, 255, 255, 0.7)',
                font: { size: 11 }
              },
              grid: {
                color: 'rgba(255, 255, 255, 0.05)'
              }
            }
          }
        }
      });
    }, 250);
  }
  
  analyticsCard.append(chartsGrid);
  inner.append(analyticsCard);

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

/* ----------------------- Weekly History Functions ----------------------- */

// Get stats for a specific week
async function getWeekStats(week, leagueId = LEAGUE_ID) {
  try {
    const matchups = await jget(`/league/${leagueId}/matchups/${week}`);
    return matchups || [];
  } catch (e) {
    console.error(`Failed to fetch week ${week} matchups:`, e);
    return [];
  }
}

// Calculate top scorers by position
function getTopScorersByPosition(matchups, playersMap, ownerByRoster) {
  const positions = { QB: [], RB: [], WR: [], TE: [], K: [] };
  
  matchups.forEach(m => {
    if (!m.players_points) return;
    
    const fantasyTeam = sanitizeName(
      ownerByRoster[m.roster_id]?.metadata?.team_name ||
      ownerByRoster[m.roster_id]?.display_name ||
      `Team ${m.roster_id}`
    );
    
    Object.entries(m.players_points).forEach(([pid, pts]) => {
      const player = playersMap[pid];
      if (!player || !positions[player.pos]) return;
      
      positions[player.pos].push({
        name: player.fn || pid,
        points: pts,
        team: player.team || '—',
        fantasyTeam: fantasyTeam
      });
    });
  });
  
  // Get top scorer for each position
  const topScorers = {};
  Object.entries(positions).forEach(([pos, players]) => {
    if (players.length > 0) {
      players.sort((a, b) => b.points - a.points);
      topScorers[pos] = players[0];
    }
  });
  
  return topScorers;
}

// Find highest and lowest scoring teams
function getTeamScoreExtremes(matchups, ownerByRoster) {
  const scores = matchups.map(m => ({
    rosterId: m.roster_id,
    points: m.points || 0,
    teamName: sanitizeName(
      ownerByRoster[m.roster_id]?.metadata?.team_name ||
      ownerByRoster[m.roster_id]?.display_name ||
      `Team ${m.roster_id}`
    )
  }));
  
  scores.sort((a, b) => b.points - a.points);
  
  return {
    highest: scores[0],
    lowest: scores[scores.length - 1]
  };
}

// Find closest game and biggest blowout
function getMatchupExtremes(matchups, ownerByRoster) {
  const games = [];
  const processed = new Set();
  
  matchups.forEach(m1 => {
    if (processed.has(m1.roster_id)) return;
    
    const opponent = matchups.find(m2 => 
      m2.roster_id !== m1.roster_id && 
      m2.matchup_id === m1.matchup_id
    );
    
    if (!opponent) return;
    
    processed.add(m1.roster_id);
    processed.add(opponent.roster_id);
    
    const diff = Math.abs((m1.points || 0) - (opponent.points || 0));
    const team1 = sanitizeName(
      ownerByRoster[m1.roster_id]?.metadata?.team_name ||
      ownerByRoster[m1.roster_id]?.display_name ||
      `Team ${m1.roster_id}`
    );
    const team2 = sanitizeName(
      ownerByRoster[opponent.roster_id]?.metadata?.team_name ||
      ownerByRoster[opponent.roster_id]?.display_name ||
      `Team ${opponent.roster_id}`
    );
    
    games.push({
      team1,
      team2,
      score1: m1.points || 0,
      score2: opponent.points || 0,
      diff
    });
  });
  
  games.sort((a, b) => a.diff - b.diff);
  
  return {
    closest: games[0],
    blowout: games[games.length - 1]
  };
}

// Render week recap content
function renderWeekRecapInto(body, weekNum, matchups, ownerByRoster, playersMap) {
  const inner = el('div', { class: 'history-inner' });
  body.innerHTML = '';
  body.append(inner);

  if (!matchups || matchups.length === 0) {
    inner.append(el('p', {}, 'No data available for this week.'));
    return;
  }

  const topScorers = getTopScorersByPosition(matchups, playersMap, ownerByRoster);
  const { highest, lowest } = getTeamScoreExtremes(matchups, ownerByRoster);
  const { closest, blowout } = getMatchupExtremes(matchups, ownerByRoster);

  // Top scorers by position
  if (Object.keys(topScorers).length > 0) {
    const topScorersSection = el('div', { class: 'history-section' });
    topScorersSection.append(el('div', { class: 'history-section-title', html: 'Top Scorers by Position' }));
    
    Object.entries(topScorers).forEach(([pos, player]) => {
      topScorersSection.append(
        el('div', { class: 'history-stat' },
          el('strong', {}, `${pos}: `),
          document.createTextNode(`${player.name} (${player.team}) - ${player.points.toFixed(2)} pts - ${player.fantasyTeam}`)
        )
      );
    });
    
    inner.append(topScorersSection);
  }

  // Team extremes
  const teamsSection = el('div', { class: 'history-section' });
  teamsSection.append(el('div', { class: 'history-section-title', html: 'Team Performances' }));
  
  if (highest) {
    teamsSection.append(
      el('div', { class: 'history-stat' },
        el('strong', {}, '🏆 Highest Score: '),
        document.createTextNode(`${highest.teamName} - ${highest.points.toFixed(2)} pts`)
      )
    );
  }
  
  if (lowest) {
    teamsSection.append(
      el('div', { class: 'history-stat' },
        el('strong', {}, '💀 Lowest Score: '),
        document.createTextNode(`${lowest.teamName} - ${lowest.points.toFixed(2)} pts`)
      )
    );
  }
  
  inner.append(teamsSection);

  // Matchup extremes
  const matchupsSection = el('div', { class: 'history-section' });
  matchupsSection.append(el('div', { class: 'history-section-title', html: 'Notable Matchups' }));
  
  if (closest) {
    matchupsSection.append(
      el('div', { class: 'history-stat' },
        el('strong', {}, '🎯 Closest Game: '),
        document.createTextNode(
          `${closest.team1} ${closest.score1.toFixed(2)} - ${closest.score2.toFixed(2)} ${closest.team2} (${closest.diff.toFixed(2)} pt diff)`
        )
      )
    );
  }
  
  if (blowout) {
    matchupsSection.append(
      el('div', { class: 'history-stat' },
        el('strong', {}, '💥 Biggest Blowout: '),
        document.createTextNode(
          `${blowout.team1} ${blowout.score1.toFixed(2)} - ${blowout.score2.toFixed(2)} ${blowout.team2} (${blowout.diff.toFixed(2)} pt diff)`
        )
      )
    );
  }
  
  inner.append(matchupsSection);
}

/* ----------------------- Accolades Functions ----------------------- */

async function renderAccoladesWithStandings(body, seasons, playersMap, allTimeRecords) {
  const inner = el('div', { class: 'history-inner' });
  body.innerHTML = '';
  body.append(inner);

  inner.textContent = 'Calculating league accolades...';

  // Data structures for tracking
  const playerAddsDrops = {}; // player_id -> { adds, drops, name }
  const allWeeks = []; // { teamName, points, season, week }
  const teamRecords = {}; // user_id -> { wins, losses, teamName }
  const closeGames = []; // { teamName, result: 'win'/'loss', diff, season, week }
  const draftPicks = []; // { player_id, round, season, teamName, rookiePoints }
  const headToHead = {}; // "userId1_userId2" -> { team1, team2, team1Wins, team2Wins }

  // Process all seasons
  for (const season of seasons) {
    const { leagueId, ownerByRoster, league } = season;
    const seasonYear = league.season || '?';
    const playoffStart = Number(league?.settings?.playoff_week_start || 15);
    const maxWeek = Math.min(playoffStart + 3, 18);

    // Get all matchups for the season
    const weeks = Array.from({ length: maxWeek }, (_, i) => i + 1);
    const matchupFns = weeks.map(w => () => jget(`/league/${leagueId}/matchups/${w}`).catch(() => []));
    const matchupsByWeek = await runWithLimit(matchupFns, 8);

    // Process matchups for week stats and records
    matchupsByWeek.forEach((arr, i) => {
      const wk = i + 1;
      const matchupPairs = new Map(); // matchup_id -> [team1, team2]

      for (const m of (arr || [])) {
        if (!m?.roster_id) continue;
        const u = ownerByRoster[m.roster_id];
        if (!u) continue;

        const teamName = sanitizeName(u.metadata?.team_name || u.display_name || `Team ${m.roster_id}`);
        const pts = Number(m.points || 0);

        // Track all weeks
        allWeeks.push({ teamName, userId: u.user_id, points: pts, season: seasonYear, week: wk });

        // Track for matchup pairing
        if (!matchupPairs.has(m.matchup_id)) {
          matchupPairs.set(m.matchup_id, []);
        }
        matchupPairs.get(m.matchup_id).push({ teamName, userId: u.user_id, points: pts });

        // Initialize team records
        if (!teamRecords[u.user_id]) {
          teamRecords[u.user_id] = { wins: 0, losses: 0, teamName };
        }
      }

      // Calculate wins/losses and close games
      for (const [matchupId, teams] of matchupPairs) {
        if (teams.length !== 2) continue;
        const [t1, t2] = teams;
        const diff = Math.abs(t1.points - t2.points);
        
        // Create consistent head-to-head key (sorted by userId)
        const h2hKey = [t1.userId, t2.userId].sort().join('_');
        if (!headToHead[h2hKey]) {
          headToHead[h2hKey] = {
            userId1: t1.userId < t2.userId ? t1.userId : t2.userId,
            userId2: t1.userId < t2.userId ? t2.userId : t1.userId,
            team1: t1.userId < t2.userId ? t1.teamName : t2.teamName,
            team2: t1.userId < t2.userId ? t2.teamName : t1.teamName,
            team1Wins: 0,
            team2Wins: 0
          };
        }
        
        if (t1.points > t2.points) {
          teamRecords[t1.userId].wins++;
          teamRecords[t2.userId].losses++;
          // Update head-to-head
          if (t1.userId === headToHead[h2hKey].userId1) {
            headToHead[h2hKey].team1Wins++;
          } else {
            headToHead[h2hKey].team2Wins++;
          }
          if (diff <= 10) {
            closeGames.push({ teamName: t1.teamName, result: 'win', diff, season: seasonYear, week: wk });
            closeGames.push({ teamName: t2.teamName, result: 'loss', diff, season: seasonYear, week: wk });
          }
        } else if (t2.points > t1.points) {
          teamRecords[t2.userId].wins++;
          teamRecords[t1.userId].losses++;
          // Update head-to-head
          if (t2.userId === headToHead[h2hKey].userId1) {
            headToHead[h2hKey].team1Wins++;
          } else {
            headToHead[h2hKey].team2Wins++;
          }
          if (diff <= 10) {
            closeGames.push({ teamName: t2.teamName, result: 'win', diff, season: seasonYear, week: wk });
            closeGames.push({ teamName: t1.teamName, result: 'loss', diff, season: seasonYear, week: wk });
          }
        }
      }
    });

    // Get transactions for adds/drops
    const txFns = weeks.map(w => () => jget(`/league/${leagueId}/transactions/${w}`).catch(() => []));
    const txByWeek = await runWithLimit(txFns, 6);

    txByWeek.forEach((arr) => {
      for (const tx of (arr || [])) {
        const adds = tx.adds || {};
        const drops = tx.drops || {};

        for (const pid of Object.keys(adds)) {
          if (!playerAddsDrops[pid]) {
            const p = playersMap[pid] || {};
            playerAddsDrops[pid] = { adds: 0, drops: 0, name: p.fn || pid, pos: p.pos || '', team: p.team || '' };
          }
          playerAddsDrops[pid].adds++;
        }

        for (const pid of Object.keys(drops)) {
          if (!playerAddsDrops[pid]) {
            const p = playersMap[pid] || {};
            playerAddsDrops[pid] = { adds: 0, drops: 0, name: p.fn || pid, pos: p.pos || '', team: p.team || '' };
          }
          playerAddsDrops[pid].drops++;
        }
      }
    });

    // Get draft picks
    try {
      const drafts = await jget(`/league/${leagueId}/drafts`).catch(() => []);
      for (const draft of drafts) {
        const draftId = draft.draft_id;
        
        // EXCLUDE FIRST TWO DRAFTS: Skip if this is season 2021 or 2022
        if (seasonYear === '2021' || seasonYear === '2022') continue;
        
        const picks = await jget(`/draft/${draftId}/picks`).catch(() => []);
        
        // Get rookie points for this season (first season only)
        const rookiePoints = {};
        matchupsByWeek.forEach((arr) => {
          for (const m of (arr || [])) {
            if (!m?.players_points) continue;
            for (const [pid, pts] of Object.entries(m.players_points)) {
              rookiePoints[pid] = (rookiePoints[pid] || 0) + Number(pts || 0);
            }
          }
        });

        for (const pick of picks) {
          const u = ownerByRoster[pick.roster_id];
          const teamName = u ? sanitizeName(u.metadata?.team_name || u.display_name || `Team ${pick.roster_id}`) : 'Unknown';
          const pts = rookiePoints[pick.player_id] || 0;
          
          draftPicks.push({
            player_id: pick.player_id,
            round: pick.round,
            pick_no: pick.pick_no,
            season: seasonYear,
            teamName,
            rookiePoints: pts
          });
        }
      }
    } catch (e) {
      console.warn('Draft data error:', e);
    }
  }

  // Calculate accolades
  inner.innerHTML = '';

  // Create two-column layout container
  const accoladesContainer = el('div', { class: 'accolades-grid' });

  // Left column: Accolades
  const accoladesColumn = el('div', { class: 'accolades-column' });

  // Community Player (most adds + drops) - EXCLUDE DEFENSES AND KICKERS
  const communitySection = el('div', { class: 'history-section' });
  communitySection.append(el('div', { class: 'history-section-title', html: '🔄 Community Player' }));
  let communityPlayer = null;
  for (const [pid, data] of Object.entries(playerAddsDrops)) {
    // Exclude defenses (DEF position) and kickers
    if (data.pos === 'DEF' || data.pos === 'DST' || data.pos === 'K') continue;
    
    const total = data.adds + data.drops;
    if (!communityPlayer || total > communityPlayer.total) {
      communityPlayer = { ...data, total, pid };
    }
  }
  if (communityPlayer) {
    const meta = [communityPlayer.pos, communityPlayer.team].filter(Boolean).join(' • ');
    communitySection.append(el('div', { class: 'history-stat', html: `${communityPlayer.name}${meta ? ' — ' + meta : ''} · <strong>${communityPlayer.adds} adds, ${communityPlayer.drops} drops (${communityPlayer.total} total)</strong>` }));
  } else {
    communitySection.append(el('div', { class: 'history-stat', html: '—' }));
  }
  accoladesColumn.append(communitySection);

  // Best Week Ever
  const bestWeekSection = el('div', { class: 'history-section' });
  bestWeekSection.append(el('div', { class: 'history-section-title', html: '🔥 Best Week Ever' }));
  allWeeks.sort((a, b) => b.points - a.points);
  if (allWeeks[0]) {
    const best = allWeeks[0];
    bestWeekSection.append(el('div', { class: 'history-stat', html: `${best.teamName} · <strong>${best.points.toFixed(2)} pts</strong> (${best.season} Week ${best.week})` }));
  } else {
    bestWeekSection.append(el('div', { class: 'history-stat', html: '—' }));
  }
  accoladesColumn.append(bestWeekSection);

  // Worst Week Ever - EXCLUDE WEEK 18, ZERO SCORES, AND NATEGAUTHIER
  const worstWeekSection = el('div', { class: 'history-section' });
  worstWeekSection.append(el('div', { class: 'history-section-title', html: '💀 Worst Week Ever' }));
  const filteredWeeks = allWeeks.filter(w => 
    w.week !== 18 && 
    w.points > 0 && 
    !w.teamName.toLowerCase().includes('nategauthier')
  );
  if (filteredWeeks.length > 0) {
    const worst = filteredWeeks[filteredWeeks.length - 1];
    worstWeekSection.append(el('div', { class: 'history-stat', html: `${worst.teamName} · <strong>${worst.points.toFixed(2)} pts</strong> (${worst.season} Week ${worst.week})` }));
  } else {
    worstWeekSection.append(el('div', { class: 'history-stat', html: '—' }));
  }
  accoladesColumn.append(worstWeekSection);

  // Best Overall Record
  const bestRecordSection = el('div', { class: 'history-section' });
  bestRecordSection.append(el('div', { class: 'history-section-title', html: '👑 Best Overall Record' }));
  let bestRecord = null;
  for (const [uid, rec] of Object.entries(teamRecords)) {
    const total = rec.wins + rec.losses;
    const winPct = total > 0 ? rec.wins / total : 0;
    if (!bestRecord || winPct > bestRecord.winPct || (winPct === bestRecord.winPct && rec.wins > bestRecord.wins)) {
      bestRecord = { ...rec, winPct, uid };
    }
  }
  if (bestRecord) {
    bestRecordSection.append(el('div', { class: 'history-stat', html: `${bestRecord.teamName} · <strong>${bestRecord.wins}-${bestRecord.losses}</strong> (${(bestRecord.winPct * 100).toFixed(1)}%)` }));
  } else {
    bestRecordSection.append(el('div', { class: 'history-stat', html: '—' }));
  }
  accoladesColumn.append(bestRecordSection);

  // Worst Overall Record
  const worstRecordSection = el('div', { class: 'history-section' });
  worstRecordSection.append(el('div', { class: 'history-section-title', html: '📉 Worst Overall Record' }));
  let worstRecord = null;
  for (const [uid, rec] of Object.entries(teamRecords)) {
    const total = rec.wins + rec.losses;
    const winPct = total > 0 ? rec.wins / total : 0;
    if (!worstRecord || winPct < worstRecord.winPct || (winPct === worstRecord.winPct && rec.losses > worstRecord.losses)) {
      worstRecord = { ...rec, winPct, uid };
    }
  }
  if (worstRecord) {
    worstRecordSection.append(el('div', { class: 'history-stat', html: `${worstRecord.teamName} · <strong>${worstRecord.wins}-${worstRecord.losses}</strong> (${(worstRecord.winPct * 100).toFixed(1)}%)` }));
  } else {
    worstRecordSection.append(el('div', { class: 'history-stat', html: '—' }));
  }
  accoladesColumn.append(worstRecordSection);

  // Most Close Wins and Losses
  const closeGamesSection = el('div', { class: 'history-section' });
  closeGamesSection.append(el('div', { class: 'history-section-title', html: '🎯 Most Close Games (≤10 pts)' }));
  const closeGamesByTeam = {};
  closeGames.forEach(g => {
    if (!closeGamesByTeam[g.teamName]) {
      closeGamesByTeam[g.teamName] = { wins: 0, losses: 0 };
    }
    if (g.result === 'win') closeGamesByTeam[g.teamName].wins++;
    else closeGamesByTeam[g.teamName].losses++;
  });
  let mostClose = null;
  for (const [teamName, counts] of Object.entries(closeGamesByTeam)) {
    const total = counts.wins + counts.losses;
    if (!mostClose || total > mostClose.total) {
      mostClose = { teamName, ...counts, total };
    }
  }
  if (mostClose) {
    closeGamesSection.append(el('div', { class: 'history-stat', html: `${mostClose.teamName} · <strong>${mostClose.total} close games</strong> (${mostClose.wins}W-${mostClose.losses}L)` }));
  } else {
    closeGamesSection.append(el('div', { class: 'history-stat', html: '—' }));
  }
  accoladesColumn.append(closeGamesSection);

  // Biggest Draft Bust (lowest scoring first rounder)
  const bustSection = el('div', { class: 'history-section' });
  bustSection.append(el('div', { class: 'history-section-title', html: '💩 Biggest Draft Bust' }));
  const firstRounders = draftPicks.filter(p => p.round === 1);
  firstRounders.sort((a, b) => a.rookiePoints - b.rookiePoints);
  if (firstRounders[0]) {
    const bust = firstRounders[0];
    const player = playersMap[bust.player_id] || {};
    const meta = [player.pos, player.team].filter(Boolean).join(' • ');
    bustSection.append(el('div', { class: 'history-stat', html: `${player.fn || bust.player_id}${meta ? ' — ' + meta : ''} · <strong>${bust.rookiePoints.toFixed(2)} pts</strong> (Rd 1 Pick ${bust.pick_no}, ${bust.season}) — Drafted by ${bust.teamName}` }));
  } else {
    bustSection.append(el('div', { class: 'history-stat', html: '—' }));
  }
  accoladesColumn.append(bustSection);

  // Best Draft Pick (highest scoring rookie season)
  const bestPickSection = el('div', { class: 'history-section' });
  bestPickSection.append(el('div', { class: 'history-section-title', html: '💎 Best Draft Pick' }));
  draftPicks.sort((a, b) => b.rookiePoints - a.rookiePoints);
  if (draftPicks[0]) {
    const best = draftPicks[0];
    const player = playersMap[best.player_id] || {};
    const meta = [player.pos, player.team].filter(Boolean).join(' • ');
    bestPickSection.append(el('div', { class: 'history-stat', html: `${player.fn || best.player_id}${meta ? ' — ' + meta : ''} · <strong>${best.rookiePoints.toFixed(2)} pts</strong> (Rd ${best.round} Pick ${best.pick_no}, ${best.season}) — Drafted by ${best.teamName}` }));
  } else {
    bestPickSection.append(el('div', { class: 'history-stat', html: '—' }));
  }
  accoladesColumn.append(bestPickSection);

  // Biggest Rivalry (closest head-to-head record)
  const rivalrySection = el('div', { class: 'history-section' });
  rivalrySection.append(el('div', { class: 'history-section-title', html: '⚔️ Biggest Rivalry' }));
  let closestRivalry = null;
  for (const [key, h2h] of Object.entries(headToHead)) {
    const totalGames = h2h.team1Wins + h2h.team2Wins;
    if (totalGames < 3) continue; // Require at least 3 games
    const diff = Math.abs(h2h.team1Wins - h2h.team2Wins);
    if (!closestRivalry || diff < closestRivalry.diff || (diff === closestRivalry.diff && totalGames > closestRivalry.totalGames)) {
      closestRivalry = { ...h2h, diff, totalGames };
    }
  }
  if (closestRivalry) {
    rivalrySection.append(el('div', { class: 'history-stat', html: `${closestRivalry.team1} vs ${closestRivalry.team2} · <strong>${closestRivalry.team1Wins}-${closestRivalry.team2Wins}</strong> (${closestRivalry.totalGames} games)` }));
  } else {
    rivalrySection.append(el('div', { class: 'history-stat', html: '—' }));
  }
  accoladesColumn.append(rivalrySection);

  // Right column: All-Time Standings
  const standingsColumn = el('div', { class: 'standings-column' });
  const standingsTitle = el('div', { class: 'history-section-title', html: '📊 All-Time Standings' });
  standingsColumn.append(standingsTitle);

  const standingsTable = el('div', { class: 'all-time-standings' });
  allTimeRecords.forEach((rec, idx) => {
    const total = rec.wins + rec.losses;
    const pct = total > 0 ? (rec.wins / total * 100).toFixed(1) : '0.0';
    
    const row = el('div', { class: 'standing-row-alltime' },
      el('span', { class: 'rank' }, `${idx + 1}.`),
      el('div', { class: 'team-info' },
        el('span', { class: 'team-name' }, rec.teamName),
        rec.championships > 0 ? el('span', { class: 'trophy-mini' }, `🏆 ${rec.championships}`) : null
      ),
      el('span', { class: 'record' }, `${rec.wins}-${rec.losses}`),
      el('span', { class: 'pct' }, `${pct}%`)
    );
    standingsTable.append(row);
  });
  
  standingsColumn.append(standingsTable);

  // Append columns to container
  accoladesContainer.append(accoladesColumn, standingsColumn);
  inner.append(accoladesContainer);
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
            const currentWeek = await getCurrentWeek();
            const data = await getTeamHistory(uid, seasons, playersMap, currentWeek);
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

    // --- Add Accolades Section with All-Time Standings ---
    const accoladesHeader = el('h2', { style: 'margin-top: 3rem; margin-bottom: 1rem; font-family: Rajdhani, sans-serif; font-size: 1.8rem; color: rgba(255,255,255,0.95);' }, 'League Accolades');
    root.append(accoladesHeader);

    const accoladesCard = el('div', { class: 'history-card' });
    const accoladesHeaderEl = el('div', { class: 'history-header', role: 'button', tabindex: '0' });
    accoladesHeaderEl.append(
      el('div', { class: 'history-title', html: '🏅 Hall of Fame & Shame' }),
      el('div', { class: 'champion-badge', html: '📊 Stats' })
    );

    const accoladesBody = el('div', { class: 'history-content' });
    const accoladesInner = el('div', { class: 'history-inner', html: 'Open to load…' });
    accoladesBody.append(accoladesInner);

    const toggleAccolades = async () => {
      accoladesBody.classList.toggle('open');
      if (!accoladesBody.classList.contains('open')) return;

      if (!accoladesBody.dataset.loaded) {
        accoladesInner.textContent = 'Loading accolades…';
        try {
          // Calculate all-time records
          const allTimeRecords = [];
          for (const s of seasons) {
            const { ownerByRoster, rosters } = s;
            for (const r of rosters) {
              const u = ownerByRoster[r.roster_id];
              if (!u) continue;
              
              const teamName = sanitizeName(u.metadata?.team_name || u.display_name || `Team ${r.roster_id}`);
              
              // Skip nategauthier / "i despise this game" from all-time standings
              if (teamName.toLowerCase().includes('nategauthier') || 
                  teamName.toLowerCase().includes('despise')) continue;
              
              const wins = r.settings?.wins ?? 0;
              const losses = r.settings?.losses ?? 0;
              const pts = (r.settings?.fpts ?? 0) + (r.settings?.fpts_decimal ?? 0) / 100;
              
              let existing = allTimeRecords.find(rec => rec.userId === u.user_id);
              if (!existing) {
                existing = { 
                  userId: u.user_id, 
                  teamName, 
                  wins: 0, 
                  losses: 0, 
                  totalPoints: 0,
                  championships: franchiseByUser.get(u.user_id)?.championships || 0
                };
                allTimeRecords.push(existing);
              }
              
              existing.wins += wins;
              existing.losses += losses;
              existing.totalPoints += pts;
            }
          }
          
          // Sort by wins, then by win percentage
          allTimeRecords.sort((a, b) => {
            const totalA = a.wins + a.losses;
            const totalB = b.wins + b.losses;
            const pctA = totalA > 0 ? a.wins / totalA : 0;
            const pctB = totalB > 0 ? b.wins / totalB : 0;
            
            if (b.wins !== a.wins) return b.wins - a.wins;
            return pctB - pctA;
          });

          await renderAccoladesWithStandings(accoladesBody, seasons, playersMap, allTimeRecords);
          accoladesBody.dataset.loaded = '1';
        } catch (e) {
          console.error('Accolades load error:', e);
          accoladesInner.textContent = 'Failed to load accolades.';
        }
      }
    };

    accoladesHeaderEl.addEventListener('click', toggleAccolades);
    accoladesHeaderEl.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleAccolades(); }
    });

    accoladesCard.append(accoladesHeaderEl, accoladesBody);
    root.append(accoladesCard);

    // --- Add Weekly History Section ---
    const weeklyHeader = el('h2', { style: 'margin-top: 3rem; margin-bottom: 1rem; font-family: Rajdhani, sans-serif; font-size: 1.8rem; color: rgba(255,255,255,0.95);' }, 'Weekly History');
    root.append(weeklyHeader);

    const currentWeek = await getCurrentWeek();
    const { ownerByRoster } = current;

    // Create cards for each week (most recent first)
    for (let week = currentWeek - 1; week >= 1; week--) {
      const weekCard = el('div', { class: 'history-card' });
      const weekHeader = el('div', { class: 'history-header', role: 'button', tabindex: '0' });
      weekHeader.append(
        el('div', { class: 'history-title', html: `Week ${week}` }),
        el('div', { class: 'champion-badge', html: `📊 Recap` })
      );

      const weekBody = el('div', { class: 'history-content' });
      const weekInner = el('div', { class: 'history-inner', html: 'Open to load…' });
      weekBody.append(weekInner);

      const toggleWeek = async () => {
        weekBody.classList.toggle('open');
        if (!weekBody.classList.contains('open')) return;

        if (!weekBody.dataset.loaded) {
          weekInner.textContent = 'Loading…';
          try {
            const matchups = await getWeekStats(week);
            renderWeekRecapInto(weekBody, week, matchups, ownerByRoster, playersMap);
            weekBody.dataset.loaded = '1';
          } catch (e) {
            console.error(`Week ${week} load error:`, e);
            weekInner.textContent = 'Failed to load week data.';
          }
        }
      };

      weekHeader.addEventListener('click', toggleWeek);
      weekHeader.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleWeek(); }
      });

      weekCard.append(weekHeader, weekBody);
      root.append(weekCard);
    }

  } catch (err) {
    console.error('loadHistory error:', err);
    root.textContent = 'Failed to load league history.';
  }
}