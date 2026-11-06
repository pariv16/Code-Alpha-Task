const $ = s => document.querySelector(s);
const app = $('#app');
let me = null, tab = 'explore';

const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ago = d => { const s = (Date.now() - new Date(d.replace(' ', 'T') + 'Z')) / 1000; return s < 60 ? 'just now' : s < 3600 ? Math.floor(s / 60) + 'm' : s < 86400 ? Math.floor(s / 3600) + 'h' : Math.floor(s / 86400) + 'd'; };
const avatar = (n, big) => `<span class="avatar ${big ? 'big' : ''}">${esc(n[0].toUpperCase())}</span>`;
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 1800); }

async function api(url, method = 'GET', body) {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}
const needLogin = () => { if (!me) { toast('Please log in first'); location.hash = '#/login'; return true; } };

function renderNav() {
  $('#nav').innerHTML = `<a href="#/">Home</a><a href="#/people">People</a>` +
    (me ? `<a href="#/u/${me.username}">@${esc(me.username)}</a><button id="lo">Logout</button>` : `<a href="#/login">Login</a><a href="#/register">Sign up</a>`);
  if (me) $('#lo').onclick = async () => { await api('/api/logout', 'POST'); me = null; tab = 'explore'; renderNav(); location.hash = '#/'; route(); };
}

function postHTML(p, full) {
  return `<div class="box"><div class="post-head">${avatar(p.name)}<div><a href="#/u/${p.username}">${esc(p.name)}</a>
    <div class="muted">@${esc(p.username)} · ${ago(p.created_at)}</div></div></div>
    <div class="content">${esc(p.content)}</div>
    <div class="actions"><button data-like="${p.id}" class="${p.liked ? 'liked' : ''}">${p.liked ? '❤️' : '🤍'} <span>${p.likes}</span></button>
    ${full ? `<span class="muted">💬 ${p.comments}</span>` : `<a href="#/post/${p.id}">💬 ${p.comments}</a>`}
    ${me && me.username === p.username ? `<button data-del="${p.id}">🗑 Delete</button>` : ''}</div></div>`;
}
function bindPosts(refresh) {
  app.querySelectorAll('[data-like]').forEach(b => b.onclick = async () => {
    if (needLogin()) return;
    const r = await api(`/api/posts/${b.dataset.like}/like`, 'POST');
    b.className = r.liked ? 'liked' : ''; b.innerHTML = `${r.liked ? '❤️' : '🤍'} <span>${r.likes}</span>`;
  });
  app.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    if (!confirm('Delete this post?')) return;
    await api('/api/posts/' + b.dataset.del, 'DELETE'); toast('Post deleted');
    if (location.hash.startsWith('#/post/')) location.hash = '#/'; else refresh();
  });
}

async function home() {
  if (!me) tab = 'explore';
  const posts = await api('/api/posts?feed=' + (tab === 'following' ? 'following' : 'all'));
  app.innerHTML = `${me ? `<div class="box"><form id="pf"><textarea id="txt" rows="3" maxlength="280" placeholder="What's buzzing, ${esc(me.name.split(' ')[0])}?"></textarea>
    <div class="row" style="justify-content:space-between;align-items:center"><span class="muted" id="cnt">0/280</span><button class="btn">Post</button></div></form></div>
    <div class="tabs"><button class="tab ${tab === 'explore' ? 'active' : ''}" data-t="explore">Explore</button><button class="tab ${tab === 'following' ? 'active' : ''}" data-t="following">Following</button></div>`
    : '<div class="box">👋 <a href="#/register">Join Buzzly</a> to post, like, comment and follow people.</div>'}
    ${posts.map(p => postHTML(p)).join('') || '<div class="box muted">Nothing here yet. Follow people or write the first post!</div>'}`;
  if (me) {
    $('#txt').oninput = e => $('#cnt').textContent = e.target.value.length + '/280';
    $('#pf').onsubmit = async e => { e.preventDefault(); try { await api('/api/posts', 'POST', { content: $('#txt').value }); home(); } catch (err) { toast(err.message); } };
    app.querySelectorAll('.tab').forEach(b => b.onclick = () => { tab = b.dataset.t; home(); });
  }
  bindPosts(home);
}

