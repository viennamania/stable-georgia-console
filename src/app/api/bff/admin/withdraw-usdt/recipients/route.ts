import { NextRequest, NextResponse } from "next/server";

import { postRemoteJson } from "@/lib/server/remote-backend";

export const runtime = "nodejs";

const normalizeString = (value: unknown) => {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
};

const normalizePositiveInteger = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
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

  const keyword = normalizeString(body.keyword);
  const limit = Math.min(50, normalizePositiveInteger(body.limit, 20));
  const page = normalizePositiveInteger(body.page, 1);
  const response = await postRemoteJson("/api/user/getAllServerWalletUsers", {
    keyword,
    limit,
    page,
  });

  if (!response.ok) {
    return NextResponse.json(
      {
        error: resolveRemoteError(response.json, "Failed to load server wallet users"),
        result: null,
      },
      { status: response.status || 502 },
    );
  }

  const users = Array.isArray(response.json?.result?.users)
    ? response.json.result.users
    : [];

  return NextResponse.json({
    result: {
      users,
      totalCount: Number(response.json?.result?.totalCount || 0),
    },
  });
}
