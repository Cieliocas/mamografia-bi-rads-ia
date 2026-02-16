"use client"

import {
  Brain,
  Wifi,
  Clock,
  CheckCircle2,
  AlertCircle,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useEffect, useState } from "react"

interface StatusBarProps {
  modelStatus: "idle" | "loading" | "ready" | "analyzing" | "error"
  fileCount: number
  currentFile: string | null
  lastAnalysis: string | null
}

export function StatusBar({
  modelStatus,
  fileCount,
  currentFile,
  lastAnalysis,
}: StatusBarProps) {
  const [time, setTime] = useState("")

  useEffect(() => {
    const updateTime = () => {
      setTime(
        new Date().toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      )
    }
    updateTime()
    const interval = setInterval(updateTime, 1000)
    return () => clearInterval(interval)
  }, [])

  const statusConfig = {
    idle: {
      label: "Modelo Ocioso",
      icon: Brain,
      className: "text-muted-foreground",
    },
    loading: {
      label: "Carregando Modelo...",
      icon: Brain,
      className: "text-warning animate-pulse",
    },
    ready: {
      label: "Modelo Pronto",
      icon: CheckCircle2,
      className: "text-success",
    },
    analyzing: {
      label: "Analisando...",
      icon: Brain,
      className: "text-primary animate-pulse",
    },
    error: {
      label: "Erro no Modelo",
      icon: AlertCircle,
      className: "text-destructive",
    },
  }

  const status = statusConfig[modelStatus]
  const StatusIcon = status.icon

  return (
    <footer className="flex h-6 items-center justify-between border-t border-border bg-card px-3">
      <div className="flex items-center gap-3">
        <div className={cn("flex items-center gap-1", status.className)}>
          <StatusIcon className="size-3" />
          <span className="text-[10px]">{status.label}</span>
        </div>

        <div className="h-3 w-px bg-border" />

        <div className="flex items-center gap-1 text-muted-foreground">
          <Wifi className="size-3" />
          <span className="text-[10px]">Keras/TF</span>
        </div>

        {currentFile && (
          <>
            <div className="h-3 w-px bg-border" />
            <span className="text-[10px] text-muted-foreground truncate max-w-48">
              {currentFile}
            </span>
          </>
        )}
      </div>

      <div className="flex items-center gap-3">
        {lastAnalysis && (
          <span className="text-[10px] text-muted-foreground">
            Ultima analise: {lastAnalysis}
          </span>
        )}

        <div className="h-3 w-px bg-border" />

        <span className="text-[10px] text-muted-foreground">
          {fileCount} {fileCount === 1 ? "arquivo" : "arquivos"}
        </span>

        <div className="h-3 w-px bg-border" />

        <div className="flex items-center gap-1 text-muted-foreground">
          <Clock className="size-3" />
          <span className="text-[10px] font-mono">{time}</span>
        </div>
      </div>
    </footer>
  )
}
