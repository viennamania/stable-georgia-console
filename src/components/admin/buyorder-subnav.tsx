"use client";

import Link from "next/link";

const normalizeString = (value: unknown) => {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
};

export default function BuyorderSubnav({
  lang,
  selectedStorecode = "",
  active,
}: {
  lang: string;
  selectedStorecode?: string;
  active: "buyorder" | "trade-history" | "trade-history-daily";
}) {
  const storecode = normalizeString(selectedStorecode);
  const query = storecode ? `?storecode=${encodeURIComponent(storecode)}` : "";

  const items = [
    {
      key: "buyorder" as const,
      href: `/${lang}/admin/buyorder${query}`,
      label: "구매주문",
    },
    {
      key: "trade-history" as const,
      href: `/${lang}/admin/buyorder/trade-history${query}`,
      label: "P2P 거래내역",
    },
    {
      key: "trade-history-daily" as const,
      href: `/${lang}/admin/buyorder/trade-history-daily${query}`,
      label: "일별통계",
    },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {items.map((item) => {
        const isActive = item.key === active;
        return (
          <Link
            key={item.key}
            href={item.href}
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${
              isActive
                ? "border-slate-950 bg-slate-950 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
