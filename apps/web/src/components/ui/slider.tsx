import * as React from "react"
import { cn } from "@/lib/utils"

interface SliderProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: number[];
  onValueChange: (value: number[]) => void;
}

const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  ({ className, value, onValueChange, min = 0, max = 100, step = 1, ...props }, ref) => {
    return (
      <input
        type="range"
        ref={ref}
        min={min}
        max={max}
        step={step}
        value={value[0]}
        onChange={(e) => onValueChange([Number(e.target.value)])}
        className={cn(
          "w-full h-1.5 bg-white/10 rounded-full appearance-none accent-[#C87740] cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#C87740]/50",
          className
        )}
        {...props}
      />
    );
  }
)
Slider.displayName = "Slider"

export { Slider }
