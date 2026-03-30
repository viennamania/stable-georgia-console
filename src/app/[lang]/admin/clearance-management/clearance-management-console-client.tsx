"use client";

import * as Ably from "ably";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useActiveAccount, useActiveWalletConnectionStatus } from "thirdweb/react";

import AdminWalletCard from "@/components/admin/admin-wallet-card";
import { createAdminSignedBody } from "@/lib/client/create-admin-signed-body";
import { createCenterStoreAdminSignedBody } from "@/lib/client/create-center-store-admin-signed-body";
import {
  BANKTRANSFER_ABLY_CHANNEL,
  BANKTRANSFER_ABLY_EVENT_NAME,
  type BankTransferDashboardEvent,
} from "@/lib/realtime/banktransfer";
import {
  BUYORDER_STATUS_ABLY_CHANNEL,
  BUYORDER_STATUS_ABLY_EVENT_NAME,
  type BuyOrderStatusRealtimeEvent,
} from "@/lib/realtime/buyorder";

import {
  BUY_ORDER_DEPOSIT_COMPLETED_SIGNING_PREFIX,
  CANCEL_CLEARANCE_ORDER_SIGNING_PREFIX,
  EMPTY_CLEARANCE_DASHBOARD,
  EMPTY_ORDERS,
  EMPTY_STORES,
  EMPTY_WITHDRAWALS,
  NUMBER_FORMATTER,
  WITHDRAWAL_CLOCK_TICK_MS,
  WITHDRAWAL_HIGHLIGHT_MS,
  WITHDRAWAL_RESYNC_INTERVAL_MS,
  WITHDRAWAL_RESYNC_LIMIT,
  buildPaginationItems,
  createBaseLoadSignature,
  createDefaultFilters,
  createInputDate,
  createOrdersLoadSignature,
  formatDateTime,
  formatKrwValue,
  formatUsdtValue,
  getStoreDisplayName,
  getWithdrawalRealtimePrimaryDateTime,
  getWithdrawalRealtimePrimaryTimestamp,
  normalizeBankTransferTransactionType,
  normalizeText,
  type ClearanceActionMode,
  type ClearanceActionModalState,
  type ClearanceBaseResult,
  type ClearanceOrder,
  type ClearanceDashboardResult,
  type ClearanceManagementConsoleClientProps,
  type ClearanceOrdersResult,
  type FilterState,
  type WithdrawalRealtimeItem,
} from "./clearance-management-shared";

const ClearanceOrdersTableSection = dynamic(
  () => import("./clearance-orders-table-section"),
  {
    ssr: false,
    loading: () => (
      <section className="console-panel rounded-[30px] p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-56 rounded-full bg-slate-100" />
          <div className="h-64 rounded-[24px] bg-slate-50" />
        </div>
      </section>
    ),
  },
);

const ClearanceWithdrawalLiveSection = dynamic(
  () => import("./clearance-withdrawal-live-section"),
  {
    ssr: false,
    loading: () => (
      <section className="console-panel rounded-[30px] p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-72 rounded-full bg-slate-100" />
          <div className="h-48 rounded-[24px] bg-slate-50" />
        </div>
      </section>
    ),
  },
);

const ClearanceActionModal = dynamic(
  () => import("./clearance-action-modal"),
  { ssr: false },
);

