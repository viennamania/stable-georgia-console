export const CLIENT_EXCHANGE_RATE_KEYS = ["USD", "KRW", "JPY", "CNY", "EUR"] as const;

export type ClientExchangeRateKey = (typeof CLIENT_EXCHANGE_RATE_KEYS)[number];
export type ClientExchangeRateHistoryType = "buy" | "sell";

export type ClientExchangeRateMap = Record<ClientExchangeRateKey, number>;
export type ClientExchangeRateForm = Record<ClientExchangeRateKey, string>;

export type ClientExchangeRateHistoryItem = {
  _id: string;
  clientId: string;
  rateType: ClientExchangeRateHistoryType;
  before: ClientExchangeRateMap;
  after: ClientExchangeRateMap;
  changedKeys: ClientExchangeRateKey[];
  requesterWalletAddress: string;
  requesterNickname: string;
  requesterStorecode: string;
  requesterRole: string;
  route: string;
  updatedAt: string;
};

export const createEmptyClientExchangeRateMap = (): ClientExchangeRateMap => ({
  USD: 0,
  KRW: 0,
  JPY: 0,
  CNY: 0,
  EUR: 0,
});

export const createEmptyClientExchangeRateForm = (): ClientExchangeRateForm => ({
  USD: "",
  KRW: "",
  JPY: "",
  CNY: "",
  EUR: "",
});

export const isClientExchangeRateInput = (value: string) => /^\d*\.?\d*$/.test(value);

export const normalizeClientExchangeRateValue = (value: unknown): number | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return 0;
    }

    if (!/^\d+(\.\d+)?$/.test(trimmed)) {
      return null;
    }

    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

export const parseClientExchangeRateMap = (value: unknown): ClientExchangeRateMap | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const next = createEmptyClientExchangeRateMap();

  for (const key of CLIENT_EXCHANGE_RATE_KEYS) {
    const parsed = normalizeClientExchangeRateValue(
      (value as Record<ClientExchangeRateKey, unknown>)[key],
    );

    if (parsed == null) {
      return null;
    }

    next[key] = parsed;
  }

  return next;
};

export const clientExchangeRateMapToForm = (
  value: unknown,
  fallback = createEmptyClientExchangeRateMap(),
): ClientExchangeRateForm => {
  const parsed = parseClientExchangeRateMap(value) || fallback;

  return CLIENT_EXCHANGE_RATE_KEYS.reduce((accumulator, key) => {
    accumulator[key] = String(parsed[key] ?? 0);
    return accumulator;
  }, createEmptyClientExchangeRateForm());
};

export const parseClientExchangeRateForm = (
  value: ClientExchangeRateForm,
): ClientExchangeRateMap | null => {
  const next = createEmptyClientExchangeRateMap();

  for (const key of CLIENT_EXCHANGE_RATE_KEYS) {
    const parsed = normalizeClientExchangeRateValue(value[key]);
    if (parsed == null) {
      return null;
    }
    next[key] = parsed;
  }

  return next;
};

export const parseClientExchangeRateHistoryItem = (
  value: unknown,
): ClientExchangeRateHistoryItem | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const after = parseClientExchangeRateMap(record.after);

  if (!after) {
    return null;
  }

  const before = parseClientExchangeRateMap(record.before) || createEmptyClientExchangeRateMap();
  const changedKeysSource = Array.isArray(record.changedKeys) ? record.changedKeys : [];
  const changedKeys = changedKeysSource
    .map((item) => String(item))
    .filter((item): item is ClientExchangeRateKey =>
      CLIENT_EXCHANGE_RATE_KEYS.includes(item as ClientExchangeRateKey),
    );

  return {
    _id: String(record._id || ""),
    clientId: String(record.clientId || ""),
    rateType: record.rateType === "sell" ? "sell" : "buy",
    before,
    after,
    changedKeys,
    requesterWalletAddress: String(record.requesterWalletAddress || ""),
    requesterNickname: String(record.requesterNickname || ""),
    requesterStorecode: String(record.requesterStorecode || ""),
    requesterRole: String(record.requesterRole || ""),
    route: String(record.route || ""),
    updatedAt: String(record.updatedAt || ""),
  };
};
