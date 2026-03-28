import StoreManagementConsoleClient from "./store-management-console-client";

export default function AdminStoreManagementPage({
  params,
}: {
  params: {
    lang: string;
  };
}) {
  return <StoreManagementConsoleClient lang={params.lang} />;
}
