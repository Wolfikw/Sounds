/* ============================================================
   «Звуки живої природи» — app.js
   Генерація сторінок, навігація (клавіатура / свайпи / стрілки),
   меню, прогрес, reveal-анімації, вікторина.
   ============================================================ */

const $ = (sel, root = document) => root.querySelector(sel);

/* ---------- Стан ---------- */
const state = {
  index: 0,          // поточна сторінка (0-based)
  total: 0,
  transitioning: false,
  quizAnswered: false
};

let refs = {};         // DOM-посилання
const pages = [];      // { root, scroller, topic }
const blocksByPage = new Map();
let revealObserver = null;

/* ============================================================
   СТАРТ
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  if (!window.CONFIG || !Array.isArray(window.CONFIG.topics)) {
    console.error('CONFIG не знайдено або не містить topics.');
    return;
  }

  // Preloader
  const preloader = $('#preloader');
  if (preloader) {
    setTimeout(() => {
      preloader.classList.add('hidden');
      setTimeout(() => preloader.remove(), 800);
    }, 1800);
  }

  refs = {
    pages:      $('#pages'),
    headerCount:$('#header-count'),
    headerCur:  $('#header-current'),
    headerFill: $('#header-progress-fill'),
    vFill:      $('#v-progress-fill'),
    btnPrev:    $('#btn-prev'),
    btnNext:    $('#btn-next'),
    btnTop:     $('#btn-top'),
    btnMenu:    $('#btn-menu'),
    btnClose:   $('#btn-close-menu'),
    menuPanel:  $('#menu-panel'),
    menuOverlay:$('#menu-overlay'),
    toc:        $('#toc')
  };

  state.total = CONFIG.topics.length;

  buildPages();
  buildToc();
  bindNav();
  bindMenu();
  bindKeyboard();
  bindSwipe();

  goTo(0, { instant: true });

  // Підтримка прямого хеша (#conclusion)
  const initialHash = location.hash.replace('#', '');
  if (initialHash) {
    const idx = CONFIG.topics.findIndex(t => t.slug === initialHash);
    if (idx > 0) requestAnimationFrame(() => goTo(idx, { instant: true, updateHash: false }));
  }
});

/* ============================================================
   ГЕНЕРАЦІЯ СТОРІНОК
   ============================================================ */
function buildPages() {
  const frag = document.createDocumentFragment();

  CONFIG.topics.forEach((topic, i) => {
    const page = document.createElement('section');
    page.className = 'page';
    page.id = `page-${topic.slug}`;
    page.dataset.index = String(i);
    page.setAttribute('aria-hidden', i === 0 ? 'false' : 'true');
    page.setAttribute('aria-label', topic.title);
    page.style.setProperty('--accent', topic.accent || 'var(--accent)');
    page.style.setProperty('--accent-soft', hexToRgba(topic.accent || '#9ec97f', 0.12));

    page.innerHTML = renderPageHTML(topic, i);
    frag.appendChild(page);

    const scroller = page;
    const root = page.querySelector('.page-inner');
    pages.push({ root: scroller, inner: root, topic, index: i });
    blocksByPage.set(i, page.querySelectorAll('.block'));
  });

  refs.pages.appendChild(frag);
}

function renderPageHTML(t, i) {
  const isLast = i === CONFIG.topics.length - 1;

  const blocksHTML = t.blocks.map((b, bi) => renderBlock(b, bi, i)).join('');

  const footHTML = isLast
    ? `<div class="page-foot"><span>Кінець дослідження</span><button class="go-next" data-action="restart" type="button">На початок
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>
      </button></div>`
    : `<div class="page-foot">
        <span>${t.kicker || 'Розділ'} · ${String(i + 1).padStart(2, '0')}</span>
        <button class="go-next" data-action="next" type="button">Далі: ${nextTitle(i + 1)}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      </div>`;

  return `
    <div class="page-inner">
      <header class="hero">
        <div class="hero-kicker">${esc(t.kicker || '')}</div>
        <h1 class="hero-title">${esc(t.title)}</h1>
        <p class="hero-sub">${esc(t.subtitle || '')}</p>
        <p class="lead">${esc(t.lead || '')}</p>

        <figure class="figure" aria-label="Ілюстрація до теми">
          ${figureSVG(t)}
          <figcaption><b>ФІГ. ${String(i + 1).padStart(2, '0')}</b><span>${esc(figureCaption(t))}</span></figcaption>
        </figure>

        <span class="scroll-cue">Гортайте
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M6 13l6 6 6-6"/></svg>
        </span>
      </header>

      ${blocksHTML}
      ${isLast ? renderQuiz() : ''}
      ${footHTML}

      ${isLast ? endMark() : ''}
    </div>
  `;
}

