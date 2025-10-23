// main.js – shell, routing, theme
import { el, initTheme, toggleTheme } from './ui.js';

/* ---------- Navigation + active state (top level) ---------- */
const navLinks = Array.from(document.querySelectorAll('.sb-nav a[data-route], .menu-item[data-route]'));

function setActive(route) {
  navLinks.forEach(a => a.classList.toggle('active', a.dataset.route === route));
}

/* Expose showPage globally (no export inside a block) */
function showPage(id) {
  document.querySelectorAll('main section').forEach(sec => sec.classList.add('hidden'));
  document.getElementById(id)?.classList.remove('hidden');
  setActive(id);
}
window.showPage = showPage;

/* ---------- Boot ---------- */
document.addEventListener('DOMContentLoaded', () => {
  // 3) Sidebar wiring
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('overlay');
  const contentWrapper = document.getElementById('content-wrapper');
  const toggleButtons = Array.from(document.querySelectorAll('#toggleSidebar'));

  function closeSidebar() {
    sidebar?.classList.remove('visible');
    overlay?.classList.remove('visible');
    contentWrapper?.classList.remove('blurred');
    toggleButtons.forEach(b => b.classList.remove('open'));
  }

  function toggleSidebar() {
    const open = !sidebar?.classList.contains('visible');
    sidebar?.classList.toggle('visible', open);
    overlay?.classList.toggle('visible', open);
    contentWrapper?.classList.toggle('blurred', open);
    toggleButtons.forEach(b => b.classList.toggle('open', open));
  }

  toggleButtons.forEach(b => b.addEventListener('click', toggleSidebar));
  overlay?.addEventListener('click', closeSidebar);
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSidebar(); });

  // 4) Route loaders
  const loaders = {
    home: () => import('./homepage.js').then(m => m.default()),
    scoreboard: () => import('./scores.js?v=mirror1').then(m => m.default({ pollMs: 20000 })),
    rosters: () => import('./rosters.js').then(m => m.default()),
    standings: () => import('./standings.js').then(m => m.default()),
    matchups: () => import('./matchups.js').then(m => m.default()),
    transactions: () => import('./transactions.js').then(m => m.default()),
    drafts: () => import('./drafts.js').then(m => m.default()),
    playoffs: () => import('./playoffs.js').then(m => m.default()),
    history: () => import('./history.js').then(m => m.default()),
    about: async () => renderAbout(),
  };

  // 5) Small view helpers
  function renderAbout() {
    const main = document.getElementById('main-content');
    if (!main) return;
    if (!document.getElementById('about')) {
      const html = `
        <section class="container" id="about">
          <h1 class="display">About</h1>
          <p>Info about the site.</p>
        </section>`;
      main.insertAdjacentHTML('beforeend', html);
    }
  }

  async function navigate(route) {
    // Close sidebar on navigation
    closeSidebar();

    // Update URL hash for back/forward
    const nextHash = `#/${route}`;
    if (location.hash !== nextHash) history.pushState({ route }, '', nextHash);

    // Reveal legacy section if present
    showPage(route);

    // Run loader
    const loader = loaders[route] || loaders.home;
    try {
      await loader();
    } catch (err) {
      console.error('Route load failed:', err);
    }
  }

  // Intercept sidebar link clicks
  navLinks.forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const route = a.dataset.route || 'home';
      navigate(route);
    });
  });

  // Back/forward buttons
  window.addEventListener('popstate', (e) => {
    const route = e.state?.route || location.hash.replace(/^#\//, '') || 'home';
    setActive(route);
    showPage(route);
    const loader = loaders[route] || loaders.home;
    loader().catch(console.error);
  });

  // 6) Initial route
  const initial = location.hash.replace(/^#\//, '') || 'home';
  setActive(initial);
  showPage(initial);
  (loaders[initial] || loaders.home)().catch(console.error);
});
