import { NextRequest, NextResponse } from "next/server";
import { getRemoteBackendBaseUrl, getRemoteJson, postRemoteJson } from "@/lib/server/remote-backend";

export const runtime = "nodejs";

const normalizeString = (value: unknown) => {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
};

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

const asPlainObject = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
};

const resolveRemoteError = (payload: any, fallback: string) => {
  return normalizeString(payload?.error)
    || normalizeString(payload?.message)
    || normalizeString(payload?.result?.error)
    || fallback;
};

export async function POST(request: NextRequest) {
  let body: Record<string, unknown> = {};

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const signedOrdersBody = asPlainObject(body.signedOrdersBody);
  const signedStoreBody = asPlainObject(body.signedStoreBody);
  const selectedStorecode = normalizeString(body.selectedStorecode);
  const storesLimit = Math.min(parsePositiveInt(body.storesLimit, 200), 300);
  const storesPage = Math.max(parsePositiveInt(body.storesPage, 1), 1);
  const withdrawalLimit = Math.min(parsePositiveInt(body.withdrawalLimit, 24), 80);
  const hasSignedOrdersBody = Object.keys(signedOrdersBody).length > 0;

  const hasSignedStoreBody = Object.keys(signedStoreBody).length > 0;

  const jobs: Array<Promise<{ ok: boolean; status: number; json: any }>> = [
    postRemoteJson(
      hasSignedStoreBody ? "/api/store/getAllStores" : "/api/store/getAllStoresForBalance",
      hasSignedStoreBody
        ? signedStoreBody
        : {
          limit: storesLimit,
          page: storesPage,
        },
    ),
    getRemoteJson("/api/realtime/banktransfer/events", {
      public: "1",
      limit: String(withdrawalLimit),
      transactionType: "withdrawn",
      sort: "asc",
      ...(selectedStorecode ? { storecode: selectedStorecode } : {}),
    }),
  ];

  if (hasSignedOrdersBody) {
    jobs.push(postRemoteJson("/api/order/getAllBuyOrders", signedOrdersBody));
  }

  if (selectedStorecode) {
    jobs.push(
      postRemoteJson("/api/store/getOneStore", {
        storecode: selectedStorecode,
      }),
    );
  }

  const results = await Promise.all(jobs);
  let resultIndex = 0;
  const storesResponse = results[resultIndex++];
  const withdrawalEventsResponse = results[resultIndex++];
  const signedOrdersResponse = hasSignedOrdersBody ? results[resultIndex++] : null;
  const selectedStoreResponse = selectedStorecode ? results[resultIndex++] : null;
  const storesError = storesResponse.ok
    ? ""
    : resolveRemoteError(storesResponse.json, "Failed to load store list");
  const ordersError = hasSignedOrdersBody && signedOrdersResponse && !signedOrdersResponse.ok
    ? resolveRemoteError(signedOrdersResponse.json, "Failed to load clearance orders")
    : "";
  const signedOrdersResult = signedOrdersResponse?.ok
    ? signedOrdersResponse.json?.result || {}
    : {};

  const withdrawalEvents = Array.isArray(withdrawalEventsResponse.json?.events)
    ? withdrawalEventsResponse.json.events
    : [];

  return NextResponse.json({
    result: {
      fetchedAt: new Date().toISOString(),
      remoteBackendBaseUrl: getRemoteBackendBaseUrl(),
      stores: storesResponse.json?.result?.stores || [],
      storeTotalCount: storesResponse.json?.result?.totalCount || 0,
      storesError,
      selectedStore: selectedStoreResponse?.ok ? (selectedStoreResponse.json?.result || null) : null,
      ordersError,
      orders: signedOrdersResult.orders || [],
      totalCount: Number(signedOrdersResult.totalCount || 0),
      totalClearanceCount: Number(
        signedOrdersResult.totalSettlementCount
          ?? signedOrdersResult.totalClearanceCount
          ?? 0,
      ),
      totalClearanceAmount: Number(
        signedOrdersResult.totalSettlementAmount
          ?? signedOrdersResult.totalClearanceAmount
          ?? signedOrdersResult.totalUsdtAmount
          ?? 0,
      ),
      totalClearanceAmountKRW: Number(
        signedOrdersResult.totalSettlementAmountKRW
          ?? signedOrdersResult.totalClearanceAmountKRW
          ?? signedOrdersResult.totalKrwAmount
          ?? 0,
      ),
      withdrawalEvents,
      withdrawalNextCursor: typeof withdrawalEventsResponse.json?.nextCursor === "string"
        ? withdrawalEventsResponse.json.nextCursor
        : null,
    },
  });
}
