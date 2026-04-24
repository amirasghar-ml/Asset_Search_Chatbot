// ============================================================
// STARTER CODE — do not modify this section
// ============================================================

/**
 * Simulates the external LLM tagging API.
 * - Takes 100-500ms per call (simulated latency)
 * - Fails ~20% of the time (simulated unreliability)
 * - Returns generated tags for an asset
 */
async function mockTaggingAPI(asset: {
  id: string;
  name: string;
  type: string;
  description?: string;
}): Promise<{
  asset_id: string;
  tags: Array<{ name: string; confidence: number; category: string }>;
  model: string;
  latency_ms: number;
}> {
  const latency = 100 + Math.random() * 400;
  await new Promise((resolve) => setTimeout(resolve, latency));

  if (Math.random() < 0.2) {
    const errors = [
      { status: 429, message: "Rate limited" },
      { status: 500, message: "Internal server error" },
      { status: 503, message: "Service unavailable" },
    ];
    const err = errors[Math.floor(Math.random() * errors.length)];
    throw new APIError(err.message, err.status);
  }

  const tagPool = [
    { name: "hero-banner", confidence: 0.95, category: "asset_type" },
    { name: "product-shot", confidence: 0.88, category: "asset_type" },
    { name: "dark-background", confidence: 0.92, category: "visual_style" },
    { name: "minimal", confidence: 0.78, category: "visual_style" },
    { name: "bold-typography", confidence: 0.85, category: "visual_style" },
    { name: "lifestyle", confidence: 0.91, category: "mood" },
    { name: "professional", confidence: 0.87, category: "mood" },
    { name: "energetic", confidence: 0.73, category: "mood" },
    { name: "nike", confidence: 0.99, category: "brand" },
    { name: "adidas", confidence: 0.97, category: "brand" },
    { name: "q3-2026", confidence: 0.94, category: "campaign" },
    { name: "summer-launch", confidence: 0.89, category: "campaign" },
  ];

  const count = 3 + Math.floor(Math.random() * 4);
  const shuffled = [...tagPool].sort(() => Math.random() - 0.5);
  const tags = shuffled.slice(0, count);

  return {
    asset_id: asset.id,
    tags,
    model: "gpt-4o-mini",
    latency_ms: Math.round(latency),
  };
}

class APIError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "APIError";
  }
}

// ============================================================
// YOUR CODE BELOW
// ============================================================

type PrimitiveMetadata = string | number | boolean | null;
type TagCategory =
  | "brand"
  | "campaign"
  | "visual_style"
  | "asset_type"
  | "mood"
  | (string & {});

interface Asset {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly description?: string;
  readonly metadata?: Readonly<Record<string, PrimitiveMetadata>>;
}

interface Tag {
  readonly name: string;
  readonly confidence: number;
  readonly category: TagCategory;
}

interface TaggingResult {
  readonly assetId: string;
  readonly tags: readonly Tag[];
  readonly model: string;
  readonly latencyMs: number;
  readonly processedAt: string;
}

interface TaggingError {
  readonly assetId: string;
  readonly errorMessage: string;
  readonly statusCode: number;
  readonly attempt: number;
}

type TaggedAsset =
  | {
      readonly status: "success";
      readonly asset: Asset;
      readonly result: TaggingResult;
    }
  | {
      readonly status: "failed";
      readonly asset: Asset;
      readonly error: TaggingError;
    };

interface TaggingStats {
  readonly totalApiCalls: number;
  readonly successes: number;
  readonly failures: number;
  readonly averageLatencyMs: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class TaggingService {
  private readonly maxAttempts: number;
  private readonly baseBackoffMs: number;

  private totalApiCalls = 0;
  private successes = 0;
  private failures = 0;
  private cumulativeLatencyMs = 0;

  constructor(config?: { maxAttempts?: number; baseBackoffMs?: number }) {
    this.maxAttempts = config?.maxAttempts ?? 3;
    this.baseBackoffMs = config?.baseBackoffMs ?? 200;
  }

  async tagAsset(asset: Asset): Promise<TaggedAsset> {
    let lastError: TaggingError | null = null;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        this.totalApiCalls += 1;
        const response = await mockTaggingAPI(asset);
        const tags: Tag[] = response.tags.map((tag) => ({
          name: tag.name,
          confidence: tag.confidence,
          category: tag.category as TagCategory,
        }));

        const result: TaggingResult = {
          assetId: response.asset_id,
          tags,
          model: response.model,
          latencyMs: response.latency_ms,
          processedAt: new Date().toISOString(),
        };

        this.successes += 1;
        this.cumulativeLatencyMs += response.latency_ms;

        return { status: "success", asset, result };
      } catch (error) {
        const apiError =
          error instanceof APIError
            ? error
            : new APIError(
                error instanceof Error ? error.message : "Unknown error",
                500,
              );

        lastError = {
          assetId: asset.id,
          errorMessage: apiError.message,
          statusCode: apiError.statusCode,
          attempt,
        };

        if (attempt < this.maxAttempts) {
          const backoffMs = this.baseBackoffMs * 2 ** (attempt - 1);
          await sleep(backoffMs);
        }
      }
    }

    this.failures += 1;
    return {
      status: "failed",
      asset,
      error:
        lastError ??
        ({
          assetId: asset.id,
          errorMessage: "Unknown error",
          statusCode: 500,
          attempt: this.maxAttempts,
        } as const),
    };
  }

  async tagBatch(assets: Asset[], concurrency: number): Promise<TaggedAsset[]> {
    const safeConcurrency = Math.max(1, Math.floor(concurrency));
    const outcomes: TaggedAsset[] = [];

    for (let i = 0; i < assets.length; i += safeConcurrency) {
      const chunk = assets.slice(i, i + safeConcurrency);
      const settled = await Promise.allSettled(
        chunk.map((asset) => this.tagAsset(asset)),
      );

      settled.forEach((result, index) => {
        if (result.status === "fulfilled") {
          outcomes.push(result.value);
          return;
        }

        const asset = chunk[index];
        this.failures += 1;
        outcomes.push({
          status: "failed",
          asset,
          error: {
            assetId: asset.id,
            errorMessage:
              result.reason instanceof Error
                ? result.reason.message
                : "Batch processing error",
            statusCode: 500,
            attempt: 1,
          },
        });
      });
    }

    return outcomes;
  }

  getStats(): TaggingStats {
    const averageLatencyMs =
      this.successes === 0 ? 0 : this.cumulativeLatencyMs / this.successes;

    return {
      totalApiCalls: this.totalApiCalls,
      successes: this.successes,
      failures: this.failures,
      averageLatencyMs: Number(averageLatencyMs.toFixed(2)),
    };
  }
}

export type {
  Asset,
  Tag,
  TagCategory,
  TaggingResult,
  TaggingError,
  TaggedAsset,
  TaggingStats,
};
export { TaggingService };

