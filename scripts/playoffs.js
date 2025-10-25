// scripts/playoffs.js
import { jget, LEAGUE_ID, getPlayersMap } from './api.js';
import { el, sanitizeName } from './ui.js';

/* ----------------------- Historical Playoff Data ----------------------- */
// Manual playoff data for each season
const PLAYOFF_DATA = {
  2024: {
    champion: 'Bijan Mustardson',
    championUsername: 'jalennaran',
  },
  2023: {
    champion: "Eitan's Team",
    championUsername: 'jewishpoosayslay',
  },
  2022: {
    champion: 'Jordan love story',
    championUsername: 'WillH19',
  },
};

/* ----------------------- Season Data Fetcher ----------------------- */
async function getSeasonData(season) {
  try {
    // Find the league for this season by walking back through linked seasons
    let currentLeagueId = LEAGUE_ID;
    let targetLeague = null;
    
    while (currentLeagueId) {
      const league = await jget(`/league/${currentLeagueId}`);
      if (league.season === String(season)) {
        targetLeague = league;
        break;
      }
      currentLeagueId = league.previous_league_id || null;
    }
    
    if (!targetLeague) {
      console.warn(`League not found for season ${season}`);
      return null;
    }
    
    const [users, rosters] = await Promise.all([
      jget(`/league/${targetLeague.league_id}/users`),
      jget(`/league/${targetLeague.league_id}/rosters`),
    ]);
    
    const userById = Object.fromEntries(users.map(u => [u.user_id, u]));
    const ownerByRoster = {};
    rosters.forEach(r => (ownerByRoster[r.roster_id] = userById[r.owner_id]));
    
    return {
      leagueId: targetLeague.league_id,
      league: targetLeague,
      users,
      rosters,
      userById,
      ownerByRoster,
    };
  } catch (e) {
    console.error(`Error fetching season ${season} data:`, e);
    return null;
  }
}

/* ----------------------- Helper: Calculate Playoff Seeds ----------------------- */
function calculatePlayoffSeeds(rosters) {
  // Sort rosters by wins (descending), then by points for (descending)
  const sortedRosters = [...rosters].sort((a, b) => {
    const winsA = a.settings?.wins || 0;
    const winsB = b.settings?.wins || 0;
    if (winsB !== winsA) return winsB - winsA;
    
    const ptsA = a.settings?.fpts || 0;
    const ptsB = b.settings?.fpts || 0;
    return ptsB - ptsA;
  });
  
  // Create a map of roster_id to seed (1-indexed)
  const seedByRoster = {};
  sortedRosters.forEach((roster, index) => {
    seedByRoster[roster.roster_id] = index + 1;
  });
  
  return seedByRoster;
}

