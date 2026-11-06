# E-Mart 🛒
Full-stack e-commerce app: Express.js + SQLite + vanilla HTML/CSS/JS.

## Features
- Product listing with search and category filters
- Product details page
- Shopping cart (persisted in the browser)
- User registration / login (bcrypt-hashed passwords, session cookies)
- Order processing (server re-checks prices and stock in a transaction)
- Order history

## Run
```
npm install
npm start
```
Open http://localhost:3000 (sample products are seeded on first run).
Set `SESSION_SECRET` and `PORT` environment variables for production.

## Structure
- `server.js` – API, SQLite schema, seed data
- `public/` – frontend (`index.html`, `style.css`, `app.js`)
- `emart.db` – created automatically

## API
GET /api/products, GET /api/products/:id, POST /api/register, POST /api/login, POST /api/logout, GET /api/me, POST /api/orders, GET /api/orders
