// scripts/rosters.js
import {
  getCurrentWeek, getLeagueBundle, getPlayersMap,
  getCurrentSeason, getWeekContextFromSleeperSafe, normTeam,
  jget, LEAGUE_ID
} from './api.js';
import { el, sanitizeName } from './ui.js';

export default async function loadRosters() {
  const root = document.getElementById('rosters-root');
  root.textContent = 'Loading rosters...';

  // helpers
  const POS_ORDER = { QB:0, RB:1, WR:2, TE:3, K:4, DST:5, DEF:5 };
  const byPosThenName = arr => arr.sort((a,b)=>{
    const ak = POS_ORDER[a.pos] ?? 99, bk = POS_ORDER[b.pos] ?? 99;
    if (ak !== bk) return ak - bk;
    return (a.fn||'').localeCompare(b.fn||'');
  });
  const posKey = p => (p.pos === 'DEF' ? 'DST' : (p.pos||''));
  const posClass = p => ((p.pos||'').toLowerCase() === 'def' ? 'dst' : (p.pos||'').toLowerCase());

  try {
    // base data
    const [week, leagueBundle, playersMap] = await Promise.all([
      getCurrentWeek(),
      getLeagueBundle(),   // { rosters, ownerByRoster }
      getPlayersMap()
    ]);
    const { rosters, ownerByRoster } = leagueBundle;
    const teamByPid = {};

    // starters from matchups (if this fails, we still render without starters emphasis)
    let startersByRoster = {};
    try {
      const matchups = await jget(`/league/${LEAGUE_ID}/matchups/${week}`);
      matchups.forEach(m => { if (m?.roster_id) startersByRoster[m.roster_id] = (m.starters||[]).filter(Boolean); });
    } catch (e) {
      console.warn('matchups fetch failed', e);
    }

    // render skeleton
    root.innerHTML = '';
    rosters.forEach(r => {
      const owner = ownerByRoster[r.roster_id];
      const teamName = sanitizeName((owner?.metadata?.team_name) || owner?.display_name || `Roster ${r.roster_id}`);

      const all = (r.players||[]).filter(Boolean);
      const ir  = (r.reserve||[]).filter(Boolean);
      const taxi= (r.taxi||[]).filter(Boolean);
      const starters = (startersByRoster[r.roster_id]||[]).filter(Boolean);
      const exclude = new Set([...starters, ...ir, ...taxi]);
      const bench = all.filter(pid => !exclude.has(pid));

      const pick = (pid) => {
        const p = playersMap[pid] || {};
        const pos = p.pos === 'DEF' ? 'DST' : p.pos;
        const team = p.team || '';
        const injuryStatus = p.injury_status || null;
        teamByPid[pid] = team;                 // <<< NEW: save team for fallback
        return { pid, fn: p.fn || pid, pos, team, injuryStatus };
      };


      const startersList = byPosThenName(starters.map(pick));
      const benchList    = byPosThenName(bench.map(pick));
      const irList       = byPosThenName(ir.map(pick));
      const taxiList     = byPosThenName(taxi.map(pick));

      // card
      const card = el('div', { class:'news-card ros-card' });

      const header = el('div', { class:'ros-header', role:'button', tabindex:'0' });
      header.append(el('div', { class:'ros-title', html: teamName }),
                    el('div', { class:'pmeta', html:`Week ${week}` }));
      const body   = el('div', { class:'ros-body' });
      const inner  = el('div', { class:'ros-inner' });

      inner.append(section('Starters', startersList, true));
      inner.append(section('Bench', benchList));
      inner.append(section('IR', irList));
      inner.append(section('Taxi', taxiList));

      body.append(inner);
      card.append(header, body);
      const toggle = () => body.classList.toggle('open');
      header.addEventListener('click', toggle);
      header.addEventListener('keydown', e => { if (e.key==='Enter'||e.key===' ') { e.preventDefault(); toggle(); } });

      root.append(card);
    });

    if (!root.children.length) root.textContent = 'No rosters found.';

    // hydrate matchup + avg AFTER render (non-fatal if it fails)
    const season = await getCurrentSeason();
    const { oppByPid, avgByPid, oppByTeam } = await getWeekContextFromSleeperSafe(season, week, teamByPid);

    document.querySelectorAll('[data-pid]').forEach(node => {
      const pid = node.getAttribute('data-pid');
      let opp = oppByPid[pid];
      if (!opp) {
        const team = normTeam(teamByPid[pid] || '');
        if (team && oppByTeam && oppByTeam[team]) opp = oppByTeam[team];
      }
      const avg = avgByPid[pid];
      const mEl = node.querySelector('.badge.mup');
      const aEl = node.querySelector('.badge.avg');

      if (mEl) {
        let label = '––';
        if (opp) {
          const s = String(opp).trim().toUpperCase();
          if (s === 'BYE') label = 'BYE/OUT';
          else if (s.startsWith('@') || s.startsWith('VS')) label = s;
          else label = `vs ${s}`;
        }
        mEl.textContent = label;
      }
      if (aEl) aEl.textContent = (avg != null && isFinite(avg)) ? `${avg.toFixed(1)} avg` : '—';
    });


    // ===== helpers used above =====
    function section(title, items, emphasize=false) {
      const wrap = el('div', {});
      wrap.append(el('div', { class:'group-title', html:title }));
      if (!items.length) {
        wrap.append(rowSkeleton(null));
        return wrap;
      }
      items.forEach(p => wrap.append(rowSkeleton(p, emphasize)));
      return wrap;
    }

    function rowSkeleton(p, emphasize=false) {
      // If p is null, render an empty row
      const row = el('div', { class:'player-row', ...(p? { 'data-pid': p.pid } : {}) });

      // left: position
      row.append(el('div', {}, el('span', { class:`pos ${p? posClass(p):''}`, html: p? posKey(p): '—' })));

      // player image or team logo for defenses
      if (p) {
        let imgUrl;
        if (p.pos === 'DEF' || p.pos === 'DST') {
          // Use team logo for defenses
          imgUrl = `https://sleepercdn.com/images/team_logos/nfl/${(p.team || '').toLowerCase()}.png`;
        } else {
          // Use player headshot for regular players
          imgUrl = `https://sleepercdn.com/content/nfl/players/thumb/${p.pid}.jpg`;
        }
        const img = el('img', { 
          class: 'player-thumbnail',
          src: imgUrl,
          alt: p.fn,
          onerror: "this.style.display='none'"
        });
        row.append(el('div', { class: 'player-img-cell' }, img));
      } else {
        row.append(el('div', { class: 'player-img-cell' }));
      }

      // middle: name + team
      // middle: name + team
      const nameHtml = p
        ? (emphasize
            ? `<strong><span class="name-link" data-player="${p.pid}">${p.fn}</span></strong>`
            : `<span class="name-link" data-player="${p.pid}">${p.fn}</span>`)
        : 'No players';

      const nameDiv = el('div', { html: nameHtml });
      
      // Add injury status next to name if present
      if (p && p.injuryStatus) {
        const injuryBadge = el('span', { 
          class: `injury-badge injury-${p.injuryStatus.toLowerCase()}`,
          html: p.injuryStatus.toUpperCase()
        });
        nameDiv.append(document.createTextNode(' '), injuryBadge);
      }
      
      const metaDiv = el('div', { class:'pmeta', html: p ? (p.team || '') : '' });
      
      row.append(el('div', {}, nameDiv, metaDiv));

      // hook: open modal on click
      if (p) {
        const link = nameDiv.querySelector('[data-player]');
        link?.addEventListener('click', async (ev) => {
          ev.stopPropagation();
          const { openPlayerPanel } = await import('./player-panel.js');
          openPlayerPanel(p.pid);
        });
      }


      // right badges: matchup + avg (filled later)
      row.append(el('div', { class:'cell' }, el('span', { class:'badge mup', html:'...' })));
      row.append(el('div', { class:'cell' }, el('span', { class:'badge avg', html:'...' })));

      return row;
    }

    function normalizeOpp(opp) {
      const s = String(opp).trim();
      if (!s) return '––';
      if (s.startsWith('@') || s.startsWith('vs')) return s;
      return `vs ${s.toUpperCase()}`;
    }

  } catch (err) {
    console.error('loadRosters fatal:', err);
    const root = document.getElementById('rosters-root');
    root.textContent = 'Failed to load rosters.';
  }
}