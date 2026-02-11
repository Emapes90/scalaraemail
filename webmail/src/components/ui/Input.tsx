import React from "react";
import { cn } from "@/lib/utils";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, icon, iconRight, type, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-scalara-muted-foreground mb-1.5">
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-scalara-muted">
              {icon}
            </div>
          )}
          <input
            type={type}
            className={cn(
              "flex h-10 w-full rounded-lg bg-scalara-card border border-scalara-border px-3 py-2",
              "text-sm text-white placeholder:text-scalara-muted",
              "transition-colors duration-150",
              "focus:outline-none focus:ring-2 focus:ring-white/10 focus:border-white/20",
              "disabled:cursor-not-allowed disabled:opacity-50",
              icon && "pl-10",
              iconRight && "pr-10",
              error && "border-scalara-danger focus:ring-red-500/20",
              className,
            )}
            ref={ref}
            {...props}
          />
          {iconRight && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-scalara-muted">
              {iconRight}
            </div>
          )}
        </div>
        {error && <p className="mt-1 text-xs text-scalara-danger">{error}</p>}
      </div>
    );
  },
);

Input.displayName = "Input";

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-scalara-muted-foreground mb-1.5">
            {label}
          </label>
        )}
        <textarea
          className={cn(
            "flex w-full rounded-lg bg-scalara-card border border-scalara-border px-3 py-2",
            "text-sm text-white placeholder:text-scalara-muted",
            "transition-colors duration-150 resize-none",
            "focus:outline-none focus:ring-2 focus:ring-white/10 focus:border-white/20",
            "disabled:cursor-not-allowed disabled:opacity-50",
            error && "border-scalara-danger",
            className,
          )}
          ref={ref}
          {...props}
        />
        {error && <p className="mt-1 text-xs text-scalara-danger">{error}</p>}
      </div>
    );
  },
);

Textarea.displayName = "Textarea";
