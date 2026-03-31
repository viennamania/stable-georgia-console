const AUTH_FIELD_KEYS = new Set([
  "requesterStorecode",
  "requesterWalletAddress",
  "signature",
  "signedAt",
  "nonce",
]);

export const BANK_INFO_ADMIN_SIGNING_PREFIX =
  "stable-georgia:admin-bank-info:v1";

export const BANK_INFO_ROUTE_GET_ALL = "/api/bankInfo/getAll";
export const BANK_INFO_ROUTE_CREATE = "/api/bankInfo/create";
export const BANK_INFO_ROUTE_UPDATE = "/api/bankInfo/update";
export const BANK_INFO_ROUTE_DELETE = "/api/bankInfo/delete";
export const BANK_INFO_ADMIN_UPLOAD_ROUTE = "/api/upload/admin-bankinfo";

export const extractBankInfoAdminActionFields = (body: Record<string, unknown>) => {
  const actionFields: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(body || {})) {
    if (AUTH_FIELD_KEYS.has(key) || value === undefined) {
      continue;
    }
    actionFields[key] = value;
  }

  return actionFields;
};