/* ----------------------- Playoff Stats Calculators ----------------------- */
async function calculatePlayoffStats(season, leagueId, ownerByRoster, rosters, playersMap, championUsername) {
  const playoffStart = 15; // Typical playoff start week
  const playoffWeeks = [15, 16, 17]; // Championship weeks
  
  // Find champion's roster_id by username (check both username and display_name)
  let championRosterId = null;
  let championRoster = null;
  
  for (const roster of rosters) {
    const owner = ownerByRoster[roster.roster_id];
    if (!owner) continue;
    
    // Check username or display_name (case-insensitive)
    const ownerUsername = (owner.username || '').toLowerCase();
    const ownerDisplayName = (owner.display_name || '').toLowerCase();
    const targetUsername = championUsername.toLowerCase();
    
    if (ownerUsername === targetUsername || ownerDisplayName === targetUsername) {
      championRosterId = roster.roster_id;
      championRoster = roster;
      console.log(`Found champion ${championUsername} with roster_id ${championRosterId}`);
      break;
    }
  }
  
  const stats = {
    upsetWins: 0,
    championshipMVP: null,
    biggestUpset: null,
    playoffRisers: [],
    championSeed: null,
    championRecord: null,
    closestGame: null,
    championProjections: [], // Array of {week, projected, actual}
    positionBreakdown: null, // {positions: {}, topPlayers: {}}
    clutchPlayer: null, // Highest scoring player across weeks 15-17
    ghostedPlayer: null, // Lowest scoring starter across weeks 15-17
  };
  
  // Calculate seeds for all teams
  const seedByRoster = calculatePlayoffSeeds(rosters);
  
  // Get champion's seed and record from their roster
  if (championRoster) {
    const settings = championRoster.settings || {};
    
    // Use calculated seed from regular season standings
    stats.championSeed = seedByRoster[championRoster.roster_id] || settings.playoff_seed || settings.division_placement_seed || null;
    
    const wins = settings.wins || 0;
    const losses = settings.losses || 0;
    const ties = settings.ties || 0;
    stats.championRecord = ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
    
    console.log(`Champion stats - Seed: ${stats.championSeed}, Record: ${stats.championRecord}`);
  } else {
    console.warn(`Could not find roster for champion username: ${championUsername}`);
  }
  
  try {
    // Get all playoff matchups
    const playoffMatchups = await Promise.all(
      playoffWeeks.map(week => jget(`/league/${leagueId}/matchups/${week}`).catch(() => []))
    );
    
    // Calculate regular season averages (weeks 1-14)
    const regularSeasonAvgs = {};
    for (let week = 1; week <= 14; week++) {
      const matchups = await jget(`/league/${leagueId}/matchups/${week}`).catch(() => []);
      matchups.forEach(m => {
        if (!m?.roster_id) return;
        if (!regularSeasonAvgs[m.roster_id]) {
          regularSeasonAvgs[m.roster_id] = { total: 0, count: 0 };
        }
        regularSeasonAvgs[m.roster_id].total += Number(m.points || 0);
        regularSeasonAvgs[m.roster_id].count += 1;
      });
    }
    
    // Calculate playoff averages
    const playoffAvgs = {};
    
    playoffMatchups.forEach((weekMatchups, idx) => {
      weekMatchups.forEach(m => {
        if (!m?.roster_id) return;
        if (!playoffAvgs[m.roster_id]) {
          playoffAvgs[m.roster_id] = { total: 0, count: 0 };
        }
        playoffAvgs[m.roster_id].total += Number(m.points || 0);
        playoffAvgs[m.roster_id].count += 1;
      });
    });
    
    // Find playoff risers (teams that improved in playoffs)
    const risers = [];
    Object.keys(playoffAvgs).forEach(rosterId => {
      const regularAvg = regularSeasonAvgs[rosterId]?.total / Math.max(1, regularSeasonAvgs[rosterId]?.count || 1);
      const playoffAvg = playoffAvgs[rosterId].total / Math.max(1, playoffAvgs[rosterId].count);
      
      if (playoffAvg > regularAvg) {
        const owner = ownerByRoster[rosterId];
        const teamName = sanitizeName(
          owner?.metadata?.team_name || owner?.display_name || `Team ${rosterId}`
        );
        risers.push({
          teamName,
          regularAvg: regularAvg.toFixed(2),
          playoffAvg: playoffAvg.toFixed(2),
          improvement: (playoffAvg - regularAvg).toFixed(2),
        });
      }
    });
    
    risers.sort((a, b) => parseFloat(b.improvement) - parseFloat(a.improvement));
    stats.playoffRisers = risers.slice(0, 3); // Top 3 risers
    
    // Find championship MVP (highest scoring STARTER in week 17 championship game from champion's team)
    let mvp = null;
    if (championRosterId) {
      try {
        const championshipWeek = 17;
        const week17Matchups = await jget(`/league/${leagueId}/matchups/${championshipWeek}`).catch(() => []);
        const championMatchup = week17Matchups.find(m => m.roster_id === championRosterId);
        
        if (championMatchup) {
          const starters = championMatchup.starters || [];
          const playersPoints = championMatchup.players_points || {};
          
          // Find highest scoring starter
          starters.forEach(playerId => {
            const pts = Number(playersPoints[playerId] || 0);
            if (!mvp || pts > mvp.points) {
              const player = playersMap[playerId] || {};
              mvp = {
                playerId: playerId,
                name: player.fn || playerId,
                position: player.pos || '',
                team: player.team || '',
                points: pts,
              };
            }
          });
          
          console.log(`Championship MVP (Week 17): ${mvp?.name} - ${mvp?.points} pts`);
        }
      } catch (e) {
        console.error('Error finding championship MVP:', e);
      }
    }
    stats.championshipMVP = mvp;
    
    // Calculate upsets from playoff matchups
    const upsetData = calculateUpsets(playoffMatchups, seedByRoster, ownerByRoster, championRosterId);
    stats.upsetWins = upsetData.upsetCount;
    stats.biggestUpset = upsetData.biggestUpset;
    stats.closestGame = upsetData.closestGame;
    
    // Get champion's projected vs actual scores for playoff weeks
    // Since historical projections aren't readily available from any API,
    // we'll calculate based on season average performance
    if (championRosterId) {
      // First, calculate season averages for the champion's starters
      const playerSeasonAvgs = {};
      
      for (let week = 1; week <= 14; week++) {
        const weekMatchups = await jget(`/league/${leagueId}/matchups/${week}`).catch(() => []);
        const championMatchup = weekMatchups.find(m => m.roster_id === championRosterId);
        
        if (championMatchup) {
          const playersPoints = championMatchup.players_points || {};
          Object.keys(playersPoints).forEach(playerId => {
            if (!playerSeasonAvgs[playerId]) {
              playerSeasonAvgs[playerId] = { total: 0, count: 0 };
            }
            playerSeasonAvgs[playerId].total += Number(playersPoints[playerId] || 0);
            playerSeasonAvgs[playerId].count += 1;
          });
        }
      }
      
      // Now use season averages as "projections" for playoff weeks
      for (const week of playoffWeeks) {
        const weekMatchups = await jget(`/league/${leagueId}/matchups/${week}`).catch(() => []);
        const championMatchup = weekMatchups.find(m => m.roster_id === championRosterId);
        
        if (championMatchup) {
          const actualScore = Number(championMatchup.points || 0);
          let projectedScore = 0;
          
          const starters = championMatchup.starters || [];
          
          // Use each starter's season average as their "projection"
          for (const playerId of starters) {
            if (playerSeasonAvgs[playerId] && playerSeasonAvgs[playerId].count > 0) {
              const avg = playerSeasonAvgs[playerId].total / playerSeasonAvgs[playerId].count;
              projectedScore += avg;
            }
          }
          
          console.log(`Week ${week} - Projected (Season Avg): ${projectedScore.toFixed(2)}, Actual: ${actualScore.toFixed(2)}`);
          
          stats.championProjections.push({
            week,
            projected: projectedScore,
            actual: actualScore
          });
        }
      }
    }
    
    // Calculate position breakdown for champion across all playoff weeks
    if (championRosterId) {
      const playerTotals = {}; // Track total points per player across all playoff weeks
      
      for (const week of playoffWeeks) {
        const weekMatchups = await jget(`/league/${leagueId}/matchups/${week}`).catch(() => []);
        const championMatchup = weekMatchups.find(m => m.roster_id === championRosterId);
        
        if (championMatchup) {
          const starters = championMatchup.starters || [];
          const playersPoints = championMatchup.players_points || {};
          
          starters.forEach(playerId => {
            const points = Number(playersPoints[playerId] || 0);
            
            if (points > 0) {
              if (!playerTotals[playerId]) {
                playerTotals[playerId] = 0;
              }
              playerTotals[playerId] += points;
            }
          });
        }
      }
      
      // Now organize by position and find top players
      const positionTotals = {};
      const topPlayersByPosition = {};
      
      Object.entries(playerTotals).forEach(([playerId, totalPoints]) => {
        const player = playersMap[playerId];
        
        if (player) {
          const position = player.pos || 'UNKNOWN';
          
          // Skip K and DEF
          if (position === 'K' || position === 'DEF') {
            return;
          }
          
          // Add to position total
          if (!positionTotals[position]) {
            positionTotals[position] = 0;
          }
          positionTotals[position] += totalPoints;
          
          // Track top player for this position (highest total across all 3 weeks)
          if (!topPlayersByPosition[position] || totalPoints > topPlayersByPosition[position].points) {
            topPlayersByPosition[position] = {
              name: `${player.fn || ''} ${player.ln || ''}`.trim(),
              points: totalPoints
            };
          }
        }
      });
      
      stats.positionBreakdown = {
        positions: positionTotals,
        topPlayers: topPlayersByPosition
      };
    }
    
    // Find clutch player (highest scoring) and ghosted player (lowest scoring starter) across all playoff weeks
    let clutchPlayer = null;
    let highestScore = 0;
    let ghostedPlayer = null;
    let lowestScore = Infinity;
    
    for (const week of playoffWeeks) {
      const weekMatchups = await jget(`/league/${leagueId}/matchups/${week}`).catch(() => []);
      
      weekMatchups.forEach(matchup => {
        const starters = matchup.starters || [];
        const playersPoints = matchup.players_points || {};
        const ownerInfo = ownerByRoster[matchup.roster_id];
        const teamName = sanitizeName(
          ownerInfo?.metadata?.team_name || ownerInfo?.display_name || `Team ${matchup.roster_id}`
        );
        
        starters.forEach(playerId => {
          const points = Number(playersPoints[playerId] || 0);
          const player = playersMap[playerId];
          
          if (player && points > 0) {
            // Check for highest score
            if (points > highestScore) {
              highestScore = points;
              clutchPlayer = {
                name: `${player.fn || ''} ${player.ln || ''}`.trim(),
                position: player.pos || '',
                team: player.team || '',
                points: points,
                week: week,
                fantasyTeam: teamName
              };
            }
            
            // Check for lowest score (only starters with points > 0, exclude K and DEF)
            const position = player.pos || '';
            if (points < lowestScore && points > 0 && position !== 'K' && position !== 'DEF') {
              lowestScore = points;
              ghostedPlayer = {
                name: `${player.fn || ''} ${player.ln || ''}`.trim(),
                position: position,
                team: player.team || '',
                points: points,
                week: week,
                fantasyTeam: teamName
              };
            }
          }
        });
      });
    }
    
    stats.clutchPlayer = clutchPlayer;
    stats.ghostedPlayer = ghostedPlayer;
    
  } catch (e) {
    console.error('Error calculating playoff stats:', e);
  }
  
  return stats;
}

