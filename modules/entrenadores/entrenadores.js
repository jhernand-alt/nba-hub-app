// ============================================================================
// modules/entrenadores/entrenadores.js  v1.0.0
// Módulo Entrenadores Fantasy ESPN — toda la lógica encapsulada en window.Entrenadores
// Se activa desde core.js al pulsar la pestaña "Entrenadores"
//
// Flujo de datos:
//   1. Usuario carga ENTRENADOR stats YYYYMMDD HHMM.csv (obligatorio)
//      y opcionalmente ENTRENADOR ids.csv (añade nombre del mánager y enlace ESPN)
//   2. parseEntrenadorIdsCSV + parseEntrenadorStatsCSV los procesan
//   3. rebuildAndRender() combina ambos por ID (o Equipo_Fantasy) y pinta tabla + gráfico
//
// Formatos CSV esperados (separador ';', decimales con ','):
//   ENTRENADOR ids:   ID_NBA;Nombre;Equipo_Fantasy;Equipo_NBA;Posicion;Enlace_Web_ESPN
//   ENTRENADOR stats: ID;Equipo_Fantasy;Pts_Total;Pts_Avg;Partidos;Rank_Total;
//                     Pts_Semana;Pts_2Semanas;Pts_Mes
// ============================================================================

window.Entrenadores = (() => {

    // ── Variables de estado ───────────────────────────────────────────────────

    let idsById         = {};   // mapa id → { managerName, fantasyTeam, espnLink }
    let idsByTeam       = {};   // mapa fantasyTeam → { managerName, fantasyTeam, espnLink }
    let rawStatsList    = [];   // filas parseadas de ENTRENADOR stats
    let allEntrenadores = [];   // datos combinados y ordenados
    let chartInstance   = null; // instancia Chart.js activa
    let currentChart    = 'total'; // 'total' | 'avg' | 'periods' | 'efficiency' | 'compare'
    let selectedIds     = new Set(); // IDs marcados con checkbox para comparar
    let idsFileDate     = null; // fecha del archivo ids cargado
    let statsFileDate   = null; // fecha del archivo stats cargado

    // Estado de ordenación (persistido en localStorage)
    let currentSortKey  = 'rankTotal';
    let sortDirection   = 'asc';

    // Formato CSV
    const SEP     = ';';
    const DEC_SEP = ',';

    // Paleta de 20 colores para gráficos
    const CHART_COLORS = [
        '#2563eb','#dc2626','#16a34a','#d97706','#9333ea',
        '#0891b2','#db2777','#65a30d','#ea580c','#7c3aed',
        '#0284c7','#b91c1c','#15803d','#b45309','#7e22ce',
        '#0369a1','#991b1b','#166534','#92400e','#6b21a8',
    ];


    // ── Helpers de nombres, iconos y formato ──────────────────────────────────

    function t() { return getTranslations(); }

    function getShortName(full) {
        if (!full) return '';
        const parts = full.split(' - ');
        return parts.length >= 2 ? parts.slice(1).join(' - ').trim() : full.trim();
    }

    function getTeamCode(full) {
        if (!full) return '';
        const parts = full.split(' - ');
        return parts.length >= 2 ? parts[0].trim() : full.trim();
    }

    function getFantasyIconUrl(name) {
        if (!name || name.toLowerCase().includes('waiver')) return '';
        return `assets/fantasy-icons/${getTeamCode(name).substring(0,4).toUpperCase()}.svg`;
    }

    function fmtNum(v, dec = 2) {
        if (v === null || v === undefined) return '—';
        return typeof v === 'number' ? v.toFixed(dec).replace('.', ',') : v;
    }

    function makeIconCell(row, iconSrc, altText, displayText, espnLink = '') {
        const td  = row.insertCell();
        const div = document.createElement('div');
        div.className = 'icon-cell';
        if (iconSrc) {
            const img = document.createElement('img');
            img.src = iconSrc; img.alt = altText; img.width = 24; img.height = 24;
            img.onerror = function () { this.style.display = 'none'; };
            div.appendChild(img);
        }
        const span = document.createElement('span');
        span.textContent = displayText;
        div.appendChild(span);
        if (espnLink) {
            const a = document.createElement('a');
            a.href = espnLink;
            a.target = '_blank';
            a.className = 'espn-link';
            a.innerHTML = '🔗';
            a.title = t().espn_view;
            div.appendChild(a);
        }
        td.appendChild(div);
    }


    // ── Parseo de CSVs ────────────────────────────────────────────────────────

    // CSV ids: ID_NBA;Nombre;Equipo_Fantasy;Equipo_NBA;Posicion;Enlace_Web_ESPN
    function parseEntrenadorIdsCSV(text) {
        const lines = text.trim().split('\n');
        const byId  = {};
        const byTeam = {};
        for (let i = 1; i < lines.length; i++) {
            const v = lines[i].split(SEP);
            if (v.length >= 3) {
                const id          = v[0].trim();
                const managerName = v[1].trim();
                const fantasyTeam = v[2].trim();
                const espnLink    = v[5]?.trim() || '';
                if (!id && !fantasyTeam) continue;
                const entry = { id, managerName, fantasyTeam, espnLink };
                if (id) byId[id] = entry;
                if (fantasyTeam) byTeam[fantasyTeam] = entry;
            }
        }
        return { byId, byTeam };
    }

    // CSV stats:
    //   ID;Equipo_Fantasy;Pts_Total;Pts_Avg;Partidos;Rank_Total;Pts_Semana;Pts_2Semanas;Pts_Mes
    function parseEntrenadorStatsCSV(text) {
        const lines  = text.trim().split('\n');
        const header = (lines[0] || '').toLowerCase();
        if (header.includes('rank_pos')) {
            alert(t().ent_alert_wrong_csv);
            return [];
        }
        const pf = (v, idx) => { const s=(v[idx]||'').trim(); if(!s) return null; const n=parseFloat(s.replace(DEC_SEP,'.')); return isNaN(n)?null:n; };
        const pi = (v, idx) => { const s=(v[idx]||'').trim(); if(!s) return null; const n=parseInt(s); return isNaN(n)?null:n; };
        const list = [];
        for (let i = 1; i < lines.length; i++) {
            const v  = lines[i].split(SEP);
            const id = v[0]?.trim();
            if (!id) continue;
            list.push({
                id,
                fantasyTeam: v[1]?.trim() || '',
                ptsTotal:    pf(v, 2) ?? 0,
                ptsAvg:      pf(v, 3) ?? 0,
                partidos:    pi(v, 4) ?? 0,
                rankTotal:   pi(v, 5),
                ptsSemana:   pf(v, 6) ?? 0,
                pts2Semanas: pf(v, 7) ?? 0,
                ptsMes:      pf(v, 8) ?? 0,
            });
        }
        return list;
    }


    // ── Combinación y renderizado ─────────────────────────────────────────────

    function rebuildAndRender() {
        if (!rawStatsList.length) return;
        loadState();

        allEntrenadores = rawStatsList.map(s => {
            const meta = idsById[s.id] || idsByTeam[s.fantasyTeam] || {};
            return {
                id:          s.id,
                fantasyTeam: s.fantasyTeam || meta.fantasyTeam || '',
                managerName: meta.managerName || '',
                espnLink:    meta.espnLink || '',
                ptsTotal:    s.ptsTotal,
                ptsAvg:      s.ptsAvg,
                partidos:    s.partidos,
                rankTotal:   s.rankTotal,
                ptsSemana:   s.ptsSemana,
                pts2Semanas: s.pts2Semanas,
                ptsMes:      s.ptsMes,
            };
        });

        const checkAll = document.getElementById('entCheckAll');
        if (checkAll && !checkAll.dataset.entBound) {
            checkAll.dataset.entBound = '1';
            checkAll.addEventListener('change', function () {
                if (this.checked) allEntrenadores.forEach(e => selectedIds.add(e.id));
                else selectedIds.clear();
                renderTable(allEntrenadores);
                if (currentChart === 'compare') renderCompareChart();
            });
        }

        const dlBtn = document.getElementById('entDownloadChart');
        if (dlBtn) dlBtn.disabled = false;

        sortData(allEntrenadores, currentSortKey, sortDirection);
        renderTable(allEntrenadores);
        updateCurrentChart();
    }


    // ── Ordenación y persistencia ─────────────────────────────────────────────

    function sortData(arr, key, dir) {
        arr.sort((a, b) => {
            const va = a[key], vb = b[key];
            const aNull = va === null || va === undefined || va === '';
            const bNull = vb === null || vb === undefined || vb === '';
            if (aNull && bNull) return 0;
            if (aNull) return 1;
            if (bNull) return -1;
            if (typeof va === 'string' && typeof vb === 'string') {
                const c = NAME_COLLATOR.compare(va, vb);
                return dir === 'asc' ? c : -c;
            }
            if (va < vb) return dir === 'asc' ? -1 : 1;
            if (va > vb) return dir === 'asc' ?  1 : -1;
            return 0;
        });
    }

    function saveState() {
        localStorage.setItem('entrenadoresState', JSON.stringify({
            sortKey: currentSortKey,
            sortDir: sortDirection,
        }));
    }

    function loadState() {
        const s = JSON.parse(localStorage.getItem('entrenadoresState') || '{}');
        currentSortKey = s.sortKey || 'rankTotal';
        sortDirection  = s.sortDir || 'asc';
    }


    // ── Renderizado de la tabla ───────────────────────────────────────────────

    function renderTable(teams) {
        const body = document.getElementById('entTableBody');
        if (!body) return;
        body.innerHTML = '';
        if (!teams.length) {
            body.innerHTML = `<tr><td colspan="10">${t().table_empty_initial}</td></tr>`;
            return;
        }
        teams.forEach(e => {
            const row = body.insertRow();

            const chkCell = row.insertCell();
            const chk = document.createElement('input');
            chk.type = 'checkbox';
            chk.checked = selectedIds.has(e.id);
            chk.addEventListener('change', () => {
                if (chk.checked) selectedIds.add(e.id);
                else selectedIds.delete(e.id);
                if (currentChart === 'compare') renderCompareChart();
            });
            chkCell.appendChild(chk);

            row.insertCell().textContent = e.rankTotal ?? '—';

            makeIconCell(row, getFantasyIconUrl(e.fantasyTeam), e.fantasyTeam, getShortName(e.fantasyTeam), e.espnLink);

            row.insertCell().textContent = e.managerName || '—';
            row.insertCell().textContent = fmtNum(e.ptsTotal);
            row.insertCell().textContent = fmtNum(e.ptsAvg);
            row.insertCell().textContent = e.partidos ?? '—';
            row.insertCell().textContent = fmtNum(e.ptsSemana);
            row.insertCell().textContent = fmtNum(e.pts2Semanas);
            row.insertCell().textContent = fmtNum(e.ptsMes);
        });
    }


    // ── Gráficos ──────────────────────────────────────────────────────────────

    function getChartCanvas() { return document.getElementById('entrenadoresPointsChart'); }

    function renderRankingBarChart(field) {
        if (typeof Chart === 'undefined') return;
        const label  = field === 'ptsTotal' ? t().col_pts_total.replace(' ⇅','') : t().col_pts_avg.replace(' ⇅','');
        const sorted = [...allEntrenadores].sort((a, b) => (b[field] || 0) - (a[field] || 0));
        buildBarChart({
            title: label,
            labels: sorted.map(e => getShortName(e.fantasyTeam)),
            datasets: [{
                label,
                data: sorted.map(e => e[field] || 0),
                backgroundColor: sorted.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]),
                borderRadius: 4,
            }],
            indexAxis: 'y',
            xTitle: label,
        });
    }

    function renderPeriodsChart() {
        if (typeof Chart === 'undefined') return;
        const sorted = [...allEntrenadores].sort((a, b) => (b.ptsTotal || 0) - (a.ptsTotal || 0));
        buildBarChart({
            title: t().ent_tab_periods,
            labels: sorted.map(e => getShortName(e.fantasyTeam)),
            datasets: [
                {
                    label: t().col_pts_week.replace(' ⇅', ''),
                    data: sorted.map(e => e.ptsSemana || 0),
                    backgroundColor: '#2563eb',
                    borderRadius: 3,
                },
                {
                    label: t().col_pts_2weeks.replace(' ⇅', ''),
                    data: sorted.map(e => e.pts2Semanas || 0),
                    backgroundColor: '#16a34a',
                    borderRadius: 3,
                },
                {
                    label: t().col_pts_month.replace(' ⇅', ''),
                    data: sorted.map(e => e.ptsMes || 0),
                    backgroundColor: '#d97706',
                    borderRadius: 3,
                },
            ],
            indexAxis: 'x',
            xTitle: '',
        });
    }

    function renderEfficiencyScatterChart() {
        if (typeof Chart === 'undefined') return;
        const canvasEl = getChartCanvas();
        const ctx = canvasEl.getContext('2d');
        if (chartInstance) chartInstance.destroy();
        canvasEl.setAttribute('role', 'img');
        canvasEl.setAttribute('aria-label', t().ent_tab_efficiency);

        const points = allEntrenadores.map((e, i) => ({
            x: e.partidos || 0,
            y: e.ptsAvg || 0,
            team: getShortName(e.fantasyTeam),
            manager: e.managerName,
            total: e.ptsTotal || 0,
            color: CHART_COLORS[i % CHART_COLORS.length],
        }));

        chartInstance = new Chart(ctx, {
            type: 'scatter',
            data: {
                datasets: [{
                    label: t().ent_tab_efficiency,
                    data: points,
                    backgroundColor: points.map(p => p.color),
                    borderColor: points.map(p => p.color),
                    pointRadius: 7,
                    pointHoverRadius: 9,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { top: 10, bottom: 16, right: 16 } },
                plugins: {
                    title: { display: true, text: t().ent_tab_efficiency, font: { size: 14, weight: 'bold' }, padding: { bottom: 10 } },
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: ctx => {
                                const raw = ctx.raw;
                                const mgr = raw.manager ? ` (${raw.manager})` : '';
                                return `${raw.team}${mgr}: ${raw.x} PJ · ${fmtNum(raw.y)} Avg · ${fmtNum(raw.total)} Total`;
                            },
                        },
                    },
                },
                scales: {
                    x: {
                        title: { display: true, text: t().col_gp.replace(' ⇅', '') },
                        ticks: { precision: 0 },
                    },
                    y: {
                        title: { display: true, text: t().col_pts_avg.replace(' ⇅', '') },
                    },
                },
            },
        });
    }

    function renderCompareChart() {
        if (typeof Chart === 'undefined') return;
        const selected = allEntrenadores.filter(e => selectedIds.has(e.id));
        if (!selected.length) { clearChart(); return; }

        const canvasEl = getChartCanvas();
        const ctx = canvasEl.getContext('2d');
        if (chartInstance) chartInstance.destroy();
        canvasEl.setAttribute('role', 'img');
        canvasEl.setAttribute('aria-label', t().tab_compare);

        chartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: selected.map(e => getShortName(e.fantasyTeam)),
                datasets: [
                    {
                        label: t().col_pts_total.replace(' ⇅', ''),
                        data: selected.map(e => e.ptsTotal || 0),
                        backgroundColor: '#2563eb',
                        borderRadius: 4,
                        yAxisID: 'y',
                    },
                    {
                        label: t().col_pts_avg.replace(' ⇅', ''),
                        data: selected.map(e => e.ptsAvg || 0),
                        backgroundColor: '#16a34a',
                        borderRadius: 4,
                        yAxisID: 'y1',
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { top: 10, bottom: 16 } },
                plugins: {
                    title: { display: true, text: t().tab_compare, font: { size: 14, weight: 'bold' }, padding: { bottom: 10 } },
                    legend: { position: 'top', labels: { boxWidth: 20 } },
                    tooltip: { mode: 'index', intersect: false },
                },
                scales: {
                    y: {
                        type: 'linear',
                        position: 'left',
                        beginAtZero: true,
                        title: { display: true, text: t().col_pts_total.replace(' ⇅', '') },
                    },
                    y1: {
                        type: 'linear',
                        position: 'right',
                        beginAtZero: true,
                        grid: { drawOnChartArea: false },
                        title: { display: true, text: t().col_pts_avg.replace(' ⇅', '') },
                    },
                },
            },
        });
    }

    function buildBarChart({ title='', labels, datasets, indexAxis='x', xTitle='' }) {
        if (typeof Chart === 'undefined') return;
        const canvasEl = getChartCanvas();
        const ctx = canvasEl.getContext('2d');
        if (chartInstance) chartInstance.destroy();
        canvasEl.setAttribute('role', 'img');
        canvasEl.setAttribute('aria-label', title || '');
        chartInstance = new Chart(ctx, {
            type: 'bar',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis,
                layout: { padding: { bottom: 20, top: 10 } },
                plugins: {
                    title:   { display: !!title, text: title, font: { size: 14, weight: 'bold' }, padding: { bottom: 10 } },
                    legend:  { position: datasets.length > 1 ? 'top' : 'none', labels: { boxWidth: 20 } },
                    tooltip: { mode: 'index', intersect: false },
                },
                scales: {
                    x: { title: { display: !!xTitle, text: xTitle }, beginAtZero: true },
                    y: { beginAtZero: true },
                },
            },
        });
    }

    function clearChart() {
        if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
        const canvas = getChartCanvas();
        if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    }

    function updateCurrentChart() {
        if (!allEntrenadores.length) return;
        switch (currentChart) {
            case 'total':      renderRankingBarChart('ptsTotal'); break;
            case 'avg':        renderRankingBarChart('ptsAvg');   break;
            case 'periods':    renderPeriodsChart();              break;
            case 'efficiency': renderEfficiencyScatterChart();    break;
            case 'compare':    renderCompareChart();              break;
        }
    }


    // ── Pie de página ─────────────────────────────────────────────────────────

    function updateCreditDate() {
        const el = document.getElementById('entDatePlaceholder');
        if (!el) return;
        if (!idsFileDate && !statsFileDate) { el.textContent = t().credit_no_data; return; }
        const d = (idsFileDate && statsFileDate)
            ? (idsFileDate > statsFileDate ? idsFileDate : statsFileDate)
            : (idsFileDate || statsFileDate);
        const wanted = { es:'es-ES', eu:'eu-ES', en:'en-GB' }[localStorage.getItem('language') || 'es'] || 'es-ES';
        const locale = Intl.DateTimeFormat.supportedLocalesOf([wanted]).length ? wanted : 'es-ES';
        el.textContent = d.toLocaleDateString(locale, { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
    }


    // ── Cambio de idioma ──────────────────────────────────────────────────────

    function onLanguageChange() {
        if (allEntrenadores.length) {
            renderTable(allEntrenadores);
            updateCurrentChart();
        } else {
            const body = document.getElementById('entTableBody');
            if (body) body.innerHTML = `<tr><td colspan="10">${t().table_empty_initial}</td></tr>`;
        }
        updateCreditDate();
    }


    // ── Init ──────────────────────────────────────────────────────────────────

    function init() {
        const csvIds   = document.getElementById('csvEntrenadoresIds');
        const csvStats = document.getElementById('csvEntrenadoresStats');

        if (csvIds && !csvIds.dataset.entBound) {
            csvIds.dataset.entBound = '1';
            csvIds.addEventListener('change', function (e) {
                const file = e.target.files[0]; if (!file) return;
                idsFileDate = new Date(file.lastModified);
                const reader = new FileReader();
                reader.onload = ev => {
                    const parsed = parseEntrenadorIdsCSV(ev.target.result);
                    idsById   = parsed.byId;
                    idsByTeam = parsed.byTeam;
                    const s = document.getElementById('entIdsFileStatus');
                    s.textContent = `✓ ${file.name}`;
                    s.classList.add('loaded');
                    updateCreditDate();
                    rebuildAndRender();
                };
                reader.readAsText(file, 'UTF-8');
            });
        }

        if (csvStats && !csvStats.dataset.entBound) {
            csvStats.dataset.entBound = '1';
            csvStats.addEventListener('change', function (e) {
                const file = e.target.files[0]; if (!file) return;
                statsFileDate = new Date(file.lastModified);
                const reader = new FileReader();
                reader.onload = ev => {
                    const parsed = parseEntrenadorStatsCSV(ev.target.result);
                    if (!parsed.length) return;
                    rawStatsList = parsed;
                    selectedIds.clear();
                    const s = document.getElementById('entStatsFileStatus');
                    s.textContent = `✓ ${file.name}`;
                    s.classList.add('loaded');
                    updateCreditDate();
                    rebuildAndRender();
                };
                reader.readAsText(file, 'UTF-8');
            });
        }

        updateCreditDate();
        applyTranslationsToDOM();
    }


    // ── API pública ───────────────────────────────────────────────────────────

    return {
        init,
        onLanguageChange,
        sortTable: (key, th) => {
            if (currentSortKey === key) sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
            else { currentSortKey = key; sortDirection = key === 'rankTotal' || key === 'fantasyTeam' || key === 'managerName' ? 'asc' : 'desc'; }
            saveState();
            sortData(allEntrenadores, currentSortKey, sortDirection);
            renderTable(allEntrenadores);
            document.querySelectorAll('#entTable th[onclick]').forEach(t => t.removeAttribute('aria-sort'));
            th.setAttribute('aria-sort', sortDirection === 'asc' ? 'ascending' : 'descending');
        },
        switchChart: (type, btn) => {
            currentChart = type;
            document.querySelectorAll('#module-entrenadores .chart-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            updateCurrentChart();
        },
        clearChartBtn: () => {
            clearChart();
            document.querySelectorAll('#module-entrenadores .chart-tab').forEach(b => b.classList.remove('active'));
            currentChart = '';
        },
        downloadChartImage: () => {
            if (!chartInstance) { alert(t().alert_no_chart); return; }
            const date = new Date().toLocaleDateString('es-ES').replace(/\//g, '-');
            const tmp  = renderChartForExport(chartInstance);
            const a = document.createElement('a');
            a.href     = tmp.toDataURL('image/png');
            a.download = `Grafico_Entrenadores_${currentChart}_${date}.png`;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
        },
    };
})();

window.initEntrenadores = () => Entrenadores.init();
