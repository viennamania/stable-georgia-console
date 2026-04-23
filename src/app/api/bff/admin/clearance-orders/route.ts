import { NextRequest, NextResponse } from "next/server";

import { getRemoteBackendBaseUrl, postRemoteJson } from "@/lib/server/remote-backend";

export const runtime = "nodejs";

type OrdersQueryMode = "buyOrders" | "collectOrdersForSeller" | "clearanceHistory";

const normalizeString = (value: unknown) => {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
};

const asPlainObject = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
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
  const orderFilters = asPlainObject(body.orderFilters);
  const hasSignedOrdersBody = Object.keys(signedOrdersBody).length > 0;
  const normalizedOrdersQueryMode = normalizeString(body.ordersQueryMode);
  const ordersQueryMode: OrdersQueryMode =
    normalizedOrdersQueryMode === "collectOrdersForSeller"
      ? "collectOrdersForSeller"
      : normalizedOrdersQueryMode === "clearanceHistory"
        ? "clearanceHistory"
        : "buyOrders";
  const unsignedOrdersBody = {
    storecode: normalizeString(orderFilters.storecode),
    limit: Math.min(parsePositiveInt(orderFilters.limit, 30), 200),
    page: Math.max(parsePositiveInt(orderFilters.page, 1), 1),
    fromDate: normalizeString(orderFilters.fromDate),
    toDate: normalizeString(orderFilters.toDate),
    ...(ordersQueryMode === "clearanceHistory" ? { privateSale: true } : {}),
  };

  if (!hasSignedOrdersBody && ordersQueryMode === "collectOrdersForSeller") {
    return NextResponse.json({
      result: {
        remoteBackendBaseUrl: getRemoteBackendBaseUrl(),
        ordersError: "",
        ordersAccessLevel: "public",
        orders: [],
        totalCount: 0,
        totalClearanceCount: 0,
        totalClearanceAmount: 0,
        totalClearanceAmountKRW: 0,
      },
    });
  }

  const remoteOrdersRoute = ordersQueryMode === "collectOrdersForSeller"
    ? "/api/order/getAllCollectOrdersForSeller"
    : ordersQueryMode === "clearanceHistory"
      ? "/api/order/getAllBuyOrders"
      : "/api/order/getAdminClearanceOrders";
  const signedOrdersResponse = await postRemoteJson(
    remoteOrdersRoute,
    hasSignedOrdersBody ? signedOrdersBody : unsignedOrdersBody,
  );
  const ordersError = signedOrdersResponse.ok
    ? ""
    : resolveRemoteError(signedOrdersResponse.json, "Failed to load clearance orders");
  const signedOrdersResult = signedOrdersResponse.ok
    ? signedOrdersResponse.json?.result || {}
    : {};

  const mappedSummary = ordersQueryMode === "collectOrdersForSeller"
    ? {
      totalCount: Number(signedOrdersResult.totalCount || 0),
      totalClearanceCount: Number(signedOrdersResult.totalClearanceCount || 0),
      totalClearanceAmount: Number(signedOrdersResult.totalClearanceAmount || 0),
      totalClearanceAmountKRW: Number(signedOrdersResult.totalClearanceAmountKRW || 0),
    }
    : ordersQueryMode === "clearanceHistory"
      ? {
        totalCount: Number(signedOrdersResult.totalCount || 0),
        totalClearanceCount: Number(
          signedOrdersResult.totalCount
            ?? signedOrdersResult.totalSettlementCount
            ?? 0,
        ),
        totalClearanceAmount: Number(
          signedOrdersResult.totalUsdtAmount
            ?? signedOrdersResult.totalSettlementAmount
            ?? 0,
        ),
        totalClearanceAmountKRW: Number(
          signedOrdersResult.totalKrwAmount
            ?? signedOrdersResult.totalSettlementAmountKRW
            ?? 0,
        ),
      }
      : {
        totalCount: Number(signedOrdersResult.totalCount || 0),
        totalClearanceCount: Number(
          signedOrdersResult.totalClearanceCount
            ?? signedOrdersResult.totalTransferCount
            ?? 0,
        ),
        totalClearanceAmount: Number(
          signedOrdersResult.totalClearanceAmount
            ?? signedOrdersResult.totalTransferAmount
            ?? 0,
        ),
        totalClearanceAmountKRW: Number(
          signedOrdersResult.totalClearanceAmountKRW
            ?? signedOrdersResult.totalTransferAmountKRW
            ?? 0,
        ),
      };

  return NextResponse.json({
    result: {
      remoteBackendBaseUrl: getRemoteBackendBaseUrl(),
      ordersError,
      ordersAccessLevel: String(
        signedOrdersResult?.view || (hasSignedOrdersBody ? "privileged" : "public"),
      ),
      ordersAuthIntent: Boolean(signedOrdersResult?.authIntent),
      ordersAuthStatus: Number(signedOrdersResult?.authStatus || 0),
      ordersAuthError: normalizeString(signedOrdersResult?.authError),
      ordersAuthRecoverySuggested: Boolean(signedOrdersResult?.authRecoverySuggested),
      orders: signedOrdersResult.orders || [],
      ...mappedSummary,
    },
  });
}
