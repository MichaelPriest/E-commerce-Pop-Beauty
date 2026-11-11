# Templates de e-mail — Popê Beauty

Arquivos em HTML, com CSS inline e layout responsivo, prontos para copiar no editor do **Supabase Auth**. Paleta: rosa `#f71993`, roxo `#790c84`, fundo `#fff4fa`; logotipo `https://e-commerce-pope-beauty.vercel.app/logo.webp`.

**SMTP remetente pretendido:** `Popê Beauty <popebeauty.e@gmail.com>`. Criar arquivos no GitHub **não altera a configuração de SMTP nem publica os templates no Supabase**.

## Aplicar os templates no Supabase

1. Abra **[Authentication → Email Templates](https://supabase.com/dashboard/project/igdmkymzxdrqjkwouunc/auth/templates)**.
2. Selecione o tipo de e-mail na lista (a nomenclatura pode aparecer traduzida).
3. Abra o arquivo HTML respectivo no GitHub e copie todo o conteúdo (view Raw / copiar).
4. Defina o **Subject** de acordo com o arquivo `subjects.json` e cole o HTML completo no campo **Body / Message**. Salve.
5. Repita para os tipos de autenticação. Em **Security Notifications**, ative as notificações desejadas, se disponíveis, antes de aplicar as respectivas versões.
6. Faça testes reais em contas controladas: cadastro, recuperação de senha, alteração de e-mail, MFA e convites, conforme cada recurso esteja habilitado.

### Mapeamento do Supabase

| Campo / tipo no painel | Arquivo |
|---|---|
| Confirm sign up | `01-confirmacao-cadastro.html` |
| Reset password | `02-recuperacao-senha.html` |
| Magic Link | `03-login-link-magico.html` |
| Invite user | `04-convite.html` |
| Change email address | `05-alteracao-email.html` |
| Reauthentication | `06-reauthenticacao.html` |
| Password changed | `07-notificacao-senha-alterada.html` |
| Email address changed | `08-notificacao-email-alterado.html` |
| Phone number changed | `09-notificacao-telefone-alterado.html` |
| Verification method added | `10-notificacao-mfa-adicionado.html` |
| Verification method removed | `11-notificacao-mfa-removido.html` |
| Sign-in method linked | `12-notificacao-login-vinculado.html` |
| Sign-in method removed | `13-notificacao-login-removido.html` |

O HTML usa **variáveis oficiais do Supabase**:
- Links de autenticação: `{{ .ConfirmationURL }}` (o próprio Supabase gera link temporário).
- Reautenticação: `{{ .Token }}`.
- Confirmação de novo e-mail: `{{ .NewEmail }}`.
- Notificação de e-mail alterado: `{{ .OldEmail }}`.
- Notificação de telefone alterado: `{{ .OldPhone }}`, `{{ .Phone }}`.
- Notificação de MFA: `{{ .FactorType }}`.
- Notificação de método de login: `{{ .Provider }}`.

**Não substitua esses marcadores por exemplos reais.** O Supabase resolve as variáveis no envio. Preserve especialmente `{{ .ConfirmationURL }}` integralmente; não substitua pelo link fixo da loja.

### Recuperação de senha (configuração de URL)

A aplicação usa o fluxo PKCE, com redirecionamento:
`https://e-commerce-pope-beauty.vercel.app/auth/callback?next=/redefinir-senha`

Essa URL e `https://e-commerce-pope-beauty.vercel.app/auth/callback` precisam estar permitidas em **Authentication → URL Configuration**. E-mails de recuperação devem ser testados no mesmo navegador em que o usuário os solicitou. Garanta também SMTP ativo e que o provedor permita envio aos destinatários.

### Notificações transacionais de pedidos

Os arquivos em `emails/pedidos/` são **somente modelos futuros** — não podem ser colados diretamente como templates do Supabase Auth e **não são disparados automaticamente**. Usam placeholders do integrador futuro, como `[[PEDIDO]]`, `[[CLIENTE]]`, `[[VALOR_TOTAL]]`, `[[TRANSPORTADORA]]`, `[[RASTREIO]]` e `[[MOTIVO]]`. O serviço responsável pelo disparo deverá escapar as variáveis, definir a transição de status correta, garantir idempotência e nunca anunciar pagamento sem confirmação real.

**Atenção à seção +18:** não incluir itens, imagens, descrição de produtos adultos ou dados sensíveis nos e-mails genéricos de pedidos.

## Observações

- O serviço SMTP padrão do Supabase limita destinatários; uma configuração SMTP personalizada adequada à produção é necessária para envio amplo.
- O e-mail deve ter origem confiável e as mensagens devem ser verificadas nos clientes Gmail, Outlook e dispositivos móveis.
- O logotipo é remoto. Se o cliente de e-mail bloquear imagens, o nome da marca continua visível em texto.
- E-mails transacionais de autenticação não devem conter promoções, links de pagamento ou dados confidenciais de usuários.

Fontes: [Supabase — Email Templates](https://supabase.com/docs/guides/auth/auth-email-templates) e [Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).
