// scripts/standings.js
import { getLeagueBundle } from './api.js';
import { avatarURL, el, sanitizeName } from './ui.js';
import loadPowerRankings from './power-rankings.js';

export default async function loadStandings() {
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
    await loadPowerRankings();
    const { default: loadPowerTrends } = await import('./power-trends.js');
    await loadPowerTrends();
  } catch (e) { root.textContent = 'Failed to load standings.'; console.error(e); }
}