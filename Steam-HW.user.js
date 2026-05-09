// ==UserScript==
// @name              Steam-HW
// @name:cs           Steam-HW: porovnání hardwaru
// @namespace         https://github.com/Kamdar-Wolf/Script
// @version           1.1.1
// @description       Porovnává hardware zadaný uživatelem s minimálními a doporučenými požadavky her na Steam Store a ukazuje odhad hratelnosti.
// @author            Kamdar-Wolf
// @license           MIT
// @compatible        chrome
// @compatible        firefox
// @compatible        edge
// @match             https://store.steampowered.com/*
// @icon              https://store.steampowered.com/favicon.ico
// @icon64            https://store.steampowered.com/public/shared/images/responsive/share_steam_logo.png
// @homepageURL       https://github.com/Kamdar-Wolf/Script
// @supportURL        https://github.com/Kamdar-Wolf/Script/issues
// @downloadURL       https://raw.githubusercontent.com/Kamdar-Wolf/Script/main/Steam-HW.user.js
// @updateURL         https://raw.githubusercontent.com/Kamdar-Wolf/Script/main/Steam-HW.user.js
// @run-at            document-idle
// @noframes
// @grant             GM_getValue
// @grant             GM_setValue
// @grant             GM_deleteValue
// @grant             GM_registerMenuCommand
// @grant             GM_addStyle
// @grant             GM_notification
// ==/UserScript==

