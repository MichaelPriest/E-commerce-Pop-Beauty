# Manual de credenciais da Popê Beauty

Use este manual para cadastrar as integrações da loja e conferir a qual conta cada serviço está conectado. Comece pelo Supabase. Para testar uma venda, configure em seguida o Mercado Pago TEST, a Focus NFe em homologação e o Melhor Envio Sandbox. Configure também o e-mail para acompanhar o pedido. Os marketplaces e os gateways de avaliação podem ser cadastrados por canal.

## Onde cadastrar

1. Na Vercel, abra o projeto **e-commerce-pope-beauty → Settings → Environment Variables → Add Environment Variable**. [Abrir o projeto na Vercel](https://vercel.com/michael-raimundos-projects/e-commerce-pope-beauty/settings/environment-variables).
2. Copie o nome da variável exatamente como aparece nas tabelas. Selecione **Production** para o domínio publicado da loja. As opções **homologacao**, **sandbox** e **producao** descritas abaixo escolhem o ambiente de cada provedor. Para uma implantação Preview, use valores próprios daquele ambiente.
3. Escolha **Secret** para senhas, certificados, tokens e chaves privadas. Escolha **Config** para URLs públicas, IDs, portas e opções de funcionamento. Cole cada segredo diretamente do provedor na Vercel. Guarde eventuais cópias em um gerenciador de senhas. [Tipos de variável da Vercel](https://vercel.com/changelog/environment-variables-now-use-config-and-secret-types).
4. Salve os campos do grupo e, em **Deployments**, escolha **Redeploy** no deploy atual de Production. Entre como administrador e execute a verificação indicada em cada seção. [Painel de prontidão da Popê](https://e-commerce-pope-beauty.vercel.app/admin/prontidao#integracoes) · [Configuração de variáveis na Vercel](https://vercel.com/docs/environment-variables/managing-environment-variables).

Para desenvolvimento local, o arquivo `.env.example` lista os nomes aceitos. Coloque os valores de desenvolvimento em `.env.local`, que o Git ignora. As duas variáveis iniciadas por `NEXT_PUBLIC_` ficam disponíveis no navegador. [Modelo de configuração](../.env.example).

## Supabase

Abra **Settings → API Keys** no projeto **Popê**. Para a chave privada, crie uma **Secret key** exclusiva da aplicação, por exemplo com o nome `pope-beauty-vercel`. [Chaves do projeto](https://supabase.com/dashboard/project/igdmkymzxdrqjkwouunc/settings/api-keys) · [Chaves públicas e privadas do Supabase](https://supabase.com/docs/guides/api/api-keys).

| Campo na Vercel | Tipo | Origem e uso |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Config | Copie **Project URL** em **Connect** no projeto Popê. É o endereço da API usado pela loja e pelo painel. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Config | Copie a **Publishable key** do mesmo projeto. O navegador a usa para iniciar a sessão e fazer consultas com as permissões do usuário. |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret | Copie a **Secret key** do servidor, com prefixo `sb_secret_`. Mantenha o nome da variável indicado aqui. O backend usa a chave para processar retornos de pagamento e acessar registros fiscais e logísticos protegidos. |

**Como conferir.** Em **Prontidão → Supabase**, clique em **Testar consulta**. A confirmação indica que o servidor conseguiu ler o cadastro fiscal protegido. A presença da chave pública pode ser conferida pelo login na loja.

### E-mails de cadastro e recuperação

No Supabase, abra **Authentication → SMTP Settings** e cadastre o remetente, o servidor, a porta, o usuário e a senha SMTP do serviço de e-mail. O Supabase usa essa configuração para confirmar cadastros e recuperar senhas. A fila de pedidos usa os campos da Vercel descritos na próxima seção. [SMTP do Supabase Auth](https://supabase.com/docs/guides/auth/auth-smtp).

Em **Authentication → URL Configuration**, confira os endereços da loja. Depois, solicite a recuperação de senha de uma conta de teste sua e confirme o recebimento e a abertura da tela de redefinição.

| Campo no Supabase | URL do site publicado |
| --- | --- |
| Site URL | `https://e-commerce-pope-beauty.vercel.app` |
| Redirect URL de confirmação | `https://e-commerce-pope-beauty.vercel.app/auth/callback` |
| Redirect URL de recuperação | `https://e-commerce-pope-beauty.vercel.app/auth/callback?next=/redefinir-senha` |

## E-mails de pedidos

Obtenha os dados na área **SMTP** do serviço de e-mail que a loja usa. Para Gmail, uma conta elegível com verificação em duas etapas pode gerar uma senha de app. Para um provedor transacional como Brevo, use o login e a chave específicos de SMTP. [Senhas de app do Google](https://support.google.com/accounts/answer/185833?hl=pt-BR) · [Configuração SMTP da Brevo](https://help.brevo.com/hc/pt/articles/7924908994450).

| Campo na Vercel | Tipo | O que preencher |
| --- | --- | --- |
| `SMTP_HOST` | Config | Nome do servidor informado pelo provedor de e-mail. |
| `SMTP_PORT` | Config | Porta do serviço. A aplicação usa TLS desde a conexão na porta `465` e exige STARTTLS nas demais, como `587`. |
| `SMTP_USER` | Secret ou Config de servidor | Login SMTP fornecido pelo provedor. Pode ser diferente do endereço usado como remetente. |
| `SMTP_PASSWORD` | Secret | Senha de app ou chave SMTP correspondente ao login. Preserve os caracteres da credencial. |
| `SMTP_FROM_EMAIL` | Config | Endereço de remetente autorizado no provedor, no formato `pedidos@exemplo.com.br`. |

**Como conferir.** Abra **Prontidão → E-mails de pedidos (SMTP) → Testar autenticação**. O teste usa host, porta, usuário e senha, negocia TLS, autentica e encerra a conexão. Para confirmar a entrega, configure também o remetente, acompanhe uma notificação de um pedido interno com uma conta de teste vinculada e confira a caixa de destino. [Testar o SMTP](https://e-commerce-pope-beauty.vercel.app/admin/prontidao#integracao-smtp) · [Fila de notificações](https://e-commerce-pope-beauty.vercel.app/admin/notificacoes) · [Verificação SMTP do Nodemailer](https://nodemailer.com/smtp).

## Mercado Pago

Em **Suas integrações**, selecione a aplicação da loja ou crie uma integração **Checkout Pro via Preferences API**. Para o teste, use uma conta vendedora de teste brasileira e uma conta compradora de teste separada. Para produção, use a conta brasileira que receberá as vendas. O **User ID** identifica o vendedor. O **ID da aplicação** identifica o aplicativo. [Painel Mercado Pago](https://www.mercadopago.com.br/developers/panel/app) · [Contas de teste do Checkout Pro](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-preferences/test-accounts).

### Conta vendedora de teste

| Campo na Vercel | Tipo | O que preencher ou habilitar |
| --- | --- | --- |
| `MP_TEST_ACCESS_TOKEN` | Secret | **Credenciais de teste → Access Token** da aplicação. Para este Checkout Pro, o token do vendedor de teste começa por `APP_USR-`. A conta comercial também pode usar esse prefixo. |
| `MP_TEST_SELLER_ID` | Config | **Contas de teste → Vendedor → User ID** da mesma conta vinculada ao token. Copie o número completo. |
| `MP_TEST_WEBHOOK_SECRET` | Secret | Assinatura secreta exibida em **Webhooks** na aplicação configurada para o retorno de teste. |
| `MP_TEST_PREFERENCE_CREATION_ENABLED` | Config | Use `verified-test-account-only` para permitir a criação da preferência de pagamento de uma reserva TEST pelo administrador. |
| `MP_TEST_WEBHOOK_ENABLED` | Config | Use `verified-test-account-only` para habilitar o recebimento do webhook de teste após cadastrar a assinatura e a chave privada do Supabase. |

**Como conferir.** Comece apenas com o token e o ID. Em **Prontidão → Mercado Pago — conta TEST** ou **Gateways → Mercado Pago**, teste a conta. O servidor consulta o vendedor e confere o ID, o perfil TEST e o país. Depois, habilite as duas opções acima para exercitar o fluxo da reserva. [Prontidão](https://e-commerce-pope-beauty.vercel.app/admin/prontidao#integracoes) · [Gateways de pagamento](https://e-commerce-pope-beauty.vercel.app/admin/gateways).

### Conta vendedora de produção

| Campo na Vercel | Tipo | O que preencher ou habilitar |
| --- | --- | --- |
| `MP_LIVE_ACCESS_TOKEN` | Secret | **Credenciais de produção → Access Token** da aplicação vinculada à conta recebedora. |
| `MP_LIVE_SELLER_ID` | Config | **Dados da integração → User ID** do vendedor real. Use o ID da conta vinculada ao token de produção. |
| `MP_LIVE_WEBHOOK_SECRET` | Secret | Assinatura secreta da aplicação que encaminha os eventos comerciais de pagamento. |
| `MP_LIVE_SITE_ORIGIN` | Config | Origem HTTPS usada nos retornos do checkout. No domínio atual, `https://e-commerce-pope-beauty.vercel.app`. |
| `MP_LIVE_WEBHOOK_ENABLED` | Config | `verified-live-account-only` habilita a conciliação dos pagamentos comerciais com a conta e o webhook configurados. |
| `MP_LIVE_PAYMENT_LINKS_ENABLED` | Config | `internal-orders` habilita a criação de links de pagamento reais. Cadastre esta opção na etapa de ativação comercial. |

**Como conferir.** Com token e ID, use **Prontidão → Mercado Pago — produção → Testar consulta** para confirmar a conta antes de habilitar links. O checkout da vitrine também depende da configuração comercial da loja. [Credenciais de produção](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-preferences/go-to-production).

### Webhooks de pagamento

Em **Webhooks → Configurar notificações**, escolha o evento **Pagamentos** e registre a URL do ambiente. Copie a assinatura gerada pelo painel para a variável do ambiente correspondente.

| Destino | URL completa para cadastrar no Mercado Pago |
| --- | --- |
| Auditoria de teste | `https://e-commerce-pope-beauty.vercel.app/api/webhooks/mercadopago/test` |
| Conciliação de pedidos comerciais | `https://e-commerce-pope-beauty.vercel.app/api/webhooks/mercadopago/orders` |

Para testar a recepção no Checkout Pro via Preferences, use **Simular** em **Suas integrações**. O provedor orienta usar o simulador para pagamentos com credenciais de teste. A auditoria da Popê confere a assinatura e consulta o ID do pagamento no provedor. Para conferir valores de uma reserva, informe o ID consultável de um pagamento de teste vinculado a ela. [Notificações do Checkout Pro](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-preferences/payment-notifications).

## Focus NFe

No **Painel da API → Empresas → Adicionar empresa**, cadastre o CNPJ emitente, os dados fiscais e o certificado A1 diretamente na Focus. Selecione NF-e modelo 55 e confirme série e numeração com a contabilidade. Em **Painel API → Tokens**, escolha os tokens da empresa emitente. [Cadastro de empresa e tokens na Focus](https://doc.focusnfe.com.br/docs/como-cadastrar-uma-empresa).

| Campo na Vercel | Tipo | O que preencher |
| --- | --- | --- |
| `FOCUS_NFE_ENVIRONMENT` | Config | `homologacao` para testar a emissão ou `producao` para documentos fiscais válidos. |
| `FOCUS_NFE_HOMOLOGACAO_TOKEN` | Secret | **Token de homologação** da empresa emitente. |
| `FOCUS_NFE_PRODUCAO_TOKEN` | Secret | **Token de produção** da mesma empresa. O modo escolhido define qual token a aplicação lê. |

**Como conferir.** Preencha também **Admin → Fiscal** com o emitente e a tributação dos produtos. Em **Prontidão → Focus NFe**, teste a consulta no ambiente selecionado. Se ainda não houver NF-e registrada nesse ambiente, o painel pode indicar que a API respondeu e aguardar a primeira referência. A confirmação completa ocorre ao consultar uma NF-e autorizada ou cancelada. [Cadastro fiscal da loja](https://e-commerce-pope-beauty.vercel.app/admin/fiscal) · [Ambientes da Focus](https://doc.focusnfe.com.br/reference/ambiente).

## Melhor Envio

Use a conta Sandbox para o teste e a conta da loja para produção. No painel do ambiente escolhido, abra **Integrações → Permissões de Acesso → Gerar novo token**. Habilite as operações utilizadas pela loja para consultar serviços e pedidos, cotar, usar o carrinho, comprar, gerar, imprimir e cancelar etiquetas. Copie o token no momento da criação. [Painel Sandbox](https://sandbox.melhorenvio.com.br/) · [Painel de produção](https://melhorenvio.com.br/) · [Como gerar o token](https://centraldeajuda.melhorenvio.com.br/hc/pt-br/articles/31220726011284).

| Campo na Vercel | Tipo | O que preencher |
| --- | --- | --- |
| `MELHOR_ENVIO_SANDBOX_TOKEN` | Secret | Token da conta de teste. Atende à cotação de teste e às etiquetas quando o ambiente é sandbox. |
| `MELHOR_ENVIO_PRODUCTION_TOKEN` | Secret | Token emitido no painel de produção da conta remetente. |
| `MELHOR_ENVIO_LABEL_ENVIRONMENT` | Config | `sandbox` para etiquetas de teste ou `producao` para a contratação comercial. |
| `MELHOR_ENVIO_CONTACT_EMAIL` | Config | E-mail de contato da integração e do remetente. |
| `MELHOR_ENVIO_SENDER_PHONE` | Config | Telefone brasileiro do remetente com DDD, com 10 ou 11 dígitos. |

**Como conferir.** Em **Prontidão → Melhor Envio**, teste o token do ambiente correspondente. O teste lista os serviços disponíveis. Para a etiqueta, confira o remetente em **Fiscal**, o CEP de postagem **04431-080**, os volumes e a NF-e autorizada no mesmo ambiente. O valor exibido ao cliente no checkout vem das tarifas por CEP cadastradas na loja. [Frete e tarifas](https://e-commerce-pope-beauty.vercel.app/admin/frete/tarifas).

## Shopee e Mercado Livre

Cada canal exige uma aplicação do vendedor. O painel da Popê usa OAuth para obter e renovar os tokens de cada loja autorizada. As consultas de anúncios e pedidos são iniciadas em **Admin → Marketplaces**. [Contas vendedoras](https://e-commerce-pope-beauty.vercel.app/admin/marketplaces).

| Campo na Vercel | Tipo | Onde obter e para que serve |
| --- | --- | --- |
| `SHOPEE_PARTNER_ID` | Config | **Shopee Open Platform → Aplicação**, copie o **Partner ID** do app autorizado para conectar a loja. |
| `SHOPEE_PARTNER_KEY` | Secret | Copie a **Partner Key** de produção do mesmo app. O servidor a usa na assinatura das chamadas v2 da Shopee. |
| `MELI_APP_ID` | Config | **Mercado Livre DevCenter → Aplicações**, copie o **Client ID / App ID** da aplicação Mercado Livre. |
| `MELI_CLIENT_SECRET` | Secret | **Client Secret** da mesma aplicação. O servidor usa a credencial na troca e renovação dos tokens da conta. |
| `MARKETPLACE_TOKEN_ENCRYPTION_KEY` | Secret | Chave da Popê para cifrar os tokens OAuth dos dois canais. Gere 32 bytes aleatórios e salve os 64 caracteres hexadecimais. |
| `MARKETPLACE_OAUTH_ORIGIN` | Config opcional | Origem HTTPS pública da loja, sem caminho. O padrão do código é `https://e-commerce-pope-beauty.vercel.app`. |

Gere a chave de criptografia no seu computador com Node.js. Transfira o resultado para a Vercel e guarde uma cópia segura. A leitura dos tokens já gravados depende dessa mesma chave. Para substituí-la, planeje a migração dos tokens ou a reconexão das lojas.

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

| Canal | Configuração no provedor | URL de retorno para o domínio atual |
| --- | --- | --- |
| Shopee | No app habilitado para **shop**, cadastre o domínio da loja e permita a leitura de produtos e pedidos. A autorização retorna o identificador da loja (`shop_id`). [Shopee Open Platform](https://open.shopee.com/) | `https://e-commerce-pope-beauty.vercel.app/api/admin/marketplaces/oauth/callback/shopee` |
| Mercado Livre | Em **Autenticação e segurança**, cadastre o **Redirect URI** exato, habilite PKCE e solicite leitura de anúncios/pedidos e renovação (`offline_access`). [Mercado Livre DevCenter](https://developers.mercadolivre.com.br/crie-uma-aplicacao-no-mercado-livre) | `https://e-commerce-pope-beauty.vercel.app/api/admin/marketplaces/oauth/callback/mercadolivre` |

**Como conferir.** Depois do deploy, acesse a loja pelo domínio cadastrado, abra **Marketplaces → Conectar conta** e autorize a conta vendedora no provedor. Confirme o identificador da conta conectada e faça uma consulta manual de anúncios ou pedidos. Ao trocar o domínio da loja, atualize a origem e os retornos permitidos nos aplicativos.

## Gateways opcionais para avaliação

O checkout comercial da loja usa o Mercado Pago. A tela **Admin → Gateways** permite avaliar os provedores abaixo de forma independente. Cadastre os campos do provedor que pretende testar. A última coluna indica exatamente o alcance da implementação atual. [Abrir Gateways](https://e-commerce-pope-beauty.vercel.app/admin/gateways).

| Provedor | Campos na Vercel | Onde obter | Conferência disponível |
| --- | --- | --- | --- |
| PagBank | `PAGBANK_SANDBOX_TOKEN` (Secret) | Token da conta sandbox no portal do desenvolvedor. [PagBank](https://developer.pagbank.com.br/docs/token-de-autenticacao) | Presença do campo. |
| Pagar.me | `PAGARME_TEST_SECRET_KEY` (Secret) | Chave secreta da loja de testes com prefixo `sk_test_`. [Chaves do Pagar.me](https://docs.pagar.me/docs/chaves-de-acesso) | Consulta de links no sandbox. |
| Asaas | `ASAAS_SANDBOX_API_KEY` (Secret) | Gere uma chave na área de integrações da conta **Sandbox**. [Asaas](https://docs.asaas.com/docs/configura%C3%A7%C3%B5es-iniciais-1) | Consulta de links no sandbox. |
| Stripe | `STRIPE_TEST_SECRET_KEY` (Secret) | No Dashboard de testes, copie a chave secreta com prefixo `sk_test_`. [Chaves da Stripe](https://docs.stripe.com/keys) | Consulta à conta de testes. |
| Efí Bank | `EFI_SANDBOX_CLIENT_ID` (Config), `EFI_SANDBOX_CLIENT_SECRET` e `EFI_SANDBOX_CERT_BASE64` (Secret) | Crie uma aplicação Pix de homologação. Copie o Client ID e o Client Secret e codifique o arquivo do certificado de homologação em Base64 no seu computador. O conteúdo codificado continua sendo secreto. [Efí](https://dev.efipay.com.br/docs/api-pix/credenciais/) | Presença dos três campos. |
| PayPal | `PAYPAL_SANDBOX_CLIENT_ID` (Config), `PAYPAL_SANDBOX_CLIENT_SECRET` (Secret) | No Developer Dashboard, abra **Apps & Credentials → Sandbox** e copie o Client ID e o Secret do mesmo app. [PayPal](https://developer.paypal.com/studio/checkout/standard/getstarted) | Autenticação OAuth no sandbox. |
| Cielo | `CIELO_SANDBOX_MERCHANT_ID` (Config), `CIELO_SANDBOX_MERCHANT_KEY` (Secret) | Use o Merchant ID e a Merchant Key do estabelecimento de testes da API E-commerce. [Sandbox Cielo](https://docs.cielo.com.br/ecommerce-cielo/reference/como-usar-o-sandbox) | Presença dos dois campos. |
| iugu | `IUGU_TEST_API_TOKEN` (Secret) | Gere um token em modo teste no painel iugu da conta. [Tokens da iugu](https://dev.iugu.com/docs/tokens-de-autenticacao) | Presença do campo. |
| InfinitePay | Nenhuma variável | O catálogo apresenta a modalidade Checkout Integrado. [InfinitePay](https://www.infinitepay.io/checkout-documentacao) | Consulta informativa no painel de gateways. |

O cadastro de CEP usa ViaCEP e BrasilAPI por consulta pública. As tarifas por faixa de CEP são geridas em **Admin → Frete → Tarifas**. Os serviços dos Correios contratados por meio do Melhor Envio usam o token desse integrador. O adaptador direto dos Correios está em preparação.

## Quando o teste indica uma pendência

| O que aparece | O que conferir |
| --- | --- |
| A variável salva ainda aparece pendente | Confira o nome, o ambiente selecionado na Vercel e o deploy que atende o domínio da loja. Nos campos de habilitação, use o valor exato da tabela. |
| SMTP recusou a autenticação | Confira o login SMTP, a senha de app ou chave SMTP e a liberação do serviço no provedor. Para falha de conexão, confira o host, a porta e o suporte a TLS. |
| SMTP autenticou e o cliente ainda aguarda a mensagem | Confira o remetente autorizado no provedor, o estado da mensagem em **Notificações** e a caixa de spam do destinatário de teste. |
| Mercado Pago recusou o vendedor de teste | Compare o User ID do vendedor brasileiro com o do token da aplicação. Use o comprador de teste apenas para fazer a compra. |
| Focus respondeu e pede uma referência | Confira o ambiente selecionado e a primeira NF-e autorizada ou cancelada desse ambiente. |
| Melhor Envio recusou o token | Confira o ambiente onde o token foi gerado e as permissões de consulta e de etiquetas concedidas. |
| Marketplace rejeitou o retorno | Compare o domínio e a URL completa cadastrada no provedor. Inicie a autorização pelo mesmo domínio e confirme a conta vendedora. |
