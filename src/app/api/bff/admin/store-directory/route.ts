import { NextRequest, NextResponse } from "next/server";

import { fetchAllStoreDirectory } from "@/lib/server/store-list";

export const runtime = "nodejs";

const globalStoreDirectoryBffState = globalThis as typeof globalThis & {
  __consoleAdminStoreDirectoryCache?: {
    expiresAt: number;
    stores: unknown[];
    totalCount: number;
  };
};

const STORE_DIRECTORY_FALLBACK_TTL_MS = Number.parseInt(
  process.env.CONSOLE_STORE_DIRECTORY_FALLBACK_TTL_MS || "",
  10,
) > 0
  ? Number.parseInt(process.env.CONSOLE_STORE_DIRECTORY_FALLBACK_TTL_MS || "", 10)
  : 5 * 60 * 1000;

const parsePositiveInt = (value: unknown, fallback: number) => {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }

  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
};

const normalizeString = (value: unknown) => {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
};

const readStoreDirectoryFallbackCache = () => {
  const cached = globalStoreDirectoryBffState.__consoleAdminStoreDirectoryCache;
  if (!cached || cached.expiresAt <= Date.now()) {
    return {
      stores: [],
      totalCount: 0,
    };
  }

  return {
    stores: Array.isArray(cached.stores) ? cached.stores : [],
    totalCount: Number(cached.totalCount || 0),
  };
};

const writeStoreDirectoryFallbackCache = (stores: unknown[], totalCount: number) => {
  globalStoreDirectoryBffState.__consoleAdminStoreDirectoryCache = {
    stores,
    totalCount,
    expiresAt: Date.now() + STORE_DIRECTORY_FALLBACK_TTL_MS,
  };
};

export async function POST(request: NextRequest) {
  let body: Record<string, unknown> = {};

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const limit = Math.min(parsePositiveInt(body.limit, 200), 500);
  const startPage = Math.max(parsePositiveInt(body.startPage, 1), 1);
  const maxPages = Math.min(parsePositiveInt(body.maxPages, 12), 20);
  const searchStore = normalizeString(body.searchStore);

  const response = await fetchAllStoreDirectory({
    limit,
    startPage,
    maxPages,
  });

  if (!response.ok) {
    const cached = readStoreDirectoryFallbackCache();
    if (cached.stores.length > 0) {
      const filteredStores = searchStore
        ? cached.stores.filter((store: any) => {
            const candidates = [
              String(store?.storecode || "").trim().toLowerCase(),
              String(store?.storeName || "").trim().toLowerCase(),
              String(store?.companyName || "").trim().toLowerCase(),
            ];

            const normalizedSearch = searchStore.toLowerCase();
            return candidates.some((value) => value.includes(normalizedSearch));
          })
        : cached.stores;

      return NextResponse.json({
        result: {
          fetchedAt: new Date().toISOString(),
          stores: filteredStores,
          totalCount: cached.totalCount || filteredStores.length,
          stale: true,
        },
      });
    }

    return NextResponse.json(
      {
        error:
          String(response.json?.error || response.json?.message || "").trim()
          || "Failed to load store directory",
      },
      { status: response.status || 502 },
    );
  }

  const stores = Array.isArray(response.json?.result?.stores)
    ? response.json.result.stores
    : [];
  const filteredStores = searchStore
    ? stores.filter((store: any) => {
        const candidates = [
          String(store?.storecode || "").trim().toLowerCase(),
          String(store?.storeName || "").trim().toLowerCase(),
          String(store?.companyName || "").trim().toLowerCase(),
        ];

        const normalizedSearch = searchStore.toLowerCase();
        return candidates.some((value) => value.includes(normalizedSearch));
      })
    : stores;

  if (filteredStores.length > 0 || Number(response.json?.result?.totalCount || 0) > 0) {
    writeStoreDirectoryFallbackCache(
      stores,
      Number(response.json?.result?.totalCount || stores.length || 0),
    );
  }

  return NextResponse.json({
    result: {
      fetchedAt: new Date().toISOString(),
      stores: filteredStores,
      totalCount: Number(response.json?.result?.totalCount || filteredStores.length || 0),
    },
  });
}
