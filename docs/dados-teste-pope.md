# Dados de demonstração e homologação da Popê Beauty

**Ambiente:** projeto Supabase Popê conectado ao e-commerce.
**Objetivo:** testar telas, filtros, moderação e recuperação sem criar pedidos,
compras, clientes ou avaliações reais.

## 1. Feed editorial oficial

Foram criadas **sete postagens identificadas com `[DEMO POPÊ]`**,
utilizando um produto existente e as categorias cadastradas.

- 4 publicadas — visíveis no feed, com vínculos de produto/categoria
- 1 pendente — visível somente no painel editorial
- 1 oculta — visível somente no painel editorial
- 1 não aprovada — visível somente no painel editorial

As quatro postagens publicadas são **conteúdo fictício claramente
identificado**, não recomendações comerciais ou depoimentos autênticos.

Endereços:
- `/feed` — visualização pública
- `/admin/feed` — moderação editorial

## 2. Carrinhos abandonados — sete cenários isolados

A tabela `demo_cart_scenarios` foi criada com **RLS só para
administradores**. Nenhum cenário representa uma pessoa real, tem e-mail
de contato ou gera pedido. As etiquetas começam com `Cenário 0...`.

1. Carrinho inativo há mais de 60 minutos, sem autorização simulada
2. Carrinho inativo com a preferência de lembrete simulada
3. Inativo e com estado de acompanhamento `reviewing`
4. Carrinho ativo (20 minutos sem alteração)
5. Carrinho com **pedido posterior simulado**; não deve ser contado como abandonado
6. Acompanhamento encerrado
7. Carrinho vazio

O administrador pode filtrar e atualizar o acompanhamento de cenários de
teste sem tocar na tabela `customer_saved_carts`.
Os horários de atividade são **relativos** ao momento da consulta para
manter a demonstração útil. A única referência de produto é uma opção
real do catálogo, mas os valores são ilustrativos.

Na página `/admin/carrinhos-abandonados`, os painéis **Carrinhos reais**
e **Cenários simulados para homologação** aparecem separados. O total
simulado **não entra no total de abandonos reais**.

## 3. Avaliações — cinco cenários isolados

A tabela `demo_product_review_scenarios` contém **5 opiniões simuladas**
de 1 a 5 estrelas, com diferentes estados (pendente, publicada e oculta).
Apenas a equipe autorizada pode ler e moderar esses registros.

Essas avaliações **não** são inseridas em `product_reviews`, não aparecem
na página pública do produto e **não influenciam a nota média**.

Na página `/admin/avaliacoes`, os blocos *Avaliações reais de clientes*
e *Avaliações simuladas* aparecem separados, com botões para testar
aprovação, ocultação e retorno para análise.

## 4. Popê Vídeos — clipe livre ilustrativo

A tabela `demo_feed_reels` contém um vídeo de flores distribuído pela MDN
sob CC0, usado exclusivamente para exercitar carregamento de vídeo, pausa,
rolagem vertical e cartão de produto relacionado.

Fonte: `https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4`.
Documentação do exemplo:
`https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/video`.

O vídeo **não mostra nem demonstra os produtos da loja**. A página
`/feed/videos` exibe a amostra somente quando **não houver vídeos
oficiais publicados**. O rótulo destacado informa que é um teste.
A amostra vem de hospedagem externa e depende da disponibilidade da MDN.

O upload real de vídeos e fotos continua pelo painel `/admin/feed`,
com armazenamento privado `pope-feed-media`.

## 5. Como remover somente os dados de teste

O arquivo `supabase/demo_scenarios_cleanup.sql` remove apenas os registros
com IDs determinados desta bateria de testes, incluindo as publicações
fictícias. O script **não apaga** postagens reais, clientes,
pedidos, pagamentos, carrinhos e avaliações verdadeiros.

Atenção: execute a limpeza depois de finalizar a homologação.
A migração `demo_scenarios_v1.sql` deve ser aplicada uma única vez
em cada ambiente. Não inclua esses dados na apuração de vendas.
