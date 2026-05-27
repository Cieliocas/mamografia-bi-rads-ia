# Política de Segurança — AIdentify

## Versões suportadas

| Versão | Suporte de segurança |
|--------|----------------------|
| `main` (branch principal) | ✅ Recebe correções |
| Branches de feature/fix | ⚠️ Apenas durante desenvolvimento ativo |
| Releases anteriores | ❌ Sem suporte |

---

## Reportar uma vulnerabilidade

Se você descobrir uma vulnerabilidade de segurança neste projeto, **não abra uma issue pública**.

### Como reportar

1. **GitHub Private Vulnerability Reporting** (preferido):  
   Acesse *Security → Report a vulnerability* neste repositório e preencha o formulário confidencial.  
   [→ Reportar agora](../../security/advisories/new)

2. **E-mail** (alternativo):  
   Envie uma descrição detalhada para o mantenedor do projeto via e-mail institucional listado no perfil GitHub.

### O que incluir no relatório

- Descrição clara da vulnerabilidade e do impacto potencial
- Passos para reproduzir (PoC se possível)
- Versão afetada (commit ou tag)
- Sugestão de correção (opcional, mas bem-vinda)

### Prazo de resposta

| Etapa | Prazo |
|-------|-------|
| Confirmação de recebimento | 3 dias úteis |
| Avaliação inicial | 7 dias úteis |
| Correção publicada | 30 dias (vulnerabilidades críticas: 14 dias) |

Após a correção ser publicada, o relator será creditado nas notas de release (se desejar).

---

## Escopo

### Em escopo

- Vazamento de dados de paciente para fora do dispositivo local
- Bypass do token de autenticação entre go-core e sidecar IA
- Escalação de privilégios via o processo do aplicativo
- Injeção de dados maliciosos via arquivos DICOM/PNG manipulados
- Vulnerabilidades em dependências com impacto direto no usuário final

### Fora de escopo

- Vulnerabilidades que exijam acesso físico ao dispositivo do usuário final
- Ataques de engenharia social
- Problemas em versões desatualizadas já sem suporte
- Bugs de UX que não comprometem segurança ou privacidade

---

## Contexto de segurança do projeto

O AIdentify é uma aplicação **desktop local** — toda a comunicação ocorre em `127.0.0.1`.  
Dados de pacientes (imagens DICOM, banco SQLite, anotações) **nunca saem do dispositivo**.  
Consulte a seção de Segurança e Privacidade no [README](README.md) para detalhes.

---

## Conformidade com LGPD

Imagens mamográficas e dados de pacientes são **dados pessoais sensíveis de saúde** (LGPD Art. 11).  
Qualquer vulnerabilidade que exponha esses dados é tratada com **prioridade máxima**.
