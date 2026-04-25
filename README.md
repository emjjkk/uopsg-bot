# UoPeopleSG Bot Workspace

This repository contains the website, Discord Interactions API, scheduled task endpoints, and a separate Discord gateway listener process for the UoPeople Study Group bot ecosystem.

## What This Workspace Includes

1. Next.js app (website + HTTP endpoints)
2. Discord interactions endpoint for slash commands and button interactions
3. Task endpoints for automation jobs (press releases, channel purge)
4. Separate Discord.js listener for live gateway events (welcome + moderation)
5. GitHub Actions workflows that call task endpoints on a schedule

## High-Level Architecture

1. User invokes a slash command in Discord
2. Discord sends interaction payload to `/v1/interactions`
3. Signature is verified via `discord-interactions`
4. Command handler processes the interaction:
	 - `/ping`
	 - `/init-verification channel_id:<id>`
5. Verification panel message is posted to the target channel with a Verify button
6. User clicks Verify button, role is assigned via Discord REST API

In parallel:

1. Listener process connects to Discord Gateway using Discord.js
2. On `guildMemberAdd`, it sends a welcome message
3. On `messageCreate` in a protected channel, it auto-bans the user

## Project Structure

```text
app/
	page.tsx                                # Homepage and status pills
	v1/interactions/route.ts                # Discord interaction endpoint
	v1/tasks/get-press-releases/route.ts    # Press-release polling + posting
	v1/tasks/purge-sensitive-channel/route.ts # Message purge endpoint

lib/
	discord/commands.ts                     # Slash-command and button logic

listener/
	index.ts                                # Gateway listener (welcome + moderation)
	package.json                            # Listener runtime scripts/deps

scripts/
	register.ts                             # Interactive slash-command registration

.github/workflows/
	get-press-releases.yml                  # Scheduled press poller
	purge-sensitive-channel.yml             # Scheduled sensitive-channel purge

data/
	last-press.json                         # Last posted press release URL state
```

## Tech Stack

- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS 4
- Discord Interactions SDK (`discord-interactions`)
- Discord.js v14 (listener process)
- Discord REST (`@discordjs/rest`)
- Cheerio (web scraping press release page)
- GitHub Actions (scheduled triggers)

## Prerequisites

1. Node.js 20+
2. npm
3. A Discord application and bot token
4. A publicly reachable URL for interactions endpoint (for example Vercel or ngrok in dev)

## Installation

### Root app

```bash
npm install
```

### Listener process

```bash
cd listener
npm install
```

## Environment Variables

Set these in your root Next.js environment (for local dev, `.env.local`; for deployment, host env settings).

### Required or used by interactions/commands

- `DISCORD_PUBLIC_KEY` (preferred) or `NEXT_PUBLIC_DISCORD_PUBLIC_KEY`
- `DISCORD_TOKEN` (preferred) or `NEXT_PUBLIC_DISCORD_TOKEN`
- `NEXT_PUBLIC_DISCORD_APPLICATION_ID` (used for homepage invite URL)

### Required by task routes

- `NEXT_PUBLIC_DISCORD_TOKEN` (used by press release task)
- `DISCORD_BOT_TOKEN` (used by purge-sensitive-channel task)

### Supabase (currently present in workspace)

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

### Listener process env (`listener/.env`)

- `DISCORD_TOKEN`

## Security Notes

1. Do not store real bot tokens in `NEXT_PUBLIC_*` variables for production. Anything marked `NEXT_PUBLIC_` is intended for client exposure.
2. Rotate any tokens that were ever committed or shared.
3. Prefer server-only variables (`DISCORD_TOKEN`, `DISCORD_PUBLIC_KEY`, `DISCORD_BOT_TOKEN`) in production.

## Running Locally

Run both processes.

### Terminal 1: Next.js app

```bash
npm run dev
```

App is available at `http://localhost:3000`.

### Terminal 2: Discord listener

```bash
cd listener
npm run dev
```

### Optional: expose local interactions endpoint

```bash
npx ngrok https 3000
```

Then set Discord Interactions Endpoint URL to:

`https://<your-ngrok-domain>/v1/interactions`

