# SafraPact — teste rápido da versão corrigida

## Contas de demonstração
- Produtor Rural: `produtor@safra.com.br` / `123`
- Empresa Prestadora: `empresa@agro.com.br` / `123`

## Fluxo recomendado
1. Abra `index.html` e confirme que a página inicia em tema escuro e exibe três ofertas de vitrine.
2. Sem login, clique em **Explorar Oportunidades**: deve abrir o modal de login.
3. Entre como produtor. No header deve aparecer **Nova Demanda**; **Criar Conta**, **Mural de Propostas** e **Explorar Oportunidades** não devem aparecer.
4. Clique em **Nova Demanda**, preencha parcialmente e feche o modal. Ao abrir novamente, o rascunho deve permanecer.
5. Salve uma demanda como pendente e revise-a no perfil. Depois publique-a.
6. Saia e entre como empresa prestadora. O header deve exibir o sino de notificações. A nova oferta deve aparecer no sino e no mural.
7. Na página `propostas.html`, use a pesquisa, os filtros e o botão **Ver todas**.

## Sincronização em aparelhos diferentes
O compartilhamento entre celulares e notebooks exige configurar o Firebase Realtime Database em `js/config.js`. Sem isso, a demonstração funciona apenas no navegador em que a demanda foi criada.
