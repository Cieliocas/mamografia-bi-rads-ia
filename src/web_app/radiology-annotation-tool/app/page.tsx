"use client"

import { useState, useRef, useCallback } from "react"
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable"
import { TopToolbar } from "@/components/workstation/top-toolbar"
import { ActivityBar } from "@/components/workstation/activity-bar"
import { SidePanel } from "@/components/workstation/side-panel"
import { ImageViewer } from "@/components/workstation/image-viewer"
import { BiRadsPanel } from "@/components/workstation/birads-panel"
import { StatusBar } from "@/components/workstation/status-bar"
import { Toaster, toast } from "sonner"

interface StudyFile {
  id: string
  name: string
  type: string
  size: string
  date: string
  status: "pending" | "analyzed" | "confirmed" | "rejected"
  src: string
  file?: File
}

interface BiRadsResult {
  category: number
  label: string
  description: string
  confidence: number
  findings: Array<{
    id: string
    type: string
    location: string
    description: string
    confidence: number
  }>
  recommendation: string
  mask?: string
}

export default function WorkstationPage() {
  const [activeView, setActiveView] = useState("upload")
  const [files, setFiles] = useState<StudyFile[]>([])
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [currentResult, setCurrentResult] = useState<BiRadsResult | null>(null)
  const [modelStatus, setModelStatus] = useState<"idle" | "loading" | "ready" | "analyzing" | "error">("ready")
  const [lastAnalysis, setLastAnalysis] = useState<string | null>(null)
  // Mask opacity state
  const [maskOpacity, setMaskOpacity] = useState(0.5)
  const [annotations, setAnnotations] = useState<
    Array<{
      x: number
      y: number
      width: number
      height: number
      label: string
      confidence: number
    }>
  >([])

  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const uploadedFiles = e.target.files
      if (!uploadedFiles) return

      const newFiles: StudyFile[] = (Array.from(uploadedFiles) as File[]).map((file) => ({
        id: `file-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: file.name,
        type: file.name.endsWith(".dcm")
          ? "DICOM"
          : file.type.split("/")[1]?.toUpperCase() || "UNKNOWN",
        size:
          file.size > 1024 * 1024
            ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
            : `${(file.size / 1024).toFixed(0)} KB`,
        date: new Date().toLocaleDateString("pt-BR"),
        status: "pending" as const,
        src: URL.createObjectURL(file), // Used for preview
        file: file // Store original file for upload
      }))

      setFiles((prev) => [...prev, ...newFiles])
      if (newFiles.length > 0) {
        setSelectedFile(newFiles[0].id)
        setCurrentResult(null)
        setAnnotations([])
      }
      setActiveView("explorer")

      toast.success(`${newFiles.length} arquivo(s) carregado(s) com sucesso`, {
        description: "Submeta para analise quando estiver pronto.",
      })

      // Reset input
      e.target.value = ""
    },
    []
  )

  const handleSelectFile = useCallback((id: string) => {
    setSelectedFile(id)
    setCurrentResult(null)
    setAnnotations([])
  }, [])

  const handleSubmitForAnalysis = useCallback(async () => {
    if (!selectedFile) return

    const fileData = files.find(f => f.id === selectedFile)
    if (!fileData || !fileData.file) {
      toast.error("Erro ao encontrar arquivo para analise")
      return
    }

    setIsAnalyzing(true)
    setModelStatus("analyzing")

    try {
      const formData = new FormData()
      formData.append('file', fileData.file)

      // Call API (Proxied by Next.js to Flask)
      const response = await fetch('/predict', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`)
      }

      const data = await response.json()

      if (data.error) {
        throw new Error(data.error)
      }

      // Parse result
      // Backend returns: classification: "BI-RADS X: Description"
      const classStr = data.classification || "BI-RADS 0: Indeterminate"
      const parts = classStr.split(':')
      const label = parts[0].trim() // "BI-RADS X"
      const description = parts.length > 1 ? parts[1].trim() : "Sem descricao"
      const category = parseInt(label.replace("BI-RADS ", "")) || 0

      const newResult: BiRadsResult = {
        category,
        label,
        description,
        confidence: 0.95, // Mock confidence for now
        findings: [], // Backend doesn't return findings yet
        recommendation: "Acompanhamento conforme protocolo clinico.",
        mask: data.mask // Base64 mask
      }

      setCurrentResult(newResult)
      setIsAnalyzing(false)
      setModelStatus("ready")
      setLastAnalysis(
        new Date().toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        })
      )

      // Update file status
      setFiles((prev) =>
        prev.map((f) =>
          f.id === selectedFile ? { ...f, status: "analyzed" as const } : f
        )
      )

      toast.success("Analise concluida", {
        description: `Classificacao: ${newResult.label}`,
      })

    } catch (error) {
      console.error("Analysis failed:", error)
      setIsAnalyzing(false)
      setModelStatus("error")
      toast.error("Falha na analise", {
        description: String(error)
      })
    }
  }, [selectedFile, files])

  const handleConfirm = useCallback(() => {
    if (!selectedFile) return
    setFiles((prev) =>
      prev.map((f) =>
        f.id === selectedFile ? { ...f, status: "confirmed" as const } : f
      )
    )
    toast.success("Classificacao confirmada", {
      description: "O resultado foi salvo com sucesso.",
    })
  }, [selectedFile])

  const handleReject = useCallback(() => {
    if (!selectedFile) return
    setFiles((prev) =>
      prev.map((f) =>
        f.id === selectedFile ? { ...f, status: "rejected" as const } : f
      )
    )
    setCurrentResult(null)
    setAnnotations([])
    toast.info("Classificacao rejeitada", {
      description: "Voce pode resubmeter o exame para nova analise.",
    })
  }, [selectedFile])

  const selectedFileData = files.find((f) => f.id === selectedFile)

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: "var(--card)",
            border: "1px solid var(--border)",
            color: "var(--foreground)",
          },
        }}
      />

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept=".dcm,.dicom,.png,.jpg,.jpeg,.tiff,.tif,.bmp,.webp"
        multiple
        onChange={handleFileChange}
      />

      {/* Top Toolbar */}
      <TopToolbar />

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Activity Bar */}
        <ActivityBar activeView={activeView} onViewChange={setActiveView} />

        {/* Resizable Layout */}
        <ResizablePanelGroup direction="horizontal" className="flex-1">
          {/* Side Panel */}
          <ResizablePanel defaultSize={18} minSize={14} maxSize={30}>
            <SidePanel
              activeView={activeView}
              files={files}
              selectedFile={selectedFile}
              onSelectFile={handleSelectFile}
              onUploadClick={handleUploadClick}
              isAnalyzing={isAnalyzing}
            />
          </ResizablePanel>

          <ResizableHandle />

          {/* Image Viewer */}
          <ResizablePanel defaultSize={55} minSize={30}>
            <ImageViewer
              imageSrc={selectedFileData?.src || null}
              fileName={selectedFileData?.name || null}
              isAnalyzing={isAnalyzing}
              onSubmitForAnalysis={handleSubmitForAnalysis}
              onUploadClick={handleUploadClick}
              annotations={annotations}
            />
          </ResizablePanel>

          <ResizableHandle />

          {/* BI-RADS Panel */}
          <ResizablePanel defaultSize={27} minSize={20} maxSize={40}>
            <BiRadsPanel
              result={currentResult}
              isAnalyzing={isAnalyzing}
              onConfirm={handleConfirm}
              onReject={handleReject}
              hasImage={!!selectedFileData}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {/* Status Bar */}
      <StatusBar
        modelStatus={modelStatus}
        fileCount={files.length}
        currentFile={selectedFileData?.name || null}
        lastAnalysis={lastAnalysis}
      />
    </div>
  )
}
