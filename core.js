// ============================================================================
// core.js  — lógica compartida de la aplicación
// Gestiona: navegación entre módulos, idioma (i18n), tema y esquema de color.
// No usa fetch() → funciona abriendo index.html con doble clic (protocolo file://)
// ============================================================================

// ── Utilidades compartidas ────────────────────────────────────────────────────
// (Definidas antes de applyStoredTheme(): esa llamada se ejecuta nada más cargar el archivo)

// Ordenar nombres ignorando acentos y mayúsculas: "Dončić" queda junto a "Doncic", no al final.
const NAME_COLLATOR = new Intl.Collator('es', { sensitivity: 'base' });

// ¿La última interacción fue con teclado? (mismo criterio que :focus-visible). Sirve para llevar
// el foco al primer elemento de un menú solo cuando se abrió con teclado, no con el ratón.
let keyboardNav = false;
document.addEventListener('keydown',     () => { keyboardNav = true;  }, true);
document.addEventListener('pointerdown', () => { keyboardNav = false; }, true);

// ── Colores de los gráficos (Chart.js) según el tema ──────────────────────────
// Chart.js pinta texto y rejilla con un gris propio, casi ilegible en modo oscuro. Se leen las
// variables CSS del tema activo y se aplican como valores por defecto de todos los gráficos.
function applyChartTheme() {
    if (typeof Chart === 'undefined') return;
    const css = getComputedStyle(document.documentElement);
    Chart.defaults.color       = css.getPropertyValue('--text-secondary').trim() || '#666';
    Chart.defaults.borderColor = css.getPropertyValue('--border-color').trim()   || 'rgba(0,0,0,0.1)';
    // Repintar los gráficos que ya estén dibujados (sin animación)
    Object.values(Chart.instances).forEach(c => c.update('none'));
}

// Devuelve un canvas nuevo con el gráfico sobre fondo BLANCO y colores del tema CLARO, para
// descargarlo como PNG. Sin esto, en modo oscuro el PNG saldría con texto claro sobre blanco.
function renderChartForExport(chart) {
    const prev = { color: Chart.defaults.color, borderColor: Chart.defaults.borderColor };
    Chart.defaults.color = '#475569';
    Chart.defaults.borderColor = 'rgba(0,0,0,0.1)';
    try {
        chart.update('none'); chart.draw();
        const tmp = document.createElement('canvas');
        tmp.width  = chart.canvas.width;
        tmp.height = chart.canvas.height;
        const ctx = tmp.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, tmp.width, tmp.height);
        ctx.drawImage(chart.canvas, 0, 0);
        return tmp;
    } finally {
        // Volver a los colores del tema activo
        Chart.defaults.color = prev.color;
        Chart.defaults.borderColor = prev.borderColor;
        chart.update('none'); chart.draw();
    }
}


// Aplicar tema antes de pintar el DOM para evitar flash de color incorrecto
applyStoredTheme();


// ── Navegación entre módulos ──────────────────────────────────────────────────
// Cada módulo es un <div id="module-{name}"> embebido en index.html.
// switchModule oculta el activo, muestra el nuevo y llama a su init().

let activeModule = null;

// Nombres de los módulos que hay en index.html: cada <div id="module-X" class="module-container">
// es un módulo. Así, un módulo nuevo se detecta solo al añadir su div.
function getModuleNames() {
    return [...document.querySelectorAll('.module-container')].map(el => el.id.replace(/^module-/, ''));
}

function switchModule(name) {
    const modules = getModuleNames();

    // Valor desconocido (localStorage antiguo o corrupto) → primer módulo, en vez de fallar
    if (!modules.includes(name)) name = modules[0];

    // Evitar recargar el módulo si ya está activo
    if (activeModule === name) return;

    // Mostrar SOLO el módulo elegido y ocultar todos los demás. Se recorren todos (no solo
    // "el anterior") porque al arrancar activeModule es null: de lo contrario, el módulo
    // que el HTML trae visible por defecto seguiría visible junto al que se acaba de abrir.
    modules.forEach(m => {
        const active = m === name;
        document.getElementById(`module-${m}`).style.display = active ? 'block' : 'none';
        const tab = document.getElementById(`tab-${m}`);
        if (tab) {
            tab.classList.toggle('active', active);
            tab.setAttribute('aria-selected', active);   // lectores de pantalla: pestaña elegida
            tab.tabIndex = active ? 0 : -1;              // solo la activa entra en el orden de Tab
        }
    });
    activeModule = name;

    // Recordar el módulo activo para la próxima visita
    localStorage.setItem('activeModule', name);

    // Llamar al init del módulo si existe.
    // Convención: window.Jugadores.init(), window.Entrenadores.init(), window.Historico.init(), etc.
    const mod = window[capitalize(name)];
    if (mod && typeof mod.init === 'function') mod.init();

    // Re-aplicar traducciones al HTML del módulo recién mostrado
    applyTranslationsToDOM();
}

