import * as React from "react"
import { cn } from "@/shared/lib/utils"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "glass" | "outline" | "ghost"
  size?: "default" | "sm" | "lg" | "icon"
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
          {
            "bg-[#C4A055] text-[#060504] hover:bg-[#D4B465] shadow-md": variant === "default",
            "bg-[#0E0B08] text-[#EDE5D5] border border-[#2A2218] hover:border-[#C4A055]/30 hover:bg-[#1A1510]": variant === "glass",
            "border border-[#2A2218] bg-transparent text-[#EDE5D5] hover:border-[#C4A055]/30 hover:bg-[#1A1510]": variant === "outline",
            "hover:bg-[#1A1510] text-[#EDE5D5]": variant === "ghost",
            "h-10 px-4 py-2": size === "default",
            "h-9 rounded-md px-3": size === "sm",
            "h-11 rounded-md px-8 text-base": size === "lg",
            "h-10 w-10": size === "icon",
          },
          className
        )}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button }
