# Popê Beauty 💖

E-commerce de maquiagem e beleza, desenvolvido com **Next.js 16**, **TypeScript**, **Supabase** e **Vercel**.

## Status da primeira versão
- Vitrine responsiva, categorias, busca e detalhes de produtos.
- Carrinho demonstrativo local (sem checkout, sem pagamento, sem reserva de estoque).
- Cadastro e login preparados com Supabase Auth (e-mail/senha).
- Área de cliente e painel administrativo com autorização por banco de dados.
- SQL inicial de catálogo, variações, estoque, pedidos, movimentações e listagens de marketplaces.
- Painel **/admin/produtos**: cadastro, edição, fotos, preços, custo, variações, SKU/EAN e ativação do catálogo.
- Painel **/admin/estoque**: saldo por SKU, lotes, validade, estoque mínimo e entrada/saída auditada pelo banco.
- Shopee, Mercado Livre, frete, etiquetas e pagamentos **não estão conectados**.

**Os produtos e preços exibidos sem Supabase são ilustrativos, não ofertas comerciais.**

## Desenvolvimento
```bash
npm install
cp .env.example .env.local
npm run dev
```

## Configuração Supabase
1. Crie **um projeto dedicado** à Popê Beauty, para não compartilhar dados com outros sistemas.
2. Execute `supabase/schema.sql` e depois `supabase/catalog_admin.sql` no SQL Editor do projeto dedicado. Na organização Popê Beauty, as duas etapas já foram aplicadas.
3. No painel Supabase, configure **Authentication > URL Configuration** com o endereço definitivo da Vercel e o callback `https://SEU-DOMINIO/auth/callback`. Use o callback local `http://localhost:3000/auth/callback` para desenvolvimento.
4. Configure as variáveis `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` localmente e na Vercel (Development/Preview/Production conforme necessário).
5. Crie seu usuário pela interface `/entrar`; em seguida, no SQL Editor do **mesmo** projeto, atribua manualmente `role='admin'` ao seu registro em `public.profiles`, usando o ID/ e-mail do usuário recém-cadastrado.
6. Recarregue `/admin` para abrir o painel. Nunca use metadados editáveis pelo cliente para definir permissões.

**Atenção:** não publicar `service_role`, `sb_secret`, tokens dos marketplaces ou senhas no repositório, em variáveis `NEXT_PUBLIC_*` ou no navegador. APIs de integração externas deverão utilizar endpoints e segredos exclusivos no servidor.

## Implantação Vercel
Importe ou conecte o repositório `MichaelPriest/E-commerce-Pop-Beauty` na Vercel com framework Next.js. Configure as duas variáveis públicas acima antes de ativar o login. O projeto também pode exibir a vitrine demonstrativa sem Supabase.

## Próximas etapas
- Cadastro administrativo de produtos, imagens, SKUs, lotes e validade.
- Sincronização transacional de estoque, filas de eventos, reprocessamento, reconciliação e histórico.
- OAuth homologado de Shopee e Mercado Livre (sem presumir autorização de API).
- Gateway de pagamento, carrinho persistente, checkout com cotação logística e geração de etiquetas.
- Endereços, pedidos reais, LGPD, política comercial e testes de segurança.

Este projeto foi inicialmente preparado para implantação, sem habilitar compras reais.

## Operação administrativa atual

Após entrar com sua conta administradora, acesse `/admin/produtos` para cadastrar o catálogo. Ao criar um produto, informe pelo menos um SKU e o saldo inicial (opcional); as alterações de estoque utilizam a função SQL transacional `adjust_stock` com lote e justificativa. Variações adicionais começam com saldo zero e podem ser abastecidas em `/admin/estoque`.

A loja é **uma vitrine em implantação**: mesmo um produto publicado ainda não pode ser comprado, e o estoque **não sincroniza** com os marketplaces. Não cadastre informações financeiras sensíveis em campos públicos.

## Seção bem-estar íntimo +18 (segurança)

