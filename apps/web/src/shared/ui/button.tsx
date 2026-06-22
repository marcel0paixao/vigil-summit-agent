import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/shared/lib/utils";

const buttonVariants = cva(
  "inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition-all hover:-translate-y-px hover:shadow-sm active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "liquid-button bg-primary text-slate-900 hover:text-slate-950 dark:bg-primary dark:text-primary-foreground dark:hover:text-primary-foreground dark:hover:bg-purple-200",
        destructive: "bg-destructive text-destructive-foreground hover:bg-red-700",
        outline:
          "liquid-field border border-border bg-card hover:bg-muted dark:hover:bg-white/12",
        secondary: "bg-secondary text-secondary-foreground hover:bg-muted dark:bg-white/8 dark:hover:bg-white/12",
        ghost: "hover:bg-muted dark:hover:bg-white/10",
        link: "h-auto px-0 text-teal-700 underline-offset-4 hover:underline dark:text-purple-300"
      },
      size: {
        default: "h-9 px-3",
        sm: "h-8 px-2.5 text-xs",
        lg: "h-10 px-4",
        icon: "size-9 p-0"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ asChild, className, variant, size, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";

  return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { buttonVariants };
