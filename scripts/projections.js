// scripts/projections.js
import { el } from './ui.js';

let allProjections = [];
let currentView = 'next-week';
let isInitialized = false;

/* ----------------------- Skeleton Loaders ----------------------- */

function createPlayerRowSkeleton() {
  const row = el('div', { class: 'skeleton-proj-card' });
  row.innerHTML = `
    <div class="skeleton skeleton-line rank-skeleton"></div>
    <div class="skeleton skeleton-line rank-skeleton"></div>
    <div class="skeleton skeleton-line player-skeleton"></div>
    <div class="skeleton skeleton-line stat-skeleton"></div>
    <div class="skeleton skeleton-line stat-skeleton"></div>
  `;
  return row;
}

function createPlayerTableSkeleton(count = 20) {
  const table = el('div', { class: 'proj-table' });
  
  // Add header
  const header = el('div', { class: 'proj-header-row' });
  header.innerHTML = `
    <div class="proj-rank">Rank</div>
    <div class="proj-pos">Pos</div>
    <div class="proj-player">Player</div>
    <div class="proj-stat proj-pts">Projected</div>
    <div class="proj-stat">Avg L3</div>
  `;
  table.appendChild(header);
  
  // Add skeleton rows
  for (let i = 0; i < count; i++) {
    table.appendChild(createPlayerRowSkeleton());
  }
  
  return table;
}

/* ----------------------- CSV Parsing ----------------------- */

function parseCSV(text) {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',');
  
  return lines.slice(1).map(line => {
    const values = line.split(',');
    const player = {};
    headers.forEach((header, index) => {
      player[header.trim()] = values[index]?.trim() || '';
    });
    return player;
  }).filter(p => p.player_name); // Filter out empty rows
}

/* ----------------------- Rendering ----------------------- */

function getInjuryBadge(status) {
  if (!status || status === '') return '';
  
  const statusLower = status.toLowerCase();
  let badgeClass = 'injury-badge';
  
  if (statusLower === 'out' || statusLower === 'ir') {
    badgeClass += ' injury-out';
  } else if (statusLower === 'doubtful') {
    badgeClass += ' injury-doubtful';
  } else if (statusLower === 'questionable' || statusLower === 'q') {
    badgeClass += ' injury-questionable';
  } else {
    badgeClass += ' injury-sus';
  }
  
  return `<span class="${badgeClass} injury-desktop">${status.toUpperCase()}</span>`;
}

function renderPlayerRow(player, rank) {
  const projectedPts = parseFloat(player.projected_points).toFixed(1);
  const avgLast3 = player.avg_last_3_games && player.avg_last_3_games !== '' 
    ? parseFloat(player.avg_last_3_games).toFixed(1) 
    : '-';
  const injuryBadge = getInjuryBadge(player.injury_status);
  const playerName = player.player_display_name || player.player_name;
  
  // Filter out null text
  const displayName = playerName.replace(/null/gi, '').trim();
  
  const row = el('div', { class: 'proj-row' });
  
  row.innerHTML = `
    <div class="proj-rank">#${rank}</div>
    <div class="proj-pos"><span class="pos badge">${player.position}</span></div>
    <div class="proj-player">
      <span class="proj-name">${displayName}</span>
      ${injuryBadge}
    </div>
    <div class="proj-stat proj-pts">
      <span class="stat-value">${projectedPts}</span>
      <span class="stat-label">pts</span>
    </div>
    <div class="proj-stat">
      <span class="stat-value">${avgLast3}</span>
      <span class="stat-label">avg</span>
    </div>
  `;
  
  return row;
}

function displayProjections(data) {
  const root = document.getElementById('projections-root');
  root.innerHTML = '';
  
  if (!data || data.length === 0) {
    root.innerHTML = '<div class="no-results">No players found matching your filters.</div>';
    updateResultsCount(0);
    return;
  }
  
  // Create table structure
  const table = el('div', { class: 'proj-table' });
  
  // Add header
  const header = el('div', { class: 'proj-header-row' });
  header.innerHTML = `
    <div class="proj-rank">Rank</div>
    <div class="proj-pos">Pos</div>
    <div class="proj-player">Player</div>
    <div class="proj-stat proj-pts">Projected</div>
    <div class="proj-stat">Avg L3</div>
  `;
  table.appendChild(header);
  
  // Add rows
  data.forEach((player, idx) => {
    table.appendChild(renderPlayerRow(player, idx + 1));
  });
  
  root.appendChild(table);
  updateResultsCount(data.length);
}

function updateResultsCount(count) {
  const resultsEl = document.getElementById('results-count');
  resultsEl.textContent = `Showing ${count} player${count !== 1 ? 's' : ''}`;
}

/* ----------------------- Filtering ----------------------- */

function filterProjections() {
  const position = document.getElementById('position-filter').value;
  const searchTerm = document.getElementById('search-player').value.toLowerCase();
  
  let filtered = [...allProjections];
  
  // Filter by position
  if (position !== 'all') {
    filtered = filtered.filter(p => p.position === position);
  }
  
  // Filter by search term
  if (searchTerm) {
    filtered = filtered.filter(p => 
      (p.player_display_name || p.player_name).toLowerCase().includes(searchTerm)
    );
  }
  
  displayProjections(filtered);
}

/* ----------------------- Data Loading ----------------------- */

async function loadProjections() {
  const root = document.getElementById('projections-root');
  
  // Show skeleton loaders
  root.innerHTML = '';
  root.appendChild(createPlayerTableSkeleton(20));
  updateResultsCount(0);
  
  try {
    const fileName = currentView === 'next-week' 
      ? 'next_week_projections.csv' 
      : 'rest_of_season_projections.csv';
    
    const response = await fetch(fileName);
    if (!response.ok) throw new Error(`Failed to load ${fileName}`);
    
    const text = await response.text();
    allProjections = parseCSV(text);
    
    // Sort by projected points descending
    allProjections.sort((a, b) => {
      return parseFloat(b.projected_points) - parseFloat(a.projected_points);
    });
    
    displayProjections(allProjections);
  } catch (error) {
    console.error('Error loading projections:', error);
    root.innerHTML = '<div class="error-message">Failed to load projections. Please try again later.</div>';
  }
}

/* ----------------------- Event Listeners ----------------------- */

function setupEventListeners() {
  // Position filter
  const posFilter = document.getElementById('position-filter');
  if (posFilter) {
    posFilter.removeEventListener('change', filterProjections);
    posFilter.addEventListener('change', filterProjections);
  }
  
  // Search input
  const searchInput = document.getElementById('search-player');
  if (searchInput) {
    searchInput.removeEventListener('input', filterProjections);
    searchInput.addEventListener('input', filterProjections);
  }
  
  // Projection type (next week vs rest of season)
  const projType = document.getElementById('projection-type');
  if (projType) {
    projType.removeEventListener('change', handleProjectionTypeChange);
    projType.addEventListener('change', handleProjectionTypeChange);
  }
}

function handleProjectionTypeChange(e) {
  currentView = e.target.value;
  loadProjections();
}

/* ----------------------- Main Export ----------------------- */

export default async function loadProjectionsPage() {
  if (!isInitialized) {
    setupEventListeners();
    isInitialized = true;
  }
  
  await loadProjections();
}
