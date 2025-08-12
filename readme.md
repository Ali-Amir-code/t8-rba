# Project README — Node.js Auth + RBAC API

> **Overview:** This backend implements a secure authentication and role-based authorization system using **Node.js**, **Express**, and **MongoDB (Mongoose)**.
> Features include: registration with email verification, login with JWT access + refresh tokens, refresh & logout flows, password reset (single-use token), role-based permissions (`Admin`, `Editor`, `Viewer`), user management (Admin-only), profile management, and simple content CRUD with ownership rules. It also implements token storage for revocation and single-use flows for verification/reset tokens.

---

## Table of contents

1. [Quick start](#quick-start)
2. [Environment variables (.env)](#environment-variables-env)
3. [How the system works (token flows & roles)](#how-the-system-works-token-flows--roles)
4. [Data models (DB schemas)](#data-models-db-schemas)
5. [API endpoints — full documentation with examples](#api-endpoints---full-documentation-with-examples)

   * Auth endpoints
   * Profile endpoints
   * User management (Admin)
   * Content endpoints
6. [Error handling & response conventions](#error-handling--response-conventions)
7. [Admin bootstrap / create first admin](#admin-bootstrap--create-first-admin)
8. [Security notes & recommendations](#security-notes--recommendations)
9. [Testing examples (curl)](#testing-examples-curl)
10. [Deployment notes & production checklist](#deployment-notes--production-checklist)
11. [Appendix: token and token DB details](#appendix-token-and-token-db-details)

---

# Quick start

1. Clone the repo and install:

```bash
git clone https://github.com/t8-rba.git
cd t8-rba
npm install
```

2. Copy `.env.sample` → `.env` and fill values (see next section).

3. Run locally:

```bash
npm run dev    # requires nodemon (dev)
# or
npm start
```

4. API base by default: `http://localhost:4000/api` (set `BASE_URL` in `.env` accordingly).

---

# Environment variables (`.env`)

Required (examples):

```
PORT=4000
MONGO_URI=mongodb://localhost:27017/auth_rbac_db
JWT_ACCESS_SECRET=replace_with_secure_random_string
JWT_REFRESH_SECRET=replace_with_secure_random_string_for_refresh
ACCESS_TOKEN_EXPIRES=15m
REFRESH_TOKEN_EXPIRES=7d
EMAIL_FROM=your@email.com
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your_smtp_user
SMTP_PASS=your_smtp_pass
BASE_URL=http://localhost:4000
```

Notes:

* If SMTP\_\* not provided, the app logs verification/reset emails to the server console (useful for development).
* Use long random secrets for `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`.

---

# How the system works (token flows & roles)

**Roles**

* `Admin` — full access, can manage users (list, change role, soft-delete).
* `Editor` — create, view, update their own content (and update content if permitted).
* `Viewer` — read-only access to public content.

**Authentication tokens**

* **Access token (JWT)**: short-lived (default 15 minutes). Contains user data in payload: `{ id, role, email }`. Sent in `Authorization: Bearer <accessToken>`.
* **Refresh token (JWT)**: long-lived (default 7 days). Contains `{ userId, tokenId }`. Stored server-side in `tokens` collection (a document per refresh token). Used to obtain new access & refresh tokens.
* **One-time tokens** (email verification, password reset): random token string hashed in DB (`tokenHash`). Token is single-use (marked `used: true` once consumed) and short expiry (verify \~24h, reset \~1h in the provided code).

**Key flows**

* **Register**: Creates `User` with role `Viewer` by default and sends verification email (one-time token).
* **Verify Email**: `GET /api/auth/verify-email?token=...&email=...` → sets `emailVerified: true`.
* **Login**: Validated credentials + `emailVerified` required → generates `accessToken` and `refreshToken`. A `tokens` document is created for refresh token.
* **Token Refresh**: `POST /api/auth/token` with `refreshToken` → verify JWT, ensure tokenId exists & not revoked & not expired → issue new access & refresh tokens, revoke old refresh token in DB.
* **Logout**: `POST /api/auth/logout` with `refreshToken` → revoke refresh token in DB.
* **Password Reset**:

  * `POST /api/auth/forgot-password` → create single-use reset token & email link.
  * `POST /api/auth/reset-password` with `{token,email,password}` → verify reset token, set new hashed password, mark reset token used, revoke existing refresh tokens for that user.
* **Role change**: `PUT /api/users/:id/role` (Admin only). Recommended: revoke user's refresh tokens on role change (we include/recommend this pattern).

---

# Data models (MongoDB / Mongoose)

## `User` model (collection `users`)

Fields:

```js
{
  _id: ObjectId,
  name: String,            // required
  email: String,           // unique, required
  password: String,        // bcrypt hashed
  role: String,            // enum: ["Admin","Editor","Viewer"], default "Viewer"
  emailVerified: Boolean,  // default false
  lastLoginAt: Date,
  isDeleted: Boolean,      // soft-delete flag
  createdAt: Date,
  updatedAt: Date
}
```

## `Token` model (collection `tokens`)

Used for refresh tokens and one-time tokens (verify/reset).
Fields:

```js
{
  _id: ObjectId,
  tokenId: String,     // uuid for refresh tokens
  tokenHash: String,   // hashed single-use token (verify/reset)
  user: ObjectId,      // reference to User
  type: String,        // enum: ["refresh","verify","reset"]
  expiresAt: Date,
  revoked: Boolean,    // for refresh tokens
  used: Boolean,       // for one-time tokens
  createdAt: Date,
  updatedAt: Date
}
```

## `Content` model (collection `contents`)

```js
{
  _id: ObjectId,
  title: String,
  body: String,
  author: ObjectId,   // ref User
  isDeleted: Boolean, // soft-delete flag
  createdAt: Date,
  updatedAt: Date
}
```

---

# API endpoints — full documentation with examples

Base URL: `{{BASE_URL}}/api` (e.g. `http://localhost:4000/api`)

Responses are JSON. Standard success codes: `200`, `201`. Errors return appropriate HTTP status: `400` (bad request), `401` (unauthorized), `403` (forbidden), `404` (not found), `500` (server error).

---

## `Auth` routes

### `POST /api/auth/register`

* Public.
* Request body (JSON):

```json
{
  "name": "Ali Amir",
  "email": "ali@example.com",
  "password": "StrongPassword123!"
}
```

* Validation: `name` ≥2 chars, `email` valid, `password` strong (express-validator `.isStrongPassword()` with minLength 8).
* Behavior: Creates a user with `role: "Viewer"`, `emailVerified: false`. Creates a verification token and sends email (or logs link to console).
* Response (201):

```json
{ "message": "Registered. Please check email to verify your account." }
```

---

### `GET /api/auth/verify-email?token=<token>&email=<email>`

* Public.
* Query params: `token`, `email`.
* Behavior: Finds the token hashed in DB; if valid and not expired/used, sets `emailVerified: true` and marks token `used`.
* Success (200):

```json
{ "message": "Email verified. You can now login." }
```

* Errors: `400` invalid/expired token.

---

### `POST /api/auth/login`

* Public.
* Request body:

```json
{ "email": "ali@example.com", "password": "StrongPassword123!" }
```

* Behavior: Validates credentials, ensures `emailVerified === true`. On success:

  * Creates a refresh token (JWT) with a `tokenId` recorded in `tokens` collection.
  * Issues `accessToken` and `refreshToken`.
  * Updates `lastLoginAt`.
* Success (200):

```json
{
  "accessToken": "eyJhbGciOiJI...",
  "refreshToken": "eyJhbGciOiJI..."
}
```

* Errors: `400` invalid creds, `401` email not verified.

---

### `POST /api/auth/logout`

* Protected for caller to pass `refreshToken` to revoke it (public endpoint but expects body).
* Body:

```json
{ "refreshToken": "<jwt-refresh-token>" }
```

* Behavior: Verifies refresh token and marks corresponding token document `revoked: true`.
* Success (200):

```json
{ "message": "Logged out" }
```

---

### `POST /api/auth/token`

* Public.
* Body:

```json
{ "refreshToken": "<jwt-refresh-token>" }
```

* Behavior:

  * Verify refresh token JWT.
  * Confirm `tokenId` exists in `tokens` collection and not revoked & not expired.
  * Revoke old token document.
  * Issue new `accessToken` and a NEW `refreshToken` (with new `tokenId` stored).
* Response (200):

```json
{ "accessToken": "<new-access-token>", "refreshToken": "<new-refresh-token>" }
```

* Errors: `401` invalid/expired refresh token.

---

### `POST /api/auth/forgot-password`

* Public.
* Body:

```json
{ "email": "ali@example.com" }
```

* Behavior:

  * If user exists, create single-use reset token (hash stored in `tokens`) and email (or log) a reset link containing token and email.
  * Response is intentionally vague to avoid account enumeration.
* Response (200):

```json
{ "message": "If that email exists you will receive a reset link" }
```

---

### `POST /api/auth/reset-password`

* Public.
* Body:

```json
{ "token": "<resetToken>", "email": "ali@example.com", "password": "NewPass123!" }
```

* Behavior:

  * Validate token (hashed) for that user and ensure not used/expired.
  * Hash new password and save.
  * Mark reset token `used`.
  * Revoke all existing refresh tokens for that user (security).
* Response (200):

```json
{ "message": "Password reset successful" }
```

* Errors: `400` invalid/expired token.

---

## Profile routes (authenticated)

> All routes below require `Authorization: Bearer <accessToken>` header (access token).

### `GET /api/profile`

* Returns authenticated user's profile (excluding password).
* Response (200):

```json
{
  "_id": "64a0b123...",
  "name": "Ali Amir",
  "email": "ali@example.com",
  "role": "Viewer",
  "emailVerified": true,
  "lastLoginAt": "...",
  "isDeleted": false,
  "createdAt": "...",
  "updatedAt": "..."
}
```

### `PUT /api/profile`

* Body (partial allowed):

```json
{ "name": "New Name", "email": "newemail@example.com" }
```

* Behavior:

  * Updates name/email. If email changed, `emailVerified` is set to `false`, sends a new verification email (one-time token).
* Response (200):

```json
{ "message": "Profile updated" }
```

* Errors: `400` if new email already in use.

---

## User management (Admin only)

> Protected: require JWT and the caller's role must be `Admin`. These routes are behind `jwtAuth` middleware then `permit("Admin")`.

### `GET /api/users`

* List all users with roles and statuses (no passwords).
* Response (200):

```json
[
  { "_id":"...", "name":"Ali Amir", "email":"ali@example.com", "role":"Admin", "isDeleted":false, ... },
  ...
]
```

### `PUT /api/users/:id/role`

* Body:

```json
{ "role": "Editor" }  // allowed: Admin | Editor | Viewer
```

* Behavior:

  * Changes user role.
  * Recommended behavior: revoke user refresh tokens when role changed (so they re-login and receive new access token containing the updated role).
* Response (200): returns updated user object (no password).
* Errors: `400` invalid role, `404` user not found.

### `DELETE /api/users/:id`

* Behavior:

  * Soft delete: sets `isDeleted: true` on user.
  * Revoke tokens for that user so existing sessions are invalidated.
* Response (200):

```json
{ "message": "User deactivated (soft deleted)" }
```

---

## Content endpoints (authenticated; role-protected for write)

> `GET /api/content` — any authenticated user can view (Admin, Editor, Viewer).

### `GET /api/content`

* Returns non-deleted content with author info.
* Response (200):

```json
[
  { "_id":"...", "title":"First", "body":"...", "author":{ "_id":"...","name":"Ali Amir","email":"..." }, ... },
  ...
]
```

### `POST /api/content`

* Protected to: `Admin`, `Editor`.
* Body:

```json
{ "title": "Hello", "body": "Content body" }
```

* Response (201): created content document.

### `PUT /api/content/:id`

* Protected to: `Admin`, `Editor`.
* Behavior: Editors may only update their own content (checked in controller).
* Body (partial allowed):

```json
{ "title": "Updated", "body": "New content" }
```

* Response (200): updated content.

### `DELETE /api/content/:id`

* Protected to: `Admin` OR owner `Editor`.
* Behavior: Sets `isDeleted: true`.
* Response (200):

```json
{ "message": "Content deleted" }
```

---

# Error handling & response conventions

* Validation errors (express-validator) return `400` with an `errors` array:

```json
{ "errors": [{ "msg": "...", "param": "email", "location": "body" }, ...] }
```

* Authentication/authorization:

  * `401 Unauthorized` if missing/invalid/expired tokens or not email-verified.
  * `403 Forbidden` for insufficient role permissions.
* Resource not found: `404`.
* Server error: `500` with `{ "message": "Internal Server Error" }`.

---

# Admin bootstrap — create first Admin

You must create the first `Admin` account out-of-band (not via public register). Options:

1. **Run the seed script** (recommended) — `scripts/createAdmin.js` (see earlier provided script). It reads env variables `ADMIN_EMAIL` & `ADMIN_PASSWORD` and inserts hashed user if no Admin exists.
2. **Manual DB insert** using `mongosh` or MongoDB Compass:

   * Generate bcrypt hash (run `node -e "const b=require('bcryptjs');console.log(b.hashSync('MyPass123',12))"`).
   * Insert document into `your_db.users`:

```js
db.users.insertOne({
  name: "Your Name",
  email: "you@example.com",
  password: "<bcrypt-hash>",
  role: "Admin",
  emailVerified: true,
  lastLoginAt: new Date(),
  isDeleted: false,
  createdAt: new Date(),
  updatedAt: new Date()
});
```

3. **Bootstrap code**: option to run server-side startup logic to create Admin from `ADMIN_EMAIL`/`ADMIN_PASSWORD` + `ADMIN_CREATE_SECRET` — use only temporarily and with extreme caution.

After initial Admin account exists, the Admin can promote others via `PUT /api/users/:id/role`.

---

# Security notes & recommendations

* Use **HTTPS** in production. Never send tokens or passwords over plain HTTP.
* Keep `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` safe (use environment variables/secret manager).
* Use strong, unique JWT secrets (long random strings).
* Rotate refresh tokens on refresh (the code does this) and store them server-side to allow revocation.
* Revoke refresh tokens when:

  * User resets password
  * User is soft-deleted or deactivated
  * User role changes (recommended)
* Consider storing refresh tokens in a persistent store with device metadata if you need multi-device management (e.g., `device`, `ip`, `userAgent` fields).
* Enable rate-limiting on auth endpoints (e.g., login, forgot-password) to prevent brute force.
* Consider multi-factor auth (MFA) for Admin accounts.
* Monitor logs for suspicious login/role-change activity.
* For production email, use a trustworthy SMTP or transactional email service (SendGrid, Mailgun, SES). In dev the app logs links if SMTP is not configured.
* Sanitize all user-provided content (XSS) on the frontend. API returns content; frontend must escape.

---

# Testing examples (curl)

Replace `{{API}}` with `http://localhost:4000/api`.

**Register**

```bash
curl -X POST {{API}}/auth/register \
 -H "Content-Type: application/json" \
 -d '{"name":"Ali Amir","email":"ali@example.com","password":"StrongPass123!"}'
```

**Verify email**

```bash
# Example using verification token from email/console:
curl "{{API}}/auth/verify-email?token=<token>&email=ali%40example.com"
```

**Login**

```bash
curl -X POST {{API}}/auth/login \
 -H "Content-Type: application/json" \
 -d '{"email":"ali@example.com","password":"StrongPass123!"}'
# returns accessToken + refreshToken
```

**Get profile**

```bash
curl -H "Authorization: Bearer <accessToken>" {{API}}/profile
```

**Refresh token**

```bash
curl -X POST {{API}}/auth/token -H "Content-Type: application/json" \
 -d '{"refreshToken":"<refreshToken>"}'
```

**Create content (as Editor/Admin)**

```bash
curl -X POST {{API}}/content \
 -H "Authorization: Bearer <accessToken>" \
 -H "Content-Type: application/json" \
 -d '{"title":"Hello","body":"Body text"}'
```

**Admin: change role**

```bash
curl -X PUT {{API}}/users/<userId>/role \
 -H "Authorization: Bearer <adminAccessToken>" \
 -H "Content-Type: application/json" \
 -d '{"role":"Editor"}'
```

---

# Deployment notes & production checklist

* Use a managed DB (MongoDB Atlas) for production. Configure IP allowlist appropriately. Do not use `0.0.0.0/0` in production.
* Use environment-specific `.env` values injected by your host (Render, Heroku, Fly, Vercel, etc.).
* Configure SMTP credentials for real emails (or integrate a transactional email service).
* Run the server behind a secure reverse proxy (Nginx) or use platform-managed TLS.
* Turn on logging/monitoring and periodic backups for DB.
* Consider containerizing (Docker) and using CI/CD for deployments.
* Limit publicly-exposed admin actions to trusted admin accounts.
* Add tests (unit/integration) for auth flows.

---

# Appendix — token & DB details

* `accessToken` is a JWT signed with `JWT_ACCESS_SECRET`. Payload contains at minimum: `{ id, role, email }`.
* `refreshToken` is a JWT signed with `JWT_REFRESH_SECRET` that contains `{ userId, tokenId }`. `tokenId` is a UUID and must match a non-revoked document in `tokens` collection.
* One-time tokens (verification/reset) are generated as random strings and **hashed** (`sha256`) before saving as `tokenHash` in `tokens`. The raw token is emailed (or logged) and must be provided for verification/reset; once used, the `used` flag is set to `true`.