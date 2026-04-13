# Flyhub AI - Estrutura atual

## Raiz
- package.json
- pnpm-lock.yaml
- pnpm-workspace.yaml

## apps
### web
- app/
  - dashboard/
    - page.tsx
- components/
  - dashboard/
    - ConversationList.tsx
    - ChatWindow.tsx
    - LeadSidebar.tsx
    - MessageBubble.tsx
    - ChatComposer.tsx
- mock/
  - conversations.ts
  - messages.ts
  - lead.ts

### api
- vazio por enquanto

## packages
### shared
- vazio por enquanto

## docs
- vazio por enquanto

## infra
- vazio por enquanto

Perfeito. Abaixo está a versão final do schema.prisma, já lapidada para:

multi-tenant isolado
múltiplos números de WhatsApp por tenant
modo manual / IA
corretor responsável pela conversa
histórico de transferências
mensagens inbound / outbound
idempotência de webhook
deduplicação melhor de mensagem externa
base para mídia, transcrição e integração com FlyImob depois

WhatsApp entrando mensagens sendo persistidas corretamente áudio pelo menos armazenado e transcrito conversa vinculada ao lead certo tenant isolado corretamente integração mínima com FlyImob modo manual e IA funcionando liso ---- não duplicar lead não perder mensagem não misturar tenant não inventar condição não pular etapa saber quando parar saber quando escalar registrar tudo direito --- Dia 1 webhook do WhatsApp normalização de payload create/find contact e conversation persistência inbound Dia 2 outbound funcionando bem idempotência status básicos conversa consistente no painel Dia 3 mídia: áudio, imagem, documento upload/armazenamento S3 metadados corretos Dia 4 transcrição assíncrona exibição limpa no front tratamento de falha e retry Dia 5 integração FlyHub → FlyImob criação/vinculação de lead external ids deduplicação por tenant Dia 6 módulo ai context builder prompt base regras e guardrails tool registry inicial Dia 7 IA em escopo controlado campanha → agente tenant → regras fallback humano testes de ponta a ponta Dia 8 polimento correção dos casos quebrados testes reais ajustes de fluxo
🧠 2. Seu sistema já é “profissional”?
✔️ Sim — mas com um detalhe importante:

Você tem um core sólido, mas ainda não um sistema completo de produção

💪 O que já é nível profissional
UX fluida (não carrega tudo de uma vez)
scroll preparado estilo WhatsApp
arquitetura limpa (API separada)
estado consistente no frontend
pronto pra escalar mensagens
preparado pra IA

👉 Isso aqui já dá pra vender como produto, sem vergonha.

⚠️ 3. O que ainda falta na FUNDAÇÃO (importante)

Aqui é onde pouca gente te fala — vou te dar o mapa real:

🧱 1. Tempo real (CRÍTICO)

Hoje você usa polling:

setInterval(..., 4000)

👉 Isso é provisório

O ideal:
WebSocket (ou SSE)
ou polling inteligente (só novas mensagens)

📌 Sem isso:

atraso de mensagens
UX inferior ao WhatsApp real
🧱 2. Direção da mensagem (IMPORTANTÍSSIMO)

Você ainda não falou disso explicitamente, mas precisa garantir no backend:

direction: 'inbound' | 'outbound'

👉 Isso é base para:

UI correta (lado esquerdo/direito)
lógica de janela
métricas
🧱 3. Persistência de mídia (S3)

Hoje você tem:

mediaUrl

Mas ainda não tem:

upload real
storage
preview

👉 Isso vai virar gargalo rápido

🧱 4. Reconciliação com provider (WhatsApp)

Você ainda vai precisar:

salvar providerMessageId
atualizar status (sent, delivered, read)

👉 Isso é o que transforma:

chat simples → sistema profissional

🧱 5. Lock de concorrência (nível avançado)

Quando escalar:

2 agentes respondendo
IA + humano ao mesmo tempo

👉 precisa controlar:

quem está atendendo
evitar conflito
🧱 6. Retry / fila (nível SaaS)

Se o WhatsApp cair:

você perde mensagem hoje

👉 precisa depois:

fila (ex: BullMQ)
retry automático
🔥 Resumo honesto da fundação
Área	Status
Estrutura de chat	✅ Forte
UX básica	✅ Boa
Escalabilidade de mensagens	✅ OK
WhatsApp-ready	✅ Sim
Tempo real	⚠️ Falta
Mídia	⚠️ Falta
Status delivery	⚠️ Falta
Robustez (fila/retry)	❌ Ainda não

A hierarquia vai mexer em quais arquivos

Quando a gente fizer isso, provavelmente mexe em:

schema.prisma
seed.ts
apps/api/src/routes/conversations.ts
apps/api/src/routes/messages.ts
apps/web/lib/api.ts
apps/web/app/dashboard/page.tsx

E talvez criar:

apps/api/src/lib/permissions.ts


nova etapa: 

Estou desenvolvendo um sistema chamado FlyHub AI em monorepo com:

- apps/api → Fastify + Prisma
- apps/web → Next.js App Router
- packages/shared → tipos compartilhados

Quero que você continue EXATAMENTE de uma etapa já avançada do projeto, sem voltar para o começo.

## Estado atual do projeto

### Banco / Prisma
O schema atual já está evoluído e inclui, entre outras coisas:

- Tenant
- PhoneNumber
- User
- Contact
- Conversation
- Message
- Assignment
- WebhookEvent

A Conversation já tem:
- assignedUserId
- mode
- status
- lastInboundAt
- lastOutboundAt
- lastMessageAt

A Message já tem:
- direction
- status
- provider
- senderUserId
- external ids
- campos para mídia/transcrição futura

### Backend já implementado
Já existem rotas funcionando em Fastify para:

- GET /api/conversations
- GET /api/conversations/:id/messages
- GET /api/conversations/:id/lead
- PATCH /api/conversations/:id/mode
- PATCH /api/conversations/:id/assign
- POST /api/messages
- GET /api/realtime (SSE)

### Realtime
Já implementamos SSE no backend com:
- apps/api/src/lib/realtime.ts
- apps/api/src/routes/realtime.ts

O backend já publica eventos em tempo real:
- `message:new`
- `conversation:mode_changed`
- `conversation:assigned`

O SSE já foi testado diretamente no navegador e funciona, mostrando:
- `connected`
- `heartbeat`

### Frontend já implementado
Já existe:
- dashboard com lista de conversas
- chat window
- lead sidebar
- message bubble
- composer
- paginação de mensagens
- SSE no frontend
- troca manual / IA no header
- exibição de responsável e linha da operação

### Tipos compartilhados
Já foram atualizados para refletir:
- conversation mode/status
- assignedUser
- phoneNumber
- message direction/status/senderUser

## Situação atual exata
O dashboard já abriu corretamente e já mostra:
- conversa seed
- mensagens seed
- lead seed
- toggle manual / IA

Então:
- backend está respondendo
- tenant correto no frontend está ok
- seed já entrou
- realtime base já está viva
- dashboard já saiu do estado “Carregando...”

## Bug atual principal
Quando tento enviar uma mensagem pelo composer, ela NÃO envia.

A UI mostra erro do tipo:
- “Não foi possível enviar a mensagem. Tente novamente.”

Mas ainda não diagnosticamos a causa exata.

## Suspeita mais forte do bug atual
Provavelmente está em um destes pontos:

1. `NEXT_PUBLIC_CURRENT_USER_ID` pode não estar batendo com o user criado no seed
2. `POST /api/messages` pode estar bloqueando por regra de negócio:
   - conversation.mode !== MANUAL
   - conversation.status === CLOSED
   - janela de 24h fechada
   - senderUserId não encontrado
   - conversation assigned para outro usuário
3. `ChatComposer` pode estar recebendo erro genérico mas sem exibir o detalhe real
4. `page.tsx` / `api.ts` pode estar mascarando a resposta do backend

## Etapa atual do projeto
Estamos nesta etapa:

### FUNDação já pronta / quase pronta
- schema bom
- seed bom
- backend base bom
- dashboard funcional
- realtime base funcionando
- paginação do histórico funcionando

### FALTA resolver agora
1. corrigir envio de mensagem
2. validar realtime completo após envio
3. testar troca de modo e assign em duas abas
4. só depois decidir próximo grande bloco