/* ----------------------- Calculate Upsets ----------------------- */
function calculateUpsets(playoffMatchups, seedByRoster, ownerByRoster, championRosterId) {
  let upsetCount = 0;
  let biggestUpset = null;
  let biggestUpsetDiff = 0;
  let closestGame = null;
  let smallestDiff = Infinity;
  
  // Track winners from each round to only count bracket games
  const round1Winners = new Set();
  const round2Winners = new Set();
  
  // Seeds 1 and 2 get BYEs in Round 1, so add them as automatic winners
  const seed1RosterId = Object.keys(seedByRoster).find(rid => seedByRoster[rid] === 1);
  const seed2RosterId = Object.keys(seedByRoster).find(rid => seedByRoster[rid] === 2);
  if (seed1RosterId) round1Winners.add(parseInt(seed1RosterId));
  if (seed2RosterId) round1Winners.add(parseInt(seed2RosterId));
  
  console.log(`Seeds 1 and 2 advance automatically (BYE week)`);
  
  // Process Week 15 (Round 1)
  const week15 = playoffMatchups[0] || [];
  const processedWeek15 = new Set();
  
  console.log(`\n--- Processing Week 15 (Round 1) ---`);
  
  week15.forEach(matchup => {
    if (processedWeek15.has(matchup.matchup_id)) return;
    processedWeek15.add(matchup.matchup_id);
    
    const roster1Id = matchup.roster_id;
    const roster1Score = Number(matchup.points || 0);
    const opponent = week15.find(m => m.matchup_id === matchup.matchup_id && m.roster_id !== roster1Id);
    
    if (!opponent) return;
    
    const roster2Id = opponent.roster_id;
    const roster2Score = Number(opponent.points || 0);
    const seed1 = seedByRoster[roster1Id];
    const seed2 = seedByRoster[roster2Id];
    
    // Week 15 only has seeds 3-6 playing (seeds 1 and 2 have BYEs)
    // Only count matchups where both teams are seeds 3-6
    if (!seed1 || !seed2 || seed1 < 3 || seed2 < 3 || seed1 > 6 || seed2 > 6) {
      console.log(`Skipping Week 15 matchup: Seed ${seed1} vs Seed ${seed2} (not 3v6 or 4v5)`);
      return;
    }
    
    const winner = roster1Score > roster2Score ? roster1Id : roster2Id;
    round1Winners.add(winner);
    
    console.log(`Matchup: Seed ${seed1} (${roster1Score.toFixed(2)}) vs Seed ${seed2} (${roster2Score.toFixed(2)})`);
    
    checkAndCountUpset(roster1Id, roster2Id, roster1Score, roster2Score, seed1, seed2, 15);
  });
  
  // Process Week 16 (Round 2 - Semifinals)
  const week16 = playoffMatchups[1] || [];
  const processedWeek16 = new Set();
  
  console.log(`\n--- Processing Week 16 (Semifinals) ---`);
  console.log(`Round 1 winners:`, Array.from(round1Winners));
  
  week16.forEach(matchup => {
    if (processedWeek16.has(matchup.matchup_id)) return;
    processedWeek16.add(matchup.matchup_id);
    
    const roster1Id = matchup.roster_id;
    const roster1Score = Number(matchup.points || 0);
    const opponent = week16.find(m => m.matchup_id === matchup.matchup_id && m.roster_id !== roster1Id);
    
    if (!opponent) return;
    
    const roster2Id = opponent.roster_id;
    const roster2Score = Number(opponent.points || 0);
    const seed1 = seedByRoster[roster1Id];
    const seed2 = seedByRoster[roster2Id];
    
    // Week 16: Only count matchups where BOTH teams are round 1 winners
    // AND at least one team is seed 1 or 2 (the teams with BYEs)
    if (!round1Winners.has(roster1Id) || !round1Winners.has(roster2Id)) {
      console.log(`Skipping Week 16 matchup: Rosters ${roster1Id} vs ${roster2Id} (not both round 1 winners)`);
      return;
    }
    
    // Must involve seed 1 or seed 2 (the semifinal games)
    if ((seed1 !== 1 && seed1 !== 2) && (seed2 !== 1 && seed2 !== 2)) {
      console.log(`Skipping Week 16 matchup: Seed ${seed1} vs Seed ${seed2} (doesn't involve seed 1 or 2)`);
      return;
    }
    
    // Only count if both teams are seeds 1-6
    if (!seed1 || !seed2 || seed1 > 6 || seed2 > 6) return;
    
    const winner = roster1Score > roster2Score ? roster1Id : roster2Id;
    round2Winners.add(winner);
    
    console.log(`Matchup: Seed ${seed1} (${roster1Score.toFixed(2)}) vs Seed ${seed2} (${roster2Score.toFixed(2)})`);
    
    checkAndCountUpset(roster1Id, roster2Id, roster1Score, roster2Score, seed1, seed2, 16);
  });
  
  // Process Week 17 (Championship) - ONLY the game between the 2 semifinal winners
  const week17 = playoffMatchups[2] || [];
  const processedWeek17 = new Set();
  
  console.log(`\n--- Processing Week 17 (Championship) ---`);
  console.log(`Round 2 winners:`, Array.from(round2Winners));
  
  week17.forEach(matchup => {
    if (processedWeek17.has(matchup.matchup_id)) return;
    processedWeek17.add(matchup.matchup_id);
    
    const roster1Id = matchup.roster_id;
    const roster1Score = Number(matchup.points || 0);
    const opponent = week17.find(m => m.matchup_id === matchup.matchup_id && m.roster_id !== roster1Id);
    
    if (!opponent) return;
    
    const roster2Id = opponent.roster_id;
    const roster2Score = Number(opponent.points || 0);
    
    // ONLY count if BOTH teams won in round 2 (semifinals)
    if (!round2Winners.has(roster1Id) || !round2Winners.has(roster2Id)) {
      console.log(`Skipping matchup ${matchup.matchup_id} - not the championship game (consolation bracket)`);
      return;
    }
    
    const seed1 = seedByRoster[roster1Id];
    const seed2 = seedByRoster[roster2Id];
    
    if (!seed1 || !seed2 || seed1 > 6 || seed2 > 6) return;
    
    console.log(`Championship: Seed ${seed1} (${roster1Score.toFixed(2)}) vs Seed ${seed2} (${roster2Score.toFixed(2)})`);
    
    checkAndCountUpset(roster1Id, roster2Id, roster1Score, roster2Score, seed1, seed2, 17);
  });
  
  function checkAndCountUpset(roster1Id, roster2Id, score1, score2, seed1, seed2, weekNum) {
    let winnerRosterId, loserRosterId, winnerSeed, loserSeed, winnerScore, loserScore;
    
    if (score1 > score2) {
      winnerRosterId = roster1Id;
      loserRosterId = roster2Id;
      winnerSeed = seed1;
      loserSeed = seed2;
      winnerScore = score1;
      loserScore = score2;
    } else {
      winnerRosterId = roster2Id;
      loserRosterId = roster1Id;
      winnerSeed = seed2;
      loserSeed = seed1;
      winnerScore = score2;
      loserScore = score1;
    }
    
    const winnerOwner = ownerByRoster[winnerRosterId];
    const loserOwner = ownerByRoster[loserRosterId];
    const winnerName = sanitizeName(winnerOwner?.metadata?.team_name || winnerOwner?.display_name || `Team ${winnerRosterId}`);
    const loserName = sanitizeName(loserOwner?.metadata?.team_name || loserOwner?.display_name || `Team ${loserRosterId}`);
    
    // Check for closest game
    const scoreDiff = Math.abs(winnerScore - loserScore);
    if (scoreDiff < smallestDiff) {
      smallestDiff = scoreDiff;
      closestGame = {
        winner: winnerName,
        loser: loserName,
        winnerScore: winnerScore.toFixed(2),
        loserScore: loserScore.toFixed(2),
        difference: scoreDiff.toFixed(2),
        week: weekNum
      };
    }
    
    if (winnerSeed > loserSeed) {
      upsetCount++;
      const upsetDiff = winnerSeed - loserSeed;
      
      console.log(`  -> UPSET! Seed #${winnerSeed} ${winnerName} beat Seed #${loserSeed} ${loserName} (diff: ${upsetDiff})`);
      
      if (upsetDiff > biggestUpsetDiff) {
        biggestUpsetDiff = upsetDiff;
        biggestUpset = {
          winner: winnerName,
          loser: loserName,
          winnerSeed,
          loserSeed,
          seedDiff: upsetDiff,
          winnerPts: winnerScore.toFixed(2),
          loserPts: loserScore.toFixed(2),
        };
      }
    } else {
      console.log(`  -> Not an upset. Seed #${winnerSeed} ${winnerName} beat Seed #${loserSeed} ${loserName}`);
    }
  }
  
  console.log(`\nTotal upsets: ${upsetCount}`);
  if (biggestUpset) {
    console.log(`Biggest upset: Seed #${biggestUpset.winnerSeed} ${biggestUpset.winner} over Seed #${biggestUpset.loserSeed} ${biggestUpset.loser} (${biggestUpset.seedDiff} seed difference)`);
  }
  if (closestGame) {
    console.log(`Closest game: ${closestGame.winner} over ${closestGame.loser} in Week ${closestGame.week} (${closestGame.difference} pt difference)`);
  }
  
  return {
    upsetCount,
    biggestUpset,
    closestGame
  };
}

