(function () {
  "use strict";

  var STORAGE_KEY = "factograf.saved.v1";
  var CATEGORY_WORDS = {
    science: "наука космос физика биология ботаника",
    nature: "природа океан леса грибы птицы",
    geo: "география страны полюса масштабы рельеф катастрофы"
  };

  var heroSection = document.querySelector(".hero");
  var heroCard = document.getElementById("fact-01");
  var facts = Array.prototype.slice.call(document.querySelectorAll("[data-fact]"));
  var chips = Array.prototype.slice.call(document.querySelectorAll("[data-filter]"));
  var filterLinks = Array.prototype.slice.call(document.querySelectorAll("[data-filter-link]"));
  var defaultLabels = new WeakMap();

  var savedCount = document.getElementById("savedCount");
  var savedCounter = document.getElementById("savedCounter");
  var visibleCount = document.getElementById("visibleCount");
  var emptyState = document.getElementById("emptyState");
  var resetFilters = document.getElementById("resetFilters");

  var searchToggle = document.getElementById("searchToggle");
  var searchPanel = document.getElementById("searchPanel");
  var searchInput = document.getElementById("searchInput");
  var searchInfo = document.getElementById("searchInfo");
  var searchClose = document.getElementById("searchClose");

  var burger = document.getElementById("burger");
  var mobileMenu = document.getElementById("mobileMenu");
  var menuClose = document.getElementById("menuClose");

  var progressBar = document.getElementById("progressBar");
  var masthead = document.getElementById("masthead");
  var toast = document.getElementById("toast");
  var toastTimer = null;

  var digestForm = document.getElementById("digestForm");
  var digestEmail = document.getElementById("digestEmail");
  var digestError = document.getElementById("digestError");
  var digestOk = document.getElementById("digestOk");
  var digestFields = digestForm ? digestForm.querySelector(".digest__fields") : null;

  var activeFilter = "all";
  var query = "";
  var saved = loadSaved();

  /* ---------------- Storage ---------------- */

  function loadSaved() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      var validIds = facts.map(function (card) { return card.id.replace("fact-", ""); });
      return parsed.filter(function (id) {
        return typeof id === "string" && validIds.indexOf(id) !== -1;
      });
    } catch (error) {
      return [];
    }
  }

  function persistSaved() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch (error) {
      /* приватный режим — просто не сохраняем */
    }
  }

  function isSaved(id) {
    return saved.indexOf(id) !== -1;
  }

  /* ---------------- Toast ---------------- */

  function showToast(message) {
    if (!toast) return;
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add("is-visible");
    toastTimer = window.setTimeout(function () {
      toast.classList.remove("is-visible");
    }, 2600);
  }

  /* ---------------- Saved facts ---------------- */

  function syncSaveButtons() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-save]"), function (button) {
      var id = button.getAttribute("data-save");
      var pressed = isSaved(id);
      var label = button.querySelector(".action__label");

      button.setAttribute("aria-pressed", pressed ? "true" : "false");
      button.classList.toggle("is-saved", pressed);

      if (label) {
        if (!defaultLabels.has(label)) defaultLabels.set(label, label.textContent);
        label.textContent = pressed ? "Сохранено" : defaultLabels.get(label);
      }
    });

    if (savedCount) savedCount.textContent = String(saved.length);
    if (savedCounter) {
      savedCounter.classList.toggle("has-saved", saved.length > 0);
      savedCounter.setAttribute(
        "aria-label",
        saved.length === 0 ? "Нет сохранённых фактов" : "Сохранённых фактов: " + saved.length
      );
    }
  }

  function toggleSave(id) {
    if (!id) return;
    var index = saved.indexOf(id);
    var nowSaved;

    if (index === -1) {
      saved.push(id);
      nowSaved = true;
    } else {
      saved.splice(index, 1);
      nowSaved = false;
    }

    persistSaved();
    syncSaveButtons();
    showToast(nowSaved ? "Факт сохранён в закладки этого браузера" : "Факт убран из сохранённых");
  }

  /* ---------------- Share ---------------- */

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }

    return new Promise(function (resolve, reject) {
      var area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.top = "-1000px";
      document.body.appendChild(area);
      area.select();
      try {
        var ok = document.execCommand("copy");
        document.body.removeChild(area);
        ok ? resolve() : reject(new Error("copy failed"));
      } catch (error) {
        document.body.removeChild(area);
        reject(error);
      }
    });
  }

  function share(target) {
    var base = window.location.href.split("#")[0];
    var url = target === "issue" ? base : base + "#fact-" + target;
    var card = target === "issue" ? null : document.getElementById("fact-" + target);
    var heading = card ? card.querySelector("h1, h2, h3") : null;
    var title = heading ? heading.textContent.trim() : document.title;

    if (target !== "issue" && isFactHidden(target)) {
      resetAll();
      window.setTimeout(function () {
        card.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
      }, 60);
    }

    if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
      navigator.share({ title: title, url: url }).catch(function (error) {
        if (error && error.name === "AbortError") return;
        copyFallback(url);
      });
      return;
    }

    copyFallback(url);
  }

  function copyFallback(url) {
    copyText(url).then(
      function () {
        showToast("Ссылка скопирована в буфер обмена");
      },
      function () {
        showToast("Не удалось скопировать автоматически — адрес есть в строке браузера");
      }
    );
  }

  /* ---------------- Filtering & search ---------------- */

  function normalize(value) {
    return String(value).toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
  }

  function matchesFilter(category) {
    return activeFilter === "all" || category === activeFilter;
  }

  function matchesQuery(card) {
    if (!query) return true;
    var haystack = normalize(
      card.textContent + " " + (CATEGORY_WORDS[card.getAttribute("data-category")] || "")
    );
    return query.split(" ").every(function (word) {
      return haystack.indexOf(word) !== -1;
    });
  }

  function isFactHidden(id) {
    var card = document.getElementById("fact-" + id);
    if (!card) return true;
    if (card.classList.contains("is-hidden")) return true;
    return card === heroCard && heroSection !== null && heroSection.hidden;
  }

  function applyFilters(options) {
    var shown = 0;
    var heroWasHidden = heroSection ? heroSection.hidden : true;
    var heroHeight = heroSection && !heroWasHidden ? heroSection.offsetHeight : 0;

    facts.forEach(function (card) {
      var visible = matchesFilter(card.getAttribute("data-category")) && matchesQuery(card);
      if (card === heroCard) {
        if (heroSection) heroSection.hidden = !visible;
      } else {
        card.classList.toggle("is-hidden", !visible);
      }
      if (visible) shown += 1;
    });

    if (options && options.preserveScroll && heroSection && heroWasHidden !== heroSection.hidden) {
      window.scrollBy(0, heroSection.hidden ? -heroHeight : heroSection.offsetHeight);
    }

    if (visibleCount) visibleCount.textContent = "Показано " + shown + " из " + facts.length;
    if (emptyState) emptyState.hidden = shown !== 0;
    if (searchInfo) searchInfo.textContent = query ? "Найдено: " + shown : "";

    chips.forEach(function (chip) {
      var active = chip.getAttribute("data-filter") === activeFilter;
      chip.classList.toggle("is-active", active);
      chip.setAttribute("aria-pressed", active ? "true" : "false");
    });

    filterLinks.forEach(function (link) {
      var active = link.getAttribute("data-filter-link") === activeFilter;
      link.classList.toggle("is-active", active);
      if (active) {
        link.setAttribute("aria-current", "true");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  }

  function setFilter(value, options) {
    if (!value) return;
    activeFilter = value;

    if (options && options.keepQuery === false) {
      query = "";
      if (searchInput) searchInput.value = "";
    }

    applyFilters(options);
  }

  function resetAll(options) {
    activeFilter = "all";
    query = "";
    if (searchInput) searchInput.value = "";
    applyFilters(options);
  }

  function runSearch() {
    query = normalize(searchInput ? searchInput.value : "");
    applyFilters({ preserveScroll: true });
  }

  chips.forEach(function (chip) {
    chip.addEventListener("click", function () {
      setFilter(chip.getAttribute("data-filter"), { preserveScroll: true });
    });
  });

  filterLinks.forEach(function (link) {
    link.addEventListener("click", function (event) {
      var value = link.getAttribute("data-filter-link");
      if (!value) return;
      event.preventDefault();
      setFilter(value, { keepQuery: false });
      closeMobileMenu(false);

      var destination = link.getAttribute("href") === "#top" ? document.getElementById("top") : document.getElementById("rating");
      if (destination) {
        destination.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
      }
      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, "", link.getAttribute("href"));
      }
    });
  });

  if (resetFilters) {
    resetFilters.addEventListener("click", function () {
      resetAll();
      var rating = document.getElementById("rating");
      if (rating) rating.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
    });
  }

  /* ---------------- Search panel ---------------- */

  function openSearch() {
    if (!searchPanel || !searchToggle || !searchInput) return;
    searchPanel.hidden = false;
    searchToggle.setAttribute("aria-expanded", "true");
    searchInput.focus();
  }

  function closeSearch(clear) {
    if (!searchPanel || !searchToggle) return;
    searchPanel.hidden = true;
    searchToggle.setAttribute("aria-expanded", "false");
    if (clear) {
      resetAll({ preserveScroll: true });
    }
  }

  if (searchToggle) {
    searchToggle.addEventListener("click", function () {
      if (searchPanel.hidden) {
        openSearch();
      } else {
        closeSearch(true);
      }
    });
  }

  if (searchClose) {
    searchClose.addEventListener("click", function () {
      closeSearch(true);
      if (searchToggle) searchToggle.focus();
    });
  }

  if (searchInput) {
    var searchTimer = null;
    searchInput.addEventListener("input", function () {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(runSearch, 120);
    });
    searchInput.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeSearch(true);
        if (searchToggle) searchToggle.focus();
      }
    });
  }

  /* ---------------- Mobile menu ---------------- */

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function openMobileMenu() {
    if (!mobileMenu || !burger) return;
    mobileMenu.classList.add("is-open");
    mobileMenu.setAttribute("aria-hidden", "false");
    burger.setAttribute("aria-expanded", "true");
    burger.classList.add("is-open");
    burger.setAttribute("aria-label", "Закрыть меню");
    document.body.classList.add("is-locked");
    if (menuClose) {
      window.requestAnimationFrame(function () {
        menuClose.focus({ preventScroll: true });
      });
    }
  }

  function closeMobileMenu(restoreFocus) {
    if (!mobileMenu || !burger) return;
    mobileMenu.classList.remove("is-open");
    mobileMenu.setAttribute("aria-hidden", "true");
    burger.setAttribute("aria-expanded", "false");
    burger.classList.remove("is-open");
    burger.setAttribute("aria-label", "Открыть меню");
    document.body.classList.remove("is-locked");
    if (restoreFocus !== false) {
      burger.focus({ preventScroll: true });
    }
  }

  if (burger) {
    burger.addEventListener("click", function () {
      if (mobileMenu.classList.contains("is-open")) {
        closeMobileMenu(true);
      } else {
        openMobileMenu();
      }
    });
  }

  if (menuClose) {
    menuClose.addEventListener("click", function () {
      closeMobileMenu(true);
    });
  }

  if (mobileMenu) {
    mobileMenu.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        closeMobileMenu(false);
      });
    });

    mobileMenu.addEventListener("keydown", function (event) {
      if (event.key !== "Tab") return;
      var focusable = mobileMenu.querySelectorAll("a[href], button:not([disabled])");
      if (!focusable.length) return;
      var first = focusable[0];
      var last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
  }

  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") return;
    if (mobileMenu && mobileMenu.classList.contains("is-open")) {
      closeMobileMenu(true);
      return;
    }
    if (searchPanel && !searchPanel.hidden) {
      closeSearch(true);
      if (searchToggle) searchToggle.focus();
    }
  });

  /* ---------------- Save & share buttons ---------------- */

  document.addEventListener("click", function (event) {
    var saveButton = event.target.closest("[data-save]");
    if (saveButton) {
      toggleSave(saveButton.getAttribute("data-save"));
      return;
    }

    var shareButton = event.target.closest("[data-share]");
    if (shareButton) {
      share(shareButton.getAttribute("data-share"));
    }
  });

  /* ---------------- Sidebar deep links ---------------- */

  var tocLinks = document.querySelectorAll('a[href^="#fact-"]');
  Array.prototype.forEach.call(tocLinks, function (link) {
    link.addEventListener("click", function () {
      if (activeFilter !== "all" || query) {
        resetAll();
      }
    });
  });

  /* ---------------- Digest form ---------------- */

  if (digestForm && digestEmail) {
    digestForm.addEventListener("submit", function (event) {
      event.preventDefault();
      var value = digestEmail.value.trim();
      var valid = /^[^\s@]+@[^\s@]+\.[^\s@а-яА-Я]{2,}$/.test(value);

      if (!value) {
        showDigestError("Введите email — без него не получится подписаться.");
      } else if (!valid) {
        showDigestError("Проверьте адрес: похоже, в нём опечатка.");
      } else {
        digestEmail.removeAttribute("aria-invalid");
        if (digestError) digestError.textContent = "";
        if (digestFields) digestFields.hidden = true;
        if (digestOk) {
          digestOk.hidden = false;
          digestOk.focus();
        }
        digestForm.reset();
        showToast("Демо-подписка оформлена — письма не отправляются");
      }
    });

    digestEmail.addEventListener("input", function () {
      if (digestError && digestError.textContent) digestError.textContent = "";
      digestEmail.removeAttribute("aria-invalid");
    });

    function showDigestError(message) {
      if (digestError) digestError.textContent = message;
      digestEmail.setAttribute("aria-invalid", "true");
      digestEmail.focus();
    }
  }

  /* ---------------- Scroll: progress + sticky header ---------------- */

  var scrollTicking = false;

  function onScroll() {
    var doc = document.documentElement;
    var max = doc.scrollHeight - window.innerHeight;
    var ratio = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;

    if (progressBar) progressBar.style.transform = "scaleX(" + ratio + ")";
    if (masthead) masthead.classList.toggle("is-scrolled", window.scrollY > 8);
    scrollTicking = false;
  }

  window.addEventListener(
    "scroll",
    function () {
      if (!scrollTicking) {
        scrollTicking = true;
        window.requestAnimationFrame(onScroll);
      }
    },
    { passive: true }
  );

  window.addEventListener("resize", onScroll);

  /* ---------------- Init ---------------- */

  if (window.location.hash.indexOf("#fact-") === 0) {
    resetAll();
    window.requestAnimationFrame(function () {
      var target = document.querySelector(window.location.hash);
      if (target) target.scrollIntoView({ behavior: "auto", block: "start" });
    });
  } else {
    applyFilters();
  }

  syncSaveButtons();
  onScroll();

  document.documentElement.classList.remove("no-js");
  document.documentElement.classList.add("js");
})();
