"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/hooks/useAuth"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { ArrowLeft, Search, Tag, User, Calendar, Edit, Trash2, Folder, Download, Upload, List, Grid } from "lucide-react"
import { toast } from "sonner"
import { AspectRatio } from "@/components/ui/aspect-ratio"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"

interface ImageItem {
    id: number
    filename: string
    original_filename: string
    patient_id: string
    patient_name: string
    tags: string
    classification: string
    created_at: string
}

interface PatientFolder {
    patient_id: string
    patient_name: string
    image_count: number
    last_update: string
}

export default function AcervoPage() {
    const { user, token } = useAuth()
    const router = useRouter()
    const [images, setImages] = useState<ImageItem[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState("")

    // Pagination State
    const [page, setPage] = useState(1)
    const [totalPages, setTotalPages] = useState(1)

    // View State
    const [viewMode, setViewMode] = useState<"all" | "folders">("all")
    const [sortBy, setSortBy] = useState("date_desc")
    const [patients, setPatients] = useState<PatientFolder[]>([])

    // Edit State
    const [editingImage, setEditingImage] = useState<ImageItem | null>(null)
    const [deletingImageId, setDeletingImageId] = useState<number | null>(null)
    const [deleteConfirmed, setDeleteConfirmed] = useState(false)

    // Upload State
    const [isUploading, setIsUploading] = useState(false)
    const [uploadFile, setUploadFile] = useState<File | null>(null)
    const [uploadPatientId, setUploadPatientId] = useState("")
    const [uploadPatientName, setUploadPatientName] = useState("")
    const [uploadClassification, setUploadClassification] = useState("")

    const [editPatientId, setEditPatientId] = useState("")
    const [editPatientName, setEditPatientName] = useState("")
    const [editTags, setEditTags] = useState("")
    const [isSaving, setIsSaving] = useState(false)

    // Debounced fetch
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            if (token) {
                if (viewMode === "all") {
                    fetchImages()
                } else {
                    fetchPatients()
                }
            }
        }, 500)
        return () => clearTimeout(timeoutId)
    }, [token, page, searchTerm, viewMode, sortBy])

    // Reset page when search changes
    useEffect(() => {
        setPage(1)
    }, [searchTerm])

    const fetchImages = async () => {
        setIsLoading(true)
        try {
            const response = await fetch(`/acervo/images?page=${page}&per_page=12&search=${encodeURIComponent(searchTerm)}&sort_by=${sortBy}`, {
                headers: { Authorization: `Bearer ${token}` }
            })
            if (response.ok) {
                const data = await response.json()
                setImages(data.images)
                setTotalPages(data.pages)
            } else {
                toast.error("Erro ao carregar imagens")
            }
        } catch (error) {
            toast.error("Erro de conexão")
        } finally {
            setIsLoading(false)
        }
    }

    const fetchPatients = async () => {
        setIsLoading(true)
        try {
            const response = await fetch(`/acervo/patients?page=${page}&per_page=12&search=${encodeURIComponent(searchTerm)}`, {
                headers: { Authorization: `Bearer ${token}` }
            })
            if (response.ok) {
                const data = await response.json()
                setPatients(data.patients)
                setTotalPages(data.pages)
            } else {
                toast.error("Erro ao carregar pastas")
            }
        } catch (error) {
            toast.error("Erro de conexão")
        } finally {
            setIsLoading(false)
        }
    }

    const handleEditClick = (image: ImageItem) => {
        setEditingImage(image)
        setEditPatientId(image.patient_id || "")
        setEditPatientName(image.patient_name || "")
        setEditTags(image.tags || "")
    }

    const handleSaveEdit = async () => {
        if (!editingImage) return
        setIsSaving(true)
        try {
            const response = await fetch(`/acervo/image/${editingImage.id}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    patient_id: editPatientId,
                    patient_name: editPatientName,
                    tags: editTags
                })
            })

            if (response.ok) {
                const updatedImage = await response.json()
                setImages(images.map(img => img.id === editingImage.id ? updatedImage.image : img))
                setEditingImage(null)
                toast.success("Informações atualizadas")
            } else {
                toast.error("Erro ao atualizar")
            }
        } catch (error) {
            toast.error("Erro ao salvar")
        } finally {
            setIsSaving(false)
        }
    }

    const handleDeleteClick = (id: number) => {
        setDeletingImageId(id)
        setDeleteConfirmed(false)
    }

    const handleDelete = async () => {
        if (!deletingImageId) return
        try {
            const response = await fetch(`/acervo/image/${deletingImageId}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` }
            })
            if (response.ok) {
                setImages(images.filter(img => img.id !== deletingImageId))
                toast.success("Imagem excluída")
                setDeletingImageId(null)
            } else {
                toast.error("Erro ao excluir")
            }
        } catch (error) {
            toast.error("Erro ao excluir")
        }
    }

    const handleUpload = async () => {
        if (!uploadFile) {
            toast.error("Selecione um arquivo")
            return
        }

        const formData = new FormData()
        formData.append("file", uploadFile)
        formData.append("patient_id", uploadPatientId)
        formData.append("patient_name", uploadPatientName)
        formData.append("classification", uploadClassification)

        setIsUploading(true)
        try {
            const response = await fetch("/acervo/save-image", {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
                body: formData
            })

            if (response.ok) {
                toast.success("Upload realizado com sucesso!")
                setUploadFile(null)
                setUploadPatientId("")
                setUploadPatientName("")
                setUploadClassification("")
                fetchImages() // Refresh list
            } else {
                toast.error("Erro ao fazer upload")
            }
        } catch (error) {
            toast.error("Erro de conexão")
        } finally {
            setIsUploading(false)
        }
    }

    const handleDownload = (imageId: number, filename: string) => {
        // Create an invisible anchor tag to trigger download
        const url = `${backendUrl}/acervo/download/${imageId}`
        // We need to pass auth token. Browser download usually doesn't send custom headers easily.
        // Option 1: Signed URL (Complex)
        // Option 2: Fetch blob and download (Easier for SPA)

        fetch(url, {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(response => {
                if (!response.ok) throw new Error("Erro no download")
                return response.blob()
            })
            .then(blob => {
                const downloadUrl = window.URL.createObjectURL(blob)
                const a = document.createElement("a")
                a.href = downloadUrl
                a.download = filename
                document.body.appendChild(a)
                a.click()
                a.remove()
            })
            .catch(() => toast.error("Erro ao baixar imagem"))
    }

    // Client-side filtering removed in favor of server-side
    const filteredImages = images

    const backendUrl = "http://localhost:5000"

    return (
        <div className="container mx-auto py-8">
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.push("/")}>
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <h1 className="text-3xl font-bold">Acervo de Imagens</h1>
                </div>
                <div className="relative w-72">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar por paciente, ID ou tags..."
                        className="pl-8"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {/* Tabs & Controls */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                <Tabs value={viewMode} onValueChange={(v) => { setViewMode(v as "all" | "folders"); setPage(1) }} className="w-full md:w-auto">
                    <TabsList>
                        <TabsTrigger value="all" className="flex items-center gap-2">
                            <Grid className="h-4 w-4" /> Todas as Imagens
                        </TabsTrigger>
                        <TabsTrigger value="folders" className="flex items-center gap-2">
                            <Folder className="h-4 w-4" /> Por Paciente
                        </TabsTrigger>
                    </TabsList>
                </Tabs>

                <div className="flex items-center gap-2 w-full md:w-auto">
                    {/* Sort Select */}
                    {viewMode === "all" && (
                        <Select value={sortBy} onValueChange={setSortBy}>
                            <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="Ordenar por" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="date_desc">Mais Recentes</SelectItem>
                                <SelectItem value="date_asc">Mais Antigos</SelectItem>
                                <SelectItem value="name_asc">Nome (A-Z)</SelectItem>
                                <SelectItem value="name_desc">Nome (Z-A)</SelectItem>
                            </SelectContent>
                        </Select>
                    )}

                    {/* Upload Dialog */}
                    <Dialog>
                        <DialogTrigger asChild>
                            <Button className="flex items-center gap-2">
                                <Upload className="h-4 w-4" /> Upload
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Upload de Imagem</DialogTitle>
                                <DialogDescription>Adicione uma imagem analisada ao acervo.</DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                                <div className="space-y-2">
                                    <Label>Arquivo de Imagem</Label>
                                    <Input type="file" onChange={(e) => setUploadFile(e.target.files?.[0] || null)} />
                                </div>
                                <div className="space-y-2">
                                    <Label>ID do Paciente</Label>
                                    <Input value={uploadPatientId} onChange={(e) => setUploadPatientId(e.target.value)} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Nome do Paciente</Label>
                                    <Input value={uploadPatientName} onChange={(e) => setUploadPatientName(e.target.value)} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Classificação (BI-RADS)</Label>
                                    <Select value={uploadClassification} onValueChange={setUploadClassification}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Selecione..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="BI-RADS 1">BI-RADS 1</SelectItem>
                                            <SelectItem value="BI-RADS 2">BI-RADS 2</SelectItem>
                                            <SelectItem value="BI-RADS 3">BI-RADS 3</SelectItem>
                                            <SelectItem value="BI-RADS 4">BI-RADS 4</SelectItem>
                                            <SelectItem value="BI-RADS 5">BI-RADS 5</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <DialogFooter>
                                <Button onClick={handleUpload} disabled={isUploading}>
                                    {isUploading ? "Enviando..." : "Upload"}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            {isLoading ? (
                <div className="text-center py-20">Carregando...</div>
            ) : viewMode === "all" ? (
                // Images Grid View
                filteredImages.length === 0 ? (
                    <div className="text-center py-20 text-muted-foreground">
                        Nenhuma imagem encontrada.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredImages.map(image => (
                            <Card key={image.id} className="overflow-hidden">
                                <CardHeader className="p-0">
                                    <AspectRatio ratio={4 / 3}>
                                        <img
                                            src={`${backendUrl}${image.filename}`}
                                            alt={image.original_filename}
                                            className="object-cover w-full h-full"
                                        />
                                    </AspectRatio>
                                </CardHeader>
                                <CardContent className="p-4 space-y-2">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <h3 className="font-semibold text-lg">{image.patient_name || "Paciente Não Identificado"}</h3>
                                            <p className="text-sm text-muted-foreground flex items-center gap-1">
                                                <User className="h-3 w-3" /> ID: {image.patient_id || "N/A"}
                                            </p>
                                        </div>
                                        <div className={`px-2 py-1 rounded-full text-xs font-medium ${image.classification?.includes("4") || image.classification?.includes("5")
                                            ? "bg-red-100 text-red-800"
                                            : "bg-green-100 text-green-800"
                                            }`}>
                                            {image.classification || "Não classificado"}
                                        </div>
                                    </div>
                                    <div className="text-sm text-muted-foreground flex items-center gap-1">
                                        <Tag className="h-3 w-3" /> {image.tags || "Sem tags"}
                                    </div>
                                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                                        <Calendar className="h-3 w-3" /> {new Date(image.created_at).toLocaleDateString()}
                                    </div>
                                </CardContent>
                                <CardFooter className="p-4 pt-0 flex justify-end gap-2">
                                    <Button variant="ghost" size="sm" onClick={() => handleDownload(image.id, image.original_filename)}>
                                        <Download className="h-4 w-4" />
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={() => handleEditClick(image)}>
                                        <Edit className="h-4 w-4" />
                                    </Button>
                                    <Button variant="destructive" size="sm" onClick={() => handleDeleteClick(image.id)}>
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </CardFooter>
                            </Card>
                        ))}
                    </div>
                )
            ) : (
                // Folders View
                patients.length === 0 ? (
                    <div className="text-center py-20 text-muted-foreground">
                        Nenhum paciente encontrado.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {patients.map((patient, idx) => (
                            <Card key={idx} className="hover:bg-accent/50 cursor-pointer transition-colors" onClick={() => {
                                setSearchTerm(patient.patient_id || patient.patient_name)
                                setViewMode("all") // Switch to list view with filter
                            }}>
                                <CardContent className="p-6 flex flex-col items-center text-center space-y-4">
                                    <Folder className="h-16 w-16 text-blue-500 fill-blue-100" />
                                    <div>
                                        <h3 className="font-semibold text-lg">{patient.patient_name || "Sem Nome"}</h3>
                                        <p className="text-sm text-muted-foreground">{patient.patient_id || "ID Desconhecido"}</p>
                                    </div>
                                    <div className="text-xs text-muted-foreground bg-secondary px-2 py-1 rounded-full">
                                        {patient.image_count} imagens
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        Atualizado: {patient.last_update ? new Date(patient.last_update).toLocaleDateString() : "-"}
                                    </p>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )
            )}

            {/* Pagination Controls */}
            {totalPages > 1 && (
                <div className="flex justify-center items-center gap-4 mt-8">
                    <Button
                        variant="outline"
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                    >
                        Anterior
                    </Button>
                    <span className="text-sm font-medium">
                        Página {page} de {totalPages}
                    </span>
                    <Button
                        variant="outline"
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                    >
                        Próxima
                    </Button>
                </div>
            )}

            {/* Edit Dialog (Existing) */}
            <Dialog open={!!editingImage} onOpenChange={(open) => !open && setEditingImage(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Editar Informações</DialogTitle>
                        <DialogDescription>Atualize os dados do paciente e tags.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Nome do Paciente</Label>
                            <Input value={editPatientName} onChange={(e) => setEditPatientName(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>ID do Paciente</Label>
                            <Input value={editPatientId} onChange={(e) => setEditPatientId(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>Tags (separadas por vírgula)</Label>
                            <Input value={editTags} onChange={(e) => setEditTags(e.target.value)} placeholder="Ex: denso, calcificação" />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditingImage(null)}>Cancelar</Button>
                        <Button onClick={handleSaveEdit} disabled={isSaving}>
                            {isSaving ? "Salvando..." : "Salvar"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Enhanced Delete Confirmation Dialog */}
            <Dialog open={!!deletingImageId} onOpenChange={(open) => !open && setDeletingImageId(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Excluir Imagem</DialogTitle>
                        <DialogDescription>
                            Tem certeza que deseja excluir esta imagem? Esta ação não pode ser desfeita.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex items-center space-x-2 py-4">
                        <Checkbox id="confirm-delete" checked={deleteConfirmed} onCheckedChange={(c) => setDeleteConfirmed(c as boolean)} />
                        <label
                            htmlFor="confirm-delete"
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                            Estou ciente de que a exclusão é permanente
                        </label>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeletingImageId(null)}>Cancelar</Button>
                        <Button variant="destructive" onClick={handleDelete} disabled={!deleteConfirmed}>
                            Excluir
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