function nextTitle(nextIndex) {
  const t = CONFIG.topics[nextIndex];
  return t ? t.title : 'Наступний розділ';
}

/* ---------- Окрема частина: рендер блоків ---------- */
function renderBlock(b, bi, pageIndex) {
  const num = String(bi + 1).padStart(2, '0');
  const delay = ` d${Math.min(bi, 4)}`;
  const section = (title) => title ? `<div class="section-num">${num}</div>` : '';

  switch (b.type) {
    case 'prose':
      return `
        <section class="block prose reveal${delay}">
          ${section(b.title)}
          ${b.title ? `<h2>${esc(b.title)}</h2>` : ''}
          ${b.paragraphs.map(p => `<p>${p}</p>`).join('')}
        </section>`;

    case 'list':
      return `
        <section class="block reveal${delay}">
          ${section(b.title)}
          ${b.title ? `<h2>${esc(b.title)}</h2>` : ''}
          <ul class="ed-list">
            ${b.items.map((it, n) => `
              <li>
                <span class="n">${String(n + 1).padStart(2, '0')}</span>
                <span>
                  <span class="t">${esc(it.title)}</span>
                  <span class="d">${esc(it.text)}</span>
                </span>
              </li>`).join('')}
          </ul>
        </section>`;

    case 'stats':
      return `
        <section class="block reveal${delay}">
          <div class="stat-row">
            ${b.items.map(s => `
              <div class="stat">
                <div class="v">${esc(s.value)}</div>
                <div class="l">${esc(s.label)}</div>
              </div>`).join('')}
          </div>
        </section>`;

    case 'keyterms':
      return `
        <section class="block reveal${delay}">
          ${section(b.title)}
          ${b.title ? `<h2>${esc(b.title)}</h2>` : ''}
          <dl class="terms">
            ${b.items.map(k => `
              <div class="term"><dt>${esc(k.term)}</dt><dd>${esc(k.def)}</dd></div>`).join('')}
          </dl>
        </section>`;

    case 'facts':
      return `
        <section class="block reveal${delay}">
          ${section(b.title)}
          ${b.title ? `<h2>${esc(b.title)}</h2>` : ''}
          <ul class="fact-list">
            ${b.items.map((f, n) => `
              <li>
                <span class="f-n">${String(n + 1).padStart(2, '0')}</span>
                <p>${esc(f)}</p>
              </li>`).join('')}
          </ul>
        </section>`;

    case 'quote':
      return `
        <blockquote class="pull reveal${delay}">
          <p>«${esc(b.text)}»</p>
          ${b.source ? `<cite>${esc(b.source)}</cite>` : ''}
        </blockquote>`;

    case 'note':
      return `
        <aside class="note reveal${delay}">
          <svg class="note-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>
          </svg>
          <div>
            <div class="note-label">${esc(b.label || 'Зауваження')}</div>
            <p class="note-text">${esc(b.text)}</p>
          </div>
        </aside>`;

    default:
      return '';
  }
}

/* ============================================================
   ЗМІСТ (TOC)
   ============================================================ */
function buildToc() {
  const frag = document.createDocumentFragment();

  CONFIG.topics.forEach((t, i) => {
    const li = document.createElement('li');
    li.dataset.index = String(i);
    if (i === state.index) li.classList.add('active');
    if (i < state.index) li.classList.add('done');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.innerHTML = `
      <span class="t-n">${String(i + 1).padStart(2, '0')}</span>
      <span class="t-name">${esc(t.title)}</span>
      <span class="t-dot" aria-hidden="true"></span>`;
    btn.addEventListener('click', () => {
      closeMenu();
      setTimeout(() => goTo(i), 180);
    });
    li.appendChild(btn);
    frag.appendChild(li);
  });

  refs.toc.appendChild(frag);
}

function refreshToc() {
  [...refs.toc.children].forEach((li, i) => {
    li.classList.toggle('active', i === state.index);
    li.classList.toggle('done', i < state.index);
  });
}

/* ============================================================
   НАВІГАЦІЯ
   ============================================================ */
function goTo(index, opts = {}) {
  const { instant = false, updateHash = true } = opts;
  if (index < 0 || index >= state.total) return;
  if (index === state.index && !instant) return;
  if (state.transitioning && !instant) return;

  state.transitioning = true;

  const current = pages[state.index];
  const target = pages[index];

  if (!target) { state.transitioning = false; return; }

  // Скидаємо скрол цільової сторінки
  if (current && current.root !== target.root) current.root.scrollTop = 0;

  // Перемальовуємо акцентні кольори під тему
  const accent = target.topic.accent || '#9ec97f';
  document.documentElement.style.setProperty('--accent', accent);
  document.documentElement.style.setProperty('--accent-soft', hexToRgba(accent, 0.12));

  state.index = index;

  // Оновлюємо видимість (aria-hidden + tab-order)
  pages.forEach((p, i) => {
    const isTarget = i === index;
    p.root.setAttribute('aria-hidden', isTarget ? 'false' : 'true');
    p.root.setAttribute('tabindex', isTarget ? '0' : '-1');
    // приховані сторінки не повинні бути фокусованими
    if (!isTarget) {
      p.root.querySelectorAll('button, a, input, [tabindex]:not([tabindex="-1"])').forEach(el => {
        el.setAttribute('tabindex', '-1');
      });
    } else {
      p.root.querySelectorAll('button, a, input').forEach(el => el.removeAttribute('tabindex'));
    }
  });

  // Позиціонуємо стрічку сторінок з premium transition
  if (instant) {
    refs.pages.style.transition = 'none';
    refs.pages.style.transform = `translate3d(${-index * 100}%, 0, 0)`;
    // форсуємо рефлоу
    void refs.pages.offsetWidth;
    refs.pages.style.transition = '';
  } else {
    // Smooth page transition with scale effect
    refs.pages.style.transform = `translate3d(${-index * 100}%, 0, 0)`;

    // Fade out current page smoothly
    if (current && current.root !== target.root) {
      current.root.style.transition = 'opacity 500ms var(--ease-out)';
      current.root.style.opacity = '0.5';
      setTimeout(() => {
        current.root.style.opacity = '';
        current.root.style.transition = '';
      }, 500);
    }

    // Fade in target page with delay
    target.root.style.transition = 'opacity 700ms var(--ease-smooth)';
    target.root.style.opacity = '0';
    setTimeout(() => {
      target.root.style.opacity = '1';
      setTimeout(() => {
        target.root.style.transition = '';
        // Update overlay height after page is shown
        updatePageOverlayHeight(target.root);
      }, 700);
    }, 150);
  }

  updateHeader(target);
  refreshToc();

  // Поява блоків
  initReveal(target.root);

  // Фокус і прокрутка
  if (!instant) {
    target.root.scrollTop = 0;
    // легкий фокус для скрінрідерів, без видимого скролу
    const focusTarget = target.root.querySelector('.hero-title');
    if (focusTarget) {
      focusTarget.setAttribute('tabindex', '-1');
      focusTarget.focus({ preventScroll: true });
    }
  }

  if (updateHash) {
    const slug = target.topic.slug;
    try { history.replaceState(null, '', `#${slug}`); } catch (_) { /* ignore */ }
  }

  // блокування під час анімації
  const dur = prefersReducedMotion() ? 0 : 750;
  setTimeout(() => { state.transitioning = false; }, dur);

  // Кінцеві стрілки
  updateNavButtons();
  updatePageProgress();
}

