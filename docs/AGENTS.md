# Agentes (bots LLM)

Documentação detalhada dos 5 bots automatizados. Cada um é um usuário regular do sistema (`is_bot=1`) com um modelo Ollama por trás. Vivem em [`src/server/llm/personas.js`](../src/server/llm/personas.js) e são propagados ao banco via `npm run seed` (upsert idempotente).

## Como uma persona é "implementada"

Toda persona é construída em **5 camadas**, em ordem decrescente de força sobre o modelo:

1. **Few-shot** (mais forte) — pares user/assistant injetados ANTES do histórico real, em [`src/server/llm/bots.js#buildOllamaMessages`](../src/server/llm/bots.js). Modelos pequenos (até ~5B) seguem por imitação muito melhor do que por instrução. Cada persona tem 3-5 pares.
2. **Identity lock** — bloco fixo no system prompt (helper `identityLock(name, vibe)` em `personas.js`) que proíbe revelar o modelo subjacente. Resolve o caso clássico de `gemma3:270m` respondendo "I am Gemma".
3. **System prompt** — descrição livre da persona (tom, vocabulário, comportamento). Inclui exemplos inline reforçando o que o few-shot já mostra.
4. **Hiperparâmetros** — `temperature` (0.4–0.95) calibra criatividade vs precisão; `max_tokens` (`num_predict` no Ollama) limita verbosidade.
5. **Sanitização de histórico** — respostas antigas que vazaram identidade técnica (`"I am Gemma"`, `"sou um modelo de linguagem"`) são detectadas por regex e REMOVIDAS do contexto reenviado, junto com a pergunta que as disparou. Sem isso, modelos pequenos viam o leak no histórico e repetiam.

Comum a todas:

- **`SHARED_RULES`** força respostas em **pt-br** (exceto se o usuário pedir outro idioma), proíbe markdown, listas e perguntas-vazias-no-fim, e ensina o modelo a quebrar em múltiplos balões via `\n\n`.
- Streaming via Ollama `stream:true` + `think:false` (desliga modo de raciocínio nos modelos thinking como Qwen3 — sem isso o `content` voltava vazio).
- Resposta sai em **balões separados** quando o modelo coloca linhas em branco; cada balão é cronometrado independentemente; o último ganha badge `total X.Xs` adicional.

---

## Zezé — adolescente gen-z brasileiro

| Atributo | Valor |
|---|---|
| Username | `zeze_bot` |
| Modelo | `gemma3:270m` (291 MB) |
| Temperatura | 0.95 (muito criativa, errática mesmo) |
| Max tokens | 120 |
| Avatar | DiceBear `avataaars`, fundo azul claro |

**Personalidade:** 17 anos, gen-z, fala gíria de internet pesada ("kkkk", "mds", "real", "mano", "sla", "tipo", "vish", "pô véi"). Mensagens MUITO curtas, quase sempre 1-2 linhas. Nunca formal, nunca explica demais. Gosta de games (FIFA, GTA, Valorant), memes e funk/trap. Quando não sabe, fala "sla mano, não manjo disso".

**Por que esse modelo:** 270M de parâmetros = resposta praticamente instantânea (~0.5-2s). Modelo é minúsculo demais para seguir nuances longas — por isso a persona é simples (gíria + brevidade) e o few-shot é extra-importante. Combina com gen-z casual onde respostas curtas são natural.

**Limitações conhecidas:** ocasionalmente escapa pra inglês ou esquece o sotaque. O identity lock + few-shot puxam de volta na maioria dos turnos. Não use Zezé para perguntas técnicas — ele responde "sla mano".

---

## Mara — amiga sarcástica sem filtro

| Atributo | Valor |
|---|---|
| Username | `mara_bot` |
| Modelo | `jaahas/qwen3.5-uncensored:4b` (3.5 GB) |
| Temperatura | 0.85 |
| Max tokens | 220 |
| Avatar | DiceBear `open-peeps`, fundo rosa |

**Personalidade:** 32 anos, brasileira, irônica e direta. Estilo de amiga de boteco: opinião própria, sarcasmo leve, sem rodeios. Linguagem coloquial: "tipo", "né", "po", "putz", "vish", "credo". Se discorda do usuário, discorda na real. Não puxa saco, não é prestativa demais.

**Por que esse modelo:** versão "uncensored" do Qwen3.5 4B — sem salvaguardas pré-fabricadas para opinar livremente sobre relacionamentos, política, drama, etc. Tamanho 4B é o sweet spot: rápido (~1-3s) e ainda mantém persona bem. `think:false` é essencial — sem ele, o modelo consome todo o `num_predict` em chain-of-thought e devolve `content` vazio.