## Slash Commands

Commands are defined in `scripts/register.ts` and `lib/discord/commands.ts`.

Current commands:

1. `/ping`
2. `/init-verification channel_id:<channel-id>` (admin-only)

### Register commands

```bash
npx tsx scripts/register.ts
```

The script prompts for:

1. Discord Bot Token
2. Discord Application ID

## Discord Interaction Endpoint

### `GET /v1/interactions`

Health check endpoint that returns `OK`.

### `POST /v1/interactions`

1. Verifies `x-signature-ed25519` and `x-signature-timestamp`
2. Handles ping interactions (type 1)
3. Delegates command/button logic to `lib/discord/commands.ts`

## Verification Flow

Implemented in `lib/discord/commands.ts`.

1. Admin runs `/init-verification` with a channel id
2. Bot posts verification instructions and Verify button in that channel
3. Button click assigns verification role via Discord API

Current verification role id is hardcoded in the command handler.

## Listener Features

Implemented in `listener/index.ts`.

### Welcome messages

- Event: `guildMemberAdd`
- Target channel: `812056538650378311`

### Auto-ban moderation rule

- Event: `messageCreate`
- Protected channel: `1497431258274332702`
- Action: ban user if they post there
- Alert: sends a message in-channel and attempts to include admin mentions

## Scheduled Task Endpoints

### `GET /v1/tasks/get-press-releases`

1. Scrapes UoPeople press release page
2. Detects latest release URL
3. If changed, posts structured content to a Discord channel

Query parameter:

- `lastUrl` (the last known posted URL)

### `POST /v1/tasks/purge-sensitive-channel`

JSON body:

```json
{
	"channel_id": "<discord-channel-id>"
}
```

Behavior:

1. Fetches messages in batches
2. Bulk-deletes messages newer than 14 days where possible
3. Falls back to single deletion for older messages or bulk failures
4. Handles Discord rate limits (`429`) with retry/backoff

## GitHub Actions Workflows

### `get-press-releases.yml`

- Schedule: every 6 hours
- Calls hosted endpoint `/v1/tasks/get-press-releases`
- If a new release is posted, updates `data/last-press.json` and commits back

### `purge-sensitive-channel.yml`

- Schedule: 05:00 UTC and 17:00 UTC daily
- Calls hosted endpoint `/v1/tasks/purge-sensitive-channel` with configured channel id

## Homepage

`app/page.tsx` provides:

1. Bot landing page
2. Status pills for Listener, Interactions, Tasks
3. GitHub repository link
4. Invite URL generated from `NEXT_PUBLIC_DISCORD_APPLICATION_ID`

## Build, Lint, Format

### Root app

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run format
```

### Listener

```bash
cd listener
npm run dev
npm run start
```

## Deployment Notes

1. Deploy Next.js app to a public host (for example Vercel)
2. Configure all required environment variables in that host
3. Set Discord Interactions Endpoint URL to `/v1/interactions` on your deployed domain
4. Ensure bot permissions include:
	 - Send Messages
	 - Manage Roles
	 - Ban Members
	 - Read Message History (for purge behavior where applicable)
5. Keep the listener running on a persistent process host (separate from Next.js serverless runtime)

## Troubleshooting

### Discord cannot validate interactions endpoint

1. Confirm endpoint URL is exactly reachable and correct path (`/v1/interactions`)
2. Confirm public key env variable is present
3. Confirm raw request body is not modified before signature verification

### Slash command does not appear

1. Re-run `npx tsx scripts/register.ts`
2. Confirm bot token and application id are correct
3. Wait a short propagation period for global commands

### Verification button does not assign role

1. Confirm bot has Manage Roles
2. Confirm target role is below bot's highest role
3. Confirm role id in command logic is correct

### Listener events not firing

1. Confirm listener process is running from `listener/`
2. Confirm bot token in `listener/.env`
3. Confirm required gateway intents are enabled in Discord developer portal

## Roadmap Suggestions

1. Move hardcoded IDs into server-only environment variables
2. Standardize token variable names across tasks/interactions/listener
3. Add unit/integration tests for command and task logic
4. Add structured logging and alerting for moderation/task failures
