// ui.js – shared UI helpers
// --- Name / avatar helpers ---
export const HIDDEN_USERS = {
  "jewishpoosayslay": "Eitan's Team",
};

export function sanitizeName(name) {
  if (!name) return name;
  return HIDDEN_USERS[name] || name;
}

export function avatarURL(avatarId, thumb = false) {
  if (!avatarId) return null;
  return `https://sleepercdn.com/avatars/${thumb ? 'thumbs/' : ''}${avatarId}`;
}

export function avatarURLSafe(u) {
  return u?.avatar ? avatarURL(u.avatar, true) : null;
}

export function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else e.setAttribute(k, v);
  });
  children.forEach(c => e.append(c));
  return e;
}

export function escapeHtml(s = '') {
  return s.replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function shortName(name, max = 16) {
  if (!name) return '';
  return name.length > max ? name.slice(0, max - 1) + '…' : name;
}

export function teamNameFromUser(u) {
  // (your old file had no return; fixing that bug)
  return sanitizeName((u?.metadata?.team_name) || u?.display_name || '—');
}

export function posClass(pos) {
  const p = (pos || 'UNK').toUpperCase();
  return ['QB', 'RB', 'WR', 'TE', 'K', 'DST'].includes(p) ? `pos-${p}` : 'pos-UNK';
}

// ==========================
// Theme control
// ==========================
export function applyTheme(theme) {
  const root = document.documentElement; // <html>
  if (theme === 'dark') root.setAttribute('data-theme', 'dark');
  else root.removeAttribute('data-theme');
}

export function initTheme() {
  try {
    const stored = localStorage.getItem('theme');
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    const theme = stored ?? (prefersDark ? 'dark' : 'light');
    applyTheme(theme);
  } catch {
    // localStorage can fail in some privacy modes; fall back to system
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    applyTheme(prefersDark ? 'dark' : 'light');
  }
}

export function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const next = isDark ? 'light' : 'dark';
  try { localStorage.setItem('theme', next); } catch {}
  applyTheme(next);
}
