import { NextRequest, NextResponse } from "next/server";

import { postRemoteJson } from "@/lib/server/remote-backend";

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
  const lang = normalizeString(body.lang) || "ko";
  const chain = normalizeString(body.chain);
  const walletAddress = normalizeString(body.walletAddress);
  const toWalletAddress = normalizeString(body.toWalletAddress);
  const amount = Number(body.amount);

  if (!Object.keys(signedAdminUserBody).length) {
    return NextResponse.json({ error: "signedAdminUserBody is required" }, { status: 400 });
  }

  if (!walletAddress || !toWalletAddress || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Invalid transfer log payload" }, { status: 400 });
  }

  const adminUserResponse = await postRemoteJson("/api/user/getUserByWalletAddress", signedAdminUserBody);

  if (!adminUserResponse.ok || !isAdminUser(adminUserResponse.json?.result)) {
    return NextResponse.json(
      {
        error: adminUserResponse.ok
          ? "Admin wallet verification failed"
          : resolveRemoteError(adminUserResponse.json, "Failed to verify admin wallet"),
        result: null,
      },
      { status: adminUserResponse.status || 403 },
    );
  }

  const transferResponse = await postRemoteJson("/api/transaction/setTransfer", {
    lang,
    chain,
    walletAddress,
    toWalletAddress,
    amount,
  });

  if (!transferResponse.ok) {
    return NextResponse.json(
      {
        error: resolveRemoteError(transferResponse.json, "Failed to persist transfer history"),
        result: transferResponse.json?.result || null,
      },
      { status: transferResponse.status || 502 },
    );
  }

  return NextResponse.json({
    result: transferResponse.json?.result || null,
    success: true,
  });
}
