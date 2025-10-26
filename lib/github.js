/*
 * GitHub API helper for the calendar application.
 *
 * The functions in this module wrap the GitHub Contents API so that the
 * application can read and write JSON data files without exposing secrets or
 * having to commit compiled assets.  All functions accept an owner, repo
 * and path.  The personal access token (PAT) must be supplied by the user
 * through the settings page; it is stored in localStorage and passed to
 * these functions at runtime.  No token is ever logged to the console or
 * committed to the repository.
 */

// Helper to base64‑encode Unicode strings.  btoa() alone cannot handle
// non‑ASCII characters; this helper first converts the string into a
// UTF‑8 encoded representation.
function base64Encode(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

// Helper to base64‑decode Unicode strings.
function base64Decode(str) {
  return decodeURIComponent(escape(atob(str)));
}

/**
 * Fetch a file from GitHub via the contents API.
 *
 * @param {string} owner The repository owner
 * @param {string} repo The repository name
 * @param {string} path The file path within the repository
 * @param {string} token Optional PAT for authentication; required for private repos
 * @returns {Promise<{content: string, sha: string}|null>} Returns null if the file is not found
 */
export async function getFile(owner, repo, path, token) {
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodeURIComponent(path)}?ref=main`;
  const headers = {
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const resp = await fetch(url, { headers });
  if (resp.status === 404) return null;
  if (!resp.ok) {
    console.warn('GitHub getFile failed', resp.status, await resp.text());
    throw new Error(`Failed to get ${path}`);
  }
  const data = await resp.json();
  if (!data || !data.content) return null;
  return {
    content: base64Decode(data.content),
    sha: data.sha
  };
}

/**
 * Create or update a file in the GitHub repository via the contents API.
 *
 * If `sha` is provided the file will be updated, otherwise it will be created.
 * The call automatically retries once if there is a 409/412 conflict due to
 * concurrent modification.  The token must have `repo` scope.
 *
 * @param {string} owner The repository owner
 * @param {string} repo The repository name
 * @param {string} path Path to the file to write
 * @param {string} content Raw (utf‑8) file contents
 * @param {string|null} sha Current blob SHA (or null if creating)
 * @param {string} token PAT for authentication
 * @param {string} message Commit message
 */
export async function putFile(owner, repo, path, content, sha, token, message) {
  if (!token) throw new Error('Missing GitHub token');
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodeURIComponent(path)}`;
  const body = {
    message: message,
    content: base64Encode(content),
    branch: 'main'
  };
  if (sha) body.sha = sha;
  const headers = {
    'Accept': 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Authorization': `Bearer ${token}`
  };
  const resp = await fetch(url, { method: 'PUT', headers, body: JSON.stringify(body) });
  if (resp.ok) {
    return await resp.json();
  }
  // Conflict: ref changed or file out of date.  Fetch new sha and retry once.
  if (resp.status === 409 || resp.status === 412) {
    const existing = await getFile(owner, repo, path, token);
    const newSha = existing ? existing.sha : undefined;
    const retryBody = { ...body };
    if (newSha) retryBody.sha = newSha;
    const retry = await fetch(url, { method: 'PUT', headers, body: JSON.stringify(retryBody) });
    if (!retry.ok) {
      console.warn('GitHub putFile retry failed', retry.status, await retry.text());
      throw new Error('Failed to write file after retry');
    }
    return await retry.json();
  }
  const text = await resp.text();
  console.warn('GitHub putFile failed', resp.status, text);
  throw new Error('Failed to write file');
}