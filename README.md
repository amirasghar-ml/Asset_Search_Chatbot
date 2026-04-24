# Asset Search Chatbot Take-Home (Option A)

This repository contains my submission for the CRAFTSMAN+ take-home exercises:

- Exercise 1: Asset Search Chatbot architecture design (`submission-rag-architecture.md`)
- Exercise 2: TypeScript tagging client implementation (`tagging-client.ts`)

## Repository Contents

- `submission-rag-architecture.md`: Final architecture write-up for storage/indexing and chatbot retrieval/generation.
- `tagging-client.ts`: Typed client module with retries, chunked concurrency, discriminated union result types, and stats tracking.
- `demo.ts`: Small runnable demo that tags sample assets and prints outputs + stats.

## Run Locally

Prerequisites:

- Node.js 18+ (or equivalent environment with `npx`)

Run the demo:

```bash
npx tsx demo.ts
```

Notes:

- `tagging-client.ts` exports types and `TaggingService`; it does not print output by itself.
- `demo.ts` is the executable harness used to run `tagAsset`, `tagBatch`, and `getStats`.
- `tsx` is used for runtime execution compatibility on newer Node versions.

## Notes

- No external libraries were used for the coding challenge.
- The architecture submission is intentionally scoped to a 30-minute design exercise and focuses on key tradeoffs and decisions.