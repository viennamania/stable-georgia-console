export const BANKTRANSFER_UNMATCHED_ABLY_CHANNEL = "banktransfer-unmatched-events";
export const BANKTRANSFER_UNMATCHED_ABLY_EVENT_NAME = "banktransfer.unmatched";

export type BankTransferUnmatchedRealtimeEvent = {
  eventId?: string;
  amount?: number;
  transactionName?: string | null;
  bankAccountNumber?: string | null;
  transactionDate?: string | null;
  processingDate?: string | null;
  publishedAt?: string | null;
  storecode?: string | null;
  store?: {
    code?: string | null;
    name?: string | null;
  } | null;
};
