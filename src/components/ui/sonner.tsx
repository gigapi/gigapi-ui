"use client"

import { useTheme } from "@/components/theme-provider"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--z-index": "40",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "pointer-events-auto",
          title: "text-foreground",
          description: "text-muted-foreground",
          actionButton: "text-primary",
          cancelButton: "text-muted-foreground",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
