import ClientSettingsConsoleClient from "./client-settings-console-client";

export default function AdminClientSettingsPage({
  params,
}: {
  params: {
    lang: string;
  };
}) {
  return <ClientSettingsConsoleClient lang={params.lang} />;
}