function updateHeader(topic) {
  refs.headerCount.textContent = `${String(state.index + 1).padStart(2, '0')} / ${String(state.total).padStart(2, '0')}`;
  refs.headerCur.textContent = topic.title;
  refs.headerFill.style.width = `${((state.index + 1) / state.total) * 100}%`;
  document.title = `${topic.title} — Звуки живої природи`;
}

function updateNavButtons() {
  refs.btnPrev.disabled = state.index === 0;
  refs.btnNext.disabled = state.index === state.total - 1;
}

/* ---------- прогрес вертикального скролу ---------- */
function updatePageProgress() {
  const p = pages[state.index];
  if (!p) return;
  const max = p.root.scrollHeight - p.root.clientHeight;
  const y = p.root.scrollTop;
  const pct = max > 0 ? Math.min(100, (y / max) * 100) : 0;
  if (refs.vFill) refs.vFill.style.height = `${pct}%`;
  if (refs.headerFill) refs.headerFill.style.width = `${((state.index + 1) / state.total) * 100}%`;
}

/* ---------- оновлення висоти overlay ---------- */
function updatePageOverlayHeight(pageElement) {
  if (!pageElement) return;
  const scrollHeight = pageElement.scrollHeight;
  pageElement.style.setProperty('--overlay-height', `${scrollHeight}px`);
}

/* ============================================================
   REVEAL (IntersectionObserver)
   ============================================================ */
function initReveal(rootEl) {
  const blocks = [...rootEl.querySelectorAll('.reveal')];
  if (!blocks.length) return;

  if (!('IntersectionObserver' in window) || prefersReducedMotion()) {
    blocks.forEach(b => b.classList.add('in'));
    return;
  }

  if (!revealObserver) {
    revealObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { root: pages[state.index].root, rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
  }

  // перевстановлюємо корінь спостерігача
  revealObserver.disconnect();
  revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { root: rootEl, rootMargin: '0px 0px -8% 0px', threshold: 0.06 });

  blocks.forEach(b => {
    b.classList.remove('in');
    revealObserver.observe(b);
  });

  // Блоки, що вже в кадрі, показуємо одразу
  requestAnimationFrame(() => {
    blocks.forEach(b => {
      const rect = b.getBoundingClientRect();
      if (rect.top < rootEl.clientHeight && rect.bottom > 0) b.classList.add('in');
    });
  });
}

/* ============================================================
   ПОДІЇ: клавіатура / свайпи / клік
   ============================================================ */
function bindNav() {
  refs.btnPrev.addEventListener('click', () => goTo(state.index - 1));
  refs.btnNext.addEventListener('click', () => goTo(state.index + 1));

  refs.btnTop.addEventListener('click', () => {
    const p = pages[state.index];
    if (p) p.root.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  });

  // Прокрутка прогресу
  refs.pages.addEventListener('scroll', () => {
    // оновлюємо тільки для того, у якому реально був скрол
  }, true);

  pages.forEach(p => {
    p.root.addEventListener('scroll', updatePageProgress, { passive: true });

    // Update overlay height to cover full scrollable content
    const updateOverlayHeight = () => {
      updatePageOverlayHeight(p.root);
    };

    // Initial height calculation
    requestAnimationFrame(() => {
      updateOverlayHeight();
    });

    // Update on resize
    window.addEventListener('resize', debounce(updateOverlayHeight, 150));
  });

  // Делеговані кліки (кнопки «далі» / «на початок»)
  refs.pages.addEventListener('click', (e) => {
    const nextBtn = e.target.closest('[data-action="next"]');
    if (nextBtn) { goTo(state.index + 1); return; }

    const restartBtn = e.target.closest('[data-action="restart"]');
    if (restartBtn) {
      if (state.quizAnswered) resetQuiz();
      goTo(0);
      return;
    }
  });

  // Прокрутка вгору/вниз на клавіатурі — нативна для сторінки
  // Оновлюємо прогрес при будь-якій зміні розміру
  window.addEventListener('resize', debounce(updatePageProgress, 120));
}

