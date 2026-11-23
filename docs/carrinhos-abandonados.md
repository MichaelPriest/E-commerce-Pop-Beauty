# Central de Carrinhos Abandonados — Popê Beauty

## O que o módulo faz

**Administração:** `/admin/carrinhos-abandonados`, em
**Vendas e clientes → Carrinhos abandonados**.

**Cliente:** `/carrinho`, seção **Carrinho salvo na sua conta**.

O sistema sincroniza automaticamente carrinhos de **clientes autenticados
com perfil customer**. Carrinhos anônimos continuam somente no navegador.
Cada snapshot armazenado contém **apenas os IDs do produto, ID da variação e
quantidade**. O servidor não confia em nomes, preços, estoque ou totais
enviados pelo navegador. A sincronização não cria pedidos, reservas ou pagamentos.

**Critério de inatividade:** 60 minutos ou mais sem alteração de itens
(sujeito ao limite de consulta de 30 dias). O administrador consulta também
os pedidos de loja criados posteriormente à última alteração. Se existir
um pedido posterior, o carrinho é classificado como **pedido iniciado**,
não como abandonado. Reservas de homologação são excluídas desta correlação.

Os valores exibidos são estimativas calculadas com os **preços atuais do
catálogo**, sem frete, descontos, impostos, ou garantia de estoque.
O painel mostra somente uma amostra recente de até 220 carrinhos para
evitar consultas excessivas. Não é um indicador de receita perdida
nem um consolidado contábil de toda a base.

## Ações administrativas

- Visualizar abandonados, ativos, com pedido iniciado e encerrados
- Filtrar por nome ou produto
- Marcar `Em acompanhamento`, `Encerrado` ou `Reabrir`
- Ver se o cliente autorizou receber **lembretes de recuperação**

Nenhum botão envia e-mail, SMS ou WhatsApp. **O consentimento
de lembretes é desmarcado por padrão**. Uma automação de mensagens só
poderá ser implementada depois da integração do provedor, templates,
preferências de canal e descadastro. Nunca interpretar a marcação
`Em acompanhamento` como contato realizado.

## Recuperação pelo cliente

Ao acessar a conta em outro dispositivo, o navegador **não substitui**
seu carrinho automaticamente. Quando existem dois carrinhos diferentes,
o conteúdo remoto é preservado até haver uma alteração local ou uma restauração explícita. Em `/carrinho`, o cliente pode restaurar
voluntariamente os itens salvos. Quando já existe um carrinho local, o
sistema pede confirmação para substituí-lo.

Produtos desativados, restritos ou variações inválidas não são
restaurados. Preço e estoque devem ser revalidados no checkout.
O cliente pode esvaziar tanto o carrinho local quanto os itens salvos.
Também pode ativar ou desativar a preferência de lembretes.

## Segurança, privacidade e limites

Aplicar `supabase/customer_saved_carts_v1.sql` no projeto Supabase Popê.
A tabela `customer_saved_carts` tem RLS: leitura por titular e
administrador; triagem exclusiva de administrador. A função
`save_customer_cart` recebe somente itens simples, valida tipo,
IDs UUID, SKUs pertencentes aos produtos e quantidades (1 a 99),
bloqueia produtos +18 e usa o usuário autenticado como titular.
A função `set_saved_cart_reminders` altera apenas a preferência
do próprio cliente. Clientes anônimos, equipe e usuários sem sessão
não podem salvar snapshots via as RPCs.

A listagem desconsidera dados com mais de 30 dias. **Esta primeira
etapa não executa limpeza automática física da tabela**: definir e
homologar retenção/eliminação em tarefa agendada antes de ativar
campanhas de recuperação. Não expor o histórico aos usuários anônimos
ou a contas de outras pessoas.

## Testes

`tests/reels-abandoned-carts.test.mjs` confirma a classificação,
proteções de acesso, cálculo de estimativas e ausência de envios
automáticos. Executar também `npm run test`, `npm run typecheck` e
`npm run build`.
