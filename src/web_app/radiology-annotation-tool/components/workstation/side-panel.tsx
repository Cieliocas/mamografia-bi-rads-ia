"use client"

import {
  Upload,
  FileImage,
  Clock,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  XCircle,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"

interface StudyFile {
  id: string
  name: string
  type: string
  size: string
  date: string
  status: "pending" | "analyzed" | "confirmed" | "rejected"
}

interface SidePanelProps {
  activeView: string
  files: StudyFile[]
  selectedFile: string | null
  onSelectFile: (id: string) => void
  onUploadClick: () => void
  isAnalyzing: boolean
}

const statusConfig = {
  pending: {
    label: "Pendente",
    icon: Clock,
    className: "bg-warning/15 text-warning border-warning/30",
  },
  analyzed: {
    label: "Analisado",
    icon: AlertCircle,
    className: "bg-info/15 text-info border-info/30",
  },
  confirmed: {
    label: "Confirmado",
    icon: CheckCircle2,
    className: "bg-success/15 text-success border-success/30",
  },
  rejected: {
    label: "Rejeitado",
    icon: XCircle,
    className: "bg-destructive/15 text-destructive border-destructive/30",
  },
}

function UploadPanel({ onUploadClick }: { onUploadClick: () => void }) {
  return (
    <div className="flex flex-col gap-3 p-3">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Carregar Exame
      </h3>
      <button
        onClick={onUploadClick}
        className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-6 transition-colors hover:border-primary/50 hover:bg-secondary/30 cursor-pointer"
      >
        <Upload className="size-8 text-muted-foreground" />
        <div className="text-center">
          <p className="text-xs font-medium text-foreground">
            Clique ou arraste arquivos
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            DICOM, PNG, JPEG, JPG, TIFF
          </p>
        </div>
      </button>
      <div className="rounded-md bg-secondary/50 p-2">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Formatos aceitos: DICOM (.dcm), PNG, JPEG, JPG, TIFF, BMP.
          Tamanho maximo: 500MB por arquivo.
        </p>
      </div>
    </div>
  )
}

function ExplorerPanel({
  files,
  selectedFile,
  onSelectFile,
}: {
  files: StudyFile[]
  selectedFile: string | null
  onSelectFile: (id: string) => void
}) {
  return (
    <div className="flex flex-col gap-1 p-2">
      <h3 className="px-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
        Estudos Carregados
      </h3>
      {files.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <FileImage className="size-8 text-muted-foreground/50" />
          <p className="text-xs text-muted-foreground">
            Nenhum estudo carregado
          </p>
        </div>
      ) : (
        <ScrollArea className="h-[calc(100vh-180px)]">
          <div className="flex flex-col gap-0.5">
            {files.map((file) => {
              const status = statusConfig[file.status]
              const StatusIcon = status.icon
              return (
                <button
                  key={file.id}
                  onClick={() => onSelectFile(file.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-secondary cursor-pointer",
                    selectedFile === file.id && "bg-secondary text-foreground"
                  )}
                >
                  <FileImage className="size-3.5 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-xs font-medium text-foreground">
                      {file.name}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] text-muted-foreground">
                        {file.type}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {file.size}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Badge
                      variant="outline"
                      className={cn("text-[9px] px-1 py-0 h-4", status.className)}
                    >
                      <StatusIcon className="size-2.5 mr-0.5" />
                      {status.label}
                    </Badge>
                    <ChevronRight className="size-3 text-muted-foreground" />
                  </div>
                </button>
              )
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}

function ReviewPanel() {
  return (
    <div className="flex flex-col gap-3 p-3">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Revisao BI-RADS
      </h3>
      <div className="rounded-md bg-secondary/50 p-3">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Selecione um exame analisado para revisar a classificacao BI-RADS
          gerada pelo modelo.
        </p>
      </div>
    </div>
  )
}

export function SidePanel({
  activeView,
  files,
  selectedFile,
  onSelectFile,
  onUploadClick,
}: SidePanelProps) {
  const getPanelTitle = () => {
    switch (activeView) {
      case "upload":
        return "Carregar"
      case "explorer":
        return "Explorador"
      case "search":
        return "Buscar"
      case "review":
        return "Revisao"
      case "analytics":
        return "Estatisticas"
      case "history":
        return "Historico"
      default:
        return "Painel"
    }
  }

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="flex h-8 items-center justify-between border-b border-border px-3">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          {getPanelTitle()}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="size-5 p-0 text-muted-foreground hover:text-foreground"
        >
          <span className="sr-only">Opcoes</span>
          <span className="text-xs">...</span>
        </Button>
      </div>

      <div className="flex-1 overflow-auto">
        {activeView === "upload" && (
          <UploadPanel onUploadClick={onUploadClick} />
        )}
        {(activeView === "explorer" || activeView === "search" || activeView === "history") && (
          <ExplorerPanel
            files={files}
            selectedFile={selectedFile}
            onSelectFile={onSelectFile}
          />
        )}
        {activeView === "review" && <ReviewPanel />}
        {activeView === "analytics" && (
          <div className="p-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Estatisticas
            </h3>
            <div className="flex flex-col gap-2">
              {[
                { label: "Total Analisados", value: "0" },
                { label: "Confirmados", value: "0" },
                { label: "Rejeitados", value: "0" },
                { label: "Pendentes", value: "0" },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="flex items-center justify-between rounded-md bg-secondary/50 px-3 py-2"
                >
                  <span className="text-xs text-muted-foreground">{stat.label}</span>
                  <span className="text-xs font-semibold text-foreground font-mono">
                    {stat.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
