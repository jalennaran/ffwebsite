// scripts/homepage.js
import { SLEEPER_BASE, LEAGUE_ID, jget, jgetAbs, getLeagueBundle, getCurrentWeek, getPlayersMap } from './api.js';
import { el, sanitizeName, avatarURL } from './ui.js';

/* ----------------------- Utility Functions ----------------------- */

// Fetch trending players from Sleeper
async function getTrendingPlayers(type = 'add', limit = 5) {
  try {
    const res = await jget(`/players/nfl/trending/${type}?lookback_hours=24&limit=${limit}`);
    // API returns array of { count, player_id }
    if (!Array.isArray(res)) return [];
    return res.map(item => ({
      playerId: item.player_id,
      count: item.count
    }));
  } catch (e) {
    console.error('Failed to fetch trending players:', e);
    return [];
  }
}

// Get current week's matchups
async function getCurrentMatchups(week) {
  try {
    const matchups = await jget(`/league/${LEAGUE_ID}/matchups/${week}`);
    return matchups || [];
  } catch (e) {
    console.error('Failed to fetch matchups:', e);
    return [];
  }
}

// Get previous week's matchups for stats
async function getPreviousWeekStats(week) {
  if (week <= 1) return null;
  try {
    const matchups = await jget(`/league/${LEAGUE_ID}/matchups/${week - 1}`);
    return matchups || [];
  } catch (e) {
    console.error('Failed to fetch previous week matchups:', e);
    return [];
  }
}

// Calculate top scorers by position from previous week
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

/* ----------------------- Skeleton Loaders ----------------------- */

// Skeleton for scoreboard card
function createScoreboardSkeleton() {
  const card = el('div', { class: 'skeleton-card' });
  card.appendChild(el('div', { class: 'skeleton skeleton-title' }));
  
  // Create 4-5 skeleton matchup rows
  for (let i = 0; i < 5; i++) {
    const matchupRow = el('div', { class: 'skeleton-matchup' },
      el('div', { class: 'skeleton-team' },
        el('div', { class: 'skeleton skeleton-line medium' }),
        el('div', { class: 'skeleton skeleton-line large' }),
        el('div', { class: 'skeleton skeleton-line small' })
      ),
      el('div', { class: 'skeleton skeleton-vs' }),
      el('div', { class: 'skeleton-team' },
        el('div', { class: 'skeleton skeleton-line medium' }),
        el('div', { class: 'skeleton skeleton-line large' }),
        el('div', { class: 'skeleton skeleton-line small' })
      )
    );
    card.appendChild(matchupRow);
  }
  
  return card;
}

// Skeleton for trending players card
function createTrendingSkeleton() {
  const card = el('div', { class: 'skeleton-card' });
  card.appendChild(el('div', { class: 'skeleton skeleton-title' }));
  
  // Create 8 skeleton rows
  for (let i = 0; i < 8; i++) {
    const row = el('div', { class: 'skeleton-row' },
      el('div', { class: 'skeleton skeleton-line full' }),
      el('div', { class: 'skeleton skeleton-line medium' })
    );
    card.appendChild(row);
  }
  
  return card;
}

// Skeleton for standings card
function createStandingsSkeleton() {
  const card = el('div', { class: 'skeleton-card' });
  card.appendChild(el('div', { class: 'skeleton skeleton-title' }));
  
  // Create 10 skeleton rows
  for (let i = 0; i < 10; i++) {
    const row = el('div', { class: 'skeleton-row' },
      el('div', { class: 'skeleton skeleton-line full' })
    );
    card.appendChild(row);
  }
  
  return card;
}

// Skeleton for recap card (larger)
function createRecapSkeleton() {
  const card = el('div', { class: 'skeleton-card' });
  card.appendChild(el('div', { class: 'skeleton skeleton-title' }));
  
  // Create multiple sections with rows
  for (let section = 0; section < 3; section++) {
    card.appendChild(el('div', { class: 'skeleton skeleton-line medium', style: 'margin: 1rem 0 0.5rem 0; height: 20px;' }));
    for (let i = 0; i < 4; i++) {
      const row = el('div', { class: 'skeleton-row' },
        el('div', { class: 'skeleton skeleton-line full' })
      );
      card.appendChild(row);
    }
  }
  
  return card;
}

/* ----------------------- Card Renderers ----------------------- */

