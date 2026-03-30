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

const resolveRemoteError = (payload: any, fallback: string) =>
  normalizeString(payload?.error)
  || normalizeString(payload?.message)
  || normalizeString(payload?.result?.error)
  || fallback;

export async function POST(request: NextRequest) {
  let body: Record<string, unknown> = {};

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const signedStatsBody = asPlainObject(body.signedStatsBody);
  const statsFilters = asPlainObject(body.statsFilters);
  const hasSignedStatsBody = Object.keys(signedStatsBody).length > 0;
  const unsignedStatsBody = {
    storecode: normalizeString(statsFilters.storecode),
    limit: Math.min(parsePositiveInt(statsFilters.limit, 30), 180),
    page: Math.max(parsePositiveInt(statsFilters.page, 1), 1),
    fromDate: normalizeString(statsFilters.fromDate),
    toDate: normalizeString(statsFilters.toDate),
  };

  const remoteResponse = await postRemoteJson(
    "/api/order/getAdminTradeHistoryDaily",
    hasSignedStatsBody ? signedStatsBody : unsignedStatsBody,
  );

  if (!remoteResponse.ok) {
    return NextResponse.json(
      {
        error: resolveRemoteError(remoteResponse.json, "Failed to load daily trade history"),
      },
      { status: remoteResponse.status || 502 },
    );
  }

  const result = remoteResponse.json?.result || {};

  return NextResponse.json({
    result: {
      fetchedAt: new Date().toISOString(),
      remoteBackendBaseUrl: getRemoteBackendBaseUrl(),
      statsAccessLevel: String(result?.view || (hasSignedStatsBody ? "privileged" : "public")),
      statsError: "",
      rows: Array.isArray(result?.orders) ? result.orders : [],
      totalCount: Number(result?.totalCount || 0),
      totalPages: Number(result?.totalPages || 1),
      page: Number(result?.page || 1),
      limit: Number(result?.limit || unsignedStatsBody.limit),
      totalTradeCount: Number(result?.totalTradeCount || 0),
      totalTradeUsdtAmount: Number(result?.totalTradeUsdtAmount || 0),
      totalTradeKrwAmount: Number(result?.totalTradeKrwAmount || 0),
      totalSettlementCount: Number(result?.totalSettlementCount || 0),
      totalSettlementAmount: Number(result?.totalSettlementAmount || 0),
      totalSettlementAmountKRW: Number(result?.totalSettlementAmountKRW || 0),
      totalAgentFeeAmount: Number(result?.totalAgentFeeAmount || 0),
      totalAgentFeeAmountKRW: Number(result?.totalAgentFeeAmountKRW || 0),
      totalFeeAmount: Number(result?.totalFeeAmount || 0),
      totalFeeAmountKRW: Number(result?.totalFeeAmountKRW || 0),
      totalClearanceCount: Number(result?.totalClearanceCount || 0),
      totalClearanceUsdtAmount: Number(result?.totalClearanceUsdtAmount || 0),
      totalClearanceKrwAmount: Number(result?.totalClearanceKrwAmount || 0),
      fromDate: normalizeString(result?.fromDate),
      toDate: normalizeString(result?.toDate),
    },
  });
}
