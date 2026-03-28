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

export async function POST(request: NextRequest) {
  let body: Record<string, unknown> = {};

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const storecode = normalizeString(body.storecode);
  if (!storecode) {
    return NextResponse.json({ error: "storecode is required" }, { status: 400 });
  }

  const signedStoreBody = asPlainObject(body.signedStoreBody);
  const storeRequestBody = Object.keys(signedStoreBody).length > 0
    ? signedStoreBody
    : { storecode };

  const [storeResponse, agentsResponse] = await Promise.all([
    postRemoteJson("/api/store/getOneStore", storeRequestBody),
    postRemoteJson("/api/agent/getAllAgents", {
      page: 1,
      limit: 200,
      searchStore: "",
    }),
  ]);

  if (!storeResponse.ok) {
    return NextResponse.json(
      {
        error: resolveRemoteError(storeResponse.json, "Failed to load store settings"),
      },
      { status: storeResponse.status || 502 },
    );
  }

  return NextResponse.json({
    result: {
      fetchedAt: new Date().toISOString(),
      remoteBackendBaseUrl: getRemoteBackendBaseUrl(),
      store: storeResponse.json?.result || null,
      storeError: "",
      agents: Array.isArray(agentsResponse.json?.result?.agents)
        ? agentsResponse.json.result.agents
        : [],
      agentsError: agentsResponse.ok
        ? ""
        : resolveRemoteError(agentsResponse.json, "Failed to load agents"),
    },
  });
}
