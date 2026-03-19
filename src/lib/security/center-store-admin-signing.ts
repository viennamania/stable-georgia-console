const AUTH_FIELD_KEYS = new Set([
  "requesterStorecode",
  "requesterWalletAddress",
  "signature",
  "signedAt",
  "nonce",
]);

export const CENTER_STORE_ADMIN_SIGNING_PREFIX = "stable-georgia:center-store-admin:v1";

export const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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

export const extractCenterStoreAdminActionFields = (body: Record<string, unknown>) => {
  const actionFields: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(body)) {
    if (AUTH_FIELD_KEYS.has(key)) {
      continue;
    }
    actionFields[key] = value;
  }

  return actionFields;
};

export const buildCenterStoreAdminSigningMessage = ({
  route,
  storecode,
  requesterWalletAddress,
  nonce,
  signedAtIso,
  actionFields,
}: {
  route: string;
  storecode: string;
  requesterWalletAddress: string;
  nonce: string;
  signedAtIso: string;
  actionFields: Record<string, unknown>;
}) => {
  const actionLines = Object.entries(actionFields || {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}:${normalizeActionFieldValue(value)}`);

  return [
    CENTER_STORE_ADMIN_SIGNING_PREFIX,
    `route:${route}`,
    `storecode:${storecode}`,
    `requesterWalletAddress:${requesterWalletAddress}`,
    `nonce:${nonce}`,
    `signedAt:${signedAtIso}`,
    ...actionLines,
  ].join("\n");
};
