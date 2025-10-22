// scripts/player-panel.js
import { getPlayersMap, getCurrentSeason, getCurrentWeek,
         getPlayerWeeklyLeaguePoints, getPlayerWeekStats } from './api.js';
import { el } from './ui.js';

function buildWeeklyLineChartSVG(rows, opts = {}) {
  // rows: [{week, pts}]
  const w = opts.width  || 680;     // container will scale it
  const h = opts.height || 160;
  const pad = { l: 40, r: 44, t: 18, b: 28 };

  const weeks = rows.map(r => r.week);
  const pts   = rows.map(r => (typeof r.pts === 'number' ? r.pts : 0));
  const minX = Math.min(...weeks), maxX = Math.max(...weeks);
  const minY = 0;                    // fantasy points baseline at 0
  const maxYRaw = Math.max(...pts, 0);
  const maxY = Math.max(10, Math.ceil(maxYRaw + 2));

  const sx = x => pad.l + ( (x - minX) / (maxX - minX || 1) ) * (w - pad.l - pad.r);
  const sy = y => h - pad.b - ( (y - minY) / (maxY - minY || 1) ) * (h - pad.t - pad.b);

  // line path
  const d = rows
    .map((r, i) => `${i ? 'L' : 'M'}${sx(r.week)},${sy(r.pts || 0)}`)
    .join(' ');

  // x ticks at each week
  const xticks = weeks.map(week => ({
    x: sx(week),
    lbl: String(week)
  }));

  // y ticks: 0, 10, 20, ... up to maxY
  const step = maxY <= 20 ? 5 : 10;
  const yticks = [];
  for (let y = 0; y <= maxY; y += step) { yticks.push({ y, lbl: String(y) }); }

  // tooltip group
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.classList.add('pp-chart');

  // gridlines
  yticks.forEach(t => {
    const line = document.createElementNS(svgNS, 'line');
    line.setAttribute('x1', pad.l);
    line.setAttribute('x2', w - pad.r);
    line.setAttribute('y1', sy(t.y));
    line.setAttribute('y2', sy(t.y));
    line.setAttribute('class', 'pp-grid');
    svg.appendChild(line);
  });

  // y axis labels
  yticks.forEach(t => {
    const txt = document.createElementNS(svgNS, 'text');
    txt.textContent = t.lbl;
    txt.setAttribute('x', pad.l - 8);
    txt.setAttribute('y', sy(t.y) + 4);
    txt.setAttribute('class', 'pp-ylab');
    svg.appendChild(txt);
  });

  // x axis labels (weeks)
  xticks.forEach(t => {
    const txt = document.createElementNS(svgNS, 'text');
    txt.textContent = t.lbl;
    txt.setAttribute('x', t.x);
    txt.setAttribute('y', h - 4);
    txt.setAttribute('class', 'pp-xlab');
    svg.appendChild(txt);
  });

  // line
  const path = document.createElementNS(svgNS, 'path');
  path.setAttribute('d', d);
  path.setAttribute('class', 'pp-line');
  svg.appendChild(path);

  // dots + hit zones for tooltip
  const tt = document.createElementNS(svgNS, 'g');
  tt.setAttribute('class', 'pp-tt hidden');
  const ttLine = document.createElementNS(svgNS, 'line');
  ttLine.setAttribute('class', 'pp-tt-line');
  const ttDot  = document.createElementNS(svgNS, 'circle');
  ttDot.setAttribute('r', 3.5);
  ttDot.setAttribute('class', 'pp-tt-dot');
  const ttBg   = document.createElementNS(svgNS, 'rect');
  ttBg.setAttribute('rx', 4);
  ttBg.setAttribute('ry', 4);
  ttBg.setAttribute('class', 'pp-tt-bg');
  const ttTxt  = document.createElementNS(svgNS, 'text');
  ttTxt.setAttribute('class', 'pp-tt-text');
  tt.append(ttLine, ttDot, ttBg, ttTxt);
  svg.appendChild(tt);

  function showTip(x, y, label) {
    tt.classList.remove('hidden');
    ttLine.setAttribute('x1', x);
    ttLine.setAttribute('x2', x);
    ttLine.setAttribute('y1', pad.t);
    ttLine.setAttribute('y2', h - pad.b);
    ttDot.setAttribute('cx', x);
    ttDot.setAttribute('cy', y);
    // text first (measure)
    ttTxt.textContent = label;
    ttTxt.setAttribute('x', x + 8);
    ttTxt.setAttribute('y', y - 10);
    // background behind text
    const bbox = ttTxt.getBBox();
    ttBg.setAttribute('x', bbox.x - 6);
    ttBg.setAttribute('y', bbox.y - 3);
    ttBg.setAttribute('width', bbox.width + 12);
    ttBg.setAttribute('height', bbox.height + 6);
  }
  function hideTip(){ tt.classList.add('hidden'); }

  rows.forEach(r => {
    const cx = sx(r.week);
    const cy = sy(r.pts || 0);

    const dot = document.createElementNS(svgNS, 'circle');
    dot.setAttribute('cx', cx);
    dot.setAttribute('cy', cy);
    dot.setAttribute('r', 2.5);
    dot.setAttribute('class', 'pp-dot');
    svg.appendChild(dot);

    const hit = document.createElementNS(svgNS, 'rect');
    hit.setAttribute('x', cx - 10);
    hit.setAttribute('y', pad.t);
    hit.setAttribute('width', 20);
    hit.setAttribute('height', h - pad.t - pad.b);
    hit.setAttribute('class', 'pp-hit');
    hit.addEventListener('mouseenter', () => {
      showTip(cx, cy, `W${r.week}: ${Number(r.pts || 0).toFixed(1)}`);
    });
    hit.addEventListener('mouseleave', hideTip);
    svg.appendChild(hit);
  });

  return svg;
}

