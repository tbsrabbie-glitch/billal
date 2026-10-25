import type { ReactNode } from "react";

export function ErrorBanner({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100">
      <p className="font-medium">{title}</p>
      {children && <div className="mt-1 text-sm opacity-90">{children}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
