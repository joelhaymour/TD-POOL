import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-ink text-lime shadow-sm hover:bg-ink/90 active:scale-[0.98] disabled:bg-ink/40 disabled:text-lime/50",
  secondary:
    "bg-chalk text-ink border border-border-strong hover:bg-field-deep active:scale-[0.98] disabled:opacity-50",
  ghost:
    "bg-transparent text-ink hover:bg-ink/5 active:bg-ink/8 disabled:opacity-40",
  danger:
    "bg-danger text-white hover:bg-danger/90 active:scale-[0.98] disabled:opacity-50",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-xs gap-1.5 rounded-lg",
  md: "h-11 px-4 text-sm gap-2 rounded-xl",
  lg: "h-12 px-5 text-sm gap-2 rounded-xl",
  icon: "h-10 w-10 rounded-xl p-0",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      className,
      variant = "primary",
      size = "md",
      fullWidth,
      type = "button",
      disabled,
      children,
      ...props
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled}
        className={cn(
          "inline-flex items-center justify-center font-semibold tracking-wide transition-all duration-150",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-turf focus-visible:ring-offset-2 focus-visible:ring-offset-field",
          "disabled:pointer-events-none",
          variantClasses[variant],
          sizeClasses[size],
          fullWidth && "w-full",
          className,
        )}
        {...props}
      >
        {children}
      </button>
    );
  },
);
