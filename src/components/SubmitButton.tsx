"use client";

import { useFormStatus } from "react-dom";

export default function SubmitButton({ children, className = "btn-primary", pendingLabel = "Saving…", disabled = false }: { children: React.ReactNode; className?: string; pendingLabel?: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return <button type="submit" className={className} disabled={pending || disabled} aria-disabled={pending || disabled}>{pending ? pendingLabel : children}</button>;
}
