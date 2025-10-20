// scripts/main.js
import { el } from './ui.js';

const toggleButton = document.getElementById('toggleSidebar');
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('overlay');
const contentWrapper = document.getElementById('content-wrapper');

toggleButton?.addEventListener('click', () => {
  sidebar.classList.toggle('visible');
  toggleButton.classList.toggle('open');
  overlay.classList.toggle('visible');
  contentWrapper.classList.toggle('blurred');
});
overlay?.addEventListener('click', () => {
  sidebar.classList.remove('visible');
  toggleButton.classList.remove('open');
  overlay.classList.remove('visible');
  contentWrapper.classList.remove('blurred');
});
document.querySelectorAll('.menu-item').forEach(item => {
  item.addEventListener('click', () => {
    sidebar.classList.remove('visible');
    toggleButton.classList.remove('open');
    overlay.classList.remove('visible');
    contentWrapper.classList.remove('blurred');
  });
});

const loaders = {
  rosters: () => import('./rosters.js').then(m => m.default()),
  standings: () => import('./standings.js').then(m => m.default()),
  matchups: () => import('./matchups.js').then(m => m.default()),
  transactions: () => import('./transactions.js').then(m => m.default()),
  drafts: () => import('./drafts.js').then(m => m.default()),
  history: () => import('./history.js').then(m => m.default()),
  scoreboard: () => import(`./scores.js?v=mirror1`).then(m => m.default({ pollMs: 20000 })),
};

export function showPage(id) {
  document.querySelectorAll("main section").forEach(sec => sec.classList.add("hidden"));
  document.getElementById(id)?.classList.remove("hidden");

  document.querySelectorAll('.menu-item').forEach(item => {
    item.classList.toggle('active', item.getAttribute('onclick')?.includes(id));
  });

  if (loaders[id]) loaders[id]();
}
window.showPage = showPage;   // keep inline onclicks working

// initial page
showPage('home');
