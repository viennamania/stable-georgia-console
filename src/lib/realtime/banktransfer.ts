export const BANKTRANSFER_ABLY_CHANNEL = "banktransfer-events";
export const BANKTRANSFER_ABLY_EVENT_NAME = "banktransfer.updated";
export const BANKTRANSFER_UNMATCHED_ABLY_CHANNEL = "banktransfer-unmatched-events";
export const BANKTRANSFER_UNMATCHED_ABLY_EVENT_NAME = "banktransfer.unmatched";

export type BankTransferDashboardEvent = {
  eventId?: string;
  traceId?: string | null;
  transactionType?: string | null;
  amount?: number;
  balance?: number | null;
  transactionName?: string | null;
  bankAccountNumber?: string | null;
  transactionDate?: string | null;
  processingDate?: string | null;
  publishedAt?: string | null;
  tradeId?: string | null;
  status?: string | null;
  storecode?: string | null;
  match?: string | null;
  errorMessage?: string | null;
  receiver?: {
    nickname?: string | null;
    walletAddress?: string | null;
    bankName?: string | null;
    accountNumber?: string | null;
    accountHolder?: string | null;
  } | null;
  store?: {
    code?: string | null;
    name?: string | null;
    logo?: string | null;
  } | null;
};

export type BankTransferUnmatchedRealtimeEvent = {
  eventId?: string;
  amount?: number;
  transactionName?: string | null;
  bankName?: string | null;
  accountHolder?: string | null;
  bankAccountNumber?: string | null;
  transactionDate?: string | null;
  processingDate?: string | null;
  publishedAt?: string | null;
  storecode?: string | null;
  receiver?: {
    bankName?: string | null;
    accountHolder?: string | null;
  } | null;
  store?: {
    code?: string | null;
    name?: string | null;
  } | null;
};
