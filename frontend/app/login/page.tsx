"use client"

import { useState } from "react"
import { useAuth } from "@/hooks/useAuth"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { BrainCircuit } from "lucide-react"

export default function LoginPage() {
    const [username, setUsername] = useState("")
    const [password, setPassword] = useState("")
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isRegistering, setIsRegistering] = useState(false)
    const { login } = useAuth()

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsSubmitting(true)

        const endpoint = isRegistering ? "/auth/register" : "/auth/login"

        try {
            const response = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password }),
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.msg || "Erro na autenticacao")
            }

            if (isRegistering) {
                // Auto login after register or just switch to login?
                // Let's just switch to login for simplicity or auto-login if backend returned token (it didn't logic-wise)
                setIsRegistering(false)
                toast.success("Usuario criado! Faça login.")
            } else {
                login(data.access_token, data.username)
            }
        } catch (error) {
            toast.error(String(error))
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-background px-4">
            <Card className="w-full max-w-sm">
                <CardHeader className="space-y-1 text-center">
                    <div className="flex justify-center mb-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
                            <BrainCircuit className="h-6 w-6 text-primary-foreground" />
                        </div>
                    </div>
                    <CardTitle className="text-2xl font-bold">MammoAnnot AI</CardTitle>
                    <CardDescription>
                        {isRegistering ? "Crie sua conta para acessar" : "Entre para acessar a workstation"}
                    </CardDescription>
                </CardHeader>
                <form onSubmit={handleSubmit}>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="username">Usuario</Label>
                            <Input
                                id="username"
                                type="text"
                                placeholder="radiologista"
                                required
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password">Senha</Label>
                            <Input
                                id="password"
                                type="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>
                    </CardContent>
                    <CardFooter className="flex flex-col space-y-2">
                        <Button className="w-full" type="submit" disabled={isSubmitting}>
                            {isSubmitting ? "Carregando..." : isRegistering ? "Criar Conta" : "Entrar"}
                        </Button>
                        <Button
                            variant="link"
                            className="text-sm text-muted-foreground"
                            type="button"
                            onClick={() => setIsRegistering(!isRegistering)}
                        >
                            {isRegistering ? "Ja tem conta? Entrar" : "Nao tem conta? Cadastrar"}
                        </Button>
                    </CardFooter>
                </form>
            </Card>
        </div>
    )
}
