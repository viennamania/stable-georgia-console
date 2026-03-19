import { NextRequest, NextResponse } from "next/server";
import { postRemoteJson } from "@/lib/server/remote-backend";

export const runtime = "nodejs";

const ALLOWED_ROUTES = new Set([
  "/api/order/cancelTradeBySellerWithEscrow",
]);

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

export async function POST(request: NextRequest) {
  let body: Record<string, unknown> = {};

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const route = normalizeString(body.route);
  const actionBody = asPlainObject(body.body);

  if (!ALLOWED_ROUTES.has(route)) {
    return NextResponse.json(
      {
        error: "Unsupported order action route",
      },
      { status: 400 },
    );
  }

  const response = await postRemoteJson(route, actionBody);

  if (!response.ok) {
    return NextResponse.json(
      {
        error: resolveRemoteError(response.json, "Order action failed"),
        result: response.json?.result || null,
      },
      { status: response.status || 502 },
    );
  }

  return NextResponse.json({
    result: response.json?.result || null,
    success: true,
  });
}
