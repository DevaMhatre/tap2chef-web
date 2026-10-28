import type { ComponentProps } from "react";

type Variant = "primary" | "secondary" | "plain" | "destructive";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-primary px-5 text-white",
  secondary: "bg-surface-2 px-5 text-ink",
  plain: "px-3 text-primary",
  destructive: "bg-surface-2 px-5 text-primary",
};

// 44px minimum height: a thumb in a busy kitchen, not a mouse pointer.
export function Button({ variant = "primary", className = "", type = "button", ...props }: ComponentProps<"button"> & { variant?: Variant }) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl text-[17px] font-semibold transition-[transform,opacity] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}