/* ----------------------- Bracket Renderer ----------------------- */
async function renderBracket(leagueId, ownerByRoster, rosters, championUsername) {
  try {
    // Calculate seeds for all teams
    const seedByRoster = calculatePlayoffSeeds(rosters);
    
    // Create reverse lookup: seed number -> roster_id
    const rosterBySeed = {};
    Object.keys(seedByRoster).forEach(rosterId => {
      const seed = seedByRoster[rosterId];
      rosterBySeed[seed] = parseInt(rosterId);
    });
    
    console.log('Seeds:', seedByRoster);
    console.log('Roster by seed:', rosterBySeed);
    
    // Get matchup data for playoff weeks
    const week15Matchups = await jget(`/league/${leagueId}/matchups/15`).catch(() => []);
    const week16Matchups = await jget(`/league/${leagueId}/matchups/16`).catch(() => []);
    const week17Matchups = await jget(`/league/${leagueId}/matchups/17`).catch(() => []);
    
    // Helper to find matchup result for a roster
    const getMatchupResult = (rosterId, weekMatchups) => {
      const myMatchup = weekMatchups.find(m => m.roster_id === rosterId);
      if (!myMatchup) return { opponent: null, myScore: 0, oppScore: 0, winner: null };
      
      const opponent = weekMatchups.find(m => 
        m.matchup_id === myMatchup.matchup_id && m.roster_id !== rosterId
      );
      
      if (!opponent) return { opponent: null, myScore: 0, oppScore: 0, winner: null };
      
      const myScore = Number(myMatchup.points || 0);
      const oppScore = Number(opponent.points || 0);
      const winner = myScore > oppScore ? rosterId : opponent.roster_id;
      
      return { 
        opponent: opponent.roster_id, 
        myScore, 
        oppScore, 
        winner 
      };
    };
    
    // Helper functions for display
    const getTeamName = (rosterId) => {
      if (!rosterId) return 'TBD';
      const owner = ownerByRoster[rosterId];
      return sanitizeName(
        owner?.metadata?.team_name || owner?.display_name || owner?.username || `Team ${rosterId}`
      );
    };
    
    const getSeed = (rosterId) => {
      if (!rosterId) return '';
      return seedByRoster[rosterId] || '';
    };
    
    const getAvatarUrl = (rosterId) => {
      if (!rosterId) return '';
      const owner = ownerByRoster[rosterId];
      if (!owner?.avatar) return '';
      return `https://sleepercdn.com/avatars/thumbs/${owner.avatar}`;
    };
    
    // Get team roster IDs by seed
    const seed1 = rosterBySeed[1];
    const seed2 = rosterBySeed[2];
    const seed3 = rosterBySeed[3];
    const seed4 = rosterBySeed[4];
    const seed5 = rosterBySeed[5];
    const seed6 = rosterBySeed[6];
    
    // Round 1 (Week 15) - Only 4v5 and 3v6 play
    const match_4v5 = getMatchupResult(seed4, week15Matchups);
    const match_3v6 = getMatchupResult(seed3, week15Matchups);
    
    const winner_4v5 = match_4v5.winner;
    const winner_3v6 = match_3v6.winner;
    
    // Round 2 (Week 16) - 1 vs winner of 4/5, 2 vs winner of 3/6
    const match_1vW45 = seed1 && winner_4v5 ? getMatchupResult(seed1, week16Matchups) : null;
    const match_2vW36 = seed2 && winner_3v6 ? getMatchupResult(seed2, week16Matchups) : null;
    
    const winner_1vW45 = match_1vW45?.winner;
    const winner_2vW36 = match_2vW36?.winner;
    
    // Championship (Week 17)
    const matchChampionship = winner_1vW45 && winner_2vW36 ? getMatchupResult(winner_1vW45, week17Matchups) : null;
    const champion = matchChampionship?.winner;
    
    // Build bracket UI
    const container = el('div', { class: 'bracket-container' });
    const bracketWrapper = el('div', { class: 'bracket-wrapper' });
    
    // ROUND 1 (Week 15)
    const round1Column = el('div', { class: 'bracket-column' });
    round1Column.append(
      el('div', { class: 'bracket-round-header' },
        el('div', { class: 'bracket-round-name' }, 'ROUND 1'),
        el('div', { class: 'bracket-round-week' }, '(Week 15)')
      )
    );
    
    const round1Matchups = el('div', { class: 'bracket-matchups' });
    
    // Matchup 1: Seed 1 vs BYE
    round1Matchups.append(createByeCard(seed1, getTeamName, getSeed, getAvatarUrl));
    
    // Matchup 2: Seed 4 vs Seed 5
    if (seed4 && seed5) {
      round1Matchups.append(
        createMatchupCard(seed4, seed5, match_4v5.myScore, match_4v5.oppScore, winner_4v5, 
          getTeamName, getSeed, getAvatarUrl, false)
      );
    }
    
    // Matchup 3: Seed 2 vs BYE
    round1Matchups.append(createByeCard(seed2, getTeamName, getSeed, getAvatarUrl));
    
    // Matchup 4: Seed 3 vs Seed 6
    if (seed3 && seed6) {
      round1Matchups.append(
        createMatchupCard(seed3, seed6, match_3v6.myScore, match_3v6.oppScore, winner_3v6,
          getTeamName, getSeed, getAvatarUrl, false)
      );
    }
    
    round1Column.append(round1Matchups);
    bracketWrapper.append(round1Column);
    
    // ROUND 2 (Week 16)
    const round2Column = el('div', { class: 'bracket-column' });
    round2Column.append(
      el('div', { class: 'bracket-round-header' },
        el('div', { class: 'bracket-round-name' }, 'SEMIFINALS'),
        el('div', { class: 'bracket-round-week' }, '(Week 16)')
      )
    );
    
    const round2Matchups = el('div', { class: 'bracket-matchups' });
    
    // Matchup 1: Seed 1 vs Winner of 4/5
    if (seed1 && winner_4v5 && match_1vW45) {
      round2Matchups.append(
        createMatchupCard(seed1, winner_4v5, match_1vW45.myScore, match_1vW45.oppScore, winner_1vW45,
          getTeamName, getSeed, getAvatarUrl, false)
      );
    }
    
    // Matchup 2: Seed 2 vs Winner of 3/6
    if (seed2 && winner_3v6 && match_2vW36) {
      round2Matchups.append(
        createMatchupCard(seed2, winner_3v6, match_2vW36.myScore, match_2vW36.oppScore, winner_2vW36,
          getTeamName, getSeed, getAvatarUrl, false)
      );
    }
    
    round2Column.append(round2Matchups);
    bracketWrapper.append(round2Column);
    
    // CHAMPIONSHIP (Week 17)
    const finalsColumn = el('div', { class: 'bracket-column' });
    finalsColumn.append(
      el('div', { class: 'bracket-round-header' },
        el('div', { class: 'bracket-round-name' }, 'CHAMPIONSHIP'),
        el('div', { class: 'bracket-round-week' }, '(Week 17)')
      )
    );
    
    const finalsMatchups = el('div', { class: 'bracket-matchups' });
    
    // Championship matchup
    if (winner_1vW45 && winner_2vW36 && matchChampionship) {
      finalsMatchups.append(
        createMatchupCard(winner_1vW45, winner_2vW36, matchChampionship.myScore, matchChampionship.oppScore, champion,
          getTeamName, getSeed, getAvatarUrl, true)
      );
    }
    
    finalsColumn.append(finalsMatchups);
    bracketWrapper.append(finalsColumn);
    
    container.append(bracketWrapper);
    return container;
  } catch (e) {
    console.error('Error rendering bracket:', e);
    return el('div', { class: 'error-message' }, 'Failed to load bracket');
  }
}

