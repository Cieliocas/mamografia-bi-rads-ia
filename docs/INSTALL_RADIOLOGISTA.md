# Instalação — AIdentify Desktop (Radiologista)

Guia rápido para instalar e usar a versão **sem IA** do AIdentify no PC do
radiologista. A funcionalidade de IA será ativada num release futuro; por
agora, o app permite abrir DICOMs, anotar, e exportar.

---

## Pré-requisitos

- macOS Apple Silicon (arm64) ou Intel (amd64).
- Não é necessário Python, modelo de IA, internet ou conta.

---

## Instalação

1. Receber o ficheiro **`AIdentify.app`** (entregue via USB, AirDrop ou
   download interno).
2. Arrastar `AIdentify.app` para `/Applications`.
3. **Primeira execução**: clique direito sobre `AIdentify` em
   `/Applications` → **Abrir** → confirmar. Esta etapa é só na primeira
   vez (Gatekeeper, devido à assinatura ad-hoc).
4. As execuções seguintes funcionam por duplo-clique normal.

---

## Uso básico

| Ação | Como |
|------|------|
| Abrir DICOM | Botão **Imagens** na barra lateral → seleciona `.dcm` |
| Pan / Zoom | `P` para pan, `+/-` para zoom, `0` ou `F` para fit |
| Criar ROI | `R` (selecionar ferramenta), arrastar no viewer |
| Régua | `L`, arrastar no viewer |
| BI-RADS rápido | Selecionar a ROI, premir `1`–`6` (`4` cicla 4A → 4B → 4C) |
| Apagar ROI | Selecionar, `Delete` ou `Backspace` |
| Undo / Redo | `Cmd+Z` / `Cmd+Shift+Z` |
| Copiar / Colar ROI | `Cmd+C` / `Cmd+V` |
| Salvar agora | `Cmd+S` (auto-save acontece após 1.5s sem mudanças) |
| Exportar | Painel direito → **Exportar** → JSON / CSV / Relatório PDF / Backup do banco |

---

## Indicadores de estado

No painel direito, secção "Backend / IA":

- **Go Core ● online** — base de dados local funcional.
- **IA ● disponível** — modelo carregado (não disponível neste release).
- **IA ◌ desativada** — modo sem IA (estado normal nesta versão).
- **IA ○ indisponível** — sidecar configurado mas com falha (não aplicável aqui).

O botão **Rodar IA** fica desabilitado em modo sem IA. Tudo o resto
(visualizar, anotar, exportar) funciona normalmente.

---

## Backup e dados

Todos os estudos e anotações ficam em `~/.mammo-desktop/mammo.db`. Para
salvaguarda:

- **Backup**: painel direito → **Exportar** → **Backup do banco**.
  Salva um `.db` que podes guardar em pen drive ou serviço de backup.
- **Restauro manual**: fechar o app, substituir `~/.mammo-desktop/mammo.db`
  pelo backup, reabrir.

Para mover para outro PC: copiar o `.db` para o mesmo caminho na nova
máquina.

---

## Troubleshooting

| Sintoma | Solução |
|---------|---------|
| `.app` não abre, mensagem de Gatekeeper | Clique direito → **Abrir** (só primeira vez) |
| Imagem não aparece após selecionar `.dcm` | Confirmar que o `.dcm` é PixelData não-comprimido. Compressão JPEG-Lossless / JPEG-LS não é suportada nesta versão |
| Anotações não persistem | Verificar indicador **Go Core**: tem de estar `● online` |
| App não arranca, "porto 8088 ocupado" | Outro processo do AIdentify activo. Forçar fecho via Activity Monitor e relançar |

---

## Limitações conhecidas (versão sem IA)

- Modelo de IA ainda em treino → botão "Rodar IA" desabilitado.
- DICOM com pixel data comprimido (JPEG-Lossless, JPEG-LS, JPEG-2000)
  ainda não é suportado. Mamografias clínicas geralmente vêm
  descomprimidas, mas alguns PACS comprimem em trânsito.
- Apenas a primeira frame de DICOMs multi-frame é exibida.
- LUT VOI não-linear (`VOILUTSequence`) ainda não aplicada — usa-se WW/WC
  linear do header.

Estes itens estão na lista de melhorias e serão entregues em releases
futuros.
