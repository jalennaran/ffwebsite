// scripts/player-stats.js
import { SLEEPER_BASE, LEAGUE_ID, jget, jgetAbs, getCurrentWeek, getCurrentSeason, getPlayersMap } from './api.js';
import { el, sanitizeName } from './ui.js';
import { openPlayerPanel } from './player-panel.js';

/* ----------------------- Utility Functions ----------------------- */

// Fetch player stats for a specific week
async function getPlayerStats(season, week) {
  try {
    const positions = ['QB', 'RB', 'WR', 'TE', 'K'];
    const allStats = [];
    
    // Fetch stats for each position
    await Promise.all(positions.map(async (pos) => {
      try {
        const url = `https://api.sleeper.com/stats/nfl/${season}/${week}?season_type=regular&position=${pos}`;
        const stats = await jgetAbs(url);
        if (Array.isArray(stats)) {
          allStats.push(...stats);
        }
      } catch (e) {
        console.warn(`Failed to fetch stats for ${pos}:`, e);
      }
    }));
    
    return allStats;
  } catch (e) {
    console.error('Failed to fetch player stats:', e);
    return [];
  }
}

// Aggregate stats across multiple weeks
async function getAggregatedStats(season, startWeek, endWeek, playersMap) {
  const playerTotals = new Map();
  
  // Get current rosters to track fantasy team ownership
  const [rosters, users] = await Promise.all([
    jget(`/league/${LEAGUE_ID}/rosters`),
    jget(`/league/${LEAGUE_ID}/users`)
  ]);
  
  const userById = {};
  users.forEach(u => userById[u.user_id] = u);
  
  const ownerByRoster = {};
  rosters.forEach(r => ownerByRoster[r.roster_id] = userById[r.owner_id]);
  
  // Create a map of player -> fantasy team for current season
  const playerToFantasyTeam = {};
  rosters.forEach(roster => {
    const owner = ownerByRoster[roster.roster_id];
    const fantasyTeam = sanitizeName(owner?.metadata?.team_name || owner?.display_name || `Team ${roster.roster_id}`);
    
    if (roster.players) {
      roster.players.forEach(playerId => {
        playerToFantasyTeam[playerId] = fantasyTeam;
      });
    }
  });
  
  for (let week = startWeek; week <= endWeek; week++) {
    const weekStats = await getPlayerStats(season, week);
    
    weekStats.forEach(stat => {
      const playerId = stat.player_id || stat.id;
      if (!playerId) return;
      
      const stats = stat.stats || {};
      const points = stats.fantasy_points_ppr || stats.fantasy_points || stats.pts_ppr || 0;
      
      // Skip if player scored 0 points
      if (points <= 0) return;
      
      // Get position from playersMap as fallback
      const player = playersMap[playerId];
      const position = stat.position || player?.pos || 'UNKNOWN';
      
      if (!playerTotals.has(playerId)) {
        playerTotals.set(playerId, {
          playerId,
          totalPoints: 0,
          games: 0,
          team: stat.team || player?.team,
          position: position,
          fantasyTeam: playerToFantasyTeam[playerId] || 'Free Agent'
        });
      }
      
      const playerData = playerTotals.get(playerId);
      playerData.totalPoints += Number(points) || 0;
      playerData.games += 1;
      // Update position if we didn't have it before
      if (!playerData.position || playerData.position === 'UNKNOWN') {
        playerData.position = position;
      }
    });
  }
  
  return Array.from(playerTotals.values());
}

