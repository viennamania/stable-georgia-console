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
  const orderFilters = asPlainObject(body.orderFilters);
  const selectedStorecode = normalizeString(body.selectedStorecode);
  const unmatchedFilters = asPlainObject(body.unmatchedFilters);
  const unmatchedLimit = Math.min(parsePositiveInt(unmatchedFilters.limit, 40), 120);
  const unmatchedPage = Math.max(parsePositiveInt(unmatchedFilters.page, 1), 1);
  const unmatchedFromDate = normalizeString(unmatchedFilters.fromDate);
  const unmatchedToDate = normalizeString(unmatchedFilters.toDate);
  const unmatchedStorecode = normalizeString(unmatchedFilters.storecode || selectedStorecode);
  const hasSignedOrdersBody = Object.keys(signedOrdersBody).length > 0;
  const requesterWalletAddress = normalizeString(signedOrdersBody.requesterWalletAddress);
  const requesterStorecode = normalizeString(signedOrdersBody.requesterStorecode) || "admin";
  const unsignedOrdersBody = {
    storecode: selectedStorecode,
    limit: Math.min(parsePositiveInt(orderFilters.limit, 100), 200),
    page: Math.max(parsePositiveInt(orderFilters.page, 1), 1),
    fromDate: normalizeString(orderFilters.fromDate),
    toDate: normalizeString(orderFilters.toDate),
    searchTradeId: normalizeString(orderFilters.searchTradeId),
    searchOrderStatusCancelled: Boolean(orderFilters.searchOrderStatusCancelled),
    searchOrderStatusCompleted: Boolean(orderFilters.searchOrderStatusCompleted),
  };

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
    postRemoteJson("/api/bankTransfer/getAll", {
      limit: unmatchedLimit,
      page: unmatchedPage,
      transactionType: "deposited",
      matchStatus: "notSuccess",
      fromDate: unmatchedFromDate,
      toDate: unmatchedToDate,
      storecode: unmatchedStorecode,
    }),
    getRemoteJson("/api/realtime/banktransfer/summary", selectedStorecode
      ? {
          public: "1",
          storecode: selectedStorecode,
        }
      : {
          public: "1",
        }),
  ];

  if (selectedStorecode) {
    jobs.push(
      postRemoteJson("/api/store/getOneStore", {
        storecode: selectedStorecode,
      }),
    );
  }

  jobs.push(
    postRemoteJson(
      "/api/order/getAllBuyOrders",
      hasSignedOrdersBody ? signedOrdersBody : unsignedOrdersBody,
    ),
  );

  const results = await Promise.all(jobs);

  const totalBuyOrdersResponse = results[0];
  const totalClearanceOrdersResponse = results[1];
  const tradeSummaryResponse = results[2];
  const unmatchedTransfersResponse = results[3];
  const banktransferSummaryResponse = results[4];
  const selectedStoreResponse = selectedStorecode ? results[5] : null;
  const ordersResponse = results[results.length - 1];
  const ordersResult = ordersResponse?.json?.result || {};

  if (ordersResponse && !ordersResponse.ok) {
    return NextResponse.json(
      {
        error: resolveRemoteError(ordersResponse.json, "Failed to load buy orders"),
      },
      { status: ordersResponse.status || 502 },
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
        totalCount: Number(ordersResult.totalCount || tradeSummaryResponse.json?.result?.totalCount || 0),
        totalUsdtAmount: Number(ordersResult.totalUsdtAmount || 0),
        totalKrwAmount: Number(ordersResult.totalKrwAmount || 0),
        totalSettlementCount: Number(ordersResult.totalSettlementCount || tradeSummaryResponse.json?.result?.totalSettlementCount || 0),
        totalSettlementAmount: Number(ordersResult.totalSettlementAmount || 0),
        totalSettlementAmountKRW: Number(ordersResult.totalSettlementAmountKRW || 0),
        totalFeeAmount: Number(ordersResult.totalFeeAmount || 0),
        totalFeeAmountKRW: Number(ordersResult.totalFeeAmountKRW || 0),
        totalAgentFeeAmount: Number(ordersResult.totalAgentFeeAmount || 0),
        totalAgentFeeAmountKRW: Number(ordersResult.totalAgentFeeAmountKRW || 0),
      },
      ordersAccessLevel: String(ordersResult?.view || (hasSignedOrdersBody ? "privileged" : "public")),
      sellerBankTradeStats: Array.isArray(ordersResult.totalBySellerBankAccountNumber)
        ? ordersResult.totalBySellerBankAccountNumber
        : [],
      banktransferTodaySummary: {
        dateKst: String(banktransferSummaryResponse?.json?.summary?.dateKst || ""),
        depositedAmount: Number(banktransferSummaryResponse?.json?.summary?.depositedAmount || 0),
        withdrawnAmount: Number(banktransferSummaryResponse?.json?.summary?.withdrawnAmount || 0),
        depositedCount: Number(banktransferSummaryResponse?.json?.summary?.depositedCount || 0),
        withdrawnCount: Number(banktransferSummaryResponse?.json?.summary?.withdrawnCount || 0),
        totalCount: Number(banktransferSummaryResponse?.json?.summary?.totalCount || 0),
        updatedAt: String(banktransferSummaryResponse?.json?.summary?.updatedAt || ""),
      },
      orders: ordersResponse?.json?.result?.orders || [],
      orderTotalCount: ordersResponse?.json?.result?.totalCount || 0,
      processingBuyOrders: totalBuyOrdersResponse.json?.result?.orders || [],
      processingClearanceOrders: totalClearanceOrdersResponse.json?.result?.orders || [],
      unmatchedTransfers: unmatchedTransfersResponse.json?.result?.transfers || [],
      unmatchedTotalAmount: unmatchedTransfersResponse.json?.result?.totalAmount || 0,
      unmatchedTotalCount: unmatchedTransfersResponse.json?.result?.totalCount || 0,
      selectedStore: selectedStoreResponse?.json?.result || null,
    },
  });
}
