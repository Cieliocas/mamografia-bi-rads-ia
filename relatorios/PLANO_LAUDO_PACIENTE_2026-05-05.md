# Plano — Laudo clínico, gestão de pacientes, anotações em áudio
**Data:** 2026-05-05
**Contexto:** Plano A (sem modelo) entregue no PR #5. Próximo grande passo é
deixar o laudo realmente utilizável em rotina clínica e estruturar
pacientes como entidade de primeira classe.

---

## Auditoria atual

| Capacidade | Estado |
|---|---|
| Anotações persistidas | ✅ Auto-save 1.5s, restore por estudo |
| Laudo HTML imprimível | ⚠️ Existe mas só tabela numérica de ROIs — sem imagem |
| Imagem marcada exportável | ❌ Inexistente |
| Campos clínicos (BI-RADS global, conclusão, recomendação) | ❌ Inexistente |
| Entidade Paciente | ❌ Só string `patient_id` do header DICOM |
| UI de pacientes (lista/busca/edição) | ❌ Inexistente |
| Áudio por anotação | ❌ Inexistente |

---

## Fase 1 — Laudo com imagem (🔴 alta)

1. **`GET /api/studies/:id/preview/annotated`** — PNG do `/preview` com ROIs
   server-side: cor por BI-RADS, numeração, label opcional. Reusa
   `renderGrayscale` e desenha sobre `image.RGBA`.
2. **Template do laudo HTML embute essa imagem** (data URI base64 ou URL
   relativa). Mantém a tabela como referência.
3. **Campos clínicos no laudo:**
   - BI-RADS global do estudo (calculado: pior das ROIs ou input manual)
   - Conclusão livre (textarea)
   - Recomendação (textarea)
   - Espaço para assinatura/data do radiologista
4. **Botão "Salvar imagem marcada"** no painel → descarrega PNG anotado.
5. **Persistir conclusão/recomendação** no estudo (nova migration ou JSON
   blob em `studies.notes`).

---

## Fase 2 — Entidade Paciente (🟡 média)

1. **Migration** `002_patients.sql`:
   ```sql
   CREATE TABLE patients (
     id           TEXT PRIMARY KEY,         -- UUID interno
     external_id  TEXT,                     -- PatientID do DICOM
     name         TEXT NOT NULL DEFAULT '',
     birth_date   TEXT,
     sex          TEXT,                     -- 'F'|'M'|'O'
     notes        TEXT NOT NULL DEFAULT '',
     created_at   DATETIME NOT NULL DEFAULT (datetime('now'))
   );
   ALTER TABLE studies ADD COLUMN patient_uuid TEXT
     REFERENCES patients(id) ON DELETE SET NULL;
   CREATE INDEX idx_patients_external_id ON patients(external_id);
   ```
2. **Use case `EnsurePatient`** (upsert por `external_id`); chamado por
   `OpenStudy`. Se `external_id` vazio ou anonimizado, cria stub.
3. **Endpoints:**
   - `GET /api/patients` — lista com busca `?q=`
   - `GET /api/patients/:id` — detalhe + estudos
   - `POST /api/patients` — criar manual
   - `PATCH /api/patients/:id` — editar
4. **Modal "Associar paciente"** ao abrir DICOM:
   - Auto-resolve por `external_id`; mostra "Vincular ao paciente X" ou
     "Criar novo".
   - Search/autocomplete por nome ou external_id.
   - Permite editar nome/dados antes de gravar.
5. **Aba "Pacientes"** na sidebar:
   - Lista com search.
   - Drill-down: estudos do paciente, ordenados por data.
   - Comparativo lado-a-lado em split mode.
6. **Laudo enriquecido** com nome, idade, sexo do paciente.

---

## Fase 3 — Anotações em áudio (🟡 média)

Permite o radiologista ditar verbalmente as observações sobre cada
achado em vez de digitar.

1. **Migration** `003_annotation_audio.sql`:
   ```sql
   ALTER TABLE annotations ADD COLUMN audio_path TEXT NOT NULL DEFAULT '';
   ALTER TABLE annotations ADD COLUMN audio_duration_ms INTEGER NOT NULL DEFAULT 0;
   ALTER TABLE annotations ADD COLUMN audio_transcript TEXT NOT NULL DEFAULT '';
   ```
   Áudios guardados em `~/.mammo-desktop/audio/<study_id>/<annot_id>.webm`.
2. **Frontend — gravação:**
   - Botão "🎤 Gravar áudio" na ROI selecionada.
   - `MediaRecorder` API → blob `audio/webm;codecs=opus` (compacto).
   - Indicador visual de gravação + duração em tempo real.
   - Stop → upload `POST /api/annotations/:id/audio` (multipart).
3. **Backend:**
   - `POST /api/annotations/:id/audio` salva o blob em disco, atualiza
     `audio_path` e `audio_duration_ms`.
   - `GET /api/annotations/:id/audio` serve o ficheiro com `Content-Type`
     correto.
   - `DELETE /api/annotations/:id/audio` remove (re-gravação).
4. **Frontend — playback:**
   - Botão "▶ Tocar" / "⏸ Pausar" na ROI; barra de progresso.
   - Auto-play do áudio quando a ROI é selecionada (toggle opcional).
5. **Transcrição (opcional, futura):**
   - Sidecar Python já existe — adicionar endpoint `whisper.cpp` ou
     `faster-whisper` para STT offline.
   - Transcrição vai para `audio_transcript`, mostrada no laudo como texto.
6. **No laudo:**
   - Áudio NÃO é embebido no HTML (o radiologista imprime/PDF).
   - Mas a transcrição (quando disponível) aparece junto a cada ROI.

**Considerações:**
- Tamanho: opus a 32 kbps → ~240 KB/min. Aceitável para storage local.
- Privacidade: áudios contêm voz do radiologista; ficam só localmente.
- Backup do banco já existe (`/api/backup`); precisa estender para incluir
  o diretório `audio/` (zipar tudo).

---

## Fase 4 — Polish (🟢 baixa)

- Anonimização opcional no export (strip PHI nome/data nascimento).
- Histórico do paciente no painel (estudos anteriores).
- Comparativo lado-a-lado de estudos de datas diferentes.
- Densidade mamária e BI-RADS de densidade (A/B/C/D).
- Dictation contínua (áudio do estudo todo, não só por ROI).

---

## Ordem de execução

1. **Fase 1** — Laudo utilizável (1-2 dias de trabalho).
2. **Fase 2** — Pacientes (2-3 dias; mexe em schema, repos, UI).
3. **Fase 3** — Áudio por ROI (1-2 dias backend, 1 dia frontend).
4. **Fase 4** — Conforme feedback do uso real.

Cada fase é entregável independente e pode ir para PR separado.
