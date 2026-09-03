const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle,
  PageBreak, Footer, PageNumber, LevelFormat, convertInchesToTwip,
} = require('docx');

// O relatório NÃO contém imagens de exame. As mamografias utilizadas na avaliação
// são de paciente identificável e cobertas por sigilo; o que elas ilustrariam está
// descrito em texto. Ver specs/005-relatorio-final/verificacao.md.
//
// ─────────────────────────────────────────────────────────────────────────────
// Formatação conforme ANEXO III do Edital PIBITI 2026-2027 (CPESI/PROPESQI/UFPI)
//   b.3  fonte 10 pt, justificado          b.9   entrelinhas simples
//   b.4  Arial em todo o documento         b.10  paginação no rodapé, à direita
//   b.5  margens de 2 cm                   b.11  espaço vazio junto a ilustrações
//   b.6  recuo de 1ª linha de 1,25 cm      b.12  "Tabela N:" à esquerda, sem negrito
//   b.7  controle de órfãs/viúvas          b.13  ilustrações indicam a fonte
//   b.8  0 pt antes e depois
// ─────────────────────────────────────────────────────────────────────────────
const SZ      = 20;    // 10 pt em meio-pontos
const MARGEM  = 1134;  // 2 cm em twips
const RECUO   = 709;   // 1,25 cm em twips
const SIMPLES = 240;   // entrelinhas simples
const W       = 9070;  // largura útil: A4 (11906) menos 2 cm de cada margem
const GREY    = 'F2F2F2';

const base = { before: 0, after: 0, line: SIMPLES };

// Parágrafo de corpo, com recuo de primeira linha.
const P = (text) => new Paragraph({
  alignment: AlignmentType.JUSTIFIED, spacing: base, widowControl: true,
  indent: { firstLine: RECUO },
  children: [new TextRun({ text, size: SZ })],
});

// Parágrafo sem recuo (frases de abertura de lista, por exemplo).
const Plain = (text, o = {}) => new Paragraph({
  alignment: o.align || AlignmentType.JUSTIFIED, spacing: base, widowControl: true,
  children: [new TextRun({ text, size: SZ, bold: o.bold, italics: o.italics })],
});

// Parágrafo com trechos destacados: rich('normal ', ['negrito', true], ['itálico', 'i'])
const rich = (...parts) => new Paragraph({
  alignment: AlignmentType.JUSTIFIED, spacing: base, widowControl: true,
  indent: { firstLine: RECUO },
  children: parts.map(p => Array.isArray(p)
    ? new TextRun({ text: p[0], bold: p[1] === true, italics: p[1] === 'i', size: SZ })
    : new TextRun({ text: p, size: SZ })),
});

const vazio = () => new Paragraph({ spacing: base, children: [new TextRun({ text: '', size: SZ })] });

// b.3/b.4: títulos em Arial 10, negrito; b: alinhamento à esquerda.
// b.8 é literal (0 antes, 0 depois), então a separação vem de um parágrafo vazio.
const H = (text, level) => new Paragraph({
  heading: level, alignment: AlignmentType.LEFT, widowControl: true,
  spacing: { before: 120, after: 60, line: SIMPLES },
  children: [new TextRun({ text, bold: true, size: SZ })],
});

const cell = (text, o = {}) => new TableCell({
  width: { size: o.w, type: WidthType.DXA },
  shading: o.head ? { type: ShadingType.CLEAR, fill: GREY } : undefined,
  margins: { top: 40, bottom: 40, left: 80, right: 80 },
  children: [new Paragraph({
    alignment: o.align || AlignmentType.LEFT, spacing: base,
    children: [new TextRun({ text, bold: o.head || o.bold, size: SZ })],
  })],
});

// b.11: um espaço vazio antes da ilustração.
const table = (widths, rows, opts = {}) => [
  vazio(),
  new Table({
    columnWidths: widths,
    width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    rows: rows.map((r, i) => new TableRow({
      tableHeader: i === 0 && !opts.noHead,
      children: r.map((c, j) => cell(String(c), {
        w: widths[j], head: i === 0 && !opts.noHead,
        align: (opts.right || []).includes(j) ? AlignmentType.RIGHT : AlignmentType.LEFT,
      })),
    })),
  }),
];

// b.12: numeração arábica separada por dois-pontos, à esquerda, sem negrito.
// b.13: a ilustração indica a fonte.  b.11: espaço vazio depois.
const caption = (text, fonte = 'Elaborado pelo autor.') => [
  new Paragraph({
    alignment: AlignmentType.LEFT, spacing: base, widowControl: true,
    children: [new TextRun({ text, size: SZ })],
  }),
  new Paragraph({
    alignment: AlignmentType.LEFT, spacing: base, widowControl: true,
    children: [new TextRun({ text: `Fonte: ${fonte}`, size: SZ })],
  }),
  vazio(),
];

const quote = (text) => new Paragraph({
  spacing: base, widowControl: true,
  indent: { left: RECUO, right: 340 },
  children: [new TextRun({ text, size: SZ, italics: true })],
});

// NBR 6023: entrada alinhada à esquerda, sem recuo deslocado.
const ref = (text) => new Paragraph({
  alignment: AlignmentType.JUSTIFIED, spacing: base, widowControl: true,
  children: [new TextRun({ text, size: SZ })],
});

