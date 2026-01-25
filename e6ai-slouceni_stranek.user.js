// ==UserScript==
// @name         e6AI: Sloučení stránek + vlastní stránkování
// @namespace    https://e6ai.net/
// @version      1.0
// @description  Sloučí všechny stránky výsledků do jedné a umožní zvolit počet náhledů na stránku.
// @match        https://e6ai.net/posts*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const STORAGE_KEY_PER_PAGE = 'e6ai.merged.perPage';

  function log(...args) {
    console.log('[e6AI merge]', ...args);
  }

  function getPostsSection() {
    // Hlavní kontejner s náhledy
    const posts = document.querySelector('#posts');
    if (!posts) return null;
    const section = posts.querySelector('.posts-container') || posts;
    return { posts, section };
  }

  function getServerPageInfo() {
    const pagination = document.querySelector('nav.pagination.numbered');
    const approx = document.querySelector('.posts-index-stats .approximate-count');

    let totalPages = 1;
    let currentPage = 1;

    if (pagination) {
      const t = parseInt(pagination.getAttribute('data-total') || '1', 10);
      const c = parseInt(pagination.getAttribute('data-current') || '1', 10);
      if (!Number.isNaN(t) && t > 0) totalPages = t;
      if (!Number.isNaN(c) && c > 0) currentPage = c;
    } else if (approx) {
      const p = parseInt(approx.getAttribute('data-pages') || '1', 10);
      if (!Number.isNaN(p) && p > 0) totalPages = p;
    }

    return { totalPages, currentPage };
  }

  function createStyles() {
    const style = document.createElement('style');
    style.textContent = `
      #e6ai-merged-ui {
        margin: 8px 0;
        padding: 6px 10px;
        background: rgba(0,0,0,0.35);
        border-radius: 4px;
        font-size: 13px;
        display: flex;
        flex-wrap: wrap;
        gap: 8px 16px;
        align-items: center;
      }
      #e6ai-merged-ui .e6m-row {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      #e6ai-per-page {
        width: 80px;
      }
      #e6ai-merged-ui button {
        cursor: pointer;
        padding: 2px 6px;
        font-size: 12px;
      }
      #e6ai-page-info {
        font-weight: 600;
      }
      #e6ai-status {
        opacity: 0.8;
        font-style: italic;
      }
      #e6ai-merged-ui .e6m-status {
        margin-left: auto;
        gap: 12px;
      }
      @media (max-width: 800px) {
        #e6ai-merged-ui {
          flex-direction: column;
          align-items: flex-start;
        }
        #e6ai-merged-ui .e6m-status {
          margin-left: 0;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function buildUI(state, postsRoot) {
    createStyles();

    const ui = document.createElement('div');
    ui.id = 'e6ai-merged-ui';

    ui.innerHTML = `
      <div class="e6m-row">
        <label for="e6ai-per-page">Obrázků na stránku:</label>
        <input type="number" id="e6ai-per-page" min="1" step="1">
      </div>

      <div class="e6m-row">
        <button type="button" data-act="first">« První</button>
        <button type="button" data-act="prev">‹ Předchozí</button>
        <span id="e6ai-page-info">Strana 1 / 1</span>
        <button type="button" data-act="next">Další ›</button>
        <button type="button" data-act="last">Poslední »</button>
        <button type="button" data-act="all">Vše</button>
      </div>

      <div class="e6m-row e6m-status">
        <span id="e6ai-status"></span>
      </div>
    `;

    postsRoot.parentElement.insertBefore(ui, postsRoot);

    const perInput = ui.querySelector('#e6ai-per-page');
    const pageInfo = ui.querySelector('#e6ai-page-info');
    const status = ui.querySelector('#e6ai-status');

    state.ui = {
      container: ui,
      perPageInput: perInput,
      pageInfo,
      status
    };

    // Výchozí perPage: z localStorage nebo zhruba počet na stránce (nebo 250)
    const saved = parseInt(localStorage.getItem(STORAGE_KEY_PER_PAGE) || '', 10);
    if (Number.isFinite(saved) && saved > 0) {
      state.perPage = saved;
    } else if (state.allPosts.length > 0) {
      state.perPage = state.allPosts.length; // uživatelská stránka = 1 serverová
    } else {
      state.perPage = 250;
    }

    perInput.value = state.perPage;

    perInput.addEventListener('change', () => {
      const v = parseInt(perInput.value, 10);
      if (!Number.isFinite(v) || v <= 0) return;
      state.showAll = false;
      state.perPage = v;
      state.currentPage = 1;
      try {
        localStorage.setItem(STORAGE_KEY_PER_PAGE, String(v));
      } catch (e) {}
      applyClientPaging(state);
    });

    ui.addEventListener('click', (ev) => {
      const btn = ev.target.closest('button[data-act]');
      if (!btn) return;
      ev.preventDefault();
      const act = btn.getAttribute('data-act');
      if (!act) return;

      if (act === 'all') {
        state.showAll = true;
        applyClientPaging(state);
        return;
      }

      state.showAll = false;

      switch (act) {
        case 'first':
          state.currentPage = 1;
          break;
        case 'prev':
          if (state.currentPage > 1) state.currentPage--;
          break;
        case 'next':
          if (state.currentPage < state.totalPagesUser) state.currentPage++;
          break;
        case 'last':
          state.currentPage = state.totalPagesUser;
          break;
      }

      applyClientPaging(state);
    });
  }

  function setStatus(state, text) {
    if (state.ui && state.ui.status) {
      state.ui.status.textContent = text || '';
    }
  }

  function applyClientPaging(state) {
    const posts = state.allPosts;
    const total = posts.length;

    if (!total) {
      if (state.ui && state.ui.pageInfo) {
        state.ui.pageInfo.textContent = 'Žádné náhledy';
      }
      return;
    }

    if (state.showAll) {
      posts.forEach(el => {
        el.style.display = '';
      });
      state.totalPagesUser = 1;
      if (state.ui && state.ui.pageInfo) {
        state.ui.pageInfo.textContent = `Vše (${total} obrázků)`;
      }
      return;
    }

    let per = state.perPage;
    if (!Number.isFinite(per) || per <= 0) per = total;

    const totalPagesUser = Math.max(1, Math.ceil(total / per));
    state.totalPagesUser = totalPagesUser;

    if (state.currentPage < 1) state.currentPage = 1;
    if (state.currentPage > totalPagesUser) state.currentPage = totalPagesUser;

    const start = (state.currentPage - 1) * per;
    const end = start + per;

    posts.forEach((el, idx) => {
      if (idx >= start && idx < end) {
        el.style.display = '';
      } else {
        el.style.display = 'none';
      }
    });

    if (state.ui && state.ui.pageInfo) {
      state.ui.pageInfo.textContent =
        `Strana ${state.currentPage} / ${state.totalPagesUser} (${total} obrázků)`;
    }
  }

  async function fetchPageHtml(url) {
    const res = await fetch(url.toString(), {
      credentials: 'include'
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.text();
  }

  function extractPostsFromHtml(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const section = doc.querySelector('#posts .posts-container') || doc.querySelector('#posts');
    if (!section) return [];
    const articles = section.querySelectorAll('article.thumbnail');
    const result = [];
    articles.forEach(node => {
      const imported = document.importNode(node, true);
      result.push(imported);
    });
    return result;
  }

  async function loadAllServerPages(state, postsSection) {
    const { totalPages, currentPage } = state.serverInfo;
    if (totalPages <= 1) return;

    const baseUrl = new URL(window.location.href);

    for (let page = 1; page <= totalPages; page++) {
      if (page === currentPage) continue;

      const pageUrl = new URL(baseUrl.toString());
      pageUrl.searchParams.set('page', String(page));

      setStatus(state, `Načítám stránku ${page} / ${totalPages}…`);

      try {
        const html = await fetchPageHtml(pageUrl);
        const newPosts = extractPostsFromHtml(html);
        newPosts.forEach(el => postsSection.appendChild(el));
        state.allPosts.push(...newPosts);
        applyClientPaging(state);
      } catch (err) {
        log('Chyba při načítání stránky', page, err);
        setStatus(state, `Chyba při načítání stránky ${page}. Pokračuji…`);
      }
    }

    const pagination = document.querySelector('nav.pagination.numbered');
    if (pagination) {
      pagination.style.display = 'none';
    }

    setStatus(
      state,
      `Načteno ${state.allPosts.length} obrázků z ${totalPages} serverových stránek.`
    );
  }

  function init() {
    const postsInfo = getPostsSection();
    if (!postsInfo) {
      log('Nenalezen #posts, končím.');
      return;
    }

    const { posts, section } = postsInfo;
    const serverInfo = getServerPageInfo();

    const state = {
      allPosts: Array.from(section.querySelectorAll('article.thumbnail')),
      perPage: 0,
      currentPage: 1,
      totalPagesUser: 1,
      showAll: false,
      ui: null,
      serverInfo
    };

    if (!state.allPosts.length) {
      log('Nenalezeny žádné náhledy, nemám co stránkovat.');
      return;
    }

    buildUI(state, posts);
    applyClientPaging(state);

    // Asynchronně natáhnout zbytek serverových stránek
    if (serverInfo.totalPages > 1) {
      loadAllServerPages(state, section).catch(err => {
        log('Fatal loadAllServerPages error', err);
        setStatus(state, 'Chyba při načítání dalších stránek.');
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
