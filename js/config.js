/* Configuração compartilhada do SafraPact.
 * A URL do Firebase abaixo permite sincronizar as demandas publicadas
 * entre notebooks e celulares durante a demonstração.
 *
 * Para ativar o mapa oficial incorporado do Google, cole uma chave da
 * Maps Embed API em googleMapsApiKey. Enquanto a chave estiver vazia,
 * o sistema usa uma prévia pública compatível com coordenadas.
 */
window.SAFRAPACT_CONFIG = {
    databaseURL: "https://safrapact-default-rtdb.firebaseio.com",
    pollIntervalMs: 5000,
    googleMapsApiKey: "AIzaSyBC9rzZVquhboabq2K9AaQ197__y8D-3mc"
};