// Helper to create a matchup card
function createMatchupCard(roster1Id, roster2Id, score1, score2, winnerId, 
                           getTeamName, getSeed, getAvatarUrl, isChampionship) {
  const matchupDiv = el('div', { class: 'bracket-matchup-card' });
  
  if (isChampionship) {
    matchupDiv.classList.add('championship-matchup');
    const champLabel = el('div', { class: 'championship-label' },
      el('span', { class: 'trophy-icon' }, '🏆'),
      el('span', {}, ' CHAMPIONSHIP')
    );
    matchupDiv.append(champLabel);
  }
  
  // Team 1
  const team1Div = el('div', { 
    class: winnerId === roster1Id ? 'bracket-team-slot winner' : 'bracket-team-slot'
  });
  
  const avatar1 = getAvatarUrl(roster1Id);
  if (avatar1) {
    const avatarImg = el('img', { 
      class: 'bracket-avatar',
      src: avatar1,
      alt: getTeamName(roster1Id)
    });
    avatarImg.onerror = function() { this.style.display = 'none'; };
    team1Div.append(avatarImg);
  }
  
  const seed1 = getSeed(roster1Id);
  if (seed1) {
    team1Div.append(el('span', { class: 'bracket-seed-badge' }, String(seed1)));
  }
  
  team1Div.append(
    el('span', { class: 'bracket-team-name' }, getTeamName(roster1Id)),
    el('span', { class: 'bracket-score' }, 
      el('span', { class: 'bracket-score-main' }, score1.toFixed(2))
    )
  );
  
  matchupDiv.append(team1Div);
  
  // Team 2
  const team2Div = el('div', { 
    class: winnerId === roster2Id ? 'bracket-team-slot winner' : 'bracket-team-slot'
  });
  
  const avatar2 = getAvatarUrl(roster2Id);
  if (avatar2) {
    const avatarImg = el('img', { 
      class: 'bracket-avatar',
      src: avatar2,
      alt: getTeamName(roster2Id)
    });
    avatarImg.onerror = function() { this.style.display = 'none'; };
    team2Div.append(avatarImg);
  }
  
  const seed2 = getSeed(roster2Id);
  if (seed2) {
    team2Div.append(el('span', { class: 'bracket-seed-badge' }, String(seed2)));
  }
  
  team2Div.append(
    el('span', { class: 'bracket-team-name' }, getTeamName(roster2Id)),
    el('span', { class: 'bracket-score' },
      el('span', { class: 'bracket-score-main' }, score2.toFixed(2))
    )
  );
  
  matchupDiv.append(team2Div);
  
  return matchupDiv;
}

