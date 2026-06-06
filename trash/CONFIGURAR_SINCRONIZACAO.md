# SafraPact — sincronização entre celulares e notebooks

O projeto funciona imediatamente no navegador usando `localStorage`. Nesse modo, login, rascunhos, demandas pendentes, publicação e notificações podem ser demonstrados no mesmo dispositivo ou em abas do mesmo navegador.

Para que celulares e notebooks diferentes exibam a mesma nova oferta durante a apresentação, ative um banco compartilhado gratuito no Firebase Realtime Database.

## Configuração rápida para a demonstração

1. Crie um projeto no Firebase Console.
2. Abra **Build > Realtime Database** e crie o banco.
3. Para a demonstração em sala, use temporariamente estas regras:

```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

4. Copie a URL do banco, semelhante a:

```text
https://nome-do-projeto-default-rtdb.firebaseio.com
```

5. Abra `js/config.js` e cole a URL:

```js
window.SAFRAPACT_CONFIG = {
    databaseURL: "https://nome-do-projeto-default-rtdb.firebaseio.com",
    pollIntervalMs: 5000
};
```

6. Envie os arquivos ao GitHub Pages novamente.

## Como demonstrar

- No notebook, acesse como produtor: `produtor@safra.com.br` / `123`.
- Em um ou mais celulares, acesse como prestador: `empresa@agro.com.br` / `123`.
- Publique uma demanda no notebook.
- Em até cinco segundos, o sino dos prestadores mostrará a nova oferta. O mural também será atualizado.

## Atenção

As regras abertas servem apenas para protótipo em sala. Não utilize essa configuração em produção. Uma versão real deve usar Firebase Authentication ou outro backend com autenticação, permissões por perfil e validação no servidor.
