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

  const storecode = normalizeString(body.storecode);
  if (!storecode) {
    return NextResponse.json({ error: "storecode is required" }, { status: 400 });
  }

  const signedStoreBody = asPlainObject(body.signedStoreBody);
  const signedMemoBody = asPlainObject(body.signedMemoBody);
  const storeRoute = Object.keys(signedStoreBody).length > 0
    ? "/api/store/getOneStoreAdminSigned"
    : "/api/store/getOneStore";
  const storeRequestBody = Object.keys(signedStoreBody).length > 0
    ? signedStoreBody
    : { storecode };

  const [storeResponse, memoResponse] = await Promise.all([
    postRemoteJson(storeRoute, storeRequestBody),
    Object.keys(signedMemoBody).length > 0
      ? postRemoteJson("/api/store/getStoreMemoSigned", signedMemoBody)
      : Promise.resolve({
          ok: true,
          status: 200,
          json: {
            result: {
              storeMemo: "",
              storeMemoUpdatedAt: null,
            },
          },
        }),
  ]);

  if (!storeResponse.ok) {
    return NextResponse.json(
      {
        error: resolveRemoteError(storeResponse.json, "Failed to load store memo context"),
      },
      { status: storeResponse.status || 502 },
    );
  }

  const hasPrivilegedMemoRead = Object.keys(signedMemoBody).length > 0 && memoResponse.ok;
  const memoReadMessage = hasPrivilegedMemoRead
    ? ""
    : "관리자 지갑 연결 후 가맹점 메모를 조회하고 저장할 수 있습니다.";

  return NextResponse.json({
    result: {
      fetchedAt: new Date().toISOString(),
      remoteBackendBaseUrl: getRemoteBackendBaseUrl(),
      store: storeResponse.json?.result || null,
      storeError: "",
      storeMemo: hasPrivilegedMemoRead
        ? normalizeString(memoResponse.json?.result?.storeMemo)
        : "",
      storeMemoUpdatedAt: hasPrivilegedMemoRead
        ? memoResponse.json?.result?.storeMemoUpdatedAt || null
        : null,
      hasPrivilegedMemoRead,
      memoReadMessage,
      memoError: memoResponse.ok
        ? ""
        : resolveRemoteError(memoResponse.json, "Failed to load store memo"),
    },
  });
}
