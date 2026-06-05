"use strict";

const USUARIOS_DEMO = [
    { email: "produtor@safra.com.br", senha: "123", tipo: "Produtor Rural", nome: "Fazenda Progresso" },
    { email: "empresa@agro.com.br", senha: "123", tipo: "Empresa Prestadora", nome: "Logística & Colheita Agro" }
];

const DEMANDAS_VITRINE = Object.fromEntries(SafraPact.BASE_DEMANDS.map(item => [String(item.id), item]));

window.addEventListener("DOMContentLoaded", () => {
    SafraPact.initCommon();
    inicializarTypewriter();
    configurarModaisBase();
    configurarLogin();
    aplicarSessaoNaHome();
});

function inicializarTypewriter() {
    const elemento = document.getElementById("typewriter-text");
    if (!elemento) return;
    const frases = ["Grandes Lavouras.", "Produtores Rurais.", "Empresas do Agro."];
    let fraseIndex = 0, caractereIndex = 0, apagando = false;
    function executarCiclo() {
        const frase = frases[fraseIndex];
        elemento.textContent = apagando ? frase.slice(0, Math.max(0, caractereIndex - 1)) : frase.slice(0, caractereIndex + 1);
        caractereIndex += apagando ? -1 : 1;
        let delay = apagando ? 35 : 75;
        if (!apagando && caractereIndex === frase.length) { apagando = true; delay = 1800; }
        else if (apagando && caractereIndex === 0) { apagando = false; fraseIndex = (fraseIndex + 1) % frases.length; delay = 450; }
        window.setTimeout(executarCiclo, delay);
    }
    executarCiclo();
}

function abrirModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.style.display = "flex";
}
function fecharModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.style.display = "none";
}
function abrirLogin() { abrirModal("modalLoginOverlay"); }

function configurarModaisBase() {
    document.querySelectorAll(".btn-detalhes").forEach(botao => botao.addEventListener("click", () => {
        const dados = DEMANDAS_VITRINE[String(botao.dataset.id)];
        if (!dados) return;
        document.getElementById("modalNome").textContent = dados.titulo;
        document.getElementById("modalCargo").innerHTML = `<i class="fas fa-map-marker-alt"></i> ${SafraPact.escapeHtml(dados.localizacao)}`;
        document.getElementById("modalExp").textContent = dados.area;
        document.getElementById("modalEsp").textContent = dados.janela;
        abrirModal("modalOverlay");
    }));

    document.getElementById("nav-prazos")?.addEventListener("click", () => abrirModal("modalPrazosOverlay"));
    document.getElementById("nav-cadastro")?.addEventListener("click", () => abrirModal("modalRegisterOverlay"));
    document.getElementById("link-mudar-cadastro")?.addEventListener("click", () => { fecharModal("modalLoginOverlay"); abrirModal("modalRegisterOverlay"); });
    document.getElementById("close-login")?.addEventListener("click", () => fecharModal("modalLoginOverlay"));
    document.getElementById("close-cadastro")?.addEventListener("click", () => fecharModal("modalRegisterOverlay"));
    document.getElementById("close-prazos")?.addEventListener("click", () => fecharModal("modalPrazosOverlay"));
    document.getElementById("btn-entendi-prazos")?.addEventListener("click", () => fecharModal("modalPrazosOverlay"));
    document.getElementById("close-detalhes")?.addEventListener("click", () => fecharModal("modalOverlay"));
    window.addEventListener("click", event => {
        ["modalOverlay", "modalLoginOverlay", "modalRegisterOverlay", "modalPrazosOverlay"].forEach(id => {
            const modal = document.getElementById(id);
            if (event.target === modal) fecharModal(id);
        });
    });
}

function configurarLogin() {
    const botao = document.getElementById("btn-efetuar-login");
    const email = document.getElementById("login-email");
    const senha = document.getElementById("login-senha");
    const erro = document.getElementById("login-error-msg");
    if (!botao || !email || !senha) return;

    const autenticar = () => {
        if (erro) erro.style.display = "none";
        const usuario = USUARIOS_DEMO.find(item => item.email === email.value.trim().toLowerCase() && item.senha === senha.value);
        if (!usuario) {
            if (erro) { erro.textContent = "E-mail corporativo ou senha incorretos."; erro.style.display = "block"; }
            return;
        }
        SafraPact.saveSession(usuario);
        senha.value = "";
        fecharModal("modalLoginOverlay");
        aplicarSessaoNaHome();
        SafraPact.initCommon();
    };
    botao.addEventListener("click", autenticar);
    senha.addEventListener("keydown", event => { if (event.key === "Enter") autenticar(); });
}

function configurarAcessoMural(elemento, sessao) {
    if (!elemento || elemento.dataset.boundAccess) return;
    elemento.dataset.boundAccess = "true";
    elemento.addEventListener("click", event => {
        const atual = SafraPact.getSession();
        if (!atual) { event.preventDefault(); abrirLogin(); return; }
        if (atual.tipo !== "Empresa Prestadora") { event.preventDefault(); SafraPact.toast("O mural de oportunidades é destinado às empresas prestadoras.", "notice"); }
    });
}

function aplicarSessaoNaHome() {
    const sessao = SafraPact.getSession();
    const navLogin = document.getElementById("nav-login");
    const navCadastro = document.getElementById("nav-cadastro");
    const itemMural = document.getElementById("menu-item-mural");
    const linkMural = itemMural?.querySelector("a");
    const heroExplorar = document.getElementById("hero-explorar");
    const heroPublicar = document.getElementById("hero-publicar");
    const secaoVitrine = document.getElementById("secao-demandas-home");
    const avisoProdutor = document.getElementById("bloco-aviso-produtor-home");

    configurarAcessoMural(linkMural, sessao);
    configurarAcessoMural(heroExplorar, sessao);

    if (navLogin) {
        navLogin.textContent = sessao ? sessao.nome : "Login";
        if (!navLogin.dataset.boundProfile) {
            navLogin.dataset.boundProfile = "true";
            navLogin.addEventListener("click", () => SafraPact.getSession() ? (window.location.href = "perfil.html") : abrirLogin());
        }
    }
    if (navCadastro) navCadastro.style.display = sessao ? "none" : "";
    if (secaoVitrine) secaoVitrine.style.display = "";
    if (avisoProdutor) avisoProdutor.style.display = "none";

    if (!sessao) {
        if (itemMural) itemMural.style.display = "";
        if (heroExplorar) heroExplorar.style.display = "inline-flex";
        if (heroPublicar) {
            heroPublicar.style.display = "inline-flex";
            if (!heroPublicar.dataset.boundAnonymousPublish) {
                heroPublicar.dataset.boundAnonymousPublish = "true";
                heroPublicar.addEventListener("click", () => { if (!SafraPact.getSession()) abrirLogin(); });
            }
        }
        return;
    }

    if (sessao.tipo === "Empresa Prestadora") {
        if (itemMural) itemMural.style.display = "";
        if (heroExplorar) heroExplorar.style.display = "inline-flex";
        if (heroPublicar) heroPublicar.style.display = "none";
        SafraPact.initProviderNotifications();
        return;
    }

    if (itemMural) itemMural.style.display = "none";
    if (heroExplorar) heroExplorar.style.display = "none";
    if (heroPublicar) heroPublicar.style.display = "inline-flex";
    if (avisoProdutor) avisoProdutor.style.display = "block";
    SafraPact.initDemandModal();
}
