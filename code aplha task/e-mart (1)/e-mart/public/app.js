const $ = s => document.querySelector(s);
const app = $('#app');
const inr = n => '₹' + Number(n).toLocaleString('en-IN');
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let user = null, cart = JSON.parse(localStorage.getItem('emart_cart') || '[]'), category = '';

async function api(url, method = 'GET', body) {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 1800); }
function saveCart() { localStorage.setItem('emart_cart', JSON.stringify(cart)); renderNav(); }

function renderNav() {
  const count = cart.reduce((s, i) => s + i.qty, 0);
  $('#nav').innerHTML = `<a href="#/">Shop</a><a href="#/cart">Cart (${count})</a>` +
    (user ? `<a href="#/orders">Orders</a><span style="color:#ccc">Hi, ${esc(user.name.split(' ')[0])}</span><button id="logout">Logout</button>`
          : `<a href="#/login">Login</a><a href="#/register">Register</a>`);
  const lo = $('#logout');
  if (lo) lo.onclick = async () => { await api('/api/logout', 'POST'); user = null; renderNav(); location.hash = '#/'; };
}

function addToCart(p, qty = 1) {
  const line = cart.find(i => i.id === p.id);
  if (line) line.qty = Math.min(line.qty + qty, p.stock);
  else cart.push({ id: p.id, name: p.name, price: p.price, image: p.image, stock: p.stock, qty });
  saveCart(); toast(`${p.name} added to cart`);
}

// ---------- Views ----------
async function home() {
  const q = $('#search').value;
  const products = await api(`/api/products?q=${encodeURIComponent(q)}&category=${encodeURIComponent(category)}`);
  const cats = ['', 'Electronics', 'Fashion', 'Home', 'Books'];
  app.innerHTML = `<div class="filters">${cats.map(c => `<button class="chip ${c === category ? 'active' : ''}" data-c="${c}">${c || 'All'}</button>`).join('')}</div>
    <div class="grid">${products.map(p => `<div class="card"><div class="img">${p.image}</div>
      <a href="#/product/${p.id}">${esc(p.name)}</a><span class="muted">${esc(p.category)}</span>
      <span class="price">${inr(p.price)}</span>
      <button class="btn" data-add="${p.id}" ${p.stock ? '' : 'disabled'}>${p.stock ? 'Add to cart' : 'Out of stock'}</button></div>`).join('') || '<p>No products found.</p>'}</div>`;
  app.querySelectorAll('.chip').forEach(b => b.onclick = () => { category = b.dataset.c; home(); });
  app.querySelectorAll('[data-add]').forEach(b => b.onclick = () => addToCart(products.find(p => p.id == b.dataset.add)));
}

async function product(id) {
  const p = await api('/api/products/' + id);
  app.innerHTML = `<div class="detail"><div class="img">${p.image}</div><div>
    <h2>${esc(p.name)}</h2><p class="muted">${esc(p.category)}</p><p>${esc(p.description)}</p>
    <p class="price">${inr(p.price)}</p><p class="muted">${p.stock ? p.stock + ' in stock' : 'Out of stock'}</p>
    <p><label>Qty <input id="qty" type="number" min="1" max="${p.stock}" value="1" style="width:70px"></label></p>
    <button class="btn" id="add" ${p.stock ? '' : 'disabled'}>Add to cart</button>
    <a class="btn ghost" href="#/" style="text-decoration:none;display:inline-block;margin-left:8px">Back</a></div></div>`;
  $('#add').onclick = () => addToCart(p, Math.max(1, parseInt($('#qty').value) || 1));
}

