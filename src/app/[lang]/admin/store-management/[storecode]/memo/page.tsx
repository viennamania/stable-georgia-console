import StoreMemoConsoleClient from "./store-memo-console-client";

export default function AdminStoreMemoPage({
  params,
}: {
  params: {
    lang: string;
    storecode: string;
  };
}) {
  return (
    <StoreMemoConsoleClient
      lang={params.lang}
      storecode={params.storecode}
    />
  );
}
