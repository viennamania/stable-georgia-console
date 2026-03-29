"use client";

import {
  formatKrwValue,
  formatUsdtValue,
  getBuyerBankSummary,
  getBuyerDisplayName,
  getSellerBankSummary,
  getStoreDisplayName,
  getWithdrawalProcessingModeMeta,
  getWithdrawalStatusMeta,
  type ClearanceActionModalState,
} from "./clearance-management-shared";

type ClearanceActionModalProps = {
  accessActorLabel: string;
  actionModalState: ClearanceActionModalState;
  actionModalSubmitting: boolean;
  actionModalError: string;
  canSubmitActionModal: boolean;
  onClose: () => void;
  onSubmit: () => void | Promise<void>;
};

export default function ClearanceActionModal({
  accessActorLabel,
  actionModalState,
  actionModalSubmitting,
  actionModalError,
  canSubmitActionModal,
  onClose,
  onSubmit,
}: ClearanceActionModalProps) {
  const buyerBankSummary = getBuyerBankSummary(actionModalState.order);
  const sellerBankSummary = getSellerBankSummary(actionModalState.order);
  const withdrawalStatusMeta = getWithdrawalStatusMeta(actionModalState.order);
  const processingModeMeta = getWithdrawalProcessingModeMeta(actionModalState.order);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-2xl overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.28)]">
        <div className="border-b border-slate-200 px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="console-mono text-[11px] uppercase tracking-[0.16em] text-slate-500">
                {actionModalState.mode === "complete" ? "출금완료 확인" : "청산취소 확인"}
              </div>
              <h3 className="text-2xl font-semibold tracking-[-0.04em] text-slate-950">
                {actionModalState.mode === "complete"
                  ? "이 주문을 출금완료 처리하시겠습니까?"
                  : "이 청산주문을 취소하시겠습니까?"}
              </h3>
              <p className="text-sm text-slate-600">
                {actionModalState.mode === "complete"
                  ? `${accessActorLabel} 서명으로 \`buyer.depositCompleted=true\`를 기록합니다.`
                  : `${accessActorLabel} 서명으로 주문 상태를 \`cancelled\`로 변경하고 연결된 입금 매칭을 해제합니다.`}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={actionModalSubmitting}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              닫기
            </button>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="console-mono text-[11px] uppercase tracking-[0.14em] text-slate-500">Trade ID</div>
              <div className="mt-2 text-sm font-semibold text-slate-950">
                {actionModalState.order.tradeId || "-"}
              </div>
            </div>
            <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="console-mono text-[11px] uppercase tracking-[0.14em] text-slate-500">Store</div>
              <div className="mt-2 text-sm font-semibold text-slate-950">
                {getStoreDisplayName(actionModalState.order.store) || actionModalState.order.storecode || "-"}
              </div>
            </div>
            <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="console-mono text-[11px] uppercase tracking-[0.14em] text-slate-500">Buyer</div>
              <div className="mt-2 text-sm font-semibold text-slate-950">
                {getBuyerDisplayName(actionModalState.order)}
              </div>
              <div className="mt-1 text-xs text-slate-600">
                {buyerBankSummary.secondary || "계좌정보 없음"}
              </div>
            </div>
            <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="console-mono text-[11px] uppercase tracking-[0.14em] text-slate-500">Seller account</div>
              <div className="mt-2 text-sm font-semibold text-slate-950">
                {sellerBankSummary.primary || "계좌정보 없음"}
              </div>
              <div className="mt-1 text-xs text-slate-600">
                {sellerBankSummary.secondary || "-"}
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="console-mono text-[11px] uppercase tracking-[0.14em] text-slate-500">Order KRW</div>
              <div className="mt-2 text-sm font-semibold text-slate-950">
                {formatKrwValue(actionModalState.order.krwAmount)} KRW
              </div>
            </div>
            <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="console-mono text-[11px] uppercase tracking-[0.14em] text-slate-500">Order USDT</div>
              <div className="mt-2 text-sm font-semibold text-slate-950">
                {formatUsdtValue(actionModalState.order.usdtAmount)} USDT
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            <span className={`rounded-full px-3 py-1.5 font-semibold ${withdrawalStatusMeta.className || "border border-slate-200 bg-slate-50 text-slate-700"}`}>
              현재 상태 {withdrawalStatusMeta.label || "-"}
            </span>
            <span className={`rounded-full px-3 py-1.5 font-semibold ${processingModeMeta.className || "border border-slate-200 bg-slate-50 text-slate-700"}`}>
              {processingModeMeta.label || "-"}
            </span>
            {!canSubmitActionModal ? (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 font-semibold text-amber-700">
                상태가 변경되어 더 이상 처리할 수 없습니다.
              </span>
            ) : null}
          </div>
        </div>

        <div className="px-6 py-5">
          <div
            className={`rounded-[20px] border px-4 py-3 text-sm ${
              actionModalState.mode === "complete"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-800"
            }`}
          >
            {actionModalState.mode === "complete"
              ? "이미 발생한 온체인 전송과 별개로, 관리자 출금완료 기록만 갱신합니다."
              : "취소 후 주문 상태는 cancelled로 바뀌며, 이미 발생한 온체인 전송은 되돌릴 수 없습니다."}
          </div>

          {actionModalError ? (
            <div className="mt-4 rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {actionModalError}
            </div>
          ) : null}
        </div>

        <div className="border-t border-slate-200 px-6 py-4">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={actionModalSubmitting}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              닫기
            </button>
            <button
              type="button"
              onClick={() => {
                void onSubmit();
              }}
              disabled={actionModalSubmitting || !canSubmitActionModal}
              className={`rounded-full px-5 py-2 text-sm font-semibold text-white transition ${
                actionModalSubmitting || !canSubmitActionModal
                  ? "cursor-not-allowed bg-slate-300"
                  : actionModalState.mode === "complete"
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-rose-600 hover:bg-rose-700"
              }`}
            >
              {actionModalSubmitting
                ? actionModalState.mode === "complete"
                  ? "출금완료 처리중..."
                  : "청산취소 처리중..."
                : actionModalState.mode === "complete"
                  ? "출금완료 처리"
                  : "청산주문 취소"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
