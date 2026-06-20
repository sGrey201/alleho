type ChatBackUnreadBadgeProps = {
  count: number;
};

export function ChatBackUnreadBadge({ count }: ChatBackUnreadBadgeProps) {
  if (count <= 0) return null;
  const label = count > 99 ? "99+" : String(count);
  return (
    <span
      className="pointer-events-none absolute -right-0.5 -top-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-500 px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-card"
      aria-label={`Непрочитанных сообщений: ${count}`}
    >
      {label}
    </span>
  );
}
