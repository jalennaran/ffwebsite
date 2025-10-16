// scripts/transactions.js
import { getCurrentWeek, getLeagueBundle, getPlayersMap, jget, LEAGUE_ID } from './api.js';
import { el, sanitizeName } from './ui.js';

export default async function loadTransactions() {
  const root = document.getElementById('tx-root');
  root.textContent = 'Loading transactions...';

  // Helpers
  const fmtTime = (ms) => new Date(ms).toLocaleString();
  const fmtPlayer = (pid, players) => {
    const p = players[pid] || {};
    const name = p.fn || pid;
    const meta = [p.pos, p.team].filter(Boolean).join(' • ');
    return { name, meta };
  };
  const fmtPick = (pk) => {
    // pk: { season, round, roster_id, owner_id, previous_owner_id }
    const yr = pk.season || '—';
    const rd = pk.round ? `R${pk.round}` : 'R?';
    return `${yr} ${rd}`;
  };

  try {
    const [week, { ownerByRoster }, players] = await Promise.all([
      getCurrentWeek(),
      getLeagueBundle(),
      getPlayersMap()
    ]);

    const txs = await jget(`/league/${LEAGUE_ID}/transactions/${week}`);
    if (!txs.length) { root.textContent = `No transactions for Week ${week}.`; return; }

    root.innerHTML = '';
    txs.forEach(tx => {
      const type = (tx.type || '').toLowerCase(); // trade, free_agent, waiver, commissioner, etc.
      const when = fmtTime(tx.created || tx.status_updated || Date.now());

      // Base card
      const card = el('div', { class: 'news-card tx-card' });
      const header = el('div', { class: 'tx-header' });
      const icon = el('div', { class: 'tx-icon' });
      const title = el('div', { class: 'tx-title' });

      // Choose icon + title
      if (type === 'trade') {
        icon.textContent = '🔄';
        const teams = (tx.roster_ids || []).map(rid => {
          const u = ownerByRoster[rid];
          return sanitizeName((u?.metadata?.team_name) || u?.display_name || `Roster ${rid}`);
        }).join(' & ');
        title.textContent = `TRADE · ${teams}`;
      } else if (type === 'waiver') {
        icon.textContent = '🪙';
        // usually one recipient roster in adds
        const rid = tx.adds ? Object.values(tx.adds)[0] : null;
        const u = rid ? ownerByRoster[rid] : null;
        const team = sanitizeName((u?.metadata?.team_name) || u?.display_name || (rid ? `Roster ${rid}` : '—'));
        title.textContent = `WAIVER · ${team}`;
      } else if (type === 'free_agent') {
        icon.textContent = '🆓';
        const rid = tx.adds ? Object.values(tx.adds)[0] : (tx.drops ? Object.values(tx.drops)[0] : null);
        const u = rid ? ownerByRoster[rid] : null;
        const team = sanitizeName((u?.metadata?.team_name) || u?.display_name || `Roster ${rid}`);
        title.textContent = `FREE AGENT · ${team}`;
      } else {
        icon.textContent = '🛠️';
        title.textContent = `${(tx.type || 'TRANSACTION').toUpperCase()}`;
      }

      header.append(icon, title);
      card.append(header);
      card.append(el('div', { class: 'tx-meta', html: when }));

      // Render bodies by type
      if (type === 'trade') {
        // Build per-roster gains/losses
        const adds = tx.adds || {};  // { player_id: roster_id }
        const drops = tx.drops || {}; // { player_id: roster_id }
        const picks = tx.draft_picks || []; // each has owner changes

        // index picks gained/lost by roster
        const pickGainsBy = {};
        const pickLossBy = {};
        picks.forEach(pk => {
          // when traded, owner_id = new owner after trade; previous_owner_id = old
          (pickGainsBy[pk.owner_id] ||= []).push(pk);
          (pickLossBy[pk.previous_owner_id] ||= []).push(pk);
        });

        const grid = el('div', { class: 'tx-grid' });

        (tx.roster_ids || []).forEach(rid => {
          const u = ownerByRoster[rid];
          const team = sanitizeName((u?.metadata?.team_name) || u?.display_name || `Roster ${rid}`);

          // Gains: players whose adds[...] === rid
          const gains = Object.entries(adds)
            .filter(([, to]) => to === rid)
            .map(([pid]) => ({ ...fmtPlayer(pid, players), pid }));

          // Losses: players whose drops[...] === rid
          const losses = Object.entries(drops)
            .filter(([, from]) => from === rid)
            .map(([pid]) => ({ ...fmtPlayer(pid, players), pid }));

          const pickGains = pickGainsBy[rid] || [];
          const pickLosses = pickLossBy[rid] || [];

          const col = el('div', { class: 'tx-team' });
          col.append(el('span', { class: 'tx-team-name', html: team }));

          if (gains.length || pickGains.length) {
            col.append(el('div', { class: 'tx-section-label', html: 'Gained' }));
            const wrap = el('div', { class: 'pills' });
            gains.forEach(p => {
              const pill = el('span', { class: 'pill gain', html: p.name + (p.meta ? `<small>${p.meta}</small>` : '') });
              wrap.append(pill);
            });
            pickGains.forEach(pk => {
              wrap.append(el('span', { class: 'pill gain pick', html: fmtPick(pk) }));
            });
            col.append(wrap);
          }

          if (losses.length || pickLosses.length) {
            col.append(el('div', { class: 'tx-section-label', html: 'Sent' }));
            const wrap = el('div', { class: 'pills' });
            losses.forEach(p => {
              const pill = el('span', { class: 'pill loss', html: p.name + (p.meta ? `<small>${p.meta}</small>` : '') });
              wrap.append(pill);
            });
            pickLosses.forEach(pk => {
              wrap.append(el('span', { class: 'pill loss pick', html: fmtPick(pk) }));
            });
            col.append(wrap);
          }

          // Handle odd cases (no adds/drops recorded)
          if (!col.querySelector('.pills')) {
            col.append(el('div', { class: 'tx-section-label', html: 'No changes recorded' }));
          }

          grid.append(col);
        });

        card.append(grid);

      } else {
        // Single-owner style (waiver/free_agent/commissioner)
        const adds = tx.adds ? Object.keys(tx.adds).map(pid => fmtPlayer(pid, players)) : [];
        const drops = tx.drops ? Object.keys(tx.drops).map(pid => fmtPlayer(pid, players)) : [];
        const single = el('div', { class: 'tx-single' });
        const rows = [];

        if (adds.length) {
          const row = el('div', { class: 'tx-badges' });
          row.append(el('span', { class: 'tx-badge', html: 'Added' }));
          const pills = el('div', { class: 'pills' });
          adds.forEach(p => pills.append(el('span', { class: 'pill gain', html: p.name + (p.meta ? `<small>${p.meta}</small>` : '') })));
          row.append(pills);
          rows.push(row);
        }
        if (drops.length) {
          const row = el('div', { class: 'tx-badges' });
          row.append(el('span', { class: 'tx-badge', html: 'Dropped' }));
          const pills = el('div', { class: 'pills' });
          drops.forEach(p => pills.append(el('span', { class: 'pill loss', html: p.name + (p.meta ? `<small>${p.meta}</small>` : '') })));
          row.append(pills);
          rows.push(row);
        }

        if (!rows.length) {
          single.append(el('div', { class: 'tx-meta', html: 'No player movement recorded.' }));
        } else {
          rows.forEach(r => single.append(r));
        }

        // FAAB info for waivers
        if (type === 'waiver' && typeof tx.waiver_bid === 'number') {
          single.append(el('div', { class: 'tx-meta', html: `FAAB: ${tx.waiver_bid}` }));
        }

        card.append(single);
      }

      root.append(card);
    });
  } catch (e) {
    console.error(e);
    root.textContent = 'Failed to load transactions.';
  }
}