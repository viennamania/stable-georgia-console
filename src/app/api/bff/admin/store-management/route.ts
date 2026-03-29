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

  const signedStoresBody = asPlainObject(body.signedStoresBody);
  const fallbackPage = Number(body.page) || 1;
  const fallbackLimit = Number(body.limit) || 20;
  const fallbackSearchStore = normalizeString(body.searchStore);
  const fallbackAgentcode = normalizeString(body.agentcode);
  const fallbackSortBy = normalizeString(body.sortBy);

  const storeListBody = Object.keys(signedStoresBody).length > 0
    ? signedStoresBody
    : {
        page: fallbackPage,
        limit: fallbackLimit,
        searchStore: fallbackSearchStore,
        agentcode: fallbackAgentcode,
        sortBy: fallbackSortBy,
      };

  const [storesResponse, agentsResponse] = await Promise.all([
    postRemoteJson("/api/store/getAdminStoreList", storeListBody),
    postRemoteJson("/api/agent/getAgentDirectory", {
      page: 1,
      limit: 200,
      searchAgent: "",
    }),
  ]);

  if (!storesResponse.ok) {
    return NextResponse.json(
      {
        error: resolveRemoteError(storesResponse.json, "Failed to load stores"),
      },
      { status: storesResponse.status || 502 },
    );
  }

  return NextResponse.json({
    result: {
      fetchedAt: new Date().toISOString(),
      remoteBackendBaseUrl: getRemoteBackendBaseUrl(),
      stores: Array.isArray(storesResponse.json?.result?.stores)
        ? storesResponse.json.result.stores
        : [],
      totalCount: Number(storesResponse.json?.result?.totalCount || 0),
      summary: storesResponse.json?.result?.summary || null,
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