const bullet = (text) => new Paragraph({
  numbering: { reference: 'marcadores', level: 0 },
  alignment: AlignmentType.JUSTIFIED, spacing: base, widowControl: true,
  children: [new TextRun({ text, size: SZ })],
});

const doc = new Document({
  creator: 'Franciélio Evangelista dos Santos Castro',
  title: 'Relatório Final PIBITI/CNPq — Ferramenta de Anotação Semi-Automática de Achados Radiológicos em Mamografias',
  styles: {
    // `default.document` do docx-js só emite <w:docDefaults> — não cria um
    // estilo com w:styleId="Normal". Os headings abaixo (via default.heading*)
    // são gerados com <w:basedOn w:val="Normal"/> apontando para um estilo que
    // não existe no styles.xml. Em alguns visualizadores (não no Word desktop,
    // que tem "Normal" embutido), a ausência da base faz o parágrafo herdar do
    // primeiro estilo da lista — "Title", que é negrito — e o documento inteiro
    // aparece em negrito. Correção: declarar "Normal" explicitamente, ANTES dos
    // headings, para que basedOn resolva para um estilo real.
    default: {
      document: {
        // bold/italics desligados explicitamente: sem isso, o desligamento fica
        // implícito e qualquer herança indevida de estilo liga o negrito.
        run: { font: 'Arial', size: SZ, bold: false, italics: false },
        paragraph: { spacing: base, alignment: AlignmentType.JUSTIFIED, widowControl: true },
      },
      heading1: { run: { font: 'Arial', size: SZ, bold: true, color: '000000' },
                  paragraph: { spacing: { before: 120, after: 60, line: SIMPLES } } },
      heading2: { run: { font: 'Arial', size: SZ, bold: true, color: '000000' },
                  paragraph: { spacing: { before: 120, after: 60, line: SIMPLES } } },
      heading3: { run: { font: 'Arial', size: SZ, bold: true, color: '000000' },
                  paragraph: { spacing: { before: 120, after: 60, line: SIMPLES } } },
    },
    paragraphStyles: [
      {
        id: 'Normal',
        name: 'Normal',
        quickFormat: true,
        run: { font: 'Arial', size: SZ, bold: false, italics: false, color: '000000' },
        paragraph: { spacing: base, alignment: AlignmentType.JUSTIFIED, widowControl: true },
      },
    ],
  },
  numbering: {
    config: [{
      reference: 'marcadores',
      levels: [{
        level: 0, format: LevelFormat.BULLET, text: '•',
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: RECUO + 220, hanging: 220 } } },
      }],
    }],
  },
  sections: [{
    properties: { page: { margin: { top: MARGEM, bottom: MARGEM, left: MARGEM, right: MARGEM } } },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT, spacing: base,
          children: [new TextRun({ children: [PageNumber.CURRENT], size: SZ, font: 'Arial' })],
        })],
      }),
    },
    children: [

// ══════════════════════════ CABEÇALHO ══════════════════════════
new Paragraph({
  alignment: AlignmentType.CENTER, spacing: base,
  children: [new TextRun({ text: 'RELATÓRIO DE ATIVIDADES – PROGRAMA DE INICIAÇÃO EM DESENVOLVIMENTO', bold: true, size: SZ })],
}),
new Paragraph({
  alignment: AlignmentType.CENTER, spacing: base,
  children: [new TextRun({ text: 'TECNOLÓGICO E INOVAÇÃO – PIBITI/CNPq – UFPI', bold: true, size: SZ })],
}),
vazio(),

H('PARTE I – IDENTIFICAÇÃO', HeadingLevel.HEADING_1),
table([2600, 6760], [
  ['Tipo do Relatório:', '(   ) Parcial      ( X ) Final'],
  ['Programa:', '( X ) PIBITI/CNPq     (   ) PIBITI/UFPI     (   ) PIBITI/Setor Produtivo     (   ) ITV/UFPI'],
  ['Título do Plano de Trabalho:', 'Ferramenta de Anotação Semi-Automática de Achados Radiológicos em Mamografias com Suporte à Terminologia BI-RADS'],
  ['Nome do Orientador(a):', 'André Castelo Branco Soares'],
  ['Nome do Orientando(a):', 'Franciélio Evangelista dos Santos Castro'],
  ['Período de Execução:', 'Setembro de 2025 a Agosto de 2026'],
], { noHead: true }),

new Paragraph({ children: [new PageBreak()] }),
H('PARTE II – RELATO TÉCNICO-CIENTÍFICO', HeadingLevel.HEADING_1),

// ══════════════════════════ 1. INTRODUÇÃO ══════════════════════════
H('1. Introdução', HeadingLevel.HEADING_2),

P('O câncer de mama permanece como a neoplasia maligna mais incidente entre mulheres no Brasil e no mundo, impondo uma demanda crescente sobre os serviços de diagnóstico por imagem. A mamografia é o exame de rastreio de maior custo-benefício estabelecido para a detecção precoce da doença, e sua interpretação segue, na prática clínica contemporânea, o vocabulário padronizado do Breast Imaging Reporting and Data System (BI-RADS), publicado pelo American College of Radiology. Apesar da padronização terminológica, o processo de anotação e documentação dos achados radiológicos — condição sine qua non para a construção de bases de dados de qualidade e para o treinamento de algoritmos de inteligência artificial (IA) — ainda depende majoritariamente de análise humana, exigindo elevado grau de especialização, tempo e atenção por parte do radiologista.'),

P('Nesse contexto, ferramentas de anotação semi-automática surgem como solução tecnológica estratégica: ao integrar sugestões computacionais com a validação interativa do especialista, reduzem o tempo de marcação, padronizam os registros e viabilizam a criação de conjuntos de dados anotados em escala. O presente projeto, inserido no Programa Institucional de Bolsas de Iniciação em Desenvolvimento Tecnológico e Inovação (PIBITI/CNPq) da Universidade Federal do Piauí (UFPI), teve como objetivo central o desenvolvimento de uma ferramenta de software para anotação semi-automática de achados radiológicos em mamografias digitais, com suporte à terminologia BI-RADS.'),

rich('O relatório parcial, referente à primeira metade do período, descreveu a definição da arquitetura e os resultados preliminares de um modelo de segmentação U-Net. Este relatório final cobre o período completo e reporta um resultado qualitativamente distinto: a ferramenta foi concluída, ',
  ['integrada a modelos de inteligência artificial que executam inferência real, localmente e offline', true],
  ', e instrumentada para capturar a divergência entre o que o modelo sugere e o que o radiologista valida — dado que realimenta o treinamento contínuo dos próprios modelos.'),

rich('Cumpre registrar que duas decisões técnicas descritas no relatório parcial foram revistas ao longo da segunda metade do projeto, por razões documentadas na Seção 4.5. O relato a seguir descreve o sistema tal como efetivamente entregue, e ',
  ['toda afirmação sobre o estado do software é verificável no repositório do projeto na data desta entrega', true], '.'),

// ══════════════════════════ 2. REVISÃO ══════════════════════════
H('2. Revisão de Literatura', HeadingLevel.HEADING_2),

P('A aplicação de aprendizado profundo ao processamento de imagens médicas está sistematicamente documentada na literatura. Ronneberger, Fischer e Brox (2015) propuseram a arquitetura U-Net, rede convolucional codificador-decodificador com conexões de salto, concebida para segmentação de imagens biomédicas com conjuntos reduzidos — arquitetura que orientou a fase exploratória deste projeto.'),

P('Para a detecção de lesões, este trabalho apoia-se em duas contribuições distintas. Shen et al. (2019) demonstraram que um classificador construído sobre extratores treinados em fragmentos de imagem (patch classifiers) alcança desempenho competitivo na detecção de câncer de mama em mamografias de rastreio, sem exigir anotação de lesão em nível de pixel para todo o conjunto. Essa abordagem fornece o estágio classificador da cascata aqui integrada. Para a localização, a família de detectores YOLO (Ultralytics) oferece inferência de estágio único com custo computacional compatível com execução em CPU, requisito imposto pela operação offline.'),

P('Os conjuntos de dados públicos são determinantes para o desempenho alcançável. O CBIS-DDSM (LEE et al., 2017) consolidou-se como referência de benchmarking em sistemas de detecção assistida por computador. O CMMD (The Chinese Mammography Database), distribuído via The Cancer Imaging Archive, com as anotações de segmentação TOMPEI-CMMD, forneceu o conjunto de treinamento do detector integrado a esta ferramenta.'),

P('No que diz respeito à terminologia, o BI-RADS define vocabulário controlado e escala de categorias de risco que guiam a conduta clínica. Sickles et al. (2013) apontam a integração desse vocabulário a ferramentas computacionais como fator crítico para a comparabilidade interinstitucional dos dados. Do ponto de vista de interoperabilidade, a adoção do padrão DICOM (NEMA, 2024) é mandatória, impondo requisitos de conformidade desde a fase de arquitetura.'),

rich('Por fim, a literatura de aprendizado com humano no laço (human-in-the-loop) sustenta a premissa central deste trabalho: em domínios nos quais a anotação especializada é o recurso escasso, sistemas que capturam a correção do especialista sobre a saída do modelo produzem, por unidade de esforço humano, ',
  ['mais informação de treinamento do que a anotação feita do zero', true],
  ' — porque uma correção indica não apenas onde está a lesão, mas onde o modelo errou.'),

// ══════════════════════════ 3. METODOLOGIA ══════════════════════════
H('3. Metodologia', HeadingLevel.HEADING_2),

P('A pesquisa adotou abordagem aplicada e experimental, organizada em etapas incrementais de desenvolvimento de software com validação em dados reais. Na segunda metade do período, o trabalho foi conduzido sob desenvolvimento orientado a especificação (Spec-Driven Development), em que cada unidade entregável é precedida de um documento que declara o problema, os requisitos e critérios de aceite objetivamente verificáveis, e sucedida de um registro de verificação com o resultado de cada critério. Essa disciplina está materializada no diretório specs/ do repositório e é a razão de este relatório poder afirmar, item a item, o que foi verificado e o que não foi.'),

H('3.1. Arquitetura da ferramenta', HeadingLevel.HEADING_3),
P('A ferramenta é uma aplicação desktop local, em três camadas desacopladas, operando integralmente offline:'),
table([2100, 2500, 4760], [
  ['Camada', 'Tecnologia', 'Responsabilidade'],
  ['Interface', 'Wails v2 + Angular 21', 'Visualização DICOM, ferramentas de marcação, painéis de achados e laudo'],
  ['Orquestração', 'Go 1.25 + Gin', 'Leitura e renderização DICOM, guardião do processo de IA, proxy autenticado, persistência SQLite'],
  ['Inferência', 'Python + FastAPI + ONNX Runtime', 'Cascata de dois modelos: classificador de malignidade e detector de lesões'],
], { }),
caption('Tabela 1: Arquitetura de três camadas da ferramenta.'),

rich('A comunicação entre as camadas ocorre exclusivamente em ', ['127.0.0.1', 'i'],
  ' (loopback), autenticada por token compartilhado gerado em tempo de execução. Nenhum dado clínico deixa o dispositivo, em conformidade com a Lei Geral de Proteção de Dados (Lei 13.709/2018, Art. 11), que classifica imagens médicas como dado pessoal sensível de saúde.'),

P('A camada de orquestração implementa decodificadores DICOM próprios, escritos em Go puro, para as sintaxes de transferência JPEG Lossless (SOF3) e JPEG-LS (LOCO-I). A alternativa usual seria depender da biblioteca externa DCMTK; a implementação nativa elimina essa dependência de distribuição e mantém o binário autocontido.'),

H('3.2. Divisão de trabalho e protocolo de integração', HeadingLevel.HEADING_3),

rich('O projeto foi conduzido em cooperação com o plano de trabalho de iniciação científica de ',
  ['Micaías Carvalho Vieira', true],
  ', responsável pelo treinamento, avaliação e conversão dos modelos. A fronteira entre os dois planos é um contrato HTTP explícito — o esquema FindingResponse —, deliberadamente tratado como imutável sem alinhamento bilateral. Essa separação permitiu que os dois trabalhos evoluíssem de forma independente e tornou a integração final uma operação de substituição, e não de reescrita.'),

P('Os modelos são distribuídos como artefatos ONNX e executados por ONNX Runtime, sem TensorFlow ou PyTorch em tempo de execução. A cascata opera em dois estágios: um classificador estima a probabilidade de malignidade da imagem; se essa probabilidade excede um limiar (padrão 0,11), um detector YOLOv11n é acionado e devolve as caixas delimitadoras das lesões. Quando o limiar não é atingido, o serviço devolve uma avaliação em nível de imagem, sem localização.'),

H('3.3. Protocolo de avaliação', HeadingLevel.HEADING_3),
P('A avaliação da ferramenta integrada seguiu protocolo documentado e reexecutável, medindo: latência de abertura, renderização e inferência; consumo de memória em regime; tempo de inicialização; taxa de acionamento do estágio detector; e distribuição das probabilidades estimadas. As medições foram automatizadas em instrumento versionado no repositório, e os dados brutos preservados em formato tabular para rastreabilidade.'),

// >>> CONTINUA

// ══════════════════════════ 4. RESULTADOS ══════════════════════════
H('4. Resultados e discussão', HeadingLevel.HEADING_2),

H('4.1. A ferramenta entregue', HeadingLevel.HEADING_3),

rich('Ao final do período, a ferramenta — denominada ', ['AIdentify', true],
  ' — encontra-se funcional e distribuível. O desenvolvimento acumulou 188 commits e 35 solicitações de incorporação revisadas, entre novembro de 2025 e agosto de 2026, resultando em aproximadamente 8.900 linhas de Go, 4.700 de TypeScript e 1.400 de Python.'),

P('As capacidades entregues incluem:'),
bullet('Visualizador DICOM com janelamento WW/WC, suporte a VOI LUT Sequence, exames multi-frame e grade de até seis vistas simultâneas para comparação;'),
bullet('Decodificadores JPEG Lossless (SOF3) e JPEG-LS (LOCO-I) escritos em Go puro, dispensando dependência externa de DCMTK;'),
bullet('Ferramentas de marcação: regiões de interesse (elipse e retângulo), régua calibrada em milímetros a partir do espaçamento de pixel do DICOM, seta, pincel livre e lupa;'),
bullet('Notas de voz por achado, com transcrição, e ditado durante a marcação;'),
bullet('Densidade mamária ACR (categorias A–D) e linha do tempo de evolução BI-RADS por paciente;'),
bullet('Laudo clínico em PDF e HTML, com a imagem anotada incorporada e campos de conclusão, recomendação e assinatura;'),
bullet('Exportação de anotações em JSON, CSV e MS-COCO; cópia de segurança e restauração do banco local;'),
bullet('Integração contínua multiplataforma e instaladores para macOS e Windows.'),

rich('A cobertura de testes automatizados compreende ', ['46 testes de interface, 24 do serviço de inferência e cinco pacotes de teste no núcleo Go', true],
  ', todos executados a cada alteração pela integração contínua.'),

H('4.2. Integração com os modelos de inteligência artificial', HeadingLevel.HEADING_3),

rich('O marco técnico central da segunda metade do projeto foi a substituição do serviço de inferência simulado por ',
  ['inferência real', true],
  '. Até então, o botão de análise da ferramenta devolvia dois achados sintéticos fixos; a integração concluída neste período faz a aplicação executar dois modelos treinados, localmente e sem rede.'),

table([2400, 3400, 3560], [
  ['Estágio', 'Modelo', 'Treinamento'],
  ['Classificador (gate)', 'Híbrido baseado em patch classifier (SHEN et al., 2019)', 'INbreast'],
  ['Detector', 'YOLOv11n (Ultralytics)', 'TOMPEI-CMMD — vistas MLO, classes massa e calcificação'],
]),
caption('Tabela 2: Modelos de inteligência artificial integrados à ferramenta.',
  'Elaborado pelo autor. Treinamento, avaliação e conversão dos modelos de autoria de Micaías Carvalho Vieira.'),

rich('O desempenho reportado pelo autor dos modelos, no conjunto de validação particionado por paciente do TOMPEI-CMMD, foi de ',
  ['mAP@50 = 0,626 e mAP@50-95 = 0,315', true],
  ' para a melhor configuração (YOLOv11n com aumento de dados offline). ',
  ['Esses valores são do conjunto de validação daquele plano de trabalho, e não de medição realizada nesta ferramenta.', 'i']),

P('A integração exigiu tratamento explícito de três características do serviço que têm consequência direta sobre a interface. Primeiro, quando o classificador não aciona o detector, a resposta contém uma avaliação em nível de imagem, sem caixa delimitadora — situação que não pode ser apresentada como ausência de achado. Segundo, a categoria BI-RADS devolvida é uma faixa heurística derivada da probabilidade estimada, e não a saída de um classificador BI-RADS validado. Terceiro, a inferência analisa o primeiro quadro de exames multi-frame.'),

P('Durante a integração, identificou-se e corrigiu-se um defeito de consequência potencialmente grave. O serviço de inferência não descomprimia arquivos DICOM em JPEG-LS ou JPEG Lossless por ausência das bibliotecas correspondentes e, em vez de sinalizar erro, substituía a imagem por um quadro vazio. A cascata então processava pixels nulos e devolvia um veredito de baixa suspeição com aparência de resultado legítimo. O núcleo em Go, por dispor de decodificadores próprios, exibia a imagem corretamente — de modo que nada na interface denunciava a discrepância. A correção instalou os codecs no serviço e passou a responder com erro explícito quando a imagem não pode ser decodificada e há modelo real carregado, preservando o comportamento tolerante apenas no modo simulado usado em testes.'),

H('4.3. Ciclo de anotação semi-automática', HeadingLevel.HEADING_3),

rich('O objetivo declarado no plano de trabalho — anotação ',['semi-automática', 'i'],
  ' — exige que a sugestão do modelo seja apresentada sobre a imagem e submetida à decisão do especialista. Esse ciclo foi implementado no período: os achados com localização são desenhados no visualizador como caixas tracejadas, em cor deliberadamente fora da paleta usada para as categorias BI-RADS, de modo que uma sugestão automática nunca seja visualmente confundida com uma marcação já validada. Cada sugestão oferece três ações: aceitar, editar ou rejeitar.'),

P('Aceitar converte a sugestão em região de interesse editável e persistível, com categoria e rótulo pré-preenchidos. Editar executa a mesma conversão e já seleciona a região para ajuste. Rejeitar descarta a sugestão da tela — mas não do registro, conforme descrito na Seção 4.5.'),

P('A distinção visual entre os dois estados é deliberada e verificável na aplicação: enquanto pendente, a sugestão é desenhada em traço tracejado e em cor reservada exclusivamente à inteligência artificial; uma vez aceita, passa a traço contínuo na cor correspondente à categoria BI-RADS atribuída, sinalizando ao anotador que aquela marcação deixou de ser sugestão automática e passou a ser registro validado. Quando a sugestão é corrigida, a caixa originalmente proposta pelo modelo permanece registrada, ainda que não exibida.'),

rich('A interface exibe, de forma permanente e não dispensável enquanto houver sugestões na tela, o aviso de que se trata de ',
  ['apoio e não de diagnóstico', true],
  ', que os modelos são de pesquisa e não foram validados clinicamente, e que a categoria BI-RADS sugerida é estimativa. Quando o classificador não aciona o detector, um segundo aviso declara explicitamente que ',
  ['a ausência de marcação não indica ausência de lesão', true],
  ' — ressalva necessária porque a sensibilidade reportada do estágio classificador é de aproximadamente 0,69, o que implica que cerca de 31% dos casos malignos não são sinalizados.'),

H('4.4. Avaliação da aplicação integrada', HeadingLevel.HEADING_3),

P('A ferramenta foi avaliada sobre um exame mamográfico clínico completo, adquirido em equipamento Siemens Mammomat Inspiration, com as quatro incidências convencionais em resolução de 2800 × 3518 pixels e 12 bits por amostra.'),

table([2900, 1700, 1700, 3060], [
  ['Métrica', 'Média', 'Faixa', 'Observação'],
  ['Abertura e registro do estudo', '100 ms', '91–110 ms', 'inclui leitura do cabeçalho DICOM'],
  ['Renderização da imagem', '227 ms', '208–245 ms', 'PNG com janelamento aplicado'],
  ['Inferência da cascata', '534 ms', '516–566 ms', 'CPU, cinco repetições por imagem'],
  ['Inicialização até prontidão', '810 ms', '—', 'inclui carga de 124 MB de artefatos'],
], { right: [1, 2] }),
caption('Tabela 3: Desempenho da aplicação sobre mamografias de 2800 × 3518 pixels.',
  'Dados da pesquisa (cinco repetições por imagem, execução em CPU).'),

rich('O ciclo completo de abrir, exibir e analisar uma imagem de 9,8 megapixels fecha em ',
  ['menos de um segundo', true],
  ', com folga de aproximadamente nove vezes sobre o requisito não funcional estabelecido (≤ 5 s). Observou-se ainda que a latência de inferência é praticamente independente da dimensão da imagem — 534 ms para 9,8 megapixels contra 528 ms para 0,03 megapixel —, comportamento esperado, uma vez que a cascata reamostra a entrada para dimensões fixas em ambos os estágios. O custo é determinado pelo modelo, e não pela imagem.'),

P('O consumo de memória do serviço de inferência parte de 346 MB após a inicialização, sobe para aproximadamente 1,6 GB na primeira inferência e permanece estável nesse patamar ao longo de vinte execuções sucessivas, caracterizando alocação de área de trabalho reaproveitada pelo ONNX Runtime, e não vazamento. O núcleo em Go mantém-se em 12 MB — resultado coerente com a escolha do arcabouço Wails, que utiliza a WebView nativa do sistema operacional em vez de embarcar um navegador completo. O patamar de 1,6 GB é, ainda assim, restrição de implantação a ser considerada em estações de trabalho modestas.'),

P('Quanto ao comportamento da cascata, o estágio classificador não foi acionado em nenhuma das quatro incidências, com probabilidade de malignidade estimada entre 0,004 e 0,034, resultando em categoria BI-RADS heurística 2 em todas as vistas. Nessa condição, a interface apresenta uma avaliação em nível de imagem, sem qualquer marcação sobre a mamografia, acompanhada do aviso de que a ausência de marcação não indica ausência de lesão.'),

rich('O laudo radiológico do exame conclui: ', ['achados benignos', 'i'], ', ',
  ['sem nódulos, calcificações suspeitas ou distorções arquiteturais', 'i'], ' e ',
  ['ACR BI-RADS categoria 2', 'i'],
  '. Houve, portanto, concordância entre a estimativa da ferramenta e a conclusão do radiologista nas quatro incidências.'),

Plain('Três ressalvas são indispensáveis à leitura desse resultado:', { indent: false }),
bullet('Trata-se de um único exame, de uma única paciente — não constitui evidência estatística de concordância.'),
bullet('É um caso negativo. Concordar em exame benigno não testa a sensibilidade do sistema, que é justamente sua limitação conhecida; o caso difícil, de malignidade não sinalizada pelo classificador, não foi exercitado por indisponibilidade de exame positivo.'),
bullet('A faixa BI-RADS coincide por construção do mapeamento heurístico, no qual probabilidade inferior a 0,10 corresponde à categoria 2.'),

rich('Registre-se ainda que, mesmo com o limiar do classificador reduzido a zero e o limiar de detecção reduzido a 0,005, ',
  ['o detector não emitiu nenhuma caixa nas quatro imagens', true],
  '. Esse é o comportamento desejável em exame normal — o modelo não produziu achados espúrios —, mas implica que nada pode ser afirmado, em qualquer direção, sobre sua qualidade de detecção a partir deste conjunto.'),

H('4.5. Captura de divergência para treinamento contínuo', HeadingLevel.HEADING_3),

P('O relatório de treinamento dos modelos, produzido no plano de trabalho parceiro, apresenta evidência convergente de que o desempenho do detector está limitado pela escassez de dados anotados, e não pela capacidade dos modelos. Dois sinais sustentam essa leitura: o aumento de dados offline — que apenas expande e diversifica o mesmo conjunto reduzido — melhorou consistentemente todos os modelos avaliados, em cerca de 0,035 de mAP@50; e o modelo de maior porte apresentou desempenho inferior aos menores, assinatura característica de sobreajuste em conjunto de treino pequeno. O conjunto disponível compreende apenas vistas MLO, com 1.047 imagens de treino e 1.645 caixas, sendo a classe calcificação sub-representada.'),

rich('A implicação é direta: a alavanca mais promissora para melhorar o detector é ',
  ['mais dado anotado', true], ', e não modelos de maior capacidade. É precisamente esse insumo que uma ferramenta de anotação semi-automática produz — e o dado mais valioso que ela pode gerar não é a anotação isolada, mas ',
  ['a divergência entre o que o modelo detectou e o que o radiologista validou como verdade', true], '.'),

P('Para viabilizar esse ciclo, o modelo de dados da ferramenta foi estendido de modo que toda anotação persistida registre sua proveniência. Antes desta alteração, uma anotação aceita da IA e uma desenhada do zero eram indistinguíveis no banco de dados, e o dado produzido pela ferramenta não servia para retreinamento.'),

table([2200, 3400, 3760], [
  ['Origem', 'Significado', 'Valor para retreinamento'],
  ['manual', 'Desenhada pelo radiologista', 'Anotação nova'],
  ['ai_accepted', 'Sugestão aceita sem alteração', 'Confirmação de acerto'],
  ['ai_edited', 'Sugestão corrigida pelo radiologista', 'Indica onde o modelo errou — o sinal mais informativo'],
  ['ai_rejected', 'Sugestão descartada', 'Falso positivo rotulado (exemplo negativo difícil)'],
]),
caption('Tabela 4: Proveniência registrada em cada anotação.'),

rich('Em todos os casos derivados de sugestão, ', ['a geometria originalmente proposta pelo modelo é preservada', true],
  ' junto à geometria corrigida. É esse par que constitui o sinal de treinamento: uma correção informa não apenas a localização da lesão, mas o erro cometido pelo modelo — informação que uma anotação feita do zero não carrega.'),

P('A exportação foi estendida para transportar a proveniência nos formatos JSON, CSV e MS-COCO. Uma decisão de projeto merece registro: sugestões rejeitadas não são exportadas como anotações do conjunto COCO. Incluí-las equivaleria a afirmar ao treinamento que existe lesão onde o radiologista determinou que não há, degradando exatamente o modelo que o dado deveria aprimorar. Elas são exportadas em chave própria, preservando a caixa proposta pelo modelo, de modo que um fluxo de treinamento capaz de utilizar exemplos negativos difíceis possa consumi-las deliberadamente.'),

H('4.6. Evolução das decisões de projeto', HeadingLevel.HEADING_3),

P('Duas decisões apresentadas no relatório parcial foram revistas. Registrá-las é necessário à correta interpretação deste relatório.'),

table([2600, 3200, 3560], [
  ['Aspecto', 'Relatório parcial', 'Entrega final'],
  ['Interface', 'Electron + Next.js (Nextron)', 'Wails v2 + Angular'],
  ['Inferência', 'U-Net (segmentação), TensorFlow/Keras', 'Cascata classificador + detector, ONNX Runtime'],
  ['Métrica-alvo', 'val_dice_coef (CBIS-DDSM)', 'mAP@50 / mAP@50-95 (TOMPEI-CMMD)'],
]),
caption('Tabela 5: Revisões de decisão técnica ao longo do período de execução.'),

P('A migração da interface de Electron para Wails decorre do modelo de execução: enquanto o Electron embarca um navegador completo em cada aplicação, o Wails utiliza a WebView nativa do sistema operacional. O resultado, medido nesta implementação, é um núcleo residente de 12 MB — margem de memória relevante quando o restante do sistema precisa manipular imagens médicas de alta resolução e manter dois modelos carregados.'),

P('A substituição da U-Net pela cascata corresponde a uma mudança de tarefa, e não a um abandono por insuficiência. A segmentação em nível de pixel, explorada na primeira metade do projeto, atingiu val_dice_coef de 0,5664 no CBIS-DDSM. A tarefa efetivamente requerida pela ferramenta, contudo, é a de sugerir regiões candidatas para validação — problema de detecção, avaliado por mAP —, e o plano de trabalho parceiro dispunha de modelos treinados e avaliados para essa tarefa. A adoção do ONNX Runtime, em substituição ao TensorFlow, eliminou uma dependência pesada do ambiente de execução e viabilizou tempo de inicialização inferior a um segundo.'),

// ══════════════════════════ 5. CONCLUSÃO ══════════════════════════
H('5. Conclusão', HeadingLevel.HEADING_2),

rich('O objetivo central do plano de trabalho foi cumprido: foi desenvolvida uma ferramenta de anotação semi-automática de achados radiológicos em mamografias digitais, com suporte à terminologia BI-RADS, operando integralmente offline e integrada a modelos de inteligência artificial que executam inferência real. O ciclo ',
  ['sugerir, validar e corrigir', true],
  ' — que define a natureza semi-automática da ferramenta — está implementado e verificado.'),

P('Além do objetivo declarado, o trabalho entrega um mecanismo de captura de divergência entre sugestão automática e validação especializada, com exportação em formato consumível por fluxos de treinamento. Essa contribuição responde diretamente à limitação identificada no plano de trabalho parceiro, segundo a qual o desempenho dos detectores está restrito pela escassez de dados anotados: a ferramenta constitui infraestrutura para a produção contínua desse insumo.'),

Plain('As limitações do trabalho são declaradas sem atenuação:', { indent: false }),
bullet('Não houve validação clínica com radiologistas. O protocolo de avaliação foi executado pelo próprio desenvolvedor, e as medições descrevem o comportamento do sistema, não sua acurácia diagnóstica.'),
bullet('O conjunto de avaliação compreendeu quatro imagens de um único exame, de caso negativo. A concordância observada com o laudo não constitui evidência estatística, e a sensibilidade do sistema não foi exercitada.'),
bullet('Os modelos integrados são de pesquisa e não foram validados clinicamente. A categoria BI-RADS por eles sugerida é estimativa heurística derivada de probabilidade, e não classificação validada.'),
bullet('O estágio classificador apresenta sensibilidade reportada de aproximadamente 0,69, e o detector tem desempenho reconhecidamente inferior fora do domínio em que foi treinado.'),
bullet('Persiste divergência de normalização entre o pré-processamento do modelo, que replica as condições de treino, e a exibição clínica na interface, que aplica janelamento — de modo que modelo e radiologista analisam representações distintas da mesma imagem.'),

Plain('Os trabalhos futuros imediatos, em ordem de prioridade:', { indent: false }),
bullet('Ampliar o conjunto de avaliação para no mínimo vinte exames, incluindo casos com achados positivos, e reexecutar o protocolo de medição, que é reprodutível;'),
bullet('Conduzir validação com radiologistas, medindo tempo de anotação, taxa de aceitação das sugestões e utilidade clínica percebida;'),
bullet('Analisar quantitativamente as divergências capturadas, calculando a sobreposição entre a geometria sugerida e a corrigida;'),
bullet('Realizar o retreinamento dos modelos com o conjunto de correções acumulado, fechando experimentalmente o ciclo de melhoria contínua;'),
bullet('Implementar pseudonimização do identificador de paciente na exportação, requisito para compartilhamento de conjuntos com terceiros.'),

rich('Do ponto de vista de desenvolvimento tecnológico e inovação, a contribuição do trabalho não se esgota na aplicação construída: reside no elo estabelecido entre o uso clínico da ferramenta e a melhoria dos modelos que a sustentam. ',
  ['A anotação deixa de ser apenas consumo de tempo especializado e passa a ser produção de dado de treinamento estruturado', true], '.'),

// ══════════════════════════ 6. REFERÊNCIAS ══════════════════════════
H('6. Referências', HeadingLevel.HEADING_2),
ref('AMERICAN COLLEGE OF RADIOLOGY. ACR BI-RADS Atlas: Breast Imaging Reporting and Data System. 5. ed. Reston: ACR, 2013.'),
ref('BUSLAEV, A.; IGLOVIKOV, V. I.; KHVEDCHENYA, E. et al. Albumentations: fast and flexible image augmentations. Information, [S. l.], v. 11, n. 2, p. 125, 2020.'),
ref('CUI, C.; LI, L.; CAI, H. et al. The Chinese Mammography Database (CMMD): an online mammography database with biopsy confirmed types for machine diagnosis of breast. The Cancer Imaging Archive, 2021. Disponível em: https://doi.org/10.7937/tcia.eqde-4b16. Acesso em: ago. 2026.'),
ref('LEE, R. S.; GIMENEZ, F.; HOOGI, A. et al. A curated mammography data set for use in computer-aided detection and diagnosis research. Scientific Data, [S. l.], v. 4, n. 1, p. 170177, 2017. Disponível em: https://doi.org/10.1038/sdata.2017.177. Acesso em: mar. 2026.'),
ref('NEMA. DICOM Standard. 2024. Disponível em: https://www.dicomstandard.org. Acesso em: mar. 2026.'),
ref('RICHARDSON, L.; RUBY, S. RESTful Web Services. Sebastopol: O\'Reilly Media, 2007.'),
ref('RONNEBERGER, O.; FISCHER, P.; BROX, T. U-Net: convolutional networks for biomedical image segmentation. In: INTERNATIONAL CONFERENCE ON MEDICAL IMAGE COMPUTING AND COMPUTER-ASSISTED INTERVENTION, 18., 2015, Munich. Proceedings [...]. Cham: Springer, 2015. p. 234–241.'),
ref('SHEN, L.; MARGOLIES, L. R.; ROTHSTEIN, J. H. et al. Deep learning to improve breast cancer detection on screening mammography. Scientific Reports, [S. l.], v. 9, n. 1, p. 12495, 2019. Disponível em: https://doi.org/10.1038/s41598-019-48995-4. Acesso em: ago. 2026.'),
ref('SICKLES, E. A.; D\'ORSI, C. J.; BASSETT, L. W. et al. ACR BI-RADS Mammography. In: ACR BI-RADS ATLAS: Breast Imaging Reporting and Data System. 5. ed. Reston: ACR, 2013.'),
ref('ZOU, K. H.; WARFIELD, S. K.; BHARATHA, A. et al. Statistical validation of image segmentation quality based on a spatial overlap index. Academic Radiology, [S. l.], v. 11, n. 2, p. 178–189, 2004.'),

new Paragraph({ children: [new PageBreak()] }),
H('PARTE III – RELATO DE DEMAIS ATIVIDADES', HeadingLevel.HEADING_1),
table([4400, 2600, 2360], [
  ['Descrição (Seminários, Congressos, Artigos publicados, e outros)', 'Local (Realizado ou publicado)', 'Período'],
  ['Participação no Programa PIBITI/CNPq – UFPI 2025-2026', 'UFPI – Teresina, PI', 'Set. 2025 – Ago. 2026'],
  ['Desenvolvimento cooperado com plano de iniciação científica de Micaías Carvalho Vieira (modelos de IA)', 'UFPI – Teresina, PI', 'Jun. – Ago. 2026'],
]),

vazio(), vazio(),
Plain('Teresina, ____ de ______________ de 2026.', { align: AlignmentType.CENTER }),
vazio(), vazio(),
Plain('_______________________________________', { align: AlignmentType.CENTER }),
Plain('Franciélio Evangelista dos Santos Castro — Orientando', { align: AlignmentType.CENTER }),
vazio(), vazio(),
Plain('_______________________________________', { align: AlignmentType.CENTER }),
Plain('André Castelo Branco Soares — Orientador', { align: AlignmentType.CENTER }),

    ].flat(),
  }],
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(process.argv[2], buf);
  console.log('gravado:', process.argv[2], (buf.length/1024).toFixed(0) + ' KB');
});
