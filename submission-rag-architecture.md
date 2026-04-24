# Asset Search Chatbot Architecture (Option A)

## Assumptions
- Asset ingestion and LLM tagging are already complete and reliable.
- Asset volume starts around 5k and grows to 500k+.
- Primary users are internal creative and account teams searching by natural language.
- Search quality matters more than absolute minimum latency, but P95 should stay under 1.5s.

## High-Level Architecture

```text
[Asset Upload]
   -> [Existing Tagging Service]
   -> [Tag Event Bus]
       -> [Metadata Store (Postgres)]
       -> [Vector Indexer]
           -> [Vector DB]

[Chat UI]
   -> [Query API]
       -> [Query Understanding]
           -> structured filters + semantic intent
       -> [Hybrid Retriever]
           -> Postgres filter + Vector search + Rerank
       -> [Context Assembler]
       -> [LLM Response Generator]
   -> [Ranked Results + Explanations + Preview URLs]
```

## 1) Storage and Indexing

### Data Model
- **Postgres** stores canonical asset records and structured tags:
  - `assets`: id, type, name, description, storage URL, thumbnail URL, created_at
  - `asset_tags`: asset_id, category, tag_name, confidence, source_model, tagged_at
  - `asset_tag_summary`: denormalized JSON for fast retrieval and LLM context assembly
- Why Postgres:
  - Strong filtering on structured categories (`brand`, `campaign`, `asset_type`)
  - Familiar operational model and transactional consistency for tag updates
  - Good enough for metadata at this scale

### Embedding Strategy
- **Embed both** but with different text construction:
  1. **Free-form semantic text embedding** (primary):
     - Input built from descriptive tags + optional asset description
     - Example: `"dark moody product photography, dramatic lighting, hero banner, lifestyle"`
     - Captures style and intent from natural language
  2. **Structured tag projection embedding** (secondary):
     - Input template for structured fields:
       - `"brand:nike campaign:q3-2026 asset_type:hero-banner"`
     - Helps lexical-semantic matching on normalized taxonomy values
- Tradeoff:
  - Embedding only raw content is weaker because we already have high-signal tags.
  - Embedding only structured tags misses nuanced style/mood language.
  - Combined embeddings give better recall while metadata filters preserve precision.

### Vector Store Choice
- **Qdrant** for vector storage + payload filtering.
- Why Qdrant:
  - Strong metadata payload filters for hybrid search
  - HNSW ANN indexing with production-ready performance
  - Simple API and straightforward operation for mid-size workloads
- Index design:
  - Collection `asset_embeddings`
  - Vectors:
    - `semantic_vec` (dense vector of free-form text)
    - `structured_vec` (dense vector of structured projection)
  - Payload fields: asset_id, type, brand, campaign, categories, confidence stats

### Indexing Pipeline
1. Tagging output emits event to bus (e.g., Kafka/SQS equivalent).
2. Indexer normalizes tags:
   - lowercases values
   - maps category aliases to canonical taxonomy
   - drops low-confidence tags below threshold per category
3. Indexer writes Postgres rows first (source of truth).
4. Indexer generates embedding text and vectors.
5. Indexer upserts vectors to Qdrant with payload.
6. Idempotency key (`asset_id + tag_version + embedding_model_version`) prevents duplicate writes.

### Hybrid Search Strategy
- Query path:
  - Pre-filter candidates using structured constraints (brand/campaign/type).
  - Vector similarity on semantic intent within filtered subset.
  - Fallback to full corpus semantic search if strict filters return zero and filters are low-confidence extraction.
- Why pre-filter first:
  - Better precision when explicit constraints exist ("Nike", "Q3")
  - Reduced ANN search space and improved relevance
- When post-filter is used:
  - If extracted filters are uncertain or query is ambiguous, run broad semantic search then soft-filter/rerank.

## 2) Chatbot Retrieval and Generation

### Query Understanding and Decomposition
- Query Understanding service (small LLM + deterministic parser):
  - Input: raw user query
  - Output:
    - `filters`: structured constraints (brand/campaign/asset_type/file_type/date)
    - `semantic_query`: remaining descriptive intent
    - `intent_confidence` and `ambiguity_flags`
- Example:
  - User: "Find hero banner images from Q3 Nike campaign with dark backgrounds"
  - Filters: `{ brand: "nike", campaign: "q3-2026", asset_type: "hero-banner", type: "image" }`
  - Semantic query: `"dark backgrounds, moody style"`

### Retrieval Pipeline
1. Filter validation:
   - Canonicalize values using taxonomy dictionary (`nike` -> `Nike`)
   - Mark unknown tokens as soft filters
2. Candidate generation:
   - SQL query for strict filters returns asset IDs
   - Vector search on semantic embedding for top-K (e.g., 200)
3. Fusion and reranking:
   - Reciprocal rank fusion from structured match score + vector similarity
   - Lightweight reranker boosts:
     - exact brand/campaign match
     - higher confidence tags
     - recency decay optional for fresh campaigns
4. Final selection:
   - top N for display (e.g., 20)
   - top M for LLM context (e.g., 8-12)

### Context Assembly for LLM
- Provide compact, grounded context records:
  - asset_id, name, type, preview URL, top tags by category, confidence, short rationale
- Include explicit instruction:
  - "Only use provided assets. If uncertain, ask clarification."
- Output style:
  - grouped by asset type
  - each result includes why it matched (filter + semantic reasons)

### Zero / Too-Many / Ambiguous Result Handling
- **Zero results**:
  - Relax the lowest-confidence filter first
  - Suggest alternatives ("No Nike Q3 hero banners. Show Nike dark product shots?")
- **Too many results**:
  - Ask a clarifying question (format, channel, orientation, campaign period)
  - Default to grouped top picks and expose facets for refinement
- **Ambiguous intent**:
  - Return 2-3 interpretation buckets with counts
  - Let user choose before executing expensive broad retrieval

### Response Presentation
- Ranked list with:
  - thumbnail/preview URL
  - asset name/type
  - matched tags and confidence
  - "why this matched" explanation
- Optional grouping:
  - by asset type (images/videos/design files)
  - by campaign or brand

## Scaling from 5k to 500k Assets
- Partition indexing jobs by tenant/brand to parallelize ingestion.
- Enable incremental re-embedding queues and background backfills.
- Add query result caching for frequent campaign searches.
- Use ANN tuning and shard/replica expansion in Qdrant.
- Keep Postgres filter columns indexed (`brand`, `campaign`, `asset_type`, `tagged_at`).

## Re-indexing Strategy (Schema or Model Changes)
- Version everything:
  - `tag_schema_version`, `embedding_model_version`, `index_version`
- Dual-write during migration:
  - Build new vector collection in parallel
  - Run shadow evaluation and compare relevance metrics
  - Switch read traffic with feature flag, then retire old index

## Relevance Evaluation
- Offline:
  - Curated query -> relevant asset sets
  - Metrics: Recall@K, nDCG@K, MRR
- Online:
  - Click-through on returned assets
  - "use in project" downstream conversion
  - Reformulation rate (high indicates poor retrieval)
- Human eval loop:
  - Weekly sample review for false positives and taxonomy drift

## Alternatives Considered
- **pgvector-only**: simpler stack, but weaker ANN/filtering flexibility at higher scale.
- **Embedding raw asset content only**: expensive and less aligned with already-available high-quality tags.
- **Single-step LLM search**: less controllable relevance and harder debugging than explicit hybrid retrieval.
