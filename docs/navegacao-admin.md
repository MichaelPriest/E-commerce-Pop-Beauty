# Navegação do painel administrativo — Popê Beauty

## Organização da sidebar

O painel reserva as três opções de acesso rápido **Visão geral**, **Pedidos**
e **Notificações**, sempre visíveis na lateral. Os demais módulos ficam em
grupos expansíveis, organizados conforme o processo operacional:

| Área | Módulos |
|---|---|
| Vendas e clientes | Clientes, marketplaces e reservas de teste |
| Catálogo e campanhas | Produtos, importação CSV, categorias, cupons e prévia +18 |
| Estoque e compras | Estoque, reposição, compras, recebimento e fornecedores |
| Logística e fiscal | Logística, remessas, frete, cadastro e documentos fiscais |
| Financeiro e relatórios | Financeiro, gateways, pagamentos de teste e relatórios |
| Equipe e sistema | Usuários ativos, permissões, auditoria, prontidão e configurações |

Nenhum endereço do painel foi removido. Os menus funcionam como acordeão:
ao expandir uma área, as demais são recolhidas. A página ativa abre
automaticamente sua área ao navegar e exibe o link correspondente em destaque.
Em rotas hierárquicas, o endereço mais específico tem prioridade (por exemplo,
`/admin/produtos/importar` é destacado no lugar de `/admin/produtos`).

## Uso no computador e celular

- O botão lateral alterna entre modo compacto e expandido. A preferência é
  guardada apenas neste navegador (`pope-admin-collapsed`).
- No modo compacto, clicar no ícone de uma seção expande a barra e abre a área.
- No celular, o menu lateral abre como painel sobreposto e pode ser fechado
  pela máscara, pelo botão X, ao navegar ou pela tecla Escape.
- O botão **Atalhos rápidos** abre as tarefas mais usadas. Digitar uma busca
  consulta todos os módulos e atalhos, ignorando acentos e letras maiúsculas.
- `Ctrl+K` (Windows/Linux) ou `⌘+K` (macOS) abre a busca rápida;
  `Escape` fecha o menu.

Os indicadores de pedidos pendentes, notificações e usuários ativos continuam
associados aos mesmos dados anteriores. O componente não altera permissões
do Supabase, dados, pagamentos, políticas, fretes nem emissão de NF-e.

## Manutenção e validação

As rotas e ícones estão declarados em `src/components/admin-shell.tsx`.
As funções de comparação de rotas e busca estão em
`src/lib/admin-navigation-core.ts`.

Execute `npm run test`, `npm run typecheck` e `npm run build`.
O teste `tests/admin-sidebar-navigation.test.mjs` verifica a preservação
de todos os 29 endereços, o destaque de rotas específicas, a busca e os
atributos básicos de acessibilidade.