export async function openPlayerPanel(pid) {
  const modal = document.getElementById('player-modal');
  if (!modal) return;

  // shell
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  modal.innerHTML = ''; // reset

  const sheet = el('div', { class: 'sheet' });
  
  // Add team color variables to the sheet
  function setTeamColors(team) {
    if (!team) return;
    team = team.toLowerCase();
    sheet.style.setProperty('--team-primary', `var(--${team}-primary)`);
    sheet.style.setProperty('--team-secondary', `var(--${team}-secondary)`);
  }

  sheet.append(
    el('div', { class: 'pp-title', html: 'Loading…' }),
    el('div', { class: 'tabs' },
      el('button', { class: 'tab active', 'data-tab':'points',   html:'Weekly Points' }),
      el('button', { class: 'tab',         'data-tab':'gamelog',  html:'Game Log' }),
      el('button', { class: 'tab',         'data-tab':'teamdepth',html:'Team Depth' })   // <-- new
    ),
    el('div', { id: 'pp-body' }, el('div', { html: 'Loading…' }))
);

  modal.append(sheet);
  // Close modal only by clicking the backdrop (outside the sheet)
  const close = () => {
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  modal.innerHTML = '';
  };
  modal.addEventListener('click', (e) => {
  if (e.target === modal) close();
  });


  // load data
  try {
    const [players, season, week] = await Promise.all([ getPlayersMap(), getCurrentSeason(), getCurrentWeek() ]);
    const p = players[pid] || {};
    const name = p.fn || pid;
    if (p.team) {
      setTeamColors(p.team);
    }
    sheet.querySelector('.pp-title').textContent = `${name} ${p.pos ? `(${p.pos})` : ''} ${p.team ? `· ${p.team}` : ''}`;

    // tabs click
    const tabs = sheet.querySelectorAll('.tab');
    tabs.forEach(btn => btn.addEventListener('click', () => {
      tabs.forEach(b => b.classList.toggle('active', b === btn));
      render(btn.getAttribute('data-tab'));
    }));

    // data providers
    const endWeek = Math.max(1, Number(week) - 0); // include current week; league data is live
    const weeklyPointsPromise = getPlayerWeeklyLeaguePoints(pid, endWeek);

    async function getGameLog() {
      const rows = [];
      for (let w = 1; w <= endWeek; w++) {
        const rec = await getPlayerWeekStats(season, w, pid);
        if (rec) rows.push(rec);
      }
      return rows;
    }
    const gameLogPromise = getGameLog();

    // first view
    render('points');

    async function render(which) {
      const body = document.getElementById('pp-body');
      if (!body) return;
      if (which === 'points') {
        body.innerHTML = '<div>Loading weekly points…</div>';
        const data = await weeklyPointsPromise;
        const chartWrap = document.createElement('div');
        chartWrap.className = 'pp-chart-wrap';
        chartWrap.appendChild(buildWeeklyLineChartSVG(data));
        const tblHtml = table(['Week','Pts'], data.map(r => [r.week, r.pts?.toFixed?.(1) ?? '0.0']));
        body.innerHTML = '';
        body.appendChild(chartWrap);
        body.insertAdjacentHTML('beforeend', tblHtml);
      } else if (which === 'gamelog') {
      body.innerHTML = '<div>Loading game log…</div>';
      const gl = await gameLogPromise;
      if (!gl.length) { body.innerHTML = '<div>No game log available.</div>'; return; }
        const pos = (p.pos || '').toUpperCase();
        // helper: first non-null stat among aliases (fallback 0)
        const get = (s, ...keys) => {
            for (const k of keys) {
            if (s && s[k] != null) return Number(s[k]) || 0;
            }
            return 0;
        };

        // common alias bundles (cover Sleeper's short keys and some long ones)
        const A = {
            QB: {
            passAtt: ['pass_att','pass_attempts','passing_attempts','pa'],
            passComp:['pass_cmp','pass_completions','passing_completions','pc'],
            passYds: ['pass_yds','pass_yd','pass_yards','passing_yards','py'],
            rushAtt: ['rush_att','rush_attempts','rushing_attempts','ra'],
            rushYds: ['rush_yds','rush_yd','rush_yards','rushing_yards','ry'],
            passTd:  ['pass_td','pass_tds','passing_tds','passing_touchdowns'],
            rushTd:  ['rush_td','rush_tds','rushing_tds','rushing_touchdowns'],
            recTd:   ['rec_td','rec_tds','receiving_tds','receiving_touchdowns'],
            },
            REC: { // WR/RB/TE
            targets:  ['tgt','targets','rec_tgt','receiving_targets'],
            recs:     ['rec','receptions','receiving_receptions'],
            recYds:   ['rec_yds','rec_yd','rec_yards','receiving_yards','recy'],
            rushAtt:  ['rush_att','rush_attempts','rushing_attempts','ra'],
            rushYds:  ['rush_yds','rush_yd','rush_yards','rushing_yards','ry'],
            rushTd:   ['rush_td','rush_tds','rushing_tds','rushing_touchdowns'],
            recTd:    ['rec_td','rec_tds','receiving_tds','receiving_touchdowns'],
            },
            K: {
            fgm:      ['fgm','kicking_fg_made','field_goals_made'],
            fga:      ['fga','kicking_fg_attempts','field_goals_attempts'],
            fgmiss:   ['fgmiss','kicking_fg_missed','field_goals_missed'],
            xpm:      ['xpm','kicking_xp_made','extra_points_made'],
            xpa:      ['xpa','kicking_xp_attempts','extra_points_attempts'],
            xpmiss:   ['xpmiss','kicking_xp_missed','extra_points_missed'],
            }
        };

        let headers, rows;

        if (pos === 'QB') {
            headers = ['Week','Opp','Pass Att','Pass Comp','Pass Yds','Rush Att','Rush Yds','TD'];
            rows = gl.map(g => {
            const s = g.stats || {};
            const passAtt = get(s, ...A.QB.passAtt);
            const passComp= get(s, ...A.QB.passComp);
            const passYds = get(s, ...A.QB.passYds);
            const rushAtt = get(s, ...A.QB.rushAtt);
            const rushYds = get(s, ...A.QB.rushYds);
            const td = get(s, ...A.QB.passTd) + get(s, ...A.QB.rushTd) + get(s, ...A.QB.recTd);
            return [g.week, (g.opponent || g.opp || '').toString(), passAtt, passComp, passYds, rushAtt, rushYds, td];
            });

        } else if (pos === 'K') {
            headers = ['Week','Opp','FG Att','FG Miss','XP Att','XP Miss','TD'];
            rows = gl.map(g => {
            const s = g.stats || {};
            const fgm    = get(s, ...A.K.fgm);
            const fgaRaw = get(s, ...A.K.fga);
            const fgmiss = get(s, ...A.K.fgmiss);
            const xpm    = get(s, ...A.K.xpm);
            const xpaRaw = get(s, ...A.K.xpa);
            const xpmiss = get(s, ...A.K.xpmiss);
            const fga    = fgaRaw || (fgm + fgmiss);
            const xpa    = xpaRaw || (xpm + xpmiss);
            const td     = 0; // kickers won't have TDs in practice
            return [g.week, (g.opponent || g.opp || '').toString(), fga, fgmiss, xpa, xpmiss, td];
            });

        } else {
            // WR / RB / TE / others
            headers = ['Week','Opp','Targets','Receptions','Rec Yds','Rush Att','Rush Yds','TD'];
            rows = gl.map(g => {
            const s = g.stats || {};
            const tgt    = get(s, ...A.REC.targets);
            const rec    = get(s, ...A.REC.recs);
            const recYds = get(s, ...A.REC.recYds);
            const rAtt   = get(s, ...A.REC.rushAtt);
            const rYds   = get(s, ...A.REC.rushYds);
            const td     = get(s, ...A.REC.recTd) + get(s, ...A.REC.rushTd);
            return [g.week, (g.opponent || g.opp || '').toString(), tgt, rec, recYds, rAtt, rYds, td];
            });
        }

        body.innerHTML = table(headers, rows);
} else if (which === 'teamdepth') {
  body.innerHTML = '<div>Building team depth (takes a sec the first time)…</div>';

  // need players map, season, week, and the clicked player's team
  const [players, season, week] = await Promise.all([ getPlayersMap(), getCurrentSeason(), getCurrentWeek() ]);
  const team = (players[pid]?.team || '').toUpperCase();
  if (!team) { body.innerHTML = '<div>No team found for this player.</div>'; return; }

  // build usage-ranked depth chart
  const usageDepth = await (await import('./api.js'))
    .buildTeamDepthByUsage(team, season, week, players);

  // pretty print like the example (multi-section)
  const sections = [
    ['QB','QB'], ['RB','RB'],
    ['WR1','WR1'], ['WR2','WR2'], ['WR3','WR3'],
    ['TE','TE'], ['K','K'], ['DST','DST']
  ];

  const wrap = document.createElement('div');
  sections.forEach(([label, key]) => {
    const group = usageDepth[key] || [];
    if (!group.length) return;
    const title = document.createElement('div');
    title.className = 'depth-position';
    title.textContent = label;
    wrap.appendChild(title);

    const list = document.createElement('div');
    list.style.padding = '2px 0 8px';
    group.forEach((r, i) => {
      const row = document.createElement('div');
      row.style.padding = '2px 0';
      row.textContent = r.name;
      list.appendChild(row);
    });
    wrap.appendChild(list);
  });

  // If nothing to show:
  if (!wrap.childNodes.length) {
    body.innerHTML = '<div>No recent-usage depth info.</div>';
  } else {
    body.innerHTML = '';
    body.appendChild(wrap);
  }
}



    }
  } catch (e) {
    console.error('player panel', e);
    sheet.querySelector('#pp-body').innerHTML = '<div style="color:#c00;">Failed to load player data.</div>';
  }
}

// tiny util
function table(headers, rows) {
  const thead = `<thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead>`;
  const tbody = `<tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>`;
  return `<table class="table">${thead}${tbody}</table>`;
}
