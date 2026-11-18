# Atendimento e pós-venda — Popê Beauty

## Escopo

O atendimento é um **registro administrativo de solicitações**, não uma
plataforma automática de estorno ou de contratação de logística reversa.

- Clientes autenticados: **Minha conta → Atendimento** (`/conta/atendimento`).
  Podem informar motivo, assunto, descrição e associar o pedido ao registro.
  A área mostra status, descrição enviada e respostas da equipe.
- A página **Detalhes do pedido** abre o atendimento com o pedido selecionado.
  O pedido deve pertencer à conta logada.
- Administradores: **Vendas e clientes → Atendimento e pós-venda**
  (`/admin/atendimento`). Podem filtrar, pesquisar, registrar respostas e
  atualizar o status. A sidebar exibe a quantidade pendente.

## Situações

| Código | Situação para o cliente |
|---|---|
| `open` | Recebida |
| `in_review` | Em análise |
| `resolved` | Respondida |
| `closed` | Encerrada |

Para encerrar ou concluir, a equipe deve escrever uma resposta de ao menos
dez caracteres. A resposta fica visível para o titular da solicitação.

## Segurança

Aplicar as migrações `supabase/customer_service_requests_v1.sql` e depois
`supabase/customer_service_performance_v1.sql` antes de
publicar os componentes. A tabela `customer_service_requests` usa RLS:

- O cliente lê apenas solicitações próprias e só pode inserir com
  `user_id=auth.uid()`.
- Se o formulário indicar um pedido, a política SQL confirma que o pedido
  pertence ao usuário autenticado.
- Somente administradores podem alterar **status** e **admin_note**;
  os campos de identidade, pedido e descrição são imutáveis após envio.
- O banco limita a três solicitações por cliente a cada hora, com bloqueio
  por transação para minimizar envios simultâneos.
- Não existe permissão de leitura ou gravação anônima.
- O módulo não guarda credenciais, dados completos de cartão nem imagens.

## Integrações ainda não ativadas

Esta fase **não** efetua devolução física, emissão de etiqueta reversa,
cancelamento de NF-e, compensação de estoque, crédito ou estorno de pagamento.
A conclusão manual de um atendimento **não significa** que um reembolso foi
executado. Futuras integrações deverão exigir conferência do pedido,
autorização da equipe, auditoria, regras fiscais e confirmação externa.

Ainda precisam ser implementados: mensagens em formato de conversa,
notificações por e-mail, arquivos de evidências (com política de privacidade),
prazos operacionais e integração de logística reversa.

## Validação

Executar `npm run test`, `npm run typecheck` e `npm run build`.
O teste `tests/after-sales-service.test.mjs` confere políticas e isolamento
do fluxo; o teste de sidebar passa a esperar 30 destinos.


## Conversas bidirecionais — evolução

A central agora possui um histórico de mensagens por solicitação.

- No cliente, abra `/conta/atendimento`, escolha um chamado e clique em
  **Abrir conversa e responder**.
- Na administração, abra **Vendas e clientes → Atendimento e pós-venda**,
  escolha a solicitação e clique em **Abrir conversa**.
- As mensagens mostram autoria (cliente/equipe), conteúdo e data da criação.
- Mensagens de clientes em chamados **respondidos** reabrem o status para
  **Recebida**, trazendo o chamado de volta para a fila.
- A equipe registra respostas de 10 a 1.200 caracteres; o chamado passa a
  **Respondida**. O cliente pode escrever mensagens de 5 a 2.000 caracteres.
- Chamados **encerrados** não recebem mensagens. O administrador pode revisar
  ou reabrir a situação pelo controle de status existente.
- A interface mostra até as 100 mensagens mais recentes em cada chamado,
  sinalizando quando mensagens antigas ficaram fora da visualização.

### Requisitos de banco e segurança

Aplique `supabase/customer_service_conversations_v1.sql` **depois** de
`customer_service_requests_v1.sql` e
`customer_service_performance_v1.sql`.

A tabela `public.customer_service_messages` tem RLS para leitura somente
do cliente titular ou da equipe administrativa. O envio é realizado pela RPC
`public.post_service_message`, que determina a identidade do remetente a
partir da sessão autenticada, bloqueia usuários anônimos e valida titularidade,
estado do chamado e mensagem. A RPC serializa os envios de cada conta e limita
a **12 mensagens por hora por remetente**. O navegador não tem permissão SQL
para inserir, editar ou excluir diretamente mensagens. Nenhuma RPC de
mensagens gera pagamentos, devoluções ou operações fiscais.

O campo `admin_note` legado é preservado para compatibilidade: a resposta da
equipe também atualiza a última nota do atendimento. O componente evita
exibir a resposta duplicada no histórico.

### Validação

`tests/customer-service-conversations.test.mjs` testa regras de tamanho,
estados permitidos, isolamento da camada SQL e páginas protegidas. Executar
`npm run check:ci` antes da publicação.
