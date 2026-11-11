// ==UserScript==
// @name         Patreon Downloader & Offline Gallery
// @namespace    https://patreon.com/
// @version      1.4.0
// @description  Stahuje posty, plná rozlišení obrázků, přílohy a vytváří offline HTML galerii s moderním lightboxem ve stylu Patreonu.
// @author       Kamdar
// @match        https://www.patreon.com/*
// @icon         https://www.patreon.com/favicon.ico
// @grant        GM_download
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      patreon.com
// @connect      patreonusercontent.com
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // =========================================================================
    // 1. KONFIGURACE A STAV
    // =========================================================================
    const STATE = {
        isRunning: false,
        isPaused: false,
        shouldStop: false,
        creatorName: '',
        baseFolder: '',
        initialDownloadedIds: new Set(),
        processedInCurrentSession: new Set(),
        galleryCatalog: [],
        stats: {
            newPosts: 0,
            skippedDuplicates: 0,
            skippedSmallVariants: 0,
            imagesDownloaded: 0,
            attachmentsDownloaded: 0,
            postsDownloaded: 0,
            errors: 0
        }
    };

    const SETTINGS_KEY = 'patreon_dl_settings';
    const settings = Object.assign({
        dlImages: true,
        dlAttachments: true,
        dlPostsHtml: true,
        generateGallery: true,
        preferLargeVariants: true,
        delayBetweenPosts: 1.5,
        customFolder: ''
    }, GM_getValue(SETTINGS_KEY, {}));

    function saveSettings() {
        GM_setValue(SETTINGS_KEY, settings);
    }

    // =========================================================================
    // 2. DETEKCE UMĚLCE A HISTORIE STAŽENÉHO
    // =========================================================================
    function getCreatorInfo() {
        const folderInput = document.getElementById('pdl-folder');
        if (folderInput && folderInput.value.trim()) {
            const val = folderInput.value.trim();
            const parts = val.split(/[\\/]/).filter(Boolean);
            if (parts.length > 0) {
                STATE.baseFolder = val;
                STATE.creatorName = parts[parts.length - 1];
                return STATE.creatorName;
            }
        }

        const pathSegments = window.location.pathname.split('/').filter(Boolean);
        let detected = '';

        for (let seg of pathSegments) {
            if (['cw', 'c', 'm', 'collection', 'posts', 'home', 'messages', 'settings', 'notifications', 'login', 'signup'].includes(seg.toLowerCase())) {
                continue;
            }
            detected = seg;
            break;
        }

        if (!detected) {
            const brandEl = document.querySelector('[data-tag="creator-page-title"], [data-tag="creator-name"]');
            if (brandEl && brandEl.textContent.trim()) {
                const text = brandEl.textContent.trim();
                if (!['recent posts', 'posts', 'home'].includes(text.toLowerCase())) {
                    detected = text;
                }
            }
        }

        STATE.creatorName = sanitizeFileName(detected || 'creator');
        STATE.baseFolder = settings.customFolder.trim() || `Patreon/${STATE.creatorName}`;
        return STATE.creatorName;
    }

    function getHistoryStorageKey() {
        return 'patreon_history_' + (STATE.creatorName || 'default');
    }

    function loadDownloadedHistory() {
        const hist = GM_getValue(getHistoryStorageKey(), []);
        return new Set(hist.map(String));
    }

    function saveToDownloadedHistory(postId) {
        const set = loadDownloadedHistory();
        set.add(String(postId));
        GM_setValue(getHistoryStorageKey(), Array.from(set));
    }

    function clearDownloadedHistory() {
        getCreatorInfo();
        if (confirm(`Opravdu chcete vymazat historii stažených postů pro "${STATE.creatorName}"? Při dalším spuštění se stáhnou všechny položky znovu.`)) {
            GM_setValue(getHistoryStorageKey(), []);
            STATE.initialDownloadedIds.clear();
            STATE.processedInCurrentSession.clear();
            STATE.stats.skippedDuplicates = 0;
            STATE.stats.skippedSmallVariants = 0;
            updateHUDStats();
            addLog(`Historie stažených položek pro "${STATE.creatorName}" byla vymazána.`, 'warn');
        }
    }

    // =========================================================================
    // 3. STYLY A GRAFICKÉ ROZHRANÍ (HUD)
    // =========================================================================
    const HUD_CSS = `
    #patreon-dl-hud {
        position: fixed;
        bottom: 24px;
        right: 24px;
        width: 360px;
        max-width: 90vw;
        background: #141518;
        color: #f3f4f6;
        border: 1px solid #2d2f36;
        border-radius: 14px;
        box-shadow: 0 12px 36px rgba(0,0,0,0.55);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        font-size: 13px;
        z-index: 99999999;
        overflow: hidden;
        transition: transform 0.25s ease, opacity 0.25s ease;
    }
    #patreon-dl-hud.minimized {
        transform: translateY(calc(100% - 46px));
    }
    #patreon-dl-hud * {
        box-sizing: border-box;
    }
    .pdl-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        background: #1b1c22;
        border-bottom: 1px solid #2d2f36;
        cursor: pointer;
        user-select: none;
    }
    .pdl-header h3 {
        margin: 0;
        font-size: 14px;
        font-weight: 700;
        display: flex;
        align-items: center;
        gap: 8px;
        color: #ff424d;
    }
    .pdl-header-btns {
        display: flex;
        gap: 8px;
    }
    .pdl-btn-icon {
        background: transparent;
        border: none;
        color: #9ca3af;
        cursor: pointer;
        padding: 4px;
        border-radius: 4px;
        font-size: 14px;
    }
    .pdl-btn-icon:hover {
        color: #fff;
        background: #2d2f36;
    }
    .pdl-body {
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        max-height: 80vh;
        overflow-y: auto;
    }
    .pdl-checkbox-group {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        background: #1a1b20;
        padding: 10px;
        border-radius: 8px;
        border: 1px solid #262830;
    }
    .pdl-checkbox-label {
        display: flex;
        align-items: center;
        gap: 6px;
        cursor: pointer;
        font-size: 12px;
        color: #d1d5db;
    }
    .pdl-checkbox-label input[type="checkbox"] {
        accent-color: #ff424d;
        width: 15px;
        height: 15px;
        cursor: pointer;
    }
    .pdl-input-group {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }
    .pdl-input-group label {
        font-size: 11px;
        color: #9ca3af;
        text-transform: uppercase;
        font-weight: 600;
        letter-spacing: 0.5px;
    }
    .pdl-input {
        background: #1c1d24;
        border: 1px solid #323540;
        border-radius: 6px;
        padding: 8px 10px;
        color: #fff;
        font-size: 12px;
        outline: none;
    }
    .pdl-input:focus {
        border-color: #ff424d;
    }
    .pdl-actions {
        display: flex;
        gap: 8px;
        margin-top: 4px;
    }
    .pdl-btn {
        flex: 1;
        padding: 10px;
        border: none;
        border-radius: 8px;
        font-weight: 700;
        font-size: 12px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        transition: all 0.2s;
    }
    .pdl-btn-primary {
        background: #ff424d;
        color: #fff;
    }
    .pdl-btn-primary:hover {
        background: #e0323c;
    }
    .pdl-btn-secondary {
        background: #2d2f38;
        color: #e5e7eb;
    }
    .pdl-btn-secondary:hover {
        background: #3b3e4a;
    }
    .pdl-btn-danger {
        background: #ef444422;
        color: #ef4444;
        border: 1px solid #ef444455;
    }
    .pdl-btn-danger:hover {
        background: #ef444444;
    }
    .pdl-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }
    .pdl-progress-box {
        background: #1a1b20;
        border: 1px solid #262830;
        border-radius: 8px;
        padding: 10px;
        display: flex;
        flex-direction: column;
        gap: 6px;
    }
    .pdl-progress-bar-bg {
        width: 100%;
        height: 6px;
        background: #2b2d38;
        border-radius: 3px;
        overflow: hidden;
    }
    .pdl-progress-bar-fill {
        height: 100%;
        width: 0%;
        background: linear-gradient(90deg, #ff424d, #ff7680);
        transition: width 0.3s ease;
    }
    .pdl-status-text {
        font-size: 12px;
        color: #9ca3af;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .pdl-stats-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 6px;
        font-size: 11px;
        text-align: center;
    }
    .pdl-stat-item {
        background: #20222a;
        padding: 6px 4px;
        border-radius: 6px;
        border: 1px solid #2b2e3a;
    }
    .pdl-stat-val {
        font-weight: 700;
        color: #fff;
        font-size: 13px;
    }
    .pdl-stat-lbl {
        color: #8b8f9e;
        font-size: 10px;
    }
    .pdl-logs {
        background: #0d0e11;
        border: 1px solid #23252c;
        border-radius: 6px;
        padding: 8px;
        font-family: monospace;
        font-size: 11px;
        max-height: 120px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 4px;
    }
    .pdl-log-line {
        line-height: 1.3;
        word-break: break-all;
    }
    .pdl-log-info { color: #9ca3af; }
    .pdl-log-success { color: #10b981; }
    .pdl-log-warn { color: #f59e0b; }
    .pdl-log-error { color: #ef4444; }
    `;

    let hudEl = null;

    function createHUD() {
        if (document.getElementById('patreon-dl-hud')) return;

        GM_addStyle(HUD_CSS);
        getCreatorInfo();

        hudEl = document.createElement('div');
        hudEl.id = 'patreon-dl-hud';
        hudEl.innerHTML = `
            <div class="pdl-header" id="pdl-header-toggle">
                <h3>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="15.5" cy="8.5" r="5.5"/>
                        <rect x="3" y="3" width="4" height="18" rx="1"/>
                    </svg>
                    Patreon Downloader
                </h3>
                <div class="pdl-header-btns">
                    <button class="pdl-btn-icon" id="pdl-btn-reset-hist" title="Resetovat historii staženého pro tohoto tvůrce">🔄</button>
                    <button class="pdl-btn-icon" id="pdl-btn-toggle" title="Minimalizovat/Maximalizovat">▾</button>
                </div>
            </div>
            <div class="pdl-body">
                <div class="pdl-checkbox-group">
                    <label class="pdl-checkbox-label">
                        <input type="checkbox" id="pdl-opt-img" ${settings.dlImages ? 'checked' : ''}>
                        Obrázky (plné)
                    </label>
                    <label class="pdl-checkbox-label">
                        <input type="checkbox" id="pdl-opt-att" ${settings.dlAttachments ? 'checked' : ''}>
                        Přílohy
                    </label>
                    <label class="pdl-checkbox-label">
                        <input type="checkbox" id="pdl-opt-post" ${settings.dlPostsHtml ? 'checked' : ''}>
                        Posty (HTML)
                    </label>
                    <label class="pdl-checkbox-label">
                        <input type="checkbox" id="pdl-opt-gallery" ${settings.generateGallery ? 'checked' : ''}>
                        HTML Galerie
                    </label>
                </div>

                <div style="background:#1a1b20; padding:8px 10px; border-radius:8px; border:1px solid #262830;">
                    <label class="pdl-checkbox-label">
                        <input type="checkbox" id="pdl-opt-prefer-large" ${settings.preferLargeVariants ? 'checked' : ''}>
                        Ignorovat (small), když existuje (large)
                    </label>
                </div>

                <div class="pdl-input-group">
                    <label>Umístění (v Downloads):</label>
                    <input type="text" class="pdl-input" id="pdl-folder" value="${STATE.baseFolder}">
                </div>

                <div class="pdl-actions">
                    <button class="pdl-btn pdl-btn-primary" id="pdl-btn-start">▶ Spustit</button>
                    <button class="pdl-btn pdl-btn-secondary" id="pdl-btn-pause" disabled>⏸ Pozastavit</button>
                    <button class="pdl-btn pdl-btn-danger" id="pdl-btn-stop" disabled>⏹ Zastavit</button>
                </div>

                <div class="pdl-progress-box">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span class="pdl-status-text" id="pdl-status">Připraven ke spuštění</span>
                        <span style="font-size:11px; font-weight:700; color:#fff;" id="pdl-percent">0%</span>
                    </div>
                    <div class="pdl-progress-bar-bg">
                        <div class="pdl-progress-bar-fill" id="pdl-progress-bar"></div>
                    </div>
                </div>

                <div class="pdl-stats-grid">
                    <div class="pdl-stat-item">
                        <div class="pdl-stat-val" id="pdl-stat-new">0</div>
                        <div class="pdl-stat-lbl">Nové posty</div>
                    </div>
                    <div class="pdl-stat-item">
                        <div class="pdl-stat-val" id="pdl-stat-skip">0</div>
                        <div class="pdl-stat-lbl">Přeskočeno</div>
                    </div>
                    <div class="pdl-stat-item">
                        <div class="pdl-stat-val" id="pdl-stat-files">0</div>
                        <div class="pdl-stat-lbl">Souborů</div>
                    </div>
                </div>

                <div class="pdl-logs" id="pdl-logs">
                    <div class="pdl-log-line pdl-log-info">[Systém] Skript připraven (v1.4.0). Klikněte na Spustit.</div>
                </div>
            </div>
        `;

        document.body.appendChild(hudEl);
        bindHUDEvents();
    }

    function bindHUDEvents() {
        const toggleBtn = document.getElementById('pdl-btn-toggle');
        const header = document.getElementById('pdl-header-toggle');
        const startBtn = document.getElementById('pdl-btn-start');
        const pauseBtn = document.getElementById('pdl-btn-pause');
        const stopBtn = document.getElementById('pdl-btn-stop');
        const resetHistBtn = document.getElementById('pdl-btn-reset-hist');

        function toggleMinimize() {
            hudEl.classList.toggle('minimized');
            toggleBtn.textContent = hudEl.classList.contains('minimized') ? '▴' : '▾';
        }

        header.addEventListener('click', (e) => {
            if (e.target.closest('.pdl-btn-icon')) return;
            toggleMinimize();
        });
        toggleBtn.addEventListener('click', toggleMinimize);
        resetHistBtn.addEventListener('click', clearDownloadedHistory);

        ['dlImages', 'dlAttachments', 'dlPostsHtml', 'generateGallery', 'preferLargeVariants'].forEach(key => {
            const elId = key === 'dlImages' ? 'pdl-opt-img' :
                         key === 'dlAttachments' ? 'pdl-opt-att' :
                         key === 'dlPostsHtml' ? 'pdl-opt-post' :
                         key === 'preferLargeVariants' ? 'pdl-opt-prefer-large' : 'pdl-opt-gallery';
            const chk = document.getElementById(elId);
            if (chk) {
                chk.addEventListener('change', () => {
                    settings[key] = chk.checked;
                    saveSettings();
                });
            }
        });

        document.getElementById('pdl-folder').addEventListener('input', (e) => {
            settings.customFolder = e.target.value.trim();
            saveSettings();
            getCreatorInfo();
        });

        startBtn.addEventListener('click', () => {
            if (!STATE.isRunning) {
                startScraping();
            } else if (STATE.isPaused) {
                resumeScraping();
            }
        });

        pauseBtn.addEventListener('click', () => {
            if (STATE.isRunning && !STATE.isPaused) {
                pauseScraping();
            }
        });

        stopBtn.addEventListener('click', () => {
            if (STATE.isRunning) {
                stopScraping();
            }
        });
    }

    function updateHUDStats() {
        document.getElementById('pdl-stat-new').textContent = STATE.stats.newPosts;
        document.getElementById('pdl-stat-skip').textContent = STATE.stats.skippedDuplicates + STATE.stats.skippedSmallVariants;
        document.getElementById('pdl-stat-files').textContent =
            STATE.stats.imagesDownloaded + STATE.stats.attachmentsDownloaded + STATE.stats.postsDownloaded;
    }

    function updateHUDStatus(text, percent = null) {
        document.getElementById('pdl-status').textContent = text;
        if (percent !== null) {
            percent = Math.min(100, Math.max(0, Math.round(percent)));
            document.getElementById('pdl-percent').textContent = percent + '%';
            document.getElementById('pdl-progress-bar').style.width = percent + '%';
        }
    }

    function addLog(msg, type = 'info') {
        const logsContainer = document.getElementById('pdl-logs');
        if (!logsContainer) return;
        const line = document.createElement('div');
        line.className = `pdl-log-line pdl-log-${type}`;
        const time = new Date().toLocaleTimeString();
        line.textContent = `[${time}] ${msg}`;
        logsContainer.appendChild(line);
        logsContainer.scrollTop = logsContainer.scrollHeight;
    }

    // =========================================================================
    // 4. POMOCNÉ FUNKCE
    // =========================================================================
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function sanitizeFileName(name) {
        return (name || 'file')
            .replace(/[\\/:*?"<>|]/g, '_')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function downloadFileGM(url, subpath) {
        return new Promise((resolve) => {
            try {
                GM_download({
                    url: url,
                    name: subpath,
                    saveAs: false,
                    onload: () => resolve({ ok: true }),
                    onerror: (err) => {
                        console.warn('GM_download chyba:', err, url);
                        resolve({ ok: false, error: err });
                    },
                    ontimeout: () => {
                        console.warn('GM_download timeout:', url);
                        resolve({ ok: false, error: 'timeout' });
                    }
                });
            } catch (ex) {
                console.error('Chyba při volání GM_download:', ex);
                resolve({ ok: false, error: ex.message });
            }
        });
    }

    function downloadTextFileGM(content, subpath) {
        const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(content);
        return downloadFileGM(dataUrl, subpath);
    }

    function extractPostId(url) {
        if (!url) return null;
        const match = url.match(/-(\d+)(?:\?.*)?$/) || url.match(/\/posts\/.*?(\d+)(?:\?.*)?$/);
        return match ? match[1] : null;
    }

    // =========================================================================
    // 5. ZÍSKÁNÍ UNIKÁTNÍCH POSTŮ Z DOMU + SMALL/LARGE VARIANTY
    // =========================================================================
    function isSmallVariant(title) {
        return /[\(\[\{]\s*small\s*[\)\]\}]|\b(?:small)\s*$/i.test(title);
    }

    function isLargeVariant(title) {
        return /[\(\[\{]\s*large\s*[\)\]\}]|\b(?:large)\s*$/i.test(title);
    }

    function getBaseTitle(title) {
        return title
            .replace(/[\(\[\{]\s*(?:small|large)\s*[\)\]\}]/gi, '')
            .replace(/\b(?:small|large)\s*$/gi, '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }

    function getUniquePostsFromPage() {
        const links = Array.from(document.querySelectorAll('a[data-tag="post-title"], a[data-tag="post-published-at"], a[href*="/posts/"]'));
        const unique = [];
        const seenInDOM = new Set();

        for (const a of links) {
            if (!a.href) continue;
            const cleanUrl = a.href.split('?')[0];
            const postId = extractPostId(cleanUrl);
            if (!postId) continue;

            if (cleanUrl.endsWith('/posts') || cleanUrl.endsWith('/posts/')) continue;

            if (!seenInDOM.has(postId)) {
                seenInDOM.add(postId);
                const title = (a.textContent || '').trim();
                unique.push({ id: postId, url: cleanUrl, title: title });
            }
        }

        // Pokud je zapnuto ignorování (small) při existenci (large):
        if (settings.preferLargeVariants) {
            // Seskupíme tituly
            const baseMap = new Map();
            unique.forEach(p => {
                const base = getBaseTitle(p.title);
                if (!baseMap.has(base)) baseMap.set(base, []);
                baseMap.get(base).push(p);
            });

            unique.forEach(p => {
                const base = getBaseTitle(p.title);
                const group = baseMap.get(base) || [];
                const hasLargeInGroup = group.some(x => isLargeVariant(x.title));
                if (isSmallVariant(p.title) && hasLargeInGroup) {
                    p.skipSmall = true;
                }
            });
        }

        return unique;
    }

    // =========================================================================
    // 6. HLAVNÍ CYKLUS STAHOVÁNÍ
    // =========================================================================
    async function startScraping() {
        getCreatorInfo();
        STATE.isRunning = true;
        STATE.isPaused = false;
        STATE.shouldStop = false;

        STATE.initialDownloadedIds = loadDownloadedHistory();
        STATE.processedInCurrentSession.clear();

        document.getElementById('pdl-btn-start').disabled = true;
        document.getElementById('pdl-btn-pause').disabled = false;
        document.getElementById('pdl-btn-stop').disabled = false;

        addLog(`Spouštím stahování pro tvůrce "${STATE.creatorName}"...`, 'info');
        updateHUDStatus('Inicializuji proces...');

        while (STATE.isRunning && !STATE.shouldStop) {
            if (STATE.isPaused) {
                await sleep(500);
                continue;
            }

            const uniquePosts = getUniquePostsFromPage();
            addLog(`Nalezeno celkem ${uniquePosts.length} postů v aktuálním zobrazení.`, 'info');

            let newlyProcessedCount = 0;
            let alreadyDownloadedCount = 0;

            for (let i = 0; i < uniquePosts.length; i++) {
                if (STATE.shouldStop) break;
                while (STATE.isPaused) await sleep(500);

                const post = uniquePosts[i];

                if (STATE.processedInCurrentSession.has(post.id)) {
                    continue;
                }

                // Přeskočení 'small' varianty, pokud existuje 'large'
                if (settings.preferLargeVariants && post.skipSmall) {
                    STATE.processedInCurrentSession.add(post.id);
                    STATE.stats.skippedSmallVariants++;
                    updateHUDStats();
                    addLog(`Přeskakuji variantu "small" postu "${post.title}", nalezena varianta "large".`, 'info');
                    continue;
                }

                if (STATE.initialDownloadedIds.has(post.id)) {
                    STATE.processedInCurrentSession.add(post.id);
                    STATE.stats.skippedDuplicates++;
                    alreadyDownloadedCount++;
                    updateHUDStats();
                    continue;
                }

                newlyProcessedCount++;
                STATE.stats.newPosts++;
                STATE.processedInCurrentSession.add(post.id);
                updateHUDStats();
                updateHUDStatus(`Zpracovávám nový post ID: ${post.id}...`);

                try {
                    await processPost(post.url, post.id);
                    saveToDownloadedHistory(post.id);
                } catch (err) {
                    console.error('Chyba zpracování postu:', err);
                    addLog(`Chyba postu ${post.id}: ${err.message}`, 'error');
                }

                await sleep(settings.delayBetweenPosts * 1000);
            }

            if (STATE.shouldStop) break;

            if (uniquePosts.length > 0 && newlyProcessedCount === 0 && alreadyDownloadedCount === uniquePosts.length) {
                addLog('Všechny načtené posty jsou již v historii stažené. Ukončuji stahování.', 'success');
                break;
            }

            updateHUDStatus('Načítám další posty (Load more / Scroll)...');
            addLog('Hledám tlačítko "Load more" nebo roluji pro načtení dalších postů...', 'info');

            const loadedMore = await triggerLoadMore();
            if (!loadedMore) {
                addLog('Dosáhli jsme konce seznamu postů (žádné další položky se nenačetly).', 'info');
                break;
            }
        }

        await finishScraping();
    }

    function pauseScraping() {
        STATE.isPaused = true;
        document.getElementById('pdl-btn-start').disabled = false;
        document.getElementById('pdl-btn-pause').disabled = true;
        updateHUDStatus('Stahování pozastaveno');
        addLog('Stahování pozastaveno uživatelem.', 'warn');
    }

    function resumeScraping() {
        STATE.isPaused = false;
        document.getElementById('pdl-btn-start').disabled = true;
        document.getElementById('pdl-btn-pause').disabled = false;
        updateHUDStatus('Pokračuji ve stahování...');
        addLog('Stahování obnoveno.', 'info');
    }

    function stopScraping() {
        STATE.shouldStop = true;
        STATE.isRunning = false;
        updateHUDStatus('Zastavuji proces...');
        addLog('Zastavování stahování...', 'warn');
    }

    async function finishScraping() {
        STATE.isRunning = false;
        document.getElementById('pdl-btn-start').disabled = false;
        document.getElementById('pdl-btn-pause').disabled = true;
        document.getElementById('pdl-btn-stop').disabled = true;

        if (settings.generateGallery && STATE.galleryCatalog.length > 0) {
            updateHUDStatus('Generuji offline HTML galerii...');
            addLog('Vytvářím a ukládám gallery.html...', 'info');
            await generateAndSaveGallery();
        }

        updateHUDStatus('Hotovo!', 100);
        addLog(`Dokončeno! Nových: ${STATE.stats.newPosts}, Přeskočeno (historie): ${STATE.stats.skippedDuplicates}, Přeskočeno (small varianty): ${STATE.stats.skippedSmallVariants}, Souborů: ${STATE.stats.imagesDownloaded + STATE.stats.attachmentsDownloaded + STATE.stats.postsDownloaded}`, 'success');
    }

    // =========================================================================
    // 7. SPOLEHLIVÉ NAČÍTÁNÍ DALŠÍCH STRÁNEK (LOAD MORE & INFINITE SCROLL)
    // =========================================================================
    async function triggerLoadMore() {
        const startCount = getUniquePostsFromPage().length;

        const clickables = Array.from(document.querySelectorAll('button, a, div[role="button"], span[role="button"], [data-tag*="load-more"]'));
        const loadMoreBtn = clickables.find(el => {
            const txt = (el.textContent || '').trim().toLowerCase();
            const aria = (el.getAttribute('aria-label') || '').toLowerCase();
            const tag = (el.getAttribute('data-tag') || '').toLowerCase();

            const isLoadMore = txt === 'load more' || txt.includes('load more') || txt.includes('načíst další') ||
                               aria.includes('load more') || aria.includes('loading more') ||
                               tag.includes('load-more');
            const isComment = txt.includes('comment') || txt.includes('reply') || txt.includes('replies');
            return isLoadMore && !isComment;
        });

        if (loadMoreBtn && loadMoreBtn.offsetParent !== null) {
            addLog('Nalezeno tlačítko "Load more" – klikám...', 'info');
            loadMoreBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await sleep(400);
            loadMoreBtn.click();
        }

        const spinner = document.querySelector('svg[aria-label*="loading more"], [aria-label*="loading posts"], .CmFNoG_root');
        if (spinner && spinner.offsetParent !== null) {
            spinner.scrollIntoView({ behavior: 'smooth', block: 'end' });
        } else {
            window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
        }

        if (document.scrollingElement) {
            document.scrollingElement.scrollTop = document.scrollingElement.scrollHeight;
        }
        document.body.scrollTop = document.body.scrollHeight;
        window.dispatchEvent(new Event('scroll'));
        window.dispatchEvent(new Event('wheel'));

        for (let t = 1; t <= 20; t++) {
            await sleep(500);
            const currentCount = getUniquePostsFromPage().length;
            if (currentCount > startCount) {
                addLog(`Úspěšně načteno dalších ${currentCount - startCount} postů (celkem na stránce: ${currentCount}).`, 'success');
                return true;
            }
            if (t % 4 === 0) {
                window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
                window.dispatchEvent(new Event('scroll'));
            }
        }

        return false;
    }

    // =========================================================================
    // 8. EXTRAKCE KOMENTÁŘŮ (JSON DATA + REST API + DOM)
    // =========================================================================
    async function extractPostComments(postId, htmlText, doc) {
        const comments = [];
        const seenBodies = new Set();

        if (htmlText) {
            const usersMap = {};
            const userRegex = /\{\\"id\\":\\"(\d+)\\",\\"type\\":\\"user\\",\\"attributes\\":\{([^}]+?)\}/g;
            let uMatch;
            while ((uMatch = userRegex.exec(htmlText)) !== null) {
                const uid = uMatch[1];
                const attrs = uMatch[2];
                const nameMatch = attrs.match(/\\"full_name\\":\\"([^"\\]+)\\"/);
                const imgMatch = attrs.match(/\\"image_url\\":\\"([^"\\]+)\\"/);
                const name = nameMatch ? nameMatch[1] : 'Uživatel';
                const img = imgMatch ? imgMatch[1].replace(/\\\//g, '/') : '';
                usersMap[uid] = { name, avatar: img };
            }

            const commentRegex = /\{\\"id\\":\\"(\d+)\\",\\"type\\":\\"comment\\",\\"attributes\\":\{([^}]+?)\}(?:,\\"relationships\\":\{([^}]+?)\})?/g;
            let cMatch;
            while ((cMatch = commentRegex.exec(htmlText)) !== null) {
                const attrs = cMatch[2];
                const rels = cMatch[3] || '';

                const bodyMatch = attrs.match(/\\"body\\":\\"([^"\\]+)\\"/);
                if (!bodyMatch) continue;

                let body = bodyMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
                try {
                    body = decodeURIComponent(JSON.parse(`"${bodyMatch[1]}"`));
                } catch (e) {}

                if (!body || seenBodies.has(body)) continue;
                seenBodies.add(body);

                const uidMatch = rels.match(/\\"commenter\\":\{.*?\\"id\\":\\"(\d+)\\"/);
                const uid = uidMatch ? uidMatch[1] : null;

                const author = (uid && usersMap[uid]) ? usersMap[uid].name : 'Uživatel';
                const avatar = (uid && usersMap[uid]) ? usersMap[uid].avatar : '';

                comments.push({ author, body, avatar });
            }
        }

        if (doc) {
            const commentRows = doc.querySelectorAll('[data-tag="comment-row"]');
            commentRows.forEach(row => {
                const author = row.querySelector('[data-tag="commenter-name"] span, [data-tag="commenter-name"], button')?.textContent?.trim() || 'Uživatel';
                const bodyEl = row.querySelector('[data-tag="comment-body"] p, [data-tag="comment-body"]');
                const body = bodyEl ? bodyEl.textContent.trim() : '';
                const avatar = row.querySelector('[data-tag="comment-avatar-wrapper"] img, img')?.src || '';
                if (body && !seenBodies.has(body)) {
                    seenBodies.add(body);
                    comments.push({ author, body, avatar });
                }
            });
        }

        if (comments.length === 0 && postId) {
            try {
                const apiUrl = `https://www.patreon.com/api/posts/${postId}/comments?include=commenter&page%5Bcount%5D=50`;
                const apiRes = await fetch(apiUrl, { credentials: 'include' });
                if (apiRes.ok) {
                    const apiData = await apiRes.json();
                    const includedUsers = {};
                    if (apiData.included && Array.isArray(apiData.included)) {
                        apiData.included.forEach(inc => {
                            if (inc.type === 'user') {
                                includedUsers[inc.id] = {
                                    name: inc.attributes?.full_name || 'Uživatel',
                                    avatar: inc.attributes?.image_url || ''
                                };
                            }
                        });
                    }
                    if (apiData.data && Array.isArray(apiData.data)) {
                        apiData.data.forEach(item => {
                            if (item.type === 'comment' && item.attributes?.body) {
                                const body = item.attributes.body;
                                if (!seenBodies.has(body)) {
                                    seenBodies.add(body);
                                    const commenterId = item.relationships?.commenter?.data?.id;
                                    const user = commenterId ? includedUsers[commenterId] : null;
                                    comments.push({
                                        author: user ? user.name : 'Uživatel',
                                        body: body,
                                        avatar: user ? user.avatar : ''
                                    });
                                }
                            }
                        });
                    }
                }
            } catch (err) {
                console.warn('API dotaz na komentáře selhal:', err);
            }
        }

        return comments;
    }

    // =========================================================================
    // 9. ZPRACOVÁNÍ JEDNOTLIVÉHO POSTU
    // =========================================================================
    async function processPost(postUrl, postId) {
        addLog(`Načítám detail postu: ${postUrl}`, 'info');

        const response = await fetch(postUrl, { credentials: 'include' });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} při načítání ${postUrl}`);
        }
        const htmlText = await response.text();

        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlText, 'text/html');

        // 1. Titulek
        let title = 'Post_' + postId;
        const titleEl = doc.querySelector('h1, [data-tag="post-title"]');
        if (titleEl && titleEl.textContent.trim()) {
            title = titleEl.textContent.trim();
        } else {
            const docTitle = doc.querySelector('title');
            if (docTitle) {
                title = docTitle.textContent.replace(/\|.*$/, '').trim();
            }
        }
        const cleanTitle = sanitizeFileName(title);

        // 2. Datum publikace
        let isoDate = '';
        const metaDate = doc.querySelector('meta[property="article:published_time"]')?.content;
        if (metaDate) {
            const m = metaDate.match(/^(\d{4}-\d{2}-\d{2})/);
            if (m) isoDate = m[1];
        }

        if (!isoDate) {
            const jsonIso = htmlText.match(/"published_at"\s*:\s*"(\d{4}-\d{2}-\d{2})/);
            if (jsonIso) isoDate = jsonIso[1];
        }

        let humanDate = '';
        const dateEl = doc.querySelector('.lMmGsG_creatorInfo span#track-click, [class*="creatorInfo"] span#track-click, .lMmGsG_timestampRow span#track-click, span#track-click, [data-tag="post-published-at"]');
        if (dateEl && dateEl.textContent.trim()) {
            humanDate = dateEl.textContent.trim();
        }

        const displayDate = humanDate ? (isoDate ? `${humanDate} (${isoDate})` : humanDate) : (isoDate || 'Neznámé datum');
        const datePrefix = isoDate || (humanDate ? sanitizeFileName(humanDate.replace(/[\s,]+/g, '_')) : 'Date');

        // 3. Tagy – DEDUPLIKOVÁNO
        const rawTags = Array.from(doc.querySelectorAll('[data-tag="post-tag"] p, [data-tag="post-tag"]'))
            .map(el => el.textContent.trim())
            .filter(t => t.length > 0 && t !== '•');

        const seenTags = new Set();
        const tags = [];
        rawTags.forEach(t => {
            const clean = t.replace(/^#/, '').trim();
            const key = clean.toLowerCase();
            if (clean && !seenTags.has(key)) {
                seenTags.add(key);
                tags.push(clean);
            }
        });

        // 4. Komentáře
        const comments = await extractPostComments(postId, htmlText, doc);

        // 5. Obsah textu postu
        const contentEl = doc.querySelector('.patreon-post-content, [data-tag="post-content"], .Bg7dxW_postContent');
        const contentHtml = contentEl ? contentEl.innerHTML : '';

        // 6. Plná rozlišení obrázků:
        const fullImages = new Set();
        const fullTokenRegex = /"(https:\/\/c10\.patreonusercontent\.com\/4\/patreon-media\/p\/post\/[^"]*?eyJwIjoxfQ%3D%3D[^"]*?)"/g;
        let match;
        while ((match = fullTokenRegex.exec(htmlText)) !== null) {
            let cleanUrl = match[1]
                .replace(/\\u0026/g, '&')
                .replace(/\\\//g, '/')
                .replace(/\\/g, '');
            fullImages.add(cleanUrl);
        }

        if (fullImages.size === 0) {
            const galleryImgs = doc.querySelectorAll('img[data-tag="gallery-image"], img.sc-79235ff0-1, .patreon-post-content img');
            galleryImgs.forEach(img => {
                let src = img.getAttribute('src') || img.src;
                if (src && src.includes('patreonusercontent.com') && !src.includes('avatar') && !src.includes('logo')) {
                    fullImages.add(src);
                }
            });
        }

        // 7. Přílohy
        const attachments = [];
        const attLinks = doc.querySelectorAll('a[data-tag="post-attachment-link"], a[href*="/file?h="]');
        attLinks.forEach(a => {
            const fname = sanitizeFileName(a.textContent.trim() || 'attachment');
            const href = a.href;
            if (href) {
                attachments.push({ url: href, name: fname });
            }
        });

        addLog(`Post "${cleanTitle}" (${displayDate}): ${fullImages.size} obrázků, ${attachments.length} příloh, ${comments.length} komentářů, ${tags.length} tagů.`, 'info');

        const postRecord = {
            id: postId,
            url: postUrl,
            title: title,
            date: displayDate,
            dateIso: isoDate,
            tags: tags,
            contentHtml: contentHtml,
            commentsCount: comments.length,
            images: [],
            attachments: []
        };

        // --- STAHOVÁNÍ OBRÁZKŮ ---
        if (settings.dlImages && fullImages.size > 0) {
            let imgIndex = 1;
            for (const imgUrl of fullImages) {
                const extMatch = imgUrl.match(/\.(jpg|jpeg|png|webp|gif)/i);
                const ext = extMatch ? extMatch[1].toLowerCase() : 'jpg';
                const imgFileName = `${datePrefix}_${postId}_img${String(imgIndex).padStart(2, '0')}.${ext}`;
                const relativePath = `${STATE.baseFolder}/images/${imgFileName}`;

                updateHUDStatus(`Stahuji obrázek ${imgIndex}/${fullImages.size} postu...`);
                await downloadFileGM(imgUrl, relativePath);

                postRecord.images.push({
                    fileName: imgFileName,
                    relativePath: `images/${imgFileName}`,
                    origUrl: imgUrl
                });

                STATE.stats.imagesDownloaded++;
                updateHUDStats();
                imgIndex++;
                await sleep(200);
            }
        }

        // --- STAHOVÁNÍ PŘÍLOH ---
        if (settings.dlAttachments && attachments.length > 0) {
            let attIndex = 1;
            for (const att of attachments) {
                const attFileName = `${datePrefix}_${postId}_att_${att.name}`;
                const relativePath = `${STATE.baseFolder}/attachments/${attFileName}`;

                updateHUDStatus(`Stahuji přílohu: ${att.name}...`);
                await downloadFileGM(att.url, relativePath);

                const attRecord = {
                    name: att.name,
                    fileName: attFileName,
                    relativePath: `attachments/${attFileName}`,
                    url: att.url
                };
                postRecord.attachments.push(attRecord);

                if (postRecord.images.length === 0 && /\.(jpg|jpeg|png|webp|gif)$/i.test(att.name)) {
                    postRecord.images.push({
                        fileName: attFileName,
                        relativePath: `attachments/${attFileName}`,
                        origUrl: att.url
                    });
                }

                STATE.stats.attachmentsDownloaded++;
                updateHUDStats();
                attIndex++;
                await sleep(200);
            }
        }

        // --- STAHOVÁNÍ POSTU DO OFFLINE HTML S KOMENTÁŘI ---
        if (settings.dlPostsHtml) {
            const postHtmlFileName = `${datePrefix}_${postId}.html`;
            const postHtmlContent = buildOfflinePostHtml(postRecord, comments);
            const relativePath = `${STATE.baseFolder}/posts/${postHtmlFileName}`;

            updateHUDStatus(`Ukládám offline HTML postu...`);
            await downloadTextFileGM(postHtmlContent, relativePath);

            postRecord.htmlPostPath = `posts/${postHtmlFileName}`;
            STATE.stats.postsDownloaded++;
            updateHUDStats();
        }

        STATE.galleryCatalog.push(postRecord);
        addLog(`Post "${cleanTitle}" byl úspěšně zpracován (${comments.length} komentářů uloženo).`, 'success');
    }

    // =========================================================================
    // 10. GENERÁTOR SAMOSTATNÉHO OFFLINE POSTU (HTML S KOMENTÁŘI)
    // =========================================================================
    function buildOfflinePostHtml(post, comments) {
        return `<!DOCTYPE html>
<html lang="cs">
<head>
    <meta charset="UTF-8">
    <title>${escapeHtml(post.title)} | Patreon Offline</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        :root {
            --bg-color: #0e0e11;
            --surface-color: #18191f;
            --surface-border: #282933;
            --text-main: #f3f4f6;
            --text-muted: #9ca3af;
            --accent-color: #ff424d;
            --accent-hover: #e0323c;
        }
        * { box-sizing: border-box; }
        body {
            background-color: var(--bg-color);
            color: var(--text-main);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            margin: 0;
            padding: 24px 16px;
            display: flex;
            justify-content: center;
        }
        .container {
            max-width: 820px;
            width: 100%;
            display: flex;
            flex-direction: column;
            gap: 20px;
        }
        .nav-back {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            color: var(--text-muted);
            text-decoration: none;
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 8px;
        }
        .nav-back:hover { color: #fff; }
        .post-card {
            background: var(--surface-color);
            border: 1px solid var(--surface-border);
            border-radius: 16px;
            padding: 24px;
            display: flex;
            flex-direction: column;
            gap: 20px;
        }
        .post-title {
            margin: 0;
            font-size: 26px;
            font-weight: 800;
            line-height: 1.3;
            color: #fff;
        }
        .post-meta {
            display: flex;
            align-items: center;
            gap: 16px;
            font-size: 13px;
            color: var(--text-muted);
            border-bottom: 1px solid var(--surface-border);
            padding-bottom: 16px;
            flex-wrap: wrap;
        }
        .tag-pill {
            background: #252630;
            color: #d1d5db;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 12px;
            text-decoration: none;
            border: 1px solid #363845;
            transition: all 0.2s;
        }
        .tag-pill:hover {
            background: var(--accent-color);
            color: #fff;
            border-color: var(--accent-color);
        }
        .post-content {
            font-size: 16px;
            line-height: 1.6;
            color: #e5e7eb;
        }
        .post-gallery {
            display: flex;
            flex-direction: column;
            gap: 16px;
        }
        .post-gallery img {
            width: 100%;
            border-radius: 12px;
            border: 1px solid var(--surface-border);
            background: #000;
        }
        .attachments-box {
            background: #14151a;
            border: 1px solid var(--surface-border);
            border-radius: 12px;
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .attachments-title {
            font-size: 13px;
            font-weight: 700;
            color: var(--text-muted);
            text-transform: uppercase;
        }
        .att-item {
            display: flex;
            align-items: center;
            gap: 10px;
            color: var(--accent-color);
            text-decoration: none;
            font-weight: 600;
            font-size: 14px;
        }
        .att-item:hover { text-decoration: underline; }
        .comments-section {
            display: flex;
            flex-direction: column;
            gap: 16px;
            margin-top: 10px;
        }
        .comments-header {
            font-size: 18px;
            font-weight: 700;
            color: #fff;
            border-bottom: 1px solid var(--surface-border);
            padding-bottom: 10px;
        }
        .comment-item {
            display: flex;
            gap: 12px;
            padding: 12px;
            background: #15161c;
            border-radius: 10px;
            border: 1px solid var(--surface-border);
        }
        .comment-avatar {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            background: #2d2f38;
            flex-shrink: 0;
            object-fit: cover;
        }
        .comment-body-wrapper {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }
        .comment-author {
            font-weight: 700;
            font-size: 13px;
            color: #fff;
        }
        .comment-text {
            font-size: 14px;
            color: #d1d5db;
            line-height: 1.4;
            white-space: pre-wrap;
        }
    </style>
</head>
<body>
    <div class="container">
        <a href="../gallery.html" class="nav-back">← Zpět do galerie</a>
        <div class="post-card">
            <h1 class="post-title">${escapeHtml(post.title)}</h1>
            <div class="post-meta">
                <span>📅 ${escapeHtml(post.date)}</span>
                <span>💬 ${comments.length} komentářů</span>
                <div style="display:flex; gap:6px; flex-wrap:wrap;">
                    ${post.tags.map(t => `<a href="../gallery.html?tag=${encodeURIComponent(t.toLowerCase())}" class="tag-pill" title="Filtrovat galerii podle #${escapeHtml(t)}">#${escapeHtml(t)}</a>`).join('')}
                </div>
            </div>

            ${post.contentHtml ? `<div class="post-content">${post.contentHtml}</div>` : ''}

            ${post.images.length > 0 ? `
                <div class="post-gallery">
                    ${post.images.map(img => `<img src="../${img.relativePath}" onerror="if(this.dataset.orig && this.src!==this.dataset.orig)this.src=this.dataset.orig;" data-orig="${img.origUrl || ''}" alt="Obrázek" loading="lazy">`).join('')}
                </div>
            ` : ''}

            ${post.attachments.length > 0 ? `
                <div class="attachments-box">
                    <div class="attachments-title">Přílohy ke stažení (${post.attachments.length})</div>
                    ${post.attachments.map(att => `
                        <a href="../${att.relativePath}" class="att-item" download>
                            📎 ${escapeHtml(att.name)}
                        </a>
                    `).join('')}
                </div>
            ` : ''}

            <div class="comments-section">
                <div class="comments-header">Komentáře (${comments.length})</div>
                ${comments.length === 0 ? '<div style="color:var(--text-muted); font-size:14px;">Žádné komentáře k tomuto postu.</div>' : ''}
                ${comments.map(c => `
                    <div class="comment-item">
                        ${c.avatar ? `<img src="${c.avatar}" class="comment-avatar" alt="">` : `<div class="comment-avatar"></div>`}
                        <div class="comment-body-wrapper">
                            <span class="comment-author">${escapeHtml(c.author)}</span>
                            <span class="comment-text">${escapeHtml(c.body)}</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    </div>
</body>
</html>`;
    }

    // =========================================================================
    // 11. GENERÁTOR INTERAKTIVNÍ OFFLINE HTML GALERIE S LIGHTBOXEM
    // =========================================================================
    async function generateAndSaveGallery() {
        const creator = STATE.creatorName || 'Patreon Artist';
        const catalogJson = JSON.stringify(STATE.galleryCatalog);

        const galleryHtml = `<!DOCTYPE html>
<html lang="cs">
<head>
    <meta charset="UTF-8">
    <title>${escapeHtml(creator)} - Offline Galerie & Prohlížeč</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        :root {
            --bg-color: #0b0c0e;
            --surface: #14151a;
            --surface-card: #191b22;
            --border: #262832;
            --text-main: #f3f4f6;
            --text-muted: #8e92a0;
            --accent: #ff424d;
            --accent-hover: #e0323c;
        }
        * { box-sizing: border-box; }
        body {
            background-color: var(--bg-color);
            color: var(--text-main);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            margin: 0;
            padding: 0;
        }
        header {
            background: var(--surface);
            border-bottom: 1px solid var(--border);
            padding: 16px 24px;
            position: sticky;
            top: 0;
            z-index: 100;
            display: flex;
            flex-wrap: wrap;
            gap: 16px;
            align-items: center;
            justify-content: space-between;
        }
        .header-title {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .header-title h1 {
            font-size: 20px;
            font-weight: 800;
            margin: 0;
            color: #fff;
        }
        .header-stats {
            display: flex;
            gap: 12px;
            font-size: 12px;
            color: var(--text-muted);
        }
        .stat-badge {
            background: #20222c;
            padding: 4px 8px;
            border-radius: 6px;
            border: 1px solid var(--border);
        }
        .controls-bar {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            align-items: center;
        }
        .search-input {
            background: #1b1d25;
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 8px 14px;
            color: #fff;
            font-size: 13px;
            outline: none;
            width: 220px;
        }
        .search-input:focus { border-color: var(--accent); }
        .filter-select {
            background: #1b1d25;
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 8px 12px;
            color: #fff;
            font-size: 13px;
            outline: none;
        }

        .tabs-wrapper {
            background: #101115;
            border-bottom: 1px solid var(--border);
            padding: 10px 24px;
            display: flex;
            gap: 8px;
            overflow-x: auto;
        }
        .tab-btn {
            background: #181920;
            border: 1px solid var(--border);
            color: var(--text-muted);
            padding: 6px 14px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            white-space: nowrap;
            transition: all 0.2s;
        }
        .tab-btn:hover { color: #fff; background: #22242e; }
        .tab-btn.active { background: var(--accent); color: #fff; border-color: var(--accent); }

        main {
            padding: 24px;
            max-width: 1600px;
            margin: 0 auto;
        }
        .gallery-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 20px;
        }
        .card {
            background: var(--surface-card);
            border: 1px solid var(--border);
            border-radius: 12px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s;
            cursor: pointer;
        }
        .card:hover {
            transform: translateY(-4px);
            box-shadow: 0 10px 24px rgba(0,0,0,0.4);
            border-color: #3b3e4d;
        }
        .card-thumb-wrapper {
            position: relative;
            width: 100%;
            padding-top: 75%;
            background: #0f1013;
            overflow: hidden;
        }
        .card-thumb {
            position: absolute;
            top: 0; left: 0;
            width: 100%; height: 100%;
            object-fit: cover;
            transition: transform 0.3s;
        }
        .card:hover .card-thumb {
            transform: scale(1.04);
        }
        .card-badges {
            position: absolute;
            top: 8px; right: 8px;
            display: flex;
            gap: 4px;
            z-index: 2;
        }
        .badge {
            background: rgba(0,0,0,0.75);
            backdrop-filter: blur(4px);
            color: #fff;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 700;
        }
        .card-info {
            padding: 14px;
            display: flex;
            flex-direction: column;
            gap: 8px;
            flex: 1;
        }
        .card-title {
            margin: 0;
            font-size: 15px;
            font-weight: 700;
            color: #fff;
            line-height: 1.3;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
        }
        .card-meta {
            display: flex;
            justify-content: space-between;
            font-size: 12px;
            color: var(--text-muted);
            margin-top: auto;
        }
        .card-tags {
            display: flex;
            gap: 4px;
            flex-wrap: wrap;
        }
        .card-tag {
            font-size: 11px;
            color: #9ca3af;
            background: #232530;
            padding: 3px 8px;
            border-radius: 4px;
            border: 1px solid #323545;
            cursor: pointer;
            transition: all 0.2s;
        }
        .card-tag:hover {
            color: #fff;
            background: var(--accent);
            border-color: var(--accent);
        }

        /* Lightbox Pro */
        #lightbox {
            position: fixed;
            top: 0; left: 0;
            width: 100vw; height: 100vh;
            background: rgba(8, 9, 12, 0.95);
            backdrop-filter: blur(10px);
            z-index: 999999;
            display: none;
            flex-direction: column;
        }
        #lightbox.open { display: flex; }
        .lb-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 24px;
            background: rgba(20,21,26,0.9);
            border-bottom: 1px solid var(--border);
            z-index: 10;
        }
        .lb-title-box h2 {
            margin: 0;
            font-size: 16px;
            color: #fff;
        }
        .lb-title-box span {
            font-size: 12px;
            color: var(--text-muted);
        }
        .lb-controls {
            display: flex;
            gap: 8px;
            align-items: center;
        }
        .lb-btn {
            background: #22242e;
            border: 1px solid var(--border);
            color: #fff;
            padding: 7px 12px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 4px;
            transition: background 0.2s;
        }
        .lb-btn:hover { background: #2f3240; }
        .lb-stage {
            flex: 1;
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: auto;
            user-select: none;
        }
        .lb-img {
            max-width: 95%;
            max-height: 90%;
            object-fit: contain;
            transition: transform 0.15s ease-out;
            cursor: grab;
        }
        .lb-img.actual-size {
            max-width: none !important;
            max-height: none !important;
            cursor: move;
        }
        .lb-img:active { cursor: grabbing; }
        .lb-nav {
            position: absolute;
            top: 50%;
            transform: translateY(-50%);
            background: rgba(25, 27, 34, 0.85);
            border: 1px solid var(--border);
            color: #fff;
            width: 52px; height: 52px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 26px;
            font-weight: 700;
            cursor: pointer;
            user-select: none;
            transition: all 0.2s;
            z-index: 10;
        }
        .lb-nav:hover {
            background: var(--accent);
            transform: translateY(-50%) scale(1.1);
        }
        .lb-prev { left: 24px; }
        .lb-next { right: 24px; }
        .lb-footer {
            padding: 12px 24px;
            background: rgba(20,21,26,0.9);
            border-top: 1px solid var(--border);
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 13px;
            z-index: 10;
        }
        .lb-footer a {
            color: var(--accent);
            text-decoration: none;
            font-weight: 700;
        }
        .lb-footer a:hover { text-decoration: underline; }
    </style>
</head>
<body>
    <header>
        <div class="header-title">
            <h1>🎨 ${escapeHtml(creator)}</h1>
            <div class="header-stats">
                <span class="stat-badge" id="stat-posts">0 postů</span>
                <span class="stat-badge" id="stat-images">0 obrázků</span>
                <span class="stat-badge" id="stat-attachments">0 příloh</span>
            </div>
        </div>
        <div class="controls-bar">
            <input type="text" id="search-input" class="search-input" placeholder="Hledat v názvu, popisu, tagu...">
            <select id="sort-select" class="filter-select">
                <option value="newest">Nejnovější</option>
                <option value="oldest">Nejstarší</option>
                <option value="images">Nejvíce obrázků</option>
            </select>
        </div>
    </header>

    <div class="tabs-wrapper" id="collections-tabs">
        <button class="tab-btn active" data-tag="ALL">Všechny kolekce</button>
    </div>

    <main>
        <div class="gallery-grid" id="gallery-grid"></div>
    </main>

    <!-- Lightbox -->
    <div id="lightbox">
        <div class="lb-header">
            <div class="lb-title-box">
                <h2 id="lb-title">Post Title</h2>
                <span id="lb-date">Datum</span>
            </div>
            <div class="lb-controls">
                <button class="lb-btn" id="lb-zoom-out" title="Zmenšit">-</button>
                <button class="lb-btn" id="lb-zoom-fit" title="Přizpůsobit oknu">🔍 Přizpůsobit</button>
                <button class="lb-btn" id="lb-zoom-100" title="Skutečná velikost (100% nativní rozlišení)">100%</button>
                <button class="lb-btn" id="lb-zoom-in" title="Zvětšit">+</button>
                <button class="lb-btn" id="lb-fullscreen" title="Režim celé obrazovky">⛶ Celá obrazovka</button>
                <button class="lb-btn" id="lb-close" style="background:var(--accent);" title="Zavřít (Esc)">✕ Zavřít</button>
            </div>
        </div>
        <div class="lb-stage" id="lb-stage">
            <div class="lb-nav lb-prev" id="lb-prev" title="Předchozí snímek (Šipka vlevo)">‹</div>
            <img src="" alt="" class="lb-img" id="lb-img">
            <div class="lb-nav lb-next" id="lb-next" title="Další snímek (Šipka vpravo)">›</div>
        </div>
        <div class="lb-footer">
            <div id="lb-tags" style="display:flex; gap:6px; flex-wrap:wrap;"></div>
            <div style="display:flex; gap:16px;">
                <a id="lb-post-link" href="#" target="_blank">Otevřít celý post (HTML s komentáři) →</a>
            </div>
        </div>
    </div>

    <script>
        const CATALOG = ${catalogJson};
        let currentFilterTag = 'ALL';
        let searchQuery = '';
        let currentSort = 'newest';

        let currentFilteredImages = [];
        let currentImageIndex = 0;
        let zoomLevel = 1;
        let isActualSize = false;

        function init() {
            renderTabs();
            
            // Kontrola tagu v URL parametru (např. gallery.html?tag=werewolf)
            const urlParams = new URLSearchParams(window.location.search);
            const initialTag = urlParams.get('tag');
            if (initialTag) {
                filterByTag(initialTag);
            } else {
                applyFilters();
            }

            updateStats();
            bindEvents();
        }

        function updateStats() {
            let totalImages = 0;
            let totalAttachments = 0;
            CATALOG.forEach(p => {
                totalImages += (p.images || []).length;
                totalAttachments += (p.attachments || []).length;
            });
            document.getElementById('stat-posts').textContent = CATALOG.length + ' postů';
            document.getElementById('stat-images').textContent = totalImages + ' obrázků';
            document.getElementById('stat-attachments').textContent = totalAttachments + ' příloh';
        }

        function renderTabs() {
            const tabsContainer = document.getElementById('collections-tabs');
            const allTags = new Set();
            CATALOG.forEach(p => (p.tags || []).forEach(t => allTags.add(t.toLowerCase())));

            Array.from(allTags).sort().forEach(tag => {
                const btn = document.createElement('button');
                btn.className = 'tab-btn';
                btn.textContent = tag.toUpperCase();
                btn.dataset.tag = tag;
                btn.addEventListener('click', () => {
                    filterByTag(tag);
                });
                tabsContainer.appendChild(btn);
            });

            tabsContainer.querySelector('[data-tag="ALL"]').addEventListener('click', () => {
                filterByTag('ALL');
            });
        }

        function filterByTag(tag) {
            currentFilterTag = (tag || 'ALL').toLowerCase();
            document.querySelectorAll('.tab-btn').forEach(b => {
                if (b.dataset.tag?.toLowerCase() === currentFilterTag) {
                    b.classList.add('active');
                } else {
                    b.classList.remove('active');
                }
            });
            applyFilters();
        }
        window.filterByTag = filterByTag;

        function applyFilters() {
            let filtered = CATALOG.filter(post => {
                if (currentFilterTag !== 'all') {
                    const hasTag = (post.tags || []).some(t => t.toLowerCase() === currentFilterTag);
                    if (!hasTag) return false;
                }
                if (searchQuery) {
                    const q = searchQuery.toLowerCase();
                    const inTitle = (post.title || '').toLowerCase().includes(q);
                    const inTags = (post.tags || []).some(t => t.toLowerCase().includes(q));
                    if (!inTitle && !inTags) return false;
                }
                return true;
            });

            if (currentSort === 'newest') {
                filtered.sort((a,b) => (b.id || 0) - (a.id || 0));
            } else if (currentSort === 'oldest') {
                filtered.sort((a,b) => (a.id || 0) - (b.id || 0));
            } else if (currentSort === 'images') {
                filtered.sort((a,b) => (b.images?.length || 0) - (a.images?.length || 0));
            }

            renderGrid(filtered);
        }

        function getPostImages(post) {
            let imgs = [];
            if (post.images && post.images.length > 0) {
                imgs = post.images.map(x => ({ relativePath: x.relativePath, origUrl: x.origUrl || '' }));
            } else if (post.attachments && post.attachments.length > 0) {
                post.attachments.forEach(att => {
                    if (/\\.(jpg|jpeg|png|webp|gif)$/i.test(att.name)) {
                        imgs.push({ relativePath: att.relativePath, origUrl: att.url || '' });
                    }
                });
            }
            return imgs;
        }

        function renderGrid(posts) {
            const grid = document.getElementById('gallery-grid');
            grid.innerHTML = '';
            currentFilteredImages = [];

            if (posts.length === 0) {
                grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding: 48px; color:var(--text-muted);">Žádné posty neodpovídají zadaným kritériím.</div>';
                return;
            }

            // Sestavíme kompletní seznam všech snímků v aktuálním filtrovaném zobrazení pro plynulé procházení < a >
            posts.forEach((post, pIdx) => {
                const postImgs = getPostImages(post);
                postImgs.forEach((img, iIdx) => {
                    currentFilteredImages.push({
                        imgSrc: img.relativePath,
                        origUrl: img.origUrl || '',
                        postTitle: post.title,
                        postDate: post.date,
                        postTags: post.tags,
                        postHtml: post.htmlPostPath,
                        imgIndexInPost: iIdx + 1,
                        postTotalImgs: postImgs.length,
                        postNumber: pIdx + 1,
                        totalPosts: posts.length
                    });
                });
            });

            posts.forEach(post => {
                const card = document.createElement('div');
                card.className = 'card';

                const postImgs = getPostImages(post);
                const hasImg = postImgs.length > 0;
                let thumbSrc = hasImg ? postImgs[0].relativePath : '';
                let origSrc = hasImg ? postImgs[0].origUrl : '';

                // Čisté, nezdvojené tagy s možností kliknutí a filtrování
                const tagsHtml = (post.tags || []).slice(0, 5).map(t => {
                    const safeTag = t.replace(/'/g, "\\\\'");
                    return \`<button class="card-tag" onclick="event.stopPropagation(); filterByTag('\${safeTag}')">#\${t}</button>\`;
                }).join('');

                card.innerHTML = \`
                    <div class="card-thumb-wrapper">
                        \${thumbSrc ? \`<img src="\${thumbSrc}" onerror="if(this.dataset.orig && this.src!==this.dataset.orig)this.src=this.dataset.orig;" data-orig="\${origSrc}" class="card-thumb" alt="" loading="lazy">\` : \`<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#4b5563;">Bez obrázku</div>\`}
                        <div class="card-badges">
                            \${hasImg ? \`<span class="badge">🖼 \${postImgs.length}</span>\` : ''}
                            \${post.attachments?.length ? \`<span class="badge">📎 \${post.attachments.length}</span>\` : ''}
                        </div>
                    </div>
                    <div class="card-info">
                        <h3 class="card-title">\${post.title}</h3>
                        <div class="card-tags">\${tagsHtml}</div>
                        <div class="card-meta">
                            <span>📅 \${post.date}</span>
                            <span>💬 \${post.commentsCount || 0}</span>
                        </div>
                    </div>
                \`;

                card.addEventListener('click', () => {
                    openLightboxForPost(post);
                });

                grid.appendChild(card);
            });
        }

        function openLightboxForPost(post) {
            if (currentFilteredImages.length === 0) return;
            // Najdeme index prvního obrázku tohoto postu v seznamu
            const targetIdx = currentFilteredImages.findIndex(x => x.postTitle === post.title);
            currentImageIndex = targetIdx !== -1 ? targetIdx : 0;
            updateLightboxView();
            document.getElementById('lightbox').classList.add('open');
        }

        function resetZoom() {
            zoomLevel = 1;
            isActualSize = false;
            const lbImg = document.getElementById('lb-img');
            lbImg.classList.remove('actual-size');
            lbImg.style.transform = 'scale(1)';
            lbImg.style.maxWidth = '95%';
            lbImg.style.maxHeight = '90%';
            lbImg.style.width = 'auto';
            lbImg.style.height = 'auto';
        }

        function updateLightboxView() {
            if (currentFilteredImages.length === 0) return;
            const item = currentFilteredImages[currentImageIndex];
            const lbImg = document.getElementById('lb-img');

            lbImg.dataset.orig = item.origUrl || '';
            lbImg.onerror = function() {
                if (this.dataset.orig && this.src !== this.dataset.orig) {
                    this.src = this.dataset.orig;
                }
            };
            lbImg.src = item.imgSrc;
            resetZoom();

            const postInfoStr = item.postTotalImgs > 1
                ? \`Snímek \${item.imgIndexInPost}/\${item.postTotalImgs} • Post \${item.postNumber} z \${item.totalPosts}\`
                : \`Post \${item.postNumber} z \${item.totalPosts} (Celkově \${currentImageIndex + 1}/\${currentFilteredImages.length})\`;

            document.getElementById('lb-title').textContent = item.postTitle;
            document.getElementById('lb-date').textContent = \`\${item.postDate}  |  \${postInfoStr}\`;
            document.getElementById('lb-post-link').href = item.postHtml || '#';

            const tagsContainer = document.getElementById('lb-tags');
            tagsContainer.innerHTML = (item.postTags || []).map(t => {
                const safeTag = t.replace(/'/g, "\\\\'");
                return \`<button class="card-tag" onclick="filterByTag('\${safeTag}'); closeLightbox();">#\${t}</button>\`;
            }).join('');
        }

        function closeLightbox() {
            document.getElementById('lightbox').classList.remove('open');
            resetZoom();
        }
        window.closeLightbox = closeLightbox;

        function nextImage() {
            if (currentFilteredImages.length <= 1) return;
            currentImageIndex = (currentImageIndex + 1) % currentFilteredImages.length;
            updateLightboxView();
        }

        function prevImage() {
            if (currentFilteredImages.length <= 1) return;
            currentImageIndex = (currentImageIndex - 1 + currentFilteredImages.length) % currentFilteredImages.length;
            updateLightboxView();
        }

        function bindEvents() {
            document.getElementById('search-input').addEventListener('input', (e) => {
                searchQuery = e.target.value.trim();
                applyFilters();
            });

            document.getElementById('sort-select').addEventListener('change', (e) => {
                currentSort = e.target.value;
                applyFilters();
            });

            document.getElementById('lb-close').addEventListener('click', closeLightbox);
            document.getElementById('lb-prev').addEventListener('click', prevImage);
            document.getElementById('lb-next').addEventListener('click', nextImage);

            // Zoom In / Out
            const lbImg = document.getElementById('lb-img');
            document.getElementById('lb-zoom-in').addEventListener('click', () => {
                zoomLevel = Math.min(5, zoomLevel + 0.3);
                lbImg.style.transform = \`scale(\${zoomLevel})\`;
            });
            document.getElementById('lb-zoom-out').addEventListener('click', () => {
                zoomLevel = Math.max(0.4, zoomLevel - 0.3);
                lbImg.style.transform = \`scale(\${zoomLevel})\`;
            });

            // Přizpůsobit oknu (Fit)
            document.getElementById('lb-zoom-fit').addEventListener('click', () => {
                resetZoom();
            });

            // 100% nativní velikost (Skutečná velikost bez omezení)
            document.getElementById('lb-zoom-100').addEventListener('click', () => {
                isActualSize = !isActualSize;
                if (isActualSize) {
                    lbImg.classList.add('actual-size');
                    lbImg.style.transform = 'scale(1)';
                    lbImg.style.maxWidth = 'none';
                    lbImg.style.maxHeight = 'none';
                    lbImg.style.width = (lbImg.naturalWidth || lbImg.width) + 'px';
                    lbImg.style.height = (lbImg.naturalHeight || lbImg.height) + 'px';
                } else {
                    resetZoom();
                }
            });

            // Fullscreen
            document.getElementById('lb-fullscreen').addEventListener('click', () => {
                if (!document.fullscreenElement) {
                    document.documentElement.requestFullscreen().catch(() => {});
                } else {
                    document.exitFullscreen().catch(() => {});
                }
            });

            // Klávesové zkratky
            window.addEventListener('keydown', (e) => {
                const lb = document.getElementById('lightbox');
                if (!lb.classList.contains('open')) return;
                if (e.key === 'Escape') closeLightbox();
                if (e.key === 'ArrowLeft') prevImage();
                if (e.key === 'ArrowRight') nextImage();
                if (e.key === '+' || e.key === '=') {
                    zoomLevel = Math.min(5, zoomLevel + 0.3);
                    lbImg.style.transform = \`scale(\${zoomLevel})\`;
                }
                if (e.key === '-') {
                    zoomLevel = Math.max(0.4, zoomLevel - 0.3);
                    lbImg.style.transform = \`scale(\${zoomLevel})\`;
                }
                if (e.key.toLowerCase() === 'f') {
                    if (!document.fullscreenElement) {
                        document.documentElement.requestFullscreen().catch(() => {});
                    } else {
                        document.exitFullscreen().catch(() => {});
                    }
                }
            });
        }

        init();
    </script>
</body>
</html>`;

        await downloadTextFileGM(galleryHtml, `${STATE.baseFolder}/gallery.html`);
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // =========================================================================
    // 12. INICIALIZACE PŘI NAČTENÍ STRÁNKY
    // =========================================================================
    window.addEventListener('load', () => {
        setTimeout(createHUD, 1500);
    });

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(createHUD, 1500);
    }
})();
