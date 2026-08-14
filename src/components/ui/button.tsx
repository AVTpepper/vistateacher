import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex cursor-pointer shrink-0 items-center justify-center gap-2 rounded-xl text-sm font-bold transition-[color,background-color,box-shadow,transform] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:-translate-y-0.5 active:bg-primary/80",
        accent:
          "bg-accent text-accent-foreground shadow-sm hover:bg-accent/90 hover:-translate-y-0.5 active:bg-accent/80",
        outline:
          "border bg-card/70 text-foreground shadow-xs hover:bg-secondary hover:text-secondary-foreground",
        ghost: "text-foreground hover:bg-muted",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 hover:-translate-y-0.5 active:bg-destructive/80",
      },
      size: {
        sm: "h-11 px-3",
        default: "h-11 px-4",
        lg: "h-12 px-6",
        icon: "size-11",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

interface ButtonProps
  extends
    ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

function Button({
  asChild = false,
  className,
  size,
  variant,
  ...props
}: ButtonProps) {
  const Component = asChild ? Slot : "button";
  return (
    <Component
      className={cn(buttonVariants({ size, variant }), className)}
      {...props}
    />
  );
}

export { Button, buttonVariants };
