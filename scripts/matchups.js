// scripts/matchups.js
import { getCurrentWeek, getLeagueBundle, getPlayersMap, getAvgByRosterUpTo, jget, LEAGUE_ID } from './api.js';
import { el, sanitizeName } from './ui.js';

export default async function loadMatchups() {
  const root = document.getElementById('matchups-root');
  root.textContent = 'Loading matchups...';
  try {
    const [week, { ownerByRoster }, players] = await Promise.all([
      getCurrentWeek(),
      getLeagueBundle(),
      getPlayersMap()
    ]);

    const avgByRoster = await getAvgByRosterUpTo(Math.max(0, week - 1));
    const matchups = await jget(`/league/${LEAGUE_ID}/matchups/${week}`);
    const byId = {};
    matchups.forEach(m => { (byId[m.matchup_id] ||= []).push(m); });

    root.innerHTML = '';
    Object.values(byId).forEach(pair => {
      const a = pair[0], b = pair[1] || {};
      const aOwn = ownerByRoster[a?.roster_id], bOwn = ownerByRoster[b?.roster_id];
      const nameA = sanitizeName((aOwn?.metadata?.team_name) || aOwn?.display_name || `Roster ${a?.roster_id ?? '?'}`);
      const nameB = sanitizeName((bOwn?.metadata?.team_name) || bOwn?.display_name || (b ? `Roster ${b.roster_id}` : 'BYE'));

      // Card
      const card  = el('div', { class: 'news-card match-card' });
      const header = el('div', { class: 'match-header', role: 'button', tabindex: '0' });

      const aAvg = avgByRoster[a?.roster_id];
      const bAvg = avgByRoster[b?.roster_id];

      const left = el('div', { class: 'match-left' });
      left.append(
        el('div', { class: 'match-title', html: `Week ${week} · ${nameA} <span style="opacity:.6">vs</span> ${nameB}` }),
        el('div', { class: 'match-avg',   html: `Avg: ${isFinite(aAvg) ? aAvg.toFixed(1) : '—'} — ${isFinite(bAvg) ? bAvg.toFixed(1) : '—'}` })
      );

      const score = el('div', { class: 'match-score', html: `${(a?.points ?? 0).toFixed(2)} — ${(b?.points ?? 0).toFixed(2)}` });

      header.append(left, score);
      card.append(header);

      // Body (hidden by default)
      // Body (hidden by default)
      const body = el('div', { class: 'match-body' });

      // scroller + wide grid (same behavior as drafts)
      const scroller = el('div', { class: 'match-scroller' });
      const grid = el('div', { class: 'match-grid' });
      grid.append(
        buildTeamCol(a, nameA, players),
        buildTeamCol(b, nameB, players)
      );
      scroller.append(grid);
      body.append(scroller);
      card.append(body);


      // Toggle logic
      const toggle = () => body.classList.toggle('open');
      header.addEventListener('click', toggle);
      header.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });

      root.append(card);
    });

    if (!root.children.length) root.textContent = `No matchups found for Week ${week}.`;

  } catch (e) {
    console.error(e);
    root.textContent = 'Failed to load matchups.';
  }
}

function buildTeamCol(entry, teamName, players) {
  const col = el('div', { class: 'team-col' });
  col.append(el('span', { class: 'team-name', html: teamName }));

  if (!entry || !entry.roster_id) {
    col.append(el('div', { class: 'pmeta', html: 'No data (BYE or missing).' }));
    return col;
  }

  const starters = (entry.starters || []).filter(Boolean);        // array of player_ids
  const all = (entry.players || []).filter(Boolean);               // all active players in matchup
  const bench = all.filter(pid => !starters.includes(pid));        // bench = all - starters
  const ppts = entry.players_points || {};                         // { player_id: points }

  // Starters
  col.append(el('div', { class: 'group-title', html: 'Starters' }));
  const startersWrap = el('div', { class: 'group' });
  starters.forEach(pid => startersWrap.append(playerRow(pid, ppts[pid] ?? 0, players)));
  if (!starters.length) startersWrap.append(el('div', { class: 'pmeta', html: '—' }));
  col.append(startersWrap);

  // Bench
  col.append(el('div', { class: 'group-title', html: 'Bench' }));
  const benchWrap = el('div', { class: 'group' });
  bench.forEach(pid => benchWrap.append(playerRow(pid, ppts[pid] ?? 0, players)));
  if (!bench.length) benchWrap.append(el('div', { class: 'pmeta', html: '—' }));
  col.append(benchWrap);

  return col;
}

function playerRow(pid, pts, players) {
  const p = players[pid] || {};
  const posRaw  = p.pos || '';
  const posKey  = posRaw === 'DEF' ? 'DST' : posRaw;
  const posClass = posRaw === 'DEF' ? 'dst' : posRaw.toLowerCase();
  // treat only true empty slots as empty (pid missing/zero), not missing first names
  const hasPlayer = pid && pid !== '0' && pid !== 0;
  const row = el('div', { class: 'player-row' });
  // Position pill (blank oval if unknown)
  if (posKey) {
    row.append(el('div', {}, el('span', { class: `pos ${posClass}`, html: posKey })));
  } else {
    row.append(el('div', {}, el('span', { class: 'pos empty', html: '&nbsp;' })));
  }
  // Name + meta
  const name = hasPlayer
    // fallbacks cover DST/team defenses which often lack p.fn
    ? (p.fn || p.name || p.fullname || p.displayName || p.team || String(pid))
    : 'Empty';
  const meta = hasPlayer ? [p.team].filter(Boolean).join(' · ') : '';

  const nameDiv = el('div', { class: hasPlayer ? 'player-name' : 'empty-name', html: name });
  
  // Add modal functionality if it's a real player
  if (hasPlayer) {
    nameDiv.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      const { openPlayerPanel } = await import('./player-panel.js');
      openPlayerPanel(pid);
    });
  }
  
  row.append(
    el('div', {},
      nameDiv,
      el('div', { class: 'pmeta', html: meta })
    )
  );
  // Points (keep 0.00 even for empty)
  row.append(el('div', { class: 'pts', html: Number(pts).toFixed(2) }));
  return row;
}