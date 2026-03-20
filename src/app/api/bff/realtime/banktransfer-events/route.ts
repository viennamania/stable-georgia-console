import { NextRequest, NextResponse } from "next/server";

import { getRemoteJson } from "@/lib/server/remote-backend";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const query = new URLSearchParams();

  query.set("public", "1");

  const since = request.nextUrl.searchParams.get("since")?.trim();
  const limit = request.nextUrl.searchParams.get("limit")?.trim();

  if (since) {
    query.set("since", since);
  }
  if (limit) {
    query.set("limit", limit);
  }

  const result = await getRemoteJson("/api/realtime/banktransfer/events", query);

  return NextResponse.json(result.json, {
    status: result.status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
