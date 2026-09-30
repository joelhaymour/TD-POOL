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
    "bg-lime text-accent-fg shadow-[0_1px_0_rgba(255,255,255,0.25)_inset,0_6px_16px_-6px_rgba(17,128,60,0.55)] hover:bg-lime/90 disabled:bg-lime/30 disabled:text-accent-fg/50 disabled:shadow-none",
  secondary:
    "bg-chalk/80 text-ink shadow-[0_0_0_0.5px_rgba(18,23,15,0.12),0_2px_8px_-3px_rgba(18,23,15,0.12)] hover:bg-chalk disabled:opacity-50",
  ghost:
    "bg-transparent text-ink hover:bg-ink/5 active:bg-ink/8 disabled:opacity-40",
  danger:
    "bg-danger text-white hover:bg-danger/90 disabled:opacity-50",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-9 px-3.5 text-xs gap-1.5 rounded-full",
  md: "h-11 px-5 text-sm gap-2 rounded-full",
  lg: "h-[3.25rem] px-6 text-[15px] gap-2 rounded-full",
  icon: "h-10 w-10 rounded-full p-0",
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
          "pressable inline-flex items-center justify-center font-semibold tracking-wide",
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