(function () {
    'use strict';

    const SCRIPT = {
        id: 'steam-hw',
        name: 'Steam-HW',
        version: '1.1.1',
        author: 'Kamdar-Wolf',
        license: 'MIT',
        profileKey: 'steam-hw.profileText',
        optionsKey: 'steam-hw.options',
        profilesKey: 'steam-hw.profiles',
        surveyKey: 'steam-hw.hardwareSurvey',
        cookiePrefix: 'steam_hw_',
    };

    const DEFAULT_OPTIONS = {
        useAdvertisedVram: true,
        showTechnicalScores: true,
        compactDisplay: false,
        useSteamSurvey: true,
        showStoreBadges: true,
    };

    const SCORE_UNKNOWN = null;
    const COOKIE_MAX_CHUNKS = 60;
    const COOKIE_CHUNK_SIZE = 3000;
    const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
    const SURVEY_REFRESH_MS = 1000 * 60 * 60 * 24 * 30;
    const BADGE_FETCH_LIMIT = 12;
    const appRequirementCache = new Map();
    let badgeScanTimer = null;
    let surveyRefreshInFlight = null;

    const WEIGHTS = {
        gpu: 0.36,
        cpu: 0.24,
        ram: 0.14,
        vram: 0.10,
        os: 0.06,
        disk: 0.05,
        ssd: 0.05,
    };

    const CPU_PATTERNS = [
        { re: /\bryzen\s*9\s*7950x3d\b/, score: 63000, label: 'Ryzen 9 7950X3D' },
        { re: /\bryzen\s*9\s*7950x\b/, score: 63500, label: 'Ryzen 9 7950X' },
        { re: /\bryzen\s*9\s*7900x\b/, score: 52000, label: 'Ryzen 9 7900X' },
        { re: /\bryzen\s*7\s*7800x3d\b/, score: 34500, label: 'Ryzen 7 7800X3D' },
        { re: /\bryzen\s*7\s*7700x\b/, score: 36500, label: 'Ryzen 7 7700X' },
        { re: /\bryzen\s*7\s*5800x3d\b/, score: 28200, label: 'Ryzen 7 5800X3D' },
        { re: /\bryzen\s*7\s*5800x\b/, score: 28300, label: 'Ryzen 7 5800X' },
        { re: /\bryzen\s*7\s*5700x\b/, score: 26600, label: 'Ryzen 7 5700X' },
        { re: /\bryzen\s*5\s*7600x\b/, score: 28700, label: 'Ryzen 5 7600X' },
        { re: /\bryzen\s*5\s*5600x\b/, score: 22200, label: 'Ryzen 5 5600X' },
        { re: /\bryzen\s*5\s*5600\b/, score: 21500, label: 'Ryzen 5 5600' },
        { re: /\bryzen\s*5\s*3600x\b/, score: 18200, label: 'Ryzen 5 3600X' },
        { re: /\bryzen\s*5\s*3600\b/, score: 17800, label: 'Ryzen 5 3600' },
        { re: /\bryzen\s*5\s*2600\b/, score: 13200, label: 'Ryzen 5 2600' },
        { re: /\bryzen\s*5\s*1600\b/, score: 12300, label: 'Ryzen 5 1600' },
        { re: /\bryzen\s*5\s*1500x\b/, score: 9100, label: 'Ryzen 5 1500X' },
        { re: /\bfx\s*8350\b/, score: 5900, label: 'FX-8350' },
        { re: /\bcore\s*ultra\s*9\s*288v\b/, score: 21000, label: 'Core Ultra 9 288V' },
        { re: /\bcore\s*ultra\s*7\s*258v\b/, score: 18800, label: 'Core Ultra 7 258V' },
        { re: /\bcore\s*ultra\s*7\s*256v\b/, score: 18100, label: 'Core Ultra 7 256V' },
        { re: /\bcore\s*ultra\s*5\s*238v\b/, score: 17100, label: 'Core Ultra 5 238V' },
        { re: /\bcore\s*ultra\s*5\s*226v\b/, score: 16400, label: 'Core Ultra 5 226V' },
        { re: /\bi9\s*14900k\b/, score: 61000, label: 'Core i9-14900K' },
        { re: /\bi9\s*13900k\b/, score: 59500, label: 'Core i9-13900K' },
        { re: /\bi9\s*12900k\b/, score: 41500, label: 'Core i9-12900K' },
        { re: /\bi7\s*14700k\b/, score: 53500, label: 'Core i7-14700K' },
        { re: /\bi7\s*13700k\b/, score: 47000, label: 'Core i7-13700K' },
        { re: /\bi7\s*12700k\b/, score: 34800, label: 'Core i7-12700K' },
        { re: /\bi5\s*14600k\b/, score: 39500, label: 'Core i5-14600K' },
        { re: /\bi5\s*13600k\b/, score: 38400, label: 'Core i5-13600K' },
        { re: /\bi5\s*12600k\b/, score: 27700, label: 'Core i5-12600K' },
        { re: /\bi5\s*12400f?\b/, score: 19500, label: 'Core i5-12400' },
        { re: /\bi5\s*11400f?\b/, score: 17100, label: 'Core i5-11400' },
        { re: /\bi5\s*10400f?\b/, score: 12500, label: 'Core i5-10400' },
        { re: /\bi7\s*9700k?\b/, score: 14600, label: 'Core i7-9700' },
        { re: /\bi5\s*9600k?\b/, score: 10800, label: 'Core i5-9600' },
        { re: /\bi5\s*9400f?\b/, score: 9600, label: 'Core i5-9400' },
        { re: /\bi7\s*8700k?\b/, score: 13800, label: 'Core i7-8700' },
        { re: /\bi5\s*8600k?\b/, score: 10100, label: 'Core i5-8600' },
        { re: /\bi5\s*8400\b/, score: 9250, label: 'Core i5-8400' },
        { re: /\bi7\s*7700k?\b/, score: 9700, label: 'Core i7-7700' },
        { re: /\bi5\s*7600k?\b/, score: 7000, label: 'Core i5-7600' },
        { re: /\bi7\s*6700k?\b/, score: 8950, label: 'Core i7-6700' },
        { re: /\bi5\s*6600k?\b/, score: 6300, label: 'Core i5-6600' },
        { re: /\bi7\s*4790k?\b/, score: 7200, label: 'Core i7-4790' },
        { re: /\bi5\s*4590\b/, score: 5300, label: 'Core i5-4590' },
        { re: /\bi5\s*2500k?\b/, score: 4100, label: 'Core i5-2500' },
        { re: /\bi3\s*6100\b/, score: 4100, label: 'Core i3-6100' },
    ];

    const GPU_PATTERNS = [
        { re: /\brtx\s*5090\b/, score: 47000, label: 'GeForce RTX 5090' },
        { re: /\brtx\s*5080\b/, score: 36000, label: 'GeForce RTX 5080' },
        { re: /\brtx\s*5070\s*ti\b/, score: 28500, label: 'GeForce RTX 5070 Ti' },
        { re: /\brtx\s*5070\b/, score: 23000, label: 'GeForce RTX 5070' },
        { re: /\brtx\s*4090\b/, score: 36000, label: 'GeForce RTX 4090' },
        { re: /\brtx\s*4080\s*super\b/, score: 28500, label: 'GeForce RTX 4080 SUPER' },
        { re: /\brtx\s*4080\b/, score: 28000, label: 'GeForce RTX 4080' },
        { re: /\brtx\s*4070\s*ti\s*super\b/, score: 24500, label: 'GeForce RTX 4070 Ti SUPER' },
        { re: /\brtx\s*4070\s*ti\b/, score: 22600, label: 'GeForce RTX 4070 Ti' },
        { re: /\brtx\s*4070\s*super\b/, score: 21200, label: 'GeForce RTX 4070 SUPER' },
        { re: /\brtx\s*4070\b/, score: 18000, label: 'GeForce RTX 4070' },
        { re: /\brtx\s*4060\s*ti\b/, score: 13500, label: 'GeForce RTX 4060 Ti' },
        { re: /\brtx\s*4060\b/, score: 10700, label: 'GeForce RTX 4060' },
        { re: /\brtx\s*3090\s*ti\b/, score: 22000, label: 'GeForce RTX 3090 Ti' },
        { re: /\brtx\s*3090\b/, score: 20000, label: 'GeForce RTX 3090' },
        { re: /\brtx\s*3080\s*ti\b/, score: 19600, label: 'GeForce RTX 3080 Ti' },
        { re: /\brtx\s*3080\b/, score: 17600, label: 'GeForce RTX 3080' },
        { re: /\brtx\s*3070\s*ti\b/, score: 14800, label: 'GeForce RTX 3070 Ti' },
        { re: /\brtx\s*3070\b/, score: 13600, label: 'GeForce RTX 3070' },
        { re: /\brtx\s*3060\s*ti\b/, score: 11800, label: 'GeForce RTX 3060 Ti' },
        { re: /\brtx\s*3060\b/, score: 8700, label: 'GeForce RTX 3060' },
        { re: /\brtx\s*2080\s*ti\b/, score: 13200, label: 'GeForce RTX 2080 Ti' },
        { re: /\brtx\s*2080\b/, score: 11000, label: 'GeForce RTX 2080' },
        { re: /\brtx\s*2070\b/, score: 9100, label: 'GeForce RTX 2070' },
        { re: /\brtx\s*2060\b/, score: 7600, label: 'GeForce RTX 2060' },
        { re: /\bgtx\s*1080\s*ti\b/, score: 9900, label: 'GeForce GTX 1080 Ti' },
        { re: /\bgtx\s*1080\b/, score: 7600, label: 'GeForce GTX 1080' },
        { re: /\bgtx\s*1070\s*ti\b/, score: 6800, label: 'GeForce GTX 1070 Ti' },
        { re: /\bgtx\s*1070\b/, score: 6000, label: 'GeForce GTX 1070' },
        { re: /\bgtx\s*1060\b/, score: 4200, label: 'GeForce GTX 1060' },
        { re: /\bgtx\s*1050\s*ti\b/, score: 2350, label: 'GeForce GTX 1050 Ti' },
        { re: /\bgtx\s*1050\b/, score: 1850, label: 'GeForce GTX 1050' },
        { re: /\bgtx\s*970\b/, score: 3650, label: 'GeForce GTX 970' },
        { re: /\bgtx\s*960\b/, score: 2300, label: 'GeForce GTX 960' },
        { re: /\brx\s*7900\s*xtx\b/, score: 30000, label: 'Radeon RX 7900 XTX' },
        { re: /\brx\s*7900\s*xt\b/, score: 27000, label: 'Radeon RX 7900 XT' },
        { re: /\brx\s*7800\s*xt\b/, score: 19600, label: 'Radeon RX 7800 XT' },
        { re: /\brx\s*7700\s*xt\b/, score: 17000, label: 'Radeon RX 7700 XT' },
        { re: /\brx\s*7600\s*xt\b/, score: 11200, label: 'Radeon RX 7600 XT' },
        { re: /\brx\s*7600\b/, score: 10800, label: 'Radeon RX 7600' },
        { re: /\brx\s*6950\s*xt\b/, score: 22000, label: 'Radeon RX 6950 XT' },
        { re: /\brx\s*6900\s*xt\b/, score: 20600, label: 'Radeon RX 6900 XT' },
        { re: /\brx\s*6800\s*xt\b/, score: 18500, label: 'Radeon RX 6800 XT' },
        { re: /\brx\s*6800\b/, score: 15800, label: 'Radeon RX 6800' },
        { re: /\brx\s*6750\s*xt\b/, score: 13500, label: 'Radeon RX 6750 XT' },
        { re: /\brx\s*6700\s*xt\b/, score: 12600, label: 'Radeon RX 6700 XT' },
        { re: /\brx\s*6650\s*xt\b/, score: 10200, label: 'Radeon RX 6650 XT' },
        { re: /\brx\s*6600\s*xt\b/, score: 9700, label: 'Radeon RX 6600 XT' },
        { re: /\brx\s*6600\b/, score: 8150, label: 'Radeon RX 6600' },
        { re: /\brx\s*5700\s*xt\b/, score: 9500, label: 'Radeon RX 5700 XT' },
        { re: /\brx\s*5600\s*xt\b/, score: 7500, label: 'Radeon RX 5600 XT' },
        { re: /\brx\s*5500\s*xt\b/, score: 4800, label: 'Radeon RX 5500 XT' },
        { re: /\brx\s*590\b/, score: 4800, label: 'Radeon RX 590' },
        { re: /\brx\s*580\b/, score: 4300, label: 'Radeon RX 580' },
        { re: /\brx\s*570\b/, score: 3850, label: 'Radeon RX 570' },
        { re: /\barc\s*b580\b/, score: 13500, label: 'Intel Arc B580' },
        { re: /\barc\s*a770\b/, score: 12500, label: 'Intel Arc A770' },
        { re: /\barc\s*a750\b/, score: 10500, label: 'Intel Arc A750' },
        { re: /\barc\s*a580\b/, score: 9000, label: 'Intel Arc A580' },
        { re: /\barc\s*a380\b/, score: 3600, label: 'Intel Arc A380' },
        { re: /\barc\s*140v\b/, score: 3900, label: 'Intel Arc 140V' },
        { re: /\barc\s*130v\b/, score: 3300, label: 'Intel Arc 130V' },
        { re: /\bradeon\s*890m\b/, score: 3800, label: 'Radeon 890M' },
        { re: /\bradeon\s*780m\b/, score: 3100, label: 'Radeon 780M' },
        { re: /\biris\s*xe\b/, score: 1300, label: 'Intel Iris Xe' },
        { re: /\buhd\s*770\b/, score: 750, label: 'Intel UHD 770' },
        { re: /\buhd\s*620\b/, score: 430, label: 'Intel UHD 620' },
    ];

    function main() {
        installStyles();
        registerMenuCommands();
        ready(() => {
            renderPageAnalysis();
            refreshSurveyCacheIfNeeded();
            scheduleBadgeScan();
            installDelegatedEvents();
            observeSteamPageChanges();
        });
    }

    function ready(callback) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', callback, { once: true });
            return;
        }
        callback();
    }

    function registerMenuCommands() {
        if (typeof GM_registerMenuCommand !== 'function') {
            return;
        }

        GM_registerMenuCommand('Nastavení Steam-HW', openSettingsDialog, 's');
        GM_registerMenuCommand('Znovu vyhodnotit stránku', () => renderPageAnalysis(true), 'r');
        GM_registerMenuCommand('Aktualizovat Steam HW Survey cache', () => refreshSurveyCache(true), 'u');
        GM_registerMenuCommand('Vymazat uložený HW profil', () => {
            deleteStoredValue(SCRIPT.profileKey);
            deleteStoredValue(SCRIPT.profilesKey);
            notify('Steam-HW', 'Uložený HW profil byl vymazán.');
            renderPageAnalysis(true);
        }, 'd');
    }

    function installDelegatedEvents() {
        document.addEventListener('click', (event) => {
            const target = event.target.closest('[data-steam-hw-action]');
            if (!target) {
                return;
            }

            const action = target.getAttribute('data-steam-hw-action');
            if (action === 'open-settings') {
                openSettingsDialog();
            } else if (action === 'close-settings') {
                closeSettingsDialog();
            } else if (action === 'save-settings') {
                saveSettingsDialog();
            } else if (action === 'clear-settings') {
                clearSettingsDialog();
            } else if (action === 'refresh') {
                renderPageAnalysis(true);
            } else if (action === 'toggle-compact') {
                toggleCompactDisplay();
            } else if (action === 'profile-new') {
                createProfileFromDialog();
            } else if (action === 'profile-duplicate') {
                duplicateProfileFromDialog();
            } else if (action === 'profile-delete') {
                deleteProfileFromDialog();
            } else if (action === 'refresh-survey') {
                refreshSurveyCache(true);
            }
        });

        document.addEventListener('input', (event) => {
            if (event.target && ['steam-hw-profile-input', 'steam-hw-override-cpu', 'steam-hw-override-gpu', 'steam-hw-override-vram', 'steam-hw-override-ram'].includes(event.target.id)) {
                const input = document.getElementById('steam-hw-profile-input');
                updateSettingsPreview(input ? input.value : '');
            }
        });

        document.addEventListener('change', (event) => {
            if (!event.target) {
                return;
            }

            if (event.target.id === 'steam-hw-profile-select') {
                switchSettingsProfile(event.target.value);
                return;
            }

            if (event.target.id === 'steam-hw-card-profile-select') {
                setActiveProfileId(event.target.value);
                renderPageAnalysis(true);
                scheduleBadgeScan();
                return;
            }

            if (!['steam-hw-option-vram', 'steam-hw-option-scores', 'steam-hw-option-compact', 'steam-hw-option-survey', 'steam-hw-option-badges'].includes(event.target.id)) {
                return;
            }
            const input = document.getElementById('steam-hw-profile-input');
            updateSettingsPreview(input ? input.value : '');
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && document.getElementById('steam-hw-modal')) {
                closeSettingsDialog();
            }
        });
    }

    function observeSteamPageChanges() {
        if (!document.body || typeof MutationObserver !== 'function') {
            return;
        }

        let timer = null;
        const observer = new MutationObserver((mutations) => {
            const relevant = mutations.some((mutation) => {
                return Array.from(mutation.addedNodes || []).some((node) => {
                    return node.nodeType === 1 && !node.id?.startsWith('steam-hw') && (
                        node.matches?.('.game_area_sys_req, .sysreq_contents, #game_area_purchase') ||
                        node.querySelector?.('.game_area_sys_req, .sysreq_contents, #game_area_purchase')
                    );
                });
            });

            if (!relevant) {
                return;
            }

            window.clearTimeout(timer);
            timer = window.setTimeout(() => {
                renderPageAnalysis(false);
                scheduleBadgeScan();
            }, 250);
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    function renderPageAnalysis(force) {
        const requirements = parseRequirementsFromPage();
        const oldCard = document.getElementById('steam-hw-result-card');

        if (!requirements) {
            if (oldCard && force) {
                oldCard.remove();
            }
            removePurchaseWarning();
            return;
        }

        const profiles = readProfiles();
        const activeProfile = getActiveProfile(profiles);
        const profileText = activeProfile.text || '';
        const options = readOptions();
        let html;
        let evaluation = null;

        if (!profileText.trim()) {
            html = renderMissingProfileCard(requirements, profiles, activeProfile);
        } else {
            const profile = parseSteamHardwareProfile(profileText, options, activeProfile);
            evaluation = evaluateProfile(requirements, profile, options);
            html = renderEvaluationCard(requirements, profile, evaluation, options, profiles, activeProfile);
        }

        const card = document.createElement('div');
        card.id = 'steam-hw-result-card';
        card.innerHTML = html;

        if (oldCard) {
            oldCard.replaceWith(card);
            renderPurchaseWarning(evaluation, requirements);
            return;
        }

        const insertionTarget = findInsertionTarget(requirements.node);
        if (!insertionTarget || !insertionTarget.parentNode) {
            return;
        }

        insertionTarget.parentNode.insertBefore(card, insertionTarget);
        renderPurchaseWarning(evaluation, requirements);
    }

    function parseRequirementsFromPage(root = document) {
        const sysReqNodes = Array.from(root.querySelectorAll('.game_area_sys_req, .sysreq_content'));
        if (!sysReqNodes.length) {
            return null;
        }

        const windowsNode =
            sysReqNodes.find((node) => node.getAttribute('data-os') === 'win' && node.classList.contains('active')) ||
            sysReqNodes.find((node) => node.getAttribute('data-os') === 'win') ||
            sysReqNodes.find((node) => node.classList.contains('active')) ||
            sysReqNodes[0];

        const left = windowsNode.querySelector('.game_area_sys_req_leftCol, .sysreq_min');
        const right = windowsNode.querySelector('.game_area_sys_req_rightCol, .sysreq_rec');

        if (!left && !right) {
            return null;
        }

        const gameTitle =
            text(root.querySelector('#appHubAppName')) ||
            text(root.querySelector('.apphub_AppName')) ||
            text(root.querySelector('h1')) ||
            'Tato hra';

        return {
            gameTitle,
            os: windowsNode.getAttribute('data-os') || 'win',
            node: windowsNode,
            minimum: parseRequirementBlock(left),
            recommended: right ? parseRequirementBlock(right) : null,
        };
    }

    function parseRequirementBlock(element) {
        const block = {
            rawText: text(element),
            fields: {},
            notes: [],
            requires64Bit: false,
            requiresSsd: false,
        };

        if (!element) {
            return block;
        }

        const items = Array.from(element.querySelectorAll('li'));
        if (items.length) {
            items.forEach((li) => parseRequirementListItem(block, li));
        } else {
            parseRequirementFallback(block, element);
        }

        const allText = normalize(`${block.rawText} ${block.notes.join(' ')}`);
        block.requires64Bit = /64\s*bit|64bit|64\s*bitovy|64bitovy/.test(allText);
        block.requiresSsd = /\bssd\b/.test(allText) && /(required|vyzad|nutn|povinn|doporu|recommended)/.test(allText);

        return block;
    }

    function parseRequirementListItem(block, li) {
        const strong = li.querySelector('strong');
        const rowText = cleanText(li.textContent);

        if (!strong) {
            if (rowText) {
                block.notes.push(rowText);
            }
            return;
        }

        const label = cleanText(strong.textContent).replace(/:$/, '');
        const normalizedLabel = normalize(label);

        if (/minimal|minimum|doporuc|recommended/.test(normalizedLabel)) {
            return;
        }

        const clone = li.cloneNode(true);
        const cloneStrong = clone.querySelector('strong');
        if (cloneStrong) {
            cloneStrong.remove();
        }

        const value = cleanText(clone.textContent).replace(/^:\s*/, '');
        const canonical = canonicalRequirementField(label);

        if (canonical && value) {
            appendRequirementField(block.fields, canonical, value);
        } else if (rowText) {
            block.notes.push(rowText);
        }
    }

    function parseRequirementFallback(block, element) {
        const lines = cleanText(element.innerText || element.textContent || '')
            .split(/\n+/)
            .map((line) => line.trim())
            .filter(Boolean);

        lines.forEach((line) => {
            const match = line.match(/^([^:]{2,40}):\s*(.+)$/);
            if (!match) {
                block.notes.push(line);
                return;
            }

            const canonical = canonicalRequirementField(match[1]);
            if (canonical) {
                appendRequirementField(block.fields, canonical, match[2]);
            } else {
                block.notes.push(line);
            }
        });
    }

    function canonicalRequirementField(label) {
        const key = normalize(label);

        if (key === 'os' || key.includes('operacni system') || key.includes('operating system')) {
            return 'os';
        }
        if (key.includes('procesor') || key.includes('processor') || key === 'cpu') {
            return 'cpu';
        }
        if (key.includes('pamet') || key.includes('memory') || key === 'ram') {
            return 'memory';
        }
        if (key.includes('graficka karta') || key.includes('graphics') || key.includes('video card') || key === 'gpu') {
            return 'gpu';
        }
        if (key.includes('directx')) {
            return 'directx';
        }
        if (key.includes('pevny disk') || key.includes('storage') || key.includes('hard drive') || key.includes('disk space')) {
            return 'storage';
        }
        if (key.includes('dodatecne poznamky') || key.includes('additional notes')) {
            return 'notes';
        }
        return null;
    }

    function appendRequirementField(fields, field, value) {
        if (field === 'notes') {
            fields.notes = [fields.notes, value].filter(Boolean).join('\n');
            return;
        }
        fields[field] = [fields[field], value].filter(Boolean).join(' / ');
    }

    function parseSteamHardwareProfile(input, options, profileRecord = {}) {
        const profile = {
            rawText: input || '',
            computer: {},
            os: {},
            cpu: {},
            gpu: {},
            memory: {},
            storage: {},
            warnings: [],
        };

        let section = '';
        const lines = String(input || '')
            .replace(/\r/g, '')
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean);

        lines.forEach((line) => {
            if (/^[^:]{2,80}:$/.test(line)) {
                section = normalize(line.replace(/:$/, ''));
                return;
            }

            const match = line.match(/^([^:]{2,80}):\s*(.*)$/);
            if (!match) {
                handleProfileFreeLine(profile, section, line);
                return;
            }

            handleProfileFact(profile, section, match[1], match[2], line);
        });

        finalizeProfile(profile, options, profileRecord.overrides || {});
        return profile;
    }

    function handleProfileFact(profile, section, label, value, originalLine) {
        const key = normalize(label);
        const val = cleanText(value);

        if (!val) {
            return;
        }

        if (key === 'vyrobce' || key === 'manufacturer') {
            profile.computer.manufacturer = val;
            return;
        }

        if (key === 'model') {
            profile.computer.model = val;
            return;
        }

        if (key.includes('znacka cpu') || key.includes('cpu brand') || key.includes('processor brand')) {
            profile.cpu.name = val;
            return;
        }

        if ((key === 'rychlost' || key === 'speed') && isCpuSection(section)) {
            profile.cpu.speedMhz = parseMhz(val);
            return;
        }

        if (key.includes('logicke procesory') || key.includes('logical processors')) {
            profile.cpu.threads = parseInteger(val);
            return;
        }

        if (key.includes('fyzicke procesory') || key.includes('physical processors')) {
            profile.cpu.cores = parseInteger(val);
            return;
        }

        if ((key === 'ram' || key.includes('system ram')) && (isMemorySection(section) || key === 'ram')) {
            profile.memory.ramMb = parseSizeMb(val);
            return;
        }

        if (isGpuSection(section)) {
            if (key === 'ovladac' || key === 'driver' || key === 'karta directx' || key === 'directx card') {
                if (!looksLikeDriverVersion(val)) {
                    profile.gpu.name = profile.gpu.name || val;
                    profile.gpu.driverLine = val;
                }
                return;
            }

            if (key.includes('vram') || key.includes('video memory')) {
                profile.gpu.dedicatedVramMb = parseSizeMb(val);
                return;
            }
        }

        if (isOsSection(section)) {
            if (key === 'os' || key.includes('operacni system') || key.includes('operating system')) {
                profile.os.name = val;
                return;
            }
        }

        if (key.includes('celkove dostupne volne misto') || key.includes('total hard disk space available')) {
            profile.storage.totalFreeMb = parseSizeMb(val);
            return;
        }

        if (key.includes('nejvetsi volny blok') || key.includes('largest free hard disk block')) {
            profile.storage.largestFreeBlockMb = parseSizeMb(val);
            return;
        }

        if (key.includes('pocet disku ssd') || key.includes('number of ssd')) {
            profile.storage.ssdCount = parseInteger(val);
            return;
        }

        if (key.includes('velikost disku ssd') || key.includes('ssd sizes') || key.includes('size of ssd')) {
            profile.storage.ssdSizeMb = parseSizeMb(val);
            return;
        }

        if (key.includes('pocet disku hdd') || key.includes('number of hdd')) {
            profile.storage.hddCount = parseInteger(val);
            return;
        }

        if (key.includes('gpu') && !profile.gpu.name && /intel|nvidia|geforce|radeon|amd|arc|iris|uhd/i.test(val)) {
            profile.gpu.name = val;
            return;
        }

        if (/^windows|^linux|^mac/i.test(originalLine) && isOsSection(section)) {
            profile.os.name = cleanText(originalLine);
        }
    }

    function handleProfileFreeLine(profile, section, line) {
        if (isOsSection(section) && /windows|linux|mac\s*os|steam\s*os/i.test(line)) {
            profile.os.name = cleanText(line);
        }
    }

    function finalizeProfile(profile, options, overrides = {}) {
        const gpuNameVram = parseVramFromText(profile.gpu.name || '');
        profile.gpu.advertisedVramMb = gpuNameVram || null;

        const effectiveCandidates = [];
        if (profile.gpu.dedicatedVramMb) {
            effectiveCandidates.push(profile.gpu.dedicatedVramMb);
        }
        if (options.useAdvertisedVram && profile.gpu.advertisedVramMb) {
            effectiveCandidates.push(profile.gpu.advertisedVramMb);
        }
        profile.gpu.effectiveVramMb = effectiveCandidates.length ? Math.max(...effectiveCandidates) : null;

        profile.cpu.scoreInfo = scoreCpu(profile.cpu.name, profile.cpu.cores, profile.cpu.speedMhz);
        profile.gpu.scoreInfo = scoreGpu(profile.gpu.name);
        profile.gpu.integrated = isIntegratedGpu(profile.gpu.name);

        profile.os.windowsLevel = parseWindowsLevel(profile.os.name || '');
        profile.os.is64Bit = /64\s*bit|64bit|x64|amd64/i.test(profile.os.name || '');

        if (profile.gpu.integrated && profile.gpu.advertisedVramMb && profile.gpu.dedicatedVramMb && profile.gpu.dedicatedVramMb < 1024) {
            profile.warnings.push('Steam u integrované grafiky hlásí nízkou primární VRAM. Skript použil větší hodnotu z názvu GPU, ale výsledek je potřeba brát orientačně.');
        }

        applyProfileOverrides(profile, overrides);

        if (!profile.cpu.name) {
            profile.warnings.push('V HW profilu se nepodařilo najít název procesoru.');
        }
        if (!profile.gpu.name) {
            profile.warnings.push('V HW profilu se nepodařilo najít název grafické karty.');
        }
        if (!profile.memory.ramMb) {
            profile.warnings.push('V HW profilu se nepodařilo najít velikost RAM.');
        }
    }

    function applyProfileOverrides(profile, overrides) {
        if (!overrides || typeof overrides !== 'object') {
            return;
        }

        const cpuAs = cleanText(overrides.cpuAs || '');
        if (cpuAs) {
            const scoreInfo = scoreCpu(cpuAs, profile.cpu.cores, profile.cpu.speedMhz);
            if (scoreInfo.score) {
                profile.cpu.originalName = profile.cpu.name || '';
                profile.cpu.scoreInfo = { ...scoreInfo, label: `${scoreInfo.label || cpuAs} (ruční oprava)` };
                profile.cpu.name = profile.cpu.name || cpuAs;
                profile.warnings.push(`Procesor je pro porovnání ručně počítán jako ${cpuAs}.`);
            }
        }

        const gpuAs = cleanText(overrides.gpuAs || '');
        if (gpuAs) {
            const scoreInfo = scoreGpu(gpuAs);
            if (scoreInfo.score) {
                profile.gpu.originalName = profile.gpu.name || '';
                profile.gpu.scoreInfo = { ...scoreInfo, label: `${scoreInfo.label || gpuAs} (ruční oprava)` };
                profile.gpu.name = profile.gpu.name || gpuAs;
                profile.warnings.push(`Grafická karta je pro porovnání ručně počítána jako ${gpuAs}.`);
            }
        }

        if (overrides.vramMb) {
            profile.gpu.effectiveVramMb = Number(overrides.vramMb);
            profile.warnings.push(`VRAM je ručně nastavena na ${formatMb(profile.gpu.effectiveVramMb)}.`);
        }

        if (overrides.ramMb) {
            profile.memory.ramMb = Number(overrides.ramMb);
            profile.warnings.push(`RAM je ručně nastavena na ${formatMb(profile.memory.ramMb)}.`);
        }
    }

    function evaluateProfile(requirements, profile) {
        const minimum = normalizeRequirementBlock(requirements.minimum);
        const recommended = requirements.recommended ? normalizeRequirementBlock(requirements.recommended) : null;

        const rows = [
            evaluateCpu(profile, minimum, recommended),
            evaluateGpu(profile, minimum, recommended),
            evaluateRam(profile, minimum, recommended),
            evaluateVram(profile, minimum, recommended),
            evaluateOs(profile, minimum, recommended),
            evaluateDisk(profile, minimum, recommended),
            evaluateSsd(profile, minimum, recommended),
        ].filter(Boolean);

        const score = weightedScore(rows);
        const minimumFailures = rows.filter((row) => row.minimumPass === false);
        const recommendedFailures = rows.filter((row) => row.recommendedPass === false);
        const criticalFailures = minimumFailures.filter((row) => ['gpu', 'cpu', 'ram', 'vram', 'os'].includes(row.id));
        let playability = score;

        if (criticalFailures.length) {
            playability = Math.min(playability, criticalFailures.some((row) => row.id === 'os') ? 35 : 58);
        }

        return {
            rows,
            minimum,
            recommended,
            score: Math.round(playability),
            rawScore: Math.round(score),
            minimumFailures,
            recommendedFailures,
            criticalFailures,
            verdict: verdictForScore(Math.round(playability), criticalFailures),
            scenarios: buildPlayScenarios(Math.round(playability), rows, criticalFailures),
            recommendations: buildRecommendations(Math.round(playability), rows, profile, criticalFailures),
        };
    }

    function buildPlayScenarios(score, rows, criticalFailures) {
        const byId = Object.fromEntries(rows.map((row) => [row.id, row]));
        const gpuScore = byId.gpu?.score ?? score;
        const cpuScore = byId.cpu?.score ?? score;
        const vramScore = byId.vram?.score ?? 100;
        const hasCriticalFailure = criticalFailures.length > 0;

        return [
            {
                label: '1080p Low',
                status: hasCriticalFailure ? (score >= 45 ? 'warn' : 'fail') : score >= 55 ? 'good' : 'warn',
                text: hasCriticalFailure ? (score >= 45 ? 'rizikové' : 'spíš ne') : score >= 55 ? 'pravděpodobně ano' : 'jen s rizikem',
            },
            {
                label: '1080p Medium',
                status: !hasCriticalFailure && score >= 72 && gpuScore >= 65 ? 'good' : score >= 58 ? 'warn' : 'fail',
                text: !hasCriticalFailure && score >= 72 && gpuScore >= 65 ? 'reálné' : score >= 58 ? 'na hraně' : 'spíš ne',
            },
            {
                label: '1080p High',
                status: !hasCriticalFailure && score >= 88 && gpuScore >= 88 && vramScore >= 85 ? 'good' : score >= 72 ? 'warn' : 'fail',
                text: !hasCriticalFailure && score >= 88 && gpuScore >= 88 && vramScore >= 85 ? 'ano' : score >= 72 ? 's ústupky' : 'ne',
            },
            {
                label: '30 FPS',
                status: !hasCriticalFailure && score >= 58 && gpuScore >= 45 && cpuScore >= 45 ? 'good' : score >= 44 ? 'warn' : 'fail',
                text: !hasCriticalFailure && score >= 58 && gpuScore >= 45 && cpuScore >= 45 ? 'realistické' : score >= 44 ? 'nejisté' : 'spíš ne',
            },
            {
                label: '60 FPS',
                status: !hasCriticalFailure && score >= 82 && gpuScore >= 75 && cpuScore >= 75 ? 'good' : score >= 62 ? 'warn' : 'fail',
                text: !hasCriticalFailure && score >= 82 && gpuScore >= 75 && cpuScore >= 75 ? 'pravděpodobné' : score >= 62 ? 'nejisté' : 'nepravděpodobné',
            },
        ];
    }

    function buildRecommendations(score, rows, profile, criticalFailures) {
        const recommendations = [];
        const byId = Object.fromEntries(rows.map((row) => [row.id, row]));
        const weakRows = rows
            .filter((row) => row.score != null && row.score < 76)
            .sort((a, b) => (a.score || 0) - (b.score || 0));

        if (criticalFailures.length) {
            recommendations.push(`Největší problém: ${criticalFailures.map((row) => row.label).join(', ')}.`);
        } else if (weakRows.length) {
            recommendations.push(`Nejslabší místo: ${weakRows[0].label}.`);
        } else {
            recommendations.push('Hardware je vyrovnaný vůči požadavkům hry.');
        }

        if (byId.gpu?.status !== 'good' || profile.gpu.integrated) {
            recommendations.push('Začni na nižších detailech a zapni FSR, XeSS nebo DLSS, pokud je hra nabízí.');
        }

        if (byId.vram?.status === 'fail') {
            recommendations.push('Sniž kvalitu textur, protože VRAM je pod minimem.');
        } else if (byId.vram?.status === 'warn') {
            recommendations.push('Textury drž spíš na low/medium, ať hra neškube při načítání scén.');
        }

        if (byId.ram?.status !== 'good' && byId.ram) {
            recommendations.push('Před hraním zavři prohlížeč a náročné aplikace na pozadí.');
        }

        if (byId.ssd?.status === 'fail') {
            recommendations.push('Instalace na SSD bude pravděpodobně nutná nebo silně doporučená.');
        }

        if (score < 60) {
            recommendations.push('Před nákupem zvaž demo, gameplay test na podobném hardwaru nebo refund okno Steamu.');
        }

        return recommendations.slice(0, 4);
    }

    function normalizeRequirementBlock(block) {
        if (!block) {
            return null;
        }

        const fields = block.fields || {};
        const allNotes = [fields.notes, ...(block.notes || [])].filter(Boolean).join(' ');
        const gpuText = [fields.gpu, allNotes].filter(Boolean).join(' ');

        return {
            rawText: block.rawText,
            fields,
            notesText: allNotes,
            requires64Bit: block.requires64Bit,
            requiresSsd: block.requiresSsd,
            windowsLevel: parseWindowsLevel(fields.os || block.rawText || ''),
            memoryMb: parseSizeMb(fields.memory || ''),
            storageMb: parseSizeMb(fields.storage || ''),
            vramMb: parseVramRequirement(gpuText),
            cpu: scoreRequirementCpu(fields.cpu || ''),
            gpu: scoreRequirementGpu(fields.gpu || ''),
        };
    }

    function evaluateCpu(profile, minimum, recommended) {
        const user = profile.cpu.scoreInfo;
        const minReq = minimum?.cpu?.score || null;
        const recReq = recommended?.cpu?.score || null;
        const componentScore = scoreComponent(user?.score, minReq, recReq);
        const minimumPass = passNumeric(user?.score, minReq);
        const recommendedPass = passNumeric(user?.score, recReq);

        return buildRow({
            id: 'cpu',
            label: 'Procesor',
            userValue: profile.cpu.name || 'Nenalezeno',
            requirementValue: describeRequirementModels(minimum?.cpu),
            recommendedValue: describeRequirementModels(recommended?.cpu),
            score: componentScore,
            minimumPass,
            recommendedPass,
            note: makeScoreNote(user, minimum?.cpu, recommended?.cpu),
        });
    }

    function evaluateGpu(profile, minimum, recommended) {
        const user = profile.gpu.scoreInfo;
        const minReq = minimum?.gpu?.score || null;
        const recReq = recommended?.gpu?.score || null;
        const componentScore = scoreComponent(user?.score, minReq, recReq);
        const minimumPass = passNumeric(user?.score, minReq);
        const recommendedPass = passNumeric(user?.score, recReq);
        const noteParts = [makeScoreNote(user, minimum?.gpu, recommended?.gpu)];

        if (profile.gpu.integrated) {
            noteParts.push('Integrované GPU: výkon ve hrách může více kolísat podle napájení, chlazení a sdílené paměti.');
        }

        return buildRow({
            id: 'gpu',
            label: 'Grafická karta',
            userValue: profile.gpu.name || 'Nenalezeno',
            requirementValue: describeRequirementModels(minimum?.gpu),
            recommendedValue: describeRequirementModels(recommended?.gpu),
            score: componentScore,
            minimumPass,
            recommendedPass,
            note: noteParts.filter(Boolean).join(' '),
        });
    }

    function evaluateRam(profile, minimum, recommended) {
        const user = profile.memory.ramMb || null;
        const minReq = minimum?.memoryMb || null;
        const recReq = recommended?.memoryMb || null;

        if (!user && !minReq && !recReq) {
            return null;
        }

        return buildRow({
            id: 'ram',
            label: 'RAM',
            userValue: formatMb(user),
            requirementValue: formatMb(minReq),
            recommendedValue: formatMb(recReq),
            score: scoreComponent(user, minReq, recReq),
            minimumPass: passNumeric(user, minReq),
            recommendedPass: passNumeric(user, recReq),
            note: '',
        });
    }

    function evaluateVram(profile, minimum, recommended) {
        const user = profile.gpu.effectiveVramMb || null;
        const minReq = minimum?.vramMb || null;
        const recReq = recommended?.vramMb || null;

        if (!user && !minReq && !recReq) {
            return null;
        }

        let note = '';
        if (profile.gpu.dedicatedVramMb && profile.gpu.advertisedVramMb && profile.gpu.advertisedVramMb > profile.gpu.dedicatedVramMb) {
            note = `Dedikovaná VRAM hlášená Steamem: ${formatMb(profile.gpu.dedicatedVramMb)}. Použitý odhad: ${formatMb(user)}.`;
        }

        return buildRow({
            id: 'vram',
            label: 'VRAM',
            userValue: formatMb(user),
            requirementValue: formatMb(minReq),
            recommendedValue: formatMb(recReq),
            score: scoreComponent(user, minReq, recReq),
            minimumPass: passNumeric(user, minReq),
            recommendedPass: passNumeric(user, recReq),
            note,
        });
    }

    function evaluateOs(profile, minimum, recommended) {
        const minPass = passOs(profile, minimum);
        const recPass = recommended ? passOs(profile, recommended) : null;

        return buildRow({
            id: 'os',
            label: 'Operační systém',
            userValue: profile.os.name || 'Nenalezeno',
            requirementValue: describeOsRequirement(minimum),
            recommendedValue: describeOsRequirement(recommended),
            score: minPass === false ? 0 : 100,
            minimumPass: minPass,
            recommendedPass: recPass,
            note: '',
        });
    }

    function evaluateDisk(profile, minimum, recommended) {
        const user = profile.storage.largestFreeBlockMb || profile.storage.totalFreeMb || null;
        const minReq = minimum?.storageMb || null;
        const recReq = recommended?.storageMb || minReq;

        if (!user && !minReq && !recReq) {
            return null;
        }

        return buildRow({
            id: 'disk',
            label: 'Volné místo',
            userValue: formatMb(user),
            requirementValue: formatMb(minReq),
            recommendedValue: formatMb(recReq),
            score: scoreComponent(user, minReq, recReq),
            minimumPass: passNumeric(user, minReq),
            recommendedPass: passNumeric(user, recReq),
            note: profile.storage.largestFreeBlockMb ? 'Použit největší volný blok na disku.' : '',
        });
    }

    function evaluateSsd(profile, minimum, recommended) {
        const minRequires = Boolean(minimum?.requiresSsd);
        const recRequires = Boolean(recommended?.requiresSsd);

        if (!minRequires && !recRequires) {
            return null;
        }

        const hasSsd = profile.storage.ssdCount == null ? null : profile.storage.ssdCount > 0;
        const score = hasSsd === false ? 0 : hasSsd === null ? 70 : 100;

        return buildRow({
            id: 'ssd',
            label: 'SSD',
            userValue: hasSsd === null ? 'Neznámé' : hasSsd ? 'Ano' : 'Ne',
            requirementValue: minRequires ? 'Vyžadováno' : 'Neuvedeno',
            recommendedValue: recRequires ? 'Vyžadováno' : 'Neuvedeno',
            score,
            minimumPass: minRequires ? hasSsd : null,
            recommendedPass: recRequires ? hasSsd : null,
            note: '',
        });
    }

    function buildRow(row) {
        const status = row.minimumPass === false
            ? 'fail'
            : row.recommendedPass === true
                ? 'good'
                : row.minimumPass === true
                    ? 'warn'
                    : 'unknown';

        return {
            ...row,
            status,
            statusText: statusText(status),
        };
    }

    function weightedScore(rows) {
        let total = 0;
        let weights = 0;

        rows.forEach((row) => {
            if (row.score == null || Number.isNaN(row.score)) {
                return;
            }
            const weight = WEIGHTS[row.id] || 0.05;
            total += row.score * weight;
            weights += weight;
        });

        return weights ? total / weights : 0;
    }

    function scoreComponent(userScore, minimumScore, recommendedScore) {
        if (!userScore) {
            return SCORE_UNKNOWN;
        }

        const min = minimumScore || recommendedScore;
        const rec = recommendedScore || minimumScore;

        if (!min && !rec) {
            return SCORE_UNKNOWN;
        }

        if (rec && min && rec > min) {
            if (userScore >= rec) {
                return 100;
            }
            if (userScore >= min) {
                return 60 + 40 * ((userScore - min) / (rec - min));
            }
            return clamp(60 * (userScore / min), 0, 59);
        }

        const target = rec || min;
        return clamp(100 * (userScore / target), 0, 100);
    }

    function passNumeric(userScore, requirementScore) {
        if (!requirementScore) {
            return null;
        }
        if (!userScore) {
            return false;
        }
        return userScore >= requirementScore;
    }

    function passOs(profile, requirement) {
        if (!requirement) {
            return null;
        }

        if (requirement.requires64Bit && !profile.os.is64Bit) {
            return false;
        }

        if (!requirement.windowsLevel) {
            return true;
        }

        if (!profile.os.windowsLevel) {
            return false;
        }

        return profile.os.windowsLevel >= requirement.windowsLevel;
    }

    function verdictForScore(score, criticalFailures) {
        if (criticalFailures.length) {
            return {
                className: 'fail',
                title: 'Pod minimem',
                text: 'Hra může běžet špatně nebo se nespustit. Největší problém: ' + criticalFailures.map((row) => row.label).join(', ') + '.',
            };
        }
        if (score >= 90) {
            return { className: 'good', title: 'Výborné', text: 'Hardware odpovídá doporučeným požadavkům nebo je převyšuje.' };
        }
        if (score >= 75) {
            return { className: 'good', title: 'Dobře hratelné', text: 'Hra by měla běžet pohodlně, jen ne vždy na nejvyšší detaily.' };
        }
        if (score >= 60) {
            return { className: 'warn', title: 'Hratelné s ústupky', text: 'Počítej s nižšími detaily, rozlišením nebo limitem FPS.' };
        }
        if (score >= 45) {
            return { className: 'warn', title: 'Na hraně', text: 'Výsledek je rizikový. Pomoci mohou nízké detaily a nižší rozlišení.' };
        }
        return { className: 'fail', title: 'Nevhodné', text: 'Hardware je výrazně pod požadavky hry.' };
    }

    function statusText(status) {
        if (status === 'good') {
            return 'Splňuje doporučené';
        }
        if (status === 'warn') {
            return 'Splňuje minimum';
        }
        if (status === 'fail') {
            return 'Nesplňuje minimum';
        }
        return 'Nelze určit';
    }

    function normalizeRequirementModels(requirement) {
        if (!requirement) {
            return [];
        }
        return requirement.candidates || [];
    }

    function describeRequirementModels(requirement) {
        const models = normalizeRequirementModels(requirement);
        if (!models.length) {
            return requirement?.raw || 'Neuvedeno';
        }

        return models
            .slice(0, 3)
            .map((item) => item.label || item.name)
            .join(' / ');
    }

    function makeScoreNote(user, minimum, recommended) {
        const parts = [];
        if (user?.score) {
            parts.push(`Odhad výkonu: ${Math.round(user.score)} bodů${user.label ? ` (${user.label})` : ''}.`);
        }
        if (minimum?.score) {
            parts.push(`Minimum: ${Math.round(minimum.score)}.`);
        }
        if (recommended?.score) {
            parts.push(`Doporučeno: ${Math.round(recommended.score)}.`);
        }
        return parts.join(' ');
    }

    function describeOsRequirement(requirement) {
        if (!requirement) {
            return 'Neuvedeno';
        }

        const parts = [];
        if (requirement.windowsLevel) {
            parts.push(`Windows ${requirement.windowsLevel}+`);
        }
        if (requirement.requires64Bit) {
            parts.push('64bit');
        }
        return parts.join(', ') || 'Neuvedeno';
    }

    function scoreRequirementCpu(value) {
        const candidates = splitHardwareCandidates(value)
            .map((candidate) => ({ ...scoreCpu(candidate), name: candidate }))
            .filter((candidate) => candidate.score);

        if (candidates.length) {
            const lowest = candidates.reduce((best, item) => item.score < best.score ? item : best, candidates[0]);
            return {
                raw: value,
                score: lowest.score,
                candidates,
                label: lowest.label || lowest.name,
            };
        }

        const generic = scoreGenericCpuRequirement(value);
        return {
            raw: value,
            score: generic,
            candidates: generic ? [{ name: value, score: generic, label: 'Obecný CPU požadavek' }] : [],
            label: generic ? 'Obecný CPU požadavek' : '',
        };
    }

    function scoreRequirementGpu(value) {
        const candidates = splitHardwareCandidates(stripVramPrefix(value))
            .map((candidate) => ({ ...scoreGpu(candidate), name: candidate }))
            .filter((candidate) => candidate.score);

        if (candidates.length) {
            const lowest = candidates.reduce((best, item) => item.score < best.score ? item : best, candidates[0]);
            return {
                raw: value,
                score: lowest.score,
                candidates,
                label: lowest.label || lowest.name,
            };
        }

        return {
            raw: value,
            score: null,
            candidates: [],
            label: '',
        };
    }

    function splitHardwareCandidates(value) {
        if (!value) {
            return [];
        }

        return String(value)
            .replace(/\([^)]*equivalent[^)]*\)/ig, '')
            .replace(/\([^)]*ekvivalent[^)]*\)/ig, '')
            .split(/\s+\/\s+|\s+or\s+|\s+nebo\s+|;\s*/i)
            .map((part) => part.replace(/^.*?,\s*(?=(amd|nvidia|geforce|gtx|rtx|intel|core|ryzen|radeon|arc)\b)/i, ''))
            .map((part) => cleanText(part))
            .filter((part) => part && part.length > 2);
    }

    function stripVramPrefix(value) {
        return String(value || '')
            .replace(/^\s*\d+(?:[,.]\d+)?\s*(?:gb|mb)\s*vram\s*,?\s*/i, '')
            .replace(/^\s*vram\s*:\s*\d+(?:[,.]\d+)?\s*(?:gb|mb)\s*,?\s*/i, '');
    }

    function scoreCpu(name, cores, speedMhz) {
        const normalized = normalize(name || '');
        for (const pattern of CPU_PATTERNS) {
            if (pattern.re.test(normalized)) {
                return { score: pattern.score, label: pattern.label, source: 'database' };
            }
        }

        const fallback = fallbackCpuScore(normalized, cores, speedMhz);
        return fallback ? { score: fallback.score, label: fallback.label, source: 'heuristic' } : { score: null, label: '', source: 'unknown' };
    }

    function scoreGpu(name) {
        const normalized = normalize(name || '');
        for (const pattern of GPU_PATTERNS) {
            if (pattern.re.test(normalized)) {
                return { score: pattern.score, label: pattern.label, source: 'database' };
            }
        }

        const fallback = fallbackGpuScore(normalized);
        return fallback ? { score: fallback.score, label: fallback.label, source: 'heuristic' } : { score: null, label: '', source: 'unknown' };
    }

    function fallbackCpuScore(normalized, cores, speedMhz) {
        const intel = normalized.match(/\bi([3579])\s*(\d{4,5})([a-z]*)\b/);
        if (intel) {
            const tier = Number(intel[1]);
            const model = intel[2];
            const generation = model.length === 5 ? Number(model.slice(0, 2)) : Number(model.slice(0, 1));
            const tierFactor = { 3: 0.52, 5: 0.78, 7: 1.0, 9: 1.24 }[tier] || 0.75;
            const generationBase = {
                2: 5000, 3: 5600, 4: 6500, 5: 6900, 6: 8000, 7: 9000, 8: 11600, 9: 12500,
                10: 15500, 11: 18000, 12: 25000, 13: 31500, 14: 34500,
            }[generation] || 12000;
            const suffixBoost = /k|x/.test(intel[3] || '') ? 1.08 : 1;
            return { score: generationBase * tierFactor * suffixBoost, label: `Core i${tier}-${model}` };
        }

        const ryzen = normalized.match(/\bryzen\s*([3579])\s*(\d{4})([a-z0-9]*)\b/);
        if (ryzen) {
            const tier = Number(ryzen[1]);
            const series = Number(ryzen[2][0]);
            const tierFactor = { 3: 0.56, 5: 0.78, 7: 1.0, 9: 1.34 }[tier] || 0.75;
            const seriesBase = { 1: 11600, 2: 15000, 3: 20500, 4: 22000, 5: 28500, 7: 37000, 8: 41000, 9: 46000 }[series] || 18000;
            const suffixBoost = /x|x3d/.test(ryzen[3] || '') ? 1.08 : 1;
            return { score: seriesBase * tierFactor * suffixBoost, label: `Ryzen ${tier} ${ryzen[2]}` };
        }

        if (cores && speedMhz) {
            return { score: cores * speedMhz * 0.64, label: `${cores} jader, ${Math.round(speedMhz)} MHz` };
        }

        return null;
    }

    function fallbackGpuScore(normalized) {
        const nvidia = normalized.match(/\b(?:rtx|gtx)\s*(\d{3,4})(?:\s*(ti|super))?\b/);
        if (nvidia) {
            const model = nvidia[1];
            const tier = Number(model.slice(-2));
            const generation = model.length === 4 ? Number(model.slice(0, 2)) : Number(model.slice(0, 1));
            const genBase = generation >= 50 ? 25000 : generation >= 40 ? 17000 : generation >= 30 ? 11500 : generation >= 20 ? 9000 : generation >= 10 ? 5200 : 2800;
            const tierFactor = Math.max(0.4, (tier - 35) / 35);
            const suffixBoost = nvidia[2] ? 1.18 : 1;
            return { score: genBase * tierFactor * suffixBoost, label: `${model}${nvidia[2] ? ' ' + nvidia[2].toUpperCase() : ''}` };
        }

        const radeon = normalized.match(/\brx\s*(\d{3,4})(?:\s*(xt|gre))?\b/);
        if (radeon) {
            const model = radeon[1];
            const generation = Number(model[0]);
            const tier = Number(model.slice(1, 3));
            const genBase = generation >= 9 ? 22000 : generation >= 7 ? 14500 : generation >= 6 ? 11800 : generation >= 5 ? 7800 : 4200;
            const tierFactor = Math.max(0.42, (tier - 35) / 35);
            const suffixBoost = radeon[2] ? 1.16 : 1;
            return { score: genBase * tierFactor * suffixBoost, label: `Radeon RX ${model}${radeon[2] ? ' ' + radeon[2].toUpperCase() : ''}` };
        }

        const arc = normalized.match(/\barc\s*([ab])\s*(\d{3})\b/);
        if (arc) {
            const seriesBoost = arc[1] === 'b' ? 1.35 : 1;
            const tier = Number(arc[2]);
            return { score: Math.max(2800, tier * 14 * seriesBoost), label: `Intel Arc ${arc[1].toUpperCase()}${arc[2]}` };
        }

        return null;
    }

    function scoreGenericCpuRequirement(value) {
        const normalized = normalize(value || '');
        let cores = null;

        const numericCores = normalized.match(/\b(\d+)\s*(?:core|jadro|jader|jadra)\b/);
        if (numericCores) {
            cores = Number(numericCores[1]);
        } else if (/\bdual\s*core\b/.test(normalized)) {
            cores = 2;
        } else if (/\bquad\s*core\b/.test(normalized)) {
            cores = 4;
        } else if (/\bsix\s*core\b/.test(normalized)) {
            cores = 6;
        } else if (/\bocta\s*core\b/.test(normalized)) {
            cores = 8;
        }

        const ghz = normalized.match(/\b(\d+(?:[,.]\d+)?)\s*ghz\b/);
        const speed = ghz ? parseFloat(ghz[1].replace(',', '.')) * 1000 : null;

        if (cores && speed) {
            return Math.round(cores * speed * 0.72);
        }

        if (cores) {
            return Math.round(cores * 2200);
        }

        return null;
    }

    function parseVramRequirement(value) {
        const textValue = String(value || '');
        const normalized = normalize(textValue);

        let match = normalized.match(/\b(\d+(?:[,.]\d+)?)\s*(gb|mb)\s*(?:vram|video memory|graficke pameti|graficka pamet)\b/);
        if (!match) {
            match = normalized.match(/\b(?:vram|video memory|graficke pameti|graficka pamet)\D{0,20}(\d+(?:[,.]\d+)?)\s*(gb|mb)\b/);
        }
        if (!match) {
            return null;
        }

        return sizePairToMb(match[1], match[2]);
    }

    function parseVramFromText(value) {
        const normalized = normalize(value || '');
        const match = normalized.match(/\((\d+(?:[,.]\d+)?)\s*(gb|mb)\)/) ||
            normalized.match(/\b(\d+(?:[,.]\d+)?)\s*(gb|mb)\b/);
        return match ? sizePairToMb(match[1], match[2]) : null;
    }

    function isIntegratedGpu(name) {
        const normalized = normalize(name || '');
        if (!normalized) {
            return false;
        }
        if (/intel.*arc\s*[ab]\d{3}/.test(normalized)) {
            return false;
        }
        return /intel.*(uhd|iris|xe|arc\s*\d{3}v|graphics)|radeon\s*(780m|890m|vega)|amd.*radeon.*graphics/.test(normalized);
    }

    function parseWindowsLevel(value) {
        const normalized = normalize(value || '');
        const levels = [];

        const regex = /\bwindows\s*(xp|vista|7|8|10|11)\b/g;
        let match;
        while ((match = regex.exec(normalized))) {
            const token = match[1];
            if (token === 'xp') {
                levels.push(5);
            } else if (token === 'vista') {
                levels.push(6);
            } else {
                levels.push(Number(token));
            }
        }

        return levels.length ? Math.min(...levels) : null;
    }

    function renderProfileSwitcher(profiles, activeProfile, id) {
        const items = profiles.items || [];
        if (!items.length) {
            return '';
        }

        return `
            <select id="${escapeHtml(id)}" class="steam-hw-profile-select" title="Vybrat HW profil">
                ${items.map((item) => `
                    <option value="${escapeHtml(item.id)}" ${item.id === activeProfile.id ? 'selected' : ''}>${escapeHtml(item.name || 'HW profil')}</option>
                `).join('')}
            </select>
        `;
    }

    function renderMissingProfileCard(requirements, profiles, activeProfile) {
        return `
            <div class="steam-hw-card">
                <div class="steam-hw-header">
                    <div class="steam-hw-logo" aria-hidden="true">HW</div>
                    <div class="steam-hw-heading">
                        <div class="steam-hw-title">Steam-HW</div>
                        <div class="steam-hw-subtitle">${escapeHtml(requirements.gameTitle)} - profil hardwaru není uložen</div>
                    </div>
                    ${renderProfileSwitcher(profiles, activeProfile, 'steam-hw-card-profile-select')}
                    <button type="button" class="steam-hw-button steam-hw-button-primary" data-steam-hw-action="open-settings">Nastavení</button>
                </div>
                <p class="steam-hw-muted">Vlož systémové informace ze Steam klienta a skript tady začne porovnávat tvůj hardware s požadavky hry. Uložení probíhá do cookies této stránky.</p>
            </div>
        `;
    }

    function renderEvaluationCard(requirements, profile, evaluation, options, profiles, activeProfile) {
        const rows = evaluation.rows.map((row) => renderEvaluationRow(row)).join('');
        const cardClass = options.compactDisplay ? 'steam-hw-card steam-hw-compact' : 'steam-hw-card';
        const scenarios = evaluation.scenarios.map((scenario) => `
            <div class="steam-hw-scenario ${escapeHtml(scenario.status)}">
                <strong>${escapeHtml(scenario.label)}</strong>
                <span>${escapeHtml(scenario.text)}</span>
            </div>
        `).join('');
        const recommendations = evaluation.recommendations.length
            ? `<div class="steam-hw-recommendations">${evaluation.recommendations.map((item) => `<div>${escapeHtml(item)}</div>`).join('')}</div>`
            : '';
        const warnings = profile.warnings.length
            ? `<div class="steam-hw-warnings">${profile.warnings.map((warning) => `<div>${escapeHtml(warning)}</div>`).join('')}</div>`
            : '';
        const technical = options.showTechnicalScores
            ? `<div class="steam-hw-muted steam-hw-small">Hrubé skóre před omezením za nesplněné minimum: ${evaluation.rawScore} %. Databáze výkonu je lokální a orientační.</div>`
            : '';

        return `
            <div class="${cardClass}">
                <div class="steam-hw-header">
                    <div class="steam-hw-logo" aria-hidden="true">HW</div>
                    <div class="steam-hw-heading">
                        <div class="steam-hw-title">Steam-HW</div>
                        <div class="steam-hw-subtitle">${escapeHtml(requirements.gameTitle)} - odhad hratelnosti</div>
                    </div>
                    <div class="steam-hw-actions">
                        ${renderProfileSwitcher(profiles, activeProfile, 'steam-hw-card-profile-select')}
                        <button type="button" class="steam-hw-toggle-button ${options.compactDisplay ? 'active' : ''}" data-steam-hw-action="toggle-compact" aria-pressed="${options.compactDisplay ? 'true' : 'false'}" title="Přepnout kompaktní zobrazení">Kompakt</button>
                        <button type="button" class="steam-hw-icon-button" data-steam-hw-action="refresh" title="Přepočítat">↻</button>
                        <button type="button" class="steam-hw-button" data-steam-hw-action="open-settings">Nastavení</button>
                    </div>
                </div>
                <div class="steam-hw-scoreline">
                    <div class="steam-hw-score ${escapeHtml(evaluation.verdict.className)}">${evaluation.score} %</div>
                    <div>
                        <div class="steam-hw-verdict ${escapeHtml(evaluation.verdict.className)}">${escapeHtml(evaluation.verdict.title)}</div>
                        <div class="steam-hw-muted">${escapeHtml(evaluation.verdict.text)}</div>
                    </div>
                </div>
                <div class="steam-hw-meter" aria-hidden="true">
                    <div class="steam-hw-meter-fill ${escapeHtml(evaluation.verdict.className)}" style="width: ${clamp(evaluation.score, 0, 100)}%"></div>
                </div>
                <div class="steam-hw-profile-summary">
                    ${escapeHtml(activeProfile.name || 'HW profil')}: ${escapeHtml(profile.cpu.name || 'CPU nenalezeno')} · ${escapeHtml(profile.gpu.name || 'GPU nenalezeno')} · ${escapeHtml(formatMb(profile.memory.ramMb))}
                </div>
                <div class="steam-hw-scenarios">${scenarios}</div>
                ${recommendations}
                <div class="steam-hw-grid">${rows}</div>
                ${warnings}
                ${technical}
            </div>
        `;
    }

    function renderEvaluationRow(row) {
        const rec = row.recommendedValue && row.recommendedValue !== 'Neuvedeno'
            ? `<span>Doporučené: ${escapeHtml(row.recommendedValue)}</span>`
            : '';
        const note = row.note ? `<div class="steam-hw-row-note">${escapeHtml(row.note)}</div>` : '';

        return `
            <div class="steam-hw-row">
                <div class="steam-hw-row-main">
                    <div class="steam-hw-row-label">${escapeHtml(row.label)}</div>
                    <div class="steam-hw-row-user">${escapeHtml(row.userValue || 'Neznámé')}</div>
                    <div class="steam-hw-row-req">
                        <span>Minimum: ${escapeHtml(row.requirementValue || 'Neuvedeno')}</span>
                        ${rec}
                    </div>
                    ${note}
                </div>
                <div class="steam-hw-pill ${escapeHtml(row.status)}">${escapeHtml(row.statusText)}</div>
            </div>
        `;
    }

    function renderPurchaseWarning(evaluation, requirements) {
        removePurchaseWarning();
        if (!evaluation || !requirements) {
            return;
        }

        const shouldWarn = evaluation.criticalFailures.length || evaluation.score < 62;
        if (!shouldWarn) {
            return;
        }

        const target = document.querySelector('.game_area_purchase_game_wrapper, .game_area_purchase, #game_area_purchase');
        if (!target || target.querySelector('#steam-hw-purchase-warning')) {
            return;
        }

        const warning = document.createElement('div');
        warning.id = 'steam-hw-purchase-warning';
        warning.className = `steam-hw-buy-warning ${evaluation.criticalFailures.length ? 'fail' : 'warn'}`;
        warning.innerHTML = `
            <strong>Steam-HW nákupní upozornění</strong>
            <span>${escapeHtml(evaluation.verdict.text)}</span>
            <button type="button" class="steam-hw-button" data-steam-hw-action="open-settings">Upravit HW profil</button>
        `;
        target.insertBefore(warning, target.firstChild);
    }

    function removePurchaseWarning() {
        const warning = document.getElementById('steam-hw-purchase-warning');
        if (warning) {
            warning.remove();
        }
    }

    function scheduleBadgeScan() {
        window.clearTimeout(badgeScanTimer);
        badgeScanTimer = window.setTimeout(scanAppBadges, 350);
    }

    function scanAppBadges() {
        const options = readOptions();
        if (!options.showStoreBadges) {
            document.querySelectorAll('.steam-hw-app-badge').forEach((badge) => badge.remove());
            document.querySelectorAll('[data-steam-hw-badge-bound]').forEach((element) => {
                delete element.dataset.steamHwBadgeBound;
            });
            return;
        }

        const activeProfile = getActiveProfile(readProfiles());
        if (!activeProfile.text.trim()) {
            return;
        }

        const seenAppIds = new Set();
        const candidates = Array.from(document.querySelectorAll('[data-ds-appid], a[href*="/app/"]'))
            .map((element) => ({ element, appId: extractAppId(element) }))
            .filter((item) => {
                if (!item.appId || item.element.dataset.steamHwBadgeBound || seenAppIds.has(item.appId)) {
                    return false;
                }
                seenAppIds.add(item.appId);
                return true;
            })
            .slice(0, BADGE_FETCH_LIMIT);

        candidates.forEach(({ element, appId }) => {
            element.dataset.steamHwBadgeBound = '1';
            const badge = createAppBadge('HW...', 'unknown');
            attachAppBadge(element, badge);
            evaluateAppBadge(appId, badge);
        });
    }

    function extractAppId(element) {
        const datasetId = element.getAttribute('data-ds-appid') || element.dataset?.dsAppid;
        if (datasetId) {
            const first = String(datasetId).split(',')[0].trim();
            if (/^\d+$/.test(first)) {
                return first;
            }
        }

        const href = element.getAttribute('href') || element.querySelector?.('a[href*="/app/"]')?.getAttribute('href') || '';
        const match = href.match(/\/app\/(\d+)/);
        return match ? match[1] : '';
    }

    function createAppBadge(label, status) {
        const badge = document.createElement('span');
        badge.className = `steam-hw-app-badge ${status}`;
        badge.textContent = label;
        return badge;
    }

    function attachAppBadge(element, badge) {
        const container = element.closest('.search_result_row, .wishlist_row, .tab_item, .recommendation_highlight, [data-ds-appid]') || element;
        if (container.querySelector?.('.steam-hw-app-badge')) {
            return;
        }
        container.classList.add('steam-hw-badge-host');
        container.appendChild(badge);
    }

    function evaluateAppBadge(appId, badge) {
        getAppRequirements(appId)
            .then((requirements) => {
                if (!requirements) {
                    setBadgeState(badge, 'HW ?', 'unknown', 'Požadavky se nepodařilo najít.');
                    return;
                }

                const options = readOptions();
                const activeProfile = getActiveProfile(readProfiles());
                const profile = parseSteamHardwareProfile(activeProfile.text, options, activeProfile);
                const evaluation = evaluateProfile(requirements, profile, options);
                const status = evaluation.criticalFailures.length || evaluation.score < 45
                    ? 'fail'
                    : evaluation.score < 70
                        ? 'warn'
                        : 'good';
                const label = status === 'good' ? 'HW OK' : status === 'warn' ? 'HW Low' : 'HW Risk';
                setBadgeState(badge, label, status, `${requirements.gameTitle}: ${evaluation.verdict.title} (${evaluation.score} %)`);
            })
            .catch(() => setBadgeState(badge, 'HW ?', 'unknown', 'Kontrola selhala.'));
    }

    function setBadgeState(badge, label, status, title) {
        badge.textContent = label;
        badge.className = `steam-hw-app-badge ${status}`;
        badge.title = title || label;
    }

    function getAppRequirements(appId) {
        if (appRequirementCache.has(appId)) {
            return Promise.resolve(appRequirementCache.get(appId));
        }

        return fetch(`/app/${appId}/?l=czech`, { credentials: 'include' })
            .then((response) => response.ok ? response.text() : '')
            .then((html) => {
                if (!html) {
                    appRequirementCache.set(appId, null);
                    return null;
                }
                const doc = new DOMParser().parseFromString(html, 'text/html');
                const requirements = parseRequirementsFromPage(doc);
                appRequirementCache.set(appId, requirements);
                return requirements;
            });
    }

    function openSettingsDialog() {
        closeSettingsDialog();

        const options = readOptions();
        const profiles = readProfiles();
        const activeProfile = getActiveProfile(profiles);
        const profileText = activeProfile.text || '';
        const overrides = normalizeOverrides(activeProfile.overrides);
        const survey = readSurveyCache();
        const modal = document.createElement('div');
        modal.id = 'steam-hw-modal';
        modal.innerHTML = `
            <div class="steam-hw-modal-backdrop" data-steam-hw-action="close-settings"></div>
            <div class="steam-hw-dialog" role="dialog" aria-modal="true" aria-labelledby="steam-hw-dialog-title">
                <div class="steam-hw-dialog-header">
                    <div>
                        <div id="steam-hw-dialog-title" class="steam-hw-dialog-title">Steam-HW nastavení</div>
                        <div class="steam-hw-muted">Profily a ruční opravy se ukládají do cookies domény store.steampowered.com.</div>
                    </div>
                    <button type="button" class="steam-hw-icon-button" data-steam-hw-action="close-settings" title="Zavřít">×</button>
                </div>
                <div class="steam-hw-onboarding">
                    <strong>Import ze Steamu</strong>
                    <span>Steam klient → Nápověda → Systémové informace → zkopírovat vše → vložit sem.</span>
                    <span>Data zůstávají lokálně v prohlížeči; skript je nikam neposílá, ale cookies se technicky posílají serveru Steam při požadavcích na store.steampowered.com.</span>
                </div>
                <div class="steam-hw-profile-tools">
                    <label>
                        <span>Profil</span>
                        ${renderProfileSwitcher(profiles, activeProfile, 'steam-hw-profile-select')}
                    </label>
                    <label>
                        <span>Název profilu</span>
                        <input id="steam-hw-profile-name" class="steam-hw-input" type="text" value="${escapeHtml(activeProfile.name || '')}" placeholder="Např. Můj notebook">
                    </label>
                    <div class="steam-hw-profile-buttons">
                        <button type="button" class="steam-hw-button" data-steam-hw-action="profile-new">Nový</button>
                        <button type="button" class="steam-hw-button" data-steam-hw-action="profile-duplicate">Duplikovat</button>
                        <button type="button" class="steam-hw-button steam-hw-button-danger" data-steam-hw-action="profile-delete">Smazat profil</button>
                    </div>
                </div>
                <textarea id="steam-hw-profile-input" class="steam-hw-textarea" spellcheck="false" placeholder="${escapeHtml(settingsPlaceholder())}">${escapeHtml(profileText)}</textarea>
                <div class="steam-hw-overrides">
                    <div class="steam-hw-section-title">Ruční opravy porovnání</div>
                    <label>
                        <span>CPU počítat jako</span>
                        <input id="steam-hw-override-cpu" class="steam-hw-input" type="text" value="${escapeHtml(overrides.cpuAs)}" placeholder="Např. Core i5-12600K">
                    </label>
                    <label>
                        <span>GPU počítat jako</span>
                        <input id="steam-hw-override-gpu" class="steam-hw-input" type="text" value="${escapeHtml(overrides.gpuAs)}" placeholder="Např. GeForce RTX 3060">
                    </label>
                    <label>
                        <span>VRAM ručně (GB)</span>
                        <input id="steam-hw-override-vram" class="steam-hw-input" type="number" min="0" step="0.5" value="${overrides.vramMb ? escapeHtml(formatNumberInput(overrides.vramMb / 1024)) : ''}">
                    </label>
                    <label>
                        <span>RAM ručně (GB)</span>
                        <input id="steam-hw-override-ram" class="steam-hw-input" type="number" min="0" step="0.5" value="${overrides.ramMb ? escapeHtml(formatNumberInput(overrides.ramMb / 1024)) : ''}">
                    </label>
                </div>
                <div class="steam-hw-options">
                    <label>
                        <input id="steam-hw-option-vram" type="checkbox" ${options.useAdvertisedVram ? 'checked' : ''}>
                        Použít VRAM uvedenou v názvu GPU, pokud Steam u integrované grafiky hlásí jen malou primární VRAM
                    </label>
                    <label>
                        <input id="steam-hw-option-scores" type="checkbox" ${options.showTechnicalScores ? 'checked' : ''}>
                        Zobrazovat technické skóre a poznámky k odhadu
                    </label>
                    <label>
                        <input id="steam-hw-option-compact" type="checkbox" ${options.compactDisplay ? 'checked' : ''}>
                        Použít kompaktnější zobrazení výsledku
                    </label>
                    <label>
                        <input id="steam-hw-option-survey" type="checkbox" ${options.useSteamSurvey ? 'checked' : ''}>
                        Používat Steam HW Survey jako pomocný seznam názvů hardwaru
                    </label>
                    <label>
                        <input id="steam-hw-option-badges" type="checkbox" ${options.showStoreBadges ? 'checked' : ''}>
                        Zobrazovat malé HW badge ve vyhledávání, wishlistu a seznamech her
                    </label>
                </div>
                <div class="steam-hw-survey-box">
                    <div>
                        <strong>Steam HW Survey cache</strong>
                        <span id="steam-hw-survey-status">${escapeHtml(describeSurveyCache(survey))}</span>
                    </div>
                    <button type="button" class="steam-hw-button" data-steam-hw-action="refresh-survey">Aktualizovat</button>
                </div>
                <div id="steam-hw-settings-preview" class="steam-hw-preview"></div>
                <div class="steam-hw-dialog-actions">
                    <button type="button" class="steam-hw-button steam-hw-button-danger" data-steam-hw-action="clear-settings">Vymazat</button>
                    <span class="steam-hw-dialog-spacer"></span>
                    <button type="button" class="steam-hw-button" data-steam-hw-action="close-settings">Zavřít</button>
                    <button type="button" class="steam-hw-button steam-hw-button-primary" data-steam-hw-action="save-settings">Uložit a porovnat</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        updateSettingsPreview(profileText);
        const input = document.getElementById('steam-hw-profile-input');
        if (input) {
            input.focus();
        }
    }

    function closeSettingsDialog() {
        const modal = document.getElementById('steam-hw-modal');
        if (modal) {
            modal.remove();
        }
    }

    function saveSettingsDialog() {
        const input = document.getElementById('steam-hw-profile-input');
        const vram = document.getElementById('steam-hw-option-vram');
        const scores = document.getElementById('steam-hw-option-scores');
        const compact = document.getElementById('steam-hw-option-compact');
        const survey = document.getElementById('steam-hw-option-survey');
        const badges = document.getElementById('steam-hw-option-badges');

        if (!input) {
            return;
        }

        saveCurrentDialogProfile();
        writeOptions({
            useAdvertisedVram: Boolean(vram?.checked),
            showTechnicalScores: Boolean(scores?.checked),
            compactDisplay: Boolean(compact?.checked),
            useSteamSurvey: Boolean(survey?.checked),
            showStoreBadges: Boolean(badges?.checked),
        });

        closeSettingsDialog();
        notify('Steam-HW', 'HW profil byl uložen.');
        renderPageAnalysis(true);
        scheduleBadgeScan();
    }

    function clearSettingsDialog() {
        deleteStoredValue(SCRIPT.profileKey);
        deleteStoredValue(SCRIPT.profilesKey);
        const input = document.getElementById('steam-hw-profile-input');
        const name = document.getElementById('steam-hw-profile-name');
        if (input) {
            input.value = '';
            updateSettingsPreview('');
        }
        if (name) {
            name.value = 'Můj počítač';
        }
        renderPageAnalysis(true);
        notify('Steam-HW', 'HW profil byl vymazán.');
    }

    function updateSettingsPreview(value) {
        const preview = document.getElementById('steam-hw-settings-preview');
        if (!preview) {
            return;
        }

        const profile = parseSteamHardwareProfile(value || '', readOptions(), { overrides: readDialogOverrides() });
        if (!value.trim()) {
            preview.innerHTML = '<div class="steam-hw-muted">Náhled profilu se zobrazí po vložení systémových informací.</div>';
            return;
        }

        preview.innerHTML = `
            <div class="steam-hw-preview-title">Načtený profil</div>
            <div class="steam-hw-preview-grid">
                <div><strong>Počítač</strong><span>${escapeHtml([profile.computer.manufacturer, profile.computer.model].filter(Boolean).join(' ') || 'Neznámé')}</span></div>
                <div><strong>OS</strong><span>${escapeHtml(profile.os.name || 'Nenalezeno')}</span></div>
                <div><strong>CPU</strong><span>${escapeHtml(profile.cpu.name || 'Nenalezeno')}</span></div>
                <div><strong>GPU</strong><span>${escapeHtml(profile.gpu.name || 'Nenalezeno')}</span></div>
                <div><strong>RAM</strong><span>${escapeHtml(formatMb(profile.memory.ramMb))}</span></div>
                <div><strong>VRAM</strong><span>${escapeHtml(formatMb(profile.gpu.effectiveVramMb))}</span></div>
            </div>
        `;
    }

    function settingsPlaceholder() {
        return [
            'Počítač:',
            'Výrobce: LENOVO',
            'Model: 83JQ',
            '',
            'Procesor:',
            'Značka CPU: Intel(R) Core(TM) Ultra 5 226V',
            'Rychlost: 3110 MHz',
            'Logické procesory: 8',
            'Fyzické procesory: 8',
            '',
            'Operační systém:',
            'Windows 11 (64bit)',
            '',
            'Grafická karta:',
            'Ovladač: Intel(R) Arc(TM) 130V GPU (8GB)',
            'Primární paměť VRAM: 128 MB',
            '',
            'Paměť:',
            'RAM: 15920 MB',
        ].join('\n');
    }

    function findInsertionTarget(requirementNode) {
        return requirementNode.closest('.game_page_autocollapse_ctn') ||
            requirementNode.closest('.game_page_autocollapse') ||
            requirementNode.closest('.sysreq_contents') ||
            requirementNode;
    }

    function createProfileRecord(name, textValue = '', overrides = {}) {
        const now = new Date().toISOString();
        return {
            id: `profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: cleanText(name) || 'Můj počítač',
            text: String(textValue || ''),
            overrides: normalizeOverrides(overrides),
            createdAt: now,
            updatedAt: now,
        };
    }

    function readProfiles() {
        const stored = readStoredValue(SCRIPT.profilesKey, null);
        if (stored && Array.isArray(stored.items)) {
            const normalized = normalizeProfiles(stored);
            if (JSON.stringify(stored) !== JSON.stringify(normalized)) {
                writeProfiles(normalized);
            }
            return normalized;
        }

        const legacyText = String(readStoredValue(SCRIPT.profileKey, '') || '');
        const firstProfile = createProfileRecord('Můj počítač', legacyText);
        const profiles = { activeId: firstProfile.id, items: [firstProfile] };
        writeProfiles(profiles);
        return profiles;
    }

    function normalizeProfiles(profiles) {
        const items = (profiles.items || [])
            .filter((item) => item && typeof item === 'object')
            .map((item, index) => ({
                id: cleanText(item.id || `profile-${index + 1}`),
                name: cleanText(item.name || `HW profil ${index + 1}`),
                text: String(item.text || ''),
                overrides: normalizeOverrides(item.overrides),
                createdAt: item.createdAt || new Date().toISOString(),
                updatedAt: item.updatedAt || item.createdAt || new Date().toISOString(),
            }));

        if (!items.length) {
            items.push(createProfileRecord('Můj počítač'));
        }

        const activeId = items.some((item) => item.id === profiles.activeId) ? profiles.activeId : items[0].id;
        return { activeId, items };
    }

    function writeProfiles(profiles) {
        writeStoredValue(SCRIPT.profilesKey, normalizeProfiles(profiles));
    }

    function getActiveProfile(profiles = readProfiles()) {
        return profiles.items.find((item) => item.id === profiles.activeId) || profiles.items[0];
    }

    function setActiveProfileId(profileId) {
        const profiles = readProfiles();
        if (!profiles.items.some((item) => item.id === profileId)) {
            return;
        }
        profiles.activeId = profileId;
        writeProfiles(profiles);
    }

    function normalizeOverrides(overrides = {}) {
        return {
            cpuAs: cleanText(overrides.cpuAs || ''),
            gpuAs: cleanText(overrides.gpuAs || ''),
            vramMb: normalizeOverrideMb(overrides.vramMb),
            ramMb: normalizeOverrideMb(overrides.ramMb),
        };
    }

    function normalizeOverrideMb(value) {
        const number = Number(value);
        return Number.isFinite(number) && number > 0 ? Math.round(number) : null;
    }

    function readDialogOverrides() {
        const vramGb = parseFloat(String(document.getElementById('steam-hw-override-vram')?.value || '').replace(',', '.'));
        const ramGb = parseFloat(String(document.getElementById('steam-hw-override-ram')?.value || '').replace(',', '.'));
        return normalizeOverrides({
            cpuAs: document.getElementById('steam-hw-override-cpu')?.value || '',
            gpuAs: document.getElementById('steam-hw-override-gpu')?.value || '',
            vramMb: Number.isFinite(vramGb) && vramGb > 0 ? vramGb * 1024 : null,
            ramMb: Number.isFinite(ramGb) && ramGb > 0 ? ramGb * 1024 : null,
        });
    }

    function saveCurrentDialogProfile(profileIdOverride) {
        const selector = document.getElementById('steam-hw-profile-select');
        const input = document.getElementById('steam-hw-profile-input');
        const name = document.getElementById('steam-hw-profile-name');
        const profiles = readProfiles();
        const profileId = profileIdOverride || selector?.value || profiles.activeId;
        const profile = profiles.items.find((item) => item.id === profileId) || getActiveProfile(profiles);

        profile.name = cleanText(name?.value || profile.name || 'Můj počítač');
        profile.text = String(input?.value || '');
        profile.overrides = readDialogOverrides();
        profile.updatedAt = new Date().toISOString();
        profiles.activeId = profile.id;
        writeProfiles(profiles);
        writeStoredValue(SCRIPT.profileKey, profile.text);
        return profile;
    }

    function switchSettingsProfile(profileId) {
        saveCurrentDialogProfile(readProfiles().activeId);
        setActiveProfileId(profileId);
        loadSettingsProfile(profileId);
    }

    function loadSettingsProfile(profileId) {
        if (profileId) {
            setActiveProfileId(profileId);
        }
        const profiles = readProfiles();
        const profile = getActiveProfile(profiles);
        const overrides = normalizeOverrides(profile.overrides);
        const selector = document.getElementById('steam-hw-profile-select');
        const name = document.getElementById('steam-hw-profile-name');
        const input = document.getElementById('steam-hw-profile-input');
        if (selector) {
            selector.value = profile.id;
        }
        if (name) {
            name.value = profile.name || '';
        }
        if (input) {
            input.value = profile.text || '';
        }
        setInputValue('steam-hw-override-cpu', overrides.cpuAs);
        setInputValue('steam-hw-override-gpu', overrides.gpuAs);
        setInputValue('steam-hw-override-vram', overrides.vramMb ? formatNumberInput(overrides.vramMb / 1024) : '');
        setInputValue('steam-hw-override-ram', overrides.ramMb ? formatNumberInput(overrides.ramMb / 1024) : '');
        updateSettingsPreview(profile.text || '');
    }

    function createProfileFromDialog() {
        saveCurrentDialogProfile();
        const profiles = readProfiles();
        const profile = createProfileRecord(`HW profil ${profiles.items.length + 1}`);
        profiles.items.push(profile);
        profiles.activeId = profile.id;
        writeProfiles(profiles);
        refreshSettingsDialogProfiles();
        loadSettingsProfile(profile.id);
    }

    function duplicateProfileFromDialog() {
        const source = saveCurrentDialogProfile();
        const profiles = readProfiles();
        const profile = createProfileRecord(`${source.name || 'HW profil'} kopie`, source.text, source.overrides);
        profiles.items.push(profile);
        profiles.activeId = profile.id;
        writeProfiles(profiles);
        refreshSettingsDialogProfiles();
        loadSettingsProfile(profile.id);
    }

    function deleteProfileFromDialog() {
        const profiles = readProfiles();
        const selector = document.getElementById('steam-hw-profile-select');
        const profileId = selector?.value || profiles.activeId;
        if (profiles.items.length <= 1) {
            profiles.items[0] = createProfileRecord('Můj počítač');
            profiles.activeId = profiles.items[0].id;
        } else {
            profiles.items = profiles.items.filter((item) => item.id !== profileId);
            profiles.activeId = profiles.items[0].id;
        }
        writeProfiles(profiles);
        refreshSettingsDialogProfiles();
        loadSettingsProfile(profiles.activeId);
        renderPageAnalysis(true);
    }

    function refreshSettingsDialogProfiles() {
        const oldSelector = document.getElementById('steam-hw-profile-select');
        if (!oldSelector) {
            return;
        }
        const profiles = readProfiles();
        const active = getActiveProfile(profiles);
        const wrapper = document.createElement('div');
        wrapper.innerHTML = renderProfileSwitcher(profiles, active, 'steam-hw-profile-select');
        oldSelector.replaceWith(wrapper.firstElementChild);
    }

    function setInputValue(id, value) {
        const input = document.getElementById(id);
        if (input) {
            input.value = value || '';
        }
    }

    function readProfileText() {
        return String(getActiveProfile(readProfiles()).text || '');
    }

    function writeProfileText(value) {
        const profiles = readProfiles();
        const profile = getActiveProfile(profiles);
        profile.text = String(value || '');
        profile.updatedAt = new Date().toISOString();
        writeProfiles(profiles);
        writeStoredValue(SCRIPT.profileKey, profile.text);
    }

    function toggleCompactDisplay() {
        const options = readOptions();
        writeOptions({ ...options, compactDisplay: !options.compactDisplay });
        renderPageAnalysis(true);
    }

    function readOptions() {
        const stored = readStoredValue(SCRIPT.optionsKey, DEFAULT_OPTIONS);
        if (!stored || typeof stored !== 'object') {
            return { ...DEFAULT_OPTIONS };
        }
        return { ...DEFAULT_OPTIONS, ...stored };
    }

    function writeOptions(options) {
        writeStoredValue(SCRIPT.optionsKey, { ...DEFAULT_OPTIONS, ...options });
    }

    function readStoredValue(key, fallback) {
        const cookieValue = readCookieStoredValue(key);
        if (cookieValue.found) {
            return cookieValue.value;
        }

        let legacyValue = fallback;
        let foundLegacy = false;

        try {
            if (typeof GM_getValue === 'function') {
                legacyValue = GM_getValue(key, fallback);
                foundLegacy = legacyValue !== fallback;
            }
        } catch (error) {
            console.warn(`${SCRIPT.name}: GM_getValue selhalo`, error);
        }

        if (!foundLegacy) {
            try {
                const localValue = window.localStorage.getItem(key);
                if (localValue != null) {
                    legacyValue = JSON.parse(localValue);
                    foundLegacy = true;
                }
            } catch (error) {
                console.warn(`${SCRIPT.name}: localStorage čtení selhalo`, error);
            }
        }

        if (foundLegacy) {
            writeCookieStoredValue(key, legacyValue);
            return legacyValue;
        }

        return fallback;
    }

    function writeStoredValue(key, value) {
        writeCookieStoredValue(key, value);

        try {
            if (typeof GM_setValue === 'function') {
                GM_setValue(key, value);
            }
        } catch (error) {
            console.warn(`${SCRIPT.name}: GM_setValue selhalo`, error);
        }
    }

    function deleteStoredValue(key) {
        deleteCookieStoredValue(key);

        try {
            if (typeof GM_deleteValue === 'function') {
                GM_deleteValue(key);
            }
        } catch (error) {
            console.warn(`${SCRIPT.name}: GM_deleteValue selhalo`, error);
        }

        try {
            window.localStorage.removeItem(key);
        } catch (error) {
            console.warn(`${SCRIPT.name}: localStorage mazání selhalo`, error);
        }
    }

    function readCookieStoredValue(key) {
        try {
            const base = cookieBaseName(key);
            const countRaw = readCookie(`${base}_count`);
            if (!countRaw) {
                return { found: false, value: null };
            }

            const count = Number(countRaw);
            if (!Number.isInteger(count) || count < 1 || count > COOKIE_MAX_CHUNKS) {
                deleteCookieStoredValue(key);
                return { found: false, value: null };
            }

            let encoded = '';
            for (let index = 0; index < count; index += 1) {
                const chunk = readCookie(`${base}_${index}`);
                if (chunk == null) {
                    return { found: false, value: null };
                }
                encoded += chunk;
            }

            return { found: true, value: JSON.parse(decodeURIComponent(encoded)) };
        } catch (error) {
            console.warn(`${SCRIPT.name}: cookie čtení selhalo`, error);
            return { found: false, value: null };
        }
    }

    function writeCookieStoredValue(key, value) {
        try {
            const base = cookieBaseName(key);
            const encoded = encodeURIComponent(JSON.stringify(value));
            const chunks = [];
            for (let index = 0; index < encoded.length; index += COOKIE_CHUNK_SIZE) {
                chunks.push(encoded.slice(index, index + COOKIE_CHUNK_SIZE));
            }

            if (chunks.length > COOKIE_MAX_CHUNKS) {
                console.warn(`${SCRIPT.name}: hodnota ${key} je příliš velká pro cookie úložiště`);
                return;
            }

            deleteCookieStoredValue(key);
            setCookie(`${base}_count`, String(chunks.length));
            chunks.forEach((chunk, index) => setCookie(`${base}_${index}`, chunk));
        } catch (error) {
            console.warn(`${SCRIPT.name}: cookie zápis selhal`, error);
        }
    }

    function deleteCookieStoredValue(key) {
        const base = cookieBaseName(key);
        expireCookie(`${base}_count`);
        for (let index = 0; index < COOKIE_MAX_CHUNKS; index += 1) {
            expireCookie(`${base}_${index}`);
        }
    }

    function cookieBaseName(key) {
        return `${SCRIPT.cookiePrefix}${String(key).replace(/[^a-z0-9]+/ig, '_')}`;
    }

    function readCookie(name) {
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
        return match ? match[1] : null;
    }

    function setCookie(name, value) {
        const secure = location.protocol === 'https:' ? '; Secure' : '';
        document.cookie = `${name}=${value}; Max-Age=${COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax${secure}`;
    }

    function expireCookie(name) {
        const secure = location.protocol === 'https:' ? '; Secure' : '';
        document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax${secure}`;
    }

    function readSurveyCache() {
        const cache = readStoredValue(SCRIPT.surveyKey, null);
        if (!cache || typeof cache !== 'object') {
            return { updatedAt: 0, month: '', gpuNames: [], osNames: [], ramNames: [] };
        }
        return {
            updatedAt: Number(cache.updatedAt) || 0,
            month: cleanText(cache.month || ''),
            gpuNames: Array.isArray(cache.gpuNames) ? cache.gpuNames.slice(0, 500) : [],
            osNames: Array.isArray(cache.osNames) ? cache.osNames.slice(0, 120) : [],
            ramNames: Array.isArray(cache.ramNames) ? cache.ramNames.slice(0, 80) : [],
        };
    }

    function describeSurveyCache(cache = readSurveyCache()) {
        if (!cache.updatedAt) {
            return 'zatím není stažena';
        }
        const date = new Date(cache.updatedAt);
        const dateText = Number.isNaN(date.getTime()) ? 'neznámé datum' : date.toLocaleDateString('cs-CZ');
        return `${cache.month || 'Steam HW Survey'} · ${cache.gpuNames.length} GPU názvů · aktualizováno ${dateText}`;
    }

    function refreshSurveyCacheIfNeeded() {
        const options = readOptions();
        const cache = readSurveyCache();
        if (!options.useSteamSurvey || Date.now() - cache.updatedAt < SURVEY_REFRESH_MS) {
            return;
        }
        refreshSurveyCache(false);
    }

    function refreshSurveyCache(force) {
        if (surveyRefreshInFlight) {
            return surveyRefreshInFlight;
        }

        const cache = readSurveyCache();
        if (!force && Date.now() - cache.updatedAt < SURVEY_REFRESH_MS) {
            return Promise.resolve(cache);
        }

        surveyRefreshInFlight = fetch('/hwsurvey/?l=english', { credentials: 'include' })
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                return response.text();
            })
            .then((html) => {
                const parsed = parseHardwareSurvey(html);
                writeStoredValue(SCRIPT.surveyKey, parsed);
                updateSurveyStatus(parsed);
                notify('Steam-HW', `Steam HW Survey cache aktualizována (${parsed.gpuNames.length} GPU názvů).`);
                return parsed;
            })
            .catch((error) => {
                console.warn(`${SCRIPT.name}: Steam HW Survey se nepodařilo stáhnout`, error);
                if (force) {
                    notify('Steam-HW', 'Steam HW Survey se nepodařilo aktualizovat.');
                }
                return cache;
            })
            .finally(() => {
                surveyRefreshInFlight = null;
            });

        return surveyRefreshInFlight;
    }

    function updateSurveyStatus(cache = readSurveyCache()) {
        const status = document.getElementById('steam-hw-survey-status');
        if (status) {
            status.textContent = describeSurveyCache(cache);
        }
    }

    function parseHardwareSurvey(html) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const pageText = cleanSurveyText(doc.body?.textContent || '');
        const lines = uniqueValues(pageText.split('\n').map(cleanText).filter(Boolean));
        const heading = cleanText(doc.querySelector('h1')?.textContent || '');
        const monthMatch = pageText.match(/Steam Hardware & Software Survey:\s*([^\n]+)/i);

        return {
            updatedAt: Date.now(),
            month: cleanText(monthMatch?.[1] || heading || 'Steam HW Survey'),
            gpuNames: lines.filter(looksLikeSurveyGpuName).slice(0, 500),
            osNames: lines.filter((line) => /^(windows|macos|ubuntu|arch linux|linux mint|fedora|debian|manjaro)/i.test(line)).slice(0, 120),
            ramNames: lines.filter((line) => /^(less than\s*)?\d+\s*gb$|^more than\s*\d+\s*gb$/i.test(line)).slice(0, 80),
        };
    }

    function cleanSurveyText(value) {
        return String(value || '')
            .replace(/\r/g, '')
            .replace(/\t+/g, '\n')
            .replace(/\n{2,}/g, '\n');
    }

    function looksLikeSurveyGpuName(line) {
        return /\b(nvidia|geforce|rtx|gtx|radeon|intel\s+(?:arc|uhd|iris|hd)|arc\s+[ab]?\d|vega|amd\s+radeon)\b/i.test(line) &&
            !/%|change|usage|systems|manufacturer|click|image/i.test(line) &&
            line.length >= 8 &&
            line.length <= 90;
    }

    function uniqueValues(values) {
        const seen = new Set();
        const result = [];
        values.forEach((value) => {
            const key = normalize(value);
            if (!key || seen.has(key)) {
                return;
            }
            seen.add(key);
            result.push(value);
        });
        return result;
    }

    function notify(title, textValue) {
        if (typeof GM_notification === 'function') {
            try {
                GM_notification({ title, text: textValue, timeout: 3000 });
                return;
            } catch (error) {
                console.warn(`${SCRIPT.name}: GM_notification selhalo`, error);
            }
        }
        console.info(`${title}: ${textValue}`);
    }

    function installStyles() {
        const css = `
            #steam-hw-result-card,
            #steam-hw-modal {
                color: #dfe3e6;
                font-family: Arial, Helvetica, sans-serif;
                line-height: 1.35;
            }

            .steam-hw-card {
                box-sizing: border-box;
                width: 100%;
                margin: 0 0 18px;
                padding: 16px;
                border: 1px solid rgba(102, 192, 244, 0.28);
                border-radius: 6px;
                background: linear-gradient(180deg, rgba(30, 45, 58, 0.96), rgba(18, 26, 35, 0.96));
                box-shadow: 0 10px 26px rgba(0, 0, 0, 0.28);
            }

            .steam-hw-header,
            .steam-hw-scoreline,
            .steam-hw-row,
            .steam-hw-dialog-header,
            .steam-hw-dialog-actions {
                display: flex;
                align-items: center;
                gap: 12px;
            }

            .steam-hw-header {
                justify-content: space-between;
                margin-bottom: 12px;
            }

            .steam-hw-logo {
                flex: 0 0 42px;
                width: 42px;
                height: 42px;
                display: grid;
                place-items: center;
                border-radius: 6px;
                background: #66c0f4;
                color: #0e141b;
                font-weight: 800;
                letter-spacing: 0;
            }

            .steam-hw-heading {
                flex: 1 1 auto;
                min-width: 0;
            }

            .steam-hw-title {
                font-size: 18px;
                font-weight: 700;
                color: #ffffff;
            }

            .steam-hw-subtitle,
            .steam-hw-muted,
            .steam-hw-row-req,
            .steam-hw-row-note,
            .steam-hw-profile-summary {
                color: #acb8c1;
            }

            .steam-hw-subtitle,
            .steam-hw-profile-summary {
                font-size: 13px;
            }

            .steam-hw-small {
                margin-top: 10px;
                font-size: 12px;
            }

            .steam-hw-actions {
                display: flex;
                flex: 0 0 auto;
                align-items: center;
                gap: 8px;
            }

            .steam-hw-profile-select,
            .steam-hw-input {
                box-sizing: border-box;
                border: 1px solid #3d4450;
                border-radius: 4px;
                background: #111820;
                color: #dfe3e6;
                font: inherit;
                min-height: 34px;
                padding: 6px 9px;
            }

            .steam-hw-profile-select {
                max-width: 180px;
            }

            .steam-hw-input:focus,
            .steam-hw-profile-select:focus {
                border-color: #66c0f4;
                box-shadow: 0 0 0 2px rgba(102, 192, 244, 0.22);
                outline: none;
            }

            .steam-hw-button,
            .steam-hw-toggle-button,
            .steam-hw-icon-button {
                box-sizing: border-box;
                border: 0;
                border-radius: 4px;
                background: #3d4450;
                color: #ffffff;
                cursor: pointer;
                font: inherit;
                min-height: 34px;
            }

            .steam-hw-button {
                padding: 7px 14px;
            }

            .steam-hw-toggle-button {
                border: 1px solid rgba(102, 192, 244, 0.32);
                padding: 6px 10px;
                background: rgba(61, 68, 80, 0.82);
            }

            .steam-hw-toggle-button.active {
                border-color: rgba(164, 208, 7, 0.72);
                background: rgba(164, 208, 7, 0.18);
                color: #c7ef49;
            }

            .steam-hw-icon-button {
                width: 34px;
                padding: 0;
                font-size: 19px;
                line-height: 1;
            }

            .steam-hw-button:hover,
            .steam-hw-toggle-button:hover,
            .steam-hw-icon-button:hover {
                background: #4d5665;
            }

            .steam-hw-toggle-button.active:hover {
                background: rgba(164, 208, 7, 0.26);
            }

            .steam-hw-button-primary {
                background: linear-gradient(90deg, #45a4ef, #2f6bd6);
            }

            .steam-hw-button-primary:hover {
                background: linear-gradient(90deg, #5bb6ff, #3f7df0);
            }

            .steam-hw-button-danger {
                background: #7a3340;
            }

            .steam-hw-button-danger:hover {
                background: #934052;
            }

            .steam-hw-scoreline {
                align-items: flex-start;
                margin: 8px 0 10px;
            }

            .steam-hw-score {
                flex: 0 0 auto;
                min-width: 92px;
                font-size: 34px;
                font-weight: 800;
                color: #ffffff;
            }

            .steam-hw-score.good,
            .steam-hw-verdict.good {
                color: #a4d007;
            }

            .steam-hw-score.warn,
            .steam-hw-verdict.warn {
                color: #f3c15d;
            }

            .steam-hw-score.fail,
            .steam-hw-verdict.fail {
                color: #ff7b72;
            }

            .steam-hw-verdict {
                font-size: 18px;
                font-weight: 700;
                margin-bottom: 3px;
            }

            .steam-hw-meter {
                height: 8px;
                overflow: hidden;
                border-radius: 4px;
                background: rgba(255, 255, 255, 0.12);
                margin: 8px 0 10px;
            }

            .steam-hw-meter-fill {
                height: 100%;
                background: #66c0f4;
            }

            .steam-hw-meter-fill.good {
                background: #a4d007;
            }

            .steam-hw-meter-fill.warn {
                background: #f3c15d;
            }

            .steam-hw-meter-fill.fail {
                background: #ff7b72;
            }

            .steam-hw-scenarios {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
                gap: 6px;
                margin-top: 10px;
            }

            .steam-hw-scenario {
                border-radius: 4px;
                padding: 7px 8px;
                background: rgba(255, 255, 255, 0.07);
            }

            .steam-hw-scenario strong,
            .steam-hw-scenario span {
                display: block;
            }

            .steam-hw-scenario strong {
                color: #ffffff;
                font-size: 12px;
            }

            .steam-hw-scenario span {
                color: #c8d2da;
                font-size: 12px;
            }

            .steam-hw-scenario.good {
                border-left: 3px solid #a4d007;
            }

            .steam-hw-scenario.warn {
                border-left: 3px solid #f3c15d;
            }

            .steam-hw-scenario.fail {
                border-left: 3px solid #ff7b72;
            }

            .steam-hw-recommendations {
                display: grid;
                gap: 5px;
                margin-top: 10px;
                padding: 9px 10px;
                border-left: 3px solid #66c0f4;
                background: rgba(102, 192, 244, 0.10);
                color: #dfe3e6;
                font-size: 12px;
            }

            .steam-hw-grid {
                display: grid;
                grid-template-columns: 1fr;
                gap: 8px;
                margin-top: 12px;
            }

            .steam-hw-card.steam-hw-compact {
                padding: 10px;
            }

            .steam-hw-card.steam-hw-compact .steam-hw-header {
                gap: 8px;
                margin-bottom: 8px;
            }

            .steam-hw-card.steam-hw-compact .steam-hw-logo {
                flex-basis: 32px;
                width: 32px;
                height: 32px;
                font-size: 12px;
            }

            .steam-hw-card.steam-hw-compact .steam-hw-title {
                font-size: 16px;
            }

            .steam-hw-card.steam-hw-compact .steam-hw-subtitle,
            .steam-hw-card.steam-hw-compact .steam-hw-scoreline .steam-hw-muted,
            .steam-hw-card.steam-hw-compact .steam-hw-row-note,
            .steam-hw-card.steam-hw-compact .steam-hw-small {
                display: none;
            }

            .steam-hw-card.steam-hw-compact .steam-hw-scoreline {
                align-items: center;
                gap: 8px;
                margin: 4px 0 6px;
            }

            .steam-hw-card.steam-hw-compact .steam-hw-score {
                min-width: 66px;
                font-size: 24px;
            }

            .steam-hw-card.steam-hw-compact .steam-hw-verdict {
                margin-bottom: 0;
                font-size: 15px;
            }

            .steam-hw-card.steam-hw-compact .steam-hw-meter {
                height: 6px;
                margin: 6px 0;
            }

            .steam-hw-card.steam-hw-compact .steam-hw-profile-summary {
                font-size: 12px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .steam-hw-card.steam-hw-compact .steam-hw-grid {
                grid-template-columns: repeat(auto-fit, minmax(245px, 1fr));
                gap: 6px;
                margin-top: 8px;
            }

            .steam-hw-card.steam-hw-compact .steam-hw-scenarios {
                grid-template-columns: repeat(auto-fit, minmax(112px, 1fr));
                margin-top: 6px;
            }

            .steam-hw-card.steam-hw-compact .steam-hw-scenario {
                padding: 5px 6px;
            }

            .steam-hw-card.steam-hw-compact .steam-hw-recommendations {
                margin-top: 6px;
                padding: 7px 8px;
            }

            .steam-hw-row {
                align-items: flex-start;
                justify-content: space-between;
                padding: 10px;
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 4px;
                background: rgba(0, 0, 0, 0.16);
            }

            .steam-hw-row-main {
                min-width: 0;
            }

            .steam-hw-card.steam-hw-compact .steam-hw-row {
                align-items: center;
                gap: 8px;
                padding: 6px 8px;
            }

            .steam-hw-card.steam-hw-compact .steam-hw-row-label,
            .steam-hw-card.steam-hw-compact .steam-hw-row-user {
                display: inline;
                font-size: 12px;
            }

            .steam-hw-card.steam-hw-compact .steam-hw-row-label::after {
                content: ": ";
            }

            .steam-hw-card.steam-hw-compact .steam-hw-row-req {
                margin-top: 2px;
                gap: 4px 8px;
                font-size: 11px;
            }

            .steam-hw-card.steam-hw-compact .steam-hw-pill {
                padding: 4px 6px;
                font-size: 11px;
            }

            .steam-hw-row-label {
                color: #ffffff;
                font-weight: 700;
            }

            .steam-hw-row-user {
                margin-top: 2px;
                overflow-wrap: anywhere;
            }

            .steam-hw-row-req {
                display: flex;
                flex-wrap: wrap;
                gap: 6px 12px;
                margin-top: 4px;
                font-size: 12px;
            }

            .steam-hw-row-note {
                margin-top: 5px;
                font-size: 12px;
            }

            .steam-hw-pill {
                flex: 0 0 auto;
                border-radius: 4px;
                padding: 5px 8px;
                font-size: 12px;
                font-weight: 700;
                white-space: nowrap;
            }

            .steam-hw-pill.good {
                background: rgba(164, 208, 7, 0.18);
                color: #c7ef49;
            }

            .steam-hw-pill.warn {
                background: rgba(243, 193, 93, 0.18);
                color: #ffd27a;
            }

            .steam-hw-pill.fail {
                background: rgba(255, 123, 114, 0.17);
                color: #ffaaa4;
            }

            .steam-hw-pill.unknown {
                background: rgba(172, 184, 193, 0.16);
                color: #c8d2da;
            }

            .steam-hw-warnings {
                margin-top: 10px;
                padding: 9px 10px;
                border-left: 3px solid #f3c15d;
                background: rgba(243, 193, 93, 0.12);
                color: #f3d59a;
                font-size: 12px;
            }

            .steam-hw-buy-warning {
                display: flex;
                align-items: center;
                gap: 10px;
                margin: 0 0 10px;
                padding: 10px;
                border-radius: 4px;
                background: rgba(243, 193, 93, 0.14);
                color: #f3d59a;
                font-size: 12px;
            }

            .steam-hw-buy-warning.fail {
                background: rgba(255, 123, 114, 0.14);
                color: #ffaaa4;
            }

            .steam-hw-buy-warning strong {
                color: #ffffff;
                white-space: nowrap;
            }

            .steam-hw-buy-warning span {
                flex: 1 1 auto;
            }

            .steam-hw-badge-host {
                position: relative;
            }

            .steam-hw-app-badge {
                position: absolute;
                right: 8px;
                top: 8px;
                z-index: 4;
                border-radius: 4px;
                padding: 3px 6px;
                background: rgba(15, 23, 31, 0.88);
                color: #dfe3e6;
                font-size: 11px;
                font-weight: 700;
                line-height: 1.2;
                pointer-events: none;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.28);
            }

            .steam-hw-app-badge.good {
                color: #c7ef49;
            }

            .steam-hw-app-badge.warn {
                color: #ffd27a;
            }

            .steam-hw-app-badge.fail {
                color: #ffaaa4;
            }

            #steam-hw-modal {
                position: fixed;
                inset: 0;
                z-index: 2147483647;
                display: flex;
                align-items: center;
                justify-content: center;
                box-sizing: border-box;
                padding: 14px;
                overflow: hidden;
            }

            .steam-hw-modal-backdrop {
                position: fixed;
                inset: 0;
                background: rgba(0, 0, 0, 0.66);
            }

            .steam-hw-dialog {
                position: relative;
                box-sizing: border-box;
                width: min(860px, 100%);
                max-height: calc(100vh - 28px);
                max-height: calc(100dvh - 28px);
                min-height: 0;
                display: flex;
                flex-direction: column;
                gap: 12px;
                padding: 18px;
                overflow-x: hidden;
                overflow-y: auto;
                overscroll-behavior: contain;
                border: 1px solid rgba(102, 192, 244, 0.32);
                border-radius: 6px;
                background: #20252d;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
                scrollbar-color: #4d5665 #111820;
            }

            .steam-hw-dialog-header {
                justify-content: space-between;
                align-items: flex-start;
            }

            .steam-hw-dialog-title {
                color: #ffffff;
                font-size: 22px;
                font-weight: 800;
            }

            .steam-hw-onboarding,
            .steam-hw-survey-box {
                display: flex;
                justify-content: space-between;
                gap: 12px;
                padding: 10px;
                border-radius: 4px;
                background: rgba(102, 192, 244, 0.10);
                color: #dfe3e6;
                font-size: 12px;
            }

            .steam-hw-onboarding {
                flex-direction: column;
                gap: 4px;
            }

            .steam-hw-survey-box strong,
            .steam-hw-survey-box span {
                display: block;
            }

            .steam-hw-survey-box span {
                color: #acb8c1;
            }

            .steam-hw-profile-tools,
            .steam-hw-overrides {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 10px;
            }

            .steam-hw-profile-tools label,
            .steam-hw-overrides label {
                display: grid;
                gap: 4px;
                min-width: 0;
            }

            .steam-hw-profile-tools .steam-hw-input,
            .steam-hw-overrides .steam-hw-input,
            .steam-hw-profile-tools .steam-hw-profile-select {
                width: 100%;
                max-width: none;
                min-width: 0;
            }

            .steam-hw-profile-tools label span,
            .steam-hw-overrides label span,
            .steam-hw-section-title {
                color: #acb8c1;
                font-size: 11px;
                font-weight: 700;
                text-transform: uppercase;
            }

            .steam-hw-profile-buttons {
                display: flex;
                align-items: end;
                flex-wrap: wrap;
                gap: 8px;
                grid-column: 1 / -1;
            }

            .steam-hw-section-title {
                grid-column: 1 / -1;
            }

            .steam-hw-textarea {
                box-sizing: border-box;
                width: 100%;
                min-height: 190px;
                max-height: min(360px, 42vh);
                max-height: min(360px, 42dvh);
                resize: vertical;
                padding: 12px;
                border: 1px solid #3d4450;
                border-radius: 4px;
                background: #111820;
                color: #dfe3e6;
                font: 13px/1.45 Consolas, Monaco, monospace;
                outline: none;
            }

            .steam-hw-textarea:focus {
                border-color: #66c0f4;
                box-shadow: 0 0 0 2px rgba(102, 192, 244, 0.22);
            }

            .steam-hw-options {
                display: grid;
                gap: 6px;
                color: #dfe3e6;
                font-size: 13px;
            }

            .steam-hw-options label {
                display: flex;
                align-items: flex-start;
                gap: 8px;
            }

            .steam-hw-options input {
                margin-top: 2px;
            }

            .steam-hw-preview {
                padding: 10px;
                border-radius: 4px;
                background: rgba(0, 0, 0, 0.18);
            }

            .steam-hw-preview-title {
                margin-bottom: 8px;
                color: #ffffff;
                font-weight: 700;
            }

            .steam-hw-preview-grid {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 8px 14px;
            }

            .steam-hw-preview-grid div {
                min-width: 0;
            }

            .steam-hw-preview-grid strong {
                display: block;
                color: #acb8c1;
                font-size: 11px;
                text-transform: uppercase;
            }

            .steam-hw-preview-grid span {
                display: block;
                overflow-wrap: anywhere;
            }

            .steam-hw-dialog-actions {
                justify-content: flex-end;
                position: sticky;
                bottom: -18px;
                z-index: 1;
                margin: 0 -18px -18px;
                padding: 10px 18px 18px;
                border-top: 1px solid rgba(255, 255, 255, 0.08);
                background: linear-gradient(180deg, rgba(32, 37, 45, 0.94), #20252d 28%);
            }

            .steam-hw-dialog-spacer {
                flex: 1 1 auto;
            }

            @media (max-width: 640px) {
                .steam-hw-header,
                .steam-hw-scoreline,
                .steam-hw-row {
                    align-items: stretch;
                    flex-direction: column;
                }

                .steam-hw-actions {
                    width: 100%;
                    flex-wrap: wrap;
                }

                .steam-hw-actions .steam-hw-button {
                    flex: 1 1 auto;
                }

                .steam-hw-profile-select {
                    max-width: none;
                    width: 100%;
                }

                .steam-hw-score {
                    min-width: 0;
                }

                .steam-hw-pill {
                    align-self: flex-start;
                    white-space: normal;
                }

                .steam-hw-preview-grid {
                    grid-template-columns: 1fr;
                }

                .steam-hw-profile-tools,
                .steam-hw-overrides {
                    grid-template-columns: 1fr;
                }

                .steam-hw-survey-box,
                .steam-hw-buy-warning {
                    align-items: stretch;
                    flex-direction: column;
                }

                .steam-hw-dialog-actions {
                    flex-wrap: wrap;
                }

                .steam-hw-dialog-spacer {
                    display: none;
                }
            }
        `;

        if (typeof GM_addStyle === 'function') {
            GM_addStyle(css);
            return;
        }

        const style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);
    }

    function isCpuSection(section) {
        return /procesor|processor|cpu/.test(section);
    }

    function isGpuSection(section) {
        return /graficka karta|graphics|video card|gpu/.test(section);
    }

    function isMemorySection(section) {
        return /pamet|memory/.test(section);
    }

    function isOsSection(section) {
        return /operacni system|operating system|system os|os/.test(section);
    }

    function looksLikeDriverVersion(value) {
        return /^\d+(?:[.\s]\d+){2,}/.test(value) || /^\d{1,2}\s+\d{1,2}\s+\d{4}$/.test(value);
    }

    function parseMhz(value) {
        const normalized = String(value || '').replace(',', '.');
        const ghz = normalized.match(/(\d+(?:\.\d+)?)\s*GHz/i);
        if (ghz) {
            return Math.round(parseFloat(ghz[1]) * 1000);
        }
        const mhz = normalized.match(/(\d+(?:\.\d+)?)\s*MHz/i);
        if (mhz) {
            return Math.round(parseFloat(mhz[1]));
        }
        return parseInteger(value);
    }

    function parseSizeMb(value) {
        const match = String(value || '').replace(',', '.').match(/(\d+(?:\.\d+)?)\s*(tb|tib|gb|gib|mb|mib|g|m)\b/i);
        if (!match) {
            return null;
        }
        return sizePairToMb(match[1], match[2]);
    }

    function sizePairToMb(amount, unit) {
        const number = parseFloat(String(amount).replace(',', '.'));
        const normalizedUnit = String(unit || '').toLowerCase();

        if (!Number.isFinite(number)) {
            return null;
        }
        if (normalizedUnit.startsWith('t')) {
            return Math.round(number * 1024 * 1024);
        }
        if (normalizedUnit.startsWith('g')) {
            return Math.round(number * 1024);
        }
        return Math.round(number);
    }

    function parseInteger(value) {
        const match = String(value || '').match(/\d+/);
        return match ? Number(match[0]) : null;
    }

    function formatMb(value) {
        if (!value) {
            return 'Neznámé';
        }
        if (value >= 1024 * 1024) {
            return `${trimNumber(value / 1024 / 1024)} TB`;
        }
        if (value >= 1024) {
            return `${trimNumber(value / 1024)} GB`;
        }
        return `${Math.round(value)} MB`;
    }

    function trimNumber(value) {
        return Number(value.toFixed(value >= 10 ? 1 : 2)).toLocaleString('cs-CZ');
    }

    function formatNumberInput(value) {
        return Number(value.toFixed(value >= 10 ? 1 : 2)).toString();
    }

    function cleanText(value) {
        return String(value || '')
            .replace(/\u00a0/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function text(element) {
        return cleanText(element?.innerText || element?.textContent || '');
    }

    function normalize(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\((?:r|tm)\)|®|™/ig, ' ')
            .toLowerCase()
            .replace(/&nbsp;/g, ' ')
            .replace(/[^a-z0-9+.#]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    main();
})();
