import { NextRequest, NextResponse } from "next/server";

import { getRemoteBackendBaseUrl, postRemoteJson } from "@/lib/server/remote-backend";

export const runtime = "nodejs";

const globalStoreManagementRouteState = globalThis as typeof globalThis & {
  __consoleAdminStoreManagementAgentsCache?: {
    expiresAt: number;
    agents: unknown[];
  };
};

const AGENT_DIRECTORY_FALLBACK_TTL_MS = Number.parseInt(
  process.env.CONSOLE_AGENT_DIRECTORY_FALLBACK_TTL_MS || "",
  10,
) > 0
  ? Number.parseInt(process.env.CONSOLE_AGENT_DIRECTORY_FALLBACK_TTL_MS || "", 10)
  : 5 * 60 * 1000;

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

const readAgentFallbackCache = () => {
  const cached = globalStoreManagementRouteState.__consoleAdminStoreManagementAgentsCache;
  if (!cached || cached.expiresAt <= Date.now()) {
    return [];
  }
  return Array.isArray(cached.agents) ? cached.agents : [];
};

const writeAgentFallbackCache = (agents: unknown[]) => {
  globalStoreManagementRouteState.__consoleAdminStoreManagementAgentsCache = {
    agents,
    expiresAt: Date.now() + AGENT_DIRECTORY_FALLBACK_TTL_MS,
  };
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

  const remoteAgents = Array.isArray(agentsResponse.json?.result?.agents)
    ? agentsResponse.json.result.agents
    : [];
  const cachedAgents = readAgentFallbackCache();
  const resolvedAgents = agentsResponse.ok
    ? remoteAgents
    : cachedAgents;

  if (agentsResponse.ok && remoteAgents.length > 0) {
    writeAgentFallbackCache(remoteAgents);
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
      agents: resolvedAgents,
      agentsError: agentsResponse.ok || resolvedAgents.length > 0
        ? ""
        : resolveRemoteError(agentsResponse.json, "Failed to load agents"),
    },
  });
}