function bindMenu() {
  const open = () => {
    refs.menuPanel.classList.add('open');
    refs.menuOverlay.hidden = false;
    refs.menuOverlay.classList.add('visible');
    refs.menuPanel.setAttribute('aria-hidden', 'false');
    refs.btnMenu.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    const first = refs.toc.querySelector('button');
    if (first) setTimeout(() => first.focus(), 60);
  };

  const close = () => {
    refs.menuPanel.classList.remove('open');
    refs.menuOverlay.classList.remove('visible');
    refs.menuPanel.setAttribute('aria-hidden', 'true');
    refs.btnMenu.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    setTimeout(() => { refs.menuOverlay.hidden = true; }, 320);
    refs.btnMenu.focus();
  };

  refs.btnMenu.addEventListener('click', () => {
    if (refs.menuPanel.classList.contains('open')) close();
    else open();
  });
  refs.btnClose.addEventListener('click', close);
  refs.menuOverlay.addEventListener('click', close);

  // закриваємо меню кліком поза
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && refs.menuPanel.classList.contains('open')) close();
  });
}

function bindKeyboard() {
  document.addEventListener('keydown', (e) => {
    // не перехоплюємо, якщо в текстовому полі чи в меню
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;

    const menuOpen = refs.menuPanel.classList.contains('open');
    if (menuOpen) {
      if (e.key === 'Tab') {
        // тримаємо фокус у меню
        trapFocus(e, refs.menuPanel);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        goTo(state.index - 1);
        break;
      case 'ArrowRight':
        e.preventDefault();
        goTo(state.index + 1);
        break;
      case 'Home':
        e.preventDefault();
        goTo(0);
        break;
      case 'End':
        e.preventDefault();
        goTo(state.total - 1);
        break;
      default:
        break;
    }
  });
}

function bindSwipe() {
  let sx = 0, sy = 0, tracking = false, moved = false, scrolling = false;

  const root = refs.pages;

  root.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    if (refs.menuPanel.classList.contains('open')) return;
    sx = e.touches[0].clientX;
    sy = e.touches[0].clientY;
    tracking = true;
    moved = false;
    scrolling = false;
  }, { passive: true });

  root.addEventListener('touchmove', (e) => {
    if (!tracking || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - sx;
    const dy = e.touches[0].clientY - sy;

    // Визначаємо напрямок свайпу
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) {
      scrolling = true; // вертикальне прокручування
    }

    if (Math.abs(dx) > 10 && !scrolling) {
      moved = true; // горизонтальний свайп
    }
  }, { passive: true });

  root.addEventListener('touchend', (e) => {
    if (!tracking) return;
    tracking = false;
    if (!moved || scrolling) return; // ігноруємо, якщо це був скрол

    const t = e.changedTouches[0];
    const dx = t.clientX - sx;
    const dy = t.clientY - sy;
    const threshold = 60;

    // Горизонтальний свайп має бути значно більшим за вертикальний
    if (Math.abs(dx) > threshold && Math.abs(dx) > Math.abs(dy) * 2) {
      if (dx > 0) goTo(state.index - 1);
      else goTo(state.index + 1);
    }
  }, { passive: true });
}

function trapFocus(e, container) {
  const focusable = container.querySelectorAll('button, a[href], input, [tabindex]:not([tabindex="-1"])');
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

/* ============================================================
   ВІКТОРИНА
   ============================================================ */
function renderQuiz() {
  if (!Array.isArray(CONFIG.quiz) || !CONFIG.quiz.length) return '';

  const qs = CONFIG.quiz.map((q, qi) => `
    <fieldset class="quiz-q" data-q="${qi}" data-explain="${escAttr(q.explanation)}">
      <legend class="q-title"><span class="q-n">${String(qi + 1).padStart(2, '0')}</span>${esc(q.question)}</legend>
      <div class="quiz-options">
        ${q.options.map((o, oi) => `
          <label class="opt">
            <input type="radio" name="q${qi}" value="${oi}" data-correct="${o.correct ? '1' : '0'}">
            <span class="box" aria-hidden="true"></span>
            <span class="opt-text">${esc(o.text)}</span>
          </label>`).join('')}
      </div>
      <div class="q-why">${esc(q.explanation)}</div>
    </fieldset>
  `).join('');

  return `
    <section class="quiz" id="quiz">
      <div class="quiz-head">
        <h2>Перевірте себе</h2>
        <p>П’ять запитань за матеріалом курсу. Виберіть по одній відповіді в кожному.</p>
      </div>

      <form id="quiz-form" novalidate>
        ${qs}
        <div class="quiz-actions">
          <button class="btn btn--primary" type="submit" id="btn-check">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>
            Перевірити відповіді
          </button>
          <span class="quiz-hint" id="quiz-hint" style="align-self:center;font-size:12px;color:var(--paper-faint)"></span>
        </div>
      </form>

      <div class="quiz-result" id="quiz-result" role="status" aria-live="polite">
        <div class="result-top">
          <span class="result-score" id="quiz-score">0<small> / 5</small></span>
        </div>
        <p class="result-msg" id="quiz-msg"></p>
        <p class="result-note" id="quiz-note"></p>
        <div class="result-actions">
          <button class="btn" type="button" id="btn-retry">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>
            Пройти ще раз
          </button>
          <button class="btn" type="button" id="btn-review">Переглянути пояснення</button>
        </div>
      </div>
    </section>
  `;
}

function initQuiz() {
  const form = $('#quiz-form');
  if (!form) return;

  // Позначаємо вибране
  form.querySelectorAll('.opt input').forEach(input => {
    input.addEventListener('change', () => {
      const label = input.closest('.opt');
      form.querySelectorAll(`.opt`).forEach(o => o.classList.remove('checked'));
      label.classList.add('checked');
      $('#quiz-hint').textContent = '';
    });
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    checkQuiz();
  });

  $('#btn-retry').addEventListener('click', resetQuiz);
  $('#btn-review').addEventListener('click', () => {
    const q = $('#quiz');
    if (q) q.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  });
}

function checkQuiz() {
  if (state.quizAnswered) return;

  const questions = [...document.querySelectorAll('.quiz-q')];
  const unanswered = questions.filter(q => !q.querySelector('input:checked'));

  if (unanswered.length) {
    const hint = $('#quiz-hint');
    hint.textContent = `Відповідь ще не обрано: запитання ${unanswered.map(q => Number(q.dataset.q) + 1).join(', ')}.`;
    hint.style.color = 'var(--warn)';
    unanswered[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  let correct = 0;
  questions.forEach((q) => {
    const chosen = q.querySelector('input:checked');
    const right = q.querySelector('input[data-correct="1"]');
    const isRight = chosen && chosen.dataset.correct === '1';
    if (isRight) correct++;

    // позначаємо варіанти
    q.querySelectorAll('.opt').forEach(opt => {
      const inp = opt.querySelector('input');
      opt.classList.remove('checked');
      if (inp.dataset.correct === '1') opt.classList.add('is-correct');
      if (inp === chosen && inp.dataset.correct !== '1') opt.classList.add('is-wrong');
      inp.disabled = true;
    });

    q.querySelector('.q-why').classList.add('show');
  });

  state.quizAnswered = true;

  const total = questions.length;
  const score = $('#quiz-score');
  score.innerHTML = `${correct}<small> / ${total}</small>`;
  $('#quiz-msg').textContent = verdict(correct, total);
  $('#quiz-note').textContent = note(correct, total);

  const result = $('#quiz-result');
  result.classList.add('show');

  const btnCheck = $('#btn-check');
  if (btnCheck) { btnCheck.disabled = true; }

  // показуємо результат і трохи прокручуємо
  setTimeout(() => {
    result.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
  }, 120);
}

function resetQuiz() {
  state.quizAnswered = false;

  const form = $('#quiz-form');
  if (form) {
    form.querySelectorAll('input').forEach(i => { i.checked = false; i.disabled = false; });
    form.querySelectorAll('.opt').forEach(o => o.classList.remove('is-correct', 'is-wrong', 'checked'));
  }
  document.querySelectorAll('.q-why').forEach(w => w.classList.remove('show'));

  $('#quiz-result').classList.remove('show');
  $('#quiz-hint').textContent = '';

  const btn = $('#btn-check');
  if (btn) btn.disabled = false;

  const q = $('#quiz');
  if (q) q.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
}

function verdict(correct, total) {
  const pct = correct / total;
  if (pct === 1) return 'Ідеально — ви впевнено розбираєтеся в темі.';
  if (pct >= 0.8) return 'Дуже добре. Кілька деталей — і результат був би бездоганним.';
  if (pct >= 0.6) return 'Непогано: основа є, але частину понять варто повторити.';
  if (pct >= 0.4) return 'Помітно, що матеріал ще не закріплено. Поверніться до розділів 2–9.';
  return 'Варто перечитати курс: почніть із розділів про механізми звукоутворення.';
}

function note(correct, total) {
  if (correct === total) return 'Порада: спробуйте пояснити кожну відповідь власними словами — це закріпить знання.';
  if (correct >= 3) return 'Порада: зверніть увагу на розділи «Як утворюються звуки» та «Інфразвук і ультразвук».';
  return 'Порада: почніть з розділів 2–3, потім поверніться до вікторини.';
}

/* ============================================================
   ФІГУРИ (SVG, згенеровані програмно)
   ============================================================ */
function figureSVG(topic) {
  const accent = topic.accent || '#9ec97f';
  const common = `viewBox="0 0 720 300" role="img" aria-hidden="true"`;

  // Три варіанти: хвиля, спектр, тайм-сигнал
  const kind = (topic.id % 3); // 0,1,2 циклічно

  if (kind === 0) return waveFigure(accent);
  if (kind === 1) return spectrumFigure(accent);
  return rhythmFigure(accent);
}

function waveFigure(accent) {
  // синусоїда з поступовим згасанням
  const W = 720, H = 300, cy = 150;
  let d = `M 0 ${cy}`;
  for (let x = 0; x <= W; x += 2) {
    const t = x / W;
    const env = Math.exp(-t * 2.6);
    const y = cy - Math.sin(x * 0.055) * 58 * env - Math.sin(x * 0.019) * 14 * env;
    d += ` L ${x} ${y.toFixed(1)}`;
  }

  return `
  <svg ${''} viewBox="0 0 ${W} ${H}" role="img" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
    <defs>
      <linearGradient id="g${Math.random().toString(36).slice(2, 8)}" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="${accent}" stop-opacity="0.9"/>
        <stop offset="100%" stop-color="${accent}" stop-opacity="0.35"/>
      </linearGradient>
    </defs>
    <g opacity="0.35" stroke="${accent}" stroke-width="1">
      ${Array.from({ length: 9 }, (_, i) => `<line x1="0" x2="${W}" y1="${30 + i * 30}" y2="${30 + i * 30}" opacity="0.12"/>`).join('')}
    </g>
    <line x1="0" x2="${W}" y1="${cy}" y2="${cy}" stroke="${accent}" stroke-width="1" opacity="0.3"/>
    <path d="${d}" fill="none" stroke="${accent}" stroke-width="2.2" stroke-linecap="round"/>
    <path d="${d}" fill="none" stroke="${accent}" stroke-width="8" opacity="0.07" stroke-linecap="round"/>
    <g class="wave-anim" opacity="0.18">
      ${Array.from({ length: 3 }, (_, i) => `<path d="${wavePath(i)}" fill="none" stroke="${accent}" stroke-width="1"/>`).join('')}
    </g>
  </svg>`;
}

function wavePath(seed) {
  const W = 720, cy = 150;
  let d = `M 0 ${cy}`;
  for (let x = 0; x <= W + 120; x += 4) {
    const y = cy - Math.sin((x + seed * 40) * 0.045) * 52;
    d += ` L ${x} ${y.toFixed(1)}`;
  }
  return d;
}

function spectrumFigure(accent) {
  const W = 720, H = 300, base = 250;
  const bars = 44;
  const seedRnd = (i) => {
    const v = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
    return v - Math.floor(v);
  };

  return `
  <svg viewBox="0 0 ${W} ${H}" role="img" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
    <g opacity="0.5">
      <line x1="40" x2="40" y1="30" y2="${base}" stroke="${accent}" stroke-width="1"/>
      <line x1="40" x2="${W - 40}" y1="${base}" y2="${base}" stroke="${accent}" stroke-width="1"/>
    </g>
    ${Array.from({ length: bars }, (_, i) => {
      const h = 26 + seedRnd(i) * 170;
      const bw = (W - 120) / bars - 6;
      const x = 56 + i * ((W - 120) / bars);
      const op = 0.35 + seedRnd(i + 99) * 0.55;
      return `<rect x="${x.toFixed(1)}" y="${(base - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${accent}" opacity="${op.toFixed(2)}"/>`;
    }).join('')}
    <g font-family="ui-monospace, monospace" font-size="10" fill="${accent}" opacity="0.5">
      <text x="40" y="${base + 22}">20 Гц</text>
      <text x="${W / 2 - 22}" y="${base + 22}">10 кГц</text>
      <text x="${W - 96}" y="${base + 22}">20 кГц</text>
    </g>
  </svg>`;
}

function rhythmFigure(accent) {
  const W = 720, H = 300, cy = 150;
  const clicks = [70, 118, 160, 210, 254, 300, 340, 386, 424, 470, 512, 560, 604, 650];
  const rnd = (i) => { const v = Math.sin(i * 91.7 + 13.1) * 43758.5453; return v - Math.floor(v); };

  return `
  <svg viewBox="0 0 ${W} ${H}" role="img" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
    <line x1="20" x2="${W - 20}" y1="${cy}" y2="${cy}" stroke="${accent}" stroke-width="1" opacity="0.22"/>
    ${clicks.map((x, i) => {
      const h = 40 + rnd(i) * 78;
      const w = 2 + rnd(i + 5) * 2;
      return `<rect x="${x}" y="${cy - h / 2}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="1.5" fill="${accent}" opacity="${(0.35 + rnd(i + 2) * 0.5).toFixed(2)}"/>`;
    }).join('')}
    ${Array.from({ length: 5 }, (_, i) => {
      const x = 120 + i * 120;
      return `<circle cx="${x}" cy="${cy}" r="26" fill="none" stroke="${accent}" stroke-width="1" opacity="${(0.16 - i * 0.025).toFixed(2)}"/>`;
    }).join('')}
    <text x="22" y="42" font-family="ui-monospace, monospace" font-size="10" fill="${accent}" opacity="0.5">сигнал</text>
    <text x="22" y="${H - 26}" font-family="ui-monospace, monospace" font-size="10" fill="${accent}" opacity="0.4">час, с</text>
  </svg>`;
}

function figureCaption(t) {
  const map = {
    1: 'схема: хвиля тиску та її згасання',
    2: 'спектральний профіль акустичного сигналу',
    3: 'ритмічний сигнал: послідовність імпульсів'
  };
  return map[(t.id - 1) % 3 + 1] || 'акустична хвиля';
}

/* ============================================================
   ДРІБНІ УТИЛІТИ
   ============================================================ */
function endMark() {
  return `<svg class="end-mark" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
    <circle cx="16" cy="16" r="14" opacity="0.4"/>
    <path d="M8 16h16M16 8v16" opacity="0.7"/>
  </svg>`;
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function escAttr(s) { return esc(s); }

function hexToRgba(hex, alpha) {
  const h = String(hex).replace('#', '').trim();
  if (h.length !== 6) return `rgba(158, 201, 127, ${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function prefersReducedMotion() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function debounce(fn, wait) {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

/* Ініціалізація вікторини після побудови сторінок */
document.addEventListener('DOMContentLoaded', () => {
  // невелика затримка, щоб сторінки точно були в DOM
  setTimeout(() => { if ($('#quiz')) initQuiz(); }, 0);
});

/* Публічний API для відлагодження */
window.soundsApp = {
  get state() { return { ...state }; },
  goTo,
  get pages() { return pages.map(p => p.topic.slug); },
  initQuiz
};