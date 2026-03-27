interface StatusBadgeProps {
  status: string;
}

const statusClassMap: Record<string, string> = {
  completed: "badge badge-success",
  success: "badge badge-success",
  running: "badge badge-warning",
  failed: "badge badge-error",
  error: "badge badge-error",
  pending: "badge badge-neutral",
  queued: "badge badge-neutral",
  partial: "badge badge-info",
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  const className = statusClassMap[status] ?? "badge badge-neutral";
  return <span className={className}>{status}</span>;
}
