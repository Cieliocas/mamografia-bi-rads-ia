"use client"

import { useState, useRef } from "react"
import { useAuth } from "@/hooks/useAuth"
import { useRouter } from "next/navigation"
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { toast } from "sonner"
import { Camera, Loader2, Save, User, Lock, HelpCircle, ArrowLeft, Mail, Calendar, Image as ImageIcon, CheckCircle, XCircle, Info, RefreshCw, Github, Globe } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export default function ProfilePage() {
    const { user, token, logout, login } = useAuth()
    const router = useRouter()
    const [isUploading, setIsUploading] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [resendingEmail, setResendingEmail] = useState(false)

    // Profile Form State
    const [fullName, setFullName] = useState(user?.full_name || "")
    const [phone, setPhone] = useState(user?.phone || "")
    const [email, setEmail] = useState(user?.email || "")
    const [role, setRole] = useState(user?.role || "usuario_comum")

    // Password Form State
    const [currentPassword, setCurrentPassword] = useState("")
    const [newPassword, setNewPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")
    const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false)

    // Support Form State
    const [supportSubject, setSupportSubject] = useState("")
    const [supportMessage, setSupportMessage] = useState("")

    if (!user) {
        router.push("/login")
        return null
    }

    const handleAvatarClick = () => {
        fileInputRef.current?.click()
    }

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setIsUploading(true)
        const formData = new FormData()
        formData.append("file", file)

        try {
            const response = await fetch("/auth/upload-avatar", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                },
                body: formData,
            })

            const data = await response.json()

            if (!response.ok) throw new Error(data.msg || "Erro ao fazer upload")

            // Update local user state
            const updatedUser = { ...user, profile_image: data.profile_image }
            login(token!, updatedUser) // Re-login to update context
            toast.success("Foto de perfil atualizada")
        } catch (error) {
            toast.error("Erro ao atualizar foto de perfil")
        } finally {
            setIsUploading(false)
        }
    }

    const handleUpdateProfile = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsSaving(true)

        try {
            const response = await fetch("/auth/update-profile", {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    full_name: fullName,
                    phone: phone,
                    email: email,
                    role: role,
                }),
            })

            const data = await response.json()

            if (!response.ok) throw new Error(data.msg || "Erro ao atualizar perfil")

            const updatedUser = { ...user, ...data.user }
            login(token!, updatedUser)
            toast.success("Perfil atualizado com sucesso")
        } catch (error) {
            toast.error(String(error))
        } finally {
            setIsSaving(false)
        }
    }

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault()
        if (newPassword !== confirmPassword) {
            toast.error("As novas senhas não coincidem")
            return
        }
        setIsSaving(true)

        try {
            const response = await fetch("/auth/update-password", {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    current_password: currentPassword,
                    new_password: newPassword,
                }),
            })

            const data = await response.json()
            if (!response.ok) throw new Error(data.msg || "Erro ao alterar senha")

            toast.success("Senha alterada com sucesso")
            setCurrentPassword("")
            setNewPassword("")
            setConfirmPassword("")
        } catch (error) {
            toast.error(String(error))
        } finally {
            setIsSaving(false)
        }
    }

    const handleSupportSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        toast.success("Solicitação enviada! Entraremos em contato em breve.")
        setSupportSubject("")
        setSupportMessage("")
    }

    const handleResendVerification = async () => {
        setResendingEmail(true)
        try {
            const response = await fetch("/auth/resend-verification", {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` }
            })
            const data = await response.json()
            if (response.ok) {
                toast.success("Email de verificação reenviado!")
            } else {
                toast.error(data.msg || "Erro ao reenviar email")
            }
        } catch (error) {
            toast.error("Erro de conexão")
        } finally {
            setResendingEmail(false)
        }
    }

    const getInitials = (name: string) => {
        return name ? name.substring(0, 2).toUpperCase() : "US"
    }

    const backendUrl = "http://localhost:5000" // Should be env var
    const avatarSrc = user.profile_image
        ? (user.profile_image.startsWith("http") ? user.profile_image : `${backendUrl}${user.profile_image}`)
        : ""

    return (
        <div className="container mx-auto py-10 max-w-4xl">
            <Button variant="ghost" className="mb-4" onClick={() => router.push("/")}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Voltar para Workstation
            </Button>

            <div className="flex flex-col md:flex-row gap-8">
                {/* Sidebar Info */}
                <Card className="w-full md:w-1/3">
                    <CardHeader className="text-center">
                        <div className="relative mx-auto mb-4 h-32 w-32">
                            <Avatar className="h-32 w-32 border-4 border-background shadow-xl">
                                <AvatarImage src={avatarSrc} />
                                <AvatarFallback className="text-4xl">{getInitials(user.full_name || user.username)}</AvatarFallback>
                            </Avatar>
                            <div
                                className="absolute bottom-0 right-0 rounded-full bg-primary p-2 text-primary-foreground cursor-pointer hover:bg-primary/90 transition-colors shadow-sm"
                                onClick={handleAvatarClick}
                            >
                                {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                            </div>
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                accept="image/*"
                                onChange={handleFileChange}
                            />
                        </div>
                        <CardTitle>{user.full_name || user.username}</CardTitle>
                        <CardDescription>{user.role || "Usuário"}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">

                            <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">Status</span>
                                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${user.is_verified
                                    ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
                                    : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300"
                                    }`}>
                                    {user.is_verified ? "Verificado" : "Pendente"}
                                </span>
                            </div>

                            <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground flex items-center gap-2">
                                    <Calendar className="h-4 w-4" /> Membro desde
                                </span>
                                <span>{user.created_at ? new Date(user.created_at).toLocaleDateString() : "N/A"}</span>
                            </div>

                            <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground flex items-center gap-2">
                                    <ImageIcon className="h-4 w-4" /> Total de Imagens
                                </span>
                                <span className="font-semibold">{user.image_count || 0}</span>
                            </div>

                            <div className="pt-4 border-t">
                                <span className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">Contas Vinculadas</span>
                                <div className="mt-3 flex gap-3">
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger>
                                                <div className={`p-2 rounded-full ${user.providers?.google ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-400"}`}>
                                                    <Globe className="h-4 w-4" />
                                                </div>
                                            </TooltipTrigger>
                                            <TooltipContent>Google: {user.providers?.google ? "Conectado" : "Não conectado"}</TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>

                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger>
                                                <div className={`p-2 rounded-full ${user.providers?.github ? "bg-black text-white" : "bg-gray-100 text-gray-400"}`}>
                                                    <Github className="h-4 w-4" />
                                                </div>
                                            </TooltipTrigger>
                                            <TooltipContent>GitHub: {user.providers?.github ? "Conectado" : "Não conectado"}</TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>

                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger>
                                                <div className={`p-2 rounded-full ${user.providers?.microsoft ? "bg-blue-50 text-blue-800" : "bg-gray-100 text-gray-400"}`}>
                                                    <div className="h-4 w-4 grid grid-cols-2 gap-0.5">
                                                        <div className="bg-current rounded-[1px]"></div>
                                                        <div className="bg-current rounded-[1px]"></div>
                                                        <div className="bg-current rounded-[1px]"></div>
                                                        <div className="bg-current rounded-[1px]"></div>
                                                    </div>
                                                </div>
                                            </TooltipTrigger>
                                            <TooltipContent>Microsoft: {user.providers?.microsoft ? "Conectado" : "Não conectado"}</TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>

                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger>
                                                <div className={`p-2 rounded-full ${user.providers?.apple ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-400"}`}>
                                                    <div className="h-4 w-4 text-xs flex items-center justify-center font-bold"></div>
                                                </div>
                                            </TooltipTrigger>
                                            <TooltipContent>Apple: {user.providers?.apple ? "Conectado" : "Não conectado"}</TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Tabs Content */}
                <div className="flex-1">
                    <Tabs defaultValue="profile" className="w-full">
                        <TabsList className="grid w-full grid-cols-3">
                            <TabsTrigger value="profile">
                                <User className="mr-2 h-4 w-4" /> Perfil
                            </TabsTrigger>
                            <TabsTrigger value="security">
                                <Lock className="mr-2 h-4 w-4" /> Segurança
                            </TabsTrigger>
                            <TabsTrigger value="support">
                                <HelpCircle className="mr-2 h-4 w-4" /> Suporte
                            </TabsTrigger>
                        </TabsList>

                        {/* Profile Tab */}
                        <TabsContent value="profile">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Dados Pessoais</CardTitle>
                                    <CardDescription>Atualize suas informações de contato e identificação.</CardDescription>
                                </CardHeader>
                                <form onSubmit={handleUpdateProfile}>
                                    <CardContent className="space-y-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="fullName">Nome Completo</Label>
                                            <Input
                                                id="fullName"
                                                value={fullName} onChange={(e) => setFullName(e.target.value)}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="email">Email</Label>
                                            <div className="flex items-center gap-2">
                                                <Input
                                                    id="email"
                                                    type="email"
                                                    value={email} onChange={(e) => setEmail(e.target.value)}
                                                    className={user.is_verified ? "border-green-500 focus-visible:ring-green-500" : "border-yellow-500 focus-visible:ring-yellow-500"}
                                                />
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            {user.is_verified ? (
                                                                <CheckCircle className="h-5 w-5 text-green-500" />
                                                            ) : (
                                                                <XCircle className="h-5 w-5 text-yellow-500 cursor-help" />
                                                            )}
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            {user.is_verified ? "Email Verificado" : "Verificação Pendente"}
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            </div>
                                            {!user.is_verified && (
                                                <div className="flex justify-end">
                                                    <Button
                                                        type="button"
                                                        variant="link"
                                                        size="sm"
                                                        className="h-auto p-0 text-xs text-muted-foreground hover:text-primary"
                                                        onClick={handleResendVerification}
                                                        disabled={resendingEmail}
                                                    >
                                                        {resendingEmail ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}
                                                        Reenviar email de verificação
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="phone">Telefone</Label>
                                            <Input
                                                id="phone"
                                                value={phone} onChange={(e) => setPhone(e.target.value)}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="role">Função / Profissão</Label>
                                            <Select value={role} onValueChange={setRole}>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Selecione sua função" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="radiologista">Radiologista</SelectItem>
                                                    <SelectItem value="medico">Médico</SelectItem>
                                                    <SelectItem value="usuario_comum">Outro</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </CardContent>
                                    <CardFooter className="flex justify-end">
                                        <Button type="submit" disabled={isSaving}>
                                            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                            Salvar Alterações
                                        </Button>
                                    </CardFooter>
                                </form>
                            </Card>
                        </TabsContent>

                        {/* Security Tab */}
                        <TabsContent value="security">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Segurança da Conta</CardTitle>
                                    <CardDescription>Gerencie sua senha e métodos de acesso.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    {!isChangePasswordOpen ? (
                                        <Button variant="outline" onClick={() => setIsChangePasswordOpen(true)} className="w-full">
                                            <Lock className="mr-2 h-4 w-4" /> Alterar Senha
                                        </Button>
                                    ) : (
                                        <div className="space-y-4 border p-4 rounded-md">
                                            <div className="flex justify-between items-center mb-4">
                                                <h3 className="font-medium">Alterar Senha</h3>
                                                <Button variant="ghost" size="sm" onClick={() => setIsChangePasswordOpen(false)}>Cancelar</Button>
                                            </div>
                                            <form onSubmit={handleChangePassword}>
                                                <div className="space-y-4">
                                                    <div className="space-y-2">
                                                        <Label htmlFor="currentPassword">Senha Atual</Label>
                                                        <Input
                                                            id="currentPassword"
                                                            type="password"
                                                            value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)}
                                                            required
                                                        />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <Label htmlFor="newPassword">Nova Senha</Label>
                                                        <Input
                                                            id="newPassword"
                                                            type="password"
                                                            value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                                                            required
                                                        />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <Label htmlFor="confirmPassword">Confirmar Nova Senha</Label>
                                                        <Input
                                                            id="confirmPassword"
                                                            type="password"
                                                            value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                                                            required
                                                        />
                                                    </div>
                                                    <div className="flex justify-end pt-2">
                                                        <Button type="submit" disabled={isSaving}>
                                                            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                                            Atualizar Senha
                                                        </Button>
                                                    </div>
                                                </div>
                                            </form>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* Support Tab */}
                        <TabsContent value="support">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Suporte Técnico</CardTitle>
                                    <CardDescription>Precisa de ajuda? Entre em contato ou reporte um erro.</CardDescription>
                                </CardHeader>
                                <form onSubmit={handleSupportSubmit}>
                                    <CardContent className="space-y-8 pt-6 pb-6">
                                        <div className="grid gap-4">
                                            <Label htmlFor="subject">Assunto</Label>
                                            <Input
                                                id="subject"
                                                placeholder="Ex: Erro ao carregar imagem"
                                                value={supportSubject} onChange={(e) => setSupportSubject(e.target.value)}
                                                required
                                                className="h-11"
                                            />
                                        </div>
                                        <div className="grid gap-4">
                                            <Label htmlFor="message">Mensagem</Label>
                                            <textarea
                                                id="message"
                                                className="flex min-h-[150px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-y"
                                                placeholder="Descreva o problema ou dúvida com detalhes..."
                                                value={supportMessage} onChange={(e) => setSupportMessage(e.target.value)}
                                                required
                                            />
                                        </div>
                                    </CardContent>
                                    <CardFooter className="flex justify-between">
                                        <Button variant="outline" type="button" onClick={() => window.open('mailto:suporte@mammoannot.com')}>
                                            <Mail className="mr-2 h-4 w-4" /> Email Direto
                                        </Button>
                                        <Button type="submit">
                                            Enviar Solicitação
                                        </Button>
                                    </CardFooter>
                                </form>
                            </Card>
                        </TabsContent>
                    </Tabs>
                </div>
            </div>
        </div>
    )
}
