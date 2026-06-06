"use strict";

document.addEventListener("DOMContentLoaded", async () => {
    SafraPact.initCommon();
    inicializarTypewriter();
    configurarModaisBase();
    configurarLogin();
    aplicarSessaoNaHome();
    await SafraPact.getPublishedDemands();
    configurarDetalhesHome();
});

function inicializarTypewriter() {
    const elemento = document.getElementById("typewriter-text");
    if (!elemento) return;
    const frases = ["Grandes Lavouras.", "Produtores Rurais.", "Empresas do Agro."];
    let fraseIndex = 0, caractereIndex = 0, apagando = false;
    function executarCiclo() {
        const fraseAtual = frases[fraseIndex];
        elemento.innerText = apagando ? fraseAtual.substring(0, caractereIndex - 1) : fraseAtual.substring(0, caractereIndex + 1);
        caractereIndex = apagando ? caractereIndex - 1 : caractereIndex + 1;
        let delay = apagando ? 35 : 75;
        if (!apagando && caractereIndex === fraseAtual.length) { delay = 1800; apagando = true; }
        else if (apagando && caractereIndex === 0) { apagando = false; fraseIndex = (fraseIndex + 1) % frases.length; delay = 450; }
        setTimeout(executarCiclo, delay);
    }
    executarCiclo();
}

function abrirModal(id) { const modal = document.getElementById(id); if (modal) modal.style.display = "flex"; }
function fecharModal(id) { const modal = document.getElementById(id); if (modal) modal.style.display = "none"; }
function abrirLogin() { abrirModal("modalLoginOverlay"); }

function configurarModaisBase() {
    document.getElementById("nav-cadastro")?.addEventListener("click", () => abrirModal("modalRegisterOverlay"));
    document.getElementById("nav-prazos")?.addEventListener("click", () => abrirModal("modalPrazosOverlay"));
    document.getElementById("link-mudar-cadastro")?.addEventListener("click", () => { fecharModal("modalLoginOverlay"); abrirModal("modalRegisterOverlay"); });
    document.getElementById("close-login")?.addEventListener("click", () => fecharModal("modalLoginOverlay"));
    document.getElementById("close-cadastro")?.addEventListener("click", () => fecharModal("modalRegisterOverlay"));
    document.getElementById("close-prazos")?.addEventListener("click", () => fecharModal("modalPrazosOverlay"));
    document.getElementById("btn-entendi-prazos")?.addEventListener("click", () => fecharModal("modalPrazosOverlay"));
    document.getElementById("close-detalhes")?.addEventListener("click", () => fecharModal("modalOverlay"));
    window.addEventListener("click", event => {
        ["modalLoginOverlay", "modalRegisterOverlay", "modalPrazosOverlay", "modalOverlay"].forEach(id => { const modal = document.getElementById(id); if (event.target === modal) fecharModal(id); });
    });
}

function configurarLogin() {
    const botao = document.getElementById("btn-efetuar-login");
    if (!botao) return;
    botao.addEventListener("click", () => {
        const user = SafraPact.authenticate(document.getElementById("login-email")?.value, document.getElementById("login-senha")?.value);
        const erro = document.getElementById("login-error-msg");
        if (!user) { if (erro) { erro.innerText = "E-mail ou senha inválidos. Use uma das contas de demonstração."; erro.style.display = "block"; } return; }
        SafraPact.saveSession(user);
        fecharModal("modalLoginOverlay");
        window.location.reload();
    });
}

function configurarAcessoMural(elemento, sessao) {
    if (!elemento || elemento.dataset.boundMural) return;
    elemento.dataset.boundMural = "true";
    elemento.addEventListener("click", event => {
        const atual = SafraPact.getSession() || sessao;
        if (!atual || atual.tipo !== "Empresa Prestadora") { event.preventDefault(); abrirLogin(); }
    });
}

function aplicarSessaoNaHome() {
    const sessao = SafraPact.getSession();
    const login = document.getElementById("nav-login");
    const heroExplorar = document.getElementById("hero-explorar");
    const heroPublicar = document.getElementById("hero-publicar");
    const menuMural = document.querySelector("#menu-item-mural a");
    configurarAcessoMural(heroExplorar, sessao);
    configurarAcessoMural(menuMural, sessao);
    if (!sessao) {
        login?.addEventListener("click", abrirLogin);
        heroPublicar?.addEventListener("click", abrirLogin);
        return;
    }
    if (sessao.tipo === "Empresa Prestadora") {
        if (heroPublicar) heroPublicar.style.display = "none";
        return;
    }
    if (heroExplorar) heroExplorar.style.display = "none";
    if (heroPublicar) heroPublicar.style.display = "inline-flex";
    const mural = document.getElementById("menu-item-mural"); if (mural) mural.style.display = "none";
}

function configurarDetalhesHome() {
    document.querySelectorAll(".btn-detalhes").forEach(botao => botao.addEventListener("click", () => abrirDetalhesHome(botao.dataset.id)));
}

function abrirDetalhesHome(id) {
    const item = SafraPact.BASE_DEMANDS.find(demanda => String(demanda.id) === String(id));
    if (!item) return;
    document.getElementById("modalNome").innerText = item.titulo;
    document.getElementById("modalCargo").innerHTML = `<i class="fas fa-map-marker-alt"></i> ${SafraPact.escapeHtml(item.localizacao)}`;
    document.getElementById("modal-details-content").innerHTML = SafraPact.demandDetailsMarkup(item);
    abrirModal("modalOverlay");
}
