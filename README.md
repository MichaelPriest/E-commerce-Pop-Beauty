# Popê Beauty 💖

E-commerce de maquiagem e beleza, desenvolvido com **Next.js 16**, **TypeScript**, **Supabase** e **Vercel**.

## Status da primeira versão
- Vitrine responsiva, categorias, busca e detalhes de produtos.
- Carrinho demonstrativo local (sem checkout, sem pagamento, sem reserva de estoque).
- Cadastro e login preparados com Supabase Auth (e-mail/senha).
- Área de cliente e painel administrativo com autorização por banco de dados.
- SQL inicial de catálogo, variações, estoque, pedidos, movimentações e listagens de marketplaces.
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
2. Execute `supabase/schema.sql` no SQL Editor do projeto dedicado.
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
