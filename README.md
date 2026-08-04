# Trafy Community

Community-based learning and hiring platform. 

This repository implements a full-stack platform featuring a clean, professional, LinkedIn-style UI built with Next.js (App Router) and Material UI (MUI v5). The backend is powered by Fastify, tRPC, and Drizzle ORM, with data hosted on **Supabase** (PostgreSQL).

## Features

- **Authentication**: Secure passwordless OTP flow (via email) alongside OAuth integrations for **Google**, **LinkedIn**, and **GitHub**. Sessions are managed via JWT.
- **Corporate UI/UX**: A responsive, mobile-first design using MUI's `AppBar`, `Drawer`, and a clean blue/white/grey palette inspired by professional networks.
- **Home Feed**: A dynamic 3-column feed layout:
  - Left: User identity and stats
  - Center: Post composer and chronological feed with likes/comments
  - Right: Real-time News API widget (currently served via mock TRPC router)
- **Realtime Community**: Socket.IO powered DMs, group chats, and live notifications.
- **Learning Hub**: Course builder, public catalog, video/text lessons, assessments, and course reviews.
- **Hiring Marketplace**: Kanban-style applicant pipelines and job boards.
- **Mobile App**: An Expo React Native shell (`apps/mobile`) with biometric unlock, offline caching, native push notifications, and bottom-sheet checkouts.

## Tech Stack

| Layer | Technology |
|---|---|
| **Monorepo** | npm workspaces |
| **Frontend** | Next.js 15 (App Router), React 19, MUI v5 (Material Design) |
| **Backend API** | Fastify 5 + tRPC 10 |
| **Shared Types** | Zod schemas (`@trafy-community/core`) |
| **Database** | Supabase (PostgreSQL 16) + Drizzle ORM (`@trafy-community/db`) |
| **Sessions** | JWT access token (15m) + opaque refresh token |
| **Realtime** | Socket.IO (Web/Mobile), LiveKit (Live classes) |
| **Mobile** | Expo SDK 57 (React Native 0.86) |

## Quickstart

### 1. Environment Setup

Copy the example environment file:
```bash
cp .env.example .env
```

**Supabase Configuration:**
Ensure you replace the default `DATABASE_URL` in your `.env` with your Supabase Postgres connection string (e.g., `postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`).

**OAuth Configuration (Optional):**
To enable OAuth login buttons, populate the following keys in your `.env`:
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
- `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET`
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` *(Callback URL: `http://localhost:3000/auth/callback`)*

### 2. Install & Migrate

Install all workspace dependencies and push the database schema to Supabase:
```bash
npm install
npm run db:generate
npm run db:migrate
```

### 3. Run Development Servers

Start the API and Web servers in separate terminals:
```bash
npm run dev:api     # API at http://localhost:4000
npm run dev:web     # Web at http://localhost:3000
```

*(Optional) Start the mobile Expo server:*
```bash
npm run dev:mobile
```

## Project Layout

```text
apps/
  web/     Next.js frontend — Feed, Discover, Chats, Groups, Assess, Learn, Hire, Profile
  api/     Fastify + tRPC backend — auth, profile, posts, chat, courses, payments, jobs
  mobile/  Expo app — biometric lock, offline feed, native push, mobile checkout
packages/
  core/    Shared Zod schemas & types
  db/      Drizzle schema, client, migrations
```

## Known Simplifications (Development Scope)
- **Checkout / Escrow**: Payments and milestone fundings are stubbed. The system updates status flags instantly without charging real cards. Wire up Razorpay/Stripe in `payments.ts` before production.
- **Code Execution**: The assessment code-question grader uses a keyword rubric match by default. Point `JUDGE0_URL` to a Judge0 sandbox for actual code execution.
- **Email Delivery**: OTPs are logged to the console in development. Provide a `RESEND_API_KEY` to trigger real email delivery.
- **Storage**: Media is currently written to `apps/api/uploads/`. Set `S3_ENDPOINT` to transition to S3-compatible cloud storage.
