import * as React from "react"
import { cn } from "@/shared/lib/utils"

export interface SliderProps extends React.InputHTMLAttributes<HTMLInputElement> {
  // Add custom props here if needed
}

const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  ({ className, ...props }, ref) => {
    return (
      <div className="relative flex w-full touch-none select-none items-center">
        <input
          type="range"
          ref={ref}
          className={cn(
            "w-full h-[2px] bg-[#2A2218] rounded-none appearance-none cursor-pointer",
            "focus:outline-none",
            "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-[#C4A055] [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(196,160,85,0.4)] [&::-webkit-slider-thumb]:transition-all hover:[&::-webkit-slider-thumb]:scale-110",
            "[&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:bg-[#C4A055] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:shadow-[0_0_8px_rgba(196,160,85,0.4)] [&::-moz-range-thumb]:transition-all hover:[&::-moz-range-thumb]:scale-110",
            className
          )}
          {...props}
        />
      </div>
    )
  }
)
Slider.displayName = "Slider"

export { Slider }
