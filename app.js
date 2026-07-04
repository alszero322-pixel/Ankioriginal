(function () {
  "use strict";

  const STORAGE_KEY = "studyAppData.v1";

  const SAMPLE_DECK = {
    version: 1,
    cards: [
      {
        id: "sample1",
        type: "flashcard",
        major: "IT",
        middle: "ネットワーク",
        minor: "CCNA",
        front: "OSI参照モデルの第3層は何と呼ばれる？",
        back: "ネットワーク層",
        text: "",
        createdAt: "2026-07-01T00:00:00.000Z",
        srs: { ef: 2.5, interval: 0, reps: 0, due: "2026-07-04", lastReviewed: null },
        stats: { correct: 0, incorrect: 0, history: [] },
      },
      {
        id: "sample2",
        type: "cloze",
        major: "IT",
        middle: "セキュリティ",
        minor: "基礎",
        front: "",
        back: "",
        text: "通信を暗号化し改ざんを検知するプロトコルとして、Webでは[[TLS]]が広く使われている。",
        createdAt: "2026-07-01T00:00:00.000Z",
        srs: { ef: 2.5, interval: 0, reps: 0, due: "2026-07-04", lastReviewed: null },
        stats: { correct: 0, incorrect: 0, history: [] },
      },
      {
        id: "sample3",
        type: "flashcard",
        major: "英語",
        middle: "単語",
        minor: "TOEIC",
        front: '"reimburse" の意味は？',
        back: "（費用などを）払い戻す、返済する",
        text: "",
        createdAt: "2026-07-01T00:00:00.000Z",
        srs: { ef: 2.5, interval: 0, reps: 0, due: "2026-07-04", lastReviewed: null },
        stats: { correct: 0, incorrect: 0, history: [] },
      },
      {
        id: "sample4",
        type: "cloze",
        major: "英語",
        middle: "文法",
        minor: "基礎",
        front: "",
        back: "",
        text: "現在完了形は[[have]]または[[has]]プラス過去分詞で作る。",
        createdAt: "2026-07-01T00:00:00.000Z",
        srs: { ef: 2.5, interval: 0, reps: 0, due: "2026-07-04", lastReviewed: null },
        stats: { correct: 0, incorrect: 0, history: [] },
      },
    ],
  };

  /* ---------- data store ---------- */

  let data = loadData();

  function loadData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {
      console.error("failed to load data", e);
    }
    return { version: 1, cards: [] };
  }

  function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function uid() {
    return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function todayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  function addDays(dateStr, days) {
    const d = new Date(dateStr + "T00:00:00");
    d.setDate(d.getDate() + Math.round(days));
    return d.toISOString().slice(0, 10);
  }

  function newSrs() {
    return { ef: 2.5, interval: 0, reps: 0, due: todayStr(), lastReviewed: null };
  }

  /* ---------- SM-2 style scheduler ---------- */
  // quality: 0/1=again, 3=hard, 4=good, 5=easy
  function scheduleReview(srs, quality) {
    let { ef, interval, reps } = srs;
    if (quality < 3) {
      reps = 0;
      interval = 0; // reset, due again today (short-term relearn)
    } else {
      if (reps === 0) interval = 1;
      else if (reps === 1) interval = 6;
      else interval = Math.round(interval * ef);
      reps += 1;
    }
    ef = ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    if (ef < 1.3) ef = 1.3;
    return {
      ef,
      interval,
      reps,
      due: addDays(todayStr(), interval),
      lastReviewed: todayStr(),
    };
  }

  /* ---------- card helpers ---------- */

  function getCards() {
    return data.cards;
  }

  function findCard(id) {
    return data.cards.find((c) => c.id === id);
  }

  function upsertCard(card) {
    const idx = data.cards.findIndex((c) => c.id === card.id);
    if (idx >= 0) data.cards[idx] = card;
    else data.cards.push(card);
    saveData();
  }

  function deleteCard(id) {
    data.cards = data.cards.filter((c) => c.id !== id);
    saveData();
  }

  // splits cloze text like "foo[[bar]]baz" into ordered text/blank segments
  function parseCloze(text) {
    const parts = [];
    const answers = [];
    const re = /\[\[(.+?)\]\]/g;
    let lastIndex = 0;
    let match;
    while ((match = re.exec(text)) !== null) {
      if (match.index > lastIndex) parts.push({ type: "text", value: text.slice(lastIndex, match.index) });
      parts.push({ type: "blank", value: match[1].trim(), index: answers.length });
      answers.push(match[1].trim());
      lastIndex = re.lastIndex;
    }
    if (lastIndex < text.length) parts.push({ type: "text", value: text.slice(lastIndex) });
    return { parts, answers };
  }

  function clozePreview(text) {
    return parseCloze(text)
      .parts.map((p) => (p.type === "blank" ? "[___]" : p.value))
      .join("");
  }

  function categoryTree() {
    const tree = {};
    for (const c of data.cards) {
      const maj = c.major || "未分類";
      const mid = c.middle || "未分類";
      const min = c.minor || "未分類";
      tree[maj] = tree[maj] || {};
      tree[maj][mid] = tree[maj][mid] || new Set();
      tree[maj][mid].add(min);
    }
    return tree;
  }

  function normalizeAnswer(s) {
    return s.trim().toLowerCase();
  }

  /* ---------- view switching ---------- */

  const views = document.querySelectorAll(".view");
  const tabBtns = document.querySelectorAll(".tab-btn");

  function showView(name) {
    views.forEach((v) => v.classList.toggle("active", v.id === "view-" + name));
    tabBtns.forEach((b) => b.classList.toggle("active", b.dataset.view === name));
    if (name === "home") renderHome();
    if (name === "cards") renderCardsList();
    if (name === "stats") renderStats();
  }

  tabBtns.forEach((b) => b.addEventListener("click", () => showView(b.dataset.view)));

  /* ---------- home view ---------- */

  const dueCountEl = document.getElementById("due-count");
  const totalCountEl = document.getElementById("total-count");
  const categoryTreeEl = document.getElementById("category-tree");
  const homeEmptyMsg = document.getElementById("home-empty-msg");

  function renderHome() {
    const cards = getCards();
    totalCountEl.textContent = cards.length;
    dueCountEl.textContent = cards.filter((c) => c.srs.due <= todayStr()).length;
    homeEmptyMsg.hidden = cards.length > 0;
    renderCategoryTree();
  }

  function renderCategoryTree() {
    const tree = categoryTree();
    const majors = Object.keys(tree).sort();
    if (majors.length === 0) {
      categoryTreeEl.innerHTML = '<p class="muted small">カードを追加するとここに分類が表示されます。</p>';
      return;
    }
    let html = "";
    for (const maj of majors) {
      html += `<div class="cat-major"><label><input type="checkbox" class="cat-major-cb" data-maj="${escAttr(maj)}" checked> ${esc(maj)}</label></div>`;
      const mids = Object.keys(tree[maj]).sort();
      for (const mid of mids) {
        html += `<div class="cat-middle"><label><input type="checkbox" class="cat-mid-cb" data-maj="${escAttr(maj)}" data-mid="${escAttr(mid)}" checked> ${esc(mid)}</label></div>`;
        const mins = Array.from(tree[maj][mid]).sort();
        for (const min of mins) {
          html += `<div class="cat-minor"><label><input type="checkbox" class="cat-min-cb" data-maj="${escAttr(maj)}" data-mid="${escAttr(mid)}" data-min="${escAttr(min)}" checked> ${esc(min)}</label></div>`;
        }
      }
    }
    categoryTreeEl.innerHTML = html;
  }

  function getSelectedCategories() {
    const selected = [];
    categoryTreeEl.querySelectorAll(".cat-min-cb:checked").forEach((cb) => {
      selected.push({ major: cb.dataset.maj, middle: cb.dataset.mid, minor: cb.dataset.min });
    });
    return selected;
  }

  document.getElementById("start-study-btn").addEventListener("click", startStudy);
  document.getElementById("back-home-btn").addEventListener("click", () => showView("home"));

  /* ---------- cards list / edit ---------- */

  const cardsListEl = document.getElementById("cards-list");
  const filterMajor = document.getElementById("cards-filter-major");
  const filterMiddle = document.getElementById("cards-filter-middle");
  const filterMinor = document.getElementById("cards-filter-minor");

  function fillFilterSelects() {
    const tree = categoryTree();
    fillSelect(filterMajor, Object.keys(tree).sort(), "大分類: すべて");
    const maj = filterMajor.value;
    const mids = maj && tree[maj] ? Object.keys(tree[maj]).sort() : [];
    fillSelect(filterMiddle, mids, "中分類: すべて");
    const mid = filterMiddle.value;
    const mins = maj && mid && tree[maj][mid] ? Array.from(tree[maj][mid]).sort() : [];
    fillSelect(filterMinor, mins, "小分類: すべて");
  }

  function fillSelect(sel, values, placeholder) {
    const current = sel.value;
    sel.innerHTML = `<option value="">${placeholder}</option>` + values.map((v) => `<option value="${escAttr(v)}">${esc(v)}</option>`).join("");
    if (values.includes(current)) sel.value = current;
  }

  [filterMajor, filterMiddle, filterMinor].forEach((sel) =>
    sel.addEventListener("change", () => {
      fillFilterSelects();
      renderCardsList();
    })
  );

  function renderCardsList() {
    fillFilterSelects();
    const maj = filterMajor.value,
      mid = filterMiddle.value,
      min = filterMinor.value;
    let cards = getCards();
    if (maj) cards = cards.filter((c) => (c.major || "未分類") === maj);
    if (mid) cards = cards.filter((c) => (c.middle || "未分類") === mid);
    if (min) cards = cards.filter((c) => (c.minor || "未分類") === min);

    if (cards.length === 0) {
      cardsListEl.innerHTML = '<p class="muted small">該当するカードがありません。</p>';
      return;
    }

    cardsListEl.innerHTML = cards
      .map((c) => {
        const label = c.type === "flashcard" ? c.front : clozePreview(c.text);
        const typeLabel = c.type === "flashcard" ? "暗記" : "穴埋め";
        return `<div class="card-item" data-id="${c.id}">
          <div>
            <div>${esc(truncate(label, 60))}</div>
            <div class="meta">${esc(c.major || "未分類")} / ${esc(c.middle || "未分類")} / ${esc(c.minor || "未分類")}</div>
          </div>
          <span class="badge">${typeLabel}</span>
        </div>`;
      })
      .join("");

    cardsListEl.querySelectorAll(".card-item").forEach((el) =>
      el.addEventListener("click", () => openCardForm(el.dataset.id))
    );
  }

  function truncate(s, n) {
    return s.length > n ? s.slice(0, n) + "…" : s;
  }

  /* ---------- card form modal ---------- */

  const overlay = document.getElementById("card-form-overlay");
  const formTitle = document.getElementById("card-form-title");
  const editCardId = document.getElementById("edit-card-id");
  const fieldMajor = document.getElementById("field-major");
  const fieldMiddle = document.getElementById("field-middle");
  const fieldMinor = document.getElementById("field-minor");
  const fieldFront = document.getElementById("field-front");
  const fieldBack = document.getElementById("field-back");
  const fieldCloze = document.getElementById("field-cloze");
  const flashcardFields = document.getElementById("flashcard-fields");
  const clozeFields = document.getElementById("cloze-fields");
  const deleteCardBtn = document.getElementById("delete-card-btn");

  document.getElementById("new-card-btn").addEventListener("click", () => openCardForm(null));
  document.getElementById("cancel-card-btn").addEventListener("click", closeCardForm);
  document.getElementById("save-card-btn").addEventListener("click", saveCardForm);
  deleteCardBtn.addEventListener("click", () => {
    if (!editCardId.value) return;
    if (confirm("このカードを削除しますか？")) {
      deleteCard(editCardId.value);
      closeCardForm();
      renderCardsList();
    }
  });

  document.querySelectorAll('input[name="card-type"]').forEach((r) =>
    r.addEventListener("change", updateCardTypeFields)
  );

  function updateCardTypeFields() {
    const type = document.querySelector('input[name="card-type"]:checked').value;
    flashcardFields.hidden = type !== "flashcard";
    clozeFields.hidden = type !== "cloze";
  }

  function fillDatalists() {
    const tree = categoryTree();
    const majors = Object.keys(tree);
    const mids = new Set(),
      mins = new Set();
    for (const m of majors) {
      Object.keys(tree[m]).forEach((mm) => mids.add(mm));
      Object.values(tree[m]).forEach((s) => s.forEach((mn) => mins.add(mn)));
    }
    setDatalist("major-list", majors);
    setDatalist("middle-list", Array.from(mids));
    setDatalist("minor-list", Array.from(mins));
  }

  function setDatalist(id, values) {
    document.getElementById(id).innerHTML = values.map((v) => `<option value="${escAttr(v)}">`).join("");
  }

  function openCardForm(id) {
    fillDatalists();
    if (id) {
      const c = findCard(id);
      formTitle.textContent = "カードを編集";
      editCardId.value = c.id;
      document.querySelector(`input[name="card-type"][value="${c.type}"]`).checked = true;
      fieldMajor.value = c.major || "";
      fieldMiddle.value = c.middle || "";
      fieldMinor.value = c.minor || "";
      fieldFront.value = c.front || "";
      fieldBack.value = c.back || "";
      fieldCloze.value = c.text || "";
      deleteCardBtn.hidden = false;
    } else {
      formTitle.textContent = "新規カード";
      editCardId.value = "";
      document.querySelector('input[name="card-type"][value="flashcard"]').checked = true;
      fieldMajor.value = "";
      fieldMiddle.value = "";
      fieldMinor.value = "";
      fieldFront.value = "";
      fieldBack.value = "";
      fieldCloze.value = "";
      deleteCardBtn.hidden = true;
    }
    updateCardTypeFields();
    overlay.hidden = false;
  }

  function closeCardForm() {
    overlay.hidden = true;
  }

  function saveCardForm() {
    const type = document.querySelector('input[name="card-type"]:checked').value;
    const major = fieldMajor.value.trim();
    const middle = fieldMiddle.value.trim();
    const minor = fieldMinor.value.trim();

    if (type === "flashcard" && (!fieldFront.value.trim() || !fieldBack.value.trim())) {
      alert("表と裏の両方を入力してください。");
      return;
    }
    if (type === "cloze") {
      const { answers } = parseCloze(fieldCloze.value);
      if (!fieldCloze.value.trim() || answers.length === 0) {
        alert("本文を入力し、答えを[[ ]]で囲んでください。");
        return;
      }
    }

    const existingId = editCardId.value;
    const existing = existingId ? findCard(existingId) : null;

    const card = {
      id: existingId || uid(),
      type,
      major,
      middle,
      minor,
      front: type === "flashcard" ? fieldFront.value.trim() : "",
      back: type === "flashcard" ? fieldBack.value.trim() : "",
      text: type === "cloze" ? fieldCloze.value.trim() : "",
      createdAt: existing ? existing.createdAt : new Date().toISOString(),
      srs: existing ? existing.srs : newSrs(),
      stats: existing ? existing.stats : { correct: 0, incorrect: 0, history: [] },
    };

    upsertCard(card);
    closeCardForm();
    renderCardsList();
  }

  /* ---------- study session ---------- */

  const studyProgressEl = document.getElementById("study-progress");
  const studyAreaEl = document.getElementById("study-area");
  const studyEmptyEl = document.getElementById("study-empty");
  const studyCategoryLabel = document.getElementById("study-category-label");

  let session = null; // { queue: [card,...], index }

  function startStudy() {
    const selectedCats = getSelectedCategories();
    const catKey = (c) => `${c.major || "未分類"}::${c.middle || "未分類"}::${c.minor || "未分類"}`;
    const selectedKeys = new Set(selectedCats.map(catKey));

    const modeType = document.querySelector('input[name="mode-type"]:checked').value;
    const scope = document.querySelector('input[name="mode-scope"]:checked').value;
    const shuffle = document.getElementById("shuffle-toggle").checked;

    let queue = getCards().filter((c) => selectedKeys.has(catKey(c)));
    if (modeType !== "all") queue = queue.filter((c) => c.type === modeType);
    if (scope === "due") queue = queue.filter((c) => c.srs.due <= todayStr());

    if (shuffle) shuffleArray(queue);

    session = { queue, index: 0, catLabel: modeType === "all" ? "すべてのモード" : modeType === "cloze" ? "穴埋め" : "暗記カード" };

    showView("study");
    studyCategoryLabel.textContent = `対象: ${queue.length}枚 (${session.catLabel})`;

    if (queue.length === 0) {
      studyEmptyEl.hidden = false;
      studyAreaEl.hidden = true;
    } else {
      studyEmptyEl.hidden = true;
      studyAreaEl.hidden = false;
      renderCurrentCard();
    }
  }

  function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  document.getElementById("quit-study-btn").addEventListener("click", () => {
    session = null;
    showView("home");
  });

  function renderCurrentCard() {
    const { queue, index } = session;
    studyProgressEl.textContent = `${index + 1} / ${queue.length}`;
    const card = queue[index];
    if (card.type === "flashcard") renderFlashcard(card);
    else renderClozeCard(card);
  }

  function renderFlashcard(card) {
    studyAreaEl.innerHTML = `
      <div class="flip-card" id="flip-card">${esc(card.front)}</div>
      <button class="btn primary" id="reveal-btn">裏を見る</button>
      <div class="grade-buttons" id="grade-buttons" hidden>
        <button class="btn grade-again" data-q="1">もう一度</button>
        <button class="btn" data-q="3">難しい</button>
        <button class="btn grade-good" data-q="4">できた</button>
        <button class="btn" data-q="5">簡単</button>
      </div>`;

    document.getElementById("reveal-btn").addEventListener("click", () => {
      document.getElementById("flip-card").textContent = card.back;
      document.getElementById("reveal-btn").hidden = true;
      document.getElementById("grade-buttons").hidden = false;
    });

    studyAreaEl.querySelectorAll("#grade-buttons button").forEach((btn) =>
      btn.addEventListener("click", () => {
        const q = Number(btn.dataset.q);
        recordReview(card, q, q >= 4);
        advanceQueue();
      })
    );
  }

  function renderClozeCard(card) {
    const { parts, answers } = parseCloze(card.text);

    const textHtml = parts
      .map((p) => {
        if (p.type === "text") return esc(p.value);
        return `<input type="text" class="cloze-blank" data-i="${p.index}" autocomplete="off" spellcheck="false">`;
      })
      .join("");

    studyAreaEl.innerHTML = `
      <div class="study-card-text">${textHtml}</div>
      <button class="btn primary" id="check-btn">答え合わせ</button>
      <div class="grade-buttons" id="grade-buttons" hidden>
        <button class="btn grade-again" data-q="1">不正解として記録</button>
        <button class="btn grade-good" data-q="4">正解として記録</button>
      </div>`;

    document.getElementById("check-btn").addEventListener("click", () => {
      const inputs = studyAreaEl.querySelectorAll(".cloze-blank");
      let allCorrect = true;
      inputs.forEach((inp) => {
        const i = Number(inp.dataset.i);
        const ok = normalizeAnswer(inp.value) === normalizeAnswer(answers[i]);
        inp.classList.add(ok ? "correct" : "incorrect");
        inp.disabled = true;
        if (!ok) {
          allCorrect = false;
          inp.value = answers[i];
        }
      });
      document.getElementById("check-btn").hidden = true;
      const gradeButtons = document.getElementById("grade-buttons");
      gradeButtons.hidden = false;
      gradeButtons.querySelector(allCorrect ? ".grade-good" : ".grade-again").focus();
    });

    studyAreaEl.querySelectorAll("#grade-buttons button").forEach((btn) =>
      btn.addEventListener("click", () => {
        const q = Number(btn.dataset.q);
        recordReview(card, q, q >= 4);
        advanceQueue();
      })
    );
  }

  function recordReview(card, quality, correct) {
    card.srs = scheduleReview(card.srs, quality);
    if (correct) card.stats.correct += 1;
    else card.stats.incorrect += 1;
    card.stats.history.push({ date: todayStr(), correct, quality });
    if (card.stats.history.length > 200) card.stats.history.shift();
    upsertCard(card);
  }

  function advanceQueue() {
    session.index += 1;
    if (session.index >= session.queue.length) {
      alert("学習セッションが終了しました。お疲れさまでした。");
      session = null;
      showView("home");
    } else {
      renderCurrentCard();
    }
  }

  /* ---------- stats ---------- */

  function renderStats() {
    const cards = getCards();
    let totalReviews = 0,
      totalCorrect = 0;
    const catMap = {};
    const historyEntries = [];

    for (const c of cards) {
      const correct = c.stats.correct,
        incorrect = c.stats.incorrect;
      totalReviews += correct + incorrect;
      totalCorrect += correct;
      const key = `${c.major || "未分類"} / ${c.middle || "未分類"} / ${c.minor || "未分類"}`;
      catMap[key] = catMap[key] || { correct: 0, incorrect: 0 };
      catMap[key].correct += correct;
      catMap[key].incorrect += incorrect;

      for (const h of c.stats.history) {
        historyEntries.push({ ...h, label: c.type === "flashcard" ? c.front : clozePreview(c.text) });
      }
    }

    document.getElementById("stats-total").textContent = cards.length;
    document.getElementById("stats-reviews").textContent = totalReviews;
    document.getElementById("stats-accuracy").textContent = totalReviews ? Math.round((totalCorrect / totalReviews) * 100) + "%" : "-";

    const catRows = Object.entries(catMap)
      .map(([key, v]) => {
        const total = v.correct + v.incorrect;
        const rate = total ? Math.round((v.correct / total) * 100) + "%" : "-";
        return `<tr><td>${esc(key)}</td><td>${total}</td><td>${rate}</td></tr>`;
      })
      .join("");
    document.getElementById("stats-by-category").innerHTML = catRows
      ? `<table class="stats-table"><thead><tr><th>カテゴリ</th><th>回数</th><th>正答率</th></tr></thead><tbody>${catRows}</tbody></table>`
      : '<p class="muted small">まだ学習履歴がありません。</p>';

    historyEntries.sort((a, b) => (a.date < b.date ? 1 : -1));
    const recent = historyEntries.slice(0, 20);
    document.getElementById("stats-history").innerHTML = recent.length
      ? recent
          .map(
            (h) =>
              `<div class="row-between"><span class="small">${esc(truncate(h.label, 40))}</span><span class="small ${h.correct ? "" : "muted"}">${h.date} ${h.correct ? "○" : "×"}</span></div>`
          )
          .join("")
      : '<p class="muted small">まだ学習履歴がありません。</p>';
  }

  /* ---------- import / export ---------- */

  document.getElementById("export-btn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `study-cards-${todayStr()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById("import-btn").addEventListener("click", () => {
    const fileInput = document.getElementById("import-file");
    const mode = document.querySelector('input[name="import-mode"]:checked').value;
    const msgEl = document.getElementById("import-msg");
    if (!fileInput.files[0]) {
      msgEl.textContent = "ファイルを選択してください。";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(reader.result);
        if (!imported || !Array.isArray(imported.cards)) throw new Error("invalid format");
        importCards(imported.cards, mode);
        msgEl.textContent = `読み込み完了: ${imported.cards.length}件処理しました。`;
        renderHome();
      } catch (e) {
        msgEl.textContent = "読み込みに失敗しました。ファイル形式を確認してください。";
      }
    };
    reader.readAsText(fileInput.files[0]);
  });

  function importCards(cards, mode) {
    if (mode === "replace") {
      data.cards = cards.map((raw) => normalizeImportedCard(raw, null));
    } else {
      const byId = new Map(data.cards.map((c) => [c.id, c]));
      for (const raw of cards) {
        const existing = raw.id ? byId.get(raw.id) : null;
        const c = normalizeImportedCard(raw, existing);
        byId.set(c.id, c);
      }
      data.cards = Array.from(byId.values());
    }
    saveData();
  }

  // existing: the current card with this id, if any (preserved so re-importing
  // the same id — e.g. an inbox file fetched again — never wipes SRS progress)
  function normalizeImportedCard(raw, existing) {
    return {
      id: raw.id || (existing && existing.id) || uid(),
      type: raw.type === "cloze" ? "cloze" : "flashcard",
      major: raw.major || "",
      middle: raw.middle || "",
      minor: raw.minor || "",
      front: raw.front || "",
      back: raw.back || "",
      text: raw.text || "",
      createdAt: (existing && existing.createdAt) || raw.createdAt || new Date().toISOString(),
      srs: raw.srs || (existing && existing.srs) || newSrs(),
      stats: raw.stats || (existing && existing.stats) || { correct: 0, incorrect: 0, history: [] },
    };
  }

  document.getElementById("load-sample-btn").addEventListener("click", () => {
    importCards(SAMPLE_DECK.cards, "merge");
    renderHome();
    alert("サンプルカードを追加しました。");
  });

  /* ---------- inbox auto-import ---------- */
  // Fetches inbox/manifest.json (relative to this page, so it works under a
  // GitHub Pages subpath) and merges in any card files not yet imported on
  // this device. Silent on first load unless there is something to report;
  // the manual button always reports a result. Requires http(s), not file://.

  const INBOX_MANIFEST_URL = "inbox/manifest.json";
  const IMPORTED_INBOX_KEY = "studyAppData.importedInboxFiles";

  function getImportedInboxFiles() {
    try {
      return JSON.parse(localStorage.getItem(IMPORTED_INBOX_KEY) || "[]");
    } catch (e) {
      return [];
    }
  }

  function markInboxFileImported(name) {
    const list = getImportedInboxFiles();
    if (!list.includes(name)) {
      list.push(name);
      localStorage.setItem(IMPORTED_INBOX_KEY, JSON.stringify(list));
    }
  }

  async function checkInbox(manual) {
    const statusEl = document.getElementById("inbox-status");
    try {
      const manifestRes = await fetch(INBOX_MANIFEST_URL, { cache: "no-store" });
      if (!manifestRes.ok) throw new Error("manifest not found");
      const manifest = await manifestRes.json();
      const files = Array.isArray(manifest.files) ? manifest.files : [];
      const imported = new Set(getImportedInboxFiles());
      const pending = files.filter((f) => !imported.has(f));

      if (pending.length === 0) {
        if (manual && statusEl) statusEl.textContent = "新しいカードはありません。";
        return;
      }

      let totalCards = 0;
      for (const filename of pending) {
        try {
          const res = await fetch("inbox/" + filename, { cache: "no-store" });
          if (res.ok) {
            const json = await res.json();
            if (json && Array.isArray(json.cards)) {
              importCards(json.cards, "merge");
              totalCards += json.cards.length;
            }
          }
        } catch (e) {
          continue; // leave unmarked so it's retried next check
        }
        markInboxFileImported(filename);
      }

      if (statusEl) statusEl.textContent = `新しいカードを${totalCards}枚取り込みました（${pending.length}ファイル）。`;
      renderHome();
    } catch (e) {
      if (manual && statusEl) statusEl.textContent = "新着チェックに失敗しました（オフライン、またはinboxが未設定の可能性があります）。";
    }
  }

  document.getElementById("check-inbox-btn").addEventListener("click", () => checkInbox(true));

  /* ---------- escaping helpers ---------- */

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  }
  function escAttr(s) {
    return esc(s);
  }

  /* ---------- init ---------- */

  showView("home");
  checkInbox(false);
})();
