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

  const signedDailyBody = asPlainObject(body.signedDailyBody);
  const signedEscrowBody = asPlainObject(body.signedEscrowBody);
  const signedPaymentRequestedBody = asPlainObject(body.signedPaymentRequestedBody);
  const selectedStorecode =
    normalizeString(body.selectedStorecode)
    || normalizeString(signedDailyBody.storecode)
    || normalizeString(signedEscrowBody.storecode)
    || normalizeString(signedPaymentRequestedBody.storecode);

  if (!selectedStorecode) {
    return NextResponse.json({ error: "selectedStorecode is required" }, { status: 400 });
  }

  const hasSignedDailyBody = Object.keys(signedDailyBody).length > 0;
  const hasSignedEscrowBody = Object.keys(signedEscrowBody).length > 0;
  const hasSignedPaymentRequestedBody = Object.keys(signedPaymentRequestedBody).length > 0;

  const jobs: Array<Promise<{ ok: boolean; status: number; json: any }>> = [
    postRemoteJson("/api/store/getOneStore", {
      storecode: selectedStorecode,
    }),
  ];

  if (hasSignedDailyBody) {
    jobs.push(postRemoteJson("/api/order/getAllBuyOrdersByStorecodeDaily", signedDailyBody));
  }

  if (hasSignedEscrowBody) {
    jobs.push(postRemoteJson("/api/store/getEscrowBalance", signedEscrowBody));
  }

  if (hasSignedPaymentRequestedBody) {
    jobs.push(postRemoteJson("/api/order/getCountOfPaymentRequested", signedPaymentRequestedBody));
  }

  const results = await Promise.all(jobs);
  let resultIndex = 0;
  const storeResponse = results[resultIndex++];
  const dailyResponse = hasSignedDailyBody ? results[resultIndex++] : null;
  const escrowResponse = hasSignedEscrowBody ? results[resultIndex++] : null;
  const paymentRequestedResponse = hasSignedPaymentRequestedBody ? results[resultIndex++] : null;
  const dailyOrders = Array.isArray(dailyResponse?.json?.result?.orders)
    ? dailyResponse?.json?.result?.orders
    : [];
  const paymentRequestedOrders = Array.isArray(paymentRequestedResponse?.json?.result?.orders)
    ? paymentRequestedResponse?.json?.result?.orders
    : [];

  if (hasSignedDailyBody && dailyResponse && !dailyResponse.ok) {
    return NextResponse.json(
      {
        error: resolveRemoteError(dailyResponse.json, "Failed to load daily close data"),
      },
      { status: dailyResponse.status || 502 },
    );
  }

  return NextResponse.json({
    result: {
      fetchedAt: new Date().toISOString(),
      remoteBackendBaseUrl: getRemoteBackendBaseUrl(),
      selectedStore: storeResponse.ok ? (storeResponse.json?.result || null) : null,
      storeError: storeResponse.ok
        ? ""
        : resolveRemoteError(storeResponse.json, "Failed to load store information"),
      orders: dailyOrders,
      summary: {
        totalCount: Number(dailyOrders.reduce((sum: number, item: any) => {
          return sum + Number(item?.totalCount || 0);
        }, 0) || 0),
      },
      dailyError: dailyResponse?.ok === false
        ? resolveRemoteError(dailyResponse.json, "Failed to load daily close data")
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
