import { NextRequest, NextResponse } from "next/server";
import { getRemoteBackendBaseUrl, getRemoteJson, postRemoteJson } from "@/lib/server/remote-backend";
import { fetchAllStoresForBalance } from "@/lib/server/store-list";

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

const normalizeBankTransferTransactionType = (value: unknown) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "withdrawn" || normalized === "withdrawal" || normalized === "출금") {
    return "withdrawn";
  }
  if (normalized === "deposited" || normalized === "deposit" || normalized === "입금") {
    return "deposited";
  }
  return normalized;
};

const getBankTransferEventTimestamp = (event: any) => {
  const candidates = [
    event?.processingDate,
    event?.transactionDate,
    event?.publishedAt,
  ];

  for (const value of candidates) {
    const timestamp = Date.parse(String(value || "").trim());
    if (!Number.isNaN(timestamp)) {
      return timestamp;
    }
  }

  return 0;
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
  const storesLimit = Math.min(parsePositiveInt(body.storesLimit, 200), 300);
  const storesPage = Math.max(parsePositiveInt(body.storesPage, 1), 1);
  const withdrawalLimit = Math.min(parsePositiveInt(body.withdrawalLimit, 24), 80);
  const withdrawalSnapshotFetchLimit = Math.max(withdrawalLimit * 4, 96);
  const hasSignedOrdersBody = Object.keys(signedOrdersBody).length > 0;

  const jobs: Array<Promise<{ ok: boolean; status: number; json: any }>> = [
    fetchAllStoresForBalance({
      limit: storesLimit,
      startPage: storesPage,
    }),
    getRemoteJson("/api/realtime/banktransfer/events", {
      public: "1",
      limit: String(withdrawalSnapshotFetchLimit),
    }),
  ];

  if (hasSignedOrdersBody) {
    jobs.push(postRemoteJson("/api/order/getAllBuyOrders", signedOrdersBody));
  }

  const results = await Promise.all(jobs);
  const storesResponse = results[0];
  const withdrawalEventsResponse = results[1];
  const signedOrdersResponse = hasSignedOrdersBody
    ? results[results.length - 1]
    : null;
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
      .filter((event: any) => {
        return normalizeBankTransferTransactionType(event?.transactionType) === "withdrawn";
      })
      .sort((left: any, right: any) => getBankTransferEventTimestamp(right) - getBankTransferEventTimestamp(left))
      .slice(0, withdrawalLimit)
    : [];

  return NextResponse.json({
    result: {
      fetchedAt: new Date().toISOString(),
      remoteBackendBaseUrl: getRemoteBackendBaseUrl(),
      stores: storesResponse.json?.result?.stores || [],
      storeTotalCount: storesResponse.json?.result?.totalCount || 0,
      storesError,
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
