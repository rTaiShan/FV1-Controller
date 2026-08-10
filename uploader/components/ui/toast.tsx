import { X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type ToastMessage = {
  id: number
  message: string
  title: string
  variant?: "default" | "destructive" | "success"
}

function ToastViewport({
  onDismiss,
  toasts,
}: {
  onDismiss: (id: number) => void
  toasts: ToastMessage[]
}) {
  return (
    <div className="fixed bottom-4 right-4 z-50 grid w-[min(24rem,calc(100vw-2rem))] gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            "rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-lg",
            toast.variant === "destructive" && "border-destructive/40",
            toast.variant === "success" && "border-primary/40"
          )}
        >
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{toast.title}</div>
              <div className="mt-1 text-sm leading-5 text-muted-foreground">{toast.message}</div>
            </div>
            <Button
              aria-label="Dismiss notification"
              size="icon-xs"
              type="button"
              variant="ghost"
              onClick={() => onDismiss(toast.id)}
            >
              <X />
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}

export { ToastViewport }
