import ClearanceManagementConsoleClient from "@/app/[lang]/admin/clearance-management/clearance-management-console-client";

export default function StoreClearanceManagementPage({
  params,
}: {
  params: {
    lang: string;
    storecode: string;
  };
}) {
  return (
    <ClearanceManagementConsoleClient
      lang={params.lang}
      forcedStorecode={params.storecode}
      hideStoreFilter
      hideWithdrawalLiveSection
      ordersQueryMode="collectOrdersForSeller"
      allowOrderActions={false}
    />
  );
}
