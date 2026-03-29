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

const normalizeRole = (value: unknown) => normalizeString(value).toLowerCase();

const toUserSummary = (value: any) => ({
  _id: normalizeString(value?._id),
  id: value?.id ?? null,
  nickname: normalizeString(value?.nickname),
  walletAddress: normalizeString(value?.walletAddress),
  signerAddress: normalizeString(value?.signerAddress),
  role: normalizeRole(value?.role || value?.rold),
  createdAt: normalizeString(value?.createdAt),
  depositName: normalizeString(value?.buyer?.depositName),
});

const findUserByWalletAddress = (users: any[], walletAddressRaw: unknown) => {
  const walletAddress = normalizeString(walletAddressRaw).toLowerCase();
  if (!walletAddress) {
    return null;
  }

  return users.find((user) => normalizeString(user?.walletAddress).toLowerCase() === walletAddress) || null;
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
  const signedAdminStoreBody = asPlainObject(body.signedAdminStoreBody);
  const signedHistoryBody = asPlainObject(body.signedHistoryBody);
  const storeRoute = Object.keys(signedAdminStoreBody).length > 0
    ? "/api/store/getOneStoreAdminSigned"
    : "/api/store/getOneStore";
  const storeRequestBody = Object.keys(signedAdminStoreBody).length > 0
    ? signedAdminStoreBody
    : Object.keys(signedStoreBody).length > 0
      ? signedStoreBody
    : { storecode };

  const [storeResponse, agentsResponse, usersResponse, historyResponse] = await Promise.all([
    postRemoteJson(storeRoute, storeRequestBody),
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

  const rawUsers: any[] = Array.isArray(usersResponse.json?.result?.users)
    ? usersResponse.json.result.users
    : [];
  const storeInfo = storeResponse.json?.result || null;

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

  const sellerWalletUser = findUserByWalletAddress(rawUsers, storeInfo?.sellerWalletAddress);
  const privateSellerWalletUser = findUserByWalletAddress(rawUsers, storeInfo?.privateSellerWalletAddress);
  const settlementWalletUser = findUserByWalletAddress(rawUsers, storeInfo?.settlementWalletAddress);
  const sellerRoleUsers = rawUsers
    .filter((user: any) => normalizeRole(user?.role || user?.rold) === "seller")
    .map(toUserSummary)
    .slice(0, 12);

  return NextResponse.json({
    result: {
      fetchedAt: new Date().toISOString(),
      remoteBackendBaseUrl: getRemoteBackendBaseUrl(),
      store: storeInfo,
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
      sellerProfiles: {
        sellerWalletUser: sellerWalletUser ? toUserSummary(sellerWalletUser) : null,
        privateSellerWalletUser: privateSellerWalletUser ? toUserSummary(privateSellerWalletUser) : null,
        settlementWalletUser: settlementWalletUser ? toUserSummary(settlementWalletUser) : null,
        sellerRoleUsers,
      },
    },
  });
}
