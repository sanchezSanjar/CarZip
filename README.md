# CarZip

**A used-car marketplace backend where verified dealers list cars and buyers find them, like them, ask questions and book test drives.**

Built with NestJS, GraphQL (Apollo) and MongoDB as a monorepo of two applications: the **API server** and a **batch server** for scheduled jobs.

---

## Features

**Members & authentication**
- Three roles: **USER** (buyer), **AGENT** (verified car dealer), **ADMIN**
- Signup and login with JWT; every request re-checks the member in the database (blocked members and tokens issued before a password change stop working immediately)
- Phone verification by **SMS one-time code** (Solapi) for signup, forgot password and phone change; codes are hashed, attempt-limited and rate-limited
- Dealers apply and wait for **admin approval**; admins can also create dealer accounts directly (the dealer sets their own password via "Forgot password")

**Cars**
- Dealers list cars for the **domestic market (KRW)**, **export (USD)** or both, with an export-responsibility agreement
- Brand → model catalogue, nearly 20 filters, sorting by price, mileage, year, likes, views or rank, and **cursor pagination**
- Image upload over REST: every image is decoded and re-encoded to WebP (with a thumbnail), and EXIF data such as GPS location is removed
- Likes, comments, view counts, favorites and "recently viewed"

**Test drives**
- A buyer requests a date and the dealer confirms, rejects or later marks it complete; once a date is agreed, either side can cancel
- The buyer's phone number is shown to the dealer **only after the dealer confirms**
- Open test drives are cancelled automatically when the car is sold, paused or removed, and both sides are notified

**Community & moderation**
- Board articles (dealers and admins write), follows (members follow dealers), notifications with read/unread state
- **Personal block:** a dealer can stop a member from liking, commenting, following or requesting test drives on their own listings
- Admin moderation of members, cars, articles and comments; notices, FAQ and terms pages
- **Real-time chat** over WebSocket: guests can read, logged-in members can write, with message validation and a spam limit

**Batch server (scheduled jobs, Korea time)**

| Job | When |
|---|---|
| Car and dealer rankings | daily 01:00 |
| Unanswered test-drive requests expire; reminders before confirmed test drives; follow-up after them | every 10 min / hourly |
| Delete uploaded images nothing uses | daily 03:00 |
| Recount every stored counter (likes, views, followers...) and fix any drift | daily 04:00 |
| Remind admins about dealer applications waiting over 48 hours | daily 09:00 |
| Ask dealers whether listings untouched for 30 days are still for sale | daily 10:00 |

Every job is safe to run twice: each change is conditional on the current state, so nothing is applied or announced twice.

---

## Tech stack

| Area | Technology |
|---|---|
| Framework | NestJS 12 (monorepo), TypeScript 6 |
| API | GraphQL with Apollo Server 5; REST for image upload |
| Database | MongoDB with Mongoose 8 (aggregation pipelines, unique and TTL indexes) |
| Auth | JWT, bcrypt, role guards |
| Validation | class-validator / class-transformer (global ValidationPipe) |
| Real time | WebSocket (`ws` adapter) |
| Scheduling | @nestjs/schedule (cron) |
| Images | sharp (WebP re-encoding, thumbnails) |
| SMS | Solapi |
| Code quality | ESLint 9, Prettier |

---

## Project structure

```
apps/
  carzip-api/        GraphQL API, WebSocket chat, image upload
    src/components/  one folder per feature: member, car, test-drive, comment, like, follow,
                     block, notice, notification, board-article, otp, sms, upload, view, auth
    src/libs/        GraphQL DTOs, guards, interceptors, query helpers
    src/socket/      WebSocket chat gateway
  carzip-batch/      scheduled jobs (rankings, test drives, cleanup, reminders, counter check)
libs/
  common/            shared by both apps (imported as @app/common):
                     Mongoose schemas, enums, database module, shared config
```

---

## Getting started

**Requirements:** Node.js 20 or newer, and a MongoDB database (local or MongoDB Atlas).

```bash
git clone https://github.com/sanchezSanjar/CarZip.git
cd CarZip
npm install
```

Create a `.env` file in the project root:

```env
PORT_API=3007
PORT_BATCH=3008

MONGO_DEV=mongodb://localhost:27017/carzip
MONGO_PROD=

SECRET_TOKEN=a-long-random-string

# optional: without them, SMS messages are only written to the log (nothing is sent)
SOLAPI_API_KEY=
SOLAPI_API_SECRET=
SOLAPI_SENDER_NUMBER=

# production only
CORS_ORIGINS=https://your-domain.com
UPLOADS_PUBLIC_URL=https://your-domain.com
```

Run in development:

```bash
npm run start:dev          # API server    -> http://localhost:3007/graphql
npm run start:dev:batch    # batch server
```

Open `http://localhost:3007/graphql` in the browser to explore every query and mutation.

Build and run in production mode:

```bash
npm run build
npx nest build carzip-batch
npm run start:prod
npm run start:prod:batch
```

Other scripts: `npm run lint`, `npm run format`.

---

## Security notes

- Passwords are hashed with bcrypt; private fields (phone, business number, password hash) are never returned in public lists or aggregations
- Search text is escaped before it is used in a regex; malformed ids return 400, not a server error
- Counters and status changes are atomic, so parallel requests (double taps, two devices) can't double-count or both succeed
- Uploaded files are re-encoded, so only clean images the server produced are stored and served
- Secrets and tokens are masked in logs; chat message text is never logged

---

## Roadmap

- API documentation for the frontend
- Login rate limit, security headers (helmet), `trust proxy` for deployment
- Automated end-to-end test suite
- Redis for chat history and live notification push
- Object storage (S3 / R2) for images
- Web frontend (Next.js), then a mobile app

---

## Author

**Sanjar** · [github.com/sanchezSanjar](https://github.com/sanchezSanjar)
