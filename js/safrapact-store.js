(() => {
    "use strict";

    const config = window.SAFRAPACT_CONFIG || {};
    const databaseURL = String(config.databaseURL || "").replace(/\/$/, "");
    const pollIntervalMs = Number(config.pollIntervalMs) || 5000;

    const KEYS = {
        session: "safrapact_session",
        theme: "safrapact_theme",
        localPublished: "safrapact_publicadas_local",
        notificationsRead: "safrapact_notificacoes_lidas",
        draftPrefix: "safrapact_rascunho_",
        pendingPrefix: "safrapact_pendentes_"
    };

    const BASE_DEMANDS = [
        { id: "1", titulo: "Operação Logística e Colheita Mecanizada de Soja", tipo: "Colheita", area: "1.200 ha", localizacao: "Sorriso, MT", cidade: "Sorriso", uf: "MT", cultura: "Soja", janela: "Fev/2027 a Mar/2027", descricao: "Operação mecanizada de colheita e apoio logístico para grande área produtiva.", imagem: "https://images.unsplash.com/photo-1599839619722-39751411ea63?auto=format&fit=crop&q=80&w=600", status: "publicada", createdAt: 0, notificar: false },
        { id: "2", titulo: "Pulverização Automatizada de Precisão - Safra Verão", tipo: "Pulverização", area: "850 ha", localizacao: "Rio Verde, GO", cidade: "Rio Verde", uf: "GO", cultura: "Soja e milho", janela: "Dez/2026 a Jan/2027", descricao: "Aplicação planejada com pulverização de precisão e rastreabilidade operacional.", imagem: "https://images.unsplash.com/photo-1586771107445-d3af9e701c09?auto=format&fit=crop&q=80&w=600", status: "publicada", createdAt: 0, notificar: false },
        { id: "3", titulo: "Manejo e Plantio de Lavouras de Algodão", tipo: "Plantio", area: "2.000 ha", localizacao: "Luís Eduardo Magalhães, BA", cidade: "Luís Eduardo Magalhães", uf: "BA", cultura: "Algodão", janela: "Nov/2026 a Dez/2026", descricao: "Plantio e manejo mecanizado de algodão com equipe especializada.", imagem: "https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?auto=format&fit=crop&q=80&w=600", status: "publicada", createdAt: 0, notificar: false }
    ];

    const channel = "BroadcastChannel" in window ? new BroadcastChannel("safrapact_eventos") : null;
    const state = { published: [], pollTimer: null, lastNotificationIds: new Set(), onDemandsChange: new Set() };

    function safeParse(value, fallback) {
        try { return value ? JSON.parse(value) : fallback; }
        catch (_) { return fallback; }
    }

    function normalizeUrl(path) {
        return `${databaseURL}/${path.replace(/^\//, "")}.json`;
    }

    async function request(path, options = {}) {
        if (!databaseURL) return null;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4500);
        try {
            const response = await fetch(normalizeUrl(path), {
                ...options,
                signal: controller.signal,
                headers: { "Content-Type": "application/json", ...(options.headers || {}) }
            });
            if (!response.ok) throw new Error(`Firebase respondeu ${response.status}`);
            return response.status === 204 ? null : await response.json();
        } finally {
            clearTimeout(timeout);
        }
    }

    function uniqueById(items) {
        const map = new Map();
        items.forEach(item => item && item.id && map.set(String(item.id), item));
        return [...map.values()].sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    }

    function getLocalPublished() {
        return safeParse(localStorage.getItem(KEYS.localPublished), []);
    }

    function saveLocalPublished(items) {
        localStorage.setItem(KEYS.localPublished, JSON.stringify(uniqueById(items)));
    }

    function getSession() {
        return safeParse(localStorage.getItem(KEYS.session), null);
    }

    function saveSession(user) {
        const session = { email: user.email, tipo: user.tipo, nome: user.nome };
        localStorage.setItem(KEYS.session, JSON.stringify(session));
        return session;
    }

    function logout() {
        localStorage.removeItem(KEYS.session);
    }

    function getDraftKey(email) { return `${KEYS.draftPrefix}${email || "anonimo"}`; }
    function getPendingKey(email) { return `${KEYS.pendingPrefix}${email || "anonimo"}`; }

    function getDraft(email) { return safeParse(localStorage.getItem(getDraftKey(email)), null); }
    function saveDraft(email, payload) { localStorage.setItem(getDraftKey(email), JSON.stringify(payload)); }
    function clearDraft(email) { localStorage.removeItem(getDraftKey(email)); }
    function getPending(email) { return safeParse(localStorage.getItem(getPendingKey(email)), []); }
    function savePendingList(email, items) { localStorage.setItem(getPendingKey(email), JSON.stringify(items)); }

    function notifyLocalEvent(type, payload) {
        window.dispatchEvent(new CustomEvent("safrapact:update", { detail: { type, payload } }));
        if (channel) channel.postMessage({ type, payload });
    }

    async function getPublishedDemands() {
        let remote = [];
        if (databaseURL) {
            try {
                const data = await request("demandas");
                remote = data ? Object.values(data) : [];
            } catch (error) {
                console.warn("SafraPact: sincronização remota indisponível; usando cache local.", error);
            }
        }
        const local = getLocalPublished();
        state.published = uniqueById([...BASE_DEMANDS, ...local, ...remote].filter(item => item.status === "publicada"));
        return state.published;
    }

    async function publishDemand(payload) {
        const demand = {
            ...payload,
            id: payload.id || `oferta_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            status: "publicada",
            createdAt: payload.createdAt || Date.now(),
            notificar: true,
            imagem: payload.imagem || "img/servico-agro-placeholder.svg"
        };
        const local = uniqueById([...getLocalPublished(), demand]);
        saveLocalPublished(local);
        if (databaseURL) {
            try {
                await request(`demandas/${demand.id}`, { method: "PUT", body: JSON.stringify(demand) });
            } catch (error) {
                console.warn("SafraPact: a publicação ficou salva neste dispositivo, mas não foi sincronizada.", error);
            }
        }
        notifyLocalEvent("demand-published", demand);
        return demand;
    }

    function savePendingDemand(email, payload) {
        const item = { ...payload, id: payload.id || `pendente_${Date.now()}`, status: "pendente", updatedAt: Date.now() };
        const list = getPending(email);
        const index = list.findIndex(existing => existing.id === item.id);
        if (index >= 0) list[index] = item; else list.unshift(item);
        savePendingList(email, list);
        clearDraft(email);
        notifyLocalEvent("pending-saved", item);
        return item;
    }

    function removePendingDemand(email, id) {
        savePendingList(email, getPending(email).filter(item => item.id !== id));
    }

    function getReadNotificationIds() {
        return new Set(safeParse(localStorage.getItem(KEYS.notificationsRead), []));
    }

    function markNotificationsRead(ids) {
        const read = getReadNotificationIds();
        ids.forEach(id => read.add(String(id)));
        localStorage.setItem(KEYS.notificationsRead, JSON.stringify([...read]));
    }

    function getUnreadDemands(items) {
        const read = getReadNotificationIds();
        return items.filter(item => item.notificar !== false && !read.has(String(item.id)));
    }

    function toast(message, type = "success") {
        let stack = document.getElementById("safrapact-toast-stack");
        if (!stack) {
            stack = document.createElement("div");
            stack.id = "safrapact-toast-stack";
            stack.className = "toast-stack";
            document.body.appendChild(stack);
        }
        const item = document.createElement("div");
        item.className = `safrapact-toast ${type}`;
        item.innerHTML = `<i class="fas ${type === "success" ? "fa-circle-check" : "fa-bell"}"></i><span>${escapeHtml(message)}</span>`;
        stack.appendChild(item);
        setTimeout(() => item.classList.add("show"), 20);
        setTimeout(() => { item.classList.remove("show"); setTimeout(() => item.remove(), 300); }, 4300);
    }

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
    }

    function formatDate(value) {
        if (!value) return "";
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("pt-BR");
    }

    function initTheme() {
        const themeToggle = document.getElementById("theme-toggle");
        const logoImg = document.getElementById("main-logo");
        const saved = localStorage.getItem(KEYS.theme) || "dark";
        applyTheme(saved, themeToggle, logoImg);
        if (!themeToggle || themeToggle.dataset.boundTheme) return;
        themeToggle.dataset.boundTheme = "true";
        themeToggle.addEventListener("click", () => {
            const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
            localStorage.setItem(KEYS.theme, next);
            applyTheme(next, themeToggle, logoImg);
        });
    }

    function applyTheme(theme, button, logo) {
        document.documentElement.setAttribute("data-theme", theme);
        if (button) {
            const icon = button.querySelector("i");
            if (icon) icon.className = theme === "dark" ? "fas fa-sun" : "fas fa-moon";
            button.setAttribute("aria-label", theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro");
        }
        if (logo) logo.src = theme === "dark" ? "img/logo.png" : "img/logo-fundo-branco.png";
    }

    function initMobileMenu() {
        const mobileMenu = document.getElementById("mobile-menu");
        const navList = document.getElementById("nav-list");
        if (mobileMenu && navList && !mobileMenu.dataset.boundMenu) {
            mobileMenu.dataset.boundMenu = "true";
            mobileMenu.addEventListener("click", () => navList.classList.toggle("active"));
        }
    }

    function createBell() {
        const headerButtons = document.querySelector(".header-buttons");
        if (!headerButtons || document.getElementById("notification-bell")) return;
        const wrapper = document.createElement("div");
        wrapper.className = "notification-wrapper";
        wrapper.innerHTML = `
            <button id="notification-bell" class="notification-bell" aria-label="Notificações de novas ofertas">
                <i class="fas fa-bell"></i><span id="notification-count" class="notification-count">0</span>
            </button>
            <div id="notification-panel" class="notification-panel">
                <div class="notification-panel-head"><strong>Novas ofertas</strong><button id="mark-notifications-read" type="button">Marcar como vistas</button></div>
                <div id="notification-list" class="notification-list"></div>
                <div class="sync-mode-note">${databaseURL ? '<i class="fas fa-cloud"></i> Sincronização entre dispositivos ativa' : '<i class="fas fa-mobile-screen"></i> Modo local: ative o Firebase para sincronizar celulares'}</div>
            </div>`;
        headerButtons.insertBefore(wrapper, headerButtons.firstChild);
        wrapper.querySelector("#notification-bell").addEventListener("click", event => {
            event.stopPropagation();
            wrapper.querySelector("#notification-panel").classList.toggle("open");
        });
        wrapper.querySelector("#mark-notifications-read").addEventListener("click", () => {
            markNotificationsRead(getUnreadDemands(state.published).map(item => item.id));
            renderNotifications();
        });
        document.addEventListener("click", event => {
            if (!wrapper.contains(event.target)) wrapper.querySelector("#notification-panel").classList.remove("open");
        });
    }

    function renderNotifications() {
        const count = document.getElementById("notification-count");
        const list = document.getElementById("notification-list");
        if (!count || !list) return;
        const unread = getUnreadDemands(state.published);
        count.textContent = unread.length;
        count.style.display = unread.length ? "inline-flex" : "none";
        list.innerHTML = unread.length ? unread.slice(0, 8).map(item => `
            <a href="propostas.html?oferta=${encodeURIComponent(item.id)}" class="notification-item">
                <i class="fas fa-seedling"></i>
                <span><strong>${escapeHtml(item.tipo)}</strong><small>${escapeHtml(item.localizacao)} · ${escapeHtml(item.area)}</small></span>
            </a>`).join("") : '<div class="notification-empty">Nenhuma nova oferta disponível.</div>';
    }

    async function refreshNotifications(showToast = false) {
        const before = new Set(state.published.map(item => String(item.id)));
        const items = await getPublishedDemands();
        renderNotifications();
        if (showToast) {
            const fresh = items.filter(item => item.notificar !== false && !before.has(String(item.id)));
            if (fresh.length) toast(`${fresh.length} nova${fresh.length > 1 ? "s" : ""} oferta${fresh.length > 1 ? "s" : ""} disponível${fresh.length > 1 ? "is" : ""} no mural.`, "notice");
        }
        state.onDemandsChange.forEach(callback => callback(items));
        return items;
    }

    async function initProviderNotifications() {
        const session = getSession();
        if (!session || session.tipo !== "Empresa Prestadora") return;
        createBell();
        await refreshNotifications(false);
        const unread = getUnreadDemands(state.published);
        if (unread.length && !state.initialUnreadToastShown) {
            state.initialUnreadToastShown = true;
            toast(`${unread.length} nova${unread.length > 1 ? "s" : ""} oferta${unread.length > 1 ? "s" : ""} aguardando sua análise.`, "notice");
        }
        if (!state.pollTimer) state.pollTimer = setInterval(() => refreshNotifications(true), pollIntervalMs);
    }

    function addProducerNewDemandButton() {
        const session = getSession();
        const headerButtons = document.querySelector(".header-buttons");
        if (!session || session.tipo !== "Produtor Rural" || !headerButtons || document.getElementById("header-nova-demanda")) return;
        const button = document.createElement("button");
        button.id = "header-nova-demanda";
        button.className = "btn-primary btn-nav";
        button.innerHTML = '<i class="fas fa-plus"></i> Nova Demanda';
        headerButtons.insertBefore(button, headerButtons.firstChild);
    }

    function demandModalMarkup() {
        return `
        <div class="modal-overlay" id="modalNovaDemandaOverlay">
          <div class="modal-card modal-card-large">
            <button class="close-btn" id="close-nova-demanda" type="button"><i class="fas fa-times"></i></button>
            <div class="modal-head">
              <p class="modal-kicker"><i class="fas fa-clipboard-list"></i> Cadastro operacional</p>
              <h2>Nova demanda rural</h2>
              <p class="modal-subtitle">Descreva o serviço necessário. O formulário salva automaticamente um rascunho neste dispositivo.</p>
            </div>
            <form id="form-nova-demanda" class="demand-form">
              <input type="hidden" id="demanda-id">
              <div class="form-grid two-columns">
                <div class="input-group span-2"><label for="demanda-titulo">Título da oportunidade *</label><input class="premium-input" id="demanda-titulo" required placeholder="Ex.: Colheita mecanizada de milho safrinha"></div>
                <div class="input-group"><label for="demanda-tipo">Tipo de serviço *</label><select class="premium-input" id="demanda-tipo" required><option value="">Selecione</option><option>Colheita</option><option>Plantio</option><option>Pulverização</option><option>Preparo do solo</option><option>Transporte e logística</option><option>Aplicação de fertilizantes</option><option>Locação de maquinário</option><option>Outro serviço</option></select></div>
                <div class="input-group"><label for="demanda-cultura">Cultura principal</label><input class="premium-input" id="demanda-cultura" placeholder="Soja, milho, algodão..."></div>
                <div class="input-group"><label for="demanda-cidade">Município *</label><input class="premium-input" id="demanda-cidade" required placeholder="Ex.: Sinop"></div>
                <div class="input-group"><label for="demanda-uf">Estado *</label><select class="premium-input" id="demanda-uf" required>${["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"].map(uf => `<option value="${uf}"${uf === "MT" ? " selected" : ""}>${uf}</option>`).join("")}</select></div>
                <div class="input-group"><label for="demanda-area">Área estimada *</label><input class="premium-input" id="demanda-area" required placeholder="Ex.: 1.500 ha"></div>
                <div class="input-group"><label for="demanda-equipamentos">Estrutura desejada</label><input class="premium-input" id="demanda-equipamentos" placeholder="Ex.: 3 colheitadeiras e 2 transbordos"></div>
                <div class="input-group"><label for="demanda-inicio">Início da janela *</label><input type="date" class="premium-input" id="demanda-inicio" required></div>
                <div class="input-group"><label for="demanda-fim">Fim da janela *</label><input type="date" class="premium-input" id="demanda-fim" required></div>
                <div class="input-group"><label for="demanda-prioridade">Prioridade</label><select class="premium-input" id="demanda-prioridade"><option>Planejamento normal</option><option>Janela curta</option><option>Atendimento urgente</option></select></div>
                <div class="input-group"><label for="demanda-contato">Contato operacional</label><input class="premium-input" id="demanda-contato" placeholder="Telefone ou responsável"></div>
                <div class="input-group span-2"><label for="demanda-descricao">Detalhes adicionais</label><textarea class="premium-input premium-textarea" id="demanda-descricao" placeholder="Informe condições de acesso, talhões, exigências técnicas e observações importantes."></textarea></div>
              </div>
              <div class="draft-status"><i class="fas fa-floppy-disk"></i><span id="draft-status-text">Rascunho automático ativado</span></div>
              <div class="demand-form-actions">
                <button type="button" class="btn-secondary" id="btn-salvar-pendente"><i class="fas fa-clock"></i> Salvar como pendente</button>
                <button type="submit" class="btn-primary"><i class="fas fa-paper-plane"></i> Publicar para prestadores</button>
              </div>
            </form>
          </div>
        </div>`;
    }

    function formDataFromModal() {
        const value = id => document.getElementById(id)?.value.trim() || "";
        const inicio = value("demanda-inicio");
        const fim = value("demanda-fim");
        return {
            id: value("demanda-id") || undefined,
            titulo: value("demanda-titulo"), tipo: value("demanda-tipo"), cultura: value("demanda-cultura"),
            cidade: value("demanda-cidade"), uf: value("demanda-uf"), area: value("demanda-area"),
            equipamentos: value("demanda-equipamentos"), inicio, fim,
            janela: inicio && fim ? `${formatDate(inicio)} a ${formatDate(fim)}` : "A confirmar",
            prioridade: value("demanda-prioridade"), contato: value("demanda-contato"), descricao: value("demanda-descricao"),
            localizacao: `${value("demanda-cidade")}, ${value("demanda-uf")}`,
            produtor: getSession()?.nome || "Produtor SafraPact"
        };
    }

    function fillDemandForm(data = {}) {
        const pairs = {
            "demanda-id": data.id || "", "demanda-titulo": data.titulo || "", "demanda-tipo": data.tipo || "",
            "demanda-cultura": data.cultura || "", "demanda-cidade": data.cidade || "", "demanda-uf": data.uf || "MT",
            "demanda-area": data.area || "", "demanda-equipamentos": data.equipamentos || "", "demanda-inicio": data.inicio || "",
            "demanda-fim": data.fim || "", "demanda-prioridade": data.prioridade || "Planejamento normal", "demanda-contato": data.contato || "",
            "demanda-descricao": data.descricao || ""
        };
        Object.entries(pairs).forEach(([id, value]) => { const element = document.getElementById(id); if (element) element.value = value; });
    }

    function isDemandValid(payload) {
        return payload.titulo && payload.tipo && payload.cidade && payload.uf && payload.area && payload.inicio && payload.fim;
    }

    function initDemandModal() {
        const session = getSession();
        if (!session || session.tipo !== "Produtor Rural") return;
        addProducerNewDemandButton();
        if (!document.getElementById("modalNovaDemandaOverlay")) document.body.insertAdjacentHTML("beforeend", demandModalMarkup());
        const modal = document.getElementById("modalNovaDemandaOverlay");
        const form = document.getElementById("form-nova-demanda");
        const status = document.getElementById("draft-status-text");

        const bindOpenButton = (id, open) => {
            const button = document.getElementById(id);
            if (!button || button.dataset.boundDemandOpen) return;
            button.dataset.boundDemandOpen = "true";
            button.addEventListener("click", () => open());
        };

        if (modal.dataset.boundDemandModal) {
            const openExisting = modal._openDemandModal;
            bindOpenButton("header-nova-demanda", openExisting);
            bindOpenButton("hero-publicar", openExisting);
            bindOpenButton("perfil-publicar-demanda", openExisting);
            return;
        }

        modal.dataset.boundDemandModal = "true";
        let autosaveTimer;
        const open = payload => {
            fillDemandForm(payload || getDraft(session.email) || {});
            modal.style.display = "flex";
        };
        const close = () => { modal.style.display = "none"; };
        modal._openDemandModal = open;

        bindOpenButton("header-nova-demanda", open);
        bindOpenButton("hero-publicar", open);
        bindOpenButton("perfil-publicar-demanda", open);
        document.getElementById("close-nova-demanda")?.addEventListener("click", close);
        modal.addEventListener("click", event => { if (event.target === modal) close(); });

        form.addEventListener("input", () => {
            clearTimeout(autosaveTimer);
            status.textContent = "Salvando rascunho...";
            autosaveTimer = setTimeout(() => {
                saveDraft(session.email, formDataFromModal());
                status.textContent = `Rascunho salvo às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
            }, 450);
        });

        document.getElementById("btn-salvar-pendente")?.addEventListener("click", () => {
            const payload = formDataFromModal();
            if (!payload.titulo) { toast("Informe ao menos um título para salvar a demanda pendente.", "notice"); return; }
            savePendingDemand(session.email, payload);
            toast("Demanda salva como pendente. Ela ainda não foi publicada.");
            close();
            window.dispatchEvent(new Event("safrapact:pending-change"));
        });

        form.addEventListener("submit", async event => {
            event.preventDefault();
            const payload = formDataFromModal();
            if (!isDemandValid(payload)) { toast("Preencha os campos obrigatórios antes de publicar.", "notice"); return; }
            await publishDemand(payload);
            if (payload.id) removePendingDemand(session.email, payload.id);
            clearDraft(session.email);
            form.reset();
            close();
            toast("Demanda publicada. Os prestadores já podem receber a notificação.");
            window.dispatchEvent(new Event("safrapact:pending-change"));
        });

        window.addEventListener("safrapact:edit-pending", event => open(event.detail));
    }

    function initCommon() {
        initTheme();
        initMobileMenu();
        initDemandModal();
        initProviderNotifications();
    }

    window.addEventListener("storage", event => {
        if ([KEYS.localPublished, KEYS.notificationsRead].includes(event.key)) refreshNotifications(true);
    });
    if (channel) channel.addEventListener("message", () => refreshNotifications(true));
    window.addEventListener("safrapact:update", () => refreshNotifications(false));

    window.SafraPact = {
        KEYS, BASE_DEMANDS, getSession, saveSession, logout, getDraft, saveDraft, clearDraft,
        getPending, savePendingDemand, removePendingDemand, getPublishedDemands, publishDemand,
        initTheme, initMobileMenu, initCommon, initDemandModal, initProviderNotifications, refreshNotifications,
        toast, escapeHtml, formatDate, isRemoteSyncEnabled: () => Boolean(databaseURL)
    };
})();
