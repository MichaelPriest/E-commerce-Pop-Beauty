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