// Current Scoreboard Card
async function renderCurrentScoreboard(week) {
  const card = el('div', { class: 'home-card clickable-card' });
  
  // Add click handler to navigate to matchups page
  card.addEventListener('click', () => {
    window.location.hash = '#/matchups';
  });
  
  try {
    const matchups = await getCurrentMatchups(week);
    const { ownerByRoster } = await getLeagueBundle();
    
    card.appendChild(el('h3', { class: 'card-title' }, `Week ${week} Scoreboard`));
    
    if (!matchups || matchups.length === 0) {
      card.appendChild(el('p', {}, 'No matchups available yet.'));
      return card;
    }
    
    const scoreboardDiv = el('div', { class: 'scoreboard-content' });
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
      
      const startersLeft1 = m1.starters?.filter(p => p && p !== '0').length || 0;
      const startersLeft2 = opponent.starters?.filter(p => p && p !== '0').length || 0;
      
      const matchupRow = el('div', { class: 'matchup-row' },
        el('div', { class: 'matchup-team' },
          el('span', { class: 'team-name' }, team1),
          el('span', { class: 'team-score' }, (m1.points || 0).toFixed(2)),
          el('span', { class: 'starters-left' }, `${startersLeft1} left`)
        ),
        el('div', { class: 'matchup-vs' }, 'vs'),
        el('div', { class: 'matchup-team' },
          el('span', { class: 'team-name' }, team2),
          el('span', { class: 'team-score' }, (opponent.points || 0).toFixed(2)),
          el('span', { class: 'starters-left' }, `${startersLeft2} left`)
        )
      );
      
      scoreboardDiv.appendChild(matchupRow);
    });
    
    card.appendChild(scoreboardDiv);
  } catch (e) {
    console.error('Error rendering current scoreboard:', e);
    card.appendChild(el('p', {}, 'Failed to load scoreboard.'));
  }
  
  return card;
}

// Trending Players Card
async function renderTrendingPlayers() {
  const card = el('div', { class: 'home-card clickable-card' });
  
  // Add click handler to navigate to transactions page
  card.addEventListener('click', () => {
    window.location.hash = '#/transactions';
  });
  
  try {
    card.appendChild(el('h3', { class: 'card-title' }, '🔥 Trending Players'));
    
    const trending = await getTrendingPlayers('add', 8);
    const playersMap = await getPlayersMap();
    
    if (!trending || trending.length === 0) {
      card.appendChild(el('p', {}, 'No trending data available.'));
      return card;
    }
    
    const listDiv = el('div', { class: 'trending-list' });
    
    trending.forEach(item => {
      const player = playersMap[item.playerId];
      if (!player) return;
      
      // Format the add count (e.g., 882990 -> "882,990 adds")
      const formattedCount = item.count.toLocaleString();
      
      const playerRow = el('div', { class: 'trending-player' },
        el('div', { class: 'player-info' },
          el('span', { class: 'player-name' }, player.fn || item.playerId),
          el('span', { class: 'player-meta' }, `${player.pos || '—'} • ${player.team || '—'}`)
        ),
        el('span', { class: 'add-count' }, `+${formattedCount}`)
      );
      
      listDiv.appendChild(playerRow);
    });
    
    card.appendChild(listDiv);
  } catch (e) {
    console.error('Error rendering trending players:', e);
    card.appendChild(el('p', {}, 'Failed to load trending players.'));
  }
  
  return card;
}

// Previous Week Recap Card
async function renderPreviousWeekRecap(week) {
  const card = el('div', { class: 'home-card large-card clickable-card' });
  
  // Add click handler to navigate to history page
  card.addEventListener('click', () => {
    window.location.hash = '#/history';
  });
  
  try {
    card.appendChild(el('h3', { class: 'card-title' }, `Week ${week - 1} Recap`));
    
    const matchups = await getPreviousWeekStats(week);
    if (!matchups || matchups.length === 0) {
      card.appendChild(el('p', {}, 'No data available for previous week.'));
      return card;
    }
    
    const { ownerByRoster } = await getLeagueBundle();
    const playersMap = await getPlayersMap();
    
    const topScorers = getTopScorersByPosition(matchups, playersMap, ownerByRoster);
    const { highest, lowest } = getTeamScoreExtremes(matchups, ownerByRoster);
    const { closest, blowout } = getMatchupExtremes(matchups, ownerByRoster);
    
    const recapContent = el('div', { class: 'recap-content' });
    
    // Top scorers by position
    if (Object.keys(topScorers).length > 0) {
      const topScorersDiv = el('div', { class: 'recap-section' },
        el('h4', {}, 'Top Scorers by Position')
      );
      
      Object.entries(topScorers).forEach(([pos, player]) => {
        topScorersDiv.appendChild(
          el('div', { class: 'stat-row' },
            el('span', { class: 'stat-label' }, `${pos}:`),
            el('span', { class: 'stat-value' }, `${player.name} (${player.team}) - ${player.points.toFixed(2)} pts - ${player.fantasyTeam}`)
          )
        );
      });
      
      recapContent.appendChild(topScorersDiv);
    }
    
    // Team extremes
    const teamsDiv = el('div', { class: 'recap-section' },
      el('h4', {}, 'Team Performances')
    );
    
    if (highest) {
      teamsDiv.appendChild(
        el('div', { class: 'stat-row' },
          el('span', { class: 'stat-label' }, '🏆 Highest Score:'),
          el('span', { class: 'stat-value' }, `${highest.teamName} - ${highest.points.toFixed(2)} pts`)
        )
      );
    }
    
    if (lowest) {
      teamsDiv.appendChild(
        el('div', { class: 'stat-row' },
          el('span', { class: 'stat-label' }, '💀 Lowest Score:'),
          el('span', { class: 'stat-value' }, `${lowest.teamName} - ${lowest.points.toFixed(2)} pts`)
        )
      );
    }
    
    recapContent.appendChild(teamsDiv);
    
    // Matchup extremes
    const matchupsDiv = el('div', { class: 'recap-section' },
      el('h4', {}, 'Notable Matchups')
    );
    
    if (closest) {
      matchupsDiv.appendChild(
        el('div', { class: 'stat-row' },
          el('span', { class: 'stat-label' }, '🎯 Closest Game:'),
          el('span', { class: 'stat-value' }, 
            `${closest.team1} ${closest.score1.toFixed(2)} - ${closest.score2.toFixed(2)} ${closest.team2} (${closest.diff.toFixed(2)} pt diff)`
          )
        )
      );
    }
    
    if (blowout) {
      matchupsDiv.appendChild(
        el('div', { class: 'stat-row' },
          el('span', { class: 'stat-label' }, '💥 Biggest Blowout:'),
          el('span', { class: 'stat-value' }, 
            `${blowout.team1} ${blowout.score1.toFixed(2)} - ${blowout.score2.toFixed(2)} ${blowout.team2} (${blowout.diff.toFixed(2)} pt diff)`
          )
        )
      );
    }
    
    recapContent.appendChild(matchupsDiv);
    card.appendChild(recapContent);
    
  } catch (e) {
    console.error('Error rendering previous week recap:', e);
    card.appendChild(el('p', {}, 'Failed to load previous week recap.'));
  }
  
  return card;
}

