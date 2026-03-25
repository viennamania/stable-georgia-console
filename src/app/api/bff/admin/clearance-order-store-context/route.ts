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

  const storecode = normalizeString(body.storecode);
  const signedStoreBody = asPlainObject(body.signedStoreBody);

  if (!storecode) {
    return NextResponse.json(
      {
        error: "storecode is required",
      },
      { status: 400 },
    );
  }

  let storeResponse:
    | Awaited<ReturnType<typeof postRemoteJson>>
    | null = null;
  let hasPrivilegedStoreRead = false;
  let storeReadMessage = "";

  if (Object.keys(signedStoreBody).length > 0) {
    storeResponse = await postRemoteJson("/api/store/getOneStore", signedStoreBody);

    if (storeResponse.ok) {
      hasPrivilegedStoreRead = true;
    } else {
      storeReadMessage = "가맹점 민감정보를 불러오지 못했습니다. 관리자 지갑 권한을 확인해 주세요.";
    }
  } else {
    storeReadMessage = "관리자 지갑 연결 후 구매자 계좌 정보를 확인할 수 있습니다.";
  }

  if (!storeResponse || !storeResponse.ok) {
    storeResponse = await postRemoteJson("/api/store/getOneStore", {
      storecode,
    });
  }

  const sellersBalanceResponse = await postRemoteJson("/api/user/getAllStoreSellersForBalance", {
    storecode,
    limit: 100,
    page: 1,
  });

  const rateResponse = await postRemoteJson("/api/client/getUsdtKRWRateSell", {});

  const storeError = storeResponse.ok
    ? ""
    : resolveRemoteError(storeResponse.json, "Failed to load clearance store");
  const sellersBalanceError = sellersBalanceResponse.ok
    ? ""
    : resolveRemoteError(sellersBalanceResponse.json, "Failed to load seller balances");
  const rateError = rateResponse.ok
    ? ""
    : resolveRemoteError(rateResponse.json, "Failed to load clearance rate");

  return NextResponse.json({
    result: {
      fetchedAt: new Date().toISOString(),
      remoteBackendBaseUrl: getRemoteBackendBaseUrl(),
      storecode,
      store: storeResponse.ok ? (storeResponse.json?.result || null) : null,
      storeError,
      hasPrivilegedStoreRead,
      storeReadMessage,
      sellersBalance: sellersBalanceResponse.ok
        ? (Array.isArray(sellersBalanceResponse.json?.result?.users)
          ? sellersBalanceResponse.json.result.users
          : [])
        : [],
      sellersBalanceError,
      rate: rateResponse.ok ? Number(rateResponse.json?.result || 0) : 0,
      rateError,
    },
  });
}
