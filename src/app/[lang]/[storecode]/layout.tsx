import StoreShell from "./store-shell";

export default function StoreScopedLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { lang: string; storecode: string };
}) {
  return (
    <StoreShell lang={params.lang} storecode={params.storecode}>
      {children}
    </StoreShell>
  );
}