// Simple Standings Card
async function renderSimpleStandings() {
  const card = el('div', { class: 'home-card clickable-card' });
  
  // Add click handler to navigate to standings page
  card.addEventListener('click', () => {
    window.location.hash = '#/standings';
  });
  
  try {
    card.appendChild(el('h3', { class: 'card-title' }, 'Current Standings'));
    
    const { rosters, ownerByRoster } = await getLeagueBundle();
    
    const standings = rosters.map(r => {
      const u = ownerByRoster[r.roster_id];
      const teamName = sanitizeName(
        u?.metadata?.team_name || 
        u?.display_name || 
        `Roster ${r.roster_id}`
      );
      const wins = r.settings?.wins ?? 0;
      const losses = r.settings?.losses ?? 0;
      
      return { teamName, wins, losses };
    }).sort((a, b) => b.wins - a.wins);
    
    const standingsDiv = el('div', { class: 'standings-list' });
    
    standings.forEach((team, idx) => {
      standingsDiv.appendChild(
        el('div', { class: 'standing-row' },
          el('span', { class: 'standing-rank' }, `${idx + 1}.`),
          el('span', { class: 'standing-team' }, team.teamName),
          el('span', { class: 'standing-record' }, `${team.wins}-${team.losses}`)
        )
      );
    });
    
    card.appendChild(standingsDiv);
    
  } catch (e) {
    console.error('Error rendering standings:', e);
    card.appendChild(el('p', {}, 'Failed to load standings.'));
  }
  
  return card;
}

/* ----------------------- Main Render Function ----------------------- */

export default async function loadHomepage() {
  const root = document.getElementById('home-root');
  if (!root) return;
  
  // Create card grid with skeleton loaders
  const grid = el('div', { class: 'home-grid' });
  
  // Add skeleton loaders immediately
  const scoreboardSkeleton = createScoreboardSkeleton();
  const trendingSkeleton = createTrendingSkeleton();
  const standingsSkeleton = createStandingsSkeleton();
  const recapSkeleton = createRecapSkeleton();
  recapSkeleton.style.gridColumn = '1 / -1'; // Make recap skeleton span full width
  
  grid.appendChild(scoreboardSkeleton);
  grid.appendChild(trendingSkeleton);
  grid.appendChild(standingsSkeleton);
  grid.appendChild(recapSkeleton);
  
  root.innerHTML = '';
  root.appendChild(grid);
  
  try {
    const week = await getCurrentWeek();
    
    // Render all cards
    const [
      scoreboardCard,
      trendingCard,
      standingsCard,
      recapCard
    ] = await Promise.all([
      renderCurrentScoreboard(week),
      renderTrendingPlayers(),
      renderSimpleStandings(),
      renderPreviousWeekRecap(week)
    ]);
    
    // Replace skeleton loaders with actual content
    grid.replaceChild(scoreboardCard, scoreboardSkeleton);
    grid.replaceChild(trendingCard, trendingSkeleton);
    grid.replaceChild(standingsCard, standingsSkeleton);
    grid.replaceChild(recapCard, recapSkeleton);
    
  } catch (e) {
    console.error('Error loading homepage:', e);
    root.innerHTML = '<p>Failed to load homepage content.</p>';
  }
}