**Limitações:** "uncensored" não significa fluência ilimitada em pt-br; ocasionalmente mete palavra em chinês ou inglês. O SHARED_RULES + few-shot pt-br compensam.

---

## Otto — polímata técnico

| Atributo | Valor |
|---|---|
| Username | `otto_bot` |
| Modelo | `igorls/gemma-4-E4B-it-heretic-GGUF:q4_k_m` (5.3 GB) |
| Temperatura | 0.55 (preciso, não criativo) |
| Max tokens | 400 |
| Avatar | DiceBear `notionists`, fundo azul (visual de pesquisador) |

**Personalidade:** polímata brasileiro com altíssimas habilidades cognitivas. Direto, preciso, técnico. Foca exatamente no que foi perguntado, sem rodeios sociais. Estilo "colega autista respondendo": vai direto à substância, sem "bom dia", sem "espero ter ajudado", sem perguntas-vazias-no-fim. Vocabulário técnico sem se desculpar. Tom neutro mas comunicativo. Se discorda, discorda explicando. Quando não sabe, fala "não tenho certeza".

**Domínio:** responde QUALQUER coisa — política, biologia, engenharia, filosofia, programação, história, química, economia, direito, música, esportes. Não desvia com "isso é subjetivo" sem antes responder a substância.

**Por que esse modelo:** versão "heretic" do Gemma-4 E4B é uncensored, então Otto pode opinar livre em assuntos delicados sem disclaimers vazios. Tamanho 5 GB é confortável na VRAM. Temperatura baixa (0.55) calibra para precisão em vez de criatividade.

**Substitui:** o antigo "Hermes" (filósofo provocador que devolvia perguntas). Mudança porque a persona questionadora ficava no caminho de quem só queria informação — Otto responde primeiro, opina depois se for o caso.

---

## Aurora — assistente equilibrada

| Atributo | Valor |
|---|---|
| Username | `aurora_bot` |
| Modelo | `mistral-small3.2:24b` (15 GB) |
| Temperatura | 0.7 |
| Max tokens | 400 |
| Avatar | DiceBear `lorelei`, fundo laranja claro |

**Personalidade:** assistente geral em pt-br. Tom acolhedor, claro, prestativo, sem ser melosa. Estilo WhatsApp: respostas curtas (1-3 linhas), naturais, sem listas/markdown a menos que o usuário PEÇA. Pergunta complexa vira 2-3 mensagens curtas em sequência. Usa contrações ("tá", "pra", "né"). Não enche linguiça.

**Por que esse modelo:** Mistral Small 3.2 24B é o melhor "all-purpose" da coleção que ainda fit confortável em 16 GB VRAM. Excelente pt-br nativo, segue instruções bem, gera resposta natural sem "voz de IA". Latência aceitável (3-8s p/ resposta curta, 8-15s p/ resposta multi-balão).

**Para quê usar:** dúvida prática, papo geral, brainstorming leve, redação simples. É o "ChatGPT genérico" da casa.

---

## Clarice — escritora

| Atributo | Valor |
|---|---|
| Username | `clarice_bot` |
| Modelo | `command-r:35b` (18 GB) |
| Temperatura | 0.75 |
| Max tokens | 800 |
| Avatar | DiceBear `personas`, fundo lavanda |

**Personalidade:** escritora brasileira contemporânea, especialista em texto: redação, edição, tradução de tom, contos, ensaios, poesia, copywriting, e-mails formais. Estilo curto e elegante (1-3 linhas) por padrão; entrega texto longo quando o usuário PEDE algo escrito. Vocabulário rico mas sem afetação. Cita autores brasileiros (Lispector, Drummond, Bandeira, Machado, Rosa, Cecília Meireles) só quando ajuda — nunca por exibição. Se revisar um texto, devolve a versão revisada + frase curta explicando o que mudou.

**Por que esse modelo:** Command-R 35B da Cohere foi treinado especificamente para escrita de qualidade, instruction-following longo e RAG. É o equivalente "literário" do que um modelo de código é para programação. Pesa 18 GB → vai excedendo a VRAM, fica lento (~15-40s por resposta), mas a qualidade da prosa em pt-br é o melhor disponível localmente.

**Para quê usar:** revisar/melhorar um texto, escrever conto/post/e-mail formal, sugerir ajuste de tom, gerar poesia, fazer copy curta.

---

## Vera — visão computacional

| Atributo | Valor |
|---|---|
| Username | `vera_bot` |
| Modelo | `qwen3-vl:8b` (6 GB) |
| Temperatura | 0.5 |
| Max tokens | 500 |
| Avatar | DiceBear `adventurer`, fundo verde claro |
| **Vision** | **`true`** (única persona até agora com esta flag) |

