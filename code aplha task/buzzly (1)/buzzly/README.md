# Buzzly 🐝
Mini social media platform: Express.js + SQLite + vanilla HTML/CSS/JS.

## Features
- Register / login (bcrypt + session cookies)
- User profiles with bio editing, post/follower/following counts
- Posts (280 chars), delete your own posts
- Comments on posts
- Likes (toggle)
- Follow / unfollow, "Following" feed + "Explore" feed
- People search

## Run
```
npm install
npm start
```
Open http://localhost:3000. Set `SESSION_SECRET` and `PORT` env vars in production.

## Database (SQLite, auto-created as buzzly.db)
users, posts, comments, likes, follows

## API
POST /api/register | /api/login | /api/logout, GET/PUT /api/me,
GET /api/users?q=, GET /api/users/:username, POST /api/users/:username/follow,
GET/POST /api/posts, GET/DELETE /api/posts/:id,
POST /api/posts/:id/comments, POST /api/posts/:id/like
