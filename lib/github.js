// Minimal helpers for settings + GitHub Contents API commits.
// All secrets are kept in localStorage (browser-only).

const LS_KEY = 'calendar_settings_v1';

export function getSettings() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY)) || {};
  } catch {
    return {};
  }
}

export function setSettings(settings) {
  localStorage.setItem(LS_KEY, JSON.stringify(settings));
}

export function clearSettings() {
  localStorage.removeItem(LS_KEY);
}

// Status helper
export function setStatus(msg, isError = false) {
  const el = document.getElementById('statusBar');
  if (!el) return;
  el.textContent = msg;
  el.style.color = isError ? '#b91c1c' : 'inherit';
}

// GitHub Contents API
// GET file -> { content (string), sha } or null if 404
export async function getFile(owner, repo, path, token) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
  const res = await fetch(url, {
    headers: token ? { Authorization: `token ${token}` } : {},
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`GitHub getFile failed (${res.status}).`);
  }
  const json = await res.json();
  const content = atob(json.content.replace(/\n/g, ''));
  return { content, sha: json.sha };
}

// PUT file (create or update)
export async function putFile({ owner, repo, path, content, sha, token, message }) {
  if (!token) throw new Error('Missing GitHub token. Add it in Settings.');
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
  const body = {
    message,
    content: btoa(unescape(encodeURIComponent(content))), // UTF-8 → base64
    branch: 'main',
  };
  if (sha) body.sha = sha;

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `token ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (res.status === 409 || res.status === 412) {
    throw new Error('Conflict saving file. Please try again.');
  }
  if (!res.ok) {
    throw new Error(`GitHub putFile failed (${res.status}).`);
  }
  return await res.json();
}
