import { postRemoteJson } from "@/lib/server/remote-backend";

type RemoteJsonResponse = Awaited<ReturnType<typeof postRemoteJson>>;

type FetchAllStoresOptions = {
  limit?: number;
  startPage?: number;
  maxPages?: number;
};

const normalizeStoreKey = (store: any, fallbackIndex: number) => {
  const storecode = String(store?.storecode || "").trim();
  if (storecode) {
    return storecode;
  }

  const storeName = String(store?.storeName || store?.companyName || "").trim();
  if (storeName) {
    return `${storeName}:${fallbackIndex}`;
  }

  return `store:${fallbackIndex}`;
};

const fetchAllStoresByRoute = async (
  route: string,
  options?: FetchAllStoresOptions,
): Promise<RemoteJsonResponse> => {
  const limit = Math.max(1, Math.min(Number(options?.limit || 200), 300));
  const startPage = Math.max(1, Number(options?.startPage || 1));
  const maxPages = Math.max(1, Number(options?.maxPages || 12));

  let page = startPage;
  let firstResponse: RemoteJsonResponse | null = null;
  let totalCount = 0;
  const mergedStores: any[] = [];

  while (page < startPage + maxPages) {
    const response = await postRemoteJson(route, {
      limit,
      page,
    });

    if (!firstResponse) {
      firstResponse = response;
    }

    if (!response.ok) {
      return response;
    }

    const stores = Array.isArray(response.json?.result?.stores)
      ? response.json.result.stores
      : [];

    totalCount = Number(response.json?.result?.totalCount || totalCount || stores.length || 0);
    mergedStores.push(...stores);

    if (stores.length < limit) {
      break;
    }

    if (totalCount > 0 && mergedStores.length >= totalCount) {
      break;
    }

    page += 1;
  }

  const dedupedStores = mergedStores.filter((store, index, source) => {
    const key = normalizeStoreKey(store, index);
    return source.findIndex((candidate, candidateIndex) => {
      return normalizeStoreKey(candidate, candidateIndex) === key;
    }) === index;
  });

  return {
    ok: firstResponse?.ok ?? true,
    status: firstResponse?.status ?? 200,
    json: {
      ...(firstResponse?.json || {}),
      result: {
        ...(firstResponse?.json?.result || {}),
        stores: dedupedStores,
        totalCount: totalCount || dedupedStores.length,
      },
    },
  };
};

export const fetchAllStoresForBalance = async (
  options?: FetchAllStoresOptions,
): Promise<RemoteJsonResponse> => {
  return fetchAllStoresByRoute("/api/store/getAllStoresForBalance", options);
};

export const fetchAllStoreDirectory = async (
  options?: FetchAllStoresOptions,
): Promise<RemoteJsonResponse> => {
  return fetchAllStoresByRoute("/api/store/getStoreDirectory", options);
};

export const fetchAllStoresWithBankInfo = async (
  options?: FetchAllStoresOptions,
): Promise<RemoteJsonResponse> => {
  return fetchAllStoresByRoute("/api/store/getAllStores", options);
};
