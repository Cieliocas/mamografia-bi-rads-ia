import Link from 'next/link'
import { Button } from "@/components/ui/button"
import { Construction } from "lucide-react"

export default function NotFound() {
    return (
        <div className="flex h-screen flex-col items-center justify-center bg-background text-foreground">
            <div className="container flex max-w-[64rem] flex-col items-center gap-4 text-center">
                <div className="rounded-full bg-muted p-4">
                    <Construction className="h-10 w-10 text-muted-foreground" />
                </div>
                <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
                    404 - Página não encontrada
                </h1>
                <p className="max-w-[42rem] leading-normal text-muted-foreground sm:text-xl sm:leading-8">
                    Desculpe, a página que você está procurando não existe ou foi movida.
                </p>
                <div className="flex gap-4">
                    <Button asChild>
                        <Link href="/">
                            Voltar para o Início
                        </Link>
                    </Button>
                    <Button variant="outline" asChild>
                        <Link href="/profile">
                            Ir para Perfil
                        </Link>
                    </Button>
                </div>
            </div>
        </div>
    )
}
