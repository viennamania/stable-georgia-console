import { NextRequest, NextResponse } from "next/server";

import { postRemoteJson } from "@/lib/server/remote-backend";

export const runtime = "nodejs";

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

const normalizeString = (value: unknown) => {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
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

  const limit = Math.min(parsePositiveInt(body.limit, 300), 500);
  const page = Math.max(parsePositiveInt(body.page, 1), 1);
  const searchStore = normalizeString(body.searchStore);

  const response = await postRemoteJson("/api/store/getClearanceStoreDirectory", {
    limit,
    page,
    searchStore,
  });

  if (!response.ok) {
    return NextResponse.json(
      {
        error: resolveRemoteError(response.json, "Failed to load clearance stores"),
        result: {
          stores: [],
          totalCount: 0,
        },
      },
      { status: response.status || 502 },
    );
  }

  return NextResponse.json({
    result: {
      stores: Array.isArray(response.json?.result?.stores) ? response.json.result.stores : [],
      totalCount: Number(response.json?.result?.totalCount || 0),
    },
  });
}