function cartView() {
  if (!cart.length) { app.innerHTML = '<div class="panel">Your cart is empty. <a href="#/">Start shopping</a></div>'; return; }
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
  app.innerHTML = `<div class="panel wide"><h2>Your Cart</h2><table>
    <tr><th>Item</th><th>Price</th><th>Qty</th><th>Subtotal</th><th></th></tr>
    ${cart.map(i => `<tr><td>${i.image} ${esc(i.name)}</td><td>${inr(i.price)}</td>
      <td class="qty"><button data-d="${i.id}">−</button> ${i.qty} <button data-u="${i.id}">+</button></td>
      <td>${inr(i.price * i.qty)}</td><td><button data-r="${i.id}" class="chip">Remove</button></td></tr>`).join('')}</table>
    <h3 style="text-align:right">Total: ${inr(total)}</h3>
    <div style="text-align:right"><a class="btn" href="#/checkout" style="text-decoration:none">Checkout</a></div></div>`;
  const find = id => cart.find(i => i.id == id);
  app.querySelectorAll('[data-u]').forEach(b => b.onclick = () => { const i = find(b.dataset.u); if (i.qty < i.stock) i.qty++; saveCart(); cartView(); });
  app.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { const i = find(b.dataset.d); i.qty--; if (i.qty < 1) cart = cart.filter(x => x !== i); saveCart(); cartView(); });
  app.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { cart = cart.filter(x => x.id != b.dataset.r); saveCart(); cartView(); });
}

function checkout() {
  if (!user) { toast('Please log in to checkout'); location.hash = '#/login'; return; }
  if (!cart.length) { location.hash = '#/cart'; return; }
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
  app.innerHTML = `<div class="panel"><h2>Checkout</h2><p>${cart.length} item type(s) · Total <b>${inr(total)}</b></p>
    <form id="f"><textarea name="address" rows="3" placeholder="Shipping address" required></textarea>
    <p class="muted">Payment: Cash on Delivery</p><div class="error" id="err"></div>
    <button class="btn">Place order</button></form></div>`;
  $('#f').onsubmit = async e => {
    e.preventDefault();
    try {
      const r = await api('/api/orders', 'POST', { items: cart.map(i => ({ id: i.id, qty: i.qty })), address: e.target.address.value });
      cart = []; saveCart();
      app.innerHTML = `<div class="panel"><h2>🎉 Order placed!</h2><p>Your order number is <b>#${r.orderId}</b>.</p><a class="btn" href="#/orders" style="text-decoration:none">View orders</a></div>`;
    } catch (err) { $('#err').textContent = err.message; }
  };
}

async function orders() {
  if (!user) { location.hash = '#/login'; return; }
  const list = await api('/api/orders');
  app.innerHTML = `<div class="panel wide"><h2>My Orders</h2>${list.map(o => `<div class="order">
    <b>Order #${o.id}</b> · <span class="muted">${esc(o.created_at)}</span> · <b>${inr(o.total)}</b>
    <ul>${o.items.map(i => `<li>${esc(i.name)} × ${i.qty} — ${inr(i.price * i.qty)}</li>`).join('')}</ul>
    <span class="muted">Ship to: ${esc(o.address)}</span></div>`).join('') || '<p>No orders yet.</p>'}</div>`;
}

function authView(mode) {
  const reg = mode === 'register';
  app.innerHTML = `<div class="panel"><h2>${reg ? 'Create account' : 'Login'}</h2><form id="f">
    ${reg ? '<input name="name" placeholder="Full name" required>' : ''}
    <input name="email" type="email" placeholder="Email" required>
    <input name="password" type="password" placeholder="Password (min 6 chars)" required minlength="6">
    <div class="error" id="err"></div><button class="btn">${reg ? 'Register' : 'Login'}</button></form>
    <p class="muted">${reg ? 'Have an account? <a href="#/login">Login</a>' : 'New here? <a href="#/register">Register</a>'}</p></div>`;
  $('#f').onsubmit = async e => {
    e.preventDefault();
    try {
      await api('/api/' + mode, 'POST', Object.fromEntries(new FormData(e.target)));
      user = await api('/api/me'); renderNav(); location.hash = '#/';
    } catch (err) { $('#err').textContent = err.message; }
  };
}

// ---------- Router ----------
async function route() {
  const [, page, id] = (location.hash || '#/').split('/');
  try {
    if (page === 'product') await product(id);
    else if (page === 'cart') cartView();
    else if (page === 'checkout') checkout();
    else if (page === 'orders') await orders();
    else if (page === 'login' || page === 'register') authView(page);
    else await home();
  } catch (e) { app.innerHTML = `<div class="panel">${esc(e.message)}</div>`; }
}
$('#search').addEventListener('input', () => { if (location.hash && location.hash !== '#/') location.hash = '#/'; else home(); });
window.addEventListener('hashchange', route);
(async () => { user = await api('/api/me'); renderNav(); route(); })();
