# Popê Beauty 💖

> Plataforma de e-commerce de beleza, maquiagem e catálogo reservado +18, desenvolvida com **Next.js, React, TypeScript, Supabase e Vercel**.  
> **Situação: aplicação publicada, mas NÃO liberada para vendas online reais.**  
> **Documentação revisada em:** 11/11/2026 · **Ambiente:** [Popê Beauty](https://e-commerce-pope-beauty.vercel.app) · **Branch de publicação:** `main`.

Este é o **documento principal do projeto**. Reúne recursos, URLs, arquitetura, tabelas, regras de negócio, configuração, homologação, segurança, limitações, operações e próximos passos. A implementação em código e no banco é a fonte de verdade quando existir divergência; nunca habilite recursos de produção somente com base na presença de uma tela.

## 1. Visão geral e status

### 1.1. Painel executivo

| Área | Situação em 11/11/2026 | Observações |
| --- | --- | --- |
| Hospedagem e build | ✅ Publicado, último deploy consultado: `READY` | Site em Vercel, Next.js 16 |
| Vitrine e produtos | ✅ Funcional | Produtos ilustrativos podem aparecer; não são ofertas reais |
| Supabase Auth e contas | ✅ Implementados | Confirmar SMTP, recuperação e URLs de redirecionamento em ambiente real |
| Administração e sidebar | ✅ Implementadas | Acesso restrito a `admin`; `staff` não administra |
| Produtos, variações, fotos e estoque | ✅ Funcional | Lotes, validade, saldo reservado, movimentações e auditoria |
| Catálogo +18 | ⚠️ Restrito | Imagens privadas; maioridade exige verificação independente |
| Endereços, CEP e máscaras | ✅ Implementados | ViaCEP → BrasilAPI; máscara de CEP/telefone, componentes CPF/CNPJ |
| Carrinho e revisão de preços | ✅ Prévia | Preços e estoque revistos no banco; carrinho no navegador |
| Reservas de checkout | 🧪 Só administrador | Reserva de 15 minutos com expiração por Supabase Cron |
| Checkout público/compra real | ❌ Bloqueado | Não ativar antes de frete, pagamentos e condições comerciais |
| Gateways de pagamento | 🧪 Catálogo com 10 provedores | Nenhum selecionado para produção |
| Mercado Pago Checkout Pro | 🧪 Código TEST preparado | Geração bloqueada sem conta TEST validada e autorização explícita |
| Webhook Mercado Pago | 🧪 Código TEST preparado | HMAC, consulta à API, deduplicação e auditoria; **não dá baixa** |
| Frete Melhor Envio | 🧪 Cálculo sandbox preparado | Sem token, CEP de origem e dimensões, não há cotações |
| E-mails de pedidos | ⚠️ Fila e templates prontos | Envio SMTP não operacional sem `SMTP_PASSWORD` |
| Shopee / Mercado Livre | ⚠️ Vínculos cadastrais | OAuth, pedidos e estoque automáticos não implementados |
| Emissão fiscal, políticas e checkout comercial | ❌ Pendentes | Necessários antes da abertura ao público |

### 1.2. Estado observado no banco e na infraestrutura

Consulta realizada em 11/11/2026:

- **1 produto comum ativo** e **1 produto adulto ativo** no banco; a existência de produto adulto ativo não equivale à disponibilidade pública dessa seção.
- **2 variações (SKUs)** cadastradas; **0 especificações de embalagem/peso** preenchidas.
- **CEP de origem do frete ausente**.
- **0 candidatos de gateway** selecionados para homologação.
- **0 preparações de pagamento** e **0 eventos de webhook** registrados.
- `store_settings.checkout_reservations_enabled = false`.
- Supabase Cron `pope-checkout-expiry-every-minute` com programação `* * * * *` e `active=true`.
- Variáveis de ambiente verificadas na Vercel: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` e `SMTP_FROM_EMAIL`.
- **Não estavam cadastradas** `SMTP_PASSWORD`, `MP_TEST_ACCESS_TOKEN`, `MP_TEST_SELLER_ID`, `MP_TEST_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` ou `MELHOR_ENVIO_SANDBOX_TOKEN`. As chaves de ativação TEST também não constavam.

> Estes números representam um **retrato de 11/11/2026**, não um monitor em tempo real. As credenciais jamais devem ser copiadas para esta documentação.

## 2. Repositório, stack e arquitetura

- **Repositório:** [MichaelPriest/E-commerce-Pop-Beauty](https://github.com/MichaelPriest/E-commerce-Pop-Beauty)
- **Produção:** https://e-commerce-pope-beauty.vercel.app
- **Next.js:** 16.4.6, App Router e Functions `src/app/api`.
- **React/React DOM:** 19.3.1.
- **TypeScript:** 5.9.3.
- **Banco/Auth/Storage:** Supabase PostgreSQL + Supabase Auth + RLS.
- **Bibliotecas:** `@supabase/ssr@0.12.7`, `@supabase/supabase-js@2.119.0`, `lucide-react@1.71.0`, `nodemailer@10.5.0` e `react-imask@7.6.1`.
- **Hospedagem:** Vercel (deploy associado a `main`).
- **Provedores externos preparados:** ViaCEP, BrasilAPI, Melhor Envio sandbox e gateways em comparação.

### 2.1. Fluxos principais

```text
CLIENTE / VISITANTE
  Vitrine → Produto → Carrinho (localStorage)
                     ↓
              /checkout (prévia)
                     ↓
       RPC preview_checkout_cart
         preço, produto, variantes,
            lotes e estoque
                     ↓
  Visitante/cliente: compra BLOQUEADA
  Administrador: endereço → reserva TEST de 15 min
                     ↓
                 orders (store_api)
                     ↓
          sandbox_payment_attempts
                     ↓
       Mercado Pago TEST (se habilitado)
                     ↓
    Webhook assinado + consulta ao provedor
                     ↓
         payment_webhook_receipts
     (auditoria, NÃO confirma pagamento)

ADMINISTRAÇÃO
  Cadastro de produtos → SKUs → lotes → estoque
  Pedidos manuais → operações/expedição → e-mails em fila
  Gateways e Frete → configuração/simulações sandbox
  Usuários → permissões → auditoria
```

### 2.2. Estrutura do repositório

```text
src/
  app/
    admin/           Painel, catálogo, usuários, pedidos, relatórios,
                     logística, frete, gateways, pagamentos e auditoria
    api/             Checkout, integrações e webhooks protegidos
    conta/           Minha conta, endereços e reservas
    carrinho/        Carrinho local
    checkout/        Conferência e reserva TEST
    entrar/          Autenticação
    esqueci-senha/   Recuperação
    redefinir-senha/ Troca de senha
    adulto/          Fluxo público restrito da seção +18
  components/        Sidebar, componentes de formulários e checkout
  hooks/             Consulta automática de CEP
  lib/               Serviços, clientes Supabase, gateways, segurança
  types/             Tipos de domínio
supabase/
  *.sql              Esquemas, migrations e endurecimento de segurança
  email-templates/   Templates e assuntos do Supabase Auth
emails/pedidos/      Cinco e-mails transacionais de pedidos
public/              Logo e favicon
```

## 3. Desenvolvimento local e deploy

### 3.1. Pré-requisitos

- Node.js compatível com Next.js 16 (recomendado Node 22).
- npm.
- Projeto Supabase dedicado, já estruturado com as migrations.
- Variáveis públicas de conexão configuradas.
- Ambiente de teste separado para integrações externas.

### 3.2. Comandos

```bash
npm ci
cp .env.example .env.local
npm run dev
npm run typecheck
npm run build
npm run start
```

`npm run dev` atende localmente em `http://localhost:3000`.  
`npm run typecheck` executa `tsc --noEmit`.  
`npm run build` compila o Next.js.  
`npm run start` inicia o build de produção.

**Dependências reproduzíveis:** `package-lock.json` versão 3 está versionado; usar `npm ci` em CI e instalações limpas. Para atualizar bibliotecas, alterar `package.json` e o lockfile juntos, em PR separado, executar testes e revisar diferenças de dependências.

### 3.3. Supabase Auth: URLs

Na configuração de autenticação do projeto Supabase:

- Site URL: `https://e-commerce-pope-beauty.vercel.app`.
- Redirect de confirmação: `https://e-commerce-pope-beauty.vercel.app/auth/callback`.
- Redirect de recuperação: `https://e-commerce-pope-beauty.vercel.app/auth/callback?next=/redefinir-senha`.
- Se necessário em desenvolvimento: `http://localhost:3000/auth/callback` e `http://localhost:3000/auth/callback?next=/redefinir-senha`.

Fluxo: `/entrar` → `/esqueci-senha` → callback Auth (PKCE/OTP, conforme template) → `/redefinir-senha`.

As regras de senha do frontend exigem complexidade e 12+ caracteres, mas **as políticas do Supabase Auth devem ser configuradas no servidor**. Verificar também a proteção de senha vazada nas recomendações de segurança do projeto.

### 3.4. Vercel

1. Conectar o GitHub e importar o projeto com framework Next.js.
2. Confirmar branch de produção `main` e domínio definitivo.
3. Cadastrar variáveis em **Project → Settings → Environment Variables** com escopo apropriado.
4. Após alteração de variáveis de ambiente, publicar novamente para atualizar as Functions.
5. Verificar build, rotas serverless, logs e fluxos em contas de teste.

**Não usar** `NEXT_PUBLIC_` para tokens secretos, senhas, chaves de serviço ou certificados. Não criar documentação contendo valores secretos.

## 4. Variáveis de ambiente

A lista abaixo contém **somente nomes/valores de habilitação**, nunca credenciais reais. `Sensível` = configurar como secret/sensitive no servidor da Vercel.

| Variável | Uso | Tipo / situação |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase | Pública; configurada |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Chave publicável do Supabase | Pública; configurada |
| `SUPABASE_SERVICE_ROLE_KEY` | Gravação da auditoria de webhooks após verificação | **Sensível; ausente** em 11/11 |
| `SMTP_HOST` | Servidor SMTP dos pedidos | Servidor; configurada |
| `SMTP_PORT` | Porta SMTP | Servidor; configurada |
| `SMTP_USER` | Usuário SMTP | Servidor; configurada |
| `SMTP_FROM_EMAIL` | Remetente dos pedidos | Servidor; configurada |
| `SMTP_PASSWORD` | Senha de aplicativo ou credencial SMTP | **Sensível; ausente** em 11/11 |
| `MELHOR_ENVIO_SANDBOX_TOKEN` | Cotação de frete em homologação | **Sensível; ausente** |
| `MP_TEST_ACCESS_TOKEN` | Credencial do vendedor de testes Mercado Pago | **Sensível; ausente** |
| `MP_TEST_SELLER_ID` | ID numérico do vendedor TEST | Configuração de teste; ausente |
| `MP_TEST_PREFERENCE_CREATION_ENABLED` | Liberação explícita da geração de preferências TEST | Ausente; valor permitido: `verified-test-account-only` |
| `MP_TEST_WEBHOOK_SECRET` | HMAC das notificações Mercado Pago TEST | **Sensível; ausente** |
| `MP_TEST_WEBHOOK_ENABLED` | Liberação explícita do webhook TEST | Ausente; valor permitido: `verified-test-account-only` |

### 4.1. Variáveis de gateways opcionais para avaliação

| Provedor | Nomes |
| --- | --- |
| Mercado Pago | `MP_TEST_ACCESS_TOKEN` |
| PagBank | `PAGBANK_SANDBOX_TOKEN` |
| Pagar.me | `PAGARME_TEST_SECRET_KEY` |
| Asaas | `ASAAS_SANDBOX_API_KEY` |
| Stripe | `STRIPE_TEST_SECRET_KEY` |
| Efí Bank | `EFI_SANDBOX_CLIENT_ID`, `EFI_SANDBOX_CLIENT_SECRET`, `EFI_SANDBOX_CERT_BASE64` |
| PayPal | `PAYPAL_SANDBOX_CLIENT_ID`, `PAYPAL_SANDBOX_CLIENT_SECRET` |
| Cielo | `CIELO_SANDBOX_MERCHANT_ID`, `CIELO_SANDBOX_MERCHANT_KEY` |
| Iugu | `IUGU_TEST_API_TOKEN` |
| InfinitePay | Sem variáveis de sandbox; **não chamar a API durante testes sem proteção apropriada** |

As variáveis opcionais habilitam apenas verificações que o código implementa. **Presença de variável não garante autorização, conectividade ou homologação.**

## 5. Mapa de telas e funcionalidades

### 5.1. Vitrine, conta e checkout

| Caminho | Função |
| --- | --- |
| `/` | Vitrine, categorias, destaques e busca |
| `/produto/[slug]` | Detalhes de produtos comuns |
| `/carrinho` | Carrinho local com quantidades e link para conferência |
| `/checkout` | Validação de preços/estoque; reserva TEST somente para admin |
| `/entrar` | Cadastro/login Supabase |
| `/esqueci-senha` | Solicitação de redefinição de senha |
| `/redefinir-senha` | Nova senha a partir do fluxo Auth |
| `/conta` | Dados e histórico do titular, inclusive cancelamento de reserva TEST |
| `/conta/enderecos` | Endereços do titular, endereço principal, busca de CEP |
| `/adulto` | Seção +18 com restrição de maioridade |
| `/adulto/produto/[slug]` | Detalhes de produto restrito, quando autorizado |

### 5.2. Administração

Todas as rotas `/admin/*` são para perfil `admin` verificado no banco.

| Caminho | O que faz |
| --- | --- |
| `/admin` | Dashboard e atalhos |
| `/admin/produtos` | Produtos, fotos, categorias, preços, variações, SKUs e EAN |
| `/admin/estoque` | Saldos, lotes, validades, movimentações e alertas |
| `/admin/pedidos` | Pedidos internos, criação e alterações de status |
| `/admin/clientes` | Clientes e relacionamentos com pedidos comerciais |
| `/admin/logistica` | Separação, expedição, rastreio e baixa FEFO |
| `/admin/frete` | CEP de origem, peso/medidas e cotação sandbox |
| `/admin/financeiro` | Indicadores de pedidos com confirmação administrativa |
| `/admin/relatorios` | Evolução mensal, CSV e alertas de estoque |
| `/admin/marketplaces` | Associação cadastral com anúncios externos |
| `/admin/notificacoes` | Fila de e-mails de pedidos; reprocessamento |
| `/admin/gateways` | Comparação de dez provedores, credenciais e preferências |
| `/admin/pagamentos` | Preparação de pagamentos TEST, links TEST e auditoria de webhooks |
| `/admin/reservas` | Reservas de homologação de checkout |
| `/admin/usuarios` | Diretório e alteração de permissões |
| `/admin/usuarios-online` | Presença recente / usuários com atividade |
| `/admin/auditoria` | Auditoria de perfis e configuração +18 |
| `/admin/adulto` | Prévia interna de catálogo +18 |
| `/admin/configuracoes` | Configurações administrativas |

A sidebar inclui grupos, pesquisa/atalhos, ícones, destaque da seção, recolhimento no desktop e navegação móvel. O cabeçalho identifica a conta conectada e oferece ação de sair.

## 6. Identidade, sessões e permissões

- O Supabase Auth controla o login, a recuperação e as sessões.
- O papel da aplicação é consultado em `public.profiles.role`, não em `user_metadata`.
- Papéis: `customer`, `staff` e `admin`. `staff` é cadastral; **não concede acesso ao Admin nesta versão**.
- `/admin/usuarios` consulta usuários, e-mail confirmado e último login; somente administradores autorizados podem alterar o perfil de **outra pessoa**.
- A alteração de papéis bloqueia autoelevação/autoalteração, usuário inexistente e promoção a admin sem e-mail confirmado.
- `/admin/auditoria` mantém eventos de alterações de papel e liga/desliga da seção adulta (histórico desde a implantação, não retroativo).
- `/admin/usuarios-online` usa heartbeat e janela aproximada de 3 minutos, atualização de 60 segundos e visão recente de 24h. **Não substitui a lista de sessões reais do Supabase Auth** nem implica revogação de sessões.
- A presença não depende de IP/GPS/histórico de navegação. RLS limita a leitura a titulares ou administradores.
- Mudanças de perfil e eventos internos seguem controles de permissão no PostgreSQL, e as funções privilegiadas ficam no schema privado com validação explícita.

### 6.1. Senhas e e-mails do Auth

Templates em `supabase/email-templates/` para confirmação de cadastro, redefinição de senha, link mágico, convite, atualização de e-mail, reautenticação e notificações de mudanças de credenciais/MFA. Eles são **arquivos de referência**: precisam ser configurados no Supabase Auth quando pertinente; a existência dos HTMLs no GitHub não significa que foram publicados no Auth.

Verificar `Authentication → URL Configuration`, `SMTP Settings`, limite de envio, política de senhas e medidas contra credenciais vazadas.

## 7. Catálogo, fotos, estoque e +18

### 7.1. Catálogo comum

- Produtos com categoria, nome, descrição, preço em **centavos**, custo, ativo/inativo, SKU/EAN e imagens.
- Variantes associadas ao produto, com saldo por SKU.
- Estoque inclui `on_hand`, `reserved`, lotes, validade e estoque mínimo.
- Ajustes de estoque exigem registro de movimentação e justificativa.
- Expedição aplica baixa de lotes pelo critério FEFO (*first expired, first out*).
- Em páginas sem catálogo conectado, demonstrações/itens ilustrativos **não são compráveis**.
- Não publicar links externos de imagens para produtos adultos.

### 7.2. Seção adulta +18

- Categoria reservada, telas e imagens segregadas, armazenamento privado em `adult-products`.
- Prévia por `/admin/adulto` é exclusivamente administrativa; **não comprova maioridade do administrador**.
- Visitantes e clientes comuns não podem acessar imagens/detalhes adultos sem autorização apropriada; RLS é a proteção principal.
- Solicitações de maioridade dependem de análise adequada, independente e auditável; **autoaprovação não é permitida**.
- O cadastro de documento/data de nascimento não é uma funcionalidade pública de verificação implantada nesta versão; não guardar documentos sem política apropriada.
- **A comercialização de produtos +18 está desabilitada**, inclusive no checkout de testes. Avaliar exigências legais, idade e privacidade antes de qualquer abertura.

## 8. Carrinho, endereços e reservas

### 8.1. Carrinho e preços

O carrinho usa armazenamento local (`pope-cart`) somente para itens/quantidades. A prévia em `POST /api/checkout/preview` envia apenas IDs e quantidades à RPC `preview_checkout_cart`; **o valor válido é recalculado no PostgreSQL**, não aceito do navegador. O cálculo bloqueia produtos inativos, demonstrativos, adultos, sem estoque ou que exijam seleção de variação.

O checkout de cliente **não tem botão de pagar ativo**. Frete, descontos, emissão fiscal, pagamento e total definitivo precisam de integração adicional.

### 8.2. Endereços e CEP

- `customer_addresses`: proprietário, destinatário, telefone, CEP, logradouro, número, complemento, bairro, cidade, UF e endereço principal.
- RLS + RPC protegem a leitura e gravação por titular. Limite de 10 endereços ativos.
- `react-imask` implementa máscaras de CEP `00000-000` e telefones de 10/11 dígitos; CPF/CNPJ são componentes reutilizáveis ainda não conectados a formulários de documentos.
- `GET /api/postal-code/[cep]` exige login, valida oito números, chama **ViaCEP** e, como alternativa, **BrasilAPI**.
- Busca automática após digitação, preenchendo logradouro/bairro/cidade/UF quando disponíveis. O cliente confere número, complemento e dados antes de salvar.
- A consulta externa de CEP não realiza geolocalização nem substitui validação de entrega.

### 8.3. Reserva TEST

- Somente **administrador autenticado**, desde que `store_settings.checkout_reservations_enabled=false`.
- `POST /api/checkout/test-reservation` chama `create_checkout_order` e exige endereço cadastrado, itens públicos e saldo.
- Reserva de **15 minutos** com `checkout_key` para idempotência.
- Máximo de 10 produtos/30 unidades por reserva, 1 reserva pendente por cliente e 5 reservas de teste por 24 horas.
- O banco bloqueia produtos adultos, duplicados, sem saldo, sem variante única, expirados e valores acima dos limites de homologação.
- `private.expire_checkout_orders` cancela e libera estoque por `pg_cron` a cada minuto.
- Titular pode cancelar via `cancel_checkout_order`; cancelamento/expiração libera reserva.
- `orders.origin='store_api'` identifica pedidos TEST; **não entram no financeiro, relatórios comerciais ou fila de e-mails de pedidos**.
- Estas reservas **não são vendas nem geram obrigação de entrega**. O preço é de itens, sem frete.

Não definir `checkout_reservations_enabled=true` até existir checkout comercial seguro, gateway homologado, cálculo de frete, antifraude, estornos e regras de venda.

## 9. Frete e embalagens — sandbox

### 9.1. Dados físicos

Em `/admin/frete`, configurar:
1. `shipping_origin_settings.origin_postal_code` — CEP real de postagem da loja.
2. `variant_shipping_specs` — peso em gramas e altura/largura/comprimento em centímetros por SKU.
3. Credencial do **Melhor Envio sandbox** em `MELHOR_ENVIO_SANDBOX_TOKEN`.
4. CEP de destino para simulação.

A API `POST /api/admin/shipping/quote` valida sessão admin, dados da variante e do catálogo, e consulta somente a rota de **cálculo de frete** da sandbox. Não compra etiquetas, não agenda coleta e não registra preço como devido pelo comprador.

A prévia `/checkout` pode exibir essa simulação somente para admin. Os resultados de sandbox **não são oferta comercial** e não compõem o total da reserva. Sem origem, dimensões e token, os testes ficam bloqueados.

### 9.2. Faltando para produção

Cotação real confirmada no fechamento do pedido, embalagem consolidada, modalidade contratada, prazo e custo válidos, compra/geração de etiquetas, rastreamento, cancelamento de etiqueta e conciliação da despesa logística. Verificar Correios/Jadlog e condições de postagem conforme integração selecionada.

## 10. Gateways de pagamento

### 10.1. Comparação

A central `/admin/gateways` registra **10 alternativas**:

| Gateway | Integração projetada | Estado |
| --- | --- | --- |
| Mercado Pago | Checkout Pro / Orders | TEST parcialmente implementado |
| PagBank | Checkout / links | Catalogado; integração comercial pendente |
| Pagar.me | Checkout V5 / links | Catalogado; autenticação de teste prevista |
| Asaas | Links e cobranças | Catalogado; autenticação de teste prevista |
| Stripe | Checkout Sessions | Catalogado; autenticação de teste prevista |
| Efí Bank | Pix / cobranças | Catalogado; depende de OAuth/certificado |
| PayPal | Checkout / Orders | Catalogado; teste de autenticação previsto |
| Cielo | API E-commerce | Catalogado; integração específica pendente |
| Iugu | API de cobranças | Catalogado; confirmar condições de sandbox |
| InfinitePay | Checkout Integrado | Catalogado; **não possui sandbox da modalidade indicada** |

O banco guarda preferências de avaliação, candidato de homologação, notas comerciais e auditoria. O cadastro de um provedor ou uma seleção de candidato **NÃO ativa cobrança**. Os provedores sem teste remoto implementado mostram apenas documentação e variáveis necessárias.

### 10.2. Preparações TEST no banco

`sandbox_payment_attempts` é o registro administrativo de tentativas, com:

- vínculo com reserva TEST e gateway;
- subtotal em centavos lido do pedido;
- `idempotency_key` única por pedido;
- estado `draft`, `cancelled` ou `expired`;
- controle de geração de preferência `not_started` → `preparing` → `ready`;
- URL/ID do Checkout Pro gerados para conta TEST, quando houver configuração.

Uma única preparação ativa por reserva. Cancelamento/expiração encerra o registro. Não há captura financeira nem marcação de pedido como pago.

### 10.3. Mercado Pago Checkout Pro TEST

A rota `POST /api/admin/payments/mercadopago/test-checkout` só pode gerar preferência se:

1. o usuário é admin;
2. a reserva está pendente, consistente e com validade suficiente;
3. `MP_TEST_ACCESS_TOKEN` e `MP_TEST_SELLER_ID` identificam **o mesmo vendedor TEST** (consulta `GET /users/me`, identificador, nickname `TEST...` e país `MLB`);
4. `MP_TEST_PREFERENCE_CREATION_ENABLED=verified-test-account-only`.

O prefixo `APP_USR-` **não identifica sozinho** credenciais de testes: também ocorre em produção. Não configurar token de vendedor real como TEST.

O servidor cria a preferência com preços e itens do pedido, confere o vendedor retornado e o domínio do link. Uma vez iniciada a geração, o sistema **não repete automaticamente** a chamada em caso de falha/timeout, para evitar duplicidades. Reconciliar manualmente ocorrências com estado `preparing` antes de qualquer retomada.

**Importante:** Checkout Pro TEST pode usar endpoints compartilhados com produção pelo provedor. Somente uma **conta compradora TEST** deve abrir links de homologação. O painel não efetua redirecionamento automático.

## 11. Webhooks Mercado Pago TEST e conciliação de auditoria

### 11.1. Endpoint

`POST /api/webhooks/mercadopago/test` — **não é um webhook de produção**.

Fica bloqueado (`503`) até o servidor possuir:

- `MP_TEST_WEBHOOK_SECRET`;
- `MP_TEST_ACCESS_TOKEN` e `MP_TEST_SELLER_ID`;
- `SUPABASE_SERVICE_ROLE_KEY`;
- `MP_TEST_WEBHOOK_ENABLED=verified-test-account-only`.

### 11.2. Proteções

1. Exige `application/json`, query `data.id` e `type`; valida a correspondência do ID de pagamento entre corpo e URL.
2. Confere cabeçalhos `x-signature` / `x-request-id` com HMAC-SHA256, comparação em tempo constante e janela de até 5 minutos para timestamp.
3. Aceita para processamento apenas o tipo `payment` e eventos declarados TEST (`live_mode=false`).
4. Autentica vendedor TEST via API e consulta o pagamento na **API oficial** em `GET /v1/payments/{id}`.
5. Exige `collector_id` igual à conta TEST e moeda BRL.
6. Verifica `external_reference=pope-sandbox:<attempt_id>`, subtotal, pedido e validade da reserva.
7. Salva evento deduplicado por `(provider, external_event_id)` em `payment_webhook_receipts`; não armazena JSON integral, documentos, dados de cartão ou credenciais.
8. Mostra histórico de auditoria em `/admin/pagamentos`, incluindo status do provedor e relação com a reserva.

**Regra essencial:** mesmo se o Mercado Pago retornar `approved`, a aplicação **NÃO altera `orders.status` para `paid`**, não movimenta estoque para expedição, não emite nota nem envia e-mail de pagamento confirmado. O estado `matched` é uma **conferência de auditoria**, não liquidação financeira.

### 11.3. Limitações a resolver

O fluxo ainda não foi validado ponta a ponta com eventos reais de TEST; faltam credenciais, simulação de retornos aprovados/recusados/estornados, processamento financeiro oficial, cálculo final de frete, webhooks produtivos, reconciliação e reprocessamento assistido de incidentes. A integração não deve ser habilitada para vendedores/compradores reais nesta etapa.

## 12. Pedidos internos, faturamento operacional e notificações

### 12.1. Pedidos internos

`/admin/pedidos` permite registrar pedidos administrativos com estoque reservado, itens e preços atuais. Mudanças de status são executadas por RPCs e rotas protegidas; a logística controla separação, transporte, rastreio e baixa FEFO.

O `/admin/financeiro` considera **confirmação administrativa de recebimento**, não pagamento bancário conciliado. `/admin/relatorios` oferece evolução mensal, exportação CSV e alertas operacionais. Reservas TEST `store_api` são excluídas desses indicadores.

Vínculos em `/admin/marketplaces` são apenas cadastrais; **não existe sincronização Shopee/Mercado Livre em tempo real**.

### 12.2. E-mails dos pedidos

Templates HTML:
- `emails/pedidos/01-pedido-registrado.html`;
- `emails/pedidos/02-pagamento-confirmado.html`;
- `emails/pedidos/03-pedido-enviado.html`;
- `emails/pedidos/04-pedido-entregue.html`;
- `emails/pedidos/05-pedido-cancelado.html`.

Os eventos de pedidos internos com cliente vinculado e e-mail válido entram em `order_notifications`, com proteção RLS, deduplicação por evento, controle de tentativas e status de fila. O servidor envia via Nodemailer a partir da rota administrativa após a transição; `/admin/notificacoes` permite inspecionar/processar a fila e reenvios permitidos.

- E-mails de pedidos **não** são templates do Supabase Auth; a configuração SMTP é independente.
- Balcão sem cliente, pedidos de homologação `store_api` e produtos adultos não entram nesse disparo.
- `sent` significa **aceitação pelo SMTP**, não leitura ou confirmação de entrega.
- Falhas de SMTP não revertem operações administrativas já concluídas.
- Processamento agendado da fila de mensagens **não está implantado**; ações manuais permitem reprocessar mensagens.
- `SMTP_PASSWORD` ainda não estava configurada em 11/11/2026; **nenhuma entrega SMTP de pedido foi confirmada**.

### 12.3. SMTP

Em Vercel Production, configurar `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_FROM_EMAIL` e a variável sensível `SMTP_PASSWORD`. Para Gmail, usar senha de aplicativo quando elegível. Não expor a senha em arquivos, chats, logs ou frontend. Publicar novamente e realizar teste com destinatário autorizado.

O Supabase Auth possui SMTP separado para confirmação de cadastro e recuperação; configurar/validar ambos os sistemas independentemente.

## 13. Modelo de dados e migrations

### 13.1. Tabelas principais

| Grupo | Tabelas |
| --- | --- |
| Identidade/segurança | `profiles`, `user_session_presence`, `admin_audit_events` |
| Catálogo | `categories`, `products`, `variants` |
| Estoque | `inventory`, `inventory_lots`, `stock_movements` |
| Vendas internas | `orders`, `order_items`, `order_events`, `order_notifications` |
| Checkout TEST | `customer_addresses`, `sandbox_payment_attempts`, `payment_webhook_receipts` |
| Frete | `shipping_origin_settings`, `variant_shipping_specs` |
| Pagamentos | `payment_gateway_settings`, `payment_gateway_audit` |
| Marketplaces | `marketplace_listings` |
| Adulto | `age_verification_requests`, `age_verifications`, `store_settings` |

### 13.2. Arquivos SQL existentes

A pasta `supabase/` contém os seguintes scripts; alguns são **correções incrementais** e devem ser aplicados na sequência de dependências, sem reaplicar indiscriminadamente migrations já presentes.

| Arquivo | Responsabilidade |
| --- | --- |
| `schema.sql` | Estrutura inicial |
| `catalog_admin.sql` | Administração do catálogo |
| `adult_catalog.sql` | Catálogo +18 e restrições |
| `age_review_self_approval_guard.sql` | Bloqueio de autoaprovação etária |
| `adult_admin_preview_policies.sql` | Prévia administrativa reservada |
| `operations_orders_logistics.sql` | Pedidos, logística, estoque |
| `ops_security_hardening.sql` | Segurança dos fluxos operacionais |
| `user_session_presence.sql` | Registro de atividade da sessão |
| `user_presence_admin_identity.sql` | Consulta administrativa da presença |
| `order_notifications.sql` | Fila e eventos de e-mails |
| `order_notifications_security.sql` | Proteção das RPCs de notificações |
| `admin_user_access_audit.sql` | Diretório, perfis e auditoria |
| `admin_operational_reports.sql` | Indicadores mensais e alertas |
| `payment_gateway_evaluation.sql` | Configuração dos dez gateways |
| `payment_gateway_fk_index.sql` | Índice de referência na configuração |
| `preview_checkout_cart.sql` | Prévia de preço e estoque |
| `preview_checkout_cart_uuid_selection_fix.sql` | Correção da seleção de UUID |
| `checkout_addresses_reservations.sql` | Endereços, reservas, expiração e Cron |
| `exclude_checkout_test_from_financial_metrics.sql` | Exclui TEST dos relatórios financeiros |
| `shipping_sandbox_setup.sql` | CEP da loja e especificações por SKU |
| `sandbox_payment_attempts.sql` | Preparações multi-gateway e inbox de webhooks |
| `mercado_pago_test_preference.sql` | Criação única de preferência TEST |
| `mercado_pago_test_preference_domain_fix.sql` | Restrição de domínio do checkout TEST |
| `mercado_pago_test_webhook_audit.sql` | Campos de auditoria Mercado Pago |

Para implantações novas, **não executar manualmente todos em ordem alfabética**. Planejar sequência validada, backup, homologação e versão de schema; alguns scripts esperam objetos criados por outros ou reimplementam funções corrigidas por migrations posteriores.

### 13.3. RLS e funções

- Tabelas expostas em `public` devem manter RLS ativo.
- Funções de escrita privilegiada são implementadas no schema `private`, com autorização explícita e wrappers `SECURITY INVOKER` quando necessárias.
- Clientes não podem alterar dados de outros titulares, forçar confirmação financeira, ativar gateway ou aprovar idade por conta própria.
- `service_role` nunca é disponibilizada no navegador.
- Auditoria TEST não deve ser interpretada como comprovação de recebimento financeiro.

## 14. APIs relevantes

| Método | Rota | Acesso/efeito |
| --- | --- | --- |
| POST | `/api/checkout/preview` | Conferência de preços, saldo e lotes, sem mutação |
| POST | `/api/checkout/test-reservation` | Reserva TEST, guardada por login e autorização no banco |
| GET | `/api/postal-code/[cep]` | Consulta CEP ViaCEP/BrasilAPI; login obrigatório |
| POST | `/api/admin/shipping/quote` | Frete sandbox; apenas administrador |
| POST | `/api/admin/gateways/test` | Checagem de alguns gateways em sandbox; apenas admin |
| POST | `/api/admin/payments/mercadopago/test-checkout` | Preferência TEST MP, bloqueada sem credenciais |
| POST | `/api/webhooks/mercadopago/test` | Webhook assinado TEST, bloqueado por padrão |
| POST | `/api/admin/order-operations` | Criação/transição de pedido administrativo |
| POST | `/api/admin/order-notifications` | Processar/reprocessar fila de e-mails |
| GET | `/api/adult-image/[filename]` | Imagem de produto restrito mediante autorização |

**Não publicar** endpoints de produção de cobrança/webhook copiando rotas de TEST sem um projeto completo de segurança e homologação por provedor.

## 15. Testes já realizados e testes ainda necessários

### 15.1. Validação existente

Testes transacionais temporários, revertidos com `ROLLBACK`, verificaram:

- cálculo de preço por banco e rejeição de produtos demonstrativos/adultos;
- estoque insuficiente, variantes inválidas e duplicidade de itens;
- salvamento e isolamento de endereços entre titulares;
- reserva de 15 minutos, idempotência e expiração com liberação de saldo;
- bloqueio de checkout público e de alterações de pagamento por clientes;
- exclusão de reservas TEST de relatórios, e-mails e financeiro;
- registro de preparação sandbox e impedimento de duplicidade;
- início/finalização únicos da preferência MP e rejeição de domínio inválido;
- RLS da auditoria e bloqueio de gravações diretas;
- deploys Vercel anteriores concluídos com `READY`.

**Limite dos testes:** validações SQL e compilação não substituem fluxo real de navegador, integração externa ou carga em produção. Não há garantia de entregas SMTP ou webhooks TEST recebidos sem credenciais e teste ponta a ponta. Uma suíte automatizada versionada ainda deve ser criada.

### 15.2. Roteiro de homologação

- [ ] Criar catálogo real completo, fotografias, estoque, peso e dimensões.
- [ ] Confirmar cadastro, login, recuperação de senha e links de e-mail em dispositivos diferentes.
- [ ] Validar CEP e máscara com endereços reais autorizados; testar falha de ViaCEP e fallback.
- [ ] Testar concorrência de reservas e expiração na presença de múltiplos usuários.
- [ ] Adicionar credenciais **exclusivamente TEST** para MP e habilitar geração de preferência em ambiente controlado.
- [ ] Testar cenário de pagamento aprovado, pendente, recusado, cancelado, estornado, duplicado e webhook fora de ordem.
- [ ] Confirmar HMAC contra eventos de teste reais e validar assinatura, idempotência e identificador do vendedor.
- [ ] Revisar falhas de timeout (`preparing`), reenvio e conciliação com o provedor.
- [ ] Cotar frete real por CEP, embalagem, transportadora e prazo; revalidar antes de cobrar.
- [ ] Configurar SMTP e confirmar entrega real de e-mails de pedidos e Auth.
- [ ] Validar fluxo completo de estoque/expedição/etiquetas e estornos.
- [ ] Executar testes de autorização, vazamento de dados, logs e backup/restauração.
- [ ] Conferir documentação fiscal, termos, política de privacidade e obrigações comerciais.
- [ ] Realizar teste ponta a ponta de compra real **em ambiente autorizado e controlado**, após homologação de todos os componentes.

## 16. Pendências para liberar produção

### Impedimentos críticos

1. **Checkout público real:** endereço, variante, frete, total final, disponibilidade em transação e criação de pedido comercial.
2. **Gateway:** escolher ao menos um fornecedor, credenciais de produção seguras, criação de cobranças reais, assinatura dos webhooks, conciliação financeira, estornos e chargebacks.
3. **Frete:** CEP de origem, dimensões e pesos reais, cotação em produção, contratação, emissão/cancelamento de etiqueta e rastreio.
4. **Notificações:** `SMTP_PASSWORD`, SMTP Auth, testes de envio e monitoramento de falhas.
5. **Emissão fiscal:** integrar processo fiscal apropriado à natureza da operação (NFC-e/NF-e conforme validação tributária).
6. **Catálogo e políticas:** produtos/fotos/preços reais, contato, empresa identificada, termos, entrega, trocas, devoluções, arrependimento, privacidade/LGPD.
7. **Segurança e operação:** revisar advisor Supabase, política de senhas, controle de credenciais, CI/testes, logs, alertas, backups, recuperação de incidentes e antifraude.

**Não habilitar** `checkout_reservations_enabled` ao público nem inserir chaves de vendedor real nos campos `MP_TEST_*` para "acelerar" a abertura.

### Melhorias posteriores ao lançamento

Sincronização completa Shopee e Mercado Livre, múltiplos gateways produtivos, fidelidade, cupons avançados, marketing, automações de estoque, dashboard financeiro ampliado e otimizações de conversão.

## 17. Operação segura e troubleshooting

| Situação | O que verificar |
| --- | --- |
| Login e recuperação de senha falham | URLs Auth, sessão, callback e SMTP do Supabase |
| E-mail de pedido não é enviado | `SMTP_PASSWORD` ausente, rede SMTP, destinatário, fila em `/admin/notificacoes` |
| Carrinho não confirma item | Produto real ativo, UUID, uma variante ativa, estoque/lotes válidos |
| Reserva TEST não aparece | Login como admin, endereço salvo, flag de checkout público desativada, limites e cron |
| Reserva expirada permanece pendente por instantes | `cron.job` e logs de `pope-checkout-expiry-every-minute` |
| Frete retorna indisponível | `MELHOR_ENVIO_SANDBOX_TOKEN`, CEP de origem, peso/medidas e CEP destino |
| Gateway sem teste | Credenciais TEST próprias, provedor escolhido e método implementado |
| Mercado Pago TEST bloqueado | Token TEST, ID TEST, nickname vendedor TEST e flag de habilitação |
| Estado `preparing` no Mercado Pago | Não repetir criação. Investigar a preferência externa e conciliar manualmente |
| Webhook MP retorna `503` | Variáveis de testes e chave de serviço não configuradas ou consulta externa falhou |
| Webhook MP retorna `401` | Assinatura HMAC, timestamp, `x-request-id` e `data.id` |
| Evento MP não aparece no painel | Teste da assinatura, vendedor, moeda, ID, consulta e insert em `payment_webhook_receipts` |
| Usuário comum acessa área admin | Revisar `profiles.role`, RLS, middleware e RPCs; tratar como incidente |
| Evento aparece como `matched` | **Não equivale a pagamento conciliado ou pedido liberado** |

## 18. Referências técnicas

- [Next.js](https://nextjs.org/docs)
- [Supabase Auth](https://supabase.com/docs/guides/auth)
- [Segurança e RLS no Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Cron](https://supabase.com/docs/guides/cron)
- [Vercel](https://vercel.com/docs)
- [Mercado Pago — documentação](https://www.mercadopago.com.br/developers/pt)
- [Melhor Envio — documentação](https://docs.melhorenvio.com.br)
- [ViaCEP](https://viacep.com.br)
- [BrasilAPI](https://brasilapi.com.br)
- [react-imask](https://imask.js.org)

---

**Regra de liberação:** o produto está disponível para desenvolvimento e homologação, **não** para venda. A produção comercial exige aprovação conjunta de checkout, pagamentos, frete, segurança, comunicação, documentação fiscal e operação de atendimento.

## 19. Testes automatizados e GitHub Actions (CI)

O projeto possui o workflow `.github/workflows/quality.yml`, executado em pull requests para `main`, pushes em `main` e manualmente. O job `testes-build-tipos` roda `npm run test`, `npm run build` e `npm run typecheck`, sem credenciais de pagamento.

Os **17 testes** em `tests/` usam o runner nativo de Node 22 (`--experimental-strip-types`):

- assinatura HMAC-SHA256 do Mercado Pago: timestamps válidos, alterações indevidas, assinatura ausente/duplicada, formato e expiração;
- transformação da resposta do provedor em snapshot de auditoria: centavos, status, IDs, metadados divergentes e não propagação de dados pessoais;
- proteções estáticas: checkout público desligado, webhook TEST exigindo assinatura e ausência de baixa `paid` pelo webhook.

A lógica pura testável foi separada em `src/lib/payments/mp-webhook-signature-core.ts` e `mp-payment-snapshot-core.ts`. Os wrappers usados pelo Next.js preservam `server-only`.

### Como executar

```bash
npm ci
npm run test
npm run build
npm run typecheck
```

**Limitações:** testes unitários/estáticos não substituem os testes de ponta a ponta com Supabase, gateway TEST, entrega de e-mails e frete. O `package-lock.json` foi gerado por Node 22 e validado com `npm ci` no GitHub Actions; o workflow usa `npm ci` e cache de dependências para builds reproduzíveis.

**Primeira execução verificada:** o workflow [Qualidade Popê Beauty #43088869320](https://github.com/MichaelPriest/E-commerce-Pop-Beauty/actions/runs/43088869320) terminou com **sucesso** no commit `9ffdcecf`: **17 testes aprovados, 0 falhas**, compilação Next.js e validação TypeScript aprovadas. A Vercel publicou esse mesmo commit com estado `READY`. Isso **não** homologa pagamentos reais nem frete e **não** configura automaticamente a proteção da branch.

**Proteção de releases ainda depende de configuração:** o workflow não impede automaticamente que o Git da Vercel publique um push direto na branch `main`. Configure em GitHub → Settings → Rules/Rulesets ou Branch protection uma regra para `main` exigindo pull requests e o check `testes-build-tipos`; para impedir promoção/publicação antecipada, configurar também Deployment Checks da Vercel e revisar o fluxo de implantação. Não reivindicar aprovação de produção apenas porque o CI passou.

### 19.1. Lockfile validado e política de dependências

Em 11/11/2026 foi gerado o `package-lock.json` **v3** em um workflow isolado, verificado com `npm ci`, 17 testes, `next build` e `tsc --noEmit`. Ele registra versões transitivas e hashes de integridade, evitando atualizações silenciosas no CI. O workflow principal `quality.yml` instala com `npm ci --no-audit --no-fund` usando cache npm.

Sempre revisar PRs que alterem `package.json` ou `package-lock.json`, executar `npm ci && npm run check:ci` e publicar somente após passar. Dependências novas ainda exigem avaliação de licença, segurança e compatibilidade; lockfile não substitui auditoria de vulnerabilidades. A branch auxiliar `automation/npm-lockfile` foi usada apenas para preparar o arquivo sem arriscar alterações diretas de dependências na produção.
