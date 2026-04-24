import { TaggingService, type Asset } from "./tagging-client";

async function main(): Promise<void> {
  const service = new TaggingService({ maxAttempts: 3, baseBackoffMs: 150 });

  const singleAsset: Asset = {
    id: "asset-001",
    name: "Nike Hero Banner",
    type: "image",
    description: "Dark background hero creative for Q3 campaign",
  };

  const singleResult = await service.tagAsset(singleAsset);
  console.log("Single asset result:");
  console.log(JSON.stringify(singleResult, null, 2));

  const batchAssets: Asset[] = [
    {
      id: "asset-002",
      name: "Adidas Lifestyle Shot",
      type: "image",
      description: "Lifestyle shot with bright colors",
    },
    {
      id: "asset-003",
      name: "Nike Product Video",
      type: "video",
      description: "Short product promo clip",
    },
    {
      id: "asset-004",
      name: "Campaign Deck",
      type: "pdf",
      description: "Q3 campaign summary and assets",
    },
  ];

  const batchResults = await service.tagBatch(batchAssets, 2);
  console.log("\nBatch results:");
  console.log(JSON.stringify(batchResults, null, 2));

  console.log("\nStats:");
  console.log(service.getStats());
}

main().catch((error: unknown) => {
  console.error("Demo failed:", error);
  process.exitCode = 1;
});