// Capitaliza la primera letra: 'liga' → 'Liga'
function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}


// ── i18n (internacionalización) ───────────────────────────────────────────────
// Las traducciones viven en window.LANG_ES / LANG_EU / LANG_EN (lang/*.js).
// Los elementos HTML usan data-lang-key, data-lang-key-aria y data-lang-key-placeholder.

function getTranslations(lang) {
    const code = lang || localStorage.getItem('language') || 'es';
    return { es: window.LANG_ES, eu: window.LANG_EU, en: window.LANG_EN }[code] || window.LANG_ES;
}

function setLanguage(lang) {
    localStorage.setItem('language', lang);
    document.documentElement.lang = lang;
    applyTranslationsToDOM(lang);
    updateLangButton(lang);
    // Marcar visualmente (y para lectores de pantalla) el idioma activo en el menú
    document.querySelectorAll('.lang-option').forEach(opt => {
        const on = opt.dataset.lang === lang;
        opt.classList.toggle('active', on);
        opt.setAttribute('aria-checked', on);
    });
    notifyModulesLanguageChange();
}

// Los módulos construyen parte de su contenido por código (selectores, tablas, gráficos,
// avisos) y data-lang-key no llega ahí. Convención: si un módulo expone onLanguageChange(),
// se le llama tras cambiar de idioma para que repinte esos textos.
function notifyModulesLanguageChange() {
    getModuleNames().forEach(name => {
        const mod = window[capitalize(name)];
        if (mod && typeof mod.onLanguageChange === 'function') mod.onLanguageChange();
    });
}

// Recorre el DOM y aplica los textos del idioma activo a todos los elementos marcados
function applyTranslationsToDOM(lang) {
    const t = getTranslations(lang);

    // Textos visibles: <span data-lang-key="clave">
    document.querySelectorAll('[data-lang-key]').forEach(el => {
        const key = el.dataset.langKey;
        if (t[key] && el.tagName !== 'TITLE') el.textContent = t[key];
    });

    // Título del documento
    if (t.document_title) document.title = t.document_title;

    // Atributos aria-label: <button data-lang-key-aria="clave">
    document.querySelectorAll('[data-lang-key-aria]').forEach(el => {
        const key = el.dataset.langKeyAria;
        if (t[key]) el.setAttribute('aria-label', t[key]);
    });

    // Tooltips: <div data-lang-key-title="clave">
    document.querySelectorAll('[data-lang-key-title]').forEach(el => {
        const key = el.dataset.langKeyTitle;
        if (t[key]) el.title = t[key];
    });

    // Placeholders de inputs: <input data-lang-key-placeholder="clave">
    document.querySelectorAll('[data-lang-key-placeholder]').forEach(el => {
        const key = el.dataset.langKeyPlaceholder;
        if (t[key]) el.placeholder = t[key];
    });
}

// SVGs de banderas inline para evitar peticiones externas (funciona con file://)
const FLAG_SVGS = {
    es: `<svg class="flag-svg" width="28" height="19" viewBox="0 0 60 40" xmlns="http://www.w3.org/2000/svg"><rect width="60" height="40" fill="#AA151B"/><rect y="10" width="60" height="20" fill="#F1BF00"/></svg>`,
    eu: `<svg class="flag-svg" viewBox="0 0 60 40" xmlns="http://www.w3.org/2000/svg"><rect width="60" height="40" fill="#D8202C"/><line x1="0" y1="0" x2="60" y2="40" stroke="#007A3D" stroke-width="10"/><line x1="60" y1="0" x2="0" y2="40" stroke="#007A3D" stroke-width="10"/><rect x="25" y="0" width="10" height="40" fill="white"/><rect x="0" y="15" width="60" height="10" fill="white"/></svg>`,
    en: `<svg class="flag-svg" width="28" height="19" viewBox="0 0 60 40" xmlns="http://www.w3.org/2000/svg"><rect width="60" height="40" fill="#012169"/><line x1="0" y1="0" x2="60" y2="40" stroke="white" stroke-width="8"/><line x1="60" y1="0" x2="0" y2="40" stroke="white" stroke-width="8"/><line x1="0" y1="0" x2="60" y2="40" stroke="#C8102E" stroke-width="4.5"/><line x1="60" y1="0" x2="0" y2="40" stroke="#C8102E" stroke-width="4.5"/><rect x="24" y="0" width="12" height="40" fill="white"/><rect x="0" y="14" width="60" height="12" fill="white"/><rect x="26" y="0" width="8" height="40" fill="#C8102E"/><rect x="0" y="16" width="60" height="8" fill="#C8102E"/></svg>`,
};
const LANG_CODES = { es: 'ES', eu: 'EU', en: 'EN' };

