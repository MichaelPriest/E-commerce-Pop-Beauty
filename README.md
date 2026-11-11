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
