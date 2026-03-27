import { NextRequest, NextResponse } from "next/server";

import { getRemoteJson } from "@/lib/server/remote-backend";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const query = new URLSearchParams();

  query.set("public", "1");

  const since = request.nextUrl.searchParams.get("since")?.trim();
  const limit = request.nextUrl.searchParams.get("limit")?.trim();
  const transactionType = request.nextUrl.searchParams.get("transactionType")?.trim();
  const storecode = request.nextUrl.searchParams.get("storecode")?.trim();
  const sort = request.nextUrl.searchParams.get("sort")?.trim();

  if (since) {
    query.set("since", since);
  }
  if (limit) {
    query.set("limit", limit);
  }
  if (transactionType) {
    query.set("transactionType", transactionType);
  }
  if (storecode) {
    query.set("storecode", storecode);
  }
  if (sort) {
    query.set("sort", sort);
  }

  const result = await getRemoteJson("/api/realtime/banktransfer/events", query);

  return NextResponse.json(result.json, {
    status: result.status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
