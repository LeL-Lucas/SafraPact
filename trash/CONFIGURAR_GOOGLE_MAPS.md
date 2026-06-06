# Ativar a prévia oficial do Google Maps

O formulário já aceita latitude e longitude e também possui o botão **Usar minha localização atual**.
Sem configuração adicional, a página exibe uma prévia compatível com coordenadas e permite abrir o ponto no Google Maps.

Para usar oficialmente a Maps Embed API:

1. Acesse o Google Cloud Console.
2. Selecione ou crie um projeto.
3. Ative a **Maps Embed API**.
4. Crie uma chave de API.
5. Restrinja a chave ao domínio do GitHub Pages e à Maps Embed API.
6. Abra `js/config.js` e cole a chave em `googleMapsApiKey`.

Exemplo:

```js
window.SAFRAPACT_CONFIG = {
    databaseURL: "https://safrapact-default-rtdb.firebaseio.com",
    pollIntervalMs: 5000,
    googleMapsApiKey: "COLE_A_CHAVE_AQUI"
};
```
