"use client"

import { Loader2 } from "lucide-react"

export function GlobalLoader() {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm transition-all duration-500">
            <div className="flex flex-col items-center gap-4">
                <Loader2 className="h-16 w-16 animate-spin text-primary" />
                <p className="text-lg font-medium text-muted-foreground animate-pulse">Carregando...</p>
            </div>
        </div>
    )
}
