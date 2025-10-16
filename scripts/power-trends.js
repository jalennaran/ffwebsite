// scripts/power-trends.js
import { LEAGUE_ID } from './api.js';
import { sanitizeName } from './ui.js';

export default async function loadPowerTrends() {
  const canvas = document.getElementById('power-trend-chart');
  if (!canvas) return;

  const state = await fetch(`https://api.sleeper.app/v1/state/nfl`).then(r => r.json());
  // EXCLUDE current week:
  const endWeek = Math.max(1, Number(state.week || 1) - 1);

  const [rosters, users] = await Promise.all([
    fetch(`https://api.sleeper.app/v1/league/${LEAGUE_ID}/rosters`).then(r => r.json()),
    fetch(`https://api.sleeper.app/v1/league/${LEAGUE_ID}/users`).then(r => r.json())
  ]);

  const rosterIds = rosters.map(r => r.roster_id);
  const teamNameById = {};
  rosters.forEach(r => {
    const u = users.find(x => x.user_id === r.owner_id);
    teamNameById[r.roster_id] = sanitizeName(u?.metadata?.team_name || u?.display_name || u?.username || `Roster ${r.roster_id}`);
  });

  // Per-team weekly points (cumulative source) + W/L tracking up to each week
  const pointsByTeam = Object.fromEntries(rosterIds.map(id => [id, []]));
  const winsSoFar    = Object.fromEntries(rosterIds.map(id => [id, 0]));
  const gamesSoFar   = Object.fromEntries(rosterIds.map(id => [id, 0]));

  // Final series we’ll plot: per-team ranks by week
  const ranksByTeam = Object.fromEntries(rosterIds.map(id => [id, []]));

  const labels = Array.from({ length: endWeek }, (_, i) => `W${i + 1}`);

  // Helper: Oberon Mt. Power Rating
  const powerOf = (avg, hi, lo, winPct) =>
    (((avg * 6) + ((hi + lo) * 2) + ((winPct * 200) * 2)) / 10);

  for (let wk = 1; wk <= endWeek; wk++) {
    const mus = await fetch(`https://api.sleeper.app/v1/league/${LEAGUE_ID}/matchups/${wk}`).then(r => r.json());

    // Group matchups to identify winners
    const groups = {};
    mus.forEach(m => (groups[m.matchup_id] ||= []).push(m));

    // Fill this week’s points; also compute wins for this week
    const appeared = new Set();
    for (const pair of Object.values(groups)) {
      const a = pair[0], b = pair[1];
      if (a?.roster_id != null) {
        const pts = Number(a.points ?? 0);
        pointsByTeam[a.roster_id].push(pts);
        gamesSoFar[a.roster_id] += 1;
        appeared.add(a.roster_id);
      }
      if (b?.roster_id != null) {
        const pts = Number(b.points ?? 0);
        pointsByTeam[b.roster_id].push(pts);
        gamesSoFar[b.roster_id] += 1;
        appeared.add(b.roster_id);
      }

      // Decide winner/loser/tie for this pair
      if (a && b) {
        const ap = Number(a.points ?? 0), bp = Number(b.points ?? 0);
        if (ap > bp) winsSoFar[a.roster_id] += 1;
        else if (bp > ap) winsSoFar[b.roster_id] += 1;
        // ties: no wins added; games already counted
      }
    }

    // Any teams that didn’t appear this week (bye or missing): push 0 for points so arrays stay aligned
    rosterIds.forEach(tid => {
      if (!appeared.has(tid)) pointsByTeam[tid].push(0);
    });

    // Compute week-≤wk cumulative power, rank teams for this week
    const stats = rosterIds.map(tid => {
      const series = pointsByTeam[tid];                 // length === wk
      const fpts = series.reduce((a, b) => a + b, 0);
      const avg  = series.length ? fpts / series.length : 0;
      const hi   = series.length ? Math.max(...series) : 0;
      const nonZero = series.filter(x => x > 0);
      const lo   = nonZero.length ? Math.min(...nonZero) : hi;
      const winPct = gamesSoFar[tid] ? (winsSoFar[tid] / gamesSoFar[tid]) : 0;
      const power = powerOf(avg, hi, lo, winPct);
      return { tid, power, avg };
    });

    // Sort by power (same tiebreaker as your cards: then by avg)
    stats.sort((a, b) => b.power - a.power || b.avg - a.avg);

    // Assign rank for this week
    stats.forEach((row, i) => {
      ranksByTeam[row.tid].push(i + 1);
    });
  }

  // Build Chart.js datasets (rank chart; 1 is best, so invert the y-axis)
  const datasets = rosterIds.map(tid => ({
    label: teamNameById[tid],
    data: ranksByTeam[tid],
    borderWidth: 2,
    tension: 0.2,
    fill: false
  }));

  if (!window.Chart) {
    await import('https://cdn.jsdelivr.net/npm/chart.js');
  }

  new Chart(canvas, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom' },
        title: { display: true, text: 'Weekly Power Ranking (cumulative through each week)' },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: #${ctx.formattedValue}`
          }
        }
      },
      scales: {
        y: {
          reverse: true,            // rank 1 at the top
          ticks: { precision: 0, stepSize: 1 },
          title: { display: true, text: 'Rank (1 = best)' },
          suggestedMin: 1,
          suggestedMax: rosterIds.length
        },
        x: { title: { display: true, text: 'Week' } }
      }
    }
  });
}
