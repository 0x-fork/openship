export function BillingContent({
  children,
  sidebar,
}: {
  children: React.ReactNode;
  sidebar: React.ReactNode | null;
}) {
  if (!sidebar) {
    return <div className="min-w-0">{children}</div>;
  }

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0">{children}</div>
      <aside className="min-w-0 lg:sticky lg:top-6">{sidebar}</aside>
    </div>
  );
}
