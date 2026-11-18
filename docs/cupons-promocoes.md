# Cupons e promoções — preparação comercial

## Escopo implementado

A página `/admin/promocoes` contém cadastro e edição de campanhas, pesquisa,
filtro por situação e simulador interno. O administrador pode definir:

- Código único de 4 a 24 caracteres (letras maiúsculas, números, hífen e sublinhado);
- Desconto percentual (de 1% a 90%) ou valor fixo (mínimo de R$ 1,00);
- Subtotal mínimo em centavos; teto opcional para descontos percentuais;
- Datas de início e fim (início inclusivo e fim exclusivo);
- Sinalizador `enabled`, usado **somente na simulação administrativa**.

Os preços são expressos no banco em **centavos inteiros**. A simulação de
percentual arredonda para baixo para evitar conceder centavos extras. O
desconto nunca ultrapassa o subtotal. Frete, taxas e total de cobrança não
são alterados por este módulo.

## Aplicação da migração

O arquivo `supabase/promotion_coupons_admin_v1.sql` cria a tabela
`public.promotion_coupons`, índice de vigência e políticas RLS. Deve ser
aplicado uma única vez no Supabase do Popê, antes de liberar a página.

A tabela inicia vazia, e a criação de cupons parte de `enabled=false`.
Apenas administradores autenticados podem consultar, inserir ou atualizar.
Não há política de exclusão, leitura anônima nem função pública de resgate.

## Limitações deliberadas

**Nenhuma compra recebe desconto automaticamente.** A existência de cupons
cadastrados ou marcados como ativos não altera preço, estoque, pedidos,
checkout Mercado Pago, NF-e ou Mercado Livre/Shopee. A interface sinaliza
que as condições são apenas uma simulação administrativa.

Antes de habilitar o uso comercial de cupons, implementar e homologar:

1. Cálculo server-side e resgate transacional com idempotência no momento
   de criação do pedido, incluindo conciliação do total cobrado;
2. Reserva ou contagem de utilizações resistente à concorrência, limites
   por cliente, abuso de códigos e reversões por cancelamento/estorno;
3. Regras de empilhamento, frete grátis, exclusões e categorias;
4. Tratamento fiscal do desconto nas linhas da NF-e e conciliação do gateway;
5. Testes de duplicidade, sessão expirada, alterações simultâneas e segurança RLS.

Nunca calcular o valor efetivamente cobrado a partir do navegador.
Não colocar credenciais ou tokens em descrições de campanhas.

## Testes

Executar `npm run test`, `npm run typecheck` e `npm run build`.
O arquivo `tests/promotion-coupons-admin.test.mjs` cobre a validação dos
códigos, valores, períodos e os controles de acesso do SQL.