async function postPage(id) {
  const p = await api('/api/posts/' + id);
  app.innerHTML = `<p><a href="#/">← Back</a></p>${postHTML(p, true)}
    <div class="box"><h3>Comments</h3>
    ${me ? `<form id="cf" class="row"><input id="ct" maxlength="200" placeholder="Write a comment…" required><button class="btn">Reply</button></form>` : '<p class="muted"><a href="#/login">Log in</a> to comment.</p>'}
    ${p.comments_list.map(c => `<div class="comment"><b><a href="#/u/${c.username}" style="color:inherit;text-decoration:none">${esc(c.name)}</a></b> <span class="muted">@${esc(c.username)} · ${ago(c.created_at)}</span><div>${esc(c.content)}</div></div>`).join('') || '<p class="muted">No comments yet.</p>'}</div>`;
  if (me) $('#cf').onsubmit = async e => { e.preventDefault(); try { await api(`/api/posts/${id}/comments`, 'POST', { content: $('#ct').value }); postPage(id); } catch (err) { toast(err.message); } };
  bindPosts(() => postPage(id));
}

async function profile(username) {
  const u = await api('/api/users/' + username);
  const mine = me && me.id === u.id;
  app.innerHTML = `<div class="box"><div class="profile">${avatar(u.name, true)}<div style="flex:1"><h2 style="margin:0">${esc(u.name)}</h2>
    <div class="muted">@${esc(u.username)}</div><p>${esc(u.bio) || '<span class="muted">No bio yet.</span>'}</p></div>
    ${mine ? '<button class="btn outline" id="edit">Edit profile</button>' : `<button class="btn ${u.isFollowing ? 'outline' : ''}" id="fol">${u.isFollowing ? 'Following' : 'Follow'}</button>`}</div>
    <div class="stats"><span><b>${u.posts}</b> posts</span><span><b id="fc">${u.followers}</b> followers</span><span><b>${u.following}</b> following</span></div></div>
    <div id="editbox"></div>${u.posts_list.map(p => postHTML(p)).join('') || '<div class="box muted">No posts yet.</div>'}`;
  if (!mine) $('#fol').onclick = async () => { if (needLogin()) return; try { await api(`/api/users/${username}/follow`, 'POST'); profile(username); } catch (e) { toast(e.message); } };
  else $('#edit').onclick = () => {
    $('#editbox').innerHTML = `<div class="box"><form id="ef"><input name="name" value="${esc(u.name)}" maxlength="40" required>
      <textarea name="bio" rows="3" maxlength="160" placeholder="Bio">${esc(u.bio)}</textarea><button class="btn">Save</button></form></div>`;
    $('#ef').onsubmit = async e => { e.preventDefault(); const d = Object.fromEntries(new FormData(e.target)); await api('/api/me', 'PUT', d); me = await api('/api/me'); renderNav(); profile(username); toast('Profile updated'); };
  };
  bindPosts(() => profile(username));
}

async function people() {
  const q = ($('#pq') || {}).value || '';
  const list = await api('/api/users?q=' + encodeURIComponent(q));
  if (!$('#pq')) app.innerHTML = '<div class="box"><input id="pq" placeholder="Search people…" style="width:100%"></div><div id="pl"></div>';
  $('#pq').oninput = people;
  $('#pl').innerHTML = list.map(u => `<div class="box person">${avatar(u.name)}<a href="#/u/${u.username}"><b>${esc(u.name)}</b> <span class="muted">@${esc(u.username)} · ${u.followers} followers</span><div>${esc(u.bio)}</div></a></div>`).join('') || '<div class="box muted">No one found.</div>';
}

function authView(mode) {
  const reg = mode === 'register';
  app.innerHTML = `<div class="box"><h2>${reg ? 'Join Buzzly' : 'Welcome back'}</h2><form id="f">
    ${reg ? '<input name="name" placeholder="Full name" required maxlength="40">' : ''}
    <input name="username" placeholder="Username" required maxlength="20">
    <input name="password" type="password" placeholder="Password (min 6 chars)" required minlength="6">
    <div class="error" id="err"></div><button class="btn">${reg ? 'Sign up' : 'Log in'}</button></form>
    <p class="muted">${reg ? 'Already a member? <a href="#/login">Log in</a>' : 'New here? <a href="#/register">Sign up</a>'}</p></div>`;
  $('#f').onsubmit = async e => {
    e.preventDefault();
    try { await api('/api/' + mode, 'POST', Object.fromEntries(new FormData(e.target))); me = await api('/api/me'); renderNav(); location.hash = '#/'; }
    catch (err) { $('#err').textContent = err.message; }
  };
}

async function route() {
  const [, page, arg] = (location.hash || '#/').split('/');
  try {
    if (page === 'post') await postPage(arg);
    else if (page === 'u') await profile(arg);
    else if (page === 'people') { app.innerHTML = ''; await people(); }
    else if (page === 'login' || page === 'register') authView(page);
    else await home();
  } catch (e) { app.innerHTML = `<div class="box">${esc(e.message)}</div>`; }
}
window.addEventListener('hashchange', route);
(async () => { me = await api('/api/me'); renderNav(); route(); })();
