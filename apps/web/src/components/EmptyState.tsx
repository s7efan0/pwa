import type { ReactNode } from "react";

/**
 * One place for "nothing here" / "couldn't load". Pages previously either
 * rendered nothing or printed a raw Error to the user.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  tone = "default",
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  tone?: "default" | "error";
}) {
  return (
    <div
      className="flex flex-col items-center gap-2 px-4 py-12 text-center"
      role={tone === "error" ? "alert" : undefined}
    >
      {icon && (
        <div
          className={
            tone === "error" ? "text-destructive" : "text-muted-foreground"
          }
          aria-hidden="true"
        >
          {icon}
        </div>
      )}
      <p className="text-sm font-medium">{title}</p>
      {description && (
        <p className="text-muted-foreground max-w-xs text-sm text-pretty">
          {description}
        </p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