// Actualiza el botón del header con la bandera e idioma activo
function updateLangButton(lang) {
    const btn = document.getElementById('langButtonContent');
    if (btn) btn.innerHTML = `${FLAG_SVGS[lang] || ''}<span class="lang-code">${LANG_CODES[lang] || lang.toUpperCase()}</span>`;
}

// Abre/cierra el menú de idioma y cierra el de tema si estaba abierto
window.toggleLangMenu = function () {
    const menu = document.getElementById('langMenu');
    const btn  = document.getElementById('langButton');
    const open = menu.classList.toggle('hidden') === false;
    btn.setAttribute('aria-expanded', open);
    closeMenu('themeMenu', 'themeButton');
    if (open && keyboardNav) focusMenuItem(menu, 0);   // abierto con teclado → foco al primer elemento
};

// Cierra un menú y deja su botón con aria-expanded="false"
function closeMenu(menuId, buttonId) {
    document.getElementById(menuId)?.classList.add('hidden');
    document.getElementById(buttonId)?.setAttribute('aria-expanded', 'false');
}


// ── Tema y esquema de color ───────────────────────────────────────────────────
// El tema (claro/oscuro/auto) se aplica como data-theme en <html>.
// El esquema de color se aplica como data-color-scheme en <html>.
// Ambos se leen de localStorage al arrancar para evitar flash.

// Lee localStorage y aplica tema + color antes de que se pinte el DOM
function applyStoredTheme() {
    const theme  = localStorage.getItem('theme')  || 'auto';
    const scheme = localStorage.getItem('color')  || 'blue';
    applyTheme(theme);
    document.documentElement.setAttribute('data-color-scheme', scheme);
}

// Aplica el modo de tema: 'light', 'dark' o 'auto' (sigue la preferencia del sistema)
function applyTheme(mode) {
    const dark = mode === 'auto'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
        : mode === 'dark';
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    applyChartTheme();   // los gráficos toman los colores del tema que acaba de quedar activo
}

// Cambia el tema y lo guarda en localStorage
window.changeTheme = function (mode) {
    localStorage.setItem('theme', mode);
    applyTheme(mode);
    closeMenu('themeMenu', 'themeButton');
};

// Cambia el esquema de color (azul, verde, púrpura, naranja, rojo) y lo guarda
window.changeColorScheme = function (scheme) {
    localStorage.setItem('color', scheme);
    document.documentElement.setAttribute('data-color-scheme', scheme);
    // Marcar visualmente el color activo en el menú
    markActiveColor(scheme);
    closeMenu('themeMenu', 'themeButton');
};

// Marca el esquema de color activo en el menú (clase visual + aria-checked)
function markActiveColor(scheme) {
    document.querySelectorAll('.color-option').forEach(el => {
        const on = !!el.getAttribute('onclick')?.includes(`'${scheme}'`);
        el.classList.toggle('active', on);
        el.setAttribute('aria-checked', on);
    });
}

// Abre/cierra el menú de tema y cierra el de idioma si estaba abierto
window.toggleThemeMenu = function () {
    const menu = document.getElementById('themeMenu');
    const btn  = document.getElementById('themeButton');
    const open = menu.classList.toggle('hidden') === false;
    btn.setAttribute('aria-expanded', open);
    closeMenu('langMenu', 'langButton');
    if (open && keyboardNav) focusMenuItem(menu, 0);   // abierto con teclado → foco al primer elemento
};

// Cierra ambos menús al hacer clic en cualquier otra parte del documento
document.addEventListener('click', e => {
    if (!e.target.closest('.language-selector')) closeMenu('langMenu', 'langButton');
    if (!e.target.closest('.theme-selector'))    closeMenu('themeMenu', 'themeButton');
});


