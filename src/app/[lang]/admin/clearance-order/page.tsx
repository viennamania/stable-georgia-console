import ClearanceOrderConsoleClient from "./clearance-order-console-client";

export default function AdminClearanceOrderPage({
  params,
}: {
  params: {
    lang: string;
  };
}) {
  return <ClearanceOrderConsoleClient lang={params.lang} />;
}
