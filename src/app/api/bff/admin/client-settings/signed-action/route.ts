import { NextRequest, NextResponse } from "next/server";

import { postRemoteJson } from "@/lib/server/remote-backend";
import {
  CLIENT_SETTINGS_GET_RATE_HISTORY_ROUTE,
  CLIENT_SETTINGS_UPDATE_AVATAR_ROUTE,
  CLIENT_SETTINGS_UPDATE_BUY_RATE_ROUTE,
  CLIENT_SETTINGS_UPDATE_PAYACTION_ROUTE,
  CLIENT_SETTINGS_UPDATE_PROFILE_ROUTE,
  CLIENT_SETTINGS_UPDATE_SELL_RATE_ROUTE,
} from "@/lib/security/client-settings-admin";

export const runtime = "nodejs";

const ALLOWED_ROUTES = new Set([
  CLIENT_SETTINGS_UPDATE_PROFILE_ROUTE,
  CLIENT_SETTINGS_UPDATE_BUY_RATE_ROUTE,
  CLIENT_SETTINGS_UPDATE_SELL_RATE_ROUTE,
  CLIENT_SETTINGS_GET_RATE_HISTORY_ROUTE,
  CLIENT_SETTINGS_UPDATE_AVATAR_ROUTE,
  CLIENT_SETTINGS_UPDATE_PAYACTION_ROUTE,
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

const resolveRemoteError = (payload: unknown, fallback: string) => {
  const record = asPlainObject(payload);
  return normalizeString(record.error)
    || normalizeString(record.message)
    || normalizeString(asPlainObject(record.result).error)
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
  const signedBody = asPlainObject(body.signedBody);

  if (!ALLOWED_ROUTES.has(route)) {
    return NextResponse.json(
      {
        error: "Unsupported client settings action route",
      },
      { status: 400 },
    );
  }

  if (!Object.keys(signedBody).length) {
    return NextResponse.json(
      {
        error: "signedBody is required",
      },
      { status: 400 },
    );
  }

  const response = await postRemoteJson(route, signedBody);
  const responsePayload = asPlainObject(response.json);

  if (!response.ok) {
    return NextResponse.json(
      {
        ...responsePayload,
        error: resolveRemoteError(response.json, "Client settings action failed"),
      },
      { status: response.status || 502 },
    );
  }

  return NextResponse.json({
    ...responsePayload,
    success: true,
  });
}
