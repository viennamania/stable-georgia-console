"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  {
    href: "/admin/buyorder",
    label: "구매주문",
    eyebrow: "Buyorder",
    marker: "01",
  },
  {
    href: "/admin/clearance-management",
    label: "청산주문",
    eyebrow: "Clearance",
    marker: "02",
  },
  {
    href: "/admin/clearance-order",
    label: "청산주문 생성",
    eyebrow: "Order Builder",
    marker: "03",
  },
  {
    href: "/admin/client-settings",
    label: "센터설정",
    eyebrow: "Client Settings",
    marker: "04",
  },
  {
    href: "/admin/store-management",
    label: "가맹점관리",
    eyebrow: "Store Management",
    marker: "05",
  },
  {
    href: "/admin/member-management",
    label: "회원관리",
    eyebrow: "Members",
    marker: "06",
  },
  {
    href: "/admin/withdraw-usdt",
    label: "USDT 출금",
    eyebrow: "Withdraw",
    marker: "07",
  },
];

export default function AdminShell({
  lang,
  children,
}: {
  lang: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[#edf3f8] text-slate-950">
      <div className="mx-auto flex min-h-screen w-full max-w-[1880px] gap-0">
        <aside className="hidden w-[272px] shrink-0 border-r border-slate-200 bg-slate-950 text-white lg:block">
          <div className="sticky top-1/2 flex max-h-[calc(100vh-2.5rem)] -translate-y-1/2 flex-col gap-6 overflow-y-auto px-5 py-6">
            <div className="rounded-[28px] border border-white/10 bg-white/5 px-4 py-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                Stable Georgia
              </div>
              <div className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-white">
                Console
              </div>
            </div>

            <nav className="space-y-2">
              {NAV_ITEMS.map((item) => {
                const href = `/${lang}${item.href}`;
                const active = pathname === href || pathname.startsWith(`${href}/`);

                return (
                  <Link
                    key={item.href}
                    href={href}
                    className={`group relative block overflow-hidden rounded-[26px] border px-4 py-4 transition-all ${
                      active
                        ? "border-sky-300/55 bg-[linear-gradient(135deg,rgba(56,189,248,0.24),rgba(14,165,233,0.14),rgba(15,23,42,0.2))] text-white shadow-[0_18px_38px_-20px_rgba(56,189,248,0.95)] ring-1 ring-inset ring-sky-200/20"
                        : "border-white/8 bg-white/5 text-slate-200 hover:border-white/16 hover:bg-white/8 hover:shadow-[0_12px_30px_-24px_rgba(148,163,184,0.65)]"
                    }`}
                  >
                    <div
                      className={`absolute inset-y-4 left-0 w-1 rounded-r-full transition ${
                        active ? "bg-sky-300 shadow-[0_0_18px_rgba(125,211,252,0.7)]" : "bg-transparent"
                      }`}
                      aria-hidden="true"
                    />
                    <div className="flex items-start gap-3">
                      <div
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border text-sm font-semibold tracking-[0.2em] transition ${
                          active
                            ? "border-sky-200/35 bg-white/12 text-sky-50"
                            : "border-white/10 bg-white/5 text-slate-300 group-hover:border-white/16 group-hover:bg-white/10"
                        }`}
                      >
                        {item.marker}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <div className={`text-[10px] uppercase tracking-[0.18em] ${active ? "text-sky-100/75" : "text-slate-500"}`}>
                            {item.eyebrow}
                          </div>
                          {active ? (
                            <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-sky-200/30 bg-white/12 px-2.5 py-1 text-[10px] font-semibold tracking-[0.08em] text-sky-50">
                              <span className="h-1.5 w-1.5 rounded-full bg-sky-200" aria-hidden="true" />
                              선택됨
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-2 text-[15px] font-semibold tracking-[-0.03em]">{item.label}</div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </nav>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <div
            data-admin-mobile-header="true"
            className="sticky top-0 z-30 border-b border-slate-200 bg-[#edf3f8]/95 backdrop-blur lg:hidden"
          >
            <div className="px-4 py-4">
              <div className="rounded-[28px] bg-slate-950 px-4 py-4 text-white shadow-[0_20px_45px_-28px_rgba(15,23,42,0.8)]">
                <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">
                  Stable Georgia
                </div>
                <div className="mt-2 text-xl font-semibold tracking-[-0.04em] text-white">
                  Console
                </div>
                <div className="mt-3 text-xs leading-5 text-slate-300">
                  구매주문, 청산주문, 설정과 운영 화면으로 모바일에서도 바로 이동할 수 있습니다.
                </div>

                <nav className="-mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-1">
                  {NAV_ITEMS.map((item) => {
                    const href = `/${lang}${item.href}`;
                    const active = pathname === href || pathname.startsWith(`${href}/`);

                    return (
                      <Link
                        key={item.href}
                        href={href}
                        className={`shrink-0 rounded-[20px] border px-3 py-3 transition ${
                          active
                            ? "border-sky-300/55 bg-[linear-gradient(135deg,rgba(56,189,248,0.24),rgba(14,165,233,0.14),rgba(15,23,42,0.2))] text-white shadow-[0_16px_34px_-24px_rgba(56,189,248,0.95)] ring-1 ring-inset ring-sky-200/20"
                            : "border-white/10 bg-white/6 text-slate-200"
                        }`}
                      >
                        <div className="flex min-w-[148px] items-start gap-3">
                          <div
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border text-xs font-semibold tracking-[0.18em] ${
                              active
                                ? "border-sky-200/35 bg-white/12 text-sky-50"
                                : "border-white/10 bg-white/5 text-slate-300"
                            }`}
                          >
                            {item.marker}
                          </div>
                          <div className="min-w-0">
                            <div className={`text-[9px] uppercase tracking-[0.16em] ${active ? "text-sky-100/75" : "text-slate-500"}`}>
                              {item.eyebrow}
                            </div>
                            <div className="mt-1 text-sm font-semibold tracking-[-0.03em]">{item.label}</div>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </nav>
              </div>
            </div>
          </div>

          {children}
        </div>
      </div>
    </div>
  );
}