## O que quero que você faça nesta nova conversa

### Primeiro objetivo
Diagnosticar e corrigir o bug do envio de mensagem.

### Estratégia
Quero que você peça primeiro os arquivos certos para isso, sem me fazer voltar desnecessariamente.

Peça nesta ordem:

1. `apps/web/.env.local` (ou pelo menos os valores relevantes, sem vazar segredo se não precisar)
2. `apps/web/lib/api.ts`
3. `apps/web/app/dashboard/page.tsx`
4. `apps/web/components/dashboard/ChatComposer.tsx`
5. `apps/api/src/routes/messages.ts`

Depois de analisar, quero que você:
- descubra exatamente por que o envio está falhando
- me devolva os arquivos completos que precisarem mudar
- mantenha o estilo atual do projeto
- faça mudanças mínimas e limpas
- sem quebrar o que já funciona

## Próximas etapas futuras depois de corrigir o envio
Depois que o envio estiver funcionando, a sequência planejada é:

1. testar realtime completo em duas abas
   - `message:new`
   - `conversation:mode_changed`
   - `conversation:assigned`

2. decidir o próximo grande bloco entre:
   - hierarquia/autorização
   - WhatsApp sandbox webhook inbound
   - mídia/S3/transcrição

## Entendimento de arquitetura para o futuro
Quero que você preserve a visão de produto:

- multi-tenant
- responsável por conversa
- supervisor pode ver várias conversas
- corretor pode ver só as dele depois
- WhatsApp é apenas um canal, a base deve servir também para webchat futuro
- essa base poderá ser reutilizada em outros produtos, não só imobiliário

## Observações importantes
- Não volte para refatorações amplas desnecessárias
- Não mexa em schema agora, a menos que seja absolutamente inevitável
- Priorize resolver o bug do envio
- Depois mantenha o sistema redondo e incremental

Comece pedindo os arquivos exatos dessa etapa.

Sim — agora faz sentido mexer no schema antes da API do WhatsApp.

Você chegou no ponto em que vale consolidar a base, porque as próximas coisas são estruturais:

multi-canal (whatsapp, webchat, etc.)
visibilidade por usuário
fila/roteamento
atribuição automática
timeout de atendimento
gerente vendo várias conversas
corretor vendo só as dele

Se vocês entrarem no WhatsApp antes disso, depois vão refatorar em cima de integração real. Melhor fechar a fundação agora.

O que vale implementar agora

Eu dividiria em 4 blocos.

1. Canal da conversa

Hoje sua conversa ainda está com cara de “quase WhatsApp”.
Você precisa deixar explícito:

channel: WHATSAPP | WEBCHAT
talvez channelIdentity ou externalThreadId
talvez webchatSessionId depois
manter phoneNumberId opcional para nem toda conversa depender de número

Isso destrava:

WhatsApp real
chat embutido em site
múltiplos canais no mesmo dashboard
2. Papéis e visibilidade de usuário

Você já tem User, mas agora precisa modelar melhor:

role: ADMIN | MANAGER | AGENT
talvez canUseAI, canViewAllConversations depois, mas isso pode esperar
regra de acesso:
ADMIN vê tudo do tenant
MANAGER vê tudo ou por equipe
AGENT vê só atribuídas a ele
3. Atribuição e fila

Você já tem assignedUserId, o que é ótimo.
Agora vale acrescentar o raciocínio de distribuição:

status de atendimento
timestamps para SLA
fila / prioridade
timeout para reatribuição

Campos úteis na Conversation:

assignedAt
lastAssignedAt
firstResponseAt
waitingSince
priority
talvez queueName
talvez slaDeadlineAt

E uma tabela de eventos de atribuição / histórico também é excelente depois.

4. Preparar automação de roleta

Para “se não atender em x minutos passa pra outro”, você vai precisar de duas coisas:

dados no banco
um worker/regra no backend

Não precisa criar o worker completo agora, mas já vale preparar:

assignedUserId
assignedAt
firstResponseAt
status
mode
talvez assignmentStrategy
Vale acrescentar isso agora?

Sim.
Esse é exatamente o momento.