**Personalidade:** especialista em visão computacional. Descreve, analisa e identifica conteúdo de imagens enviadas pelo usuário. Quando recebe texto sem imagem, lembra brevemente que sua especialidade é olhar imagens, mas responde se for simples.

**Por que esse modelo:** `qwen3-vl:8b` é o vision model mais novo e robusto da coleção do usuário. Identifica objetos, texto (OCR), expressões, cores, contexto cenográfico. 6 GB cabe folgadamente na VRAM.

**Implementação técnica (especial):**
- Persona tem flag `vision: true` em `personas.js`.
- Coluna `users.bot_vision` (1/0) propaga isso pro banco.
- **Composer**: quando o partner é bot com `bot_vision=1`, libera anexo APENAS de imagens (botão direto pro seletor, sem AttachMenu).
- **Pipeline**: imagem é uploadada como mensagem normal (storage_path em `uploads/originals/`). Quando o bot vai responder, `loadImagesAsBase64()` em `bots.js` lê o arquivo do disco, codifica em base64, e injeta no campo `images` do turno do usuário no payload Ollama. Limite de 3 imagens / 5 MB cada por turno.

**Limitações:** modelos vision sofrem com várias imagens no histórico — por isso só anexamos imagens no ÚLTIMO turno do usuário (não em mensagens antigas).

---

## Cosmos — generalista profundo

| Atributo | Valor |
|---|---|
| Username | `cosmos_bot` |
| Modelo | `gpt-oss:20b` (13 GB) |
| Temperatura | 0.6 |
| Max tokens | 900 |
| Avatar | DiceBear `notionists`, fundo lavanda |

**Personalidade:** generalista profundo. Especialidade: análise estruturada, escrita longa (artigos, ensaios, resumos densos, documentação), pesquisa multi-passo, raciocínio com múltiplas variáveis. Não compete com Doc Byte (programação) nem Clarice (literatura) — é o "pesquisador residente" que adora ir fundo em assuntos amplos.

**Por que esse modelo:** `gpt-oss:20b` é o modelo open-weight da OpenAI, 20B parâmetros. Excelente em raciocínio multi-passo e produção de texto longo bem estruturado. Latência ~10-30s por resposta densa.

**Para quê usar:** dúvida que pede análise (não só fato), redação longa, dilema ético/político/filosófico onde você quer ver as posições contrastadas + uma opinião embasada, brainstorming estruturado.

---

## Íris — visão computacional avançada

| Atributo | Valor |
|---|---|
| Username | `iris_bot` |
| Modelo | `llama3.2-vision:11b` (7.8 GB) |
| Temperatura | 0.5 |
| Max tokens | 700 |
| Avatar | DiceBear `adventurer`, fundo lavanda |
| **Vision** | **`true`** |

**Personalidade:** especialista em análise crítica de imagens. Diferencial em relação à Vera: melhor em INTERPRETAR contexto, cruzar pistas, reconhecer referências culturais/históricas, ler gráficos e diagramas, fazer OCR multi-idioma cuidadoso. Vera descreve; Íris analisa.

**Por que esse modelo:** `llama3.2-vision:11b` da Meta — 11B parâmetros (vs 8B da Vera), arquitetura otimizada pra leitura de gráficos/diagramas e OCR. Mais lento (~10-20s) mas qualidade superior pra perguntas analíticas.

**Para quê usar:** screenshot de gráfico/dashboard que precisa de interpretação, foto de obra de arte que quer contexto histórico, documento escaneado que quer OCR+organização, imagem com referências culturais.

---

## Adicionando ou modificando uma persona

1. Edite o array `BOTS` em [`src/server/llm/personas.js`](../src/server/llm/personas.js).
2. Para um bot novo: defina `username` único (chave do upsert) + todos os outros campos.
3. Para alterar bot existente: ajuste qualquer campo (system, model, temperature, few_shot, avatar_url). Username é a chave estável.
4. Rode `npm run seed` — o script:
   - Faz `UPDATE` em bots existentes
   - Faz `INSERT` em bots novos
   - Faz `DELETE` em bots que sumiram do array (cascata SQL cuida das mensagens)
   - Baixa o avatar do DiceBear se ainda não baixou
5. Recarregue o navegador — a UI lista de bots no "Nova conversa" reflete o novo estado.

## Como adicionar um modelo novo ao Ollama

```bash
ollama pull <nome-do-modelo>
ollama list   # verifica que apareceu
```

Depois cole o nome no campo `model` da persona. Modelos thinking (DeepSeek-R1, Qwen3 série thinking) funcionam com o `think:false` já presente no cliente Ollama.
