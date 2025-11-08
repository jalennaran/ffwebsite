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

/* ----------------------- Name Corrections ----------------------- */

// Map of real names to Sleeper display names
const nameCorrections = {
  'John Stafford': 'Matthew Stafford',
  'Rayne Prescott': 'Dak Prescott',
  'Joseph Flacco': 'Joe Flacco',
  'Joshua Jacobs': 'Josh Jacobs',
  'Michael Jones': 'Mac Jones',
  'Cameron Ward' : 'Cam Ward',
  'Jonathan McCarthy': 'JJ McCarthy',
  'Joshua Downs': 'Josh Downs',
  'Eugene Smith' : 'Geno Smith',
  'Xavien Flowers' : 'Zay Flowers',
  'Charles Robinson': "Wan'dale Robinson",
  'Andrew McConkey' : 'Ladd McConkey',
  'Jkaylin Dobbins' : 'J.K. Dobbins',
  'Tamaurice Higgins' : 'Tee Higgins',
  'Bennie Jennings' : 'Juaun Jennings',
  'DeKaylin Metcalf' : 'DK Metcalf',
  'Zachary Ertz' : 'Zach Ertz',
  'Marquise Brown' : 'Hollywood Brown',
  'Theodore Johnson' : 'Theo Johnson',
  'Tyshun Samuel' : 'Deebo Samuel',
  'Thomas Hockenson' : 'T.J. Hockenson',
  'Nicholas Chubb': 'Nick Chubb',
  'Cedarian Lamb' : 'CeeDee Lamb',
  'Christopher Washington' : 'PJ Washington',
  "Jo'Quavious Marks" : "Woody Marks",
  'Robert Harvey' : 'RJ Harvey',
  'Cartavious Bigsby' : 'Tank Bigsby',
  'Cleveland Harris' : 'Tre Harris',
  "ReMahn Davis" : 'Ray Davis',
  'Vanchii Jefferson' : 'Van Jefferson',
  'Coleridge Stroud' : 'C.J. Stroud',
  'Cameron Skatteborg' : 'Cam Skattebo',
  "Mar'Keise Irving" : "Bucky Irving",
 };

function correctPlayerName(name) {
  // Check if this name needs correction
  if (nameCorrections[name]) {
    return nameCorrections[name];
  }
  return name;
}

/* ----------------------- CSV Parsing ----------------------- */

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  
  return result.map(val => val.trim());
}

function parseCSV(text) {
  const lines = text.trim().split('\n');
  const headers = parseCSVLine(lines[0]);
  
  return lines.slice(1).map(line => {
    const values = parseCSVLine(line);
    const player = {};
    headers.forEach((header, index) => {
      player[header.trim()] = values[index]?.trim() || '';
    });
    
    // Correct player names if needed
    if (player.player_display_name) {
      player.player_display_name = correctPlayerName(player.player_display_name);
    }
    if (player.player_name) {
      player.player_name = correctPlayerName(player.player_name);
    }
    
    // For rest of season, use ros_projected_points as the main value
    if (player.ros_projected_points) {
      player.display_points = player.ros_projected_points;
      player.sort_points = player.avg_weekly_projection || player.ros_projected_points;
    } else {
      player.display_points = player.projected_points;
      player.sort_points = player.projected_points;
    }
    
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
  // For ROS view, show total projected points; for next week, show weekly projection
  const isROS = currentView === 'rest-of-season';
  const projectedPts = parseFloat(player.display_points || 0).toFixed(1);
  const ptsLabel = isROS ? 'total' : 'pts';
  
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
      <span class="stat-label">${ptsLabel}</span>
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
  const isROS = currentView === 'rest-of-season';
  const projectedLabel = isROS ? 'ROS Total' : 'Projected';
  
  const header = el('div', { class: 'proj-header-row' });
  header.innerHTML = `
    <div class="proj-rank">Rank</div>
    <div class="proj-pos">Pos</div>
    <div class="proj-player">Player</div>
    <div class="proj-stat proj-pts">${projectedLabel}</div>
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
    
    // Sort by sort_points (which is avg weekly for ROS, or projected for next week)
    allProjections.sort((a, b) => {
      const aPoints = parseFloat(a.sort_points) || 0;
      const bPoints = parseFloat(b.sort_points) || 0;
      return bPoints - aPoints;
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
