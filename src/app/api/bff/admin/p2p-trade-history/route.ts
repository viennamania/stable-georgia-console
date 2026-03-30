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
  const unsignedOrdersBody = {
    storecode: normalizeString(orderFilters.storecode),
    limit: Math.min(parsePositiveInt(orderFilters.limit, 30), 200),
    page: Math.max(parsePositiveInt(orderFilters.page, 1), 1),
    fromDate: normalizeString(orderFilters.fromDate),
    toDate: normalizeString(orderFilters.toDate),
    searchKeyword: normalizeString(orderFilters.searchKeyword),
    searchTradeId: normalizeString(orderFilters.searchTradeId),
    searchStoreName: normalizeString(orderFilters.searchStoreName),
    searchBuyer: normalizeString(orderFilters.searchBuyer),
    searchSeller: normalizeString(orderFilters.searchSeller),
    searchDepositName: normalizeString(orderFilters.searchDepositName),
    searchBuyerBankAccountNumber: normalizeString(orderFilters.searchBuyerBankAccountNumber),
    searchSellerBankAccountNumber: normalizeString(orderFilters.searchSellerBankAccountNumber),
    userType: normalizeString(orderFilters.userType),
  };

  const remoteResponse = await postRemoteJson(
    "/api/order/getAdminP2PTradeHistory",
    hasSignedOrdersBody ? signedOrdersBody : unsignedOrdersBody,
  );

  if (!remoteResponse.ok) {
    return NextResponse.json(
      {
        error: resolveRemoteError(remoteResponse.json, "Failed to load P2P trade history"),
      },
      { status: remoteResponse.status || 502 },
    );
  }

  const result = remoteResponse.json?.result || {};

  return NextResponse.json({
    result: {
      fetchedAt: new Date().toISOString(),
      remoteBackendBaseUrl: getRemoteBackendBaseUrl(),
      ordersAccessLevel: String(result?.view || (hasSignedOrdersBody ? "privileged" : "public")),
      ordersError: "",
      orders: Array.isArray(result?.orders) ? result.orders : [],
      totalCount: Number(result?.totalCount || 0),
      totalKrwAmount: Number(result?.totalKrwAmount || 0),
      totalUsdtAmount: Number(result?.totalUsdtAmount || 0),
      totalSettlementCount: Number(result?.totalSettlementCount || 0),
      totalSettlementAmount: Number(result?.totalSettlementAmount || 0),
      totalSettlementAmountKRW: Number(result?.totalSettlementAmountKRW || 0),
      totalFeeAmount: Number(result?.totalFeeAmount || 0),
      totalFeeAmountKRW: Number(result?.totalFeeAmountKRW || 0),
      totalAgentFeeAmount: Number(result?.totalAgentFeeAmount || 0),
      totalAgentFeeAmountKRW: Number(result?.totalAgentFeeAmountKRW || 0),
    },
  });
}
