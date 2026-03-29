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

  const signedBody = asPlainObject(body.signedBody);

  if (Object.keys(signedBody).length === 0) {
    return NextResponse.json({
      result: {
        remoteBackendBaseUrl: getRemoteBackendBaseUrl(),
        items: [],
        totalCount: 0,
      },
    });
  }

  const response = await postRemoteJson(
    "/api/order/getClearanceSellerBankBalanceSummary",
    signedBody,
  );

  if (!response.ok) {
    return NextResponse.json(
      {
        error: resolveRemoteError(
          response.json,
          "Failed to load clearance seller bank balance summary",
        ),
        result: {
          remoteBackendBaseUrl: getRemoteBackendBaseUrl(),
          items: [],
          totalCount: 0,
        },
      },
      { status: response.status || 502 },
    );
  }

  return NextResponse.json({
    result: {
      remoteBackendBaseUrl: getRemoteBackendBaseUrl(),
      items: Array.isArray(response.json?.result?.items) ? response.json.result.items : [],
      totalCount: Number(response.json?.result?.totalCount || 0),
    },
  });
}
