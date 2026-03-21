import { NextRequest, NextResponse } from "next/server";

import { getRemoteBackendBaseUrl, postRemoteJson } from "@/lib/server/remote-backend";

export const runtime = "nodejs";

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

  const signedOrdersResponse = await postRemoteJson("/api/order/getAllBuyOrders", signedOrdersBody);
  const ordersError = signedOrdersResponse.ok
    ? ""
    : resolveRemoteError(signedOrdersResponse.json, "Failed to load clearance orders");
  const signedOrdersResult = signedOrdersResponse.ok
    ? signedOrdersResponse.json?.result || {}
    : {};

  return NextResponse.json({
    result: {
      remoteBackendBaseUrl: getRemoteBackendBaseUrl(),
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
    },
  });
}
