import { NextRequest, NextResponse } from "next/server";

import { postRemoteJson } from "@/lib/server/remote-backend";

export const runtime = "nodejs";

const ALLOWED_ROUTES = new Set([
  "/api/store/updateClearanceSortOrders",
  "/api/store/setStore",
  "/api/store/setStoreName",
  "/api/store/setStoreDescription",
  "/api/store/setStoreLogo",
  "/api/store/setStoreWithdrawalBankInfo",
  "/api/store/setStoreWithdrawalBankInfoAAA",
  "/api/store/setStoreWithdrawalBankInfoBBB",
  "/api/store/updateStoreAdminWalletAddress",
  "/api/store/getStoreAdminWalletAddressHistory",
  "/api/store/updateStoreEscrowAmountUSDT",
  "/api/store/updatePayactionKeys",
  "/api/store/updateBackgroundColor",
  "/api/store/updateAgentcode",
  "/api/store/updateStorePaymentUrl",
  "/api/store/updateMaxPaymentAmountKRW",
  "/api/store/updateStoreAccessToken",
  "/api/store/toggleLive",
  "/api/store/toggleView",
  "/api/store/setStoreMemo",
]);

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

  const route = normalizeString(body.route);
  const signedBody = asPlainObject(body.signedBody);

  if (!ALLOWED_ROUTES.has(route)) {
    return NextResponse.json(
      {
        error: "Unsupported signed store action route",
      },
      { status: 400 },
    );
  }

  if (!Object.keys(signedBody).length) {
    return NextResponse.json(
      {
        error: "signedBody is required",
      },
      { status: 400 },
    );
  }

  const response = await postRemoteJson(route, signedBody);

  if (!response.ok) {
    return NextResponse.json(
      {
        error: resolveRemoteError(response.json, "Signed store action failed"),
        result: response.json?.result || null,
      },
      { status: response.status || 502 },
    );
  }

  return NextResponse.json({
    result: response.json?.result || null,
    success: true,
  });
}