A opção **/admin/configuracoes** habilita ou desabilita globalmente a seção. Por padrão está **desligada**. O banco aplica políticas RLS que impedem a leitura de produtos e variações adultos por qualquer visitante ou cliente que não tenha prova de maioridade aprovada e válida; as imagens usam um bucket privado `adult-products` servido apenas por rota autenticada e sem cache público. Clientes só podem solicitar análise; apenas administradores autorizados podem aprovar após conferir prova de idade confiável fora do site. Nenhum documento ou dado de nascimento é persistido nesta etapa. A aquisição ainda está **desabilitada**.

O cadastro de produtos escolhe a categoria `Sex Shop +18` para identificar automaticamente itens adultos. Nunca use imagens públicas ou URL externa para produtos adultos. Os arquivos desta seção são carregados separadamente no bucket privado.

**Importante:** aprovação manual depende de procedimento confiável de verificação de idade e titularidade; a mera marcação no painel sem conferência real **não atende** a esse requisito. Para escala, integrar provedor especializado, auditar o processo e rever a adequação à ANPD/ECA Digital antes de comercializar.

**Supabase Free:** a detecção de senhas vazadas exige Pro. A tela de cadastro passou a sugerir e validar 12+ caracteres com maiúsculas, minúsculas, números e símbolos, mas isso é apenas controle de interface. Configure também a política de senhas no provedor Supabase Auth para fiscalização no servidor.

## Prévia administrativa do catálogo adulto

Acesse `/admin/adulto` com a conta que possua `role='admin'`. O painel mostra os produtos +18 (publicados ou em rascunho), imagens do bucket privado, preço e saldo do estoque. A funcionalidade de gestão funciona mesmo com a seção pública desativada.

**Atenção:** é uma autorização administrativa, não uma comprovação de idade. A loja pública `/adulto` ainda exige prova independente de maioridade. A solicitação de maioridade do administrador permanece pendente até revisão independente; autoaprovação continua proibida. A regra RLS impede contas `staff` não verificadas de consultar itens adultos, mesmo que possam ler o catálogo não adulto.

## Operações administrativas da loja (sem gateway)
- `/admin/pedidos`: pedidos internos com até 30 SKUs, preço do catálogo, reserva atômica, confirmação manual de recebimento com referência e transições auditadas.
- `/admin/clientes`: listagem dos perfis e pedidos relacionados, sem expor tabelas de autenticação.
- `/admin/logistica`: separação, expedição com transportadora/código de rastreio e baixa de lote por validade mais próxima (FEFO).
- `/admin/marketplaces`: associação manual de SKUs a anúncios de Shopee e Mercado Livre. O vínculo é apenas cadastral: sem tokens, sem importação, sem sincronismo.
- `/admin/financeiro`: acompanhamento de confirmações administrativas, sem conciliação automática, checkout, taxas ou transferências.

A criação de pedido manual não chama provedor de pagamento e não permite produto adulto. Ela reserva estoque até cancelamento ou expedição. Pagamento só pode ser marcado com anotação de referência pelo administrador. O fluxo atual não substitui um gateway, OMS completo ou ERP. Não acione ações de pagamento e expedição sem as respectivas operações terem ocorrido.

## Recuperação de acesso e troca de senha por e-mail (Supabase Auth)

- `/entrar`: inclui **Esqueceu sua senha?**.
- `/esqueci-senha`: solicita `auth.resetPasswordForEmail` por e-mail, com mensagem genérica para não revelar se o usuário existe.
- `/auth/callback?next=/redefinir-senha`: faz troca de código PKCE por sessão no servidor e encaminha para nova senha. O callback também aceita OTP `token_hash` com tipo `recovery` caso um template próprio seja configurado.
- `/redefinir-senha`: confirma sessão com `auth.getUser`, valida 12–72 caracteres (maiúscula, minúscula, número e símbolo), compara confirmação, atualiza via `auth.updateUser`, encerra sessão de recuperação e envia para o login. Não salva nem transmite senhas em tabelas de aplicação.

**Configuração obrigatória no Supabase Dashboard:** Authentication → URL Configuration, com Site URL `https://e-commerce-pope-beauty.vercel.app` e Redirect URLs adicionais, *exatamente*:
`https://e-commerce-pope-beauty.vercel.app/auth/callback?next=/redefinir-senha`
e `https://e-commerce-pope-beauty.vercel.app/auth/callback` (já usada na confirmação de cadastro).

