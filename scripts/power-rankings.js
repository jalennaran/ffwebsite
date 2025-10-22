// scripts/power-rankings.js
import { LEAGUE_ID } from './api.js';
import { escapeHtml, sanitizeName } from './ui.js';

const PR_PROXY = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? 'https://corsproxy.io/?'
  : '';

export default async function loadPowerRankings() {
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
        name: sanitizeName(owner?.display_name || owner?.username || 'Unknown'),
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
          <span>PWR: ${t.power.toFixed(1)}</span>
          <span>AVG: ${t.avg.toFixed(2)} | HI: ${t.high.toFixed(2)} | LO: ${t.low.toFixed(2)}</span>
        </span>
      </div>
    `).join('');
  } catch (err) {
    console.error('Power Rankings Error:', err);
    container.innerHTML = '<div class="power-card"><span style="color:#c00;">Failed to load rankings. See console.</span></div>';
  }
}
