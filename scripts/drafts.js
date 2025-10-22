// scripts/drafts.js
import { jget, getPlayersMap, LEAGUE_ID } from './api.js';
import { el, avatarURL, shortName, teamNameFromUser, avatarURLSafe, posClass } from './ui.js';

export default async function loadDrafts() {
  const root = document.getElementById('drafts-root');
  root.textContent = 'Loading drafts...';

  try {
    const players = await getPlayersMap();

    // Walk back through all linked seasons, gathering drafts + local owner maps
    const collected = []; // [{leagueId, draft, ownerByRoster}]
    let lid = LEAGUE_ID;

    while (lid) {
      const league = await jget(`/league/${lid}`);
      const [users, rosters, drafts] = await Promise.all([
        jget(`/league/${lid}/users`),
        jget(`/league/${lid}/rosters`),
        jget(`/league/${lid}/drafts`)
      ]);

      const userById = {};
      users.forEach(u => userById[u.user_id] = u);
      const ownerByRoster = {};
      rosters.forEach(r => ownerByRoster[r.roster_id] = userById[r.owner_id]);

      drafts.forEach(d => collected.push({ leagueId: lid, draft: d, ownerByRoster }));
      lid = league.previous_league_id || null; // move to previous season
    }

    if (!collected.length) { root.textContent = 'No drafts found.'; return; }

    // Sort newest → oldest (by season then start_time if present)
    collected.sort((a, b) => {
      const sa = Number(a.draft.season || 0), sb = Number(b.draft.season || 0);
      if (sb !== sa) return sb - sa;
      const ta = a.draft.start_time || 0, tb = b.draft.start_time || 0;
      return (tb - ta);
    });

    root.innerHTML = '';
    for (const { draft: d, ownerByRoster } of collected) {
      const card = el('div', { class: 'news-card draft-card' });

      const start = d.start_time ? new Date(d.start_time).toLocaleString() : 'unknown';
      const title = el('h3', {
        html: `${d.metadata?.name || 'Draft'} — ${d.season || ''} (${d.settings?.rounds || '?'} rounds)`,
        class: 'draft-title'
      });
      const meta = el('div', { class: 'draft-meta', html: `Type: ${d.type} · Status: ${d.status} · Start: ${start}` });

      const scroller = el('div', { class: 'draft-scroller' });
      const board = el('div', { class: 'draft-board' });
      scroller.append(board);
      card.append(title, meta, scroller);
      root.append(card);

      // Fetch picks and render as colored tiles
      const picks = await jget(`/draft/${d.draft_id}/picks`);

      // Keep Sleeper's order if pick_no exists; otherwise by (round, pick)
      picks.sort((a, b) => {
        const ao = (a.pick_no ?? ((a.round ?? 0) * 1000 + (a.pick ?? 0)));
        const bo = (b.pick_no ?? ((b.round ?? 0) * 1000 + (b.pick ?? 0)));
        return ao - bo;
      });

      picks.forEach(pk => {
        const p = players[pk.player_id] || {};
        const owner = ownerByRoster[pk.roster_id];

        const node = el('div', { class: `tile ${posClass(p.pos)}` });
        const rn = `R${pk.round ?? '?'} · P${(pk.pick_no ?? pk.pick ?? '?')}`;

        const line1 = el('div', { class: 'line1' });
        line1.append(
          el('div', { html: `${shortName(p.fn || pk.player_id, 18)}` }),
          el('div', { html: rn })
        );

        const line2 = el('div', {
          class: 'line2',
          html: `${p.pos ? p.pos : '?'} ${p.team ? '· '+p.team : ''}`
        });
        
        const line3 = el('div', { class: 'line3' });
        const av = avatarURLSafe(owner);
        if (av) line3.append(el('img', { class: 'avatar', src: av, alt: 'avatar' }));
        let ownerName =
          owner?.metadata?.team_name?.trim() ||
          owner?.display_name?.trim() ||
          owner?.username?.trim() ||
          (pk?.roster_id ? `Roster ${pk.roster_id}` : '—');
            if (ownerName.toLowerCase() === 'jewishpoosayslay') {
            ownerName = 'Eitans Team';
            }

          line3.append(el('span', { html: shortName(ownerName, 18) }));
        node.append(line1, line2, line3);
        board.append(node);
      });
    }
  } catch (e) {
    console.error(e);
    root.textContent = 'Failed to load drafts.';
  }
}