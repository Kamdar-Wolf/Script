// ==UserScript==
// @name              Steam-HW
// @name:cs           Steam-HW: porovnání hardwaru
// @namespace         https://github.com/Kamdar-Wolf/Script
// @version           1.0.0
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
        version: '0.1.0',
        author: 'Kamdar',
        license: 'MIT',
        profileKey: 'steam-hw.profileText',
        optionsKey: 'steam-hw.options',
    };

    const DEFAULT_OPTIONS = {
        useAdvertisedVram: true,
        showTechnicalScores: true,
        compactDisplay: false,
    };

    const SCORE_UNKNOWN = null;

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
        GM_registerMenuCommand('Vymazat uložený HW profil', () => {
            deleteStoredValue(SCRIPT.profileKey);
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
            }
        });

        document.addEventListener('input', (event) => {
            if (event.target && event.target.id === 'steam-hw-profile-input') {
                updateSettingsPreview(event.target.value);
            }
        });

        document.addEventListener('change', (event) => {
            if (!event.target || !['steam-hw-option-vram', 'steam-hw-option-scores', 'steam-hw-option-compact'].includes(event.target.id)) {
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
            timer = window.setTimeout(() => renderPageAnalysis(false), 250);
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
            return;
        }

        const profileText = readProfileText();
        const options = readOptions();
        let html;

        if (!profileText.trim()) {
            html = renderMissingProfileCard(requirements);
        } else {
            const profile = parseSteamHardwareProfile(profileText, options);
            const evaluation = evaluateProfile(requirements, profile, options);
            html = renderEvaluationCard(requirements, profile, evaluation, options);
        }

        const card = document.createElement('div');
        card.id = 'steam-hw-result-card';
        card.innerHTML = html;

        if (oldCard) {
            oldCard.replaceWith(card);
            return;
        }

        const insertionTarget = findInsertionTarget(requirements.node);
        if (!insertionTarget || !insertionTarget.parentNode) {
            return;
        }

        insertionTarget.parentNode.insertBefore(card, insertionTarget);
    }

    function parseRequirementsFromPage() {
        const sysReqNodes = Array.from(document.querySelectorAll('.game_area_sys_req, .sysreq_content'));
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
            text(document.querySelector('#appHubAppName')) ||
            text(document.querySelector('.apphub_AppName')) ||
            text(document.querySelector('h1')) ||
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

    function parseSteamHardwareProfile(input, options) {
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

        finalizeProfile(profile, options);
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

    function finalizeProfile(profile, options) {
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
        };
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

    function renderMissingProfileCard(requirements) {
        return `
            <div class="steam-hw-card">
                <div class="steam-hw-header">
                    <div class="steam-hw-logo" aria-hidden="true">HW</div>
                    <div class="steam-hw-heading">
                        <div class="steam-hw-title">Steam-HW</div>
                        <div class="steam-hw-subtitle">${escapeHtml(requirements.gameTitle)} - profil hardwaru není uložen</div>
                    </div>
                    <button type="button" class="steam-hw-button steam-hw-button-primary" data-steam-hw-action="open-settings">Nastavení</button>
                </div>
                <p class="steam-hw-muted">Vlož systémové informace ze Steam klienta a skript tady začne porovnávat tvůj hardware s požadavky hry.</p>
            </div>
        `;
    }

    function renderEvaluationCard(requirements, profile, evaluation, options) {
        const rows = evaluation.rows.map((row) => renderEvaluationRow(row)).join('');
        const cardClass = options.compactDisplay ? 'steam-hw-card steam-hw-compact' : 'steam-hw-card';
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
                    ${escapeHtml(profile.cpu.name || 'CPU nenalezeno')} · ${escapeHtml(profile.gpu.name || 'GPU nenalezeno')} · ${escapeHtml(formatMb(profile.memory.ramMb))}
                </div>
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

    function openSettingsDialog() {
        closeSettingsDialog();

        const options = readOptions();
        const profileText = readProfileText();
        const modal = document.createElement('div');
        modal.id = 'steam-hw-modal';
        modal.innerHTML = `
            <div class="steam-hw-modal-backdrop" data-steam-hw-action="close-settings"></div>
            <div class="steam-hw-dialog" role="dialog" aria-modal="true" aria-labelledby="steam-hw-dialog-title">
                <div class="steam-hw-dialog-header">
                    <div>
                        <div id="steam-hw-dialog-title" class="steam-hw-dialog-title">Steam-HW nastavení</div>
                        <div class="steam-hw-muted">Vlož sem systémové informace z klienta Steam.</div>
                    </div>
                    <button type="button" class="steam-hw-icon-button" data-steam-hw-action="close-settings" title="Zavřít">×</button>
                </div>
                <textarea id="steam-hw-profile-input" class="steam-hw-textarea" spellcheck="false" placeholder="${escapeHtml(settingsPlaceholder())}">${escapeHtml(profileText)}</textarea>
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

        if (!input) {
            return;
        }

        writeProfileText(input.value);
        writeOptions({
            useAdvertisedVram: Boolean(vram?.checked),
            showTechnicalScores: Boolean(scores?.checked),
            compactDisplay: Boolean(compact?.checked),
        });

        closeSettingsDialog();
        notify('Steam-HW', 'HW profil byl uložen.');
        renderPageAnalysis(true);
    }

    function clearSettingsDialog() {
        deleteStoredValue(SCRIPT.profileKey);
        const input = document.getElementById('steam-hw-profile-input');
        if (input) {
            input.value = '';
            updateSettingsPreview('');
        }
        renderPageAnalysis(true);
        notify('Steam-HW', 'HW profil byl vymazán.');
    }

    function updateSettingsPreview(value) {
        const preview = document.getElementById('steam-hw-settings-preview');
        if (!preview) {
            return;
        }

        const profile = parseSteamHardwareProfile(value || '', readOptions());
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

    function readProfileText() {
        return String(readStoredValue(SCRIPT.profileKey, '') || '');
    }

    function writeProfileText(value) {
        writeStoredValue(SCRIPT.profileKey, String(value || ''));
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
        try {
            if (typeof GM_getValue === 'function') {
                return GM_getValue(key, fallback);
            }
        } catch (error) {
            console.warn(`${SCRIPT.name}: GM_getValue selhalo`, error);
        }

        try {
            const localValue = window.localStorage.getItem(key);
            return localValue == null ? fallback : JSON.parse(localValue);
        } catch (error) {
            console.warn(`${SCRIPT.name}: localStorage čtení selhalo`, error);
            return fallback;
        }
    }

    function writeStoredValue(key, value) {
        try {
            if (typeof GM_setValue === 'function') {
                GM_setValue(key, value);
                return;
            }
        } catch (error) {
            console.warn(`${SCRIPT.name}: GM_setValue selhalo`, error);
        }

        try {
            window.localStorage.setItem(key, JSON.stringify(value));
        } catch (error) {
            console.warn(`${SCRIPT.name}: localStorage zápis selhal`, error);
        }
    }

    function deleteStoredValue(key) {
        try {
            if (typeof GM_deleteValue === 'function') {
                GM_deleteValue(key);
                return;
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
                gap: 8px;
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

            #steam-hw-modal {
                position: fixed;
                inset: 0;
                z-index: 2147483647;
            }

            .steam-hw-modal-backdrop {
                position: absolute;
                inset: 0;
                background: rgba(0, 0, 0, 0.66);
            }

            .steam-hw-dialog {
                position: absolute;
                left: 50%;
                top: 50%;
                transform: translate(-50%, -50%);
                box-sizing: border-box;
                width: min(860px, calc(100vw - 28px));
                max-height: min(760px, calc(100vh - 28px));
                display: flex;
                flex-direction: column;
                gap: 12px;
                padding: 18px;
                border: 1px solid rgba(102, 192, 244, 0.32);
                border-radius: 6px;
                background: #20252d;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
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

            .steam-hw-textarea {
                box-sizing: border-box;
                width: 100%;
                min-height: 300px;
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
                }

                .steam-hw-actions .steam-hw-button {
                    flex: 1 1 auto;
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
