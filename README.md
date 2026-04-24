# Asset Search Chatbot Take-Home (Option A)

This repository contains my submission for the CRAFTSMAN+ take-home exercises:

- Exercise 1: Asset Search Chatbot architecture design (`submission-rag-architecture.md`)
- Exercise 2: TypeScript tagging client implementation (`tagging-client.ts`)

## Repository Contents

- `submission-rag-architecture.md`: Final architecture write-up for storage/indexing and chatbot retrieval/generation.
- `tagging-client.ts`: Typed client module with retries, chunked concurrency, discriminated union result types, and stats tracking.
- `take-home-rag-architecture.md`: Provided architecture prompt.
- `take-home-rag-challenge.md`: Provided TypeScript coding challenge prompt.

## Run the TypeScript Challenge Locally

Prerequisites:

- Node.js 18+ (or equivalent environment with `npx`)

Quick run:

```bash
npx ts-node tagging-client.ts
```

Note: `tagging-client.ts` exports types and `TaggingService`. To execute behavior directly, import it from a small test harness (or run in a TS sandbox) and call `tagAsset`/`tagBatch`.

## Notes

- No external libraries were used for the coding challenge.
- The architecture submission is intentionally scoped to a 30-minute design exercise and focuses on key tradeoffs and decisions.