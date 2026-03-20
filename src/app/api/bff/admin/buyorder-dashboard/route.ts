import { NextRequest, NextResponse } from "next/server";
import { getRemoteBackendBaseUrl, postRemoteJson } from "@/lib/server/remote-backend";

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
  const selectedStorecode = normalizeString(body.selectedStorecode);
  const storesLimit = Math.min(parsePositiveInt(body.storesLimit, 100), 200);
  const storesPage = Math.max(parsePositiveInt(body.storesPage, 1), 1);
  const unmatchedFilters = asPlainObject(body.unmatchedFilters);
  const unmatchedLimit = Math.min(parsePositiveInt(unmatchedFilters.limit, 40), 120);
  const unmatchedPage = Math.max(parsePositiveInt(unmatchedFilters.page, 1), 1);
  const unmatchedFromDate = normalizeString(unmatchedFilters.fromDate);
  const unmatchedToDate = normalizeString(unmatchedFilters.toDate);
  const unmatchedStorecode = normalizeString(unmatchedFilters.storecode || selectedStorecode);
  const hasSignedOrdersBody = Object.keys(signedOrdersBody).length > 0;
  const requesterWalletAddress = normalizeString(signedOrdersBody.requesterWalletAddress);
  const requesterStorecode = normalizeString(signedOrdersBody.requesterStorecode) || "admin";

  const jobs: Array<Promise<{ ok: boolean; status: number; json: any }>> = [
    postRemoteJson("/api/order/getTotalNumberOfBuyOrders", {}),
    postRemoteJson("/api/order/getTotalNumberOfClearanceOrders", {}),
    postRemoteJson("/api/summary/getTradeSummary", {
      requesterStorecode,
      walletAddress: requesterWalletAddress,
      storecode: selectedStorecode,
      fromDate: normalizeString(signedOrdersBody.fromDate),
      toDate: normalizeString(signedOrdersBody.toDate),
      searchBuyer: normalizeString(signedOrdersBody.searchBuyer),
      searchOrderStatusCompleted: Boolean(signedOrdersBody.searchOrderStatusCompleted),
    }),
    postRemoteJson("/api/store/getAllStoresForBalance", {
      limit: storesLimit,
      page: storesPage,
    }),
    postRemoteJson("/api/bankTransfer/getAll", {
      limit: unmatchedLimit,
      page: unmatchedPage,
      transactionType: "deposited",
      matchStatus: "notSuccess",
      fromDate: unmatchedFromDate,
      toDate: unmatchedToDate,
      storecode: unmatchedStorecode,
    }),
  ];

  if (selectedStorecode) {
    jobs.push(
      postRemoteJson("/api/store/getOneStore", {
        storecode: selectedStorecode,
      }),
    );
  }

  if (hasSignedOrdersBody) {
    jobs.push(postRemoteJson("/api/order/getAllBuyOrders", signedOrdersBody));
  }

  const results = await Promise.all(jobs);

  const totalBuyOrdersResponse = results[0];
  const totalClearanceOrdersResponse = results[1];
  const tradeSummaryResponse = results[2];
  const storesResponse = results[3];
  const unmatchedTransfersResponse = results[4];
  const selectedStoreResponse = selectedStorecode ? results[5] : null;
  const signedOrdersResponse = hasSignedOrdersBody
    ? results[results.length - 1]
    : null;
  const signedOrdersResult = signedOrdersResponse?.json?.result || {};

  if (hasSignedOrdersBody && signedOrdersResponse && !signedOrdersResponse.ok) {
    return NextResponse.json(
      {
        error: resolveRemoteError(signedOrdersResponse.json, "Failed to load buy orders"),
      },
      { status: signedOrdersResponse.status || 502 },
    );
  }

  return NextResponse.json({
    result: {
      fetchedAt: new Date().toISOString(),
      remoteBackendBaseUrl: getRemoteBackendBaseUrl(),
      metrics: {
        totalBuyOrders: totalBuyOrdersResponse.json?.result?.totalCount || 0,
        totalClearanceOrders: totalClearanceOrdersResponse.json?.result?.totalCount || 0,
        audioOnBuyOrders: totalBuyOrdersResponse.json?.result?.audioOnCount || 0,
        p2pTradeCount: tradeSummaryResponse.json?.result?.totalCount || 0,
        storePaymentCount: tradeSummaryResponse.json?.result?.totalSettlementCount || 0,
      },
      tradeSummary: {
        totalCount: Number(signedOrdersResult.totalCount || tradeSummaryResponse.json?.result?.totalCount || 0),
        totalUsdtAmount: Number(signedOrdersResult.totalUsdtAmount || 0),
        totalKrwAmount: Number(signedOrdersResult.totalKrwAmount || 0),
        totalSettlementCount: Number(signedOrdersResult.totalSettlementCount || tradeSummaryResponse.json?.result?.totalSettlementCount || 0),
        totalSettlementAmount: Number(signedOrdersResult.totalSettlementAmount || 0),
        totalSettlementAmountKRW: Number(signedOrdersResult.totalSettlementAmountKRW || 0),
        totalFeeAmount: Number(signedOrdersResult.totalFeeAmount || 0),
        totalFeeAmountKRW: Number(signedOrdersResult.totalFeeAmountKRW || 0),
        totalAgentFeeAmount: Number(signedOrdersResult.totalAgentFeeAmount || 0),
        totalAgentFeeAmountKRW: Number(signedOrdersResult.totalAgentFeeAmountKRW || 0),
      },
      orders: signedOrdersResponse?.json?.result?.orders || [],
      orderTotalCount: signedOrdersResponse?.json?.result?.totalCount || 0,
      processingBuyOrders: totalBuyOrdersResponse.json?.result?.orders || [],
      processingClearanceOrders: totalClearanceOrdersResponse.json?.result?.orders || [],
      stores: storesResponse.json?.result?.stores || [],
      storeTotalCount: storesResponse.json?.result?.totalCount || 0,
      unmatchedTransfers: unmatchedTransfersResponse.json?.result?.transfers || [],
      unmatchedTotalAmount: unmatchedTransfersResponse.json?.result?.totalAmount || 0,
      unmatchedTotalCount: unmatchedTransfersResponse.json?.result?.totalCount || 0,
      selectedStore: selectedStoreResponse?.json?.result || null,
    },
  });
}
