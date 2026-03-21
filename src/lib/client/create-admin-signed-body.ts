"use client";

import type { Account } from "thirdweb/wallets";

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

const normalizeActionFieldValue = (value: unknown): string => {
  if (value == null) {
    return "";
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeActionFieldValue(item)).join(",");
  }

  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }

  return String(value).trim();
};

const sanitizeActionFields = (value: Record<string, unknown>) => {
  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value || {})) {
    if (AUTH_FIELD_KEYS.has(key) || item === undefined) {
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

const buildAdminActionSigningMessage = ({
  signingPrefix,
  route,
  requesterStorecode,
  requesterWalletAddress,
  nonce,
  signedAtIso,
  actionFields,
}: {
  signingPrefix: string;
  route: string;
  requesterStorecode: string;
  requesterWalletAddress: string;
  nonce: string;
  signedAtIso: string;
  actionFields: Record<string, unknown>;
}) => {
  const actionLines = Object.entries(actionFields || {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}:${normalizeActionFieldValue(value)}`);

  return [
    signingPrefix,
    `route:${route}`,
    `requesterStorecode:${requesterStorecode}`,
    `requesterWalletAddress:${requesterWalletAddress}`,
    `nonce:${nonce}`,
    `signedAt:${signedAtIso}`,
    ...actionLines,
  ].join("\n");
};

export async function createAdminSignedBody({
  account,
  route,
  signingPrefix,
  actionFields,
  requesterStorecode = "admin",
  requesterWalletAddress,
}: {
  account: Account | null | undefined;
  route: string;
  signingPrefix: string;
  actionFields?: Record<string, unknown>;
  requesterStorecode?: string;
  requesterWalletAddress?: string;
}) {
  if (!account) {
    throw new Error("Wallet account not connected");
  }

  const normalizedStorecode = normalizeString(requesterStorecode) || "admin";
  const normalizedWalletAddress =
    normalizeWalletAddress(requesterWalletAddress) || normalizeWalletAddress(account.address);

  if (!normalizedWalletAddress) {
    throw new Error("requesterWalletAddress is required");
  }

  const body = sanitizeActionFields(actionFields || {});
  const nonce = createNonce();
  const signedAt = new Date().toISOString();
  const message = buildAdminActionSigningMessage({
    signingPrefix,
    route,
    requesterStorecode: normalizedStorecode,
    requesterWalletAddress: normalizedWalletAddress,
    nonce,
    signedAtIso: signedAt,
    actionFields: body,
  });
  const signature = await account.signMessage({ message });

  return {
    ...body,
    requesterStorecode: normalizedStorecode,
    requesterWalletAddress: normalizedWalletAddress,
    signature,
    signedAt,
    nonce,
  };
}
