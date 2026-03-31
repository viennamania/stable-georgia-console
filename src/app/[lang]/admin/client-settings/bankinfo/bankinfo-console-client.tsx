"use client";

import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useActiveAccount } from "thirdweb/react";

import AdminWalletCard from "@/components/admin/admin-wallet-card";
import ClientSettingsSubnav from "@/components/admin/client-settings-subnav";
import { createAdminSignedBody } from "@/lib/client/create-admin-signed-body";
import {
  BANK_INFO_ADMIN_SIGNING_PREFIX,
  BANK_INFO_ADMIN_UPLOAD_ROUTE,
  BANK_INFO_ROUTE_CREATE,
  BANK_INFO_ROUTE_DELETE,
  BANK_INFO_ROUTE_GET_ALL,
  BANK_INFO_ROUTE_UPDATE,
} from "@/lib/security/bankinfo-admin";

type BankInfoConsoleClientProps = {
  lang: string;
};

type BankInfoRecord = {
  _id?: string;
  bankName?: string;
  realAccountNumber?: string;
  accountNumber?: string;
  accountHolder?: string;
  balance?: number;
  memo?: string;
  aliasAccountNumber?: string[];
  defaultAccountNumber?: string;
  realName?: string;
  residentNumber?: string;
  phoneNumber?: string;
  idCardImageUrl?: string;
  createdAt?: string;
  updatedAt?: string;
};

type BankInfoForm = {
  bankName: string;
  realAccountNumber: string;
  accountHolder: string;
};

type RealNameForm = {
  realName: string;
  residentNumber: string;
  phoneNumber: string;
  idCardImageUrl: string;
};

type FeedbackState = {
  tone: "success" | "error" | "info";
  message: string;
};

const emptyForm: BankInfoForm = {
  bankName: "",
  realAccountNumber: "",
  accountHolder: "",
};

const emptyRealNameForm: RealNameForm = {
  realName: "",
  residentNumber: "",
  phoneNumber: "",
  idCardImageUrl: "",
};

const bankNameOptions = [
  "카카오뱅크",
  "케이뱅크",
  "토스뱅크",
  "국민은행",
  "우리은행",
  "신한은행",
  "농협",
  "기업은행",
  "하나은행",
  "외환은행",
  "SC제일은행",
  "부산은행",
  "대구은행",
  "전북은행",
  "경북은행",
  "경남은행",
  "광주은행",
  "제주은행",
  "새마을금고",
  "수협",
  "신협",
  "씨티은행",
  "대신은행",
  "동양종합금융",
  "JT친애저축은행",
  "저축은행",
  "산업은행",
  "우체국",
];

const fieldClassName =
  "h-11 w-full rounded-[18px] border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-0 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400";

const textAreaClassName =
  "w-full rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-900 outline-none transition focus:border-sky-400 focus:ring-0 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400";

const normalizeString = (value: unknown) => {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
};

const formatDateTime = (value: unknown) => {
  const normalized = normalizeString(value);
  if (!normalized) {
    return "-";
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return normalized;
  }

  return parsed.toLocaleString("ko-KR");
};

const getIdValue = (item: BankInfoRecord | null | undefined) =>
  String((item as any)?._id?.toString?.() || (item as any)?._id?.$oid || item?._id || "");

const sanitizeDigits = (value: string) => value.replace(/\D/g, "");

const normalizeAliasList = (list: string[]) =>
  Array.from(
    new Set(
      list
        .map((value) => sanitizeDigits(String(value || "").trim()))
        .filter((value) => value.length > 0),
    ),
  );

const arraysEqual = (left: string[], right: string[]) => {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
};

const FeedbackBanner = ({ feedback }: { feedback: FeedbackState }) => {
  const toneClass =
    feedback.tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : feedback.tone === "error"
        ? "border-rose-200 bg-rose-50 text-rose-800"
        : "border-sky-200 bg-sky-50 text-sky-800";

  return (
    <div className={`rounded-[22px] border px-4 py-3 text-sm font-medium ${toneClass}`}>
      {feedback.message}
    </div>
  );
};

