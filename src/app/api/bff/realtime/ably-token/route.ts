import { NextResponse, type NextRequest } from "next/server";

import { getRemoteJson } from "@/lib/server/remote-backend";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const stream = request.nextUrl.searchParams.get("stream")?.trim() || "";
  const clientId =
    request.nextUrl.searchParams.get("clientId")?.trim() || `console-buyorder-${Date.now()}`;
  const query = new URLSearchParams();
  query.set("public", "1");
  query.set("clientId", clientId);
  if (stream && stream !== "ops-admin") {
    query.set("stream", stream);
  }

  const result = await getRemoteJson("/api/realtime/ably-token", query);

  return NextResponse.json(result.json, {
    status: result.status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
