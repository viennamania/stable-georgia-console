import StoreSettingsConsoleClient from "./store-settings-console-client";

export default function AdminStoreManagementDetailPage({
  params,
}: {
  params: {
    lang: string;
    storecode: string;
  };
}) {
  return (
    <StoreSettingsConsoleClient
      lang={params.lang}
      storecode={params.storecode}
    />
  );
}
