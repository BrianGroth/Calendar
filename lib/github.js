/* ==============================================
File: lib/github.js
Exposes: window.GitHubAPI { getFile, putFile }
----------------------------------------------
- Uses GitHub Contents API
- Token is optional for GET (private repos need it), required for PUT
- getFile returns { content: string, sha: string } | null
- putFile creates/updates the file with a commit message
============================================== */


;(function(){
const BASE = 'https://api.github.com';


function redactToken(msg){
return String(msg || '').replace(/ghp_[A-Za-z0-9]+/g,'***');
}


function headers(token){
const h = { 'Accept': 'application/vnd.github+json' };
if (token) h['Authorization'] = 'token ' + token;
return h;
}


function base64EncodeUTF8(str){
// robust UTF‑8 -> base64 without call stack overflow on large strings
const enc = new TextEncoder();
const bytes = enc.encode(str);
let binary = '';
const chunk = 0x8000;
for (let i=0; i<bytes.length; i+=chunk){
binary += String.fromCharCode.apply(null, bytes.subarray(i, i+chunk));
}
return btoa(binary);
}


function base64DecodeUTF8(b64){
const binary = atob(b64 || '');
const len = binary.length;
const bytes = new Uint8Array(len);
for (let i=0; i<len; i++) bytes[i] = binary.charCodeAt(i);
const dec = new TextDecoder();
return dec.decode(bytes);
}


async function getFile(owner, repo, path, token){
const url = `${BASE}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
const resp = await fetch(url, { headers: headers(token) });
if (resp.status === 404) return null;
if (!resp.ok){
const t = await resp.text();
throw new Error(`GET contents failed: ${resp.status} ${redactToken(t)}`);
}
const j = await resp.json();
const content = j.content && j.encoding === 'base64' ? base64DecodeUTF8(j.content) : '';
return { content, sha: j.sha || null };
}


async function putFile(owner, repo, path, content, sha, token, message){
if (!token) throw new Error('Missing token');
const url = `${BASE}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
const body = {
message: message || `chore: update ${path}`,
content: base64EncodeUTF8(content || ''),
branch: 'main'
};
if (sha) body.sha = sha;


const resp = await fetch(url, {
method: 'PUT',
headers: {
...headers(token),
'Content-Type': 'application/json'
},
body: JSON.stringify(body)
});


if (!resp.ok){
const t = await resp.text();
throw new Error(`PUT contents failed: ${resp.status} ${redactToken(t)}`);
}
return resp.json();
}


window.GitHubAPI = { getFile, putFile };
})();
