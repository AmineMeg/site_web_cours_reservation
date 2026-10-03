"use client";

import { useFormStatus } from "react-dom";
import { buttonClass, type ButtonSize, type ButtonVariant } from "./button";

export function SubmitButton({
  children,
  pendingText,
  variant = "primary",
  size = "lg",
  className = "",
}: {
  children: React.ReactNode;
  pendingText: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClass(variant, size, className)}>
      {pending ? pendingText : children}
    </button>
  );
}
