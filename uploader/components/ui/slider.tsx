import { Slider as SliderPrimitive } from "@base-ui/react/slider"

import { cn } from "@/lib/utils"

type SliderProps = {
  className?: string
  defaultValue?: number
  disabled?: boolean
  max?: number
  min?: number
  name?: string
  onValueChange?: (value: number) => void
  step?: number
  value?: number
}

function Slider({
  className,
  defaultValue,
  disabled,
  max,
  min,
  name,
  onValueChange,
  step,
  value,
}: SliderProps) {
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      className={cn("relative flex h-9 w-full touch-none items-center", className)}
      defaultValue={defaultValue}
      disabled={disabled}
      max={max}
      min={min}
      name={name}
      onValueChange={(nextValue) => onValueChange?.(nextValue)}
      step={step}
      value={value}
    >
      <SliderPrimitive.Control className="relative flex h-full w-full items-center">
        <SliderPrimitive.Track className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
          <SliderPrimitive.Indicator className="absolute h-full rounded-full bg-primary" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb className="block size-4 rounded-full border border-primary/60 bg-background shadow-sm outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50" />
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

export { Slider }
