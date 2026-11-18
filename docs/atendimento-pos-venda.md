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

Aplicar a migração `supabase/customer_service_requests_v1.sql` antes de
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
