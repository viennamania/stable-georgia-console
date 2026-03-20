import ClearanceManagementConsoleClient from "./clearance-management-console-client";

export default function AdminClearanceManagementPage({
  params,
}: {
  params: {
    lang: string;
  };
}) {
  return <ClearanceManagementConsoleClient lang={params.lang} />;
}
