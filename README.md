# AutoChannel

AI-powered YouTube video production pipeline. Queue an instruction, get a full production package back.

## Tech Stack

- **Frontend:** Next.js App Router, TypeScript, Tailwind CSS, shadcn/ui
- **API:** tRPC
- **Database:** PostgreSQL + Prisma
- **Queue:** BullMQ + Redis
- **AI:** OpenAI-compatible LLM (uses Vercel AI SDK)
- **Video:** Remotion (spec generation, optional render)

## Prerequisites

- Node.js 20+
- PostgreSQL
- Redis

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy environment variables and fill them in
cp .env .env.local
# Edit .env.local with your values:
#   DATABASE_URL=postgresql://...
#   REDIS_URL=redis://localhost:6379
#   OPENAI_API_KEY=sk-...
#   DEEPSEEK_API_KEY=sk-... (optional fallback)
#   SERPAPI_API_KEY=... (optional, Google Images via SerpAPI)

# 3. Set up the database
npx prisma db push

# 4. Start Redis (if using Docker)
docker run -d -p 6379:6379 redis:latest

# 5. Start PostgreSQL (if using Docker)
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16
```

## Development

```bash
# Start the Next.js dev server
npm run dev

# Start the video worker (separate terminal)
npm run worker

# Open Prisma Studio to browse data
npm run db:studio
```

Open [http://localhost:3000/dashboard](http://localhost:3000/dashboard).

## Project Structure

```
src/
  app/                          # Next.js App Router pages
    dashboard/page.tsx          # Job list dashboard
    jobs/new/page.tsx           # Create job form
    jobs/[id]/page.tsx          # Job detail (logs, artifacts)
    api/trpc/[trpc]/route.ts    # tRPC HTTP handler
  server/
    api/
      trpc.ts                   # tRPC init
      root.ts                   # Root router
      routers/job.ts            # Job CRUD router
    db/index.ts                 # Prisma client
    llm/
      client.ts                 # LLM client wrapper
      schemas.ts                # Zod schemas for LLM outputs
    queue/
      index.ts                  # BullMQ queue setup
      pipeline.ts               # Video generation pipeline
    remotion/
      spec-generator.ts         # Remotion project generator
    tools/
      registry.ts               # Tool registry (LLM-facing tools)
      search-images.ts          # Image search (SerpAPI)
      download-image.ts         # Image downloader
  workers/
    videoWorker.ts              # BullMQ worker entry point
  lib/
    trpc/
      client.ts                 # tRPC React client
      Provider.tsx              # tRPC provider wrapper
```

## Pipeline Stages

1. **PLAN_TOPIC** — LLM generates title, angle, audience, objectives, scene count
2. **GENERATE_SCRIPT** — LLM generates full narration script with timed scenes
3. **GENERATE_STORYBOARD** — Extracted storyboard from script with visual descriptions
4. **GENERATE_ASSET_PROMPTS** — LLM generates image asset prompts per scene
5. **DOWNLOAD_REFERENCE_IMAGES** — Searches Google Images via SerpAPI, downloads images (if enabled)
6. **GENERATE_SCENE_SPEC** — LLM chooses branded scene templates + focus beats per scene
7. **GENERATE_REMOTION_SPEC** — Deterministic mapper converts scene spec to Remotion layout
8. **GENERATE_METADATA** — YouTube title, description, tags, thumbnail prompt
9. **RENDER_VIDEO** — Full MP4 render via Remotion (optional)
10. **COMPLETE** — Job marked done

## tRPC API

| Procedure | Method | Description |
|-----------|--------|-------------|
| `job.create` | mutation | Create and queue a new job |
| `job.list` | query | List jobs (paginated) |
| `job.getById` | query | Get single job details |
| `job.retry` | mutation | Retry a failed job |
| `job.cancel` | mutation | Cancel a pending job |
| `job.logs` | query | Get logs for a job |
| `job.artifacts` | query | Get artifacts for a job |
| `job.getArtifact` | query | Get single artifact |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | Yes | Redis connection string |
| `OPENAI_API_KEY` | Yes | OpenAI API key for LLM calls |
| `DEEPSEEK_API_KEY` | No | DeepSeek API key (alternative LLM) |
| `SERPAPI_API_KEY` | No | SerpAPI key for Google Images search |
| `IMAGE_SEARCH_API_KEY` | No | Backward-compatible alias for image search key |

## MVP Limitations

- No authentication / user system
- No payments
- No YouTube upload integration
- Rendering produces a spec JSON, not a final MP4 (Remotion render is optional)
- Image generation uses reference search (SerpAPI), not DALL-E/Midjourney
- Placeholder voiceover (TTS not integrated)
