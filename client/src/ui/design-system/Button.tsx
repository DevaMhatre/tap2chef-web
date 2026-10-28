import type { ComponentProps } from "react";

type Variant = "primary" | "tinted" | "secondary" | "plain" | "destructive";
type Size = "regular" | "compact";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-primary text-white",
  // A button that is clearly a button but never competes with the primary.
  tinted: "bg-primary/12 text-primary",
  secondary: "bg-surface-2 text-ink",
  plain: "text-primary",
  destructive: "bg-surface-2 text-primary",
};

// 44px minimum height: a thumb in a busy kitchen, not a mouse pointer.
// `compact` is a sheet's top-right action, a pill drawn inside the same 44px
// hit area: filled (primary) when it commits something — Save, Add — and
// tinted when it only closes — Done — so a screen never has two filled
// buttons competing to be the one obvious action.
export function Button({
  variant = "primary",
  size = "regular",
  className = "",
  type = "button",
  children,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  const look = VARIANTS[variant];
  const padding = variant === "plain" ? "px-3" : size === "compact" ? "px-4" : "px-5";

  if (size === "compact") {
    return (
      <button
        type={type}
        className={`group inline-flex min-h-11 min-w-11 items-center justify-center disabled:pointer-events-none disabled:opacity-40 ${className}`}
        {...props}
      >
        <span
          className={`inline-flex min-h-8 items-center gap-1.5 rounded-full text-[15px] font-semibold transition-transform group-active:scale-[0.96] ${padding} ${look}`}
        >
          {children}
        </span>
      </button>
    );
  }

  return (
    <button
      type={type}
      className={`inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl text-[17px] font-semibold transition-[transform,opacity] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 ${padding} ${look} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
