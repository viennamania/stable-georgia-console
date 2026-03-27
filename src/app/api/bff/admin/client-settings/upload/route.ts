import { NextRequest, NextResponse } from "next/server";

import { getRemoteBackendBaseUrl } from "@/lib/server/remote-backend";
import { CLIENT_SETTINGS_ADMIN_UPLOAD_ROUTE } from "@/lib/security/client-settings-admin";

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
    || fallback;
};

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "application/octet-stream";
  const body = await request.arrayBuffer();

  const response = await fetch(`${getRemoteBackendBaseUrl()}${CLIENT_SETTINGS_ADMIN_UPLOAD_ROUTE}`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "content-type": contentType,
      "x-admin-requester-storecode": request.headers.get("x-admin-requester-storecode") || "admin",
      "x-admin-requester-wallet-address": request.headers.get("x-admin-requester-wallet-address") || "",
      "x-admin-signature": request.headers.get("x-admin-signature") || "",
      "x-admin-signed-at": request.headers.get("x-admin-signed-at") || "",
      "x-admin-nonce": request.headers.get("x-admin-nonce") || "",
    },
    body,
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    return NextResponse.json(
      {
        error: resolveRemoteError(payload, "Upload failed"),
      },
      { status: response.status || 502 },
    );
  }

  return NextResponse.json(payload);
}
