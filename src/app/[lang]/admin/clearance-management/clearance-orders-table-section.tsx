"use client";

import {
  NUMBER_FORMATTER,
  formatAdminActionDateTime,
  formatDateTime,
  formatKrwValue,
  formatRateValue,
  formatTimeAgo,
  formatUsdtValue,
  getBscscanTxUrl,
  getBuyerBankSummary,
  getBuyerDisplayName,
  getCancelledByLabel,
  getClearanceOrderCreatorLabel,
  getDepositCompletedActorLabel,
  getSellerBankSummary,
  getStatusMeta,
  getStoreDisplayName,
  getStoreLogoSrc,
  getWithdrawalProcessingModeMeta,
  getWithdrawalStatusMeta,
  normalizeText,
  shortAddress,
  type ClearanceActionMode,
  type ClearanceOrder,
  type PaginationItem,
} from "./clearance-management-shared";

type ClearanceOrdersTableSectionProps = {
  error: string;
  ordersError: string;
  orders: ClearanceOrder[];
  ordersLoading: boolean;
  ordersRefreshing: boolean;
  isWalletRecovering: boolean;
  hasPrivilegedOrderAccess: boolean;
  disconnectedMessage: string;
  showMaskedNotice: boolean;
  processingOrderId: string;
  actionModalSubmitting: boolean;
  actionModalMode?: ClearanceActionMode | null;
  allowOrderActions: boolean;
  copiedTradeId: string;
  totalOrderCount: number;
  currentOrderRangeStart: number;
  currentOrderRangeEnd: number;
  currentOrderPage: number;
  totalOrderPages: number;
  orderPaginationItems: PaginationItem[];
  canGoToPreviousOrderPage: boolean;
  canGoToNextOrderPage: boolean;
  isOrderPaginationBusy: boolean;
  onCopyTradeId: (tradeId: string) => void | Promise<void>;
  onOpenActionModal: (mode: ClearanceActionMode, order: ClearanceOrder) => void;
  onUpdateOrderPage: (page: number) => void;
};

