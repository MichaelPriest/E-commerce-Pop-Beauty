# Popê Beauty 💖

> Plataforma de e-commerce de beleza, maquiagem e catálogo reservado +18, desenvolvida com **Next.js, React, TypeScript, Supabase e Vercel**.  
> **Situação: aplicação publicada, mas NÃO liberada para vendas online reais.**  
> **Documentação revisada em:** 17/11/2026 · **Ambiente:** [Popê Beauty](https://e-commerce-pope-beauty.vercel.app) · **Branch de publicação:** `main`.

Este é o **documento principal do projeto**. Reúne recursos, URLs, arquitetura, tabelas, regras de negócio, configuração, homologação, segurança, limitações, operações e próximos passos. A implementação em código e no banco é a fonte de verdade quando existir divergência; nunca habilite recursos de produção somente com base na presença de uma tela.

Para configurar a loja, consulte o [Manual de credenciais da Popê Beauty](docs/manual-de-credenciais.md). Ele traz os campos da Vercel, os painéis dos provedores, as URLs de retorno e os testes de cada integração.

## 1. Visão geral e status

### 1.1. Painel executivo

Em 17/11/2026, o checkout administrativo passou a conferir o total com as tarifas por CEP, com origem em **04431-080**. Em seguida, foram desenvolvidos os links para pedidos internos e a conciliação pelo Mercado Pago. A ativação dos links e o checkout público estão pendentes. Consulte [pagamento de pedidos internos](#114-pagamento-de-pedidos-internos-pelo-checkout-pro).

A operação de **checkout, estorno, NF-e e etiqueta** está integrada ao pedido. A configuração e os ambientes constam em [ativação dos provedores](#115-operação-comercial-e-ativação-dos-provedores).

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

A tabela registra a configuração observada em 11/11/2026. Para o cadastro e a validação das integrações atuais, use o [manual de credenciais](docs/manual-de-credenciais.md).

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
| Mercado Pago | `MP_TEST_ACCESS_TOKEN`, `MP_TEST_SELLER_ID` |
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
| `/admin/estoque/compras` | Pedidos a fornecedores, previsão, entregas parciais e saldo por SKU |
| `/admin/estoque/recebimento` | Entrada por lote e comparação entre pedido, NF-e e contagem física |
| `/admin/pedidos` | Pedidos internos, criação e alterações de status |
| `/admin/clientes` | Clientes e relacionamentos com pedidos comerciais |
| `/admin/logistica` | Separação, expedição, rastreio e baixa FEFO |
| `/admin/remessas` | Fila administrativa de preparação por Correios/Melhor Envio (sem compra de frete) |
| `/admin/frete` | CEP de origem, peso/medidas e cotação sandbox |
| `/admin/financeiro` | Indicadores de pedidos com confirmação administrativa |
| `/admin/financeiro/compras` | Custos das entradas contabilizadas por mês e fornecedor |
| `/admin/relatorios` | Evolução mensal, CSV e alertas de estoque |
| `/admin/marketplaces` | OAuth de contas Shopee/Mercado Livre, importação manual somente leitura e vínculos de SKU |
| `/admin/notificacoes` | Fila de e-mails de pedidos; reprocessamento |
| `/admin/gateways` | Comparação de dez provedores, credenciais e preferências |
| `/admin/pagamentos` | Preparação de pagamentos TEST, links TEST e auditoria de webhooks |
| `/admin/reservas` | Reservas de homologação, itens, frete e total |
| `/admin/frete/tarifas` | Tarifas por faixa de CEP usadas no checkout de teste |
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
- As reservas criadas em **Simular somente a reserva de estoque** têm subtotal de itens. O checkout com entrega usa o fluxo abaixo.

### 8.4. Pedido de teste com frete e total

Em **Administração → Frete e embalagem → Tarifas por CEP**, cadastre o nome, a faixa de CEP, o valor e o prazo da entrega. Uma tarifa pode ser desativada na edição. As opções correspondentes aparecem quando o administrador seleciona um endereço próprio com o carrinho apto para conferência.

Ao clicar em **Criar pedido de teste**, o banco revalida a versão do endereço e da tarifa, confere os preços dos itens e reserva o estoque na mesma transação. O pedido registra os valores de itens, entrega e total. O prazo da reserva continua em 15 minutos. Cancelamento e expiração liberam o estoque pelo fluxo já utilizado em homologação. Uma repetição da mesma confirmação recupera o pedido registrado.

O resultado fica em **Minha conta** e em **Administração → Reservas**. A preparação de pagamento de teste recebe o total completo. A homologação de cobrança, a cotação comercial da transportadora e a abertura ao público são etapas do lançamento.

Aplique `supabase/checkout_delivery_rates_v1.sql` após `checkout_variant_resolution_guard_v2.sql` e antes de implantar as telas. Cadastre as tarifas que deseja testar no painel.

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

O servidor cria a preferência com preços e itens do pedido, confere o vendedor retornado e o domínio do link. Em reservas com entrega, o frete é enviado em `shipments.cost` e integra o valor conferido. Uma vez iniciada a geração, a tentativa permanece em `preparing` em caso de timeout. Confira a preferência no provedor antes de retomar.

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
6. Verifica `external_reference=pope-sandbox:<attempt_id>`, total com frete, pedido e validade da reserva.
7. Salva evento deduplicado por `(provider, external_event_id)` em `payment_webhook_receipts`; não armazena JSON integral, documentos, dados de cartão ou credenciais.
8. Mostra histórico de auditoria em `/admin/pagamentos`, incluindo status do provedor e relação com a reserva.

**Regra essencial:** mesmo se o Mercado Pago retornar `approved`, a aplicação **NÃO altera `orders.status` para `paid`**, não movimenta estoque para expedição, não emite nota nem envia e-mail de pagamento confirmado. O estado `matched` é uma **conferência de auditoria**, não liquidação financeira.

### 11.3. Limitações a resolver

Para concluir a homologação TEST, valide o fluxo com credenciais de teste do vendedor e do comprador, incluindo retornos aprovados, recusados e estornados.

### 11.4. Pagamento de pedidos internos pelo Checkout Pro

Em **Pedidos → Central do pedido → Pagamento**, o administrador poderá gerar e copiar um link para um pedido interno pendente após a homologação comercial. A validade do link é de 30 minutos. As quantias vêm do pedido, com valores de itens e frete conferidos em centavos. As reservas do checkout de teste seguem o fluxo TEST desta documentação.

A migração `supabase/commercial_order_payments_v1.sql` é aplicada após `checkout_delivery_rates_v1.sql` e `payment_gateway_evaluation.sql`. Um registro de preparação protege chamadas concorrentes e permite recuperar o link já persistido. Se a resposta do provedor for incerta, a preparação protege o intervalo de validade. Um novo link pode ser gerado depois do vencimento se o pedido continuar pendente e os pagamentos anteriores estiverem encerrados sem valor aplicado.

O webhook `POST /api/webhooks/mercadopago/orders` valida a assinatura e consulta `GET /v1/payments/{id}`. A conciliação exige conta vendedora correspondente, BRL, referência do link, pagamento comercial aprovado dentro da validade e total idêntico ao pedido. A gravação do pagamento, a mudança para `paid` e o evento do pedido ocorrem na mesma transação. O saldo reservado é consumido na expedição. A tela também consulta e concilia pelo ID do Mercado Pago para recuperar notificações ausentes.

A confirmação local é única por pedido. Retornos repetidos ou fora de ordem respeitam a última atualização do pagamento. Valores divergentes, aprovações tardias, pagamentos adicionais e contestações ficam disponíveis em **Financeiro → Pagamentos para conferir**. Um estorno ou uma contestação do pagamento que confirmou a venda exige conferência antes de novo despacho. A conferência de tarifas e repasses acompanha o extrato do provedor.

Para homologação, configure `MP_LIVE_ACCESS_TOKEN`, `MP_LIVE_SELLER_ID`, `MP_LIVE_WEBHOOK_SECRET` e `SUPABASE_SERVICE_ROLE_KEY` no servidor. No painel do Mercado Pago, configure o tópico **Pagamentos** na URL HTTPS comercial do webhook e valide a entrega ao ambiente escolhido. A variável `MP_LIVE_WEBHOOK_ENABLED=verified-live-account-only` habilita a conciliação. A criação de links depende também de `MP_LIVE_SITE_ORIGIN` e `MP_LIVE_PAYMENT_LINKS_ENABLED=internal-orders`. A retirada da flag de links suspende novas gerações e preserva a consulta de pagamentos recebidos enquanto o webhook estiver habilitado. Confira os meios de pagamento da conta e homologue o retorno, o repasse e o tratamento de divergências antes de operar.

### 11.5. Operação comercial e ativação dos provedores

Em `/checkout`, um cliente com e-mail confirmado pode selecionar seu endereço e uma tarifa por CEP, informar o nome e CPF para a NF-e e pagar no Mercado Pago quando a loja for habilitada. O PostgreSQL confere versão do endereço, revisão da tarifa, preços e saldo por SKU na mesma transação. O frete integra o total. `orders.storefront_order` identifica a compra online e integra os pedidos da vitrine ao estoque, fiscal e logística existentes. O prazo da reserva comercial é de 40 minutos, com até 30 minutos para pagamento e um intervalo para conciliação. O cliente acompanha o pedido, retoma o link e solicita cancelamento em **Minha conta**.

Em **Pedidos → Central do pedido → Estorno, NF-e e etiqueta**, o operador pode executar estas etapas:

1. **Cancelar e estornar.** Se houver possibilidade de pagamento em andamento, o sistema registra a solicitação para conferência. O estorno usa o ID do pagamento Mercado Pago e uma chave de idempotência persistida. A baixa do pedido e a liberação da reserva aguardam confirmação do estorno total. Em pedidos postados, o recebimento e a conferência dos itens antecedem a entrada física no estoque. A situação do envio e da NF-e pode ser tratada pelas respectivas ações.
2. **Emitir NF-e 55.** Carregue o rascunho de um pedido pago, complete o JSON com os dados fiscais aprovados e informe os meios de pagamento. O Focus NFe usa uma referência persistida por ambiente. A consulta mostra processamento, rejeição ou autorização, com acesso autenticado ao XML e DANFE. O cancelamento fiscal é solicitado separadamente ao emissor e respeita a situação da postagem. Dados de homologação ficam separados dos documentos de produção.
3. **Contratar e imprimir a etiqueta.** Confira remetente, destinatário e volumes. Selecione a cotação, adicione ao carrinho Melhor Envio e confira o custo antes de comprar. A geração e impressão ocorrem após a compra, com consulta de rastreio e opção de cancelar a etiqueta. A postagem de uma compra online usa a confirmação do Melhor Envio vinculada à NF-e autorizada em produção. O painel oferece PDF quando o serviço disponibiliza o arquivo e impressão pelo link privado do provedor. A integração não oferece Azul Cargo, que exige XML da NF-e no formato específico da transportadora. Para Correios, J&T e Loggi, a contratação por este fluxo cobre um volume por envio.

| Integração | Dados e variáveis do servidor |
| --- | --- |
| Mercado Pago | Variáveis da seção 11.4 e conta vendedora homologada. `SUPABASE_SERVICE_ROLE_KEY` é compartilhada pelos serviços do servidor. |
| Focus NFe | `FOCUS_NFE_ENVIRONMENT` e o token correspondente, `FOCUS_NFE_HOMOLOGACAO_TOKEN` ou `FOCUS_NFE_PRODUCAO_TOKEN`. Cadastro do emitente e certificado configurados no provedor, destinatário, tributação por item e meio de pagamento. |
| Melhor Envio | `MELHOR_ENVIO_LABEL_ENVIRONMENT`, token `MELHOR_ENVIO_SANDBOX_TOKEN` ou `MELHOR_ENVIO_PRODUCTION_TOKEN`, `MELHOR_ENVIO_CONTACT_EMAIL` e `MELHOR_ENVIO_SENDER_PHONE`. O endereço do emitente é usado como remetente e deve corresponder ao CEP de postagem configurado. |
| Abertura da vitrine | `public.store_settings.commercial_checkout_enabled` começa em `false`. Habilite só após a homologação de pagamento, NF-e e etiqueta com a conta da loja, a revisão das tarifas e a publicação das políticas comerciais. |

Aplique, na ordem, `storefront_orders_v1.sql`, `store_order_refunds_v1.sql` e `store_order_fulfillment_v1.sql` após as migrações de checkout, pagamento e preparação fiscal. As variáveis privadas permanecem no servidor. Os testes simulam respostas dos provedores e verificam as regras de pedido, estoque, NF-e e envio. A autorização fiscal, a cobrança, o estorno e a postagem reais dependem da homologação das contas e dos dados comerciais.

## 12. Pedidos internos, faturamento operacional e notificações

### 12.1. Pedidos internos

`/admin/pedidos` permite registrar pedidos administrativos com estoque reservado, itens e preços atuais. Mudanças de status são executadas por RPCs e rotas protegidas; a logística controla separação, transporte, rastreio e baixa FEFO.

O `/admin/financeiro` considera o **total bruto dos pedidos confirmados**, com as ocorrências do provedor para conferência. `/admin/relatorios` oferece evolução mensal, exportação CSV e alertas operacionais. Reservas TEST `store_api` são excluídas desses indicadores.

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

Em **Admin → Prontidão → E-mails de pedidos (SMTP)**, **Testar autenticação** abre a conexão TLS e confere o login. A entrega ao cliente é acompanhada em **Admin → Notificações**. [Configuração de e-mail](docs/manual-de-credenciais.md#e-mails-de-pedidos).

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
| `goods_receipts_supplier_register_atomic_v1.sql` | Fornecedores, rascunhos e contabilização de entradas |
| `purchase_orders_receipt_conference_v1.sql` | Pedidos de compra, conferência de NF-e e relatório de custos |
| `payment_gateway_evaluation.sql` | Configuração dos dez gateways |
| `payment_gateway_fk_index.sql` | Índice de referência na configuração |
| `preview_checkout_cart.sql` | Prévia de preço e estoque |
| `preview_checkout_cart_uuid_selection_fix.sql` | Correção da seleção de UUID |
| `checkout_addresses_reservations.sql` | Endereços, reservas, expiração e Cron |
| `checkout_delivery_rates_v1.sql` | Faixas de CEP, escolha de entrega e total das reservas administrativas |
| `exclude_checkout_test_from_financial_metrics.sql` | Exclui TEST dos relatórios financeiros |
| `shipping_sandbox_setup.sql` | CEP da loja e especificações por SKU |
| `sandbox_payment_attempts.sql` | Preparações multi-gateway e inbox de webhooks |
| `mercado_pago_test_preference.sql` | Criação única de preferência TEST |
| `mercado_pago_test_preference_domain_fix.sql` | Restrição de domínio do checkout TEST |
| `mercado_pago_test_webhook_audit.sql` | Campos de auditoria Mercado Pago |
| `commercial_order_payments_v1.sql` | Links de pagamento e conciliação de pedidos internos |
| `storefront_orders_v1.sql` | Pedidos da vitrine, entrega, reservas e acesso do titular |
| `store_order_refunds_v1.sql` | Cancelamento, estorno e liberação de estoque |
| `store_order_fulfillment_v1.sql` | Emissão de NF-e, compra de etiquetas e validação da postagem |

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

Em **Conexão com os provedores**, confira as variáveis pendentes por ambiente e cadastre as credenciais em [Vercel → Environment Variables](https://vercel.com/michael-raimundos-projects/e-commerce-pope-beauty/settings/environment-variables). Use variáveis sensíveis para os tokens e segredos. A nova configuração entra em vigor no próximo deploy. Os testes consultam a conta vendedora do Mercado Pago, o catálogo de serviços do Melhor Envio, o cadastro fiscal protegido no Supabase e o status de uma NF-e no Focus NFe. O Focus NFe depende de uma referência fiscal do ambiente para confirmar a consulta ao documento. As verificações de consulta fazem parte da preparação para os testes transacionais.

O painel informa também as pendências do emitente e do preenchimento fiscal dos produtos publicados. Os dados são conferidos em **Administração → Fiscal**. O preenchimento cadastral e a autorização de uma NF-e de homologação são etapas da conferência com a contabilidade.

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
- A autorização de loja abre `/api/v2/shop/auth_partner` na Shopee com `partner_id`, timestamp, assinatura e `redirect`. A aplicação adiciona o estado da sessão ao retorno e troca o código em `/api/v2/auth/token/get`.
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

### 22.11. Solicitações administrativas, documentos privados e ocorrências

A estrutura `supabase/shipment_workflow_and_private_documents_v1.sql` cria:
- `shipment_workflow_requests`: uma solicitação `label_preparation` por par **pedido/intent_key**, com UUID único de requisição, fingerprint da intenção, provedor, usuário e estado **somente** `prepared_internal` ou `voided_internal`. Nenhum desses estados representa compra, pré-postagem, etiqueta emitida ou rastreio.
- `shipment_internal_events`: histórico administrativo somente de criação/descarte e conferências `address_reviewed`, `packages_reviewed`, `fiscal_pending` e `carrier_pending`. Não é linha do tempo de eventos do transportador.
- `shipment_provider_documents`: metadados reservados para futuras **etiquetas oficiais**, comprovantes de postagem e manifestos do provedor, com caminho privado, SHA-256, documento e identificador conferidos. Não há rota de upload nem gravação por navegador nesta etapa.
- `shipment_tracking_provider_events`: estrutura futura para evento autenticado do provedor, com `provider_event_id` único, status/descrição, carimbo de ocorrência e recebimento. **Não há webhook, assinatura verificada ou inserção pelo cliente**; não exibir esses registros como reais sem integração e validação.
- Bucket privado `pope-shipping-private`, `public=false`, limite **8 MiB** por PDF e MIME `application/pdf`. As políticas existentes de `storage.objects` referem-se a outros buckets. O novo bucket não tem políticas de leitura/escrita direta por `anon` ou `authenticated`. A função de recuperação privada por URL temporária **ainda não foi exposta**; futuramente exigirá autorização por pedido, tipo de documento e expiração mínima, sem expor service role no cliente.

As RPCs `prepare_shipment_workflow_request(order_id,intent_key)`, `void_internal_shipment_request(request_id)` e `log_internal_shipment_review(request_id,review_type)` verificam **admin** no banco, revogam execução para `anon` e não fornecem INSERT/UPDATE direto ao cliente nas tabelas. Criar uma solicitação exige revalidar `stage_internal_label_intent` de forma transacional; chamadas repetidas com os mesmos dados preservam a solicitação e não duplicam eventos. Descartar é idempotente, gera trilha `order_events` e **não** envia cancelamento aos Correios/Melhor Envio. Uma solicitação descartada não pode ser reaberta para a mesma versão de intenção. Revisões internas não alteram automaticamente status do pedido, estoque ou financeiro.

Na administração, `/admin/remessas/solicitacoes` lista solicitações, versões e documentos vinculados sem apresentar falsos despachos. `/admin/logistica/volumes/[id]` exibe o painel **Solicitações, documentos e ocorrências**, com preparação de solicitação, descarte com confirmação, quatro tipos fechados de conferência e histórico. Todas as páginas são protegidas por `requireAdmin()`.

A validação de caminhos PDF foi normalizada pela migração `supabase/shipment_documents_path_regex_v2.sql`. Testes de estrutura, permissões, eventos e bloqueios estão em `tests/shipment-workflow-private-documents.test.mjs`.

**Atenção:** a implementação cria o cofre e a infraestrutura de metadados, **não armazena nenhuma etiqueta oficial neste momento**. Inserções futuras exigem adaptador de transportadora homologado, validação de assinatura/autenticidade das respostas, confirmação fiscal e autorização, além de acesso restrito do servidor ao Storage.

### 22.12. Etiquetas internas por volume (não postais)

Para pedidos administrativos completos na conferência de volumes, a tela `/admin/logistica/volumes/[id]` oferece **Imprimir etiquetas internas por volume (10 × 15 cm)**. A página `/admin/logistica/etiquetas-internas/[id]` valida o admin e o mesmo checklist do preparo: status elegível, CEP de origem/destino, nome, endereço completo e todos os volumes previstos com peso e dimensões válidos. Se houver pendências, a impressão é bloqueada.

Cada volume recebe uma página de **100 × 150 mm**, com pedido, posição `1 de N`, destinatário/endereço, peso bruto, dimensões e marca da Popê Beauty. Há avisos impressos em destaque: **ETIQUETA INTERNA — NÃO VÁLIDA PARA POSTAGEM** e indicação de que não é PAC, SEDEX, PLP, NF-e nem etiqueta de transportadora. **Nenhum código de rastreamento fictício ou código de barras postal é gerado.** O botão usa a impressão local do navegador; não grava PDFs no Storage e não representa contratação de frete.

Essas páginas contêm dados pessoais do destinatário e ficam restritas ao admin. Os papéis impressos devem ser protegidos e descartados conforme as políticas de privacidade da loja. Testes: `tests/shipment-internal-labels.test.mjs`.

**Restante para operação postal oficial:** conectar contratos/credenciais somente após definição dos provedores; calcular serviços com respostas válidas; obter autorização fiscal/financeira; executar compra com idempotência real; persistir etiquetas e comprovantes fornecidos oficialmente no bucket privado; implementar cancelamento/devolução junto ao parceiro; verificar e conciliar eventos de rastreamento assinados/autenticados; liberar acesso aos documentos por URL temporária sob autorização.

### 22.13. Documentos oficiais: download privado auditado e guardas de cancelamento

A migração `supabase/shipment_secure_documents_readiness_v1.sql` reforça a associação de `shipment_provider_documents` e `shipment_tracking_provider_events` com **o mesmo pedido da solicitação**, mediante chave estrangeira composta `(request_id,order_id)`. Documentos só podem ser indexados no caminho privado canônico `orders/<order UUID>/requests/<request UUID>/<document UUID>.pdf` no bucket `pope-shipping-private`. Isso isola namespaces e impede metadados que associem o arquivo de um pedido à solicitação de outro.

A tabela `shipment_document_access_events` audita acessos confirmados de administradores a PDFs oficiais por identificador, pedido, usuário, SHA-256 e horário. RLS somente leitura para admin; **sem INSERT/UPDATE do navegador e sem acesso anônimo**. A inserção da auditoria só pode ocorrer pelo código confiável do servidor. O arquivo é privado; seus bytes e dados do destinatário não são replicados no registro de auditoria.

A rota `GET /api/admin/shipping/documents/[id]` exige **sessão autenticada e perfil admin**, verifica metadados, pedido de origem `admin_manual`, solicitação correspondente, bucket/caminho canônicos e confirmação da integridade SHA-256 do arquivo. Uma verificação adicional testa cabeçalho `%PDF-`, marcador de fim `%%EOF` e limite de 8 MiB; é somente um filtro de integridade básica, **não é validação estrutural completa de PDF nem prova de que o documento foi emitido pelo provedor**. Se tudo estiver conforme, a rota registra auditoria e envia PDF como **attachment**, com cabeçalhos `Cache-Control: private, no-store`, sem disponibilizar links públicos ou signed URLs. Se não puder gravar auditoria, o acesso falha fechado.

A chave `SUPABASE_SERVICE_ROLE_KEY` é **opcional e exclusivamente de servidor** (nunca usar `NEXT_PUBLIC_`). Enquanto não for configurada, a rota devolve indisponibilidade e os botões de PDF ficam ocultos. Isso não autoriza inserir etiquetas: **não há rota de upload nem adaptador habilitado**. A configuração de credenciais deve continuar como última etapa, depois da homologação e revisão de segurança; não copiar chaves para o repositório.

O painel `/admin/remessas/evidencias` reúne documentos oficiais, ocorrências autenticadas do provedor e últimos registros de download, somente para administradores. A mesma visualização está no detalhe `/admin/logistica/volumes/[id]`. Ausência de registros é apresentada explicitamente, **sem inventar códigos de rastreio, entregas ou documentos**. Verificações automatizadas em `tests/shipment-secure-documents.test.mjs`.

A migração `supabase/shipment_cancel_evidence_guard_v1.sql` impede o `void_internal_shipment_request` de descartar uma preparação caso ela já tenha algum documento oficial ou evento autenticado associado. Triggers de integridade bloqueiam futuras inserções/atualizações de comprovantes ou rastreios quando a solicitação está descartada, pertence a outro pedido ou (para eventos de rastreamento) se o provedor difere da solicitação. **Descartar preparação interna continua não realizando cancelamento externo.** Solicitar reembolso ou cancelamento junto ao parceiro exigirá um fluxo independente de compra confirmada, consulta, idempotência e resposta verificada.

**Escopo explicitamente desativado:** obtenção de PDFs diretamente dos Correios/Melhor Envio, emissão de NF-e, compra de frete, autenticação de webhooks, atualização automática de `orders.status`, estornos e cancelamentos externos. Nenhuma dessas ações é representada pelas tabelas atuais. Antes da liberação de produção será necessário homologar o backend com credenciais reais, autenticar assinaturas/retornos do provedor, registrar IDs de compra e objetos postais com idempotência, modelar comprovantes e regras fiscais e revisar LGPD e retenção de documentos.

### 22.14. Revisão de cancelamento: somente administrativa, nunca comando externo

A migração `supabase/shipment_cancellation_review_queue_v1.sql` cria `shipment_cancellation_reviews` e duas RPCs protegidas: `open_shipment_cancellation_review` e `dismiss_shipment_cancellation_review`. A revisão é **única por solicitação logística**, vinculada ao mesmo pedido por FK composta, com motivo controlado, observação limitada a 300 caracteres e status restrito a `pending_internal_review` ou `dismissed_internal`. Ela **não representa pedido de cancelamento aceito pelos Correios/Melhor Envio**.

A abertura só é permitida a administrador quando a solicitação está ativa e há **documento oficial ou evento autenticado já registrado** para a mesma solicitação. Como atualmente nenhum adaptador oficial grava esses dados, o botão permanece bloqueado para preparações sem evidência. Operações repetidas não duplicam a revisão. O encerramento é idempotente, gera auditoria em `order_events`, não cancela fretes, não altera `orders.status`, não estorna pagamentos e não realiza chamadas HTTP ao provedor. Não é possível reabrir uma revisão encerrada para a mesma solicitação. Os textos operacionais deixam clara essa separação.

A tela `/admin/logistica/volumes/[id]` oferece o painel de revisão condicionado à existência de prova do provedor na solicitação vigente. A fila `/admin/remessas/cancelamentos` mostra revisões abertas/encerradas e o link ao pedido; o atalho está na Central de Remessas. Ambas são páginas administrativas. Os testes de autorização, evidência obrigatória, bloqueio de ações externas e idempotência estão em `tests/shipment-cancellation-reviews.test.mjs`.

**Escopo futuro:** construir um fluxo independente para cancelamento externo **após** uma compra real comprovada, com idempotency key por operação, consulta do status no provedor, reversão autorizada, reconciliação financeira de estorno, documentação fiscal pertinente e eventos auditáveis de sucesso/erro. Nenhuma revisão interna atual autoriza isso.

### 22.15. Checklist de pré-contratação e chave técnica de controle interno (sem compra)

Antes de programar chamadas de compra de etiquetas, a Popê Beauty possui o fluxo de **pré-contratação administrativa** em `/admin/logistica/volumes/[id]`. O usuário precisa ter uma solicitação de expedição interna ativa e a mesma intenção/versionamento do pedido. As cinco conferências são: (1) destinatário/endereço, (2) quantidade, pesos e dimensões das embalagens, (3) status do pagamento administrativo, (4) cadastro e rascunho da documentação fiscal, (5) restrições/condições manuais do transportador. **Marcação de checklist não equivale a autorização SEFAZ, recebimento bancário confirmado, preço válido da transportadora nem autorização de compra.**

A migração `supabase/shipment_purchase_preflights_v1.sql` cria a tabela `shipment_purchase_preflights` vinculada por FK composta ao pedido e à solicitação. Há exatamente uma revisão por solicitação (`request_id` único), uma `review_key` versionada, cinco booleanos obrigatórios, responsável e carimbo de data. O campo `checklist_complete_internal` é **gerado pelo banco** somente quando os cinco itens estão marcados. A função `save_shipment_purchase_preflight`, acessível apenas ao admin autenticado, revalida a intenção em transação, o fingerprint e o status do pedido, bloqueia conferência posterior à existência de documentos/rastreio do provedor ou cancelamento em análise, e exige cadastros fiscais mínimos caso o item fiscal seja marcado. A migração `supabase/shipment_purchase_preflight_lock_order_v2.sql` uniformiza a ordem de locks **pedido → solicitação** para evitar inversões com as outras RPCs de expedição. Enviar os mesmos valores não gira a chave nem repete `order_events`.

A tabela `shipment_purchase_guards` (`supabase/shipment_purchase_guard_blocked_v1.sql`) estabelece **uma única identidade técnica por pedido**, com `guard_key`, `guard_revision`, request, intenção, fingerprint e chave da conferência. A função `reserve_shipment_purchase_guard` somente registra/atualiza essa identidade depois de verificar todos os cinco itens e revalidar dados do pedido; chamadas repetidas preservam o UUID. Alterações do checklist ou da intenção exigem nova conferência e regeneram a chave de forma auditada. A migração `supabase/shipment_purchase_guard_order_wide_evidence_v2.sql` bloqueia renovação quando o pedido já tem documentos ou rastreio externo em **qualquer** solicitação anterior ou cancelamento pendente. **Status obrigatório e imutável: `blocked_homologation`**. Esta identidade **não é idempotency key oficial do Melhor Envio/Correios**, nem garante que o parceiro não comprará duas etiquetas: a prevenção externa depende de reconciliação e recursos de idempotência da API homologada.

As tabelas têm RLS com **SELECT somente para administrador** e nenhuma permissão de escrita direta ao browser. As RPCs públicas fazem checagem de sessão e de `private.is_admin()`, negando execução a `anon`. Os retornos declaram explicitamente `shipment_purchased=false`, `provider_request_performed=false`, `ready_for_label_purchase=false`, e não existem chamadas HTTP de compra, carrinho, geração de PLP ou rastreamento nesse fluxo.

A página `/admin/remessas/precontratacao` apresenta os checklists mais recentes, suas versões e as chaves vigentes, classificadas por `src/lib/shipping/preflight-status.ts`. Ela é protegida com `requireAdmin()` e somente leitura. O atalho fica na Central de Remessas. A página de volumes contém o formulário de checklist e um painel específico para registrar/conferir a chave técnica. Testes em `tests/shipment-purchase-preflight.test.mjs`.

**Próximo passo de produção (ainda NÃO implementado):** conectar autorização fiscal de verdade (XML e protocolo SEFAZ), verificar compra/pagamento, obter cotação comercial no provedor com regras por pacote/seguro, configurar credenciais apenas em ambiente próprio e registrar o resultado de compra/identificadores oficiais de forma idempotente, recuperável após timeout e reconciliável antes de qualquer segunda tentativa. Uma revisão humana da integração e políticas de acesso é obrigatória antes de liberar esse passo.

### 22.16. Logotipo existente em resolução ampliada (sem mudança de identidade)

O logo original da Popê Beauty continua no arquivo **`public/logo.webp` (96 × 96 px)**. Não foi substituído por uma nova arte e suas cores, ilustrações, letras e composição não foram redesenhadas. Para melhorar a nitidez na apresentação do site, `scripts/enhance-brand-logo.mjs` produz derivados `public/logo-hd-512.webp` (512 × 512) e `public/logo-hd.webp` (1024 × 1024) a partir do arquivo original, usando interpolação Lanczos3, nitidez leve e WebP de alta qualidade. O comando é executado antes de `next build` e na inicialização de `npm run dev` (`predev`), sem exigir upload adicional ou manipulação manual dos arquivos gerados.

O componente `src/components/brand.tsx` utiliza `srcSet` para carregar uma versão de mais pixels em monitores de alta densidade, mantendo a mesma dimensão visual de 99 px no desktop e 66 px no celular. O arquivo original é preservado como matriz da marca e o funcionamento é verificado em `tests/brand-logo-hd.test.mjs`.

**Limite importante:** interpolação de 96 px para 1024 px não recria os detalhes que não existiam na fonte, especialmente textos muito pequenos e traços delicados. Para impressão de alta qualidade em peças grandes, o ideal é obter o arquivo de criação original em vetor (SVG, PDF vetorial ou AI) ou uma matriz com alta resolução nativa. Não chamar a ampliação de vetorização nem de reconstrução por IA.

### 22.17. Plano de contratação bloqueado e reconciliação após falhas (fase sem credenciais)

A migração `supabase/shipment_provider_operation_plans_blocked_v1.sql` adiciona a tabela `shipment_provider_operation_plans` com **no máximo um plano por pedido**, vínculo obrigatório à solicitação, `guard_key`, checklist e fingerprint. São permitidos somente os estados `blocked_no_dispatch`, `internal_review_required` e `archived_internal`: **nenhum indica compra, postagem, emissão de etiqueta ou envio de solicitação ao parceiro**. O banco impõe `external_dispatch_count=0`, `external_order_id IS NULL` e `purchase_confirmed_at IS NULL`. A tabela `shipment_operation_plan_events` audita criação, abertura de revisão preventiva e arquivamento, com `external_request_performed=false`.

As RPCs `stage_shipment_provider_operation_plan(request_id,guard_key)`, `review_shipment_provider_operation_plan(plan_id,reason,notes)` e `archive_shipment_provider_operation_plan(plan_id)` validam sessão admin, revogam `EXECUTE` para `anon`, executam somente transações locais e **não chamam API do Melhor Envio ou Correios**. A primeira revalida a intenção, o fingerprint do pedido, a guarda vigente, checklist concluído e ausência de documentos/eventos externos ou cancelamento pendente; o mesmo pedido/chave não cria segunda linha ou segundo evento. Uma segunda intenção não pode criar outro plano para o mesmo pedido. A revisão tem motivos limitados (`integration_pending`, `configuration_review`, `duplicate_risk`, `timeout_policy_review`, `other`); o último é **avaliação da política de timeout, não ocorrência real**. Arquivar é idempotente e **não permite comprar, reenviar, alterar pedido ou estornar**.

A migração `supabase/shipment_operation_plan_freeze_workflow_v2.sql` congela mudanças na guarda técnica e no checklist após o registro do plano, bloqueia descarte da solicitação e uniformiza a ordem de locks **pedido → solicitação → checklist → guarda**, minimizando conflitos de operações concorrentes. Esses bloqueios preservam integridade histórica e não representam garantia de idempotência na plataforma do provedor.

A página `/admin/logistica/volumes/[id]` apresenta o painel de plano operacional depois da chave técnica, com botão de registro sem compra, análise administrativa de riscos, arquivamento com confirmação e histórico. A rota `/admin/remessas/reconciliacao` consolida planos e auditoria com filtro de acesso `requireAdmin()` e está disponível pela Central de Remessas. Os dados são privados e não recebem escrita direta do browser: somente RPCs com checagem de perfil administrador.

**Política futura de respostas ambíguas:** `src/lib/shipping/provider-reconciliation.ts` classifica, em memória e sem chamadas HTTP, as hipóteses `never_dispatched`, `dispatched_timeout`, `dispatched_unverified_response`, `verified_purchase_found` e `verified_no_purchase_found`. Em **todos** os casos `automaticRetryAllowed=false`. Timeout, resposta não verificável ou busca inconsistente exigirão reconciliação manual com o provedor antes de uma nova tentativa. Uma confirmação externa autenticada não grava compra automaticamente; isso só será possível quando houver adaptador homologado, chave de idempotência reconhecida pelo parceiro, validação fiscal/pagamento e transação auditada de compra.

Testes de integração estrutural e regras conservadoras: `tests/shipment-provider-reconciliation.test.mjs`. **Nenhum pedido real, pagamento, nota fiscal, frete, etiqueta ou evento foi criado por este desenvolvimento**. IDs, segredos e tokens de compra continuam para a última fase.

### 22.18. Primeira rodada de simplificação operacional (P0)

Esta entrega melhora a experiência da loja e do painel sem habilitar transações comerciais:

1. **Catálogo paginado e busca no servidor.** `src/lib/catalog.ts` substitui o limite fixo de 24 resultados e o filtro apenas no navegador por consultas Supabase com `count:'exact'`, filtros de nome/marca/descrição, categoria via join e paginação de 12 itens; os parâmetros são normalizados em `src/lib/catalog-query-core.ts`. A página `/` exibe busca, contagem real, próxima/anterior e páginas. `/produto/[slug]` agora consulta diretamente por slug, evitando itens inacessíveis por não estarem na primeira página.
2. **Disponibilidade sem expor inventário.** `supabase/catalog_public_availability_safe_v1.sql` cria `public.catalog_product_availability(uuid[])`, com um lote máximo de 24 IDs por chamada e retorno somente de ID, status e número de variações ativas, sem quantidades internas, IDs de lote ou produtos adultos. O cálculo usa o mesmo critério da prévia do checkout: variante única ativa, `inventory.on_hand - inventory.reserved` e lotes não vencidos (horário de São Paulo). O componente `ProductCard` mostra **Disponível para conferência**, **Esgotado**, **Indisponível** ou **Escolher variação**. Um status não confirmado falha fechado, desabilitando a inclusão no carrinho; pedidos e pagamentos continuam desativados. Produtos demonstrativos não são adicionados ao carrinho.
3. **Favoritos locais.** O coração dos cartões persiste no `localStorage` deste navegador, com a chave `pope-favorites`. **Não é lista de desejos sincronizada entre dispositivos** e não cria registros no Supabase.
4. **Dashboard orientado por pendências.** `/admin` consulta produtos públicos ativos com variantes, estoques e lotes e apresenta quantidades acionáveis de **foto ausente**, **descrição curta**, **estoque esgotado**, **pedidos pendentes** e **notificações pendentes/falhas**. As consultas desse diagnóstico são limitadas a 250 produtos com alerta explícito caso o limite seja alcançado. Não alteram automaticamente os dados.
5. **Cadastro de produtos mais prático.** `/admin/produtos` agora tem filtro **Com pendências na vitrine**, indica problemas individuais (foto, descrição, preço, SKU, estoque) e utiliza formulário guiado de **três etapas**: identificação e descrição → preços e foto → SKU, estoque e publicação. A administração continua permitindo salvar rascunhos e mostra aviso antes da publicação de itens sem foto ou com descrição curta. As regras existentes de acesso, upload privado +18, criação de SKU e movimentação auditada de estoque continuam preservadas.

Testes: `tests/catalog-experience-p0.test.mjs`. O cálculo de disponibilidade foi validado contra um produto público sem saldo, sem gerar estoque fictício nem abrir reservas. As consultas públicas nunca devolvem detalhes de lote, custo ou saldo físico. Esta entrega **não implementa checkout comercial, pagamento, sincronização de marketplaces ou emissão SEFAZ**.

**Próximas melhorias recomendadas:** integração de seleção de variações no carrinho/checkout (hoje a prévia exige SKU único), fotos múltiplas e otimização de imagem, pedido com acompanhamento em uma página, regras fiscais e atendimento ao consumidor, testes ponta a ponta de navegação, políticas de venda/LGPD e automação de notificações somente após homologação.

### 22.19. Central única de acompanhamento de pedidos — leitura administrativa

A rota `/admin/pedidos/[id]` foi adicionada como **visão unificada somente leitura**, protegida por `requireAdmin()` e validação do UUID. Consulta somente os registros vinculados ao pedido selecionado: dados gerais e itens; eventos auditáveis; notificações e falhas de envio; preparação fiscal (rascunhos/recipiente e estado interno da integração); volumes e preparação da embalagem; solicitações de etiqueta; documentos e rastreamento do provedor; tentativas de pagamento **sandbox**, seus retornos vinculados e plano técnico de frete. A visualização de pagamentos sandbox é exclusivamente informativa, não liquida operações ou modifica o pedido.

Os cartões de acompanhamento mostram **Pedido → Pagamento → Fiscal → Separação → Transporte → Comunicação**, com status conservadores `Registro administrativo`, `Exige conferência`, `Pendente` e `Não aplicável`. As regras ficam em `src/lib/orders/order-command-center.ts`. **Um pedido com `status='paid'`, `'shipped'` ou `'delivered'` não é considerado prova de recebimento bancário, NF-e autorizada ou entrega comprovada pela transportadora**, pois esses status também podem ser informados manualmente. Um código de rastreamento digitado pelo operador é distinguido de evento autenticado; rascunho fiscal e formulário de conferência não são XML autorizado. Mesmo documentos do provedor cadastrados exigem revisão de autenticidade e não alteram o status automaticamente. O plano logístico não equivale à compra.

O sistema sugere a primeira pendência estrutural encontrada, sem criar ordens e sem executar pagamentos, compras, envio de e-mails ou movimentações de estoque. A central tem âncoras para navegar sem trocar de página, atalhos para ações existentes, pedido e endereço, totais de itens, auditoria e link à prontidão de produção. As áreas ficam organizadas em cards responsivos, com CSS local em `src/app/admin/pedidos/[id]/order-center.css`. Os registros são apresentados somente a administradores.

A lista `/admin/pedidos` ganhou o botão **Central do pedido**, a área `/admin/logistica` também permite navegar pelo identificador ou pelo atalho **Central do pedido** e os pedidos recentes no dashboard apontam para o detalhe. Um `/admin/pedidos?pedido=<uuid>` destaca o pedido na lista para as ações manuais já existentes, sem clonar regras de transição. A página `/admin/fiscal?pedido=<uuid>` seleciona automaticamente o pedido na aba **Pedidos**, respeitando os registros acessíveis ao operador; não há mudança na lógica fiscal existente. Para pedidos de origem `store_api`, a central aponta para os pagamentos de homologação, não para a emissão/preparação interna restrita a `admin_manual`.

**Limites:** as consultas exibem as últimas 100 ocorrências, 50 notificações e pequenas listas de evidências, com avisos de corte; esse painel não é substituto de relatórios auditáveis completos. A central não apresenta dados de emissão oficial SEFAZ inexistentes e não ativa checkout, gateways, emissão de etiquetas, rastreamento real ou compras de frete. A operação permanece em homologação e sem credenciais comerciais. Testes automatizados: `tests/order-command-center.test.mjs`.

### 22.20. Geração automática de SKU no cadastro de produtos e variações

O SKU interno agora é **opcional** nos formulários `/admin/produtos` de **Novo produto** e **Nova cor/variação**. Se estiver vazio, as RPCs existentes `public.create_product_with_variant` e `public.add_product_variant` chamam `private.generate_product_sku()` **durante a mesma transação** que insere o produto ou a variação. O formato é `POP-0000001`, `POP-0000002`, e assim sucessivamente, utilizando `private.product_sku_counter` e `nextval()` atômico. A constraint `variants_sku_key` continua garantindo unicidade, mesmo sob cadastros concorrentes. Falhas podem deixar lacunas na sequência (comportamento normal do PostgreSQL). A função de geração é exclusiva de administradores autenticados, não é uma endpoint pública de inventário e não revela estoque. A sequência não concede uso direto a `anon` nem `authenticated`.

**SKUs existentes permanecem intocados.** Quando preenchido manualmente, o SKU é preservado conforme o fluxo anterior, com a restrição de que novos códigos no formato `POP-<7 ou mais dígitos>` são reservados para a geração automática. O **EAN/código de barras é independente** do SKU interno. A interface informa que o código só será gerado e confirmado ao salvar; após o cadastro, tenta buscar e exibir o SKU efetivamente gravado. Não pré-reserva SKUs ao abrir o formulário, nem insere produtos fictícios para teste.

Migrações: `supabase/product_sku_generator_sequence_v1.sql` e `supabase/product_sku_auto_registration_v1.sql`.

### 22.21. Categorias e subcategorias gerenciáveis

A tabela `public.categories` recebeu `parent_id` opcional: `NULL` representa categoria principal, e uma referência a outra **categoria principal** representa subcategoria. A migração `supabase/categories_subcategories_hierarchy_v1.sql` mantém todos os IDs, categorias, produtos e links existentes e bloqueia hierarquias de três níveis, autociclos, subcategoria ativa sob categoria principal desativada e divergências de classificação etária entre pai e filho. Um produto publicado deve pertencer a uma categoria ativa. Desativar categoria/subcategoria com produtos ativos, ou uma categoria principal com filhos ativos, é proibido pelo banco. A classificação etária de produtos +18 e as regras existentes de RLS foram preservadas.

A nova página `/admin/categorias`, restrita ao administrador por `requireAdmin()` e políticas RLS existentes, permite cadastrar **categoria principal**, criar **subcategoria**, editar nome/ordem e ativar/desativar itens sem excluir produtos. Possui busca, resumo de categorias e subcategorias, hierarquia visual, slug criado automaticamente e avisos de integridade. Para manter links de vitrine estáveis, o slug não muda ao editar o nome. A hierarquia de um registro existente também não é alterada pela interface.

O cadastro `/admin/produtos` apresenta categorias principais agrupadas com suas subcategorias por `<optgroup>`, além de atalho para criar categorias. Na vitrine `/`, os atalhos de categorias passaram a ser carregados dos registros ativos e públicos, com links de subcategoria. O filtro de uma categoria **inclui produtos associados diretamente a ela e a todas suas subcategorias ativas**; o filtro de subcategoria retorna apenas produtos daquela subcategoria. URLs antigas `?categoria=Make` continuam aceitas, e novas URLs usam slugs estáveis (por exemplo `?categoria=make-batons`). Áreas restritas por idade não são incluídas nas consultas públicas da vitrine.

Arquivos: `src/lib/catalog-category-core.ts`, `src/app/admin/categorias/page.tsx`, `src/app/admin/categorias/category-manager.tsx`, `src/lib/catalog.ts`, `src/app/page.tsx`, `src/components/admin-shell.tsx`. Testes: `tests/categories-sku-automatic.test.mjs`. Não foi necessário cadastrar subcategorias de exemplo no banco nem modificar produtos existentes. Os arquivos de migração ficam no repositório para reprodução em homologação e auditoria.

### 22.22. Galeria de fotos, variações e carrinho por SKU (fase sem pagamentos)

A rota de administração `/admin/produtos/[id]/imagens` gerencia até **oito fotos adicionais** de um produto, além da capa já cadastrada em `products.image_url`: upload JPG/PNG/WebP de até 5 MB (bucket público `product-images`), descrição alternativa da foto, movimentação de ordem e remoção. O link de galeria aparece nas ações de cada produto público. A migração `supabase/public_product_gallery_v1.sql` cria `public.product_gallery_images` com RLS de leitura somente de produtos ativos **não adultos** (ou admin), escrita exclusivamente por admin, máximo de oito fotos e caminho de armazenamento associado ao UUID do produto. `supabase/product_gallery_admin_reorder_guard_v2.sql` oferece `reorder_product_gallery` admin-only com conferência transacional do conjunto de IDs; protege também a reclassificação de produtos com fotos públicas para a área +18. A capa principal continua sendo editada pelo cadastro de produtos. **Não** foram criadas imagens fictícias nem alteradas fotos existentes.

Na vitrine, `/produto/[slug]` apresenta miniaturas, navegação entre imagens e **seleção de cor/variação/SKU**. `public.catalog_variant_availability(uuid[])` retorna apenas as variações ativas dos produtos públicos não adultos e um booleano de disponibilidade, calculado com estoque e lotes não vencidos, **sem divulgar quantidades, custo ou IDs de lotes**. O botão de adicionar ao carrinho só fica ativo para uma variação escolhida com saldo válido; itens sem seleção quando houver múltiplas cores não recebem seleção automática.

O carrinho local passa a identificar linhas por `product_id:variant_id`, mantendo versões antigas sem variante em caráter de prévia. `src/lib/cart-core.ts` normaliza dados de `localStorage`, rejeita identificadores inválidos e impede mais de 30 linhas/99 unidades por linha. A interface `/carrinho` mostra a variante e permite voltar à página do produto para trocar a cor; preços locais são **apenas ilustrativos**.

A migração `supabase/checkout_variant_selection_v1.sql` permite `variant_id` opcional no JSON de `private.preview_checkout_cart` e `private.create_checkout_order` (somente reserva de **homologação**, com as restrições preexistentes). Ambas revalidam que o SKU pertence ao produto, está ativo e possui saldo e lotes elegíveis; a primeira não reserva nem gera pedido. `supabase/checkout_variant_resolution_guard_v2.sql` impede selecionar automaticamente a primeira cor quando existem várias e evita linhas duplicadas do mesmo SKU resolvido. As rotas `/api/checkout/preview` e `/api/checkout/test-reservation` passam o `variant_id` validado ao banco; a UI da prévia identifica a variação. A simulação de frete do Melhor Envio, exclusiva do **sandbox e admin**, escolhe peso e dimensões do `variant_id` informado e não utiliza as medidas de outra variação.

O fluxo **não ativa checkout comercial, cobranças, autorização SEFAZ, compra de frete ou postagem**. As credenciais de produção permanecem para a etapa final. Nenhum pedido foi criado para validar esta entrega. Testes: `tests/product-gallery-variants.test.mjs`. A consulta de prévia foi conferida no banco com SKU de produto existente sem estoque: retornou `out_of_stock`, e um ID de variação inválido retornou `unavailable`.

**Próximas melhorias:** múltiplas imagens vinculadas a cada variação (atualmente as fotos são do produto), interface de escolha de variação diretamente nos cards para itens com várias opções, sincronização opcional do carrinho para a conta, revisão responsiva em navegador real e processo comercial de pagamento/fiscal/frete somente após homologação.

### 22.23. Fotos específicas por cor/SKU, com fallback para a galeria geral

A migração `supabase/product_gallery_variant_binding_v1.sql` acrescenta `variant_id` opcional a `public.product_gallery_images`. `NULL` mantém a foto como **imagem geral**, preservando todas as fotografias existentes. Para fotos associadas a uma cor, a FK composta `(variant_id,product_id) → variants(id,product_id)` exige que o SKU pertença ao **mesmo produto**, mesmo em operações concorrentes ou updates diretos; mudanças do produto de destino do SKU são restritas e a exclusão do SKU limpa apenas `variant_id`, tornando a foto geral, sem excluir o arquivo. A hierarquia de permissões já implantada continua: fotos públicas somente de produtos não adultos, oito fotos adicionais por produto, admin-only para gravar/ordenar e RLS para leitura.

**Painel administrativo:** em `/admin/produtos`, expanda **Ver variações** e utilize o atalho **Fotos** ao lado do SKU; ele abre `/admin/produtos/[id]/imagens?sku=<variant_id>` com essa variação pré-selecionada. No gerenciamento de fotos, selecione **Todas as cores (foto geral)** ou uma variação ativa/inativa do produto antes do upload; também é possível reatribuir fotos já existentes e ajustar sua descrição sem reenviar o arquivo. São mantidos limite de 8 fotos, formatos JPG/PNG/WebP, máximo 5 MB, atualização/remoção e ordenação. A capa principal continua independente, editável em **Editar produto → Preços e fotografia**. Nenhuma imagem de produto +18 é exposta ou tratada nessa área.

**Vitrine pública:** `src/lib/catalog.ts` devolve `variant_id` nas fotos extras. `src/lib/product-gallery-core.ts` define a ordem da galeria. Sem escolha de variante, são exibidas **capa e fotos gerais**; ao selecionar um SKU, aparecem primeiro **as fotos dessa cor**, depois a capa e as fotos gerais. Fotos de outras cores não são exibidas; quando a variação não possui imagens próprias, a capa e imagens gerais servem de fallback. A mudança da cor reinicia a seleção na primeira foto; miniaturas e setas continuam utilizáveis. A seleção não altera preços ou saldos: o checkout permanece consultando estoque real por SKU e pagamentos continuam desativados.

**Validação:** `tests/product-gallery-by-variant.test.mjs` cobre filtragem por SKU, fallback, ausência de vazamento cruzado de fotos entre cores, deduplicação, integridade da FK e atalhos administrativos. A verificação do banco deve ser feita sem criar produtos/imagens fictícios. Os testes não substituem uma conferência visual com fotos reais cadastradas.

### 22.24. Seleção de cores diretamente na vitrine e miniatura no carrinho

A página pública do catálogo agora carrega `catalog_variant_availability` e os caminhos da tabela `product_gallery_images` **em lote, por página de 12 produtos**, juntamente com a disponibilidade geral. O modelo `Product.preview_variants` fornece SKU, nome, tonalidade, booleano de disponibilidade e URL pública da foto correspondente — nunca saldo, reservas ou lotes. O processo usa `cardVariantCover` para preferir foto do SKU selecionado e recorrer à capa ou foto geral quando necessário. Não há uma consulta Supabase por cartão individual.

Nos cartões da vitrine, até seis opções são exibidas como miniaturas ou iniciais identificadas; um link leva à ficha completa quando existem mais de seis variações. O cliente pode selecionar uma opção, conferir a foto e a disponibilidade do SKU e adicioná-lo ao carrinho **somente** se a opção selecionada estiver disponível. As opções esgotadas podem ser visualizadas, mas não adicionadas. Ao abrir a página do produto pelo cartão, o link `?variacao=<uuid>` pré-seleciona a cor se ela realmente pertencer ao produto. O botão continua desabilitado para produtos de demonstração e produtos sem disponibilidade confirmada.

O carrinho mantém **linhas separadas por `product_id + variant_id`**, como na fase anterior, e agora também exibe a miniatura da cor/SKU escolhido, o identificador e um atalho para visualizar suas fotografias ou escolher outra cor. A foto é opcional e permanece somente no navegador, sob `pope-cart`. A função `safeCartImageUrl` rejeita `javascript:`, `data:`, URLs sem HTTPS e endereços começando por `//`, para não confiar cegamente no conteúdo de `localStorage`. Adicionar novamente a mesma cor atualiza quantidade e imagem da linha; a foto **não** é uma fonte de verdade para estoque ou preço.

A conferência definitiva permanece no checkout, que recebe o `variant_id` e valida SKU, preços e lotes no banco. **O pagamento comercial continua desativado**, e nenhuma compra, reserva real, nota fiscal ou etiqueta de transporte foi criada por esta atualização.

Arquivos principais: `src/lib/catalog-card-preview.ts`, `src/lib/catalog.ts`, `src/lib/products.ts`, `src/components/product-card.tsx`, `src/lib/cart-core.ts`, `src/app/carrinho/page.tsx`, `src/app/produto/[slug]/page.tsx`, `src/components/product-details-shop.tsx` e `src/app/globals.css`. Testes: `tests/storefront-swatch-cart.test.mjs` e as verificações adaptadas em `tests/catalog-experience-p0.test.mjs` e `tests/product-gallery-variants.test.mjs`.

**Limite de validação:** ainda faltam fotos reais e múltiplas variações com estoque no ambiente para fazer uma conferência visual completa de cada cor. A implementação foi validada por testes e build, sem dados fictícios persistidos.

### 22.25. Importação CSV de catálogo com pré-validação administrativa

A página `/admin/produtos/importar` (somente administradores via `requireAdmin()`) permite baixar um modelo CSV UTF-8 (com BOM para Excel pt-BR), carregar e inspecionar até 40 linhas por vez, pesquisar o conteúdo, validar **sem gravar** e só então confirmar a gravação. Colunas e ordem do modelo: `acao;sku;slug;nome;categoria_slug;marca;descricao;preco;custo;ean;variacao;cor`. `acao` é `criar` ou `atualizar`; valores `preco` e `custo` usam reais com vírgula, e o parser transforma em centavos exatos. Suporta campos CSV entre aspas, ponto e vírgula no conteúdo e aspas duplicadas. São rejeitados arquivos acima de 256 KB, mais de 40 produtos, nomes ou preços inválidos, códigos GTIN/EAN com dígito verificador incorreto e duplicidades dentro do arquivo.

A função SQL `public.bulk_upsert_catalog_csv(jsonb,boolean)` requer `auth.uid()` e `private.is_admin()`, concede `EXECUTE` somente a `authenticated` e **não permite execução anônima**. A função valida novamente o lote e efetua a gravação numa única transação PostgreSQL, de modo que uma exceção impede a confirmação parcial das demais linhas. Na opção de validação, `p_validate_only=true`, nenhuma linha é gravada e nenhum SKU é reservado. Na confirmação, `p_validate_only=false`, **novos produtos são criados como rascunhos** com saldo zero e SKU `POP-...` gerado automaticamente se a célula SKU estiver vazia. Códigos manuais são permitidos fora da faixa automática reservada. A operação de atualização localiza o SKU existente, rejeita produtos +18, altera dados compartilhados do produto (nome, categoria pública, marca, descrição, preço e custo) e atualiza EAN/GTIN **apenas quando preenchido**; campo vazio preserva o código anterior. Não altera slug, SKU, fotos, status de publicação ou quantidade de estoque. Atualizar dois SKUs do mesmo produto no mesmo lote é proibido para evitar conflitos de preços e nomes compartilhados.

A importação não autoriza compras, integração com marketplaces, movimentações físicas nem publicação em massa. O leitor USB/Bluetooth que digita como teclado pode ser utilizado para inserir ou localizar códigos nas telas, mas não existe scanner por câmera homologado. A unicidade de EAN/GTIN não vazios é protegida pelo índice `variants_ean_nonempty_unique`; o dígito de verificação é validado no navegador e no PostgreSQL. O arquivo é revalidado pelo banco **no momento da confirmação**, inclusive após a conferência, por segurança contra dados concorrentes. Não há retentativa automática.

Migrações: `supabase/catalog_csv_bulk_draft_import_v1.sql` e `supabase/catalog_csv_preserve_ean_on_update_v2.sql`. Frontend: `src/lib/catalog-csv-core.ts`, `src/app/admin/produtos/importar/page.tsx`, `catalog-import-manager.tsx`, sidebar e atalho na página de produtos.

### 22.26. Reposição por SKU, lotes válidos e exportação

A página `/admin/estoque/reposicao` consolida estoque físico, reservas, soma dos lotes não vencidos e **disponível vendável** (limita o menor valor entre saldo físico e lotes válidos, sempre deduzindo reservas). A quantidade sugerida é `max(0, estoque_mínimo * fator - disponível)`, com fator selecionável de 1× até 4× e piso de 1 unidade quando mínimo zero. Trata-se de **estimativa operacional**, não previsão de demanda. Exibe SKUs de produtos ativos e inativos, com indicação de sua condição, pesquisa por SKU/produto/tonalidade/EAN e exporta um CSV de lista sugerida sem fórmulas executáveis (proteção contra injeção em planilhas). O botão **Registrar entrada** direciona para o SKU em `/admin/estoque?busca=...`, utilizando o formulário de movimentação já existente e auditado; não movimenta o inventário automaticamente.

A fonte é um SELECT admin-only de até 1.000 variações com indicador caso esse limite seja excedido. A vitrine e o checkout continuam sujeitos à validação real de estoque por variação/lote. Nenhum produto, estoque ou pedido existente foi alterado para implementar ou testar a funcionalidade.

Arquivos: `src/lib/stock-replenishment.ts`, `src/app/admin/estoque/reposicao/page.tsx`, `replenishment-manager.tsx`, além de atualizações em `stock-manager.tsx`, `products-manager.tsx` e no menu. Testes: `tests/catalog-bulk-import-and-replenishment.test.mjs`.

**Próximos passos**: entrada por leitura de EAN com seleção de lote e validação de quantidades, importação de comprovantes de fornecedor, fluxo de conferência de recebimento de mercadorias e testes end-to-end autenticados antes de ativar qualquer transação comercial.

### 22.27. Fornecedores e recebimento de mercadorias em duas etapas

A Popê Beauty agora possui **Fornecedores** em `/admin/fornecedores` e **Recebimento de mercadorias** em `/admin/estoque/recebimento`, acessíveis pelo menu lateral e pela central de estoque. O cadastro de fornecedores contém nome/razão social, CPF/CNPJ opcional (com validação dos dígitos verificadores no cliente), e-mail, telefone, observações e status ativo/inativo. Não exclui nem sobrescreve o histórico. A política RLS restringe leitura e escrita aos administradores, e visitantes anônimos não têm acesso.

O recebimento permite identificar o fornecedor, registrar referência da nota/documento e data, observações e **até 25 itens por recebimento**, encontrados digitando o SKU ou lendo EAN/GTIN em scanners USB/Bluetooth que operem como teclado. Cada item tem SKU, lote, validade opcional, quantidade inteira e custo unitário de conferência opcional. Custos informados no recebimento **não alteram** automaticamente o preço de venda nem o custo cadastral; são somente metadados históricos do documento.

O servidor oferece duas RPCs:
- `public.save_goods_receipt_draft(p_receipt_id,p_payload)`: cria ou edita um **rascunho**, validando fornecedor, SKUs, lotes e quantidades; **não movimenta estoque**. A edição usa lock na linha do recebimento e impede alterações após a contabilização. Não há gravação parcial do lote.
- `public.post_goods_receipt(p_receipt_id)`: faz o lock do recebimento, exige `status='draft'`, revalida lotes e vencimentos e chama `public.adjust_stock` para cada item, reutilizando histórico, controle de reservas e atualização de lotes. **Toda contabilização é uma transação única**; qualquer falha de lote ou saldo causa rollback e impede entradas parciais. Um recebimento já contabilizado não pode gerar outra entrada.

A confirmação é explícita no painel, depois de salvar o rascunho. O botão de contabilização é bloqueado quando o formulário sofreu alterações desde a última gravação. Dados antigos de produtos, fornecedores e inventário não foram modificados durante a implantação. Os documentos não são enviados para plataformas externas nem geram NF-e, cobranças ou fretes.

Tabelas: `public.suppliers`, `public.goods_receipts`, `public.goods_receipt_items`. RLS e privilégios restringem seleção a administradores e bloqueiam INSERT direto nas tabelas de recebimento. A escrita é controlada por RPCs `SECURITY DEFINER` com `auth.uid()` e `private.is_admin()`. Migração: `supabase/goods_receipts_supplier_register_atomic_v1.sql`. Frontend: `src/app/admin/fornecedores/`, `src/app/admin/estoque/recebimento/`, `src/lib/goods-receipts-core.ts`, `src/lib/supplier-tax-id.ts`. Testes: `tests/goods-receipts-suppliers-fiscal.test.mjs`.

### 22.28. NF-e XML de fornecedor: leitura local de conferência, sem validação fiscal

No recebimento de mercadorias, o operador pode selecionar um arquivo **XML de NF-e** de até 2 MB. O arquivo é analisado **no navegador**, sem upload persistido: a prévia extrai a razão social/CNPJ do emitente, número/série, data, itens, códigos `cEAN` ou `cProd`, `qCom`, custo unitário `vUnCom` e rastreabilidade de lote `rastro/nLote/dVal/qLote` quando presente. O código faz correspondência somente por EAN/GTIN cadastrado ou `cProd` exatamente igual ao SKU, e não cria produtos desconhecidos. Se existem itens não identificados, quantidades fracionadas ou avisos de interpretação, a interface exige confirmação de revisão manual. O XML pode ser substituído sem gravar nada. DTD e entidades externas são rejeitados.

**A leitura não autentica a NF-e**, não valida assinatura XML, não consulta a SEFAZ, não confirma o fornecedor fiscal e não representa entrada física. A confirmação do estoque continua sendo o processo independente e auditado descrito acima. O arquivo não autoriza automaticamente pagamentos a fornecedores nem emissão de NFe/NFCe de saída. Arquivo: `src/lib/supplier-nfe-preview.ts`.

### 22.29. Fiscal: relatório de pendências e prontidão operacional

A aba **Fiscal dos produtos** em `/admin/fiscal` recebeu triagem e exportação CSV com nomes, marcas e **campos de preenchimento fiscal ainda pendentes**: NCM, origem, unidade, CFOP de referência, CST PIS/COFINS e CST ICMS ou CSOSN conforme CRT informado. A listagem é *prévia* para trabalho com contabilidade; não verifica se os códigos, classificações, alíquotas ou situações fiscais são corretos, não preenche automaticamente tributação e não autoriza documentos em ambiente de produção. O CSV neutraliza valores que poderiam ser interpretados como fórmulas por aplicativos de planilha.

A página `/admin/prontidao` também acompanha o cadastro de fornecedores e os recebimentos pendentes, com links diretos para a operação. Essas verificações não alteram as travas existentes sobre checkout, cobrança, transportadoras e emissão fiscal.

Arquivos: `src/lib/fiscal-catalog-audit.ts`, `src/app/admin/fiscal/fiscal-manager.tsx`, `src/app/admin/prontidao/page.tsx` e testes correspondentes.

**Pendente antes de produção:** validar um recebimento com SKU real e XML de NF-e real, conferir a contabilização contra lotes e histórico, homologar NCM/tributação com contabilidade e configurar serviços fiscais, marketplaces, pagamentos e transportadoras em fase específica de credenciais. Não usar resultados de leitura XML como prova de autenticidade.

### 22.30. Pedidos de compra, conferência de entrada e custos de mercadorias

Em **Estoque → Pedidos de compra**, selecione um fornecedor ativo, informe até 50 SKUs e defina a quantidade, o prazo de entrega e o custo previsto por unidade, quando disponível. A lista de reposição pode preencher o SKU e a quantidade sugerida. Salve o rascunho e confirme o pedido para disponibilizá-lo no recebimento. A confirmação registra um pedido interno. O fornecedor deve ser contatado pelo canal habitual.

Em **Recebimento de mercadorias**, vincule o pedido quando houver um. A entrega pode ser parcial. A contabilização atualiza os lotes, o estoque e o saldo do pedido em uma transação. O banco recusa SKUs que não constam no pedido e quantidades acima do saldo. É possível encerrar o saldo restante de um pedido parcialmente recebido com uma justificativa registrada. Entradas avulsas e rascunhos anteriores continuam disponíveis.

Ao carregar uma NF-e, a conferência guarda as quantidades comerciais declaradas no XML por SKU, separadas das quantidades físicas editadas no formulário. O histórico conserva as quantidades, os avisos e a justificativa das diferenças. A justificativa é obrigatória antes de contabilizar divergências ou avisos da leitura. O XML é processado no navegador.

Em **Financeiro → Custos de mercadorias**, consulte as entradas por mês da contabilização no horário de São Paulo. O relatório soma quantidade física × custo unitário informado, apresenta as unidades sem custo e exporta o resumo por fornecedor em CSV. O custo previsto em um pedido e o valor pago a um fornecedor são apurações diferentes do custo de entrada exibido.

Aplique `supabase/purchase_orders_receipt_conference_v1.sql` após `supabase/goods_receipts_supplier_register_atomic_v1.sql` e antes de publicar as novas telas. A migração preserva a assinatura de chamada das RPCs existentes para rascunhos legados e acrescenta o controle de versão para as novas conferências. As tabelas e funções de compras e custos usam RLS ou autorização administrativa explícita.

## Cupons e promoções — preparação

O menu **Catálogo → Cupons e promoções** (`/admin/promocoes`) permite criar e editar campanhas com código, desconto percentual ou fixo, valor mínimo, teto opcional, vigência e status. Um simulador administrativo calcula o valor potencial após desconto e informa a razão de inelegibilidade.

**Importante:** cupons ainda **não são aplicáveis ao checkout comercial**, não geram descontos de verdade, não modificam estoque, pedidos, NF-e ou o valor cobrado. O sinalizador de campanha ativa afeta somente a simulação interna. Esta separação impede divergências financeiras enquanto a integração transacional, os limites de uso e a homologação fiscal não forem concluídos.

Para disponibilizar o cadastro, aplique `supabase/promotion_coupons_admin_v1.sql` no Supabase do Popê e use o manual [Cupons e promoções](docs/cupons-promocoes.md). O SQL exige RLS e permite gravação apenas a administradores autenticados. Não cadastrar tokens ou credenciais nas descrições das campanhas.

## Navegação administrativa reorganizada

A sidebar administrativa foi agrupada por **Vendas e clientes, Catálogo e campanhas, Estoque e compras, Logística e fiscal, Financeiro e relatórios, Equipe e sistema**. Os acessos a Visão geral, Pedidos e Notificações ficam fixos no topo. Os outros módulos ficam dentro de áreas expansíveis com identificação automática da seção atual. A busca de atalhos alcança todos os módulos e pode ser aberta pelo teclado com `Ctrl+K` (ou `⌘+K` no Mac). A interface conserva o modo compacto e funciona no celular. Nenhuma rota administrativa foi retirada.

Veja o [manual de navegação administrativa](docs/navegacao-admin.md) para a lista completa de seções, atalhos e testes.

## Atendimento e pós-venda

A área **Minha conta → Atendimento** permite abrir solicitações de troca, devolução, problemas de entrega ou produtos e consultar respostas da equipe. Pelo detalhe do pedido, o cliente consegue solicitar atendimento com o pedido selecionado.

A central administrativa **Vendas e clientes → Atendimento e pós-venda** permite filtrar as solicitações, registrar respostas e atualizar o status. A sidebar sinaliza as solicitações pendentes. O módulo agora faz parte dos **30 acessos administrativos**.

Para utilizar, aplique `supabase/customer_service_requests_v1.sql` e depois `supabase/customer_service_performance_v1.sql` ao Supabase da Popê antes de publicar a alteração. RLS restringe leitura e inserção a clientes proprietários e alteração a administradores; cada usuário pode registrar até três solicitações por hora. Consulte o [manual de atendimento e pós-venda](docs/atendimento-pos-venda.md).

**Atenção:** registrar ou concluir um atendimento não devolve dinheiro, não estorna pagamentos, não altera estoque, não cancela NF-e e não solicita logística reversa. Essas rotinas precisam de integração e homologação próprias.


## Conversas de pós-venda

A central de atendimento agora oferece **mensagens bidirecionais** em cada
solicitação. O cliente acompanha o histórico em
`/conta/atendimento/[id]` e responde à equipe; o administrador utiliza
`/admin/atendimento/[id]` para enviar orientações e registrar o retorno.
Uma resposta do cliente reabre o chamado respondido para nova análise,
enquanto a equipe pode responder e concluir o chamado. Solicitações
encerradas não recebem novas mensagens.

Para instalar, aplique `supabase/customer_service_conversations_v1.sql`
**depois** das duas migrações anteriores do pós-venda. RLS protege a
leitura de cada conversa; a RPC `post_service_message` valida o
remetente, exige uma sessão autenticada e restringe o número de envios.
Não há permissão para inserir mensagens diretamente no navegador.

Veja [Atendimento e pós-venda](docs/atendimento-pos-venda.md) para as
regras de operação e segurança. As mensagens não executam estornos,
reembolsos, alterações fiscais nem movimentos de estoque.


## Feed oficial e avaliações dos produtos

O Popê Beauty possui uma nova área editorial `/feed` para postagens de texto,
fotos e vídeos, com vínculos a produtos, categorias e subcategorias.
**Apenas a equipe (`admin` ou `staff`) pode publicar**, usando
`/admin/feed` ou `/equipe/feed`. Clientes podem visualizar as postagens,
mas não criar conteúdo no feed.

As páginas dos produtos têm avaliações de **1 a 5 estrelas** e comentários
moderados: clientes autenticados podem escrever uma avaliação por produto.
A equipe aprova ou oculta os comentários em `/admin/avaliacoes` ou
`/equipe/avaliacoes`. As notas médias incluem somente avaliações aprovadas.

Para disponibilizar esses recursos, execute no Supabase Popê
`supabase/social_feed_v1.sql` e depois `supabase/product_reviews_v1.sql`.
A migração habilita RLS para limitar a criação de posts e avaliações, usa um
bucket privado para as mídias e mantém os itens +18 fora do feed.

Leia [Feed e avaliações](docs/feed-e-avaliacoes.md) para instruções completas.
A funcionalidade não altera o checkout comercial nem habilita pagamentos.
