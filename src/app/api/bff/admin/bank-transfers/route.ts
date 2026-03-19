import { NextRequest, NextResponse } from "next/server";
import { postRemoteJson } from "@/lib/server/remote-backend";

export const runtime = "nodejs";

const normalizeString = (value: unknown) => {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
};

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

  const response = await postRemoteJson("/api/bankTransfer/getAll", {
    accountNumber: normalizeString(body.accountNumber),
    transactionType: normalizeString(body.transactionType) || "deposited",
    matchStatus: normalizeString(body.matchStatus) || "unmatched",
    fromDate: normalizeString(body.fromDate),
    toDate: normalizeString(body.toDate),
    page: parsePositiveInt(body.page, 1),
    limit: Math.min(parsePositiveInt(body.limit, 50), 100),
  });

  if (!response.ok) {
    return NextResponse.json(
      {
        error: resolveRemoteError(response.json, "Failed to load bank transfers"),
      },
      { status: response.status || 502 },
    );
  }

  return NextResponse.json({
    result: response.json?.result || {},
  });
}