Se executar localmente, também permita `http://localhost:3000/auth/callback?next=/redefinir-senha` e `http://localhost:3000/auth/callback` conforme necessário. O e-mail padrão do Supabase normalmente contém `{{ .ConfirmationURL }}`, que incorpora o redirectTo. Se usar template próprio, ajuste-o para respeitar `{{ .RedirectTo }}` e o fluxo de verificação. Teste links no **mesmo navegador** que fez a solicitação (PKCE).

**Operação:** sem provedor SMTP próprio, o Supabase pode impor limitações ao envio de e-mails e destinatários. Verificar em Authentication → SMTP Settings quando houver bloqueio no envio. O recurso nativo de detecção de senhas vazadas requer plano Pro; configure também a política mínima diretamente em Authentication → Providers → Email, pois a validação da tela não substitui a regra do servidor.

## E-mails automáticos dos pedidos (SMTP no servidor)
A partir da migração `supabase/order_notifications.sql`:
- Criação ou alteração de status de pedidos com **cliente vinculado** gera uma notificação transacional na tabela `order_notifications` (criação, pagamento confirmado manualmente, enviado, entregue e cancelado).
- A tabela é protegida por RLS. Uma notificação por evento, com fila `pending → sending → sent/failed`, 5 tentativas máximas por processamento e backoff progressivo. Sem destinatário (balcão), não há e-mail. Produtos adultos são excluídos.
- Os módulos `/admin/pedidos` e `/admin/logistica` enviam ações a `/api/admin/order-operations`. O backend confirma autenticação e perfil de administrador, executa a operação via RPC e tenta enviar a notificação recém-gerada. Mensagens não enviadas permanecem na fila sem invalidar pedidos.
- Em `/admin/notificacoes`, visualizar filas, histórico, status, e-mail de destino e usar **Processar fila**, **Enviar** ou **Reenviar** para itens com falha.
- O remetente de contato é `popebeauty.e@gmail.com`; os HTMLs vêm de `emails/pedidos/*.html` e são incluídos no build pelo `outputFileTracingIncludes` do Next.js.

