"use client";

import type { Account } from "thirdweb/wallets";
import { buildCenterStoreAdminSigningMessage } from "@/lib/security/center-store-admin-signing";

const AUTH_FIELD_KEYS = new Set([
  "requesterStorecode",
  "requesterWalletAddress",
  "signature",
  "signedAt",
  "nonce",
]);

const normalizeString = (value: unknown): string => {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
};

const normalizeWalletAddress = (value: unknown): string => {
  return normalizeString(value).toLowerCase();
};

const sanitizeActionFields = (value: Record<string, unknown>) => {
  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value || {})) {
    if (AUTH_FIELD_KEYS.has(key)) {
      continue;
    }
    if (item === undefined) {
      continue;
    }
    next[key] = item;
  }
  return next;
};

const createNonce = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

export async function createCenterStoreAdminSignedBody({
  account,
  route,
  body,
  storecode,
  requesterWalletAddress,
}: {
  account: Account | null | undefined;
  route: string;
  body?: Record<string, unknown>;
  storecode?: string;
  requesterWalletAddress?: string;
}) {
  if (!account) {
    throw new Error("Wallet account not connected");
  }

  const rawBody = body || {};
  const actionFields = sanitizeActionFields(rawBody);
  const hasStorecodeField = Object.prototype.hasOwnProperty.call(actionFields, "storecode");
  const normalizedStorecode = normalizeString(
    storecode ??
      (rawBody as Record<string, unknown>).requesterStorecode ??
      actionFields.storecode,
  );
  const normalizedWallet =
    normalizeWalletAddress(
      requesterWalletAddress ??
        (rawBody as Record<string, unknown>).requesterWalletAddress ??
        (rawBody as Record<string, unknown>).walletAddress ??
        actionFields.walletAddress,
    ) || normalizeWalletAddress(account.address);

  if (!normalizedStorecode) {
    throw new Error("storecode is required");
  }

  if (!normalizedWallet) {
    throw new Error("walletAddress is required");
  }

  const normalizedBody: Record<string, unknown> = {
    ...actionFields,
    walletAddress: normalizeWalletAddress(actionFields.walletAddress) || normalizedWallet,
  };

  if (hasStorecodeField) {
    normalizedBody.storecode = normalizeString(actionFields.storecode);
  } else {
    normalizedBody.storecode = normalizedStorecode;
  }

  const signedAt = new Date().toISOString();
  const nonce = createNonce();
  const message = buildCenterStoreAdminSigningMessage({
    route,
    storecode: normalizedStorecode,
    requesterWalletAddress: normalizedWallet,
    nonce,
    signedAtIso: signedAt,
    actionFields: normalizedBody,
  });
  const signature = await account.signMessage({ message });

  return {
    ...normalizedBody,
    requesterStorecode: normalizedStorecode,
    requesterWalletAddress: normalizedWallet,
    signature,
    signedAt,
    nonce,
  };
}