export default function ClearanceOrdersTableSection({
  error,
  ordersError,
  orders,
  ordersLoading,
  ordersRefreshing,
  isWalletRecovering,
  hasPrivilegedOrderAccess,
  disconnectedMessage,
  showMaskedNotice,
  processingOrderId,
  actionModalSubmitting,
  actionModalMode,
  allowOrderActions,
  copiedTradeId,
  totalOrderCount,
  currentOrderRangeStart,
  currentOrderRangeEnd,
  currentOrderPage,
  totalOrderPages,
  orderPaginationItems,
  canGoToPreviousOrderPage,
  canGoToNextOrderPage,
  isOrderPaginationBusy,
  onCopyTradeId,
  onOpenActionModal,
  onUpdateOrderPage,
}: ClearanceOrdersTableSectionProps) {
  return (
    <section className="console-panel overflow-hidden rounded-[30px]">
      <div className="border-b border-slate-200/80 px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="console-display text-3xl font-semibold tracking-[-0.05em] text-slate-950">
              Clearance stream
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
            {ordersLoading || ordersRefreshing ? (
              <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-sky-700">
                {ordersLoading ? "주문 로딩중" : "주문 새로고침중"}
              </span>
            ) : null}
            <span className="rounded-full bg-slate-100 px-3 py-1">
              Rows {NUMBER_FORMATTER.format(currentOrderRangeStart)}-{NUMBER_FORMATTER.format(currentOrderRangeEnd)} / {NUMBER_FORMATTER.format(totalOrderCount)}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1">
              Page {NUMBER_FORMATTER.format(currentOrderPage)} / {NUMBER_FORMATTER.format(totalOrderPages)}
            </span>
          </div>
        </div>
      </div>

      {error || ordersError ? (
        <div className="px-6 py-3">
          <div className="rounded-[24px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error || ordersError}
          </div>
        </div>
      ) : null}

      {showMaskedNotice ? (
        <div className="px-6 pt-3">
          <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-5 py-4 text-sm leading-7 text-slate-600">
            현재 주문 목록은 공개 마스킹 뷰입니다. 구매자/판매자 이름, 지갑주소, 계좌정보는 일부 마스킹되며
            청산 완료/취소 처리 기능은 숨겨집니다. {disconnectedMessage}
          </div>
        </div>
      ) : null}

      <div className="px-2 pb-2">
        <div className="overflow-x-auto overscroll-x-contain">
          <table className="min-w-[1080px] w-full table-fixed border-separate border-spacing-0">
          <thead>
            <tr className="console-mono text-left text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
              <th className="w-[18%] border-b border-slate-200 px-3 py-2.5">Trade</th>
              <th className="w-[10%] border-b border-slate-200 px-3 py-2.5">상태</th>
              <th className="w-[15%] border-b border-slate-200 px-3 py-2.5">구매자 / 출금계좌</th>
              <th className="w-[19%] border-b border-slate-200 px-3 py-2.5">판매자 / 입금계좌</th>
              <th className="w-[12%] border-b border-slate-200 px-3 py-2.5 text-right">Amount</th>
              <th className="w-[14%] border-b border-slate-200 px-3 py-2.5">출금상태</th>
              <th className="w-[12%] border-b border-slate-200 px-3 py-2.5">USDT 전송</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">
                  {isWalletRecovering
                    ? "Loading clearance orders..."
                    : !hasPrivilegedOrderAccess && !showMaskedNotice
                    ? disconnectedMessage
                    : ordersLoading
                      ? "Loading clearance orders..."
                      : "No clearance orders returned for the current filter."}
                </td>
              </tr>
            ) : (
              orders.map((order, index) => {
                const orderId = String(order._id || "").trim();
                const tradeId = String(order.tradeId || "").trim();
                const statusMeta = getStatusMeta(order.status);
                const withdrawalStatusMeta = getWithdrawalStatusMeta(order);
                const processingModeMeta = getWithdrawalProcessingModeMeta(order);
                const buyerLabel = getBuyerDisplayName(order);
                const buyerBankSummary = getBuyerBankSummary(order);
                const sellerBankSummary = getSellerBankSummary(order);
                const createdAtLabel = formatDateTime(order.createdAt);
                const createdTimeAgoLabel = formatTimeAgo(order.createdAt);
                const createdByLabel = getClearanceOrderCreatorLabel(order);
                const transactionHash = String(order.transactionHash || "").trim();
                const depositCompletedActorLabel = getDepositCompletedActorLabel(order.buyer);
                const isWithdrawalCompleted = order.buyer?.depositCompleted === true;
                const isCancelled = ["cancelled", "canceled"].includes(String(order.status || "").trim().toLowerCase());
                const cancelledByLabel = isCancelled ? getCancelledByLabel(order) : "";
                const isProcessingThisOrder = processingOrderId === orderId;
                const isCopiedTradeId = Boolean(tradeId && copiedTradeId === tradeId);

                return (
                  <tr
                    key={order._id || order.tradeId}
                    className={index % 2 === 0 ? "bg-white text-sm text-slate-700" : "bg-slate-50/60 text-sm text-slate-700"}
                  >
                    <td className="border-b border-slate-100 px-3 py-3 align-top">
                      <div className="flex items-start gap-2.5">
                        <img
                          src={getStoreLogoSrc(order.store)}
                          alt={getStoreDisplayName(order.store) || order.storecode || "Store"}
                          className="h-9 w-9 shrink-0 rounded-2xl border border-slate-200 bg-white object-cover"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-slate-950">
                              {getStoreDisplayName(order.store) || order.storecode || "-"}
                            </div>
                            <div className="mt-0.5 truncate text-[11px] text-slate-500">
                              {order.storecode || "-"}
                            </div>
                          </div>
                          <div className="mt-2 break-all font-semibold text-slate-900">
                            {tradeId ? (
                              <button
                                type="button"
                                onClick={() => {
                                  void onCopyTradeId(tradeId);
                                }}
                                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-left transition hover:border-sky-300 hover:bg-sky-50"
                                title="클릭해서 청산 주문번호 복사"
                              >
                                <span className="font-semibold text-slate-950">{tradeId}</span>
                                <span
                                  className={`console-mono text-[10px] uppercase tracking-[0.14em] ${
                                    isCopiedTradeId ? "text-emerald-600" : "text-slate-400"
                                  }`}
                                >
                                  {isCopiedTradeId ? "copied" : "copy"}
                                </span>
                              </button>
                            ) : (
                              "-"
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                            <span className="break-words">
                              {createdAtLabel === "-" ? "-" : `${createdAtLabel} · ${createdTimeAgoLabel}`}
                            </span>
                          </div>
                          {createdByLabel ? (
                            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                              <span>생성자 {createdByLabel}</span>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="border-b border-slate-100 px-3 py-3 align-top">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusMeta.className}`}>
                        {statusMeta.label}
                      </span>
                    </td>
                    <td className="border-b border-slate-100 px-3 py-3 align-top">
                      <div className="space-y-1.5 break-words">
                        <div className="break-words font-medium text-slate-950">{buyerLabel}</div>
                        <div className="break-words text-[13px] font-bold leading-snug text-slate-950">
                          {buyerBankSummary.primary}
                        </div>
                        <div className="break-all text-[13px] font-semibold leading-snug text-slate-800">
                          {buyerBankSummary.secondary}
                        </div>
                      </div>
                    </td>
                    <td className="border-b border-slate-100 px-3 py-3 align-top">
                      <div className="space-y-1.5 break-words">
                        <div className="break-words font-medium text-slate-950">
                          {order.seller?.nickname || shortAddress(order.seller?.walletAddress || order.seller?.signerAddress)}
                        </div>
                        <div className="break-words text-[13px] font-bold leading-snug text-slate-950">
                          {sellerBankSummary.primary}
                        </div>
                        <div className="break-all text-[13px] font-semibold leading-snug text-slate-800">
                          {sellerBankSummary.secondary}
                        </div>
                      </div>
                    </td>
                    <td className="border-b border-slate-100 px-3 py-3 text-right align-top">
                      <div className="text-base font-semibold tracking-[-0.03em] text-slate-950">
                        {formatKrwValue(order.krwAmount)} KRW
                      </div>
                      <div className="mt-0.5 text-[11px] font-semibold text-emerald-600">
                        {formatUsdtValue(order.usdtAmount)} USDT
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500">
                        환율 {formatRateValue(order.rate)}
                      </div>
                    </td>
                    <td className="border-b border-slate-100 px-3 py-3 align-top">
                      <div className="flex min-w-0 flex-col items-start gap-1.5 break-words">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${withdrawalStatusMeta.className}`}>
                          {withdrawalStatusMeta.label}
                        </span>
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${processingModeMeta.className}`}>
                          {processingModeMeta.label}
                        </span>

                        {isWithdrawalCompleted ? (
                          <div className="space-y-0.5 text-[11px] text-slate-500">
                            {processingModeMeta.isManual && depositCompletedActorLabel && depositCompletedActorLabel !== "-" ? (
                              <div>처리자 {depositCompletedActorLabel}</div>
                            ) : null}
                            {order.buyer?.depositCompletedAt ? (
                              <div>{formatAdminActionDateTime(order.buyer.depositCompletedAt)}</div>
                            ) : null}
                          </div>
                        ) : isCancelled ? (
                          <div className="space-y-0.5 break-words text-[11px] text-slate-500">
                            <div>취소자 {cancelledByLabel || "-"}</div>
                            {order.cancelledAt ? (
                              <div>{formatAdminActionDateTime(order.cancelledAt)}</div>
                            ) : null}
                          </div>
                        ) : (
                          <div className="flex w-full flex-col gap-1.5">
                            {allowOrderActions ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => onOpenActionModal("complete", order)}
                                  disabled={isProcessingThisOrder || actionModalSubmitting}
                                  className={`rounded-full px-3 py-1.5 text-[11px] font-semibold text-white transition ${
                                    isProcessingThisOrder || actionModalSubmitting
                                      ? "cursor-not-allowed bg-emerald-300"
                                      : "bg-emerald-600 hover:bg-emerald-700"
                                  }`}
                                >
                                  {isProcessingThisOrder && actionModalMode === "complete"
                                    ? "처리중..."
                                    : "완료하기"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onOpenActionModal("cancel", order)}
                                  disabled={isProcessingThisOrder || actionModalSubmitting}
                                  className={`rounded-full px-3 py-1.5 text-[11px] font-semibold text-white transition ${
                                    isProcessingThisOrder || actionModalSubmitting
                                      ? "cursor-not-allowed bg-rose-300"
                                      : "bg-rose-600 hover:bg-rose-700"
                                  }`}
                                >
                                  {isProcessingThisOrder && actionModalMode === "cancel"
                                    ? "취소중..."
                                    : "취소하기"}
                                </button>
                              </>
                            ) : (
                              <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
                                이 화면에서는 조회만 가능합니다.
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="border-b border-slate-100 px-3 py-3 align-top">
                      {transactionHash && transactionHash !== "0x" ? (
                        <div className="flex min-w-0 flex-col items-start gap-1 break-words">
                          <div className="text-[15px] font-semibold leading-tight tracking-[-0.03em] text-emerald-700">
                            {formatUsdtValue(order.usdtAmount)} USDT
                          </div>
                          <a
                            href={getBscscanTxUrl(transactionHash)}
                            target="_blank"
                            rel="noreferrer"
                            className="console-mono block w-full break-all text-[11px] text-slate-500 underline decoration-dotted underline-offset-2 transition hover:text-sky-700"
                          >
                            {shortAddress(transactionHash)}
                          </a>
                          <div className="break-words text-[11px] text-slate-500">
                            {formatDateTime(order.paymentConfirmedAt || order.updatedAt)}
                          </div>
                        </div>
                      ) : (
                        <div className="min-w-0 break-words">
                          <div className="text-[15px] font-semibold leading-tight tracking-[-0.03em] text-slate-950">
                            {formatUsdtValue(order.usdtAmount)} USDT
                          </div>
                          <div className="mt-1 inline-flex rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold text-slate-700">
                            전송대기
                          </div>
                          <div className="mt-1 break-words text-[11px] text-slate-500">
                            출금완료 처리 후 반영됩니다.
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          </table>
        </div>
      </div>

      {totalOrderCount > 0 ? (
        <div className="border-t border-slate-200/80 px-4 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="text-xs text-slate-500">
              Rows {NUMBER_FORMATTER.format(currentOrderRangeStart)}-{NUMBER_FORMATTER.format(currentOrderRangeEnd)}
              {" / "}
              {NUMBER_FORMATTER.format(totalOrderCount)}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <button
                type="button"
                onClick={() => onUpdateOrderPage(1)}
                disabled={!canGoToPreviousOrderPage || isOrderPaginationBusy}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                처음
              </button>
              <button
                type="button"
                onClick={() => onUpdateOrderPage(currentOrderPage - 1)}
                disabled={!canGoToPreviousOrderPage || isOrderPaginationBusy}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                이전
              </button>

              {orderPaginationItems.map((item, index) => {
                if (typeof item !== "number") {
                  return (
                    <span
                      key={`${item}-${index}`}
                      className="px-1 text-xs font-medium text-slate-400"
                    >
                      ...
                    </span>
                  );
                }

                const isActive = item === currentOrderPage;

                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => onUpdateOrderPage(item)}
                    disabled={isActive || isOrderPaginationBusy}
                    className={`min-w-[34px] rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                      isActive
                        ? "border border-sky-200 bg-sky-50 text-sky-700"
                        : "border border-slate-200 bg-white text-slate-600 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    {NUMBER_FORMATTER.format(item)}
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => onUpdateOrderPage(currentOrderPage + 1)}
                disabled={!canGoToNextOrderPage || isOrderPaginationBusy}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                다음
              </button>
              <button
                type="button"
                onClick={() => onUpdateOrderPage(totalOrderPages)}
                disabled={!canGoToNextOrderPage || isOrderPaginationBusy}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                마지막
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