Porque os próximos blocos dependem disso:

webhook inbound do WhatsApp
widget webchat
supervisão
distribuição automática
fila de atendimento
Em quais arquivos vamos mexer

Se formos fazer isso do jeito certo, vamos mexer em camadas.

1. Banco / Prisma

Arquivos quase certos:

apps/api/prisma/schema.prisma
apps/api/prisma/seed.ts

Talvez também:

nova migration gerada pelo Prisma

Aqui entram:

enum de canal
enum de role
novos campos da conversation
ajustes em phoneNumber
talvez tabela de fila/histórico, se decidirmos já criar
2. Tipos compartilhados

Arquivos:

packages/shared/src/conversation.ts
packages/shared/src/chat.ts
packages/shared/src/index.ts
possivelmente packages/shared/src/lead.ts

Aqui você propaga:

channel
role
novos status/campos
estrutura de usuário atribuível
3. Backend: regras e listagem

Arquivos certos:

apps/api/src/routes/conversations.ts
apps/api/src/routes/messages.ts
apps/api/src/app.ts

E provavelmente criar:

apps/api/src/lib/permissions.ts
apps/api/src/lib/routing.ts ou assignment.ts
talvez apps/api/src/routes/webchat.ts
talvez apps/api/src/routes/channels.ts depois
O que muda aqui
filtro por usuário logado
admin/manager/agent
validação por canal
regra da janela 24h só para WhatsApp
listagem de conversas respeitando permissão
envio de mensagem respeitando canal
4. Frontend dashboard

Arquivos quase certos:

apps/web/lib/api.ts
apps/web/app/dashboard/page.tsx
apps/web/components/dashboard/ConversationList.tsx
apps/web/components/dashboard/ChatWindow.tsx
apps/web/components/dashboard/LeadSidebar.tsx

Talvez também:

componentes de badge de canal
filtro “Minhas conversas / Todas / Não atribuídas”
indicação visual de responsável
timer/SLA depois
O que muda aqui
mandar currentUserId de forma coerente
filtrar conversas visíveis
mostrar canal da conversa
mostrar responsável
preparar UI para fila/roleta
O que eu sugiro implementar agora, em ordem
Fase A — fundação estrutural

Agora mesmo:

Conversation.channel
User.role
campos mínimos de atribuição/SLA
phoneNumberId opcional, se necessário
filtros por usuário no backend
Fase B — fechar autorização básica

Depois:

AGENT só vê as atribuídas
MANAGER vê mais que o agente
ADMIN vê tudo
Fase C — multi-canal real

Depois:

WhatsApp inbound/outbound
Webchat inbound/outbound
Fase D — automação de fila

Depois:

redistribuição automática
timeout sem resposta
round-robin
prioridade
Minha recomendação prática

Antes da API do WhatsApp, eu faria agora este pacote:

pacote mínimo ideal
adicionar channel na Conversation
adicionar role no User
adicionar assignedAt, firstResponseAt, waitingSince
adaptar conversations.ts para listar conforme o papel do usuário
adaptar messages.ts para aplicar regra de 24h só se channel === WHATSAPP
atualizar tipos compartilhados
atualizar seed com:
1 admin
1 manager
2 agents
conversas de canais diferentes

Isso já deixa a base pronta para:

múltiplos atendentes
dashboard segmentado
WhatsApp sem contaminar o resto
webchat futuro
Os arquivos que eu pediria agora

Para eu te devolver o plano e depois os arquivos já prontos, me manda estes primeiro:

apps/api/prisma/schema.prisma
apps/api/prisma/seed.ts
packages/shared/src/conversation.ts
packages/shared/src/chat.ts
apps/api/src/routes/conversations.ts

Se quiser já acelerar de vez, manda também:
6. packages/shared/src/index.ts
7. apps/api/src/routes/messages.ts

Com isso eu consigo te montar:

a nova modelagem
exatamente o que alterar
e a lista completa de arquivos que vão mudar nessa rodada.

comandos: pnpm --filter api prisma db seed
comandos: pnpm --filter web dev
comandos: pnpm --filter api dev
comandos: http://localhost:3333/api/conversations?tenantId=seed-tenant-operacao-brasilia
