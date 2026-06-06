(() => {
    "use strict";

    const config = window.SAFRAPACT_CONFIG || {};
    const databaseURL = String(config.databaseURL || "").replace(/\/$/, "");
    const pollIntervalMs = Number(config.pollIntervalMs) || 5000;
    const googleMapsApiKey = String(config.googleMapsApiKey || "").trim();

    const KEYS = {
        session: "safrapact_session",
        theme: "safrapact_theme",
        localPublished: "safrapact_publicadas_local",
        notificationsRead: "safrapact_notificacoes_lidas",
        draftPrefix: "safrapact_rascunho_",
        pendingPrefix: "safrapact_pendentes_",
        deletedIds: "safrapact_exclusoes_local",
        cacheVersion: "safrapact_cache_version"
    };

    const BASE_DEMANDS = [
        { id: "1", titulo: "Operação Logística e Colheita Mecanizada de Soja", tipo: "Colheita", area: "1.200 ha", localizacao: "Sorriso, MT", cidade: "Sorriso", uf: "MT", cultura: "Soja", janela: "Fev/2027 a Mar/2027", inicio: "2027-02-01", fim: "2027-03-20", equipamentos: "Colheitadeiras, transbordos e apoio logístico", prioridade: "Planejamento normal", contato: "Contato disponibilizado após o envio da proposta", descricao: "Operação mecanizada de colheita e apoio logístico para grande área produtiva.", imagem: "https://images.unsplash.com/photo-1599839619722-39751411ea63?auto=format&fit=crop&q=80&w=900", status: "publicada", createdAt: 0, notificar: false },
        { id: "2", titulo: "Pulverização Automatizada de Precisão - Safra Verão", tipo: "Pulverização", area: "850 ha", localizacao: "Rio Verde, GO", cidade: "Rio Verde", uf: "GO", cultura: "Soja e milho", janela: "Dez/2026 a Jan/2027", inicio: "2026-12-05", fim: "2027-01-22", equipamentos: "Pulverizadores com controle de seção", prioridade: "Janela curta", contato: "Contato disponibilizado após o envio da proposta", descricao: "Aplicação planejada com pulverização de precisão e rastreabilidade operacional.", imagem: "https://images.unsplash.com/photo-1586771107445-d3af9e701c09?auto=format&fit=crop&q=80&w=900", status: "publicada", createdAt: 0, notificar: false },
        { id: "3", titulo: "Manejo e Plantio de Lavouras de Algodão", tipo: "Plantio", area: "2.000 ha", localizacao: "Luís Eduardo Magalhães, BA", cidade: "Luís Eduardo Magalhães", uf: "BA", cultura: "Algodão", janela: "Nov/2026 a Dez/2026", inicio: "2026-11-10", fim: "2026-12-18", equipamentos: "Plantadeiras e equipe operacional", prioridade: "Planejamento normal", contato: "Contato disponibilizado após o envio da proposta", descricao: "Plantio e manejo mecanizado de algodão com equipe especializada.", imagem: "https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?auto=format&fit=crop&q=80&w=900", status: "publicada", createdAt: 0, notificar: false }
    ];

    const USERS = [
        { email: "produtor@safra.com.br", senha: "123", tipo: "Produtor Rural", nome: "Fazenda Progresso" },
        { email: "empresa@agro.com.br", senha: "123", tipo: "Empresa Prestadora", nome: "Logística & Colheita Agro" }
    ];

    const channel = "BroadcastChannel" in window ? new BroadcastChannel("safrapact_eventos") : null;
    const state = { published: [], pollTimer: null, onDemandsChange: new Set(), initialUnreadToastShown: false };

    /*
     * Migração v8: remove caches dinâmicos antigos quando o Firebase está ativo.
     * Esses caches eram úteis como contingência, porém podiam fazer uma oferta já
     * excluída reaparecer no navegador de um prestador quando a leitura remota falhava.
     */
    function runStorageMigration() {
        if (localStorage.getItem(KEYS.cacheVersion) === "8") return;
        if (databaseURL) localStorage.removeItem(KEYS.localPublished);
        localStorage.setItem(KEYS.cacheVersion, "8");
    }
    runStorageMigration();

    function safeParse(value, fallback) { try { return value ? JSON.parse(value) : fallback; } catch (_) { return fallback; } }
    function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char])); }
    function formatDate(value) { if (!value) return "A confirmar"; const date = new Date(`${value}T12:00:00`); return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("pt-BR"); }
    function uniqueById(items) { const map = new Map(); items.forEach(item => item && item.id && map.set(String(item.id), item)); return [...map.values()].sort((a, b) => Number(b.createdAt || b.updatedAt || 0) - Number(a.createdAt || a.updatedAt || 0)); }
    function normalizeUrl(path) { return `${databaseURL}/${String(path || "").replace(/^\//, "")}.json`; }
    function ownerKey(email) { return btoa(unescape(encodeURIComponent(String(email || "anonimo")))).replace(/[=+/]/g, "_"); }

    async function request(path, options = {}) {
        if (!databaseURL) return null;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 7000);
        try {
            const response = await fetch(normalizeUrl(path), { ...options, signal: controller.signal, headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
            if (!response.ok) throw new Error(`Firebase respondeu ${response.status}`);
            return response.status === 204 ? null : await response.json();
        } finally { clearTimeout(timeout); }
    }

    function getSession() { return safeParse(localStorage.getItem(KEYS.session), null); }
    function saveSession(user) { const session = { email: user.email, tipo: user.tipo, nome: user.nome }; localStorage.setItem(KEYS.session, JSON.stringify(session)); return session; }
    function logout() { localStorage.removeItem(KEYS.session); }
    function authenticate(email, senha) { return USERS.find(user => user.email.toLowerCase() === String(email || "").trim().toLowerCase() && user.senha === String(senha || "")) || null; }

    function getLocalPublished() { return safeParse(localStorage.getItem(KEYS.localPublished), []); }
    function saveLocalPublished(items) { localStorage.setItem(KEYS.localPublished, JSON.stringify(uniqueById(items))); }
    function getLocalDeletedIds() { return new Set(safeParse(localStorage.getItem(KEYS.deletedIds), []).map(String)); }
    function saveLocalDeletedIds(ids) { localStorage.setItem(KEYS.deletedIds, JSON.stringify([...new Set([...ids].map(String))])); }
    function markLocalDeleted(id) { const ids = getLocalDeletedIds(); ids.add(String(id)); saveLocalDeletedIds(ids); }
    function unmarkLocalDeleted(id) { const ids = getLocalDeletedIds(); ids.delete(String(id)); saveLocalDeletedIds(ids); }
    function getDraftKey(email) { return `${KEYS.draftPrefix}${email || "anonimo"}`; }
    function getPendingKey(email) { return `${KEYS.pendingPrefix}${email || "anonimo"}`; }
    function getDraft(email) { return safeParse(localStorage.getItem(getDraftKey(email)), null); }
    function saveDraft(email, payload) { localStorage.setItem(getDraftKey(email), JSON.stringify(payload)); }
    function clearDraft(email) { localStorage.removeItem(getDraftKey(email)); }
    function getPending(email) { return safeParse(localStorage.getItem(getPendingKey(email)), []); }
    function savePendingList(email, items) { localStorage.setItem(getPendingKey(email), JSON.stringify(uniqueById(items))); }

    function notifyLocalEvent(type, payload) {
        window.dispatchEvent(new CustomEvent("safrapact:update", { detail: { type, payload } }));
        if (channel) channel.postMessage({ type, payload });
    }

    async function getPublishedDemands() {
        let dynamicDemands = databaseURL ? [] : getLocalPublished();
        const deletedIds = getLocalDeletedIds();
        let demandsRemoteLoaded = false;

        if (databaseURL) {
            const [demandsResult, deletedResult] = await Promise.allSettled([request("demandas"), request("exclusoes")]);

            if (deletedResult.status === "fulfilled" && deletedResult.value) {
                Object.keys(deletedResult.value).forEach(id => deletedIds.add(String(id)));
                saveLocalDeletedIds(deletedIds);
            }

            if (demandsResult.status === "fulfilled") {
                dynamicDemands = demandsResult.value ? Object.values(demandsResult.value) : [];
                demandsRemoteLoaded = true;
            } else {
                /*
                 * Em modo sincronizado não exibimos cache remoto antigo quando o
                 * Firebase fica indisponível. Isso evita propostas fantasma, como
                 * uma oferta de Sinop já apagada continuar visível ao prestador.
                 */
                dynamicDemands = [];
                console.warn("SafraPact: leitura remota indisponível; ocultando ofertas dinâmicas em cache para evitar dados excluídos.", demandsResult.reason);
            }
        }

        state.published = uniqueById([...BASE_DEMANDS, ...dynamicDemands].filter(item => item.status === "publicada" && !deletedIds.has(String(item.id))));

        if (demandsRemoteLoaded || !databaseURL) {
            saveLocalPublished(dynamicDemands.filter(item => !deletedIds.has(String(item.id)) && !BASE_DEMANDS.some(base => base.id === item.id)));
        }

        return state.published;
    }

    async function publishDemand(payload) {
        const session = getSession();
        const now = Date.now();
        const demand = {
            ...payload,
            id: payload.id || `oferta_${now}_${Math.random().toString(36).slice(2, 7)}`,
            status: "publicada",
            createdAt: payload.createdAt || now,
            updatedAt: now,
            notificar: payload.notificar !== false,
            ownerEmail: payload.ownerEmail || session?.email || "",
            ownerName: payload.ownerName || session?.nome || "Produtor Rural",
            imagem: payload.imagem || "img/servico-agro-placeholder.svg",
            localizacao: payload.localizacao || [payload.cidade, payload.uf].filter(Boolean).join(", "),
            janela: payload.janela || `${formatDate(payload.inicio)} a ${formatDate(payload.fim)}`
        };
        unmarkLocalDeleted(demand.id);
        saveLocalPublished([...getLocalPublished().filter(item => item.id !== demand.id), demand]);
        if (databaseURL) {
            await request(`demandas/${demand.id}`, { method: "PUT", body: JSON.stringify(demand) });
            /* Se a mesma oferta estiver sendo republicada após uma exclusão, remove o bloqueio remoto. */
            try { await request(`exclusoes/${demand.id}`, { method: "DELETE" }); } catch (_) { /* não impede a publicação */ }
        }
        notifyLocalEvent("demand-published", demand);
        return demand;
    }

    async function deletePublishedDemand(id) {
        const normalizedId = String(id);
        const deletion = { deletedAt: Date.now(), id: normalizedId, ownerEmail: getSession()?.email || "" };

        /* A interface local some imediatamente e o ID fica bloqueado no cache. */
        markLocalDeleted(normalizedId);
        saveLocalPublished(getLocalPublished().filter(item => String(item.id) !== normalizedId));
        state.published = state.published.filter(item => String(item.id) !== normalizedId);
        notifyLocalEvent("demand-deleted", { id: normalizedId });
        state.onDemandsChange.forEach(callback => callback(state.published));

        if (!databaseURL) return;

        /*
         * Gravamos também uma lápide (tombstone) em /exclusoes. Assim navegadores
         * que ainda possuem cache antigo conseguem reconhecer a remoção, mesmo se
         * uma versão anterior do site tiver deixado uma cópia local da proposta.
         */
        const results = await Promise.allSettled([
            request(`demandas/${normalizedId}`, { method: "DELETE" }),
            request(`exclusoes/${normalizedId}`, { method: "PUT", body: JSON.stringify(deletion) })
        ]);
        if (results.every(result => result.status === "rejected")) throw new Error("Não foi possível sincronizar a exclusão no Firebase.");
    }

    async function savePendingDemand(email, payload) {
        const now = Date.now();
        const item = { ...payload, id: payload.id || `pendente_${now}_${Math.random().toString(36).slice(2, 6)}`, status: "pendente", ownerEmail: email, updatedAt: now };
        savePendingList(email, [...getPending(email).filter(existing => existing.id !== item.id), item]);
        clearDraft(email);
        if (databaseURL) await request(`pendentes/${ownerKey(email)}/${item.id}`, { method: "PUT", body: JSON.stringify(item) });
        notifyLocalEvent("pending-saved", item);
        return item;
    }

    async function loadPending(email) {
        let remote = [];
        if (databaseURL) {
            try { const data = await request(`pendentes/${ownerKey(email)}`); remote = data ? Object.values(data) : []; }
            catch (error) { console.warn("SafraPact: não foi possível carregar pendências remotas.", error); }
        }
        const merged = uniqueById([...getPending(email), ...remote].filter(item => item.status === "pendente"));
        savePendingList(email, merged);
        return merged;
    }

    async function removePendingDemand(email, id) {
        savePendingList(email, getPending(email).filter(item => item.id !== id));
        if (databaseURL) await request(`pendentes/${ownerKey(email)}/${id}`, { method: "DELETE" });
        notifyLocalEvent("pending-deleted", { id });
    }

    function getReadNotificationIds() { return new Set(safeParse(localStorage.getItem(KEYS.notificationsRead), [])); }
    function markNotificationsRead(ids) { const read = getReadNotificationIds(); ids.forEach(id => read.add(String(id))); localStorage.setItem(KEYS.notificationsRead, JSON.stringify([...read])); }
    function getUnreadDemands(items) { const read = getReadNotificationIds(); return items.filter(item => item.notificar !== false && !read.has(String(item.id))); }

    function toast(message, type = "success") {
        let stack = document.getElementById("safrapact-toast-stack");
        if (!stack) { stack = document.createElement("div"); stack.id = "safrapact-toast-stack"; stack.className = "toast-stack"; document.body.appendChild(stack); }
        const item = document.createElement("div"); item.className = `safrapact-toast ${type}`;
        item.innerHTML = `<i class="fas ${type === "notice" ? "fa-bell" : type === "error" ? "fa-circle-exclamation" : "fa-circle-check"}"></i><span>${escapeHtml(message)}</span>`;
        stack.appendChild(item); setTimeout(() => item.classList.add("show"), 20); setTimeout(() => { item.classList.remove("show"); setTimeout(() => item.remove(), 300); }, 4300);
    }

    function initTheme() {
        const toggle = document.getElementById("theme-toggle"); const logo = document.getElementById("main-logo"); const saved = localStorage.getItem(KEYS.theme) || "dark";
        applyTheme(saved, toggle, logo);
        if (toggle && !toggle.dataset.boundTheme) { toggle.dataset.boundTheme = "true"; toggle.addEventListener("click", () => { const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark"; localStorage.setItem(KEYS.theme, next); applyTheme(next, toggle, logo); }); }
    }
    function applyTheme(theme, toggle, logo) { document.documentElement.setAttribute("data-theme", theme); if (toggle) { const icon = toggle.querySelector("i"); if (icon) icon.className = theme === "dark" ? "fas fa-sun" : "fas fa-moon"; toggle.setAttribute("aria-label", theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"); } if (logo) logo.src = theme === "dark" ? "img/logo.png" : "img/logo-fundo-branco.png"; }

    function initMobileMenu() {
        const button = document.getElementById("mobile-menu"); const nav = document.getElementById("nav-list");
        if (!button || !nav || button.dataset.boundMenu) return;
        button.dataset.boundMenu = "true";
        button.addEventListener("click", () => { nav.classList.toggle("active"); button.setAttribute("aria-expanded", nav.classList.contains("active") ? "true" : "false"); const icon = button.querySelector("i"); if (icon) icon.className = nav.classList.contains("active") ? "fas fa-times" : "fas fa-bars"; });
        nav.querySelectorAll("a,button").forEach(item => item.addEventListener("click", () => { if (window.innerWidth <= 768 && item.id !== "notification-bell") nav.classList.remove("active"); }));
    }

    function ensureFloatingActions() {
        let container = document.getElementById("floating-actions");
        if (!container) { container = document.createElement("div"); container.id = "floating-actions"; container.className = "floating-actions"; document.body.appendChild(container); }
        let theme = document.getElementById("theme-toggle");
        if (!theme) { theme = document.createElement("button"); theme.id = "theme-toggle"; theme.innerHTML = '<i class="fas fa-sun"></i>'; }
        theme.className = "floating-action floating-theme"; theme.title = "Alternar tema";
        if (!container.contains(theme)) container.appendChild(theme);
        if (!document.getElementById("contact-floating")) { const contact = document.createElement("button"); contact.id = "contact-floating"; contact.className = "floating-action floating-contact"; contact.title = "Fale conosco"; contact.innerHTML = '<i class="fas fa-comments"></i><span>Fale conosco</span>'; contact.addEventListener("click", openContactModal); container.appendChild(contact); }
        initTheme();
    }

    function openContactModal() {
        let modal = document.getElementById("modalContatoOverlay");
        if (!modal) {
            modal = document.createElement("div"); modal.id = "modalContatoOverlay"; modal.className = "modal-overlay";
            modal.innerHTML = `<div class="modal-card"><button class="close-btn" type="button" data-close-contact><i class="fas fa-times"></i></button><div class="modal-head"><p class="modal-kicker"><i class="fas fa-headset"></i> Atendimento</p><h2>Fale conosco</h2><p class="modal-subtitle">Envie sua dúvida ou solicitação. Este formulário demonstra o canal de atendimento da plataforma.</p></div><form id="contact-form" class="demand-form"><div class="input-group"><label>Nome</label><input class="premium-input" required></div><div class="input-group"><label>E-mail ou telefone</label><input class="premium-input" required></div><div class="input-group"><label>Mensagem</label><textarea class="premium-input premium-textarea" required></textarea></div><button class="btn-primary btn-block" type="submit"><i class="fas fa-paper-plane"></i> Enviar mensagem</button></form></div>`;
            document.body.appendChild(modal); modal.querySelector("[data-close-contact]").addEventListener("click", () => modal.style.display = "none"); modal.addEventListener("click", event => { if (event.target === modal) modal.style.display = "none"; }); modal.querySelector("form").addEventListener("submit", event => { event.preventDefault(); modal.style.display = "none"; toast("Mensagem registrada para atendimento. Demonstração concluída."); event.target.reset(); });
        }
        modal.style.display = "flex";
    }

    function applyHeaderSession() {
        const session = getSession(); const login = document.getElementById("nav-login"); const register = document.getElementById("nav-cadastro"); const mural = document.getElementById("menu-item-mural"); const headerButtons = document.querySelector(".header-buttons");
        if (!headerButtons) return;
        if (session) {
            if (login) { login.textContent = session.nome; login.onclick = () => { window.location.href = "perfil.html"; }; }
            if (register) register.style.display = "none";
            if (!document.getElementById("header-sair")) { const logoutButton = document.createElement("button"); logoutButton.id = "header-sair"; logoutButton.className = "btn-secondary btn-nav header-logout"; logoutButton.innerHTML = '<i class="fas fa-right-from-bracket"></i> Sair'; logoutButton.addEventListener("click", () => { logout(); window.location.href = "index.html"; }); headerButtons.appendChild(logoutButton); }
            if (session.tipo === "Produtor Rural") { if (mural) mural.style.display = "none"; addProducerNewDemandButton(); }
            if (session.tipo === "Empresa Prestadora") initProviderNotifications();
        } else {
            if (login) login.textContent = "Login";
            if (register) register.style.display = "inline-flex";
        }
    }

    function createBell() {
        const headerButtons = document.querySelector(".header-buttons"); if (!headerButtons || document.getElementById("notification-bell")) return;
        const wrapper = document.createElement("div"); wrapper.className = "notification-wrapper";
        wrapper.innerHTML = `<button id="notification-bell" class="notification-bell" aria-label="Notificações"><i class="fas fa-bell"></i><span id="notification-count" class="notification-count">0</span></button><div id="notification-panel" class="notification-panel"><div class="notification-panel-head"><strong>Novas ofertas</strong><button id="mark-notifications-read" type="button">Marcar como vistas</button></div><div id="notification-list" class="notification-list"></div><div class="sync-mode-note">${databaseURL ? '<i class="fas fa-cloud"></i> Sincronização entre aparelhos ativa' : '<i class="fas fa-mobile-screen"></i> Modo local'}</div></div>`;
        headerButtons.insertBefore(wrapper, headerButtons.firstChild); wrapper.querySelector("#notification-bell").addEventListener("click", event => { event.stopPropagation(); wrapper.querySelector("#notification-panel").classList.toggle("open"); }); wrapper.querySelector("#mark-notifications-read").addEventListener("click", () => { markNotificationsRead(getUnreadDemands(state.published).map(item => item.id)); renderNotifications(); }); document.addEventListener("click", event => { if (!wrapper.contains(event.target)) wrapper.querySelector("#notification-panel").classList.remove("open"); });
    }
    function renderNotifications() { const count = document.getElementById("notification-count"); const list = document.getElementById("notification-list"); if (!count || !list) return; const unread = getUnreadDemands(state.published); count.textContent = unread.length; count.style.display = unread.length ? "inline-flex" : "none"; list.innerHTML = unread.length ? unread.slice(0, 8).map(item => `<a href="propostas.html?oferta=${encodeURIComponent(item.id)}" class="notification-item"><i class="fas fa-seedling"></i><span><strong>${escapeHtml(item.tipo)}</strong><small>${escapeHtml(item.localizacao)} · ${escapeHtml(item.area)}</small></span></a>`).join("") : '<div class="notification-empty">Nenhuma nova oferta disponível.</div>'; }
    async function refreshNotifications(showToast = false) { const before = new Set(state.published.map(item => String(item.id))); const items = await getPublishedDemands(); renderNotifications(); if (showToast) { const fresh = items.filter(item => item.notificar !== false && !before.has(String(item.id))); if (fresh.length) toast(`${fresh.length} nova${fresh.length > 1 ? "s" : ""} oferta${fresh.length > 1 ? "s" : ""} disponível${fresh.length > 1 ? "is" : ""}.`, "notice"); } state.onDemandsChange.forEach(callback => callback(items)); return items; }
    async function initProviderNotifications() { const session = getSession(); if (!session || session.tipo !== "Empresa Prestadora") return; createBell(); await refreshNotifications(false); const unread = getUnreadDemands(state.published); if (unread.length && !state.initialUnreadToastShown) { state.initialUnreadToastShown = true; toast(`${unread.length} nova${unread.length > 1 ? "s" : ""} oferta${unread.length > 1 ? "s" : ""} aguardando análise.`, "notice"); } if (!state.pollTimer) state.pollTimer = setInterval(() => refreshNotifications(true), pollIntervalMs); }

    function addProducerNewDemandButton() { const session = getSession(); const headerButtons = document.querySelector(".header-buttons"); if (!session || session.tipo !== "Produtor Rural" || !headerButtons || document.getElementById("header-nova-demanda")) return; const button = document.createElement("button"); button.id = "header-nova-demanda"; button.className = "btn-primary btn-nav"; button.innerHTML = '<i class="fas fa-plus"></i> Nova Demanda'; headerButtons.insertBefore(button, headerButtons.firstChild); }

    function mapPreviewUrl(lat, lng) { if (!lat || !lng) return ""; const q = encodeURIComponent(`${lat},${lng}`); return googleMapsApiKey ? `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(googleMapsApiKey)}&q=${q}` : `https://maps.google.com/maps?q=${q}&z=14&output=embed`; }
    function mapsOpenUrl(lat, lng, address = "") { const query = lat && lng ? `${lat},${lng}` : address; return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query || "Brasil")}`; }

    function demandModalMarkup() {
        const ufs = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];
        return `<div class="modal-overlay" id="modalNovaDemandaOverlay"><div class="modal-card modal-card-large"><button class="close-btn" id="close-nova-demanda" type="button"><i class="fas fa-times"></i></button><div class="modal-head"><p class="modal-kicker"><i class="fas fa-clipboard-list"></i> Cadastro operacional</p><h2 id="demand-modal-title">Nova demanda rural</h2><p class="modal-subtitle">Preencha os dados do serviço. Um rascunho é salvo automaticamente neste navegador.</p></div><form id="form-nova-demanda" class="demand-form"><input type="hidden" id="demanda-id"><input type="hidden" id="demanda-created-at"><input type="hidden" id="demanda-imagem-data"><div class="form-grid two-columns"><div class="input-group span-2"><label>Título da oportunidade *</label><input class="premium-input" id="demanda-titulo" required placeholder="Ex.: Colheita mecanizada de milho safrinha"></div><div class="input-group"><label>Tipo de serviço *</label><select class="premium-input" id="demanda-tipo" required><option value="">Selecione</option><option>Colheita</option><option>Plantio</option><option>Pulverização</option><option>Preparo do solo</option><option>Transporte e logística</option><option>Aplicação de fertilizantes</option><option>Locação de maquinário</option><option>Outro serviço</option></select></div><div class="input-group"><label>Cultura principal</label><input class="premium-input" id="demanda-cultura" placeholder="Soja, milho, algodão..."></div><div class="input-group"><label>Município *</label><input class="premium-input" id="demanda-cidade" required placeholder="Ex.: Sinop"></div><div class="input-group"><label>Estado *</label><select class="premium-input" id="demanda-uf" required>${ufs.map(uf => `<option value="${uf}"${uf === "MT" ? " selected" : ""}>${uf}</option>`).join("")}</select></div><div class="input-group"><label>Área estimada *</label><input class="premium-input" id="demanda-area" required placeholder="Ex.: 1.500 ha"></div><div class="input-group"><label>Estrutura desejada</label><input class="premium-input" id="demanda-equipamentos" placeholder="Ex.: 3 colheitadeiras e 2 transbordos"></div><div class="input-group"><label>Início da janela *</label><input type="date" class="premium-input" id="demanda-inicio" required></div><div class="input-group"><label>Fim da janela *</label><input type="date" class="premium-input" id="demanda-fim" required></div><div class="input-group"><label>Prioridade</label><select class="premium-input" id="demanda-prioridade"><option>Planejamento normal</option><option>Janela curta</option><option>Atendimento urgente</option></select></div><div class="input-group"><label>Contato operacional</label><input class="premium-input" id="demanda-contato" placeholder="Telefone ou responsável"></div><div class="input-group span-2"><label>Imagem da demanda</label><input type="file" class="premium-input" id="demanda-imagem-arquivo" accept="image/*"><small class="input-help">A imagem é reduzida automaticamente para facilitar a sincronização entre aparelhos.</small><div id="demanda-imagem-preview" class="image-preview"></div></div><div class="input-group"><label>Latitude da propriedade</label><input class="premium-input" id="demanda-latitude" inputmode="decimal" placeholder="Ex.: -11.8608"></div><div class="input-group"><label>Longitude da propriedade</label><input class="premium-input" id="demanda-longitude" inputmode="decimal" placeholder="Ex.: -55.5096"></div><div class="span-2 location-tools"><button type="button" class="btn-secondary btn-mini" id="usar-localizacao"><i class="fas fa-location-crosshairs"></i> Usar minha localização atual</button><a class="btn-link map-open-link" id="abrir-maps-form" target="_blank" rel="noopener"><i class="fas fa-map-location-dot"></i> Abrir no Google Maps</a></div><div class="span-2" id="demanda-map-preview"></div><div class="input-group span-2"><label>Detalhes adicionais</label><textarea class="premium-input premium-textarea" id="demanda-descricao" placeholder="Informe condições de acesso, talhões, exigências técnicas e observações importantes."></textarea></div></div><div class="draft-status"><i class="fas fa-floppy-disk"></i><span id="draft-status-text">Rascunho automático pronto.</span></div><div class="demand-form-actions"><button type="button" class="btn-secondary" id="salvar-pendente"><i class="fas fa-clock"></i> Salvar como pendente</button><button type="submit" class="btn-primary"><i class="fas fa-paper-plane"></i> Publicar para prestadores</button></div></form></div></div>`;
    }

    function value(id) { return document.getElementById(id)?.value?.trim() || ""; }
    function formDataFromModal() { const cidade = value("demanda-cidade"); const uf = value("demanda-uf"); return { id: value("demanda-id") || undefined, createdAt: Number(value("demanda-created-at")) || undefined, titulo: value("demanda-titulo"), tipo: value("demanda-tipo"), cultura: value("demanda-cultura"), cidade, uf, localizacao: [cidade, uf].filter(Boolean).join(", "), area: value("demanda-area"), equipamentos: value("demanda-equipamentos"), inicio: value("demanda-inicio"), fim: value("demanda-fim"), janela: `${formatDate(value("demanda-inicio"))} a ${formatDate(value("demanda-fim"))}`, prioridade: value("demanda-prioridade"), contato: value("demanda-contato"), latitude: value("demanda-latitude"), longitude: value("demanda-longitude"), descricao: value("demanda-descricao"), imagem: value("demanda-imagem-data") || undefined }; }
    function fillDemandForm(data = {}) { const pairs = { "demanda-id": data.id, "demanda-created-at": data.createdAt, "demanda-titulo": data.titulo, "demanda-tipo": data.tipo, "demanda-cultura": data.cultura, "demanda-cidade": data.cidade, "demanda-uf": data.uf || "MT", "demanda-area": data.area, "demanda-equipamentos": data.equipamentos, "demanda-inicio": data.inicio, "demanda-fim": data.fim, "demanda-prioridade": data.prioridade || "Planejamento normal", "demanda-contato": data.contato, "demanda-latitude": data.latitude, "demanda-longitude": data.longitude, "demanda-descricao": data.descricao, "demanda-imagem-data": data.imagem }; Object.entries(pairs).forEach(([id, val]) => { const field = document.getElementById(id); if (field) field.value = val || ""; }); updateImagePreview(); updateMapPreview(); document.getElementById("demand-modal-title").textContent = data.id ? "Editar demanda rural" : "Nova demanda rural"; }
    function isDemandValid(data) { return data.titulo && data.tipo && data.cidade && data.uf && data.area && data.inicio && data.fim; }
    function updateImagePreview() { const preview = document.getElementById("demanda-imagem-preview"); const image = value("demanda-imagem-data"); if (preview) preview.innerHTML = image ? `<img src="${image}" alt="Prévia da imagem da demanda">` : '<span><i class="fas fa-image"></i> Nenhuma imagem selecionada</span>'; }
    function updateMapPreview() { const lat = value("demanda-latitude"); const lng = value("demanda-longitude"); const preview = document.getElementById("demanda-map-preview"); const link = document.getElementById("abrir-maps-form"); if (link) link.href = mapsOpenUrl(lat, lng, [value("demanda-cidade"), value("demanda-uf")].filter(Boolean).join(", ")); if (!preview) return; const src = mapPreviewUrl(lat, lng); preview.innerHTML = src ? `<iframe class="property-map" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="${src}" title="Localização aproximada da propriedade"></iframe>` : '<div class="map-placeholder"><i class="fas fa-map-location-dot"></i> Informe as coordenadas ou use a localização atual para visualizar o mapa da propriedade.</div>'; }
    function compressImage(file) { return new Promise((resolve, reject) => { if (!file) return resolve(""); if (!file.type.startsWith("image/")) return reject(new Error("Selecione uma imagem válida.")); const reader = new FileReader(); reader.onload = () => { const img = new Image(); img.onload = () => { const maxW = 1000, maxH = 700; const scale = Math.min(1, maxW / img.width, maxH / img.height); const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(img.width * scale)); canvas.height = Math.max(1, Math.round(img.height * scale)); canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height); resolve(canvas.toDataURL("image/jpeg", .76)); }; img.onerror = () => reject(new Error("Não foi possível processar a imagem.")); img.src = reader.result; }; reader.onerror = () => reject(new Error("Não foi possível ler a imagem.")); reader.readAsDataURL(file); }); }

    function initDemandModal() {
        const session = getSession(); if (!session || session.tipo !== "Produtor Rural") return;
        if (!document.getElementById("modalNovaDemandaOverlay")) document.body.insertAdjacentHTML("beforeend", demandModalMarkup());
        const modal = document.getElementById("modalNovaDemandaOverlay"); const form = document.getElementById("form-nova-demanda"); const email = session.email;
        const open = data => { fillDemandForm(data || getDraft(email) || {}); modal.style.display = "flex"; };
        document.querySelectorAll("#header-nova-demanda, #hero-publicar, #perfil-publicar-demanda").forEach(button => { if (button && !button.dataset.boundDemand) { button.dataset.boundDemand = "true"; button.addEventListener("click", () => open()); } });
        if (modal.dataset.boundDemand) return; modal.dataset.boundDemand = "true";
        modal.querySelector("#close-nova-demanda").addEventListener("click", () => modal.style.display = "none"); modal.addEventListener("click", event => { if (event.target === modal) modal.style.display = "none"; });
        form.addEventListener("input", () => { saveDraft(email, formDataFromModal()); document.getElementById("draft-status-text").textContent = "Rascunho salvo automaticamente neste navegador."; updateMapPreview(); });
        document.getElementById("demanda-imagem-arquivo").addEventListener("change", async event => { try { const data = await compressImage(event.target.files[0]); document.getElementById("demanda-imagem-data").value = data; saveDraft(email, formDataFromModal()); updateImagePreview(); toast("Imagem adicionada à demanda."); } catch (error) { toast(error.message, "error"); } });
        document.getElementById("usar-localizacao").addEventListener("click", () => { if (!navigator.geolocation) return toast("Geolocalização não disponível neste dispositivo.", "error"); navigator.geolocation.getCurrentPosition(position => { document.getElementById("demanda-latitude").value = position.coords.latitude.toFixed(6); document.getElementById("demanda-longitude").value = position.coords.longitude.toFixed(6); saveDraft(email, formDataFromModal()); updateMapPreview(); toast("Coordenadas preenchidas com a localização atual."); }, () => toast("Não foi possível obter sua localização. Verifique a permissão do navegador.", "error"), { enableHighAccuracy: true, timeout: 8000 }); });
        document.getElementById("salvar-pendente").addEventListener("click", async () => { try { const item = await savePendingDemand(email, formDataFromModal()); modal.style.display = "none"; form.reset(); fillDemandForm({}); window.dispatchEvent(new CustomEvent("safrapact:pending-change", { detail: item })); toast("Demanda salva como pendente."); } catch (error) { toast("Não foi possível salvar a pendência no Firebase. Verifique as regras do banco.", "error"); } });
        form.addEventListener("submit", async event => { event.preventDefault(); const data = formDataFromModal(); if (!isDemandValid(data)) return toast("Preencha os campos obrigatórios antes de publicar.", "error"); try { const item = await publishDemand(data); clearDraft(email); modal.style.display = "none"; form.reset(); fillDemandForm({}); window.dispatchEvent(new CustomEvent("safrapact:published-change", { detail: item })); toast(data.id ? "Demanda atualizada com sucesso." : "Demanda publicada para os prestadores."); } catch (error) { toast("Não foi possível publicar no Firebase. Confira a conexão e as regras do banco.", "error"); } });
        window.addEventListener("safrapact:edit-pending", event => open(event.detail)); window.addEventListener("safrapact:edit-published", event => open(event.detail));
    }

    function demandDetailsMarkup(item) { const lat = item.latitude; const lng = item.longitude; const map = mapPreviewUrl(lat, lng); return `<div class="demand-detail-grid">${item.imagem ? `<img class="detail-cover" src="${escapeHtml(item.imagem)}" alt="${escapeHtml(item.tipo || "Demanda rural")}" onerror="this.src='img/servico-agro-placeholder.svg'">` : ""}<div class="detail-info-block"><small>Tipo de serviço</small><strong>${escapeHtml(item.tipo || "A confirmar")}</strong></div><div class="detail-info-block"><small>Cultura principal</small><strong>${escapeHtml(item.cultura || "A confirmar")}</strong></div><div class="detail-info-block"><small>Tamanho da área</small><strong>${escapeHtml(item.area || "A confirmar")}</strong></div><div class="detail-info-block"><small>Janela de trabalho</small><strong>${escapeHtml(item.janela || `${formatDate(item.inicio)} a ${formatDate(item.fim)}`)}</strong></div><div class="detail-info-block"><small>Estrutura desejada</small><strong>${escapeHtml(item.equipamentos || "A definir com o prestador")}</strong></div><div class="detail-info-block"><small>Prioridade</small><strong>${escapeHtml(item.prioridade || "Planejamento normal")}</strong></div><div class="detail-info-block span-2"><small>Contato operacional</small><strong>${escapeHtml(item.contato || "Disponibilizado após o envio da proposta")}</strong></div><div class="detail-description span-2"><small>Detalhes adicionais</small><p>${escapeHtml(item.descricao || "Sem observações adicionais.")}</p></div>${map ? `<div class="span-2"><iframe class="property-map" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="${map}" title="Localização aproximada da propriedade"></iframe><a class="map-detail-link" href="${mapsOpenUrl(lat, lng, item.localizacao)}" target="_blank" rel="noopener"><i class="fas fa-arrow-up-right-from-square"></i> Abrir localização no Google Maps</a></div>` : `<div class="map-placeholder span-2"><i class="fas fa-map-location-dot"></i> Coordenadas da propriedade ainda não informadas.</div>`}</div>`; }

    function initCommon() { ensureFloatingActions(); initTheme(); initMobileMenu(); applyHeaderSession(); initDemandModal(); }
    function onDemandsChange(callback) { state.onDemandsChange.add(callback); return () => state.onDemandsChange.delete(callback); }
    if (channel) channel.addEventListener("message", () => { getPublishedDemands().then(items => state.onDemandsChange.forEach(callback => callback(items))); });

    window.SafraPact = { BASE_DEMANDS, USERS, authenticate, getSession, saveSession, logout, getPublishedDemands, publishDemand, deletePublishedDemand, getDraft, saveDraft, clearDraft, getPending, loadPending, savePendingDemand, removePendingDemand, getUnreadDemands, markNotificationsRead, toast, escapeHtml, formatDate, initTheme, initMobileMenu, initCommon, initDemandModal, initProviderNotifications, refreshNotifications, onDemandsChange, demandDetailsMarkup, mapsOpenUrl, mapPreviewUrl, isRemoteSyncEnabled: () => Boolean(databaseURL), hasGoogleMapsKey: () => Boolean(googleMapsApiKey) };
})();
