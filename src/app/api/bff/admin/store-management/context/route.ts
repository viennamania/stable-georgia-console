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
  const signedHistoryBody = asPlainObject(body.signedHistoryBody);
  const storeRequestBody = Object.keys(signedStoreBody).length > 0
    ? signedStoreBody
    : { storecode };

  const [storeResponse, agentsResponse, usersResponse, historyResponse] = await Promise.all([
    postRemoteJson("/api/store/getOneStore", storeRequestBody),
    postRemoteJson("/api/agent/getAllAgents", {
      page: 1,
      limit: 200,
      searchStore: "",
    }),
    postRemoteJson("/api/user/getAllUsersByStorecode", {
      storecode,
      page: 1,
      limit: 100,
      verifiedOnly: true,
    }),
    Object.keys(signedHistoryBody).length > 0
      ? postRemoteJson("/api/store/getStoreAdminWalletAddressHistory", signedHistoryBody)
      : Promise.resolve({ ok: true, status: 200, json: { result: [] } }),
  ]);

  if (!storeResponse.ok) {
    return NextResponse.json(
      {
        error: resolveRemoteError(storeResponse.json, "Failed to load store settings"),
      },
      { status: storeResponse.status || 502 },
    );
  }

  const rawUsers = Array.isArray(usersResponse.json?.result?.users)
    ? usersResponse.json.result.users
    : [];

  const adminWalletCandidateMap = new Map<string, any>();
  for (const user of rawUsers) {
    const walletAddress = normalizeString(user?.walletAddress);
    const signerAddress = normalizeString(user?.signerAddress);
    if (!walletAddress || signerAddress) {
      continue;
    }
    const key = walletAddress.toLowerCase();
    if (!adminWalletCandidateMap.has(key)) {
      adminWalletCandidateMap.set(key, user);
    }
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
      adminWalletCandidates: Array.from(adminWalletCandidateMap.values()),
      adminWalletCandidatesError: usersResponse.ok
        ? ""
        : resolveRemoteError(usersResponse.json, "Failed to load admin wallet candidates"),
      adminWalletHistory: Array.isArray(historyResponse.json?.result)
        ? historyResponse.json.result
        : [],
      adminWalletHistoryError: historyResponse.ok
        ? ""
        : resolveRemoteError(historyResponse.json, "Failed to load admin wallet history"),
    },
  });
}
