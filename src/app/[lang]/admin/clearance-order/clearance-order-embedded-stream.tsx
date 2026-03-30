"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Account } from "thirdweb/wallets";

import { createCenterStoreAdminSignedBody } from "@/lib/client/create-center-store-admin-signed-body";
import ClearanceOrdersTableSection from "@/app/[lang]/admin/clearance-management/clearance-orders-table-section";
import {
  buildPaginationItems,
  createInputDate,
  normalizeText,
  NUMBER_FORMATTER,
  type ClearanceOrder,
} from "@/app/[lang]/admin/clearance-management/clearance-management-shared";

type ClearanceOrderEmbeddedStreamProps = {
  activeAccount: Account | null | undefined;
  storecode: string;
  refreshKey: number;
};

type ClearanceOrdersResponse = {
  ordersError?: string;
  ordersAccessLevel?: string;
  orders?: ClearanceOrder[];
  totalCount?: number;
  totalClearanceCount?: number;
  totalClearanceAmount?: number;
  totalClearanceAmountKRW?: number;
};

const DEFAULT_LIMIT = 15;
const ORDERS_REFRESH_INTERVAL_MS = 60_000;

export default function ClearanceOrderEmbeddedStream({
  activeAccount,
  storecode,
  refreshKey,
}: ClearanceOrderEmbeddedStreamProps) {
  const [fromDate, setFromDate] = useState(createInputDate(0));
  const [toDate, setToDate] = useState(createInputDate(0));
  const [page, setPage] = useState(1);
  const [orders, setOrders] = useState<ClearanceOrder[]>([]);
  const [ordersError, setOrdersError] = useState("");
  const [error, setError] = useState("");
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersRefreshing, setOrdersRefreshing] = useState(false);
  const [copiedTradeId, setCopiedTradeId] = useState("");
  const [ordersAccessLevel, setOrdersAccessLevel] = useState("public");
  const [totalCount, setTotalCount] = useState(0);
  const [totalClearanceCount, setTotalClearanceCount] = useState(0);
  const [totalClearanceAmount, setTotalClearanceAmount] = useState(0);
  const [totalClearanceAmountKRW, setTotalClearanceAmountKRW] = useState(0);
  const requestIdRef = useRef(0);
  const copyResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setPage(1);
  }, [storecode, fromDate, toDate]);

  useEffect(() => {
    return () => {
      if (copyResetTimerRef.current) {
        clearTimeout(copyResetTimerRef.current);
      }
    };
  }, []);

  const canReadSignedData = Boolean(activeAccount?.address);
  const disconnectedMessage = "관리자 지갑을 연결하면 민감정보가 풀린 청산주문 상세 조회가 열립니다.";

  const loadOrders = useCallback(async (options?: { silent?: boolean }) => {
    const requestId = ++requestIdRef.current;
    const silent = options?.silent === true;

    if (!storecode) {
      setOrders([]);
      setOrdersAccessLevel("public");
      setTotalCount(0);
      setTotalClearanceCount(0);
      setTotalClearanceAmount(0);
      setTotalClearanceAmountKRW(0);
      setOrdersError("");
      setError("");
      setOrdersLoading(false);
      setOrdersRefreshing(false);
      return;
    }

    if (silent) {
      setOrdersRefreshing(true);
    } else {
      setOrdersLoading(true);
    }
    setError("");

    try {
      let signedOrdersBody: Record<string, unknown> | null = null;

      if (activeAccount) {
        try {
          signedOrdersBody = await createCenterStoreAdminSignedBody({
            account: activeAccount,
            route: "/api/order/getAdminClearanceOrders",
            storecode: "admin",
            requesterWalletAddress: activeAccount.address,
            body: {
              storecode,
              limit: DEFAULT_LIMIT,
              page,
              walletAddress: activeAccount.address,
              searchMyOrders: false,
              privateSale: true,
              fromDate,
              toDate,
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
            storecode,
            limit: DEFAULT_LIMIT,
            page,
            fromDate,
            toDate,
          },
          ordersQueryMode: "buyOrders",
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load clearance orders");
      }

      if (requestId !== requestIdRef.current) {
        return;
      }

      const result = (payload?.result || {}) as ClearanceOrdersResponse;
      setOrders(Array.isArray(result.orders) ? result.orders : []);
      setOrdersError(normalizeText(result.ordersError));
      setOrdersAccessLevel(normalizeText(result.ordersAccessLevel) || "public");
      setTotalCount(Number(result.totalCount || 0));
      setTotalClearanceCount(Number(result.totalClearanceCount || 0));
      setTotalClearanceAmount(Number(result.totalClearanceAmount || 0));
      setTotalClearanceAmountKRW(Number(result.totalClearanceAmountKRW || 0));
    } catch (loadError) {
      if (requestId !== requestIdRef.current) {
        return;
      }
      setError(loadError instanceof Error ? loadError.message : "Failed to load clearance orders");
    } finally {
      if (requestId === requestIdRef.current) {
        setOrdersLoading(false);
        setOrdersRefreshing(false);
      }
    }
  }, [activeAccount, fromDate, page, storecode, toDate]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders, refreshKey]);

  useEffect(() => {
    if (!activeAccount || !storecode) {
      return;
    }

    const interval = setInterval(() => {
      void loadOrders({ silent: true });
    }, ORDERS_REFRESH_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [activeAccount, loadOrders, storecode]);

  const currentOrderRangeStart = totalCount === 0 ? 0 : ((page - 1) * DEFAULT_LIMIT) + 1;
  const currentOrderRangeEnd = totalCount === 0
    ? 0
    : Math.min(totalCount, page * DEFAULT_LIMIT);
  const totalOrderPages = Math.max(1, Math.ceil(totalCount / DEFAULT_LIMIT));
  const orderPaginationItems = useMemo(
    () => buildPaginationItems(page, totalOrderPages),
    [page, totalOrderPages],
  );

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
      // Keep copy interactions non-blocking.
    }
  }, []);

  return (
    <section className="space-y-4">
      <div className="console-panel rounded-[30px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.95),rgba(255,255,255,0.98))] p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="console-mono text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">
              Embedded stream
            </div>
            <h2 className="console-display mt-2 text-2xl font-semibold tracking-[-0.05em] text-slate-950">
              청산주문 스트림
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600">
              <span>시작일</span>
              <input
                type="date"
                value={fromDate}
                onChange={(event) => setFromDate(event.target.value || createInputDate(0))}
                className="rounded-md border-0 bg-transparent p-0 text-xs font-medium text-slate-700 outline-none"
              />
            </label>
            <label className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600">
              <span>종료일</span>
              <input
                type="date"
                value={toDate}
                onChange={(event) => setToDate(event.target.value || createInputDate(0))}
                className="rounded-md border-0 bg-transparent p-0 text-xs font-medium text-slate-700 outline-none"
              />
            </label>
            <button
              type="button"
              onClick={() => {
                void loadOrders();
              }}
              disabled={ordersLoading || ordersRefreshing}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              새로고침
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-[22px] border border-slate-200 bg-white px-4 py-3">
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
              Clearance count
            </div>
            <div className="mt-2 text-[26px] font-semibold tracking-[-0.05em] text-slate-950">
              {NUMBER_FORMATTER.format(totalClearanceCount)}
            </div>
          </div>
          <div className="rounded-[22px] border border-slate-200 bg-white px-4 py-3">
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
              Clearance KRW
            </div>
            <div className="mt-2 text-[26px] font-semibold tracking-[-0.05em] text-slate-950">
              {NUMBER_FORMATTER.format(Math.round(totalClearanceAmountKRW))}
            </div>
          </div>
          <div className="rounded-[22px] border border-slate-200 bg-white px-4 py-3">
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
              Clearance USDT
            </div>
            <div className="mt-2 text-[26px] font-semibold tracking-[-0.05em] text-slate-950">
              {Number(totalClearanceAmount || 0).toLocaleString("en-US", {
                minimumFractionDigits: 3,
                maximumFractionDigits: 3,
              })}
            </div>
          </div>
        </div>
      </div>

      <ClearanceOrdersTableSection
        error={error}
        ordersError={ordersError}
        orders={orders}
        ordersLoading={ordersLoading}
        ordersRefreshing={ordersRefreshing}
        isWalletRecovering={false}
        hasPrivilegedOrderAccess={ordersAccessLevel === "privileged"}
        disconnectedMessage={disconnectedMessage}
        showMaskedNotice={ordersAccessLevel !== "privileged"}
        processingOrderId=""
        actionModalSubmitting={false}
        actionModalMode={null}
        allowOrderActions={false}
        copiedTradeId={copiedTradeId}
        totalOrderCount={totalCount}
        currentOrderRangeStart={currentOrderRangeStart}
        currentOrderRangeEnd={currentOrderRangeEnd}
        currentOrderPage={page}
        totalOrderPages={totalOrderPages}
        orderPaginationItems={orderPaginationItems}
        canGoToPreviousOrderPage={page > 1}
        canGoToNextOrderPage={page < totalOrderPages}
        isOrderPaginationBusy={ordersLoading || ordersRefreshing}
        onCopyTradeId={copyTradeId}
        onOpenActionModal={() => {}}
        onUpdateOrderPage={setPage}
      />
    </section>
  );
}
