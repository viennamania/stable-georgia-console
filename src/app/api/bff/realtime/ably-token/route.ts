import { NextResponse, type NextRequest } from "next/server";

import { getRemoteJson } from "@/lib/server/remote-backend";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const stream = request.nextUrl.searchParams.get("stream")?.trim() || "buyorder";
  const clientId =
    request.nextUrl.searchParams.get("clientId")?.trim() || `console-buyorder-${Date.now()}`;

  const result = await getRemoteJson("/api/realtime/ably-token", {
    public: "1",
    stream,
    clientId,
  });

  return NextResponse.json(result.json, {
    status: result.status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