// ── Teclado y accesibilidad ───────────────────────────────────────────────────
// · Menús (idioma, tema/color): ↓ en el botón los abre; ↑ ↓ ← → Inicio Fin mueven entre
//   opciones; Enter/Espacio eligen y devuelven el foco al botón; Esc cierra; Tab cierra.
// · Pestañas de módulo: ← → Inicio Fin cambian de pestaña.
// · Cabeceras de tabla que ordenan (th con tabindex): Enter/Espacio ordenan.

const MENU_BUTTON = { langMenu: 'langButton', themeMenu: 'themeButton' };

function menuItems(menu) { return [...menu.querySelectorAll('[role^="menuitem"]')]; }

// Enfoca la opción i del menú (admite negativos: -1 = última)
function focusMenuItem(menu, i) {
    const items = menuItems(menu);
    if (items.length) items[(i + items.length) % items.length].focus();
}

document.addEventListener('keydown', e => {
    const target = e.target;

    // 1) Botón de menú: ↓ abre el menú y enfoca la primera opción
    const menuId = Object.keys(MENU_BUTTON).find(id => MENU_BUTTON[id] === target.id);
    if (menuId && e.key === 'ArrowDown') {
        e.preventDefault();
        const menu = document.getElementById(menuId);
        if (menu.classList.contains('hidden')) {
            keyboardNav = true;
            (menuId === 'langMenu' ? toggleLangMenu : toggleThemeMenu)();
        }
        focusMenuItem(menu, 0);
        return;
    }

    // 2) Esc con un menú abierto (foco en su botón o en una opción)
    if (e.key === 'Escape') {
        const open = Object.keys(MENU_BUTTON).find(id => !document.getElementById(id)?.classList.contains('hidden'));
        if (open) { e.preventDefault(); closeMenu(open, MENU_BUTTON[open]); document.getElementById(MENU_BUTTON[open])?.focus(); return; }
    }

    // 3) Dentro de un menú abierto
    const menu = target.closest?.('[role="menu"]');
    if (menu) {
        const items = menuItems(menu), i = items.indexOf(target);
        switch (e.key) {
            case 'ArrowDown': case 'ArrowRight': e.preventDefault(); focusMenuItem(menu, i + 1); break;
            case 'ArrowUp':   case 'ArrowLeft':  e.preventDefault(); focusMenuItem(menu, i - 1); break;
            case 'Home': e.preventDefault(); focusMenuItem(menu, 0);  break;
            case 'End':  e.preventDefault(); focusMenuItem(menu, -1); break;
            case 'Enter': case ' ':
                e.preventDefault(); target.click(); document.getElementById(MENU_BUTTON[menu.id])?.focus(); break;
            case 'Tab': closeMenu(menu.id, MENU_BUTTON[menu.id]); break;
        }
        return;
    }

    // 4) Pestañas de módulo
    if (target.getAttribute?.('role') === 'tab') {
        const names = getModuleNames(), cur = names.indexOf(target.id.replace(/^tab-/, ''));
        const go = { ArrowRight: cur + 1, ArrowLeft: cur - 1, Home: 0, End: names.length - 1 }[e.key];
        if (go !== undefined) {
            e.preventDefault();
            const name = names[(go + names.length) % names.length];
            switchModule(name);
            document.getElementById(`tab-${name}`)?.focus();
        }
        return;
    }

    // 5) Cabeceras de tabla ordenables (el propio th, no el checkbox que pueda contener)
    if ((e.key === 'Enter' || e.key === ' ') && target.tagName === 'TH' && target.hasAttribute('tabindex')) {
        e.preventDefault();
        target.click();
    }
});

// Si el usuario cambia la preferencia del sistema y el modo es 'auto', actualizar el tema
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if ((localStorage.getItem('theme') || 'auto') === 'auto') applyTheme('auto');
});


// ── Arranque ──────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    const lang   = localStorage.getItem('language') || 'es';
    const scheme = localStorage.getItem('color')    || 'blue';

    // Aplicar idioma y marcar opciones activas en los menús
    document.documentElement.lang = lang;
    applyTranslationsToDOM(lang);
    updateLangButton(lang);
    document.querySelectorAll('.lang-option').forEach(opt => {
        const on = opt.dataset.lang === lang;
        opt.classList.toggle('active', on);
        opt.setAttribute('aria-checked', on);
    });
    markActiveColor(scheme);

    // Activar el último módulo visitado, o Jugadores por defecto
    const saved = localStorage.getItem('activeModule') || 'jugadores';
    switchModule(saved);
});
