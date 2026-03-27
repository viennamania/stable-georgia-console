import { NextResponse } from "next/server";

import { postRemoteJson } from "@/lib/server/remote-backend";

export const runtime = "nodejs";

const normalizeString = (value: unknown) => {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
};

const resolveRemoteError = (payload: unknown, fallback: string) => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return fallback;
  }

  const record = payload as Record<string, unknown>;
  return normalizeString(record.error)
    || normalizeString(record.message)
    || normalizeString((record.result as Record<string, unknown> | undefined)?.error)
    || fallback;
};

export async function POST() {
  const clientInfoResponse = await postRemoteJson("/api/client/getClientInfo", {});

  if (!clientInfoResponse.ok) {
    return NextResponse.json(
      {
        error: resolveRemoteError(clientInfoResponse.json, "Failed to load client settings"),
      },
      { status: clientInfoResponse.status || 502 },
    );
  }

  return NextResponse.json({
    result: {
      clientSettings: clientInfoResponse.json?.result || null,
    },
  });
}