// Helper to create a BYE card
function createByeCard(rosterId, getTeamName, getSeed, getAvatarUrl) {
  const matchupDiv = el('div', { class: 'bracket-matchup-card bye-card' });
  
  // Team with BYE
  const teamDiv = el('div', { class: 'bracket-team-slot winner' });
  
  const avatar = getAvatarUrl(rosterId);
  if (avatar) {
    const avatarImg = el('img', { 
      class: 'bracket-avatar',
      src: avatar,
      alt: getTeamName(rosterId)
    });
    avatarImg.onerror = function() { this.style.display = 'none'; };
    teamDiv.append(avatarImg);
  }
  
  const seed = getSeed(rosterId);
  if (seed) {
    teamDiv.append(el('span', { class: 'bracket-seed-badge' }, String(seed)));
  }
  
  teamDiv.append(el('span', { class: 'bracket-team-name' }, getTeamName(rosterId)));
  
  matchupDiv.append(teamDiv);
  
  // BYE indicator
  const byeDiv = el('div', { class: 'bracket-team-slot bye' });
  byeDiv.append(el('span', { class: 'bracket-bye-text' }, 'BYE'));
  matchupDiv.append(byeDiv);
  
  return matchupDiv;
}

/* ----------------------- Playoff Content Renderer ----------------------- */
async function renderPlayoffContent(body, season, playersMap) {
  // Use existing inner div if it exists (preserves skeleton), otherwise create new one
  let inner = body.querySelector('.history-inner');
  if (!inner) {
    inner = el('div', { class: 'history-inner' });
    body.innerHTML = '';
    body.append(inner);
  }
  
  const seasonData = await getSeasonData(season);
  if (!seasonData) {
    inner.textContent = 'Failed to load season data';
    return;
  }
  
  const { leagueId, ownerByRoster, rosters } = seasonData;
  const playoffInfo = PLAYOFF_DATA[season];
  
  // Calculate stats
  const stats = await calculatePlayoffStats(
    season,
    leagueId,
    ownerByRoster,
    rosters,
    playersMap,
    playoffInfo.championUsername
  );
  
  inner.innerHTML = '';
  
  // Champion Display
  const championSection = el('div', { class: 'champion-display' });
  const seedText = stats.championSeed ? `Seed #${stats.championSeed}` : 'Unknown Seed';
  const recordText = stats.championRecord || 'Unknown Record';
  
  championSection.append(
    el('div', { class: 'champion-name' }, `🏆 ${playoffInfo.champion}`),
    el('div', { class: 'champion-record' }, 
      `${seedText} • ${recordText} Regular Season`
    )
  );
  inner.append(championSection);
  
  // Create stats grid (two-column layout)
  const statsGrid = el('div', { class: 'playoff-stats-grid' });
  const leftColumn = el('div', { class: 'playoff-stats-column' });
  const rightColumn = el('div', { class: 'playoff-chart-column' });
  
  // Championship MVP
  if (stats.championshipMVP) {
    const mvpSection = el('div', { class: 'playoff-section' });
    mvpSection.append(el('div', { class: 'playoff-section-title' }, '🌟 Championship MVP'));
    
    const mvp = stats.championshipMVP;
    const mvpDisplay = el('div', { class: 'mvp-display' });
    mvpDisplay.append(
      el('div', { class: 'mvp-icon' }, '⭐'),
      el('div', { class: 'mvp-info-playoffs' },
        el('div', { class: 'mvp-player-name' }, mvp.name),
        el('div', { class: 'mvp-player-meta' }, 
          `${mvp.position} • ${mvp.team}`
        ),
        el('div', { class: 'mvp-player-points' }, 
          `${mvp.points.toFixed(2)} playoff points`
        )
      )
    );
    mvpSection.append(mvpDisplay);
    leftColumn.append(mvpSection);
  }
  
  // Playoff Statistics
  const statsSection = el('div', { class: 'playoff-section' });
  statsSection.append(el('div', { class: 'playoff-section-title' }, '📊 Playoff Statistics'));
  
  statsSection.append(
    el('div', { class: 'playoff-stat' },
      el('strong', {}, 'Upset Wins: '),
      document.createTextNode(String(stats.upsetWins))
    )
  );
  
  leftColumn.append(statsSection);
  
  // What Could've Been - Closest Game
  if (stats.closestGame) {
    const closestSection = el('div', { class: 'playoff-section' });
    closestSection.append(el('div', { class: 'playoff-section-title' }, '💔 What Could\'ve Been'));
    
    const closest = stats.closestGame;
    closestSection.append(
      el('div', { class: 'playoff-stat' },
        el('strong', {}, `${closest.winner}`),
        document.createTextNode(` narrowly defeated ${closest.loser} in Week ${closest.week}`),
        el('br'),
        document.createTextNode(`${closest.winnerScore} - ${closest.loserScore} (${closest.difference} pt difference)`)
      )
    );
    
    leftColumn.append(closestSection);
  }
  
  // Biggest Upset
  if (stats.biggestUpset) {
    const upsetSection = el('div', { class: 'playoff-section' });
    upsetSection.append(el('div', { class: 'playoff-section-title' }, '🎯 Biggest Upset'));
    
    const upset = stats.biggestUpset;
    upsetSection.append(
      el('div', { class: 'playoff-stat' },
        el('strong', {}, `Seed #${upset.winnerSeed} ${upset.winner}`),
        document.createTextNode(` defeated Seed #${upset.loserSeed} ${upset.loser}`),
        el('br'),
        document.createTextNode(`${upset.winnerPts} - ${upset.loserPts}`)
      )
    );
    
    leftColumn.append(upsetSection);
  }
  
  // Clutch Player
  if (stats.clutchPlayer) {
    const clutchSection = el('div', { class: 'playoff-section' });
    clutchSection.append(el('div', { class: 'playoff-section-title' }, '🔥 Clutch'));
    
    const clutch = stats.clutchPlayer;
    clutchSection.append(
      el('div', { class: 'playoff-stat' },
        el('strong', {}, clutch.name),
        document.createTextNode(` (${clutch.position} - ${clutch.team})`),
        el('br'),
        document.createTextNode(`${clutch.points.toFixed(2)} pts in Week ${clutch.week} for ${clutch.fantasyTeam}`)
      )
    );
    
    leftColumn.append(clutchSection);
  }
  
  // Ghosted Player
  if (stats.ghostedPlayer) {
    const ghostedSection = el('div', { class: 'playoff-section' });
    ghostedSection.append(el('div', { class: 'playoff-section-title' }, '👻 Ghosted'));
    
    const ghosted = stats.ghostedPlayer;
    ghostedSection.append(
      el('div', { class: 'playoff-stat' },
        el('strong', {}, ghosted.name),
        document.createTextNode(` (${ghosted.position} - ${ghosted.team})`),
        el('br'),
        document.createTextNode(`${ghosted.points.toFixed(2)} pts in Week ${ghosted.week} for ${ghosted.fantasyTeam}`)
      )
    );
    
    leftColumn.append(ghostedSection);
  }
  
  // Playoff Risers
  if (stats.playoffRisers.length > 0) {
    const risersSection = el('div', { class: 'playoff-section' });
    risersSection.append(el('div', { class: 'playoff-section-title' }, '📈 Playoff Risers'));
    
    const risersList = el('div', { class: 'risers-list' });
    stats.playoffRisers.forEach(riser => {
      const riserItem = el('div', { class: 'riser-item' });
      riserItem.append(
        el('div', { class: 'riser-name' }, riser.teamName),
        el('div', { class: 'riser-stats' },
          `Regular Season: ${riser.regularAvg} → Playoffs: ${riser.playoffAvg} (+${riser.improvement})`
        )
      );
      risersList.append(riserItem);
    });
    
    risersSection.append(risersList);
    leftColumn.append(risersSection);
  }
  
  // Right column - Projected vs Actual Scores Histogram
  if (stats.championProjections && stats.championProjections.length > 0) {
    const chartSection = el('div', { class: 'playoff-section' });
    chartSection.append(el('div', { class: 'playoff-section-title' }, '📊 Projected vs Actual Scores'));
    
    const chartWrapper = el('div', { class: 'chart-wrapper-inline' });
    const chartCanvas = el('canvas', { id: `projections-${season}` });
    chartWrapper.append(chartCanvas);
    chartSection.append(chartWrapper);
    rightColumn.append(chartSection);
    
    // Render chart after DOM insertion
    setTimeout(() => {
      const ctx = chartCanvas.getContext('2d');
      
      const labels = stats.championProjections.map(p => `Week ${p.week}`);
      const projectedData = stats.championProjections.map(p => p.projected);
      const actualData = stats.championProjections.map(p => p.actual);
      
      new Chart(ctx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [
            {
              label: 'Projected',
              data: projectedData,
              backgroundColor: 'rgba(255, 193, 7, 0.6)',
              borderColor: 'rgba(255, 193, 7, 1)',
              borderWidth: 2
            },
            {
              label: 'Actual',
              data: actualData,
              backgroundColor: 'rgba(46, 167, 98, 0.6)',
              borderColor: 'rgba(46, 167, 98, 1)',
              borderWidth: 2
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: {
              display: true,
              position: 'top',
              labels: {
                color: 'rgba(255, 255, 255, 0.9)',
                font: {
                  size: 12,
                  family: "'Outfit', sans-serif"
                },
                padding: 15
              }
            },
            tooltip: {
              backgroundColor: 'rgba(15, 10, 29, 0.95)',
              titleColor: '#ffffff',
              bodyColor: '#ffffff',
              borderColor: 'rgba(255, 255, 255, 0.1)',
              borderWidth: 1,
              padding: 12,
              callbacks: {
                label: (context) => {
                  return `${context.dataset.label}: ${context.parsed.y.toFixed(2)} pts`;
                }
              }
            }
          },
          scales: {
            x: {
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
                text: 'Points',
                color: 'rgba(255, 255, 255, 0.8)',
                font: { size: 12, family: "'Outfit', sans-serif" }
              },
              ticks: {
                color: 'rgba(255, 255, 255, 0.7)',
                font: { size: 11 }
              },
              grid: {
                color: 'rgba(255, 255, 255, 0.05)'
              },
              beginAtZero: true
            }
          }
        }
      });
    }, 150);
  }
  
  // Position Breakdown Donut Chart
  if (stats.positionBreakdown && Object.keys(stats.positionBreakdown.positions).length > 0) {
    const donutSection = el('div', { class: 'playoff-section' });
    donutSection.append(el('div', { class: 'playoff-section-title' }, '🎯 Points by Position'));
    
    const donutWrapper = el('div', { class: 'chart-wrapper-donut' });
    const donutCanvas = el('canvas', { id: `position-donut-${season}` });
    donutWrapper.append(donutCanvas);
    donutSection.append(donutWrapper);
    
    // Add top players legend below chart
    const topPlayersDiv = el('div', { class: 'top-players-legend' });
    Object.entries(stats.positionBreakdown.topPlayers).forEach(([position, data]) => {
      const playerItem = el('div', { class: 'top-player-item' });
      playerItem.append(
        el('span', { class: 'position-badge' }, position),
        el('span', { class: 'player-name-small' }, data.name),
        el('span', { class: 'player-points-small' }, `${data.points.toFixed(1)} pts`)
      );
      topPlayersDiv.append(playerItem);
    });
    donutSection.append(topPlayersDiv);
    
    rightColumn.append(donutSection);
    
    // Render donut chart after DOM insertion
    setTimeout(() => {
      const ctx = donutCanvas.getContext('2d');
      
      const positions = Object.keys(stats.positionBreakdown.positions);
      const totals = Object.values(stats.positionBreakdown.positions);
      
      // Color mapping for positions
      const positionColors = {
        'QB': 'rgba(244, 67, 54, 0.8)',
        'RB': 'rgba(76, 175, 80, 0.8)',
        'WR': 'rgba(33, 150, 243, 0.8)',
        'TE': 'rgba(255, 152, 0, 0.8)',
        'K': 'rgba(156, 39, 176, 0.8)',
        'DEF': 'rgba(96, 125, 139, 0.8)',
        'FLEX': 'rgba(255, 193, 7, 0.8)'
      };
      
      const backgroundColors = positions.map(pos => positionColors[pos] || 'rgba(158, 158, 158, 0.8)');
      const borderColors = positions.map(pos => {
        const base = positionColors[pos] || 'rgba(158, 158, 158, 0.8)';
        return base.replace('0.8', '1');
      });
      
      new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: positions,
          datasets: [{
            data: totals,
            backgroundColor: backgroundColors,
            borderColor: borderColors,
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          color: '#ffffff',
          plugins: {
            legend: {
              display: true,
              position: 'right',
              labels: {
                color: 'rgb(255, 255, 255)',
                font: {
                  size: 10,
                  family: "'Outfit', sans-serif"
                },
                padding: 8,
                usePointStyle: true,
                pointStyle: 'circle',
                boxWidth: 8,
                boxHeight: 8,
                generateLabels: (chart) => {
                  const data = chart.data;
                  return data.labels.map((label, i) => {
                    const value = data.datasets[0].data[i];
                    return {
                      text: `${label}: ${value.toFixed(1)} pts`,
                      fillStyle: data.datasets[0].backgroundColor[i],
                      strokeStyle: data.datasets[0].backgroundColor[i],
                      hidden: false,
                      index: i,
                      pointStyle: 'circle',
                      fontColor: 'rgb(255, 255, 255)'
                    };
                  });
                }
              }
            },
            tooltip: {
              backgroundColor: 'rgba(15, 10, 29, 0.95)',
              titleColor: '#ffffff',
              bodyColor: '#ffffff',
              borderColor: 'rgba(255, 255, 255, 0.1)',
              borderWidth: 1,
              padding: 12,
              callbacks: {
                label: (context) => {
                  const position = context.label;
                  const points = context.parsed;
                  const total = context.dataset.data.reduce((a, b) => a + b, 0);
                  const percentage = ((points / total) * 100).toFixed(1);
                  
                  return [
                    `${position}: ${points.toFixed(1)} pts`,
                    `${percentage}% of total`
                  ];
                }
              }
            }
          }
        }
      });
    }, 150);
  }
  
  statsGrid.append(leftColumn, rightColumn);
  inner.append(statsGrid);
  
  // Playoff Bracket
  const bracketSection = el('div', { class: 'playoff-section' });
  bracketSection.append(el('div', { class: 'playoff-section-title' }, '🏆 Playoff Bracket'));
  
  const bracket = await renderBracket(leagueId, ownerByRoster, rosters, playoffInfo.championUsername);
  bracketSection.append(bracket);
  inner.append(bracketSection);
}

