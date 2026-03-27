import { NextRequest, NextResponse } from "next/server";

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

export async function POST(request: NextRequest) {
  let body: Record<string, unknown> = {};

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const walletAddress = normalizeString(body.walletAddress).toLowerCase();

  const [clientInfoResponse, userResponse] = await Promise.all([
    postRemoteJson("/api/client/getClientInfo", {}),
    walletAddress
      ? postRemoteJson("/api/user/getUser", {
          storecode: "admin",
          walletAddress,
        })
      : Promise.resolve({
          ok: true,
          status: 200,
          json: {
            result: null,
          },
        }),
  ]);

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
      user: userResponse.ok ? userResponse.json?.result || null : null,
    },
  });
}