const MetricCard = ({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) => {
  return (
    <div className="min-w-0 rounded-[24px] border border-white/10 bg-white/6 px-4 py-4 text-white">
      <div className="console-mono text-[10px] uppercase tracking-[0.16em] text-slate-400">
        {label}
      </div>
      <div className="console-display mt-3 min-w-0 break-words text-[1.25rem] font-semibold leading-[1.15] tracking-[-0.05em] text-white sm:text-[1.45rem]">
        {value}
      </div>
      <div className="mt-2 text-sm text-slate-300">{hint}</div>
    </div>
  );
};

const resolveErrorMessage = (status: number, payload: any, fallback: string) => {
  if (status === 401) {
    return "관리자 서명이 필요합니다. 지갑을 다시 연결하고 시도해주세요.";
  }
  if (status === 403) {
    return "관리자 권한이 없습니다.";
  }
  if (status === 409) {
    return "이미 등록된 실계좌번호입니다.";
  }
  if (status === 400) {
    const error = normalizeString(payload?.error);
    if (error === "valid id is required") {
      return "유효하지 않은 항목입니다.";
    }
    if (
      error === "bankName, realAccountNumber, accountHolder are required"
      || error === "bankName, accountNumber, accountHolder are required"
    ) {
      return "은행명, 실계좌번호, 예금주를 모두 입력해주세요.";
    }
    return "요청 값이 올바르지 않습니다.";
  }
  if (status >= 500) {
    return "서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
  }
  return normalizeString(payload?.error) || fallback;
};

export default function BankInfoConsoleClient({ lang }: BankInfoConsoleClientProps) {
  const activeAccount = useActiveAccount();
  const address = normalizeString(activeAccount?.address);

  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [bankInfos, setBankInfos] = useState<BankInfoRecord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [form, setForm] = useState<BankInfoForm>({ ...emptyForm });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<BankInfoForm>({ ...emptyForm });

  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedInfo, setSelectedInfo] = useState<BankInfoRecord | null>(null);
  const [detailMemo, setDetailMemo] = useState("");
  const [savingMemo, setSavingMemo] = useState(false);
  const [detailAliases, setDetailAliases] = useState<string[]>([]);
  const [aliasInput, setAliasInput] = useState("");
  const [savingAliases, setSavingAliases] = useState(false);

  const [isDefaultOpen, setIsDefaultOpen] = useState(false);
  const [selectedDefaultInfo, setSelectedDefaultInfo] = useState<BankInfoRecord | null>(null);
  const [selectedDefaultValue, setSelectedDefaultValue] = useState("");
  const [savingDefault, setSavingDefault] = useState(false);

  const [isRealNameOpen, setIsRealNameOpen] = useState(false);
  const [selectedRealNameInfo, setSelectedRealNameInfo] = useState<BankInfoRecord | null>(null);
  const [realNameForm, setRealNameForm] = useState<RealNameForm>({ ...emptyRealNameForm });
  const [savingRealName, setSavingRealName] = useState(false);
  const [uploadingIdCard, setUploadingIdCard] = useState(false);

  const memoOriginal = selectedInfo?.memo || "";
  const isMemoDirty = detailMemo !== memoOriginal;
  const aliasOriginal = Array.isArray(selectedInfo?.aliasAccountNumber)
    ? selectedInfo.aliasAccountNumber
    : [];
  const isAliasDirty = !arraysEqual(detailAliases, aliasOriginal);
  const defaultOriginal = selectedDefaultInfo?.defaultAccountNumber || "";
  const isDefaultDirty = selectedDefaultValue !== defaultOriginal;
  const defaultRealValue =
    selectedDefaultInfo?.realAccountNumber || selectedDefaultInfo?.accountNumber || "";
  const defaultAliasValues = normalizeAliasList(
    Array.isArray(selectedDefaultInfo?.aliasAccountNumber) ? selectedDefaultInfo.aliasAccountNumber : [],
  ).filter((value) => value !== defaultRealValue);
  const realNameOriginal = {
    realName: selectedRealNameInfo?.realName || "",
    residentNumber: selectedRealNameInfo?.residentNumber || "",
    phoneNumber: selectedRealNameInfo?.phoneNumber || "",
    idCardImageUrl: selectedRealNameInfo?.idCardImageUrl || "",
  };
  const isRealNameDirty =
    realNameForm.realName !== realNameOriginal.realName
    || realNameForm.residentNumber !== realNameOriginal.residentNumber
    || realNameForm.phoneNumber !== realNameOriginal.phoneNumber
    || realNameForm.idCardImageUrl !== realNameOriginal.idCardImageUrl;

  const verifiedCount = useMemo(
    () =>
      bankInfos.filter(
        (info) =>
          Boolean(info.realName)
          && Boolean(info.residentNumber)
          && Boolean(info.phoneNumber)
          && Boolean(info.idCardImageUrl),
      ).length,
    [bankInfos],
  );

  const aliasCount = useMemo(
    () =>
      bankInfos.reduce(
        (sum, info) => sum + (Array.isArray(info.aliasAccountNumber) ? info.aliasAccountNumber.length : 0),
        0,
      ),
    [bankInfos],
  );

  const runBankInfoAction = useCallback(
    async ({
      route,
      actionFields,
      errorFallback,
    }: {
      route: string;
      actionFields: Record<string, unknown>;
      errorFallback: string;
    }) => {
      if (!activeAccount) {
        throw new Error("관리자 지갑 연결이 필요합니다.");
      }

      const signedBody = await createAdminSignedBody({
        account: activeAccount,
        route,
        signingPrefix: BANK_INFO_ADMIN_SIGNING_PREFIX,
        requesterStorecode: "admin",
        requesterWalletAddress: activeAccount.address,
        actionFields,
      });

      const response = await fetch("/api/bff/admin/bankinfo/action", {
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
        throw new Error(resolveErrorMessage(response.status, payload, errorFallback));
      }

      return payload;
    },
    [activeAccount],
  );

  const fetchBankInfos = useCallback(
    async (keyword = searchKeyword) => {
      if (!activeAccount || fetching) {
        return;
      }

      setFetching(true);

      try {
        const payload = await runBankInfoAction({
          route: BANK_INFO_ROUTE_GET_ALL,
          actionFields: {
            search: keyword || "",
            limit: 200,
            page: 1,
          },
          errorFallback: "은행 정보 조회에 실패했습니다.",
        });

        setBankInfos(Array.isArray(payload?.result?.bankInfos) ? payload.result.bankInfos : []);
        setTotalCount(Number(payload?.result?.totalCount || 0));
      } catch (error) {
        setFeedback({
          tone: "error",
          message: error instanceof Error ? error.message : "은행 정보 조회에 실패했습니다.",
        });
      } finally {
        setFetching(false);
      }
    },
    [activeAccount, fetching, runBankInfoAction, searchKeyword],
  );

  useEffect(() => {
    if (!address) {
      setBankInfos([]);
      setTotalCount(0);
      return;
    }
    void fetchBankInfos("");
  }, [address, fetchBankInfos]);

  const handleCreate = async () => {
    if (saving) {
      return;
    }

    const payload = {
      bankName: form.bankName.trim(),
      realAccountNumber: form.realAccountNumber.trim(),
      accountHolder: form.accountHolder.trim(),
    };

    if (!payload.bankName || !payload.realAccountNumber || !payload.accountHolder) {
      setFeedback({
        tone: "error",
        message: "은행명, 실계좌번호, 예금주를 모두 입력해주세요.",
      });
      return;
    }

    setSaving(true);

    try {
      await runBankInfoAction({
        route: BANK_INFO_ROUTE_CREATE,
        actionFields: payload,
        errorFallback: "은행 정보 등록에 실패했습니다.",
      });

      setFeedback({
        tone: "success",
        message: "은행 정보를 등록했습니다.",
      });
      setForm({ ...emptyForm });
      await fetchBankInfos();
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "은행 정보 등록에 실패했습니다.",
      });
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (item: BankInfoRecord) => {
    const id = getIdValue(item);
    if (!id) {
      return;
    }
    setEditingId(id);
    setEditForm({
      bankName: item.bankName || "",
      realAccountNumber: item.realAccountNumber || item.accountNumber || "",
      accountHolder: item.accountHolder || "",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({ ...emptyForm });
  };

  const openDetail = (item: BankInfoRecord) => {
    if (isDefaultOpen && !closeDefaultPanel()) {
      return;
    }
    if (isRealNameOpen && !closeRealNamePanel()) {
      return;
    }
    setSelectedInfo(item);
    setDetailMemo(item.memo || "");
    setDetailAliases(Array.isArray(item.aliasAccountNumber) ? [...item.aliasAccountNumber] : []);
    setAliasInput("");
    setIsDetailOpen(true);
  };

  const closeDetail = () => {
    if (isMemoDirty || isAliasDirty) {
      const shouldClose = window.confirm("변경사항이 저장되지 않았습니다. 닫으시겠습니까?");
      if (!shouldClose) {
        return false;
      }
    }
    setIsDetailOpen(false);
    setSelectedInfo(null);
    setDetailMemo("");
    setDetailAliases([]);
    setAliasInput("");
    return true;
  };

  const openDefaultPanel = (item: BankInfoRecord) => {
    if (isDetailOpen && !closeDetail()) {
      return;
    }
    if (isRealNameOpen && !closeRealNamePanel()) {
      return;
    }
    setSelectedDefaultInfo(item);
    setSelectedDefaultValue(item.defaultAccountNumber || "");
    setIsDefaultOpen(true);
  };

  const closeDefaultPanel = () => {
    if (isDefaultDirty) {
      const shouldClose = window.confirm("변경사항이 저장되지 않았습니다. 닫으시겠습니까?");
      if (!shouldClose) {
        return false;
      }
    }
    setIsDefaultOpen(false);
    setSelectedDefaultInfo(null);
    setSelectedDefaultValue("");
    return true;
  };

  const openRealNamePanel = (item: BankInfoRecord) => {
    if (isDetailOpen && !closeDetail()) {
      return;
    }
    if (isDefaultOpen && !closeDefaultPanel()) {
      return;
    }
    setSelectedRealNameInfo(item);
    setRealNameForm({
      realName: item.realName || "",
      residentNumber: item.residentNumber || "",
      phoneNumber: item.phoneNumber || "",
      idCardImageUrl: item.idCardImageUrl || "",
    });
    setIsRealNameOpen(true);
  };

  const closeRealNamePanel = () => {
    if (isRealNameDirty) {
      const shouldClose = window.confirm("변경사항이 저장되지 않았습니다. 닫으시겠습니까?");
      if (!shouldClose) {
        return false;
      }
    }
    setIsRealNameOpen(false);
    setSelectedRealNameInfo(null);
    setRealNameForm({ ...emptyRealNameForm });
    return true;
  };

  useEffect(() => {
    if (!isDetailOpen) {
      return;
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeDetail();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isDetailOpen, isMemoDirty, isAliasDirty]);

  useEffect(() => {
    if (!isDefaultOpen) {
      return;
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeDefaultPanel();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isDefaultOpen, isDefaultDirty]);

  useEffect(() => {
    if (!isRealNameOpen) {
      return;
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeRealNamePanel();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isRealNameOpen, isRealNameDirty]);

  const uploadIdCard = useCallback(
    async (file: File) => {
      if (!activeAccount || uploadingIdCard) {
        return;
      }
      if (file.size / 1024 / 1024 > 50) {
        setFeedback({
          tone: "error",
          message: "파일 크기가 너무 큽니다. (최대 50MB)",
        });
        return;
      }

      setUploadingIdCard(true);

      try {
        const contentType = file.type || "application/octet-stream";
        const signedBody = await createAdminSignedBody({
          account: activeAccount,
          route: BANK_INFO_ADMIN_UPLOAD_ROUTE,
          signingPrefix: BANK_INFO_ADMIN_SIGNING_PREFIX,
          requesterStorecode: "admin",
          requesterWalletAddress: activeAccount.address,
          actionFields: { contentType },
        });

        const response = await fetch("/api/bff/admin/bankinfo/upload", {
          method: "POST",
          headers: {
            "content-type": contentType,
            "x-admin-requester-storecode": String(signedBody.requesterStorecode || "admin"),
            "x-admin-requester-wallet-address": String(signedBody.requesterWalletAddress || ""),
            "x-admin-signature": String(signedBody.signature || ""),
            "x-admin-signed-at": String(signedBody.signedAt || ""),
            "x-admin-nonce": String(signedBody.nonce || ""),
          },
          body: file,
        });

        const uploadData = await response.json().catch(() => null);
        const uploadedUrl = normalizeString(uploadData?.url);
        if (!response.ok || !uploadedUrl) {
          throw new Error(normalizeString(uploadData?.error) || "신분증 사진 업로드에 실패했습니다.");
        }

        setRealNameForm((current) => ({
          ...current,
          idCardImageUrl: uploadedUrl,
        }));
        setFeedback({
          tone: "success",
          message: "신분증 사진을 업로드했습니다.",
        });
      } catch (error) {
        setFeedback({
          tone: "error",
          message: error instanceof Error ? error.message : "신분증 사진 업로드에 실패했습니다.",
        });
      } finally {
        setUploadingIdCard(false);
      }
    },
    [activeAccount, uploadingIdCard],
  );

  const handleSaveMemo = async () => {
    if (!selectedInfo || savingMemo) {
      return;
    }
    const id = getIdValue(selectedInfo);
    if (!id) {
      setFeedback({
        tone: "error",
        message: "유효하지 않은 항목입니다.",
      });
      return;
    }

    setSavingMemo(true);

    try {
      await runBankInfoAction({
        route: BANK_INFO_ROUTE_UPDATE,
        actionFields: {
          id,
          bankName: selectedInfo.bankName || "",
          realAccountNumber: selectedInfo.realAccountNumber || selectedInfo.accountNumber || "",
          accountHolder: selectedInfo.accountHolder || "",
          memo: detailMemo,
        },
        errorFallback: "메모 저장에 실패했습니다.",
      });

      setSelectedInfo((prev) =>
        prev
          ? {
              ...prev,
              memo: detailMemo,
              updatedAt: new Date().toISOString(),
            }
          : prev,
      );
      setFeedback({
        tone: "success",
        message: "메모를 저장했습니다.",
      });
      await fetchBankInfos();
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "메모 저장에 실패했습니다.",
      });
    } finally {
      setSavingMemo(false);
    }
  };

  const handleAddAlias = () => {
    const value = sanitizeDigits(String(aliasInput || "").trim());
    if (!value) {
      setFeedback({
        tone: "error",
        message: "추가할 별칭 계좌번호를 입력해주세요.",
      });
      return;
    }
    const normalized = normalizeAliasList([...detailAliases, value]);
    if (normalized.length === detailAliases.length) {
      setFeedback({
        tone: "error",
        message: "이미 등록된 별칭 계좌번호입니다.",
      });
      return;
    }
    setDetailAliases(normalized);
    setAliasInput("");
  };

  const handleRemoveAlias = (value: string) => {
    setDetailAliases((current) => current.filter((item) => item !== value));
  };

  const handleSaveAliases = async () => {
    if (!selectedInfo || savingAliases) {
      return;
    }
    const id = getIdValue(selectedInfo);
    if (!id) {
      setFeedback({
        tone: "error",
        message: "유효하지 않은 항목입니다.",
      });
      return;
    }

    setSavingAliases(true);

    try {
      await runBankInfoAction({
        route: BANK_INFO_ROUTE_UPDATE,
        actionFields: {
          id,
          bankName: selectedInfo.bankName || "",
          realAccountNumber: selectedInfo.realAccountNumber || selectedInfo.accountNumber || "",
          accountHolder: selectedInfo.accountHolder || "",
          aliasAccountNumber: detailAliases,
        },
        errorFallback: "별칭 계좌번호 저장에 실패했습니다.",
      });

      setSelectedInfo((prev) =>
        prev
          ? {
              ...prev,
              aliasAccountNumber: detailAliases,
              updatedAt: new Date().toISOString(),
            }
          : prev,
      );
      setFeedback({
        tone: "success",
        message: "별칭 계좌번호를 저장했습니다.",
      });
      await fetchBankInfos();
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "별칭 계좌번호 저장에 실패했습니다.",
      });
    } finally {
      setSavingAliases(false);
    }
  };

  const handleSaveDefaultAccount = async () => {
    if (!selectedDefaultInfo || savingDefault) {
      return;
    }
    const id = getIdValue(selectedDefaultInfo);
    if (!id) {
      setFeedback({
        tone: "error",
        message: "유효하지 않은 항목입니다.",
      });
      return;
    }
    if (!selectedDefaultValue) {
      setFeedback({
        tone: "error",
        message: "사용중인 계좌번호를 선택해주세요.",
      });
      return;
    }

    setSavingDefault(true);

    try {
      await runBankInfoAction({
        route: BANK_INFO_ROUTE_UPDATE,
        actionFields: {
          id,
          bankName: selectedDefaultInfo.bankName || "",
          realAccountNumber:
            selectedDefaultInfo.realAccountNumber || selectedDefaultInfo.accountNumber || "",
          accountHolder: selectedDefaultInfo.accountHolder || "",
          defaultAccountNumber: selectedDefaultValue,
        },
        errorFallback: "사용중인 계좌번호 저장에 실패했습니다.",
      });

      setSelectedDefaultInfo((prev) =>
        prev
          ? {
              ...prev,
              defaultAccountNumber: selectedDefaultValue,
              updatedAt: new Date().toISOString(),
            }
          : prev,
      );
      setFeedback({
        tone: "success",
        message: "사용중인 계좌번호를 저장했습니다.",
      });
      await fetchBankInfos();
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "사용중인 계좌번호 저장에 실패했습니다.",
      });
    } finally {
      setSavingDefault(false);
    }
  };

  const handleSaveRealName = async () => {
    if (!selectedRealNameInfo || savingRealName) {
      return;
    }
    const id = getIdValue(selectedRealNameInfo);
    if (!id) {
      setFeedback({
        tone: "error",
        message: "유효하지 않은 항목입니다.",
      });
      return;
    }

    setSavingRealName(true);

    try {
      await runBankInfoAction({
        route: BANK_INFO_ROUTE_UPDATE,
        actionFields: {
          id,
          bankName: selectedRealNameInfo.bankName || "",
          realAccountNumber:
            selectedRealNameInfo.realAccountNumber || selectedRealNameInfo.accountNumber || "",
          accountHolder: selectedRealNameInfo.accountHolder || "",
          realName: realNameForm.realName.trim(),
          residentNumber: realNameForm.residentNumber.trim(),
          phoneNumber: realNameForm.phoneNumber.trim(),
          idCardImageUrl: realNameForm.idCardImageUrl.trim(),
        },
        errorFallback: "실명 정보 저장에 실패했습니다.",
      });

      setSelectedRealNameInfo((prev) =>
        prev
          ? {
              ...prev,
              ...realNameForm,
              updatedAt: new Date().toISOString(),
            }
          : prev,
      );
      setFeedback({
        tone: "success",
        message: "실명 정보를 저장했습니다.",
      });
      await fetchBankInfos();
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "실명 정보 저장에 실패했습니다.",
      });
    } finally {
      setSavingRealName(false);
    }
  };

  const handleUpdate = async (id: string) => {
    if (saving) {
      return;
    }
    const payload = {
      bankName: editForm.bankName.trim(),
      realAccountNumber: editForm.realAccountNumber.trim(),
      accountHolder: editForm.accountHolder.trim(),
    };

    if (!payload.bankName || !payload.realAccountNumber || !payload.accountHolder) {
      setFeedback({
        tone: "error",
        message: "은행명, 실계좌번호, 예금주를 모두 입력해주세요.",
      });
      return;
    }

    setSaving(true);

    try {
      await runBankInfoAction({
        route: BANK_INFO_ROUTE_UPDATE,
        actionFields: {
          id,
          ...payload,
        },
        errorFallback: "은행 정보 수정에 실패했습니다.",
      });

      setFeedback({
        tone: "success",
        message: "은행 정보를 수정했습니다.",
      });
      setEditingId(null);
      setEditForm({ ...emptyForm });
      await fetchBankInfos();
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "은행 정보 수정에 실패했습니다.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!id || deletingId) {
      return;
    }
    if (!window.confirm("정말로 삭제하시겠습니까?")) {
      return;
    }

    setDeletingId(id);

    try {
      await runBankInfoAction({
        route: BANK_INFO_ROUTE_DELETE,
        actionFields: { id },
        errorFallback: "은행 정보 삭제에 실패했습니다.",
      });

      setFeedback({
        tone: "success",
        message: "은행 정보를 삭제했습니다.",
      });
      await fetchBankInfos();
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "은행 정보 삭제에 실패했습니다.",
      });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <main className="console-shell px-4 py-6 lg:px-6 xl:px-8">
      <div className="mx-auto max-w-[1640px] space-y-6">
        {feedback ? <FeedbackBanner feedback={feedback} /> : null}

        <section className="console-hero overflow-hidden rounded-[34px] px-6 py-6 text-white shadow-[0_42px_110px_-68px_rgba(15,23,42,0.85)] sm:px-8">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_420px]">
            <div className="space-y-5">
              <div>
                <div className="console-mono inline-flex rounded-full border border-amber-300/20 bg-amber-400/10 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-amber-100">
                  Bank info admin
                </div>
                <h1 className="console-display text-4xl font-semibold tracking-[-0.06em] text-white">
                  은행 계좌 관리
                </h1>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <MetricCard
                  label="Accounts"
                  value={`${totalCount.toLocaleString("ko-KR")}건`}
                  hint="현재 검색 조건으로 조회된 은행 계좌 수"
                />
                <MetricCard
                  label="KYC Verified"
                  value={`${verifiedCount.toLocaleString("ko-KR")}건`}
                  hint="실명정보와 신분증 사진까지 등록된 계좌"
                />
                <MetricCard
                  label="Aliases"
                  value={`${aliasCount.toLocaleString("ko-KR")}개`}
                  hint="별칭 계좌번호 총합"
                />
              </div>
            </div>

            <AdminWalletCard
              address={address}
              disconnectedMessage="지갑을 연결하면 은행 계좌 조회와 수정이 열립니다."
              accessLabel="Admin bank info"
            />
          </div>
        </section>

        <ClientSettingsSubnav
          lang={lang}
          active="bankinfo"
        />

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-6">
            <section className="console-panel rounded-[30px] p-6">
              <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <div className="console-mono text-[11px] uppercase tracking-[0.16em] text-slate-500">
                    Search
                  </div>
                  <h2 className="console-display mt-2 text-[1.8rem] font-semibold tracking-[-0.05em] text-slate-950">
                    계좌 검색
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    은행명, 실계좌번호, 별칭, 예금주 기준으로 빠르게 검색합니다.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void fetchBankInfos(searchKeyword)}
                    disabled={!activeAccount || fetching}
                    className={`rounded-full px-5 py-2.5 text-sm font-semibold transition ${
                      !activeAccount || fetching
                        ? "cursor-not-allowed bg-slate-100 text-slate-400"
                        : "bg-slate-950 text-white hover:bg-slate-800"
                    }`}
                  >
                    {fetching ? "조회 중..." : "검색"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchKeyword("");
                      void fetchBankInfos("");
                    }}
                    disabled={!activeAccount || fetching}
                    className="rounded-full border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    초기화
                  </button>
                </div>
              </div>

              <div className="mt-6">
                <input
                  value={searchKeyword}
                  onChange={(event) => setSearchKeyword(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      void fetchBankInfos(searchKeyword);
                    }
                  }}
                  disabled={!activeAccount}
                  placeholder="은행명 / 실계좌번호 / 별칭 / 예금주"
                  className={fieldClassName}
                />
              </div>
            </section>

            <section className="console-panel rounded-[30px] p-6">
              <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <div className="console-mono text-[11px] uppercase tracking-[0.16em] text-slate-500">
                    Create
                  </div>
                  <h2 className="console-display mt-2 text-[1.8rem] font-semibold tracking-[-0.05em] text-slate-950">
                    신규 계좌 등록
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    실계좌번호, 은행명, 예금주를 등록하면 기본 관리 대상에 추가됩니다.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={!activeAccount || saving}
                  className={`rounded-full px-5 py-2.5 text-sm font-semibold transition ${
                    !activeAccount || saving
                      ? "cursor-not-allowed bg-slate-100 text-slate-400"
                      : "bg-amber-500 text-slate-950 hover:bg-amber-400"
                  }`}
                >
                  {saving ? "등록 중..." : "계좌 등록"}
                </button>
              </div>

              <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(180px,0.7fr)_minmax(260px,1fr)_minmax(180px,0.7fr)]">
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-slate-700">은행명</span>
                  <select
                    value={form.bankName}
                    onChange={(event) => setForm((current) => ({ ...current, bankName: event.target.value }))}
                    disabled={!activeAccount}
                    className={fieldClassName}
                  >
                    <option value="">은행 선택</option>
                    {bankNameOptions.map((bankName) => (
                      <option key={bankName} value={bankName}>
                        {bankName}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-slate-700">실계좌번호</span>
                  <input
                    value={form.realAccountNumber}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        realAccountNumber: sanitizeDigits(event.target.value),
                      }))
                    }
                    disabled={!activeAccount}
                    placeholder="예: 9003226783592"
                    className={`${fieldClassName} border-amber-200 bg-amber-50 font-semibold tracking-[0.08em] text-amber-950`}
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-slate-700">예금주</span>
                  <input
                    value={form.accountHolder}
                    onChange={(event) => setForm((current) => ({ ...current, accountHolder: event.target.value }))}
                    disabled={!activeAccount}
                    placeholder="예: 홍길동"
                    className={fieldClassName}
                  />
                </label>
              </div>
            </section>

            <section className="console-panel rounded-[30px] p-0 overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
                <div>
                  <div className="console-mono text-[11px] uppercase tracking-[0.16em] text-slate-500">
                    Ledger
                  </div>
                  <h2 className="console-display mt-2 text-[1.8rem] font-semibold tracking-[-0.05em] text-slate-950">
                    은행 계좌 목록
                  </h2>
                </div>
                <div className="text-sm text-slate-500">
                  검색결과 <span className="font-semibold text-slate-950">{totalCount.toLocaleString("ko-KR")}건</span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-[1240px] w-full table-fixed border-collapse">
                  <thead className="bg-slate-50 text-slate-600 text-xs font-semibold uppercase tracking-[0.14em]">
                    <tr>
                      <th className="px-4 py-4 text-left w-14">No</th>
                      <th className="px-4 py-4 text-right w-24">잔고</th>
                      <th className="px-4 py-4 text-left w-40">실계좌번호</th>
                      <th className="px-4 py-4 text-left w-28">은행명</th>
                      <th className="px-4 py-4 text-left w-28">예금주</th>
                      <th className="px-4 py-4 text-left w-36">실명정보</th>
                      <th className="px-4 py-4 text-left w-40">사용중인 계좌번호</th>
                      <th className="px-4 py-4 text-left w-36">별칭</th>
                      <th className="px-4 py-4 text-left w-40">생성/수정일</th>
                      <th className="px-4 py-4 text-center w-32">관리</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm">
                    {bankInfos.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="px-4 py-10 text-center text-slate-500">
                          {activeAccount ? "등록된 은행 정보가 없습니다." : "관리자 지갑 연결 후 은행 계좌를 조회할 수 있습니다."}
                        </td>
                      </tr>
                    ) : null}

                    {bankInfos.map((info, index) => {
                      const id = getIdValue(info);
                      const isEditing = editingId === id;
                      const kycReady =
                        Boolean(info.realName)
                        && Boolean(info.residentNumber)
                        && Boolean(info.phoneNumber)
                        && Boolean(info.idCardImageUrl);

                      return (
                        <tr
                          key={id || `${index}`}
                          className="group border-b border-slate-100 align-top hover:bg-slate-50/80"
                        >
                          <td className="px-4 py-4 text-slate-400">{index + 1}</td>
                          <td className="px-4 py-4 text-right font-medium text-slate-700">
                            {info.balance != null ? Number(info.balance).toLocaleString("ko-KR") : "-"}
                          </td>
                          <td className="px-4 py-4">
                            {isEditing ? (
                              <input
                                value={editForm.realAccountNumber}
                                onChange={(event) =>
                                  setEditForm((current) => ({
                                    ...current,
                                    realAccountNumber: sanitizeDigits(event.target.value),
                                  }))
                                }
                                className={`${fieldClassName} h-10 border-amber-200 bg-amber-50 font-semibold tracking-[0.08em] text-amber-950`}
                              />
                            ) : (
                              <button
                                type="button"
                                onClick={() => openDetail(info)}
                                className="text-left font-semibold text-amber-700 hover:underline underline-offset-4"
                              >
                                {info.realAccountNumber || info.accountNumber || "-"}
                              </button>
                            )}
                          </td>
                          <td className="px-4 py-4">
                            {isEditing ? (
                              <select
                                value={editForm.bankName}
                                onChange={(event) =>
                                  setEditForm((current) => ({
                                    ...current,
                                    bankName: event.target.value,
                                  }))
                                }
                                className={`${fieldClassName} h-10`}
                              >
                                <option value="">은행 선택</option>
                                {!bankNameOptions.includes(editForm.bankName) && editForm.bankName ? (
                                  <option value={editForm.bankName}>{editForm.bankName}</option>
                                ) : null}
                                {bankNameOptions.map((bankName) => (
                                  <option key={bankName} value={bankName}>
                                    {bankName}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="font-medium text-slate-900">{info.bankName || "-"}</span>
                            )}
                          </td>
                          <td className="px-4 py-4">
                            {isEditing ? (
                              <input
                                value={editForm.accountHolder}
                                onChange={(event) =>
                                  setEditForm((current) => ({
                                    ...current,
                                    accountHolder: event.target.value,
                                  }))
                                }
                                className={`${fieldClassName} h-10`}
                              />
                            ) : (
                              <span className="text-slate-700">{info.accountHolder || "-"}</span>
                            )}
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex flex-col items-start gap-2">
                              <span
                                className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                                  kycReady
                                    ? "bg-emerald-100 text-emerald-700"
                                    : "bg-slate-100 text-slate-500"
                                }`}
                              >
                                {kycReady ? "verified" : "미등록"}
                              </span>
                              <button
                                type="button"
                                onClick={() => openRealNamePanel(info)}
                                className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 transition hover:bg-amber-100"
                              >
                                KYC 정보
                              </button>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <button
                              type="button"
                              onClick={() => openDefaultPanel(info)}
                              className="text-left text-slate-900 hover:underline underline-offset-4"
                            >
                              {info.defaultAccountNumber || <span className="text-xs text-slate-400">설정</span>}
                            </button>
                          </td>
                          <td className="px-4 py-4">
                            {Array.isArray(info.aliasAccountNumber) && info.aliasAccountNumber.length > 0 ? (
                              <div className="flex flex-wrap gap-1.5">
                                {info.aliasAccountNumber.slice(0, 3).map((alias) => (
                                  <span
                                    key={alias}
                                    className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600"
                                  >
                                    {alias}
                                  </span>
                                ))}
                                {info.aliasAccountNumber.length > 3 ? (
                                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-500">
                                    +{info.aliasAccountNumber.length - 3}
                                  </span>
                                ) : null}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-4 text-xs text-slate-500">
                            <div>생성 {formatDateTime(info.createdAt)}</div>
                            <div className="mt-1">수정 {formatDateTime(info.updatedAt)}</div>
                          </td>
                          <td className="px-4 py-4 text-center">
                            {isEditing ? (
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => void handleUpdate(id)}
                                  disabled={saving}
                                  className="rounded-full bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
                                >
                                  저장
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelEdit}
                                  disabled={saving}
                                  className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                                >
                                  취소
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => startEdit(info)}
                                  className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                                >
                                  수정
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleDelete(id)}
                                  disabled={deletingId === id}
                                  className="rounded-full border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
                                >
                                  삭제
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <section className="space-y-6">
            <div className="console-panel rounded-[30px] p-6">
              <div className="console-mono text-[11px] uppercase tracking-[0.16em] text-slate-500">
                Policy
              </div>
              <h2 className="console-display mt-2 text-[1.8rem] font-semibold tracking-[-0.05em] text-slate-950">
                운영 메모
              </h2>
              <div className="mt-3 space-y-3 text-sm leading-6 text-slate-500">
                <p>실계좌번호와 기본 사용 계좌번호, 별칭, KYC 정보를 같은 페이지에서 관리합니다.</p>
                <p>메모와 별칭은 실거래 계좌 흐름 점검, 예외 케이스 분류, 운영 이력 기록에 사용합니다.</p>
                <p>모든 변경은 관리자 지갑 서명이 필요하며 본서버 admin bankinfo API를 그대로 사용합니다.</p>
              </div>
            </div>
          </section>
        </section>
      </div>

      <div className={`fixed inset-0 z-50 ${isDetailOpen ? "" : "pointer-events-none"}`}>
        <div
          className={`absolute inset-0 bg-slate-950/20 transition-opacity duration-200 ${isDetailOpen ? "opacity-100" : "opacity-0"}`}
          onClick={closeDetail}
        />
        <aside
          className={`absolute right-0 top-0 h-full w-full max-w-[440px] border-l border-slate-200 bg-white shadow-[0_24px_72px_rgba(15,23,42,0.16)] transition-transform duration-200 ${isDetailOpen ? "translate-x-0" : "translate-x-full"}`}
        >
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Memo & alias</div>
                <div className="mt-1 text-lg font-semibold text-slate-950">
                  {selectedInfo?.realAccountNumber || selectedInfo?.accountNumber || "-"}
                </div>
              </div>
              <button
                type="button"
                onClick={closeDetail}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
              >
                ×
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
              <div className="space-y-2">
                <div className="text-sm font-semibold text-slate-900">운영 메모</div>
                <textarea
                  value={detailMemo}
                  onChange={(event) => setDetailMemo(event.target.value)}
                  rows={7}
                  className={textAreaClassName}
                  placeholder="운영 메모를 입력하세요."
                />
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>{detailMemo.length.toLocaleString("ko-KR")}자</span>
                  <button
                    type="button"
                    onClick={() => void handleSaveMemo()}
                    disabled={savingMemo}
                    className="rounded-full bg-slate-950 px-3 py-1.5 font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
                  >
                    {savingMemo ? "저장 중..." : "메모 저장"}
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="text-sm font-semibold text-slate-900">별칭 계좌번호</div>
                <div className="flex gap-2">
                  <input
                    value={aliasInput}
                    onChange={(event) => setAliasInput(sanitizeDigits(event.target.value))}
                    className={fieldClassName}
                    placeholder="추가할 별칭 계좌번호"
                  />
                  <button
                    type="button"
                    onClick={handleAddAlias}
                    className="rounded-full border border-slate-200 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    추가
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {detailAliases.length === 0 ? (
                    <span className="text-sm text-slate-400">등록된 별칭이 없습니다.</span>
                  ) : (
                    detailAliases.map((alias) => (
                      <span
                        key={alias}
                        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-700"
                      >
                        {alias}
                        <button
                          type="button"
                          onClick={() => handleRemoveAlias(alias)}
                          className="text-slate-400 transition hover:text-rose-500"
                        >
                          ×
                        </button>
                      </span>
                    ))
                  )}
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => void handleSaveAliases()}
                    disabled={savingAliases}
                    className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
                  >
                    {savingAliases ? "저장 중..." : "별칭 저장"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <div className={`fixed inset-0 z-50 ${isDefaultOpen ? "" : "pointer-events-none"}`}>
        <div
          className={`absolute inset-0 bg-slate-950/20 transition-opacity duration-200 ${isDefaultOpen ? "opacity-100" : "opacity-0"}`}
          onClick={closeDefaultPanel}
        />
        <aside
          className={`absolute right-0 top-0 h-full w-full max-w-[420px] border-l border-amber-200 bg-amber-50 shadow-[0_24px_72px_rgba(15,23,42,0.16)] transition-transform duration-200 ${isDefaultOpen ? "translate-x-0" : "translate-x-full"}`}
        >
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-amber-200 px-5 py-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">Default account</div>
                <div className="mt-1 text-lg font-semibold text-amber-950">사용중인 계좌번호</div>
              </div>
              <button
                type="button"
                onClick={closeDefaultPanel}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-amber-200 bg-white text-amber-700 transition hover:bg-amber-100"
              >
                ×
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5">
              <div className="space-y-4 rounded-[24px] border border-amber-200 bg-white p-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">실계좌번호</div>
                  {defaultRealValue ? (
                    <label className="mt-3 flex items-center gap-3 text-sm font-semibold text-amber-950">
                      <input
                        type="radio"
                        name="defaultAccountNumber"
                        checked={selectedDefaultValue === defaultRealValue}
                        onChange={() => setSelectedDefaultValue(defaultRealValue)}
                      />
                      <span>{defaultRealValue}</span>
                    </label>
                  ) : (
                    <div className="mt-3 text-sm text-amber-600">실계좌번호가 없습니다.</div>
                  )}
                </div>

                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">별칭 계좌번호</div>
                  {defaultAliasValues.length === 0 ? (
                    <div className="mt-3 text-sm text-amber-600">등록된 별칭이 없습니다.</div>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {defaultAliasValues.map((alias) => (
                        <label key={alias} className="flex items-center gap-3 text-sm font-semibold text-amber-950">
                          <input
                            type="radio"
                            name="defaultAccountNumber"
                            checked={selectedDefaultValue === alias}
                            onChange={() => setSelectedDefaultValue(alias)}
                          />
                          <span>{alias}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => void handleSaveDefaultAccount()}
                  disabled={savingDefault}
                  className="rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-400 disabled:opacity-50"
                >
                  {savingDefault ? "저장 중..." : "기본 계좌 저장"}
                </button>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <div className={`fixed inset-0 z-50 ${isRealNameOpen ? "" : "pointer-events-none"}`}>
        <div
          className={`absolute inset-0 bg-slate-950/20 transition-opacity duration-200 ${isRealNameOpen ? "opacity-100" : "opacity-0"}`}
          onClick={closeRealNamePanel}
        />
        <aside
          className={`absolute right-0 top-0 h-full w-full max-w-[460px] border-l border-sky-200 bg-sky-50 shadow-[0_24px_72px_rgba(15,23,42,0.16)] transition-transform duration-200 ${isRealNameOpen ? "translate-x-0" : "translate-x-full"}`}
        >
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-sky-200 px-5 py-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">KYC</div>
                <div className="mt-1 text-lg font-semibold text-sky-950">실명 정보</div>
              </div>
              <button
                type="button"
                onClick={closeRealNamePanel}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-sky-200 bg-white text-sky-700 transition hover:bg-sky-100"
              >
                ×
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5">
              <div className="space-y-4">
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-slate-700">실명</span>
                  <input
                    value={realNameForm.realName}
                    onChange={(event) =>
                      setRealNameForm((current) => ({
                        ...current,
                        realName: event.target.value,
                      }))
                    }
                    className={fieldClassName}
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-slate-700">주민등록번호</span>
                  <input
                    value={realNameForm.residentNumber}
                    onChange={(event) =>
                      setRealNameForm((current) => ({
                        ...current,
                        residentNumber: event.target.value,
                      }))
                    }
                    className={fieldClassName}
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-slate-700">휴대폰번호</span>
                  <input
                    value={realNameForm.phoneNumber}
                    onChange={(event) =>
                      setRealNameForm((current) => ({
                        ...current,
                        phoneNumber: sanitizeDigits(event.target.value),
                      }))
                    }
                    className={fieldClassName}
                  />
                </label>

                <div className="space-y-3 rounded-[24px] border border-sky-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">신분증 사진</div>
                      <div className="mt-1 text-xs text-slate-500">
                        업로드 후 공개 URL이 자동으로 입력됩니다.
                      </div>
                    </div>
                    <label className="inline-flex cursor-pointer items-center rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-100">
                      파일 선택
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(event: ChangeEvent<HTMLInputElement>) => {
                          const file = event.target.files?.[0];
                          if (file) {
                            void uploadIdCard(file);
                          }
                          event.target.value = "";
                        }}
                      />
                    </label>
                  </div>

                  <input
                    value={realNameForm.idCardImageUrl}
                    onChange={(event) =>
                      setRealNameForm((current) => ({
                        ...current,
                        idCardImageUrl: event.target.value,
                      }))
                    }
                    className={fieldClassName}
                    placeholder="신분증 이미지 URL"
                  />

                  {realNameForm.idCardImageUrl ? (
                    <a
                      href={realNameForm.idCardImageUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex text-sm font-semibold text-sky-700 underline underline-offset-4"
                    >
                      현재 업로드 보기
                    </a>
                  ) : null}

                  {uploadingIdCard ? (
                    <div className="text-xs text-sky-700">업로드 중...</div>
                  ) : null}
                </div>
              </div>

              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => void handleSaveRealName()}
                  disabled={savingRealName}
                  className="rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:opacity-50"
                >
                  {savingRealName ? "저장 중..." : "KYC 저장"}
                </button>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