export default function ClearanceManagementConsoleClient({
  lang: _lang,
  embedded = false,
  forcedStorecode = "",
  hideStoreFilter = false,
  hideWithdrawalLiveSection = false,
  ordersQueryMode = "buyOrders",
  allowOrderActions = true,
}: ClearanceManagementConsoleClientProps) {
  const activeAccount = useActiveAccount();
  const walletConnectionStatus = useActiveWalletConnectionStatus();
  const normalizedForcedStorecode = normalizeText(forcedStorecode);
  const isStoreScoped = Boolean(normalizedForcedStorecode);
  const isWalletRecovering =
    walletConnectionStatus === "unknown" || walletConnectionStatus === "connecting";
  const canReadSignedData = Boolean(activeAccount) && walletConnectionStatus === "connected";
  const accessActorLabel = isStoreScoped ? "가맹점 관리자" : "관리자";
  const walletAccessLabel = isStoreScoped ? "Store signed access" : "Signed access";
  const walletTitle = isStoreScoped ? "Store wallet" : "Admin wallet";
  const disconnectedMessage = isStoreScoped
    ? "지갑을 연결하고 서명하면 해당 가맹점 청산 조회가 열립니다."
    : "지갑을 연결하면 보호된 청산 조회가 열립니다.";
  const walletCardMessage = isWalletRecovering
    ? "지갑 연결 상태를 확인하는 중입니다."
    : disconnectedMessage;
  const [filters, setFilters] = useState<FilterState>(() => createDefaultFilters(normalizedForcedStorecode));
  const effectiveStorecode = normalizedForcedStorecode || filters.storecode;
  const [data, setData] = useState<ClearanceDashboardResult | null>(null);
  const [, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersRefreshing, setOrdersRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [withdrawalRealtimeItems, setWithdrawalRealtimeItems] = useState<WithdrawalRealtimeItem[]>([]);
  const [connectionState, setConnectionState] = useState<Ably.ConnectionState>("initialized");
  const [connectionError, setConnectionError] = useState("");
  const [withdrawalSyncError, setWithdrawalSyncError] = useState("");
  const [withdrawalRealtimeNowMs, setWithdrawalRealtimeNowMs] = useState(() => Date.now());
  const [actionModalState, setActionModalState] = useState<ClearanceActionModalState | null>(null);
  const [actionModalSubmitting, setActionModalSubmitting] = useState(false);
  const [actionModalError, setActionModalError] = useState("");
  const [processingOrderId, setProcessingOrderId] = useState("");
  const [copiedTradeId, setCopiedTradeId] = useState("");

  const inflightLoadRef = useRef(false);
  const queuedSilentRefreshRef = useRef(false);
  const inflightOrdersLoadRef = useRef(false);
  const queuedSilentOrdersRefreshRef = useRef(false);
  const ordersRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastBuyorderEventIdRef = useRef("");
  const lastWithdrawalEventIdRef = useRef("");
  const withdrawalRealtimeCursorRef = useRef<string | null>(null);
  const withdrawalRealtimeSequenceRef = useRef(0);
  const ablyClientIdRef = useRef(`console-clearance-${Math.random().toString(36).slice(2, 10)}`);
  const desiredBaseLoadSignatureRef = useRef("");
  const desiredOrdersLoadSignatureRef = useRef("");

  desiredBaseLoadSignatureRef.current = createBaseLoadSignature(
    activeAccount?.address,
    normalizedForcedStorecode || filters.storecode,
  );
  desiredOrdersLoadSignatureRef.current = createOrdersLoadSignature(
    {
      ...filters,
      storecode: effectiveStorecode,
    },
    activeAccount?.address,
  );

  const sortWithdrawalRealtimeItems = useCallback((items: WithdrawalRealtimeItem[]) => {
    return [...items]
      .sort((left, right) => {
        const rightTimestamp = getWithdrawalRealtimePrimaryTimestamp(right.data, right.receivedAt);
        const leftTimestamp = getWithdrawalRealtimePrimaryTimestamp(left.data, left.receivedAt);
        if (rightTimestamp !== leftTimestamp) {
          return rightTimestamp - leftTimestamp;
        }
        return right.sortOrder - left.sortOrder;
      })
      .slice(0, 24);
  }, []);

  const replaceWithdrawalRealtimeItems = useCallback((
    events: BankTransferDashboardEvent[],
  ) => {
    let nextSequence = withdrawalRealtimeSequenceRef.current;
    setWithdrawalRealtimeItems(
      sortWithdrawalRealtimeItems(
        events.map((event) => ({
          id: String(event.eventId || event.traceId || Math.random().toString(36).slice(2)),
          data: event,
          receivedAt: new Date().toISOString(),
          highlightUntil: 0,
          sortOrder: ++nextSequence,
        })),
      ),
    );
    withdrawalRealtimeSequenceRef.current = nextSequence;
  }, [sortWithdrawalRealtimeItems]);

  const upsertWithdrawalRealtimeEvents = useCallback((
    incomingEvents: BankTransferDashboardEvent[],
    options?: { highlightNew?: boolean },
  ) => {
    if (incomingEvents.length === 0) {
      return;
    }

    const now = Date.now();
    const highlightNew = options?.highlightNew ?? true;

    setWithdrawalRealtimeItems((current) => {
      const nextMap = new Map(current.map((item) => [item.id, item]));

      for (const event of incomingEvents) {
        const nextId =
          String(event.eventId || "").trim()
          || `${event.traceId || "withdraw"}-${event.publishedAt || Date.now()}`;
        const existing = nextMap.get(nextId);

        if (existing) {
          nextMap.set(nextId, {
            ...existing,
            data: event,
          });
          continue;
        }

        nextMap.set(nextId, {
          id: nextId,
          data: event,
          receivedAt: new Date().toISOString(),
          highlightUntil: highlightNew ? now + WITHDRAWAL_HIGHLIGHT_MS : 0,
          sortOrder: ++withdrawalRealtimeSequenceRef.current,
        });
      }

      return sortWithdrawalRealtimeItems(Array.from(nextMap.values()));
    });
  }, [sortWithdrawalRealtimeItems]);

  const syncWithdrawalRealtimeEvents = useCallback(
    async (options?: { sinceCursor?: string | null; highlightNew?: boolean }) => {
      const params = new URLSearchParams({
        limit: String(WITHDRAWAL_RESYNC_LIMIT),
        transactionType: "withdrawn",
        sort: "asc",
      });
      const scopedStorecode = normalizedForcedStorecode || filters.storecode;

      const nextCursor = options?.sinceCursor ?? withdrawalRealtimeCursorRef.current;
      if (nextCursor) {
        params.set("since", nextCursor);
      }
      if (scopedStorecode) {
        params.set("storecode", scopedStorecode);
      }

      try {
        const response = await fetch(`/api/bff/realtime/banktransfer-events?${params.toString()}`, {
          method: "GET",
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const payload = await response.json().catch(() => ({}));
        const incomingEvents = Array.isArray(payload?.events)
          ? (payload.events as BankTransferDashboardEvent[])
          : [];

        upsertWithdrawalRealtimeEvents(incomingEvents, {
          highlightNew: options?.highlightNew ?? Boolean(nextCursor),
        });

        if (typeof payload?.nextCursor === "string" && payload.nextCursor) {
          withdrawalRealtimeCursorRef.current = payload.nextCursor;
        }

        setWithdrawalSyncError("");
      } catch (error) {
        setWithdrawalSyncError(
          error instanceof Error ? error.message : "withdrawal realtime sync failed",
        );
      }
    },
    [filters.storecode, normalizedForcedStorecode, upsertWithdrawalRealtimeEvents],
  );

  const loadDashboard = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = Boolean(options?.silent);
      const loadSignature = createBaseLoadSignature(
        activeAccount?.address,
        normalizedForcedStorecode || filters.storecode,
      );
      const selectedStorecode = normalizedForcedStorecode || filters.storecode;

      if (inflightLoadRef.current) {
        queuedSilentRefreshRef.current = true;
        return;
      }

      inflightLoadRef.current = true;
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        let signedStoreBody: Record<string, unknown> | null = null;

        if (activeAccount && !isStoreScoped) {
          try {
            signedStoreBody = await createCenterStoreAdminSignedBody({
              account: activeAccount,
              route: "/api/store/getClearanceStoreDirectory",
              storecode: "admin",
              requesterWalletAddress: activeAccount.address,
              body: {
                limit: 300,
                page: 1,
                sortBy: "storeNameDesc",
              },
            });
          } catch {
            signedStoreBody = null;
          }
        }

        const response = await fetch("/api/bff/admin/clearance-dashboard", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
          body: JSON.stringify({
            storesLimit: isStoreScoped ? 1 : 300,
            storesPage: 1,
            withdrawalLimit: hideWithdrawalLiveSection ? 0 : 24,
            selectedStorecode,
            signedStoreBody,
          }),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error || "Failed to load clearance dashboard");
        }

        if (desiredBaseLoadSignatureRef.current !== loadSignature) {
          queuedSilentRefreshRef.current = true;
          return;
        }

        const result = payload.result as ClearanceBaseResult;
        const nextWithdrawalEvents =
          !hideWithdrawalLiveSection && Array.isArray(result?.withdrawalEvents)
            ? result.withdrawalEvents
            : EMPTY_WITHDRAWALS;
        const nextWithdrawalCursor =
          !hideWithdrawalLiveSection && typeof result?.withdrawalNextCursor === "string"
            ? result.withdrawalNextCursor
            : null;
        setData((current) => ({
          ...(current || EMPTY_CLEARANCE_DASHBOARD),
          fetchedAt: result?.fetchedAt || "",
          remoteBackendBaseUrl: result?.remoteBackendBaseUrl || "",
          stores: Array.isArray(result?.stores) ? result.stores : EMPTY_STORES,
          storeTotalCount: Number(result?.storeTotalCount || 0),
          storesError: normalizeText(result?.storesError),
          selectedStore: result?.selectedStore || null,
          withdrawalEvents: nextWithdrawalEvents,
          withdrawalNextCursor: nextWithdrawalCursor,
        }));
        withdrawalRealtimeCursorRef.current = nextWithdrawalCursor || null;
        replaceWithdrawalRealtimeItems(nextWithdrawalEvents);
        setWithdrawalSyncError("");
        setError("");
      } catch (loadError) {
        if (desiredBaseLoadSignatureRef.current === loadSignature) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load clearance dashboard");
        }
      } finally {
        inflightLoadRef.current = false;
        setLoading(false);
        setRefreshing(false);
        if (queuedSilentRefreshRef.current) {
          queuedSilentRefreshRef.current = false;
          queueMicrotask(() => {
            void loadDashboard({ silent: true });
          });
        }
      }
    },
    [
      activeAccount,
      filters.storecode,
      isStoreScoped,
      hideWithdrawalLiveSection,
      normalizedForcedStorecode,
      replaceWithdrawalRealtimeItems,
    ],
  );

  const loadOrdersDashboard = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = Boolean(options?.silent);
      const supportsPublicMaskedOrders = ordersQueryMode === "buyOrders";
      const loadSignature = createOrdersLoadSignature(
        {
          ...filters,
          storecode: effectiveStorecode,
        },
        activeAccount?.address,
      );

      if (inflightOrdersLoadRef.current) {
        queuedSilentOrdersRefreshRef.current = true;
        return;
      }

      inflightOrdersLoadRef.current = true;
      if (silent) {
        setOrdersRefreshing(true);
      } else {
        setOrdersLoading(true);
      }

      try {
        let signedOrdersBody: Record<string, unknown> | null = null;
        const signingAccount = canReadSignedData ? activeAccount : null;

        if (!signingAccount && !supportsPublicMaskedOrders) {
          if (desiredOrdersLoadSignatureRef.current !== loadSignature) {
            queuedSilentOrdersRefreshRef.current = true;
            return;
          }

          setData((current) => ({
            ...(current || EMPTY_CLEARANCE_DASHBOARD),
            ordersAccessLevel: "public",
            ordersError: "",
            orders: EMPTY_ORDERS,
            totalCount: 0,
            totalClearanceCount: 0,
            totalClearanceAmount: 0,
            totalClearanceAmountKRW: 0,
          }));
          setError("");
          return;
        }

        const ordersRoute = ordersQueryMode === "collectOrdersForSeller"
          ? "/api/order/getAllCollectOrdersForSeller"
          : "/api/order/getAdminClearanceOrders";
        const signingStorecode = ordersQueryMode === "collectOrdersForSeller"
          ? effectiveStorecode
          : "admin";

        if (signingAccount) {
          try {
            signedOrdersBody = await createCenterStoreAdminSignedBody({
              account: signingAccount,
              route: ordersRoute,
              storecode: signingStorecode,
              requesterWalletAddress: signingAccount.address,
              body: {
                storecode: effectiveStorecode,
                limit: filters.limit,
                page: filters.page,
                walletAddress: signingAccount.address,
                searchMyOrders: filters.searchMyOrders,
                privateSale: true,
                fromDate: filters.fromDate,
                toDate: filters.toDate,
              },
            });
          } catch {
            signedOrdersBody = null;
          }
        }

        const response = await fetch("/api/bff/admin/clearance-orders", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
          body: JSON.stringify({
            signedOrdersBody,
            orderFilters: {
              storecode: effectiveStorecode,
              limit: filters.limit,
              page: filters.page,
              fromDate: filters.fromDate,
              toDate: filters.toDate,
            },
            ordersQueryMode,
          }),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error || "Failed to load clearance orders");
        }

        if (desiredOrdersLoadSignatureRef.current !== loadSignature) {
          queuedSilentOrdersRefreshRef.current = true;
          return;
        }

        const result = payload.result as ClearanceOrdersResult;
        const mergedOrdersError = normalizeText(result?.ordersError);

        setData((current) => ({
          ...(current || EMPTY_CLEARANCE_DASHBOARD),
          ordersAccessLevel: normalizeText(result?.ordersAccessLevel) || "public",
          ordersError: mergedOrdersError,
          orders: Array.isArray(result?.orders) ? result.orders : EMPTY_ORDERS,
          totalCount: Number(result?.totalCount || 0),
          totalClearanceCount: Number(result?.totalClearanceCount || 0),
          totalClearanceAmount: Number(result?.totalClearanceAmount || 0),
          totalClearanceAmountKRW: Number(result?.totalClearanceAmountKRW || 0),
        }));
        setError("");
      } catch (loadError) {
        if (desiredOrdersLoadSignatureRef.current === loadSignature) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load clearance orders");
        }
      } finally {
        inflightOrdersLoadRef.current = false;
        setOrdersLoading(false);
        setOrdersRefreshing(false);
        if (queuedSilentOrdersRefreshRef.current) {
          queuedSilentOrdersRefreshRef.current = false;
          queueMicrotask(() => {
            void loadOrdersDashboard({ silent: true });
          });
        }
      }
    },
    [activeAccount, canReadSignedData, effectiveStorecode, filters, ordersQueryMode],
  );

  const requestRealtimeRefresh = useCallback(() => {
    if (ordersRefreshTimerRef.current) {
      clearTimeout(ordersRefreshTimerRef.current);
    }

    ordersRefreshTimerRef.current = setTimeout(() => {
      ordersRefreshTimerRef.current = null;
      void loadOrdersDashboard({ silent: true });
    }, 350);
  }, [loadOrdersDashboard]);

  const copyTradeId = useCallback(async (tradeId: string) => {
    const safeTradeId = String(tradeId || "").trim();
    if (!safeTradeId || typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      return;
    }

    try {
      await navigator.clipboard.writeText(safeTradeId);
      setCopiedTradeId(safeTradeId);
      if (copyResetTimerRef.current) {
        clearTimeout(copyResetTimerRef.current);
      }
      copyResetTimerRef.current = setTimeout(() => {
        setCopiedTradeId("");
      }, 1800);
    } catch {
      // Keep trade row interactions non-blocking when clipboard access fails.
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    void loadOrdersDashboard();
  }, [loadOrdersDashboard]);

  useEffect(() => {
    return () => {
      if (copyResetTimerRef.current) {
        clearTimeout(copyResetTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!hideStoreFilter && !normalizedForcedStorecode) {
      return;
    }

    setFilters((prev) => {
      if (prev.storecode === normalizedForcedStorecode) {
        return prev;
      }

      return {
        ...prev,
        storecode: normalizedForcedStorecode,
        page: 1,
      };
    });
  }, [hideStoreFilter, normalizedForcedStorecode]);

  useEffect(() => {
    const interval = setInterval(() => {
      void loadDashboard({ silent: true });
    }, 60000);

    return () => clearInterval(interval);
  }, [loadDashboard]);

  useEffect(() => {
    const interval = setInterval(() => {
      void loadOrdersDashboard({ silent: true });
    }, 60000);

    return () => clearInterval(interval);
  }, [loadOrdersDashboard]);

  useEffect(() => {
    if (hideWithdrawalLiveSection) {
      return;
    }

    const timer = window.setInterval(() => {
      setWithdrawalRealtimeNowMs(Date.now());
    }, WITHDRAWAL_CLOCK_TICK_MS);

    return () => window.clearInterval(timer);
  }, [hideWithdrawalLiveSection]);

  useEffect(() => {
    if (hideWithdrawalLiveSection) {
      withdrawalRealtimeCursorRef.current = null;
      replaceWithdrawalRealtimeItems(EMPTY_WITHDRAWALS);
      setConnectionError("");
      setWithdrawalSyncError("");
      return;
    }

    const realtime = new Ably.Realtime({
      authUrl: `/api/bff/realtime/ably-token?stream=ops-admin&clientId=${ablyClientIdRef.current}`,
    });
    const buyorderChannel = realtime.channels.get(BUYORDER_STATUS_ABLY_CHANNEL);
    const banktransferChannel = realtime.channels.get(BANKTRANSFER_ABLY_CHANNEL);
    const syncInterval = window.setInterval(() => {
      void syncWithdrawalRealtimeEvents();
    }, WITHDRAWAL_RESYNC_INTERVAL_MS);

    const onConnectionStateChange = (stateChange: Ably.ConnectionStateChange) => {
      setConnectionState(stateChange.current);
      if (stateChange.reason) {
        setConnectionError(stateChange.reason.message || "Ably connection error");
      } else if (stateChange.current === "connected") {
        setConnectionError("");
        void syncWithdrawalRealtimeEvents();
      }
    };

    const onBuyorderMessage = (message: Ably.Message) => {
      const event = (message.data || {}) as BuyOrderStatusRealtimeEvent & {
        store?: { code?: string | null; name?: string | null };
      };
      const eventId = String(event.eventId || message.id || "").trim();
      if (eventId && lastBuyorderEventIdRef.current === eventId) {
        return;
      }
      if (eventId) {
        lastBuyorderEventIdRef.current = eventId;
      }

      requestRealtimeRefresh();
    };

    const onBanktransferMessage = (message: Ably.Message) => {
      const event = (message.data || {}) as BankTransferDashboardEvent;
      const eventId = String(event.eventId || message.id || "").trim();
      if (eventId && lastWithdrawalEventIdRef.current === eventId) {
        return;
      }
      if (eventId) {
        lastWithdrawalEventIdRef.current = eventId;
      }

      if (
        normalizeBankTransferTransactionType(event.transactionType) !== "withdrawn"
      ) {
        return;
      }

      upsertWithdrawalRealtimeEvents([event], { highlightNew: true });

      requestRealtimeRefresh();
    };

    realtime.connection.on(onConnectionStateChange);
    void buyorderChannel.subscribe(BUYORDER_STATUS_ABLY_EVENT_NAME, onBuyorderMessage);
    void banktransferChannel.subscribe(BANKTRANSFER_ABLY_EVENT_NAME, onBanktransferMessage);
    void syncWithdrawalRealtimeEvents({ sinceCursor: null, highlightNew: false });

    return () => {
      if (ordersRefreshTimerRef.current) {
        clearTimeout(ordersRefreshTimerRef.current);
      }
      window.clearInterval(syncInterval);
      buyorderChannel.unsubscribe(BUYORDER_STATUS_ABLY_EVENT_NAME, onBuyorderMessage);
      banktransferChannel.unsubscribe(BANKTRANSFER_ABLY_EVENT_NAME, onBanktransferMessage);
      realtime.connection.off(onConnectionStateChange);
      realtime.close();
    };
  }, [hideWithdrawalLiveSection, replaceWithdrawalRealtimeItems, requestRealtimeRefresh, syncWithdrawalRealtimeEvents, upsertWithdrawalRealtimeEvents]);

  const stores = data?.stores || EMPTY_STORES;
  const storesError = normalizeText(data?.storesError);
  const hasPrivilegedOrderAccess = normalizeText(data?.ordersAccessLevel) === "privileged";
  const supportsPublicMaskedOrders = ordersQueryMode === "buyOrders";
  const ordersError = normalizeText(data?.ordersError);
  const orders = data?.orders || EMPTY_ORDERS;
  const selectedStoreSummary = useMemo(() => {
    if (!filters.storecode) {
      return null;
    }

    return (
      stores.find((store) => normalizeText(store.storecode).toLowerCase() === filters.storecode.toLowerCase())
      || data?.selectedStore
      || null
    );
  }, [data?.selectedStore, filters.storecode, stores]);
  const storeCoverageLabel = filters.storecode
    ? getStoreDisplayName(selectedStoreSummary) || filters.storecode
    : "전체 가맹점";
  const storeCoverageCaption = filters.storecode
    ? `${filters.storecode} 기준 청산 주문 / 출금 webhook 흐름`
    : `${NUMBER_FORMATTER.format(data?.storeTotalCount || 0)}개 등록 가맹점`;
  const filteredWithdrawalRealtimeItems = useMemo(() => {
    if (!filters.storecode) {
      return withdrawalRealtimeItems;
    }

    return withdrawalRealtimeItems.filter((item) => {
      return normalizeText(item.data.storecode).toLowerCase() === filters.storecode.toLowerCase();
    });
  }, [filters.storecode, withdrawalRealtimeItems]);
  const withdrawalRealtimeEventCount = filteredWithdrawalRealtimeItems.length;
  const withdrawalRealtimeAmountTotal = filteredWithdrawalRealtimeItems.reduce((sum, item) => {
    return sum + Number(item.data.amount || 0);
  }, 0);
  const latestWithdrawalRealtimeAt =
    filteredWithdrawalRealtimeItems[0]
      ? getWithdrawalRealtimePrimaryDateTime(
          filteredWithdrawalRealtimeItems[0].data,
          filteredWithdrawalRealtimeItems[0].receivedAt,
        )
      : null;
  const connectionIndicatorClassName =
    connectionState === "connected"
      ? "bg-emerald-500"
      : connectionState === "connecting" || connectionState === "initialized"
        ? "bg-amber-400"
        : "bg-rose-500";
  const shellClassName = embedded
    ? "w-full"
    : "console-shell px-4 py-6 sm:px-6 lg:px-8";
  const shellInnerClassName = embedded
    ? "flex w-full flex-col gap-5"
    : "mx-auto flex w-full max-w-[1480px] flex-col gap-5";
  const filterGridClassName = hideStoreFilter ? "lg:grid-cols-3" : "lg:grid-cols-4";
  const heroBadgeLabel = isStoreScoped
    ? "Stable Georgia / Store Clearance Console"
    : "Stable Georgia / Clearance Console";
  const heroTitle = isStoreScoped ? storeCoverageLabel : "Clearance Management";
  const heroDescription = isStoreScoped
    ? "해당 가맹점 범위의 청산 주문과 출금 webhook 흐름을 서명 기반으로 조회합니다."
    : "청산 주문 목록과 출금 webhook 흐름을 한 화면에서 확인합니다. 현재 선택한 가맹점 범위 기준으로 동작하며 주문 목록은 `buyorder.status.changed`, 출금 live는 `banktransfer.updated`를 구독합니다.";

  const patchOrderInDashboard = useCallback(
    (orderId: string, updater: (order: ClearanceOrder) => ClearanceOrder) => {
      setData((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          orders: current.orders.map((order) => {
            return String(order._id || "").trim() === orderId ? updater(order) : order;
          }),
        };
      });
    },
    [],
  );

  const openActionModal = useCallback(
    (mode: ClearanceActionMode, order: ClearanceOrder) => {
      if (!allowOrderActions) {
        setError("이 화면에서는 조회만 가능합니다. 청산 완료/취소는 전체 관리자 콘솔에서 처리하세요.");
        return;
      }

      if (!hasPrivilegedOrderAccess) {
        setError(`${accessActorLabel} 지갑을 연결하고 서명해야 청산 완료/취소를 처리할 수 있습니다.`);
        return;
      }

      const orderId = String(order._id || "").trim();
      if (!orderId) {
        setError("주문 식별 정보가 부족합니다.");
        return;
      }

      if (!activeAccount) {
        setError(`${accessActorLabel} 지갑을 연결해야 출금 처리를 진행할 수 있습니다.`);
        return;
      }

      setError("");
      setActionModalError("");
      setActionModalState({
        mode,
        order,
      });
    },
    [accessActorLabel, activeAccount, allowOrderActions, hasPrivilegedOrderAccess],
  );

  const closeActionModal = useCallback(() => {
    if (actionModalSubmitting) {
      return;
    }

    setActionModalState(null);
    setActionModalError("");
  }, [actionModalSubmitting]);

  const canSubmitActionModal = useMemo(() => {
    if (!actionModalState) {
      return false;
    }

    const status = normalizeText(actionModalState.order.status);
    if (status === "cancelled") {
      return false;
    }

    return actionModalState.order.buyer?.depositCompleted !== true;
  }, [actionModalState]);

  const handleClearanceActionFromConsole = useCallback(async () => {
    if (!activeAccount || !actionModalState) {
      setActionModalError("처리 대상 주문이 없습니다.");
      return;
    }

    if (!canSubmitActionModal) {
      setActionModalError("주문 상태가 변경되어 더 이상 처리할 수 없습니다.");
      return;
    }

    const targetOrder = actionModalState.order;
    const orderId = String(targetOrder._id || "").trim();
    const actionStorecode = normalizeText(
      targetOrder.storecode || targetOrder.store?.storecode || normalizedForcedStorecode || filters.storecode,
    );

    if (!orderId || !actionStorecode) {
      setActionModalError("주문 식별 정보가 부족합니다.");
      return;
    }

    const route =
      actionModalState.mode === "complete"
        ? "/api/order/buyOrderDepositCompleted"
        : "/api/order/cancelClearanceOrderByAdmin";
    const signingPrefix =
      actionModalState.mode === "complete"
        ? BUY_ORDER_DEPOSIT_COMPLETED_SIGNING_PREFIX
        : CANCEL_CLEARANCE_ORDER_SIGNING_PREFIX;
    const actionFields =
      actionModalState.mode === "complete"
        ? {
            orderId,
            storecode: actionStorecode,
          }
        : {
            orderId,
            storecode: actionStorecode,
            cancelReason: "cancelled_by_admin_clearance_management",
          };

    setActionModalSubmitting(true);
    setActionModalError("");
    setProcessingOrderId(orderId);

    try {
      const signedBody = isStoreScoped
        ? await createCenterStoreAdminSignedBody({
            account: activeAccount,
            route,
            storecode: actionStorecode,
            requesterWalletAddress: activeAccount.address,
            body: actionFields,
          })
        : await createAdminSignedBody({
            account: activeAccount,
            route,
            signingPrefix,
            requesterStorecode: "admin",
            requesterWalletAddress: activeAccount.address,
            actionFields,
          });

      const response = await fetch("/api/bff/admin/signed-order-action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          route,
          signedBody,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "청산 처리에 실패했습니다.");
      }

      if (actionModalState.mode === "complete") {
        const nextBuyer = payload?.result?.buyer;
        patchOrderInDashboard(orderId, (order) => ({
          ...order,
          buyer: nextBuyer
            ? {
                ...(order.buyer || {}),
                ...nextBuyer,
              }
            : {
                ...(order.buyer || {}),
                depositCompleted: true,
                depositCompletedAt: new Date().toISOString(),
                depositCompletedBy: {
                  walletAddress: String(activeAccount.address || "").trim().toLowerCase(),
                },
              },
        }));
      } else {
        const nextOrder = payload?.result?.order;
        patchOrderInDashboard(orderId, (order) => ({
          ...order,
          ...(nextOrder || {}),
          status: String(nextOrder?.status || "cancelled").trim() || "cancelled",
          cancelledAt:
            normalizeText(nextOrder?.cancelledAt) || order.cancelledAt || new Date().toISOString(),
        }));
      }

      closeActionModal();
      void loadOrdersDashboard({ silent: true });
    } catch (actionError) {
      setActionModalError(
        actionError instanceof Error ? actionError.message : "청산 처리에 실패했습니다.",
      );
    } finally {
      setActionModalSubmitting(false);
      setProcessingOrderId("");
    }
  }, [
    activeAccount,
    actionModalState,
    canSubmitActionModal,
    closeActionModal,
    filters.storecode,
    isStoreScoped,
    loadOrdersDashboard,
    normalizedForcedStorecode,
    patchOrderInDashboard,
  ]);

  const currentOrderPage = Math.max(1, filters.page);
  const totalOrderCount = Number(data?.totalCount || 0);
  const totalClearanceCount = Number(data?.totalClearanceCount || 0);
  const totalClearanceAmount = Number(data?.totalClearanceAmount || 0);
  const totalClearanceAmountKRW = Number(data?.totalClearanceAmountKRW || 0);
  const totalOrderPages = Math.max(1, Math.ceil(totalOrderCount / Math.max(1, filters.limit)));
  const currentOrderRangeStart = totalOrderCount === 0 ? 0 : (currentOrderPage - 1) * filters.limit + 1;
  const currentOrderRangeEnd = totalOrderCount === 0 ? 0 : Math.min(totalOrderCount, currentOrderPage * filters.limit);
  const orderPaginationItems = useMemo(
    () => buildPaginationItems(currentOrderPage, totalOrderPages),
    [currentOrderPage, totalOrderPages],
  );
  const canGoToPreviousOrderPage = currentOrderPage > 1;
  const canGoToNextOrderPage = currentOrderPage < totalOrderPages;
  const isOrderPaginationBusy = ordersLoading || ordersRefreshing;
  const updateOrderPage = useCallback((nextPage: number) => {
    const clampedPage = Math.max(1, Math.min(nextPage, totalOrderPages));
    setFilters((prev) => {
      if (prev.page === clampedPage) {
        return prev;
      }

      return {
        ...prev,
        page: clampedPage,
      };
    });
  }, [totalOrderPages]);
  const showOrdersLoadingState = ordersLoading && totalOrderCount === 0 && orders.length === 0 && !ordersError;
  const usesCollectOrdersSummary = ordersQueryMode === "collectOrdersForSeller";

  useEffect(() => {
    if (filters.page <= totalOrderPages) {
      return;
    }

    setFilters((prev) => {
      if (prev.page <= totalOrderPages) {
        return prev;
      }

      return {
        ...prev,
        page: totalOrderPages,
      };
    });
  }, [filters.page, totalOrderPages]);

  return (
    <div className={shellClassName}>
      <div className={shellInnerClassName}>
        {!embedded ? (
        <section className="console-hero overflow-hidden rounded-[34px] text-white">
          <div className="grid gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1.8fr)_380px] lg:px-8 lg:py-8">
            <div className="space-y-6">
              <div className="console-mono flex flex-wrap items-center gap-3 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-300">
                <span className="rounded-full border border-white/12 bg-white/8 px-3 py-1">
                  {heroBadgeLabel}
                </span>
                <span className="rounded-full border border-white/12 bg-white/8 px-3 py-1">
                  {refreshing ? "Live refresh running" : "Live clearance board"}
                </span>
              </div>

              <div className="space-y-3">
                <h1 className="console-display text-4xl font-semibold tracking-[-0.06em] sm:text-6xl">
                  {heroTitle}
                </h1>
                <p className="max-w-3xl text-sm leading-7 text-slate-300">
                  {heroDescription}
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="console-dark-card rounded-[24px] p-4">
                  <div className="console-mono text-[11px] uppercase tracking-[0.16em] text-slate-400">
                    Coverage
                  </div>
                  <div className="mt-2 text-lg font-semibold text-white">{storeCoverageLabel}</div>
                  <div className="mt-1 text-xs text-slate-400">{storeCoverageCaption}</div>
                </div>
                <div className="console-dark-card rounded-[24px] p-4">
                  <div className="console-mono text-[11px] uppercase tracking-[0.16em] text-slate-400">
                    Last sync
                  </div>
                  <div className="mt-2 text-lg font-semibold text-white">
                    {data?.fetchedAt ? formatDateTime(data.fetchedAt) : "Waiting for first sync"}
                  </div>
                  <div className="mt-1 text-xs text-slate-400">{connectionState}</div>
                </div>
                <div className="console-dark-card rounded-[24px] p-4">
                  <div className="console-mono text-[11px] uppercase tracking-[0.16em] text-slate-400">
                    Live feeds
                  </div>
                  <div className="mt-2 text-sm font-medium text-white">
                    {refreshing ? "Sync running" : "Orders + withdrawals"}
                  </div>
                  <div className="mt-1 text-xs text-slate-400">
                    {connectionState}
                  </div>
                </div>
              </div>
            </div>

            <AdminWalletCard
              address={activeAccount?.address}
              accessLabel={walletAccessLabel}
              title={walletTitle}
              disconnectedMessage={walletCardMessage}
              errorMessage={connectionError}
            />
          </div>
        </section>
        ) : null}

        <section className="console-panel rounded-[30px] p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-1">
                <p className="console-mono text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">
                  Filters
                </p>
                <h2 className="console-display text-3xl font-semibold tracking-[-0.05em] text-slate-950">
                  {isStoreScoped ? "Store clearance query" : "Clearance query"}
                </h2>
              </div>
            </div>

          <div className="mt-6 rounded-[28px] bg-slate-950 px-4 py-4 text-white md:px-5 md:py-5">
            {hideStoreFilter ? (
              <div className="mb-3 text-xs text-slate-400">
                현재 범위: {storeCoverageLabel}
              </div>
            ) : null}
            <div className={`grid gap-3 ${filterGridClassName}`}>
              {!hideStoreFilter ? (
              <label className="space-y-2 text-sm">
                <span className="font-medium text-slate-200">가맹점</span>
                <select
                  value={filters.storecode}
                  onChange={(event) => {
                    setFilters((prev) => ({
                      ...prev,
                      storecode: event.target.value,
                      page: 1,
                    }));
                  }}
                  className="h-12 w-full rounded-[20px] border border-slate-200 bg-slate-50 px-4 text-[15px] text-slate-900 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-100"
                >
                  <option value="">전체 가맹점</option>
                  {stores.map((store) => {
                    const storecode = String(store.storecode || "").trim();
                    if (!storecode) {
                      return null;
                    }

                    return (
                      <option key={storecode} value={storecode}>
                        {getStoreDisplayName(store) || storecode}
                      </option>
                    );
                  })}
                </select>
              </label>
              ) : null}

              <label className="space-y-2 text-sm">
                <span className="font-medium text-slate-200">날짜</span>
                <input
                  type="date"
                  value={filters.fromDate}
                  onChange={(event) => {
                    setFilters((prev) => ({
                      ...prev,
                      fromDate: event.target.value,
                      toDate: event.target.value,
                      page: 1,
                    }));
                  }}
                  className="h-12 w-full rounded-[20px] border border-slate-200 bg-slate-50 px-4 text-[15px] text-slate-900 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-100"
                />
              </label>

              <div className="space-y-2 text-sm">
                <span className="font-medium text-slate-200">빠른 날짜</span>
                <div className="flex h-12 items-center gap-2">
                  {[
                    { label: "오늘", offset: 0 },
                    { label: "어제", offset: -1 },
                  ].map((item) => {
                    const date = createInputDate(item.offset);
                    const active = filters.fromDate === date && filters.toDate === date;

                    return (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => {
                          setFilters((prev) => ({
                            ...prev,
                            fromDate: date,
                            toDate: date,
                            page: 1,
                          }));
                        }}
                        className={`rounded-full border px-3.5 py-2 text-sm font-medium transition ${
                          active
                            ? "border-sky-300 bg-sky-300/15 text-sky-100"
                            : "border-white/10 bg-white/6 text-slate-200 hover:bg-white/10"
                        }`}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <span className="font-medium text-slate-200">옵션</span>
                <div className="flex h-12 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setFilters((prev) => ({
                        ...prev,
                        searchMyOrders: !prev.searchMyOrders,
                        page: 1,
                      }));
                    }}
                    className={`rounded-full border px-3.5 py-2 text-sm font-medium transition ${
                      filters.searchMyOrders
                        ? "border-sky-300 bg-sky-300/15 text-sky-100"
                        : "border-white/10 bg-white/6 text-slate-200 hover:bg-white/10"
                    }`}
                  >
                    내 주문
                  </button>
                </div>
                <div className="text-xs text-slate-400">날짜와 옵션 변경은 즉시 반영됩니다.</div>
              </div>
            </div>
            <div className={`mt-3 text-xs ${storesError ? "text-rose-300" : "text-slate-400"}`}>
              {storesError
                ? `가맹점 메타 동기화 실패: ${storesError}`
                : "가맹점 메타는 로고와 계좌 매칭 보강에 사용됩니다."}
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: "전체 주문",
              value: showOrdersLoadingState ? "..." : NUMBER_FORMATTER.format(totalOrderCount),
              caption: showOrdersLoadingState
                ? "주문 집계 불러오는 중"
                : usesCollectOrdersSummary
                  ? "현재 필터 기준 전체 청산 주문 수"
                  : "현재 필터 기준 청산 주문 수",
            },
            {
              label: usesCollectOrdersSummary ? "청산주문" : "출금완료",
              value: showOrdersLoadingState ? "..." : NUMBER_FORMATTER.format(totalClearanceCount),
              caption: showOrdersLoadingState
                ? "주문 집계 불러오는 중"
                : usesCollectOrdersSummary
                  ? "가맹점 청산주문 API 집계 기준"
                  : "paymentConfirmed 기준 완료 건수",
            },
            {
              label: "청산량",
              value: showOrdersLoadingState ? "..." : `${formatUsdtValue(totalClearanceAmount)} USDT`,
              caption: showOrdersLoadingState
                ? "주문 집계 불러오는 중"
                : usesCollectOrdersSummary
                  ? "청산 대상 물량"
                  : "완료된 청산 물량",
            },
            {
              label: "청산금액",
              value: showOrdersLoadingState ? "..." : `${formatKrwValue(totalClearanceAmountKRW)} KRW`,
              caption: showOrdersLoadingState
                ? "주문 집계 불러오는 중"
                : usesCollectOrdersSummary
                  ? "청산 대상 금액"
                  : "완료된 청산 금액",
            },
          ].map((item) => (
            <article key={item.label} className="console-panel rounded-[28px] p-5">
              <div className="console-mono text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">
                {item.label}
              </div>
              <div className="console-display mt-3 text-right text-3xl font-semibold tracking-[-0.05em] text-slate-950">
                {item.value}
              </div>
              <div className="mt-2 text-sm text-slate-600">{item.caption}</div>
            </article>
          ))}
        </section>

        {!hideWithdrawalLiveSection ? (
          <ClearanceWithdrawalLiveSection
            storeCoverageLabel={storeCoverageLabel}
            latestWithdrawalRealtimeAt={latestWithdrawalRealtimeAt}
            withdrawalRealtimeNowMs={withdrawalRealtimeNowMs}
            refreshing={refreshing}
            connectionState={connectionState}
            connectionIndicatorClassName={connectionIndicatorClassName}
            withdrawalRealtimeEventCount={withdrawalRealtimeEventCount}
            withdrawalRealtimeAmountTotal={withdrawalRealtimeAmountTotal}
            connectionError={connectionError}
            withdrawalSyncError={withdrawalSyncError}
            filteredWithdrawalRealtimeItems={filteredWithdrawalRealtimeItems}
            stores={stores}
          />
        ) : null}

        <ClearanceOrdersTableSection
          error={error}
          ordersError={ordersError}
          orders={orders}
          ordersLoading={ordersLoading}
          ordersRefreshing={ordersRefreshing}
          isWalletRecovering={isWalletRecovering}
          hasPrivilegedOrderAccess={hasPrivilegedOrderAccess}
          disconnectedMessage={disconnectedMessage}
          showMaskedNotice={
            supportsPublicMaskedOrders
            && Boolean(data?.fetchedAt)
            && !hasPrivilegedOrderAccess
            && !ordersError
          }
          processingOrderId={processingOrderId}
          actionModalSubmitting={actionModalSubmitting}
          actionModalMode={actionModalState?.mode || null}
          allowOrderActions={allowOrderActions && hasPrivilegedOrderAccess}
          copiedTradeId={copiedTradeId}
          totalOrderCount={totalOrderCount}
          currentOrderRangeStart={currentOrderRangeStart}
          currentOrderRangeEnd={currentOrderRangeEnd}
          currentOrderPage={currentOrderPage}
          totalOrderPages={totalOrderPages}
          orderPaginationItems={orderPaginationItems}
          canGoToPreviousOrderPage={canGoToPreviousOrderPage}
          canGoToNextOrderPage={canGoToNextOrderPage}
          isOrderPaginationBusy={isOrderPaginationBusy}
          onCopyTradeId={copyTradeId}
          onOpenActionModal={openActionModal}
          onUpdateOrderPage={updateOrderPage}
        />

        {actionModalState ? (
          <ClearanceActionModal
            accessActorLabel={accessActorLabel}
            actionModalState={actionModalState}
            actionModalSubmitting={actionModalSubmitting}
            actionModalError={actionModalError}
            canSubmitActionModal={canSubmitActionModal}
            onClose={closeActionModal}
            onSubmit={handleClearanceActionFromConsole}
          />
        ) : null}
      </div>
    </div>
  );
}
