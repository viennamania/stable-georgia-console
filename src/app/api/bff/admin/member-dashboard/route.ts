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

  const signedMembersBody = asPlainObject(body.signedMembersBody);
  const signedEscrowBody = asPlainObject(body.signedEscrowBody);
  const signedPaymentRequestedBody = asPlainObject(body.signedPaymentRequestedBody);
  const selectedStorecode =
    normalizeString(body.selectedStorecode)
    || normalizeString(signedMembersBody.storecode)
    || normalizeString(signedEscrowBody.storecode)
    || normalizeString(signedPaymentRequestedBody.storecode);

  const hasSignedMembersBody = Object.keys(signedMembersBody).length > 0;
  const hasSignedEscrowBody = Boolean(selectedStorecode) && Object.keys(signedEscrowBody).length > 0;
  const hasSignedPaymentRequestedBody = Boolean(selectedStorecode) && Object.keys(signedPaymentRequestedBody).length > 0;

  const jobs: Array<Promise<{ ok: boolean; status: number; json: any }>> = [];

  if (selectedStorecode) {
    jobs.push(postRemoteJson("/api/store/getOneStore", {
      storecode: selectedStorecode,
    }));
  }

  if (hasSignedMembersBody) {
    jobs.push(postRemoteJson("/api/user/getAllBuyers", signedMembersBody));
  }

  if (hasSignedEscrowBody) {
    jobs.push(postRemoteJson("/api/store/getEscrowBalance", signedEscrowBody));
  }

  if (hasSignedPaymentRequestedBody) {
    jobs.push(postRemoteJson("/api/order/getCountOfPaymentRequested", signedPaymentRequestedBody));
  }

  const results = await Promise.all(jobs);
  let resultIndex = 0;
  const storeResponse = selectedStorecode ? results[resultIndex++] : null;
  const membersResponse = hasSignedMembersBody ? results[resultIndex++] : null;
  const escrowResponse = hasSignedEscrowBody ? results[resultIndex++] : null;
  const paymentRequestedResponse = hasSignedPaymentRequestedBody ? results[resultIndex++] : null;

  if (hasSignedMembersBody && membersResponse && !membersResponse.ok) {
    return NextResponse.json(
      {
        error: resolveRemoteError(membersResponse.json, "Failed to load member data"),
      },
      { status: membersResponse.status || 502 },
    );
  }

  const memberUsers = Array.isArray(membersResponse?.json?.result?.users)
    ? membersResponse?.json?.result?.users
    : [];
  const paymentRequestedOrders = Array.isArray(paymentRequestedResponse?.json?.result?.orders)
    ? paymentRequestedResponse?.json?.result?.orders
    : [];

  return NextResponse.json({
    result: {
      fetchedAt: new Date().toISOString(),
      remoteBackendBaseUrl: getRemoteBackendBaseUrl(),
      selectedStore: storeResponse?.ok ? (storeResponse.json?.result || null) : null,
      storeError: !storeResponse
        ? ""
        : storeResponse.ok
        ? ""
        : resolveRemoteError(storeResponse.json, "Failed to load store information"),
      members: memberUsers,
      membersSummary: {
        totalCount: Number(membersResponse?.json?.result?.totalCount || 0),
      },
      membersError: membersResponse?.ok === false
        ? resolveRemoteError(membersResponse.json, "Failed to load member data")
        : "",
      escrow: {
        escrowBalance: Number(escrowResponse?.json?.result?.escrowBalance || 0),
        todayMinusedEscrowAmount: Number(escrowResponse?.json?.result?.todayMinusedEscrowAmount || 0),
      },
      escrowError: escrowResponse?.ok === false
        ? resolveRemoteError(escrowResponse.json, "Failed to load escrow balance")
        : "",
      paymentRequested: {
        totalCount: Number(paymentRequestedResponse?.json?.result?.totalCount || 0),
        orders: paymentRequestedOrders,
      },
      paymentRequestedError: paymentRequestedResponse?.ok === false
        ? resolveRemoteError(paymentRequestedResponse.json, "Failed to load payment requested count")
        : "",
    },
  });
}
