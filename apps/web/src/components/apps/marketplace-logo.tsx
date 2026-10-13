"use client";

import { AppLogo } from "@repo/ui/app-logo";

export function MarketplaceLogo({
  id,
  logo,
  name,
  large = false,
}: {
  id: string;
  logo: string;
  name: string;
  large?: boolean;
}) {
  return (
    <span
      className={`marketplace-logo ${large ? "marketplace-logo-large" : ""}`}
      aria-hidden="true"
    >
      <AppLogo
        invertOnDark={false}
        appId={id}
        slug={logo}
        className={large ? "size-11" : "size-7"}
        fallback={<span className="th-text-heading text-lg font-medium">{name.slice(0, 1)}</span>}
      />
    </span>
  );
}
