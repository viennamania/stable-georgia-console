import { NextRequest, NextResponse } from "next/server";

import { getRemoteBackendBaseUrl, postRemoteJson } from "@/lib/server/remote-backend";

export const runtime = "nodejs";

type OrdersQueryMode = "buyOrders" | "collectOrdersForSeller";

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
  const hasSignedOrdersBody = Object.keys(signedOrdersBody).length > 0;
  const ordersQueryMode: OrdersQueryMode =
    normalizeString(body.ordersQueryMode) === "collectOrdersForSeller"
      ? "collectOrdersForSeller"
      : "buyOrders";

  if (!hasSignedOrdersBody) {
    return NextResponse.json({
      result: {
        remoteBackendBaseUrl: getRemoteBackendBaseUrl(),
        ordersError: "",
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
    : "/api/order/getAdminClearanceOrders";
  const signedOrdersResponse = await postRemoteJson(remoteOrdersRoute, signedOrdersBody);
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
      orders: signedOrdersResult.orders || [],
      ...mappedSummary,
    },
  });
}
