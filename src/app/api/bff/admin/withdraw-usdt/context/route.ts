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

const isAdminUser = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    normalizeString(record.role || record.rold).toLowerCase() === "admin"
    && normalizeString(record.storecode).toLowerCase() === "admin"
  );
};

export async function POST(request: NextRequest) {
  let body: Record<string, unknown> = {};

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const signedAdminUserBody = asPlainObject(body.signedAdminUserBody);
  if (!Object.keys(signedAdminUserBody).length) {
    return NextResponse.json(
      {
        error: "signedAdminUserBody is required",
      },
      { status: 400 },
    );
  }

  const adminUserResponse = await postRemoteJson("/api/user/getUserByWalletAddress", signedAdminUserBody);

  if (!adminUserResponse.ok) {
    return NextResponse.json(
      {
        error: resolveRemoteError(adminUserResponse.json, "Failed to verify admin wallet"),
        result: null,
      },
      { status: adminUserResponse.status || 502 },
    );
  }

  const adminUser = adminUserResponse.json?.result || null;
  const isAdmin = isAdminUser(adminUser);

  return NextResponse.json({
    result: {
      remoteBackendBaseUrl: getRemoteBackendBaseUrl(),
      adminUser,
      isAdmin,
    },
  });
}