// Fetch all-time league stats from matchup history
async function getAllTimeLeagueStats(playersMap) {
  const playerTotals = new Map();
  
  try {
    // Current league ID
    let currentLeagueId = LEAGUE_ID;
    const processedLeagues = new Set();
    
    console.log(`Starting all-time stats fetch from current league: ${currentLeagueId}`);
    
    // Follow the previous_league_id chain backwards through history
    while (currentLeagueId && !processedLeagues.has(currentLeagueId)) {
      processedLeagues.add(currentLeagueId);
      
      try {
        const league = await jget(`/league/${currentLeagueId}`);
        const season = league?.season || new Date().getFullYear();
        
        console.log(`Processing ${season} season (League ID: ${currentLeagueId})...`);
        
        // Get rosters and users for this league to track fantasy team ownership
        const [rosters, users] = await Promise.all([
          jget(`/league/${currentLeagueId}/rosters`),
          jget(`/league/${currentLeagueId}/users`)
        ]);
        
        const userById = {};
        users.forEach(u => userById[u.user_id] = u);
        
        const ownerByRoster = {};
        rosters.forEach(r => ownerByRoster[r.roster_id] = userById[r.owner_id]);
        
        // For each season, check weeks 1-17 (regular season)
        for (let week = 1; week <= 17; week++) {
          try {
            const matchups = await jget(`/league/${currentLeagueId}/matchups/${week}`);
            
            if (!matchups || matchups.length === 0) continue;
            
            // Process each matchup
            matchups.forEach(matchup => {
              if (!matchup.players_points) return;
              
              const rosterId = matchup.roster_id;
              const owner = ownerByRoster[rosterId];
              const fantasyTeam = sanitizeName(owner?.metadata?.team_name || owner?.display_name || `Team ${rosterId}`);
              
              // Iterate through each player's points in this matchup
              Object.entries(matchup.players_points).forEach(([playerId, points]) => {
                const player = playersMap[playerId];
                
                // Skip if player scored 0 points
                if (points <= 0) return;
                
                if (!playerTotals.has(playerId)) {
                  playerTotals.set(playerId, {
                    playerId,
                    totalPoints: 0,
                    games: 0,
                    position: player?.pos || 'UNKNOWN',
                    team: player?.team || '—',
                    fantasyTeamHistory: {} // Track games played with each fantasy team
                  });
                }
                
                const playerData = playerTotals.get(playerId);
                playerData.totalPoints += Number(points) || 0;
                playerData.games += 1;
                
                // Track fantasy team history
                if (fantasyTeam) {
                  playerData.fantasyTeamHistory[fantasyTeam] = (playerData.fantasyTeamHistory[fantasyTeam] || 0) + 1;
                }
              });
            });
          } catch (e) {
            // Week might not exist, continue
            continue;
          }
        }
        
        // Move to previous league
        currentLeagueId = league?.previous_league_id;
        
        // Stop if we've gone back to 2021 or earlier
        if (season <= 2021) break;
        
      } catch (e) {
        console.error(`Error processing league ${currentLeagueId}:`, e);
        break;
      }
    }
    
    console.log(`Processed ${processedLeagues.size} seasons`);
    
    // After processing all data, determine which fantasy team to show for each player
    playerTotals.forEach((playerData, playerId) => {
      // Find the fantasy team they played with most
      const teams = Object.entries(playerData.fantasyTeamHistory);
      if (teams.length > 0) {
        teams.sort((a, b) => b[1] - a[1]); // Sort by games played
        playerData.fantasyTeam = teams[0][0];
      } else {
        playerData.fantasyTeam = 'Free Agent';
      }
      
      // Clean up the fantasyTeamHistory object as we don't need it anymore
      delete playerData.fantasyTeamHistory;
    });
    
  } catch (e) {
    console.error('Error fetching all-time stats:', e);
  }
  
  return Array.from(playerTotals.values());
}

/* ----------------------- Card Renderers ----------------------- */

// Render a single stats card for a position
async function renderStatsCard(title, players, icon = '🏈', showFantasyTeam = false) {
  const card = el('div', { class: 'stats-card' });
  
  const cardTitle = el('h3', { class: 'stats-card-title' },
    el('span', { class: 'position-icon' }, icon),
    title
  );
  card.appendChild(cardTitle);
  
  if (!players || players.length === 0) {
    card.appendChild(el('div', { class: 'stats-empty' }, 'No data available'));
    return card;
  }
  
  const playerList = el('div', { class: 'stats-player-list' });
  
  players.forEach((player, idx) => {
    const rank = idx + 1;
    let rankClass = 'stats-player-rank';
    if (rank === 1) rankClass += ' top-1';
    else if (rank === 2) rankClass += ' top-2';
    else if (rank === 3) rankClass += ' top-3';
    
    const avgPoints = player.games > 0 ? (player.totalPoints / player.games).toFixed(1) : '0.0';
    
    // Build meta text based on whether we're showing fantasy team or not
    let metaText;
    if (showFantasyTeam && player.fantasyTeam) {
      metaText = `${player.team || '—'} • ${player.fantasyTeam} • ${player.games} games • ${avgPoints} PPG`;
    } else {
      metaText = `${player.team || '—'} • ${player.games} games • ${avgPoints} PPG`;
    }
    
    const playerRow = el('div', { class: 'stats-player-row' },
      el('span', { class: rankClass }, `${rank}.`),
      el('div', { class: 'stats-player-info' },
        el('span', { class: 'stats-player-name' }, player.name),
        el('span', { class: 'stats-player-meta' }, metaText)
      ),
      el('span', { class: 'stats-player-points' }, player.totalPoints.toFixed(1))
    );
    
    // Add click handler to open player modal
    playerRow.addEventListener('click', (e) => {
      e.stopPropagation();
      openPlayerPanel(player.playerId);
    });
    
    playerList.appendChild(playerRow);
  });
  
  card.appendChild(playerList);
  return card;
}