/* ----------------------- Main Renderer ----------------------- */
export default async function loadPlayoffs() {
  const root = document.getElementById('playoffs-root');
  root.textContent = 'Loading playoff history...';
  
  try {
    const playersMap = await getPlayersMap();
    
    root.innerHTML = '';
    
    // Create cards for each playoff season (most recent first)
    const seasons = Object.keys(PLAYOFF_DATA).sort((a, b) => b - a);
    
    for (const season of seasons) {
      const data = PLAYOFF_DATA[season];
      
      const card = el('div', { class: 'playoff-card' });
      const header = el('div', { class: 'playoff-header', role: 'button', tabindex: '0' });
      
      header.append(
        el('div', { class: 'playoff-year' }, String(season)),
        el('div', { class: 'playoff-champion' }, `🏆 ${data.champion}`)
      );
      
      const body = el('div', { class: 'playoff-content' });
      const inner = el('div', { class: 'history-inner', html: 'Click to load playoff details...' });
      body.append(inner);
      
      const toggle = async () => {
        body.classList.toggle('open');
        if (!body.classList.contains('open')) return;
        
        if (!body.dataset.loaded) {
          // Show skeleton loading
          inner.innerHTML = '';
          
          // Champion skeleton
          inner.append(
            el('div', { class: 'champion-display' },
              el('div', { class: 'skeleton skeleton-champion-name' }),
              el('div', { class: 'skeleton skeleton-champion-record' })
            )
          );
          
          // Stats grid skeleton
          const skeletonGrid = el('div', { class: 'playoff-stats-grid' });
          const skeletonLeft = el('div', { class: 'playoff-stats-column' },
            ...Array(4).fill().map(() => 
              el('div', { class: 'playoff-section' },
                el('div', { class: 'skeleton skeleton-section-title' }),
                el('div', { class: 'skeleton skeleton-stat-item' }),
                el('div', { class: 'skeleton skeleton-stat-item' })
              )
            )
          );
          const skeletonRight = el('div', { class: 'playoff-chart-column' },
            el('div', { class: 'playoff-section' },
              el('div', { class: 'skeleton skeleton-section-title' }),
              el('div', { class: 'skeleton skeleton-chart-box' })
            )
          );
          skeletonGrid.append(skeletonLeft, skeletonRight);
          inner.append(skeletonGrid);
          
          await renderPlayoffContent(body, parseInt(season), playersMap);
          body.dataset.loaded = '1';
        }
      };
      
      header.addEventListener('click', toggle);
      header.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggle();
        }
      });
      
      card.append(header, body);
      root.append(card);
    }
    
    if (!root.children.length) {
      root.textContent = 'No playoff history available.';
    }
    
  } catch (err) {
    console.error('loadPlayoffs error:', err);
    root.textContent = 'Failed to load playoff history.';
  }
}
