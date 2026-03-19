export const BUYORDER_STATUS_ABLY_CHANNEL = "buyorder-status-events";
export const BUYORDER_STATUS_ABLY_EVENT_NAME = "buyorder.status.changed";

export type BuyOrderStatusRealtimeEvent = {
  eventId?: string;
  orderId?: string | null;
  tradeId?: string | null;
  statusFrom?: string | null;
  statusTo?: string | null;
  transactionHash?: string | null;
  publishedAt?: string | null;
};
