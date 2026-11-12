# Popê Beauty 💖

> Plataforma de e-commerce de beleza, maquiagem e catálogo reservado +18, desenvolvida com **Next.js, React, TypeScript, Supabase e Vercel**.  
> **Situação: aplicação publicada, mas NÃO liberada para vendas online reais.**  
> **Documentação revisada em:** 11/11/2026 · **Ambiente:** [Popê Beauty](https://e-commerce-pope-beauty.vercel.app) · **Branch de publicação:** `main`.

Este é o **documento principal do projeto**. Reúne recursos, URLs, arquitetura, tabelas, regras de negócio, configuração, homologação, segurança, limitações, operações e próximos passos. A implementação em código e no banco é a fonte de verdade quando existir divergência; nunca habilite recursos de produção somente com base na presença de uma tela.

## 1. Visão geral e status

### 1.1. Painel executivo

| Área | Situação em 11/11/2026 | Observações |
| --- | --- | --- |
| Hospedagem e build | ⚠️ Site publicado; commits mais recentes ainda não implantados | Vercel Hobby atingiu limite diário de deploy em 11/11; verificar retomada antes de considerar a versão atual publicada |
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
| `/admin/remessas` | Fila administrativa de preparação por Correios/Melhor Envio (sem compra de frete) |
| `/admin/frete` | CEP de origem, peso/medidas e cotação sandbox |
| `/admin/financeiro` | Indicadores de pedidos com confirmação administrativa |
| `/admin/relatorios` | Evolução mensal, CSV e alertas de estoque |
| `/admin/marketplaces` | OAuth de contas Shopee/Mercado Livre, importação manual somente leitura e vínculos de SKU |
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

`/admin/marketplaces` já oferece OAuth Shopee/Mercado Livre e consulta manual da primeira página de anúncios/pedidos em tabelas isoladas. **Não existem sincronização contínua, reserva automática de estoque nem criação de pedidos de marketplace no módulo operacional**.

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

## 20. Painel de prontidão de produção

A rota **`/admin/prontidao`** foi incluída no menu Sistema, com acesso restrito à função `requireAdmin()`. Ela permite acompanhar, **somente por leitura**, o catálogo comum, presença de medidas e CEP de origem, configuração de SMTP, escolha de gateway e configuração do Mercado Pago TEST, além dos bloqueios de checkout/frete comerciais e validações manuais.

- Nenhum token, segredo, senha ou valor de variável de ambiente é enviado ao navegador. O painel apenas indica ausência/presença de configurações.
- As consultas ao banco são feitas com a sessão administrativa e RLS; erros não são tratados como aprovação.
- O indicador **“Verificado”** significa que uma condição técnica local foi observada; não garante entrega SMTP, integração externa, pagamento conciliado ou liberação comercial.
- O sistema **nunca** usa esse painel para ativar o checkout. A lógica pura de resumo em `src/lib/release-readiness.ts` mantém `canOpen=false`; testes cobrem a impossibilidade de liberar vendas pela soma de checks.
- O painel inclui pendências manuais (emissão fiscal, documentos comerciais, proteção de senha, revisão de segurança) para evitar sensação enganosa de prontidão.
- Antes da liberação, conferir a lista com o desenvolvedor, a operação comercial e a contabilidade; somente após homologação dos fluxos transacionais criar uma decisão separada de lançamento.

## 21. Integrações Shopee e Mercado Livre — OAuth e consultas em leitura

Implementadas em 11/11/2026. O módulo `/admin/marketplaces` passou a apresentar conexão OAuth, contas autorizadas, consulta manual de anúncios e pedidos, histórico resumido de importações e desconexão. A implementação permanece **desligada até o proprietário cadastrar os aplicativos e autorizar suas contas**.

### 21.1. Credenciais e URLs de callback

**Mercado Livre** (https://developers.mercadolivre.com.br):
- Criar aplicação própria no Mercado Livre DevCenter e solicitar permissões de leitura de anúncios/pedidos e `offline_access`. Não reutilizar aplicação de Mercado Pago.
- Configurar `MELI_APP_ID` e `MELI_CLIENT_SECRET` em Vercel → Environment Variables **somente servidor**.
- Cadastrar a URL estática exata de redirecionamento: `https://e-commerce-pope-beauty.vercel.app/api/admin/marketplaces/oauth/callback/mercadolivre`.
- O fluxo utiliza Authorization Code + `state` e PKCE S256. O token é obtido no servidor por POST `/oauth/token`, e `GET /users/me` confirma a conta vendedora brasileira (`site_id=MLB`).
- O access token tem duração limitada; cada refresh token é de **uso único**. A renovação substitui ambos os tokens no cofre e usa `revision` (compare-and-swap) para impedir gravação de versões antigas.

**Shopee** (https://open.shopee.com.br):
- Solicitar acesso Shopee Open Platform, criar aplicação com autorizações de **produtos e pedidos**, e obter `Partner ID` e `Partner Key`.
- Configurar `SHOPEE_PARTNER_ID` e `SHOPEE_PARTNER_KEY` em Vercel → Environment Variables **somente servidor**.
- Cadastrar o domínio e o retorno: `https://e-commerce-pope-beauty.vercel.app/api/admin/marketplaces/oauth/callback/shopee`.
- A autorização utiliza o endereço mais recente `https://open.shopee.com.br/auth`, parâmetros `partner_id`, `auth_type=seller`, `response_type=code`, `redirect_uri` e `state`. Tokens são trocados em `/api/v2/auth/token/get`. As chamadas à API utilizam assinatura HMAC-SHA256 sobre os campos de assinatura pública ou de loja.
- O fluxo de integração foi escrito para uma **conta de loja Shopee com `shop_id`**, não para conta principal que retorna apenas `main_account_id`. A integração de múltiplas lojas em conta master é etapa separada.

**Cofre obrigatório para ambos:**
- `MARKETPLACE_TOKEN_ENCRYPTION_KEY`: **32 bytes aleatórios em hexadecimal (64 caracteres)**, protegidos como segredo Vercel. Gerar em ambiente seguro com `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` e cadastrar diretamente na Vercel — **não enviar por chat ou commit**.
- `MARKETPLACE_OAUTH_ORIGIN` (opcional; por padrão `https://e-commerce-pope-beauty.vercel.app`). Precisa coincidir com o domínio configurado nos aplicativos.
- O token de acesso e refresh são cifrados com **AES-256-GCM**, com IV aleatório e tag de autenticação. O texto cifrado fica no schema `private`, sem acesso direto para o browser. A aplicação depende da chave do servidor para recuperar credenciais.
- **Faça backup seguro da chave de criptografia:** perdê-la exige reconectar as lojas, pois os tokens existentes não poderão ser decifrados. A rotação de chave exigirá procedimento específico de recifra antes de substituir o segredo.

**Nunca configurar tokens de vendedores reais no código, README ou logs.** O OAuth solicita autorização ao vendedor; não é necessário compartilhar senhas da Shopee/Mercado Livre com a Popê Beauty.

### 21.2. Funcionalidades e limites

| Operação | Implementação | Limite |
| --- | --- | --- |
| Conexão de loja | OAuth oficial e callbacks com `state` | Requer cadastro do aplicativo e aprovação do vendedor |
| Cofre de tokens | AES-256-GCM no servidor, função SQL privada | Requer chave de cofre válida |
| Renovação de token | On-demand ao consultar quando estiver próximo de expirar | Sem rotina agendada |
| Consulta Mercado Livre anúncios | `/users/{seller_id}/items/search` + `/items/bulk` | Até 30 anúncios por clique |
| Consulta Mercado Livre pedidos | `/orders/search?seller={id}` | Até 20 pedidos por clique |
| Consulta Shopee anúncios | `/api/v2/product/get_item_list` e `get_item_base_info` | Até 30 anúncios por clique |
| Consulta Shopee pedidos | `/api/v2/order/get_order_list` (últimos 7 dias) | Até 20 pedidos por clique |
| Histórico local | `marketplace_readonly_imports`, idempotência por conta/tipo/ID | Sem informações pessoais do comprador |
| Desconexão | Elimina tokens cifrados locais | Revogação junto ao marketplace também deve ser realizada no portal externo |
| Estoque/preço/exportação | **Desativados** | Não chama endpoints de escrita |
| Criação de pedidos comerciais | **Desativada** | Importação não altera `orders` nem `inventory` |
| Rotina cron/webhooks | **Pendente** | Sem sincronização automática |

Tabelas: `marketplace_connections` (contas/status), `private.marketplace_token_vault` (tokens cifrados e revisão) e `marketplace_readonly_imports` (snapshots operacionais sem PII). Migração: `supabase/marketplace_oauth_readonly.sql`.

### 21.3. Segurança, testes e futura sincronização

- Rotas `/api/admin/marketplaces/oauth/start/[channel]`, `oauth/callback/[channel]`, `sync` e `disconnect` exigem conta **admin**. Callbacks exigem state consistente, cookie `HttpOnly`/SameSite Lax, e no Mercado Livre também PKCE.
- Tokens nunca são enviados como propriedades da interface administrativa, nem usados pelo browser para chamar APIs externas.
- Apenas origens OAuth HTTPS configuradas e endpoints oficiais fixos são aceitos. POSTs verificam a origem e o host.
- Testes automatizados para HMAC Shopee, cifragem AES-GCM, adulteração, controle de acesso e ausência de mutações de pedidos/estoque.
- Os dados importados **não são pedidos comerciais reconciliados** e não representam pagamento confirmado.
- Pendente antes da sincronização completa: validação da conta de vendedor real, reconciliação de variações/SKUs e estoques por loja, atualização de status e cancelamentos, sincronização incremental/webhooks, política de devoluções, rate limits, reprocessamento e suporte para Shopee main accounts.
- Nenhuma conexão foi autorizada ou verificada de ponta a ponta com os provedores enquanto não houver credenciais e aprovação de aplicativos.

**Checklist de conexão:** configurar três/duas variáveis conforme o canal, salvar a URL de callback no provedor, fazer novo deploy, acessar `/admin/marketplaces`, clicar `Conectar conta`, autorizar a loja e usar os botões `Anúncios` / `Pedidos`. Validar IDs e SKUs antes de habilitar qualquer escrita.

### Integrações de marketplaces

O painel `/admin/marketplaces` consulta conexões Shopee/Mercado Livre, mas **não** libera pedidos reais. Antes de produção dos marketplaces, concluir autorização OAuth real, sincronização incremental segura, estoque por SKU/loja e conciliação de pedidos externos.

### 21.4. Comparação de SKUs na prévia

A tabela de anúncios importados exibe o resultado da **conciliação somente leitura** entre `item_sku` / `seller_custom_field` do marketplace e `variants.sku` da Popê. A correspondência é exata (espaços externos e letras maiúsculas/minúsculas são normalizados), sem fuzzy matching. Resultados possíveis: SKU localizado, sem SKU externo, não encontrado, SKU ambíguo e produto +18 bloqueado. Esse indicador **não** atualiza `marketplace_listings`, `inventory`, preços ou quantidades. Antes de habilitar estoque compartilhado, confirmar manualmente cada variação/modelo e as regras de reserva por canal.

### 21.5. Paginação autenticada de anúncios e pedidos

A consulta administrativa oferece **Mais anúncios** e **Mais pedidos** quando as APIs indicam haver outra página. O cursor é **assinado com HMAC-SHA256**, fica vinculado ao canal, ao tipo de consulta e à conta vendedora, expira em 20 minutos e limita a navegação a dez páginas por sequência. Para Shopee, o cursor de pedidos preserva a janela fixa de 7 dias; para os demais endpoints é usado o offset, limitado a 500. As páginas são gravadas idempotentemente na tabela de staging sem movimentar estoque.

**Atenção:** esta é paginação manual sob demanda, não um processo agendado ou integração incremental com webhooks. A API retorna apenas campos operacionais resumidos, nunca dados pessoais de compradores. A homologação real depende de credenciais autorizadas.

A autorização Shopee utiliza `/api/v2/shop/auth_partner`, assinatura HMAC dos campos obrigatórios, expiração curta e `state` preservado na URL de retorno. O endpoint anterior `open.shopee.com.br/auth` foi substituído por esse padrão.

### 21.6. Segurança dos SKUs nas variações

O anúncio pai **não** é automaticamente considerado um SKU vendável quando possui variações. Na Shopee, `item_sku` só é aproveitado quando `has_model=false`; modelos requerem consulta futura a `get_model_list` e vínculo por `model_id` / `model_sku`. No Mercado Livre, o SKU considerado confiável é o atributo `SELLER_SKU`; `seller_custom_field` é uma referência independente e não autoriza relação automática. Anúncios com `variations` mantêm vínculo pendente, sem atualizar saldos. Tests unitários garantem esse comportamento conservador. Documentação: [Mercado Livre — Variações](https://developers.mercadolivre.com.br/pt_br/variacoes) e [Shopee — get_model_list](https://open.shopee.com/documents/v2/v2.product.get_model_list).

### 21.7. Conferência por item de pedidos (somente leitura)

Os pedidos consultados por um administrador agora são complementados com itens individuais:
- **Mercado Livre:** `order_items` do resultado autorizado `/orders/search`, incluindo `item.seller_sku`, `variation_id`, título, quantidade e preço unitário. A importação confere o ID do vendedor quando presente.
- **Shopee:** após `get_order_list`, a aplicação consulta `/api/v2/order/get_order_detail` com `order_sn_list` e solicita o campo `item_list`. Usa `model_sku` quando `model_id>0`; se não houver SKU do modelo, deixa-o em branco (jamais o substitui pelo SKU do item pai). Para produtos sem modelo, usa `item_sku`.
- Os dados são normalizados em `src/lib/marketplaces/order-line-core.ts`, **descartando inteiramente** comprador, endereço, telefone e detalhes de pagamento/entrega.
- A migração `supabase/marketplace_order_line_previews.sql` cria staging por conta, pedido e linha; a RPC `replace_marketplace_order_line_previews` substitui as linhas consultadas numa transação, sem alterar `orders`, `order_items`, `inventory` ou `order_notifications`.
- Em `/admin/marketplaces`, a tabela **Conferência de itens de pedidos** compara cada SKU a `variants.sku`, classifica ausência, ambiguidade ou produto adulto bloqueado, e mostra saldo físico/reservado **apenas como informação cadastral**, não disponibilidade para venda.
- Quando a resposta de um provedor não apresenta detalhes de um pedido solicitado, a importação falha sem assumir valores vazios. Valores e quantidades inválidos não são tratados como confirmados.

**Os pedidos externos continuam sem financeiro e sem estoque automático.** Para avançar para a sincronização transacional, ainda serão necessários eventos incrementais autenticados, conciliação de pedidos cancelados/reembolsados, reserva serializada por SKU/lote, idempotência por canal e tratamento de eventos fora de ordem.

## 22. Documentos fiscais e etiquetas internas (sem integração externa)

O desenvolvimento da central **`/admin/fiscal`** foi iniciado em 11/11/2026 para preparar a emissão futura de **NF-e modelo 55** e **NFC-e modelo 65**, além de documentos internos de expedição.

- `supabase/fiscal_preparation_internal_packing_v1.sql`: cria `product_fiscal_details`, `fiscal_order_drafts` e `internal_package_preparations`, com RLS e RPCs restritas a admin.
- `supabase/fiscal_document_readiness_v1.sql`: cria `fiscal_issuer_settings` (emitente), `fiscal_order_recipients` (destinatário por pedido) e `fiscal_document_integration` (status único `not_submitted`), acrescenta CFOP, CST, CSOSN, PIS, COFINS e códigos IBS/CBS aos produtos e RPCs com validação e controle de permissão.
- A aba Emitente prepara razão social, CNPJ, IE, CRT e endereço com código IBGE, sem armazenar certificado ou CSC.
- A aba Produtos permite revisar NCM, CEST, origem, unidade comercial, CFOP e classificações fiscais. Os campos **não são sugeridos automaticamente**, pois dependem de regime, produto e natureza da operação. Validar com contabilidade e a tabela vigente.
- A aba Pedidos guarda o tipo de documento (55/65), natureza da operação, destinatário, CPF/CNPJ e observações. O status é apenas `draft`, nunca `authorized`.
- Os documentos imprimíveis `/admin/fiscal/documentos/[id]?tipo=conferencia`, `?tipo=separacao` e `?tipo=etiqueta` exigem administrador e pedido `origin='admin_manual'`. A conferência fiscal contém um aviso permanente **RASCUNHO — SEM VALOR FISCAL**; listas de separação e etiquetas internas não comprovam postagem nem substituem etiquetas de transportadoras.
- A validação `src/lib/fiscal/readiness-core.ts` identifica ausências básicas, utiliza dígitos verificadores CPF/CNPJ e relaciona os itens ao NCM e à classificação cadastrada. Resultado sem alertas **não autoriza emissão**; cálculo tributário e conformidade fiscal exigem mecanismo homologado.

### Falta para NF-e/NFC-e oficial

1. Confirmar CNPJ, IE, CRT, credenciamento/ambiente na SEFAZ e versão vigente do XML NF-e 4.00, inclusive alterações da reforma tributária IBS/CBS.
2. Definir um emissor homologado (provedor fiscal ou integração direta com SEFAZ) e configurar o certificado digital A1 ou mecanismo de assinatura eletrônica admissível, **somente no servidor/cofre seguro**.
3. Para NFC-e, cadastrar CSC/ID CSC, série/número fiscal, regras de QR Code, contingência e DANFE NFC-e conforme UF; verificar legislação de SP.
4. Preencher impostos por item e operação: CFOP, ICMS/CSOSN/CST, PIS/COFINS, IBS/CBS, classificação tributária, bases, alíquotas, descontos, frete, pagamentos e total fiscal. Não inferir automaticamente alíquotas dos dados atuais.
5. Implementar schema XSD e assinatura do XML, envio e processamento assíncrono, retorno autorizado/rejeitado, protocolo, chave de 44 dígitos, XML autorizado, DANFE oficial, cancelamento e carta de correção quando aplicáveis.
6. Adicionar armazenamento privado imutável do XML autorizado e trilha de auditoria; nunca marcar nota como autorizada por formulário ou por pedido marcado manualmente como pago.
7. Homologar com contador e ambiente SEFAZ antes de ativar emissão em produção.

**Referências:** [SEFAZ SP NFC-e](https://portal.fazenda.sp.gov.br/servicos/nfce/), [Portal Nacional NF-e](https://www.nfe.fazenda.gov.br/portal/), [Reforma tributária nos DF-e](https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/julho/receita-federal-e-comite-gestor-do-ibs-publicam-o-cronograma-de-implementacao-dos-documentos-fiscais-eletronicos-da-reforma-tributaria-do-consumo).

A central de preparação é uma **base técnica, não um emissor fiscal**. Os documentos imprimíveis são exclusivamente internos.

### 22.1. Exportação de dados para integração com emissor

O administrador pode baixar `GET /api/admin/fiscal/export/[id]`, que gera um **JSON de preparação** `pope.fiscal.preparation.v1` contendo modelo escolhido, emitente, destinatário, itens, classificações fiscais, entrega, valores e alertas de campos básicos. A exportação exige autenticação de administrador, usa `Cache-Control: private, no-store` e retorna sempre `is_official_document=false`, `document_status=not_submitted` e `ready_for_transmission=false`. Não envia dados à SEFAZ, não calcula impostos automaticamente, não produz XML assinado nem DANFE. É uma interface de integração futura, não um documento fiscal.

O destinatário pode conter CPF/CNPJ e o endereço do pedido; portanto o JSON exportado é **sensível** e deve ser guardado apenas em ambiente corporativo autorizado, com retenção e proteção adequadas à LGPD. Nunca compartilhar esse arquivo publicamente.

### 22.2. Reconciliação dos valores exportados

A exportação JSON de preparação fiscal informa `amount_reconciliation`, com `items_total_cents`, `difference_cents`, `issues` e `requires_manual_allocation`. Os valores são calculados em centavos inteiros seguros. Quando o total do pedido difere da soma dos itens, o sistema exige **conferência e discriminação de frete, descontos ou ajustes**, sem atribuir automaticamente uma natureza tributária. Quantidades, preços e totais inválidos/fora do intervalo seguro também geram alertas. Esses alertas se somam a `missing_basic_fields`, sem alterar o estado `not_submitted` e sem habilitar emissão. Testes: `tests/fiscal-amount-reconciliation.test.mjs`.

### 22.3. Romaneio interno por seleção de pedidos

Em `/admin/logistica`, o administrador pode selecionar até **30 pedidos administrativos** no filtro atual e gerar `/admin/logistica/romaneio?pedidos=<ids>`. O romaneio apresenta pedidos, status, quantidades de SKUs, volumes previstos, transportadora e rastreio já cadastrados, além de campos manuais de conferência. A rota valida UUIDs, duplicatas, total máximo, autenticação admin e a correspondência exata de todos os pedidos consultados. A consulta é exclusivamente de leitura e não movimenta estoque, não registra envio, não contrata frete, não emite PLP e não constitui documento fiscal. Volumes são estimativas administrativas (padrão 1 se não houver preparação). Testes: `tests/logistics-internal-manifest.test.mjs`.

### 22.4. Medidas de cada volume (preparação interna)

Na tela `/admin/logistica`, abra **Volumes** no pedido para acessar `/admin/logistica/volumes/[id]`. A quantidade prevista deve ser cadastrada anteriormente na central fiscal (`internal_package_preparations`). Para cada volume é possível salvar **peso bruto em gramas, altura, largura, comprimento em cm (até duas casas) e observações**, por meio da RPC `save_internal_package_volume`.

A tabela `internal_package_volumes` tem chave composta `(order_id, volume_number)`, RLS de leitura só para `admin` e nenhuma permissão direta de escrita para o cliente. A RPC verifica o perfil, o pedido manual, a quantidade prevista e os limites das medidas. A edição só é permitida em pedidos `paid` ou `packing`, antes do despacho. O banco foi migrado em 11/11/2026; a migração versionada é `supabase/internal_package_volumes_v1.sql`.

**Limitações:** esse cadastro não contrata transporte, não consulta transportadora, não gera etiqueta postal e não confirma despacho. Se a quantidade prevista de volumes for reduzida, volumes excedentes já cadastrados não são apagados automaticamente: o painel exibe apenas os números previstos e dados antigos devem ser revisados antes de qualquer integração postal. Testes: `tests/logistics-volume-dimensions.test.mjs`.


### 22.5. Conferência pré-envio e exportação de remessa (sem integração postal)

O fluxo da tela **Administração → Logística → Volumes → Medidas e conferência da remessa** agora inclui um checklist estrutural. Para liberar a exportação da preparação JSON, o pedido precisa ser `admin_manual`, estar em `paid` ou `packing`, ter CEP de origem cadastrado, destinatário com telefone e endereço completo, quantidade planejada entre 1 e 50 e **todos os volumes individuais numerados e preenchidos** com peso e dimensões válidos. Registros faltantes, duplicados ou excedentes bloqueiam a exportação; a lista de pendências indica o que corrigir. O total de peso é a soma do peso bruto de cada volume. A conferência é implementada em `src/lib/shipping/shipment-preparation.ts`.

Pedidos administrativos sem endereço podem receber dados exclusivamente no formulário interno de destinatário em `/admin/logistica/volumes/[id]`. O formulário usa as máscaras de CEP e telefone e consulta autenticada de CEP (ViaCEP/BrasilAPI), com confirmação manual do número e complemento. A RPC `save_admin_order_delivery_address` grava um snapshot privado, registra evento sem informações pessoais no histórico do pedido e só aceita administrador e pedido `paid`/`packing`. Migração aplicada no Supabase e versionada em `supabase/admin_order_delivery_address_v1.sql`. Não disponibiliza edição após envio, nem interfere com checkout público.

Após concluir a conferência, a rota **GET `/api/admin/shipping/preparation/[id]`** entrega um JSON `pope.shipping.preparation.v1` para integração futura, com cabeçalhos `private, no-store`. Ela revalida sessão admin e dados no servidor, retornando **HTTP 409** quando qualquer campo está pendente. O JSON contém CEPs, endereço, telefone e volumes, e portanto deve ser armazenado com proteção adequada à LGPD. Os campos `is_official_shipping_label=false`, `shipment_purchased=false`, `tracking_created=false` e `ready_for_label_purchase=false` deixam explícito que **nenhuma etiqueta, cotação, remessa postal ou comprovante oficial é gerado**. A exportação é somente para revisão interna, não pode ser submetida diretamente a uma transportadora sem adaptador homologado. Testes em `tests/shipment-preparation.test.mjs`.

**Pendente para produção:** escolher transportadora e contrato, tratar as especificações individuais por serviço, NF-e/documentação fiscal exigida, serviços opcionais, seguro declarado, idempotência de compra, cancelamento de etiqueta, PLP, rastreamento confirmado e conciliação de frete. Não habilitar compra real com base somente na conferência estrutural.

### 22.6. Central de remessas e adaptadores de transportadoras (sem chamadas externas)

O módulo `/admin/remessas` oferece uma fila de até **100 pedidos internos** em `paid`/`packing`. Exibe volumes cadastrados, pendências da conferência estrutural e a transportadora selecionada, e direciona para `/admin/logistica/volumes/[id]`. Não altera pedido, estoque ou rastreio.

Na tela de volumes, o administrador pode salvar a preferência por **Melhor Envio** ou **Correios — Pré-postagem**, um **código de serviço de referência ainda não validado** e observações. O formulário chama a RPC `save_shipment_provider_draft`; a tabela `shipment_provider_drafts` mantém somente configurações internas, versão, identificador do rascunho e auditoria, **sem duplicar dados pessoais** do destinatário. A operação exige `admin`, pedido manual elegível e validação de campos. Uma gravação idêntica não cria nova versão; alterações geram nova versão/identificador e evento de auditoria sem informações pessoais. A tabela tem RLS para leitura administrativa, sem gravação direta pelo navegador. Migração aplicada e versionada em `supabase/shipment_provider_drafts_v1.sql`.

O arquivo `src/lib/shipping/provider-adapters.ts` descreve separadamente os fluxos de cada provedor, normaliza os volumes e lista verificações de contrato/documentação. O JSON administrativo de `GET /api/admin/shipping/preparation/[id]` passou a incluir `provider_review` (formato `pope.shipping.provider-review.v1`), mantendo o envelope `pope.shipping.preparation.v1`. A revisão distingue dados internos completos de integração homologada: **`ready_for_provider_request=false`, `ready_for_label_purchase=false`, `cart_created=false`, `shipment_purchased=false`, `label_generated=false` e `official_tracking_created=false`**, sempre. Não há chamadas `fetch` a transportadoras nesta nova etapa, nem custos/serviços inventados.

Fluxos documentados com base nas referências oficiais: [Melhor Envio — inserir no carrinho](https://docs.melhorenvio.com.br/reference/inserir-fretes-no-carrinho), [compra](https://docs.melhorenvio.com.br/reference/compra-de-fretes-1), [geração](https://docs.melhorenvio.com.br/reference/geracao-de-etiquetas), [impressão](https://docs.melhorenvio.com.br/reference/impressao-de-etiquetas); [Correios — pré-postagem](https://www.correios.com.br/atendimento/developers/manual-do-usuario-ppn). Estas são referências de implementação futura e **não** implicam credenciais, autorização ou compatibilidade operacional ativa.

Novos testes em `tests/shipping-provider-adapters.test.mjs` cobrem os campos de segurança, a distinção entre revisão e compra, as etapas dos provedores e o acesso administrativo. O comando `npm run build` foi atualizado para executar `npm run test` antes do build Next.js, de modo que testes falhos não possam resultar em deploy novo com status READY.

**Etapas futuras (credenciais somente ao final):** validar dados completos do remetente, CPF/CNPJ, documentação fiscal, contrato e serviços habilitados; obter cotações reais/sandbox; modelar carrinho e operação de compra com chave de idempotência transacional; guardar IDs e etiquetas oficiais de modo privado; tratar cancelamento/estornos/PLP e conciliar rastreamento com eventos autenticados. O identificador do rascunho **não** é uma chave de compra aprovada.

**Teste operacional pendente:** na inspeção do banco de 11/11/2026 não existiam pedidos administrativos com status `paid` ou `packing`; não foi alterado status de pedidos para fabricar dados de teste.

### 22.7. Qualidade, CI e estado da implantação

O fluxo de build passou a rodar `npm run test && next build`. A primeira execução dessa validação identificou **1 teste fiscal falhando entre 83**: quando item/total era inválido, a função `fiscalAmountReconciliation` ainda criava uma diferença aparente. A regra foi corrigida em `src/lib/fiscal/readiness-core.ts`: dados inválidos, somas com overflow ou ausência de itens geram `items_total_cents=null` e `difference_cents=null`, além das pendências. Os testes correspondentes foram reforçados.

A pipeline **`.github/workflows/ci.yml`** foi adicionada com `contents: read`, versões de Actions fixadas por commit SHA, Node.js 22, `npm ci --ignore-scripts`, `npm test` e `npm run typecheck`; não acessa credenciais de bancos, pagamento ou frete.

**Restrição temporária (11/11/2026):** a Vercel retornou HTTP **402 `api-deployments-free-per-day`** por exceder o limite diário de 100 deployments no plano Hobby. O commit de correção fiscal e o pipeline foram enviados ao GitHub, porém **ainda não se confirmou um novo deploy READY destes commits**, nem o resultado da pipeline GitHub Actions. O último deploy READY pré-limite continua como referência operacional; após o limite ser liberado ou o plano ser ajustado pelo responsável, é obrigatório conferir o SHA implantado, os testes e o build antes de homologar a atualização.

A revisão de segurança do Supabase confirmou RLS da tabela `shipment_provider_drafts` e ausência de acesso anônimo/leitura ou escrita direta indevida. Restam alertas independentes: **Leaked Password Protection desativado** e tabela privada `marketplace_token_vault` com RLS sem policy explícita, cuja intenção de isolamento precisa ser verificada. Nenhum desses alertas justifica afrouxar as políticas atuais.

### 22.8. Intenções internas idempotentes de etiqueta (sem compra real)

Em **Administração → Logística → Volumes**, na seção da transportadora, o operador pode clicar em **Registrar intenção interna de etiqueta** depois de cadastrar e salvar endereço, origem, quantidades, peso e dimensões dos volumes, integrador e **código de serviço de referência**. O formulário é desabilitado quando os dados estruturais estão incompletos ou quando há alterações de transportadora ainda não salvas.

A RPC `stage_internal_label_intent(p_order_id)` executa uma validação adicional **no banco, dentro de uma transação**: exige autenticação e papel de administrador, pedido `admin_manual` pago/em separação, destinatário completo, CEPs válidos, integrador e serviço informados, volumes inteiros 1..N sem faltas nem excedentes e ao menos uma mercadoria. A RPC usa bloqueio de linha no pedido e no rascunho do integrador, evitando operações simultâneas conflitantes.

A tabela `internal_label_intents` guarda **no máximo uma intenção por pedido**, `intent_key` (UUID único), `source_fingerprint` (SHA-256), prestador, serviço, versão do rascunho, datas e responsáveis. **Não armazena dados pessoais do destinatário em duplicidade**. O fingerprint inclui endereço de entrega, CEP de origem, volumes e conteúdos, observações de embalagem, itens/quantidades/valores do pedido e versão do integrador. Registrar novamente sem alteração preserva a mesma chave e não repete o evento de auditoria. Se os dados variaram, o registro recebe nova chave e gera evento administrativo sem conteúdo pessoal. O painel avisa quando a versão do integrador ou o serviço mudou; como alterações de origem/endereço/volumes podem tornar uma intenção antiga obsoleta, qualquer futura compra deverá **revalidar todos os dados e o fingerprint em transação antes de chamar a transportadora**.

O banco foi atualizado com migrações versionadas em `supabase/internal_label_intents_v1.sql`, `supabase/internal_label_intent_required_zip_phone_v2.sql` e `supabase/internal_label_intent_fingerprint_items_v3.sql`. A tabela possui RLS de leitura somente para admin, sem insert/update/delete direto para `authenticated`, e a RPC não aceita chamadas de `anon`. Ações são realizadas exclusivamente via função protegida. Testes de estrutura e permissões: `tests/internal-label-intents.test.mjs`.

**Limites atuais:** o estado do registro só pode ser `prepared_internal`; a chave da intenção **não é chave de idempotência homologada por Correios ou Melhor Envio**, não é etiqueta, PLP, objeto postal, cotação, rastreio nem autorização de compra. `shipment_purchased=false`, `label_generated=false` e `external_request_performed=false` são explícitos. Não há débito, mudança de estoque, pagamento, chamada externa ou liberação automática de checkout. O fluxo de compra real ainda exige contas, credenciais, contrato, parâmetros fiscais/seguros, idempotência por operação externa, persistência de respostas, cancelamento e conciliação.

**Publicação:** a Vercel Hobby atingiu o limite diário de deploy no dia 11/11/2026. Os commits podem estar na `main` sem estarem publicados; verificar o SHA efetivamente implantado e o resultado do CI antes de usar esse novo registro na aplicação. Não foi realizado teste com pedido interno elegível porque ainda não havia pedidos `paid`/`packing` no banco na verificação.

### 22.9. Cotação por pedido e volumes no sandbox Melhor Envio (sem compra)

Após criar a intenção interna na tela `/admin/logistica/volumes/[id]`, o administrador pode acessar **Simular cotação por volumes (Melhor Envio)**. O botão só habilita se: pedido ainda em preparação, todos os campos estruturais salvos, integrador e serviço numérico salvos, intenção presente na mesma versão, e variável de servidor `MELHOR_ENVIO_SANDBOX_TOKEN` existente. Não há necessidade de cadastrar o token agora; a implementação fica pronta, porém desativada.

A API `POST /api/admin/shipping/order-quote/[id]` recebe **apenas** o UUID da intenção. Revalida sessão e perfil `admin`, origem HTTP da requisição (CSRF), autorização da intenção, disponibilidade do token exclusivamente no servidor, código numérico do serviço e, antes de cotar, reexecuta a conferência transacional `stage_internal_label_intent`. Se a intenção se tornar obsoleta, sua chave é substituída e a rota devolve **409 sem chamar o provedor** — o operador deve atualizar a tela e conferir o registro renovado. Nenhum dado do carrinho é aceito diretamente do navegador.

A cotação usa exclusivamente `POST https://sandbox.melhorenvio.com.br/api/v2/me/shipment/calculate`. O payload é formado pelos **volumes reais do pedido**, com centímetros e peso convertido de **gramas para quilogramas** (até 3 decimais), mais os CEPs de origem/destino já cadastrados no banco. O módulo `src/lib/shipping/order-sandbox-quote.ts` valida CEP, quantidade de pacotes, peso, medidas e numeração, sem inventar frete. O retorno é filtrado por **ID exato do serviço** informado na intenção e normalizado em valor inteiro em centavos e dias de prazo, com preferência por `custom_price` e `custom_delivery_time`; dados irregulares são descartados. A UI apresenta apenas cotações que a sandbox realmente devolver.

**Limites e segurança:**
- **Não há endpoint de carrinho/compra/etiqueta**, postagem, PLP, rastreio, autorização fiscal ou alterações de pagamento. A API não dispara etapas de produção; somente a rota pública documentada de *cálculo sandbox* é chamada quando houver credencial de testes.
- A cotação é **volátil** e exibida somente no navegador; `quote_saved=false`, `shipment_purchased=false`, `label_generated=false`, `tracking_created=false` e `ready_for_label_purchase=false`. **Não utilizar o valor para checkout ou preço definitivo de frete.** Antes de futura compra, fazer nova cotação e conferir restrições do serviço.
- O fluxo **Correios** está deliberadamente sem cotação, aguardando contrato, API Preço/Prazo e respectivas credenciais de homologação. Não exibe preço artificial.
- O Melhor Envio permite cotar **volumes pré-embalados** pelo campo `volumes`. Porém serviços Correios, J&T e Loggi podem exigir chamadas **separadas por volume na etapa de carrinho**, mesmo após uma cotação de múltiplos volumes. A implementação futura deverá respeitar a composição autorizada pelo provedor e os requisitos de documentação/seguro, sem transformar a cotação em autorização de compra.
- Falhas de autorização, indisponibilidade de token, timeout ou erro externo não criam nenhuma compra. A API não devolve tokens, payload bruto do parceiro ou dados pessoais além de identificador interno do pedido e serviços de cotação.

**Testes:** `tests/shipping-order-sandbox-quote.test.mjs`. Também manter cobertura do fingerprint e idempotência em `tests/internal-label-intents.test.mjs`.

**Referências oficiais:** [Cotação Melhor Envio](https://docs.melhorenvio.com.br/docs/cotacao-de-fretes), [Regras para carrinho](https://docs.melhorenvio.com.br/reference/inserir-fretes-no-carrinho), [Correios API Preço](https://www.correios.com.br/atendimento/developers/manuais/manual-api-preco-1), [Correios API Prazo](https://www.correios.com.br/atendimento/developers/manuais/manual-api-prazo).

**Pendente:** integrar credenciais de sandbox, testar com pedido interno elegível, registrar snapshots de cotações com validade/fingerprint, implementar reserva/aprovação explícita, persistência privada dos IDs de etiqueta e recibo, idempotência externa, cancelamento, estorno e rastreamento após contrato/homologação.

### 22.10. Histórico privado e referência temporal das cotações sandbox

Nova tabela `shipment_sandbox_quote_snapshots` (migração `supabase/shipment_sandbox_quote_snapshots_v1.sql`) guarda **apenas o resultado normalizado da cotação**: UUID da consulta, pedido, intenção interna, fingerprint do preparo, provedor/ambiente fixos `melhor_envio/sandbox`, código/nome do serviço, transportadora, valor em centavos, prazo em dias, data e responsável. Não guarda token, endereço completo, documento ou telefone.

A gravação só ocorre após a resposta do endpoint **sandbox** de cálculo, usando a RPC `record_shipment_sandbox_quote`, restrita a administradores. Antes de inserir, o banco reexecuta `private.stage_internal_label_intent` e compara a **mesma chave da intenção**. Mudanças detectadas após a resposta do provedor impedem que um preço antigo seja associado a um pedido modificado. A RPC valida transportadora, serviço, centavos e prazo e limita a **30 resultados salvos por pedido por hora**. Isso não é um sistema de rate limiting para produção, nem uma certificação criptográfica da origem dos dados: a função é acessível a administradores. Somente o código backend da sandbox deve usá-la como fonte de registros.

A rota `POST /api/admin/shipping/order-quote/[id]` passa a retornar `quote_saved`, `quote_snapshot_id` e `quote_expires_at` quando conseguiu persistir um resultado normalizado. Respostas sem cotação válida **não** geram um valor fictício no histórico. Falhas na gravação geram erro: o sistema não comunica sucesso de arquivamento sem confirmação. O histórico é apenas de referência, jamais uma ordem de compra.

O prazo de expiração de referência é de **15 minutos**, contado pelo servidor. Não equivale a garantia de tarifa, prazo ou capacidade do Melhor Envio, nem reserva serviço. A classificação comum `src/lib/shipping/quote-history.ts` distingue **intenção substituída**, **referência vencida** e **janela interna de referência**. Mesmo nesta janela, alterações no pedido podem ter ocorrido sem que a intenção tenha sido revalidada: portanto, **nenhuma classificação indica autorização comercial**, e qualquer contratação futura exigirá nova consulta e verificação atômica no backend.

O histórico dos 12 resultados mais recentes aparece em `/admin/logistica/volumes/[id]`. A página `/admin/remessas/cotacoes` exibe até 120 registros recentes, com pedido, serviço, valor de teste, prazo e situação; exige `requireAdmin()` e é estritamente de leitura. A Central de Remessas possui atalho para esta página. Testes: `tests/shipping-sandbox-history.test.mjs` e `tests/shipping-order-sandbox-quote.test.mjs`.

**Sem compras, pagamentos ou etiquetas reais:** não há chamadas de API para carrinho, checkout, geração de etiqueta, pré-postagem, rastreio ou nota fiscal; histórico não altera checkout, faturamento, contas, estoque nem status do pedido. O módulo Correios continua aguardando contrato/homologação. A credencial `MELHOR_ENVIO_SANDBOX_TOKEN` permanece opcional e exclusivamente no servidor; sem ela, consultas externas ficam desativadas.

**Pendências futuras:** retenção documentada/automática de históricos, prova de origem do resultado apenas pelo backend confiável, comparação de preço e seguro por serviço, cotação por integração real, idempotência de compra com identificação do parceiro, validação fiscal, confirmação humana, armazenamento privado de etiquetas, cancelamentos e eventos de rastreamento.
