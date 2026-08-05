import * as React from "react"

import { cn } from "@/lib/utils"

type SegmentedControlOption = {
  value: string
  label: string
}

function SegmentedControl({
  "aria-label": ariaLabel,
  onValueChange,
  options,
  value,
}: {
  "aria-label": string
  onValueChange: (value: string) => void
  options: readonly SegmentedControlOption[]
  value: string
}) {
  return (
    <div
      aria-label={ariaLabel}
      className="grid h-9 w-full auto-cols-fr grid-flow-col rounded-md border border-input bg-muted/40 p-0.5"
      role="radiogroup"
    >
      {options.map((option) => {
        const selected = option.value === value

        return (
          <button
            key={option.value}
            aria-checked={selected}
            className={cn(
              "rounded-sm px-3 text-sm font-medium text-muted-foreground transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              selected && "bg-background text-foreground shadow-xs"
            )}
            onClick={() => onValueChange(option.value)}
            role="radio"
            type="button"
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export { SegmentedControl, type SegmentedControlOption }