// Get top players by position
function getTopPlayersByPosition(aggregatedStats, playersMap, position, limit = 10) {
  const positionPlayers = aggregatedStats
    .filter(p => {
      if (position === 'ALL') return true;
      return p.position === position;
    })
    .sort((a, b) => b.totalPoints - a.totalPoints)
    .slice(0, limit);
  
  return positionPlayers.map(p => {
    const player = playersMap[p.playerId];
    return {
      ...p,
      name: player?.fn || p.playerId,
      team: p.team || player?.team || '—',
      position: p.position || player?.pos || '—'
    };
  });
}

/* ----------------------- Main Render Function ----------------------- */

export default async function loadPlayerStats() {
  const root = document.getElementById('player-stats-root');
  if (!root) return;
  
  // Show skeleton loading
  const skeletonGrid = el('div', { class: 'player-stats-grid' });
  for (let i = 0; i < 6; i++) {
    const skeletonCard = el('div', { class: 'stats-card skeleton-stats-card' },
      el('div', { class: 'stats-card-header' },
        el('div', { class: 'skeleton skeleton-card-icon' }),
        el('div', { class: 'skeleton skeleton-card-title' })
      ),
      el('div', { class: 'stats-card-body' },
        ...Array(5).fill().map(() => 
          el('div', { class: 'stats-player-row' },
            el('div', { class: 'skeleton skeleton-player-rank' }),
            el('div', { class: 'skeleton skeleton-player-avatar' }),
            el('div', { class: 'skeleton-player-info' },
              el('div', { class: 'skeleton skeleton-player-name' }),
              el('div', { class: 'skeleton skeleton-player-team' })
            ),
            el('div', { class: 'skeleton skeleton-player-points' })
          )
        )
      )
    );
    skeletonGrid.appendChild(skeletonCard);
  }
  root.innerHTML = '';
  root.appendChild(skeletonGrid);
  
  try {
    const season = await getCurrentSeason();
    const currentWeek = await getCurrentWeek();
    const playersMap = await getPlayersMap();
    
    // Get stats from week 1 to current week
    const startWeek = 1;
    const endWeek = Math.max(1, currentWeek - 1); // Use completed weeks
    
    console.log(`Fetching stats for season ${season}, weeks ${startWeek}-${endWeek}`);
    
    const aggregatedStats = await getAggregatedStats(season, startWeek, endWeek, playersMap);
    
    console.log(`Total players with stats: ${aggregatedStats.length}`);
    console.log('Position breakdown:', {
      QB: aggregatedStats.filter(p => p.position === 'QB').length,
      RB: aggregatedStats.filter(p => p.position === 'RB').length,
      WR: aggregatedStats.filter(p => p.position === 'WR').length,
      TE: aggregatedStats.filter(p => p.position === 'TE').length,
      K: aggregatedStats.filter(p => p.position === 'K').length
    });
    
    // Create grid
    const grid = el('div', { class: 'player-stats-grid' });
    
    // Get top players for each category
    const topAll = getTopPlayersByPosition(aggregatedStats, playersMap, 'ALL', 10);
    const topQB = getTopPlayersByPosition(aggregatedStats, playersMap, 'QB', 10);
    const topRB = getTopPlayersByPosition(aggregatedStats, playersMap, 'RB', 10);
    const topWR = getTopPlayersByPosition(aggregatedStats, playersMap, 'WR', 10);
    const topTE = getTopPlayersByPosition(aggregatedStats, playersMap, 'TE', 10);
    const topK = getTopPlayersByPosition(aggregatedStats, playersMap, 'K', 10);
    
    console.log('Top players per position:', {
      all: topAll.length,
      QB: topQB.length,
      RB: topRB.length,
      WR: topWR.length,
      TE: topTE.length,
      K: topK.length
    });
    
    // Render all cards
    const [
      allCard,
      qbCard,
      rbCard,
      wrCard,
      teCard,
      kCard
    ] = await Promise.all([
      renderStatsCard('Top Fantasy Players', topAll, '⭐', true),
      renderStatsCard('Top Quarterbacks', topQB, '🎯', true),
      renderStatsCard('Top Running Backs', topRB, '🏃', true),
      renderStatsCard('Top Wide Receivers', topWR, '🤲', true),
      renderStatsCard('Top Tight Ends', topTE, '💪', true),
      renderStatsCard('Top Kickers', topK, '🦵', true)
    ]);
    
    grid.appendChild(allCard);
    grid.appendChild(qbCard);
    grid.appendChild(rbCard);
    grid.appendChild(wrCard);
    grid.appendChild(teCard);
    grid.appendChild(kCard);
    
    root.innerHTML = '';
    root.appendChild(grid);
    
    // Add All-Time Statistics Section
    const allTimeHeader = el('h2', { class: 'stats-section-header' }, 'All Time Player Statistics');
    root.appendChild(allTimeHeader);
    
    // Show skeleton loading for all-time stats
    const allTimeSkeletonGrid = el('div', { class: 'player-stats-grid' });
    for (let i = 0; i < 6; i++) {
      const skeletonCard = el('div', { class: 'stats-card skeleton-stats-card' },
        el('div', { class: 'stats-card-header' },
          el('div', { class: 'skeleton skeleton-card-icon' }),
          el('div', { class: 'skeleton skeleton-card-title' })
        ),
        el('div', { class: 'stats-card-body' },
          ...Array(5).fill().map(() => 
            el('div', { class: 'stats-player-row' },
              el('div', { class: 'skeleton skeleton-player-rank' }),
              el('div', { class: 'skeleton skeleton-player-avatar' }),
              el('div', { class: 'skeleton-player-info' },
                el('div', { class: 'skeleton skeleton-player-name' }),
                el('div', { class: 'skeleton skeleton-player-team' })
              ),
              el('div', { class: 'skeleton skeleton-player-points' })
            )
          )
        )
      );
      allTimeSkeletonGrid.appendChild(skeletonCard);
    }
    root.appendChild(allTimeSkeletonGrid);
    
    // Fetch and render all-time stats
    const allTimeStats = await getAllTimeLeagueStats(playersMap);
    
    console.log(`Total all-time players: ${allTimeStats.length}`);
    
    // Create grid for all-time stats
    const allTimeGrid = el('div', { class: 'player-stats-grid' });
    
    // Get top all-time players for each category
    const allTimeAll = getTopPlayersByPosition(allTimeStats, playersMap, 'ALL', 10);
    const allTimeQB = getTopPlayersByPosition(allTimeStats, playersMap, 'QB', 10);
    const allTimeRB = getTopPlayersByPosition(allTimeStats, playersMap, 'RB', 10);
    const allTimeWR = getTopPlayersByPosition(allTimeStats, playersMap, 'WR', 10);
    const allTimeTE = getTopPlayersByPosition(allTimeStats, playersMap, 'TE', 10);
    const allTimeK = getTopPlayersByPosition(allTimeStats, playersMap, 'K', 10);
    
    // Render all-time cards
    const [
      allTimeAllCard,
      allTimeQbCard,
      allTimeRbCard,
      allTimeWrCard,
      allTimeTeCard,
      allTimeKCard
    ] = await Promise.all([
      renderStatsCard('Top Fantasy Players (All-Time)', allTimeAll, '⭐', true),
      renderStatsCard('Top Quarterbacks (All-Time)', allTimeQB, '🎯', true),
      renderStatsCard('Top Running Backs (All-Time)', allTimeRB, '🏃', true),
      renderStatsCard('Top Wide Receivers (All-Time)', allTimeWR, '🤲', true),
      renderStatsCard('Top Tight Ends (All-Time)', allTimeTE, '💪', true),
      renderStatsCard('Top Kickers (All-Time)', allTimeK, '🦵', true)
    ]);
    
    allTimeGrid.appendChild(allTimeAllCard);
    allTimeGrid.appendChild(allTimeQbCard);
    allTimeGrid.appendChild(allTimeRbCard);
    allTimeGrid.appendChild(allTimeWrCard);
    allTimeGrid.appendChild(allTimeTeCard);
    allTimeGrid.appendChild(allTimeKCard);
    
    // Remove skeleton and add all-time grid
    root.removeChild(allTimeSkeletonGrid);
    root.appendChild(allTimeGrid);
    
  } catch (e) {
    console.error('Error loading player stats:', e);
    root.innerHTML = '<div class="stats-error">Failed to load player statistics.</div>';
  }
}
