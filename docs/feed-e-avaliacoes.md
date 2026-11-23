# Feed Popê e avaliações dos produtos

## Quem pode publicar

**Somente a equipe Popê Beauty**, com perfil `admin` ou `staff`
configurado na tabela protegida `public.profiles`, pode publicar conteúdo
no feed. O público não tem acesso ao editor nem permissão de escrita SQL.

- **Feed público:** `/feed`, acessível pelo menu da loja
- **Painel administrativo:** `/admin/feed`, integrado à sidebar
- **Equipe com perfil staff:** `/equipe/feed`, acessível por Minha conta
- **Moderação de avaliações:** `/admin/avaliacoes` ou `/equipe/avaliacoes`

## Publicações oficiais

A equipe pode criar postagens de texto (até 2.000 caracteres), imagens
(JPG, PNG ou WebP, até 5 MB) ou vídeo (MP4 ou WebM, até 25 MB). É permitido
um arquivo por publicação nesta versão. A postagem pode vincular um
**produto**, uma **categoria** ou uma **subcategoria** do catálogo.

A equipe escolhe **publicar imediatamente** ou enviar para análise
(`pending`). No painel, pode publicar, ocultar, rejeitar e reenviar para
revisão. O feed público apresenta somente publicações `published`,
ordenadas pela data de publicação, em páginas de nove itens, com filtros
de produto e categoria. Ao selecionar uma categoria pai, o filtro inclui
suas subcategorias vinculadas. Cada cartão pode levar à página de produto
ou à listagem da categoria.

Nenhum produto ou categoria `+18` é disponibilizado neste feed, e
alterações posteriores que tornem o produto restrito também são consideradas
pela política de leitura.

As mídias ficam no bucket privado `pope-feed-media`. URLs de acesso
temporário são geradas pelo servidor apenas quando a sessão tiver direito
de ler a postagem. A tabela SQL consulta o arquivo existente antes de
registrar a mídia. O armazenamento limita formato, tamanho e pasta ao
usuário editor. Não são aceitos arquivos externos nem URLs arbitrárias
no cadastro de mídia.

As postagens são identificadas publicamente como **Equipe Popê Beauty**,
sem exibir os nomes pessoais dos funcionários.

## Avaliações e comentários dos produtos

Nas páginas de produtos não restritos a maiores de idade, clientes
autenticados podem enviar **uma avaliação por produto**, contendo:

- Nota obrigatória de **1 a 5 estrelas**
- Comentário entre **10 e 1.200 caracteres**

Novas avaliações entram em `pending`. A moderação da equipe pode
aprovar (`published`), ocultar (`hidden`) ou retornar para análise.
A página de produto mostra as 20 avaliações publicadas mais recentes
e a média de estrelas calculada sobre todas as avaliações aprovadas
por uma função do banco. O autor pode consultar a situação da própria
avaliação, mesmo quando ainda não está publicada.

**Importante:** esta versão não verifica automaticamente se o
avaliador realmente comprou o produto. O site não exibe selo de compra
verificada. Avaliações são associadas à conta autenticada, com
identificação pelo nome de exibição registrado no momento do envio.

## Segurança e implantação

Migrar o Supabase Popê na seguinte ordem:

1. `supabase/social_feed_v1.sql`
2. `supabase/product_reviews_v1.sql`

O banco define a função privada `private.is_feed_editor()`, baseada
exclusivamente no papel protegido em `public.profiles`. Políticas RLS
impedem clientes de criar postagens ou enviar mídias do feed e limitam
reviews a autoria própria e produtos permitidos. O navegador não pode
alterar o autor, a nota, o comentário ou o produto após o envio. Somente
a equipe pode alterar o status de moderação. Não há publicação automática
de avaliações.

A equipe deve obter autorização de uso das imagens e vídeos, evitar
material com dados pessoais de terceiros e verificar os direitos de
música antes de publicar vídeos com trilha sonora.

## Testes e limitações

Executar `npm run test`, `npm run typecheck` e `npm run build`.
O teste `tests/social-feed-product-reviews.test.mjs` cobre a
separação equipe/cliente, formatos de mídia, vínculo com o catálogo,
limites de notas e validação de status.

Não estão inclusos nesta primeira entrega: múltiplos arquivos por post,
comentários em publicações do feed, algoritmos de recomendação, reels
infinito, notificações, edição de avaliações antigas nem selo automático
de compra verificada. Esses recursos podem ser adicionados de maneira
independente sem habilitar o checkout.


## Popê Vídeos — feed vertical

A página pública `/feed/videos` transforma as postagens de vídeo da
equipe em uma sequência vertical com rolagem e pausa automática de vídeos
fora da área visível. O vídeo inicia sem som para respeitar as
preferências do visitante; o próprio controle nativo permite ativar o
áudio. Cada publicação pode direcionar ao **produto relacionado**
ou à **categoria vinculada**. A página aceita filtros por produto e
categoria e usa o mesmo controle de publicação oficial e mídia privada
do feed. Não existe envio de vídeos pelo cliente.

Nesta etapa, **capas específicas, postagens agendadas e editor avançado
de cortes** ainda não foram implementados. A duração dos links
temporários de mídia limita o uso em sessões muito longas, que podem
exigir atualizar a página.