### Configuração SMTP da Vercel (não confundir com o SMTP do Supabase Auth)
No painel do projeto Vercel, em **Settings → Environment Variables**, configure exclusivamente em **Production**:
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=popebeauty.e@gmail.com
SMTP_FROM_EMAIL=popebeauty.e@gmail.com
SMTP_PASSWORD=<senha-de-aplicativo-Google-colada-apenas-no-painel-Vercel>
```
A senha `SMTP_PASSWORD` deve ser uma **secret/sensitive variable**, e nunca enviada no chat, enviada a GitHub ou colocada em `NEXT_PUBLIC_`. Após configurar, **publique novamente** para as Functions enxergarem a variável.

O e-mail de confirmação e recuperação continua sendo enviado pelo SMTP do **Supabase Auth**; os pedidos são enviados pelo backend **Vercel**, que necessita das próprias credenciais (a senha não é compartilhada automaticamente).

Para garantir segurança de transporte, as Functions fazem STARTTLS em 587 (ou TLS em 465) e não permitem alteração de host/destinatários via request. A tabela de destinatários é preenchida apenas pelo gatilho do banco a partir de clientes cadastrados.

### Limitações operacionais
- O envio é acionado **imediatamente após ações no painel**, com fila persistente. Operações por API externa/SQL geram fila, mas exigem o botão **Processar fila**; não há agendamento em segundo plano nesta fase.
- Uma falha ou timeout na resposta do SMTP após aceitar uma mensagem pode exigir conciliação e causar reenvio. Não há garantia absoluta de entrega exatamente uma vez em e-mails SMTP; conferir o status antes de reenviar.
- O campo `sent` registra aceitação pelo servidor SMTP, não leitura/entrega final ao destinatário.
- Ainda não há email para compras públicas porque o checkout está desabilitado.

## Admin V2 — sidebar e atividade de usuários
- Todas as páginas `/admin/*` utilizam sidebar lateral com atalhos por grupo, ícones, recolhimento no desktop, gaveta móvel e destaque de rota ativa.
- Cabeçalho contém conta autenticada (nome e e-mail), acesso à página `/conta`, botão **Sair**, atalhos rápidos e indicador aproximado de usuários com atividade recente.
- `/admin/usuarios-online` lista usuário, endereço de e-mail, papel, atividade de sessão (janela de 3 minutos), último sinal e sessões recentes nas últimas 24 horas. Atualiza a cada 60 segundos.
- A migração `supabase/user_session_presence.sql` cria tabela RLS e `supabase/user_presence_admin_identity.sql` permite identificar o usuário. O `SessionPresence` envia heartbeat em páginas autenticadas. `signOutAction` encerra a presença antes de encerrar a sessão Auth.
- **Limitação**: o indicador de presença é aproximado, NÃO equivale a listar sessões Supabase Auth com garantia de revogação. Fechamento de aba não gera logout imediato; após 3 minutos sem heartbeat a sessão deixa de ser considerada ativa. Nenhum IP, GPS ou histórico de páginas é coletado.
- Só administradores autenticados podem listar outros usuários; outros usuários veem exclusivamente suas próprias sessões pela RLS. Escrita é restrita a funções privadas, vinculadas ao `session_id` do JWT.

## Gestão de usuários e segurança administrativa

- `/admin/usuarios`: diretório de contas com nome, e-mail confirmado, último login e papel (Cliente/Equipe/Administrador). Somente administradores podem mudar perfis, e a alteração de outra conta exige confirmação explícita.
- `/admin/auditoria`: histórico RLS somente para administradores de mudanças de papel e habilitação/desabilitação da seção +18. Eventos anteriores à implantação não são retroativos.
- Proteções no banco `supabase/admin_user_access_audit.sql`: não é possível alterar a própria permissão, promover conta sem e-mail confirmado ou promover UUID inexistente. O papel é consultado diretamente em `public.profiles` nas autorizações; nunca confiamos em `user_metadata`.
- **Equipe (staff)**: papel cadastral reservado para permissões futuras; atualmente os módulos `/admin/*` são exclusivos de administrador. Não há convites e nem criação automática de contas pela administração.
- `/admin/relatorios`: série histórica de 12 meses, métricas por mês de criação de pedidos, exportação CSV, alertas de estoque mínimo, vencidos e vencendo em 30 dias. Agregações SQL com privilégios do invocador `supabase/admin_operational_reports.sql`.
- Valores confirmados em relatórios correspondem ao estado **administrativamente registrado** do pedido, não a conciliação bancária. Não devem ser tratados como receita recebida efetivamente.

## Central de gateways para escolha futura
Acesse `/admin/gateways`. Dez opções para avaliação: Mercado Pago, PagBank, Pagar.me, Asaas, Stripe, Efí, PayPal, Cielo, Iugu e InfinitePay. Nenhuma opção foi ativada para cobranças reais.

- O esquema `supabase/payment_gateway_evaluation.sql` permite incluir/excluir da comparação, escolher um único **candidato de homologação**, registrar observações e guardar auditoria; não armazena segredos.
- As credenciais devem ficar exclusivamente nas variáveis de ambiente Vercel. Os nomes são exibidos por provedor; os valores nunca são expostos ao browser.
- Existe checagem de autenticação sem cobrança para Mercado Pago, Pagar.me, Asaas, Stripe e PayPal (somente chaves de teste e consulta/leitura; PayPal obtém token OAuth sandbox).
- PagBank, Efí, Cielo e Iugu aguardam configuração e validação específica do fluxo de testes. InfinitePay não possui sandbox e não será contatada nesta fase.
- **Não há checkout público, webhooks financeiros, aprovação de pagamento automática nem seleção de produção.** Para finalizar a escolha, será necessário integrar cobrança, conciliação, estornos e verificar encargos e condições contratuais.

Variáveis opcionais de sandbox: `MP_TEST_ACCESS_TOKEN`, `PAGBANK_SANDBOX_TOKEN`, `PAGARME_TEST_SECRET_KEY`, `ASAAS_SANDBOX_API_KEY`, `STRIPE_TEST_SECRET_KEY`, `EFI_SANDBOX_CLIENT_ID`, `EFI_SANDBOX_CLIENT_SECRET`, `EFI_SANDBOX_CERT_BASE64`, `PAYPAL_SANDBOX_CLIENT_ID`, `PAYPAL_SANDBOX_CLIENT_SECRET`, `CIELO_SANDBOX_MERCHANT_ID`, `CIELO_SANDBOX_MERCHANT_KEY`, `IUGU_TEST_API_TOKEN`. Nunca use `NEXT_PUBLIC_` com chaves secretas.

## Checkout: validação de preços e estoque sem cobrança

A loja possui `/checkout`, uma **prévia de conferência**, vinculada à página `/carrinho`. A conferência calcula o subtotal com preços efetivos no PostgreSQL e verifica publicação do produto, variantes ativas, estoque reservado e lotes ainda válidos. Usa `/api/checkout/preview` (POST com verificação de origem, validação de formato e `Cache-Control: no-store`) e RPC `public.preview_checkout_cart` como wrapper invoker da função privada de leitura `private.preview_checkout_cart`, criada pela migração `supabase/preview_checkout_cart.sql`. Não há coleta de endereço ou cartão.

- O navegador envia **apenas ID do produto e quantidade**. Nome/preço fornecidos via localStorage nunca determinam o subtotal calculado pelo servidor.
- Produtos demonstrativos, não publicados ou adultos são classificados como indisponíveis; dados de produtos adultos não são retornados.
- Se houver múltiplas variantes ativas, a prévia exige seleção de variante em funcionalidade futura, em vez de escolher automaticamente uma cor/tamanho.
- A conferência **não reserva estoque, não cria pedidos, não consulta bancos nem aciona um gateway**. O botão de pagamento permanece desativado.
- Frete e condições finais ainda não são calculados. Uma prévia não garante disponibilidade futura; a futura criação de pedidos precisará repetir validação e reservar estoque atomicamente.
- A revisão do checkout foi testada com transação revertida: preço do banco, quantidade, estoque insuficiente, produto demonstrativo, duplicidade, bloqueio +18 e ausência de mutações.

## Endereços de entrega e reservas de checkout em HOMOLOGAÇÃO

- Em `/conta/enderecos`, usuários autenticados podem cadastrar, alterar, excluir logicamente e definir um endereço principal. Números de telefone e CEP são normalizados; dados completos são protegidos por RLS, visíveis somente ao titular, e alteráveis apenas via RPC com `auth.uid()`.
- Em `/checkout`, o administrador (e somente ele, neste estágio) pode **simular reserva temporária de estoque real** para um carrinho de produtos publicados, não adultos, com uma única variação. A ação pede endereço previamente cadastrado; não aceita endereço arbitrário de outro titular.
- A migração `supabase/checkout_addresses_reservations.sql` adiciona `customer_addresses`, `orders.checkout_key`, `reservation_expires_at`, `shipping_address_snapshot`, RPCs `save_customer_address`, `archive_customer_address`, `create_checkout_order`, `cancel_checkout_order` e expirador privado.
- O estoque é reservado por 15 minutos e liberado automaticamente por um **Supabase Cron**, agendado de minuto em minuto. O processo é idempotente; por usuário há no máximo uma reserva pendente e cinco reservas iniciadas a cada 24h. O limite por pedido de teste é de 10 produtos e 30 unidades.
- Os preços e saldos são revalidados dentro da transação de criação de reserva; alterações parciais são revertidas em caso de erro. Nunca é possível reservar produtos adultos, inativos, demonstrativos ou sem saldo válido.
- O pedido de homologação tem `origin='store_api'` e status `pending`. Nunca é marcado pago automaticamente, nenhum e-mail de pedido é enviado, nem frete é cotado; o cliente pode cancelar a reserva em `/conta`. Administradores visualizam as reservas em `/admin/reservas`.
- **Checkout público permanece bloqueado** com `store_settings.checkout_reservations_enabled=false`; a função só permite teste com sessão de administrador. Não altere a flag para true até concluir processamento de pagamentos, webhooks seguros, frete, antifraude e termos de venda.
- Nenhuma chave de gateway, cartão, Pix ou endereço é transmitido para provedor de pagamento. Não há cobrança em qualquer etapa deste fluxo.

### Separação das reservas de teste e financeiro
Reservas de homologação com `origin='store_api'` são listadas somente em `/admin/reservas` e `/conta` do titular. Pedidos comerciais manuais são exibidos em `/admin/pedidos`, `/admin/logistica`, relatórios e financeiro. A migração `supabase/exclude_checkout_test_from_financial_metrics.sql` exclui `store_api` das agregações mensais. A sidebar também exclui essas reservas do contador de pedidos pendentes. Assim, reservas de teste não distorcem receita prevista nem quantidade de pedidos de clientes.

## Plugins de CEP e máscaras nos formulários
- `react-imask@7.6.1` em `src/components/forms/masked-fields.tsx` aplica máscaras sem alterar os valores normalizados enviados ao Supabase: CEP `00000-000`, telefones de 10/11 dígitos, além de componentes reutilizáveis para CPF e CNPJ (estes não coletam dados nesta versão).
- Endereços em `/conta/enderecos`: o CEP de oito números inicia consulta automática após 500 ms, com botão de tentativa manual. O servidor consulta ViaCEP e, se falhar ou não encontrar o CEP, tenta a BrasilAPI. Rua, bairro, cidade e UF são preenchidos quando disponíveis; número e complemento permanecem para digitação manual. O usuário deve conferir antes de salvar.
- Área `/admin/frete`: origem e destino com máscara de CEP, pesquisa automática de cidade/UF e mensagens de erros. A cotação permanece restrita ao sandbox e depende do token.
- A consulta pública de CEP no Next.js **exige login**, valida oito dígitos, não armazena o endereço consultado e não aceita URL arbitrária enviada pelo usuário. Dados obtidos do serviço externo não substituem validações do Supabase no cadastro.

## Preparação multi-gateway de pagamentos e frete no checkout (homologação)
- `supabase/sandbox_payment_attempts.sql` cria um **ledger administrativo de preparações** `sandbox_payment_attempts` (somente `sandbox`, estados `draft/expired/cancelled`), chaves de idempotência únicas por pedido, referência de gateway e valores extraídos diretamente de uma reserva válida. Não cria Pix nem recebe/captura cartões; não altera `orders.status` para pago.
- Também prepara `payment_webhook_receipts` para futura deduplicação de webhooks, sem endpoint público nem payload salvo. **Não registre webhooks como autenticados antes de implementar verificação criptográfica específica do provedor.**
- A RPC `plan_sandbox_payment_attempt` só aceita administradores, pedidos `store_api` pendentes e não expirados e gateways com sandbox documentado. O banco limita a um draft por reserva; selecionar outro provedor requer cancelar a reserva e refazer o teste.
- A RPC e o ledger foram testados com transação revertida: idempotência, valor calculado no servidor, tentativas inválidas, bloqueio de alteração direta, cancelamento e liberação do estoque.
- `/admin/pagamentos` mostra preparações, reservas elegíveis e seleção de gateway para homologação — sem **nenhuma transação bancária**.
- No `/checkout`, administradores podem solicitar uma cotação ao endpoint já existente `/api/admin/shipping/quote`, somente quando o token de Melhor Envio sandbox e CEP de origem estiverem configurados. A cotação não é incluída no subtotal nem gravada na reserva: valores reais precisam ser novamente validados antes da cobrança.
- Corrigido o dashboard: a lista de produtos não aplica mais o filtro `origin` inexistente; pedidos de teste são excluídos dos indicadores comerciais.

## Checkout Pro real com VENDEDOR DE TESTE (desativado até credenciais)

A API privada `POST /api/admin/payments/mercadopago/test-checkout` permite ao **administrador** gerar uma preferência Checkout Pro de testes, a partir de um `sandbox_payment_attempts` do Mercado Pago ligado a uma reserva ativa. O recurso fica **bloqueado por padrão** e não envia dados de cartão. Não é uma venda na Popê Beauty e não atualiza o status financeiro.

Variáveis **somente no servidor** Vercel, com valores exclusivos do painel Teste:
- `MP_TEST_ACCESS_TOKEN`: token obtido na aba **Teste** do Mercado Pago Developers. O prefixo `APP_USR-` também existe em produção e, sozinho, não distingue ambientes.
- `MP_TEST_SELLER_ID`: ID numérico do usuário vendedor **de teste**, confirmado na aba de contas de teste.
- `MP_TEST_PREFERENCE_CREATION_ENABLED=verified-test-account-only`: habilitação manual do módulo, **somente** após confirmar os dois campos acima.

Antes de POST ao Mercado Pago, o servidor valida via `GET /users/me` que `id` corresponde a `MP_TEST_SELLER_ID`, o `nickname` começa com `TEST` e o país é `MLB`. O servidor gera a preferência com produtos e preços do banco, limita a validade à reserva e valida `collector_id` e o domínio do `init_point` retornado. A primeira geração passa por RPC atômica `begin_mp_test_checkout`; novas tentativas são negadas para evitar criação múltipla, inclusive após falha de rede. A RPC `finish_mp_test_checkout` grava o ID/link **somente** em preparação administrativa. Nunca marca pagamento aprovado.

**Para testar na página externa:** entre SOMENTE com usuário de teste **comprador**. A API de produção do Mercado Pago é compartilhada com contas de teste; não existe domínio sandbox separado para Checkout Pro. A interface não redireciona automaticamente.

Ainda pendentes: webhook assinado, consulta autoritativa dos pagamentos no provedor, conciliação dos valores finais com frete, pagamentos reais e estorno. Sem esses componentes, pedidos de teste serão encerrados após 15 minutos independentemente do que ocorrer externamente.


## Webhook Mercado Pago — testes, assinatura e trilha de auditoria

A rota `POST /api/webhooks/mercadopago/test` foi implementada para **eventos de teste somente** e fica totalmente desativada por padrão. A URL deve ser usada apenas na configuração de Webhooks da aplicação de TESTE do Mercado Pago.

Variáveis secretas no **servidor da Vercel** (nunca `NEXT_PUBLIC_`, nunca em GitHub ou conversas):
- `MP_TEST_WEBHOOK_SECRET`: chave de assinatura do webhook da aplicação de testes.
- `MP_TEST_ACCESS_TOKEN` e `MP_TEST_SELLER_ID`: credencial TEST e ID numérico do vendedor de testes, verificados por `GET /users/me`.
- `SUPABASE_SERVICE_ROLE_KEY`: chave de serviço mantida exclusivamente no servidor, para gravar a auditoria depois de validar assinatura e recurso; NÃO deve ser exposta no cliente.
- `MP_TEST_WEBHOOK_ENABLED=verified-test-account-only`: habilitação manual, após verificar as chaves e separar o ambiente de testes.

A requisição é rejeitada se faltar qualquer variável acima. Depois de habilitada, a rota:
1. Limita o corpo a 16 KiB, exige JSON, os identificadores em query e body equivalentes, o tópico `payment`, evento em modo TEST.
2. Valida `x-signature` HMAC-SHA256 em comparação de tempo constante sobre `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` com tolerância de cinco minutos. Não salva o segredo nem a assinatura.
3. Autentica o vendedor TEST pelo token, compara seu ID, consulta `GET /v1/payments/{id}` e exige `collector_id` idêntico ao vendedor, `live_mode=false` e moeda BRL.
4. Cruza `external_reference=pope-sandbox:<id da tentativa>` com uma preparação de pagamento TEST e compara o subtotal em centavos. Se a reserva já venceu ou foi cancelada, registra a divergência, nunca libera o pedido.
5. Registra apenas **metadados sanitizados** em `payment_webhook_receipts` (`provider, external_event_id` único), com hash SHA-256 do JSON, status consultado no MP, valor, identidade do vendedor e vínculo com a tentativa de teste. Não guarda payload, dados do comprador ou cartão.

O painel `/admin/pagamentos` contém uma auditoria somente para administradores, com os últimos 100 eventos. Nenhuma rota faz `UPDATE orders.status='paid'`, captura, estorno ou envio de e-mail. Eventos com `approved` no provedor não representam receita da loja: são apenas informativos até a homologação do fluxo real de frete, pagamento, conciliação e estornos.

**Referências do provedor:** [Webhooks Mercado Pago](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/additional-content/your-integrations/notifications/webhooks) e [Consultar pagamentos](https://www.mercadopago.com.br/developers/pt/reference/online-payments/checkout-pro-preferences/get-payment/get).

**Limite atual:** nenhuma credencial de TEST nem chave de serviço foi configurada na Vercel, portanto não é possível verificar a entrega de um webhook real de homologação. O endpoint continua fechado (`503`) até a configuração explícita.
