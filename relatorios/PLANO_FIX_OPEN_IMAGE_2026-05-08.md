# Plano Fix — Abertura de Imagens
**Data:** 2026-05-08
**Severidade:** 🔴 bloqueante (Sprint 1)
**Sintoma:** clicar "Abrir" não exibe a imagem no canvas

---

## Caminho atual da abertura (4 etapas)

```
Frontend                          Backend                        DICOM Reader
────────                          ───────                        ────────────
1. App.OpenFileDialog (Wails)  →  runtime.OpenFileDialog       (sistema)
                                  retorna path absoluto
2. study.loadNativePath(path)  →  POST /api/studies            study_handler.go
                                  body: {file_path}                createStudy()
3. backend lê DICOM            →  use case OpenStudy           dicom_reader.go
                                  → DICOMReader.ReadDICOM(path)    ReadDICOM()
4. retorna {id, dims, ...}     ←  responde JSON                
5. frontend pede preview       →  GET /api/studies/:id/preview preview_handler.go
                                  retorna PNG                       renderGrayscale()
6. frontend desenha no canvas  ←  img.onload → draw()
```

---

## Suspeitos prováveis

### S1 — Permissões de leitura de arquivo no `.app` bundled
**Hipótese:** macOS aplica TCC (Transparency / Consent / Control) ao binário `go-core` quando ele tenta ler arquivos fora do bundle. Sem entitlements declarados, qualquer `os.Open(/Users/.../algum.dcm)` retorna erro silencioso.

**Validação:**
```bash
log stream --predicate 'process == "go-core"' --info
# abrir um arquivo no app — observar se aparecem violações TCC
```

**Fix:**
- Criar `apps/desktop/build/darwin/entitlements.plist` com:
  ```xml
  <key>com.apple.security.files.user-selected.read-only</key>
  <true/>
  ```
- Re-assinar com `codesign --entitlements` no `tools/build_release.sh`
- Mas: a leitura é feita pelo `go-core` (subprocesso), não pelo Wails shell. Talvez precise entitlements no `go-core` também.

### S2 — DCMTK não bundled
**Hipótese:** DICOMs reais (clínicos) usam JPEG-Lossless (TS `1.2.840.10008.1.2.4.70`). O `dicom_reader.go` faz shell-out a `dcmdjpeg`, que **não está no `.app`**.

**Validação:**
```bash
# pegar um DICOM clínico
dcmdump arquivo.dcm | grep "Transfer Syntax"
# se for compressed, precisa dcmtk
```

**Fix:**
- Bundle `dcmdjpeg` (~3 MB) em `Contents/Resources/dcmtk/`
- `decompressViaDCMTK` no `dicom_reader.go` precisa procurar primeiro em `os.Executable() + /../Resources/dcmtk/` antes do PATH.
- Documentar: usuário sem dcmtk recebe mensagem clara.

### S3 — Path com espaços ou unicode
**Hipótese:** o radiologista tem pasta tipo `~/Área de Trabalho/Exames Maria José/`. O `OpenFileDialog` retorna o path encoded UTF-8 mas algum lugar do pipeline trata como ASCII.

**Validação:** abrir um DCM em `/tmp/test.dcm` (ASCII puro). Se funciona, é encoding.

**Fix:** auditar `study_handler.go` `createStudy()` — ele já recebe JSON, então UTF-8 deveria estar ok. Mas o `dicom_reader.go` usa `os.Open` que aceita UTF-8 no macOS. Provavelmente não é isso.

### S4 — Frontend não carrega o `previewURL`
**Hipótese:** `Image.onload` nunca dispara porque o PNG vem com erro 500 ou Content-Type errado.

**Validação:**
```javascript
// no DevTools do app rodando:
fetch('http://127.0.0.1:8088/api/studies/<id>/preview').then(r => console.log(r.status, r.headers))
```

**Fix:** garantir que `preview_handler.go` retorna `Content-Type: image/png` e que o frontend usa o URL absoluto (`http://127.0.0.1:8088/...`) e não relativo.

### S5 — Wails binding `App.OpenFileDialog` quebrou
**Hipótese:** depois das mudanças do menu nativo (`menu.NewMenu`), o binding pode ter regredido — ou o `App.js` gerado não tem mais a função.

**Validação:**
```bash
cat apps/frontend/src/app/wailsjs/go/main/App.d.ts
# tem que ter: export function OpenFileDialog(): Promise<string>
```

**Fix:** rodar `wails generate module` ou rebuild full.

---

## Roteiro de execução

### Passo 1 — Reproduzir e capturar logs (30 min)
1. Rodar o `.app` do Desktop com `Console.app` aberto, filtro `go-core`
2. Tentar abrir um DICOM teste (de `~/Pictures/teste.dcm` por exemplo)
3. Salvar logs em `/tmp/aidentify-debug.log`
4. Identificar primeiro erro real

### Passo 2 — Validar cada suspeito (1h)
- [ ] S1: tentar abrir arquivo de `~/Documents/test.dcm` (escopo TCC normal)
- [ ] S2: testar DICOM uncompressed vs JPEG-Lossless
- [ ] S5: verificar `App.d.ts` tem `OpenFileDialog`

### Passo 3 — Corrigir conforme descoberto
Implementação depende do diagnóstico. Mais provável (apostas em ordem):
1. **S2 (DCMTK não bundled)** — 60%
2. **S1 (entitlements)** — 25%
3. **S5 (Wails binding)** — 10%
4. **S4 (Content-Type)** — 5%

### Passo 4 — Adicionar telemetria
Para evitar isso voltar:
- Toast no frontend quando POST /api/studies falha (com a mensagem do backend)
- Log estruturado no go-core: `[open-study] path=... error=...`
- Botão "Copiar logs" no Help → Sobre

### Passo 5 — Test fixture
Adicionar `apps/core/internal/adapters/filesystem/testdata/` com 1 DCM uncompressed pequeno (synthetic) para `httptest` cobrir o `POST /api/studies` end-to-end.

---

## Critério de aceitação

- [ ] Clicar "Abrir" → file picker → escolher `.dcm` clínico → imagem aparece no canvas em < 2 s
- [ ] Mensagem de erro clara quando o arquivo não pode ser lido (ex: TS não suportado)
- [ ] Funciona com DICOM JPEG-Lossless (formato comum em mamografia)
- [ ] Funciona com paths que têm espaços / acentos
- [ ] Funciona em `wails dev` E no `.app` bundled
