"use strict";

/*
 * Pełny Zrzut Strony — logika działająca w tle (Firefox, MV3 event page).
 *
 * Metoda działania:
 *   1. Odczytujemy wymiary całej strony (skrypt wstrzykiwany do karty).
 *   2. Opcjonalnie przewijamy stronę od góry do dołu, aby wywołać
 *      leniwe wczytywanie obrazów/tła, po czym wracamy na pozycję startową.
 *   3. Wołamy browser.tabs.captureTab() z parametrem rect obejmującym cały
 *      dokument (Firefox renderuje obszar także poza widocznym viewportem).
 *   4. Jeśli strona jest zbyt duża na jeden zrzut, dzielimy ją na kafelki,
 *      zrzucamy każdy osobno i sklejamy na canvasie.
 *   5. Zapisujemy wynik jako PNG/JPEG przez downloads API.
 */

const DEFAULT_SETTINGS = {
  format: "png",        // "png" | "jpeg"
  quality: 92,          // jakość JPEG (0-100)
  scaleMode: "auto",    // "auto" | "1" | "2"
  lazyLoad: true,       // przewiń stronę, aby wczytać leniwe elementy
  saveAs: false,        // pokaż okno "zapisz jako"
  openInTab: false,     // otwórz wynik w nowej karcie
  notify: true,         // powiadomienie po zakończeniu
  // Limity bezpieczeństwa (px oraz łączna liczba pikseli).
  maxDimension: 16384,
  maxPixels: 40000000,
};

/* ------------------------------------------------------------------ *
 * Ustawienia
 * ------------------------------------------------------------------ */

async function getSettings() {
  try {
    const stored = await browser.storage.sync.get(DEFAULT_SETTINGS);
    return { ...DEFAULT_SETTINGS, ...stored };
  } catch (e) {
    try {
      const stored = await browser.storage.local.get(DEFAULT_SETTINGS);
      return { ...DEFAULT_SETTINGS, ...stored };
    } catch (_) {
      return { ...DEFAULT_SETTINGS };
    }
  }
}

/* ------------------------------------------------------------------ *
 * Funkcje wstrzykiwane do strony (muszą być samodzielne, bez domknięć)
 * ------------------------------------------------------------------ */

function pageMetrics() {
  const el = document.documentElement;
  const body = document.body;
  const scrollWidth = Math.max(
    el.scrollWidth,
    body ? body.scrollWidth : 0,
    el.clientWidth
  );
  const fullHeight = Math.max(
    el.scrollHeight,
    body ? body.scrollHeight : 0,
    el.clientHeight
  );
  return {
    scrollWidth,
    fullHeight,
    viewportWidth: el.clientWidth,
    viewportHeight: el.clientHeight,
    dpr: window.devicePixelRatio || 1,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    url: location.href,
    title: document.title || "",
  };
}

function scrollToPos(x, y) {
  window.scrollTo(x, y);
  return { x: window.scrollX, y: window.scrollY };
}

function getScrollPos() {
  return { x: window.scrollX, y: window.scrollY };
}

// Przewija na samą górę, wymuszając jednocześnie natychmiastowe przewijanie.
// Strony często mają `html { scroll-behavior: smooth }` — wtedy zwykłe
// window.scrollTo() animuje się powoli i zrzut trafiłby na stronę w połowie
// przewijania (przyklejone elementy wylądowałyby nie u góry). Chwilowo
// nadpisujemy scroll-behavior na "auto" i zapamiętujemy pierwotną wartość.
function scrollToTopAndFreeze() {
  const html = document.documentElement;
  const body = document.body;
  try {
    html.dataset.fpsSbHtml = html.style.scrollBehavior || "";
    if (body) body.dataset.fpsSbBody = body.style.scrollBehavior || "";
    html.style.scrollBehavior = "auto";
    if (body) body.style.scrollBehavior = "auto";
  } catch (e) {}
  window.scrollTo(0, 0);
  return { x: window.scrollX, y: window.scrollY };
}

// Przywraca pierwotne wartości scroll-behavior.
function restoreScrollBehavior() {
  const html = document.documentElement;
  const body = document.body;
  try {
    if (html.dataset.fpsSbHtml !== undefined) {
      html.style.scrollBehavior = html.dataset.fpsSbHtml;
      delete html.dataset.fpsSbHtml;
    }
    if (body && body.dataset && body.dataset.fpsSbBody !== undefined) {
      body.style.scrollBehavior = body.dataset.fpsSbBody;
      delete body.dataset.fpsSbBody;
    }
  } catch (e) {}
}

/* ------------------------------------------------------------------ *
 * Pomocnicze
 * ------------------------------------------------------------------ */

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Wtyczka działa jako MV3 event page, który Firefox uśpi po okresie
// bezczynności (domyślnie 30 s). Wywołania API obsługiwanych przez proces
// nadrzędny (np. tabs, scripting) resetują ten licznik, więc w trakcie
// długiego zrzutu co jakiś czas wołamy tanie API, aby nie dopuścić do uśpienia
// strony w tle w połowie pracy. (Uwaga: storage.local nie resetuje licznika.)
const KEEPALIVE_INTERVAL_MS = 15000;

function startKeepAlive() {
  let stopped = false;
  const ping = () => {
    if (stopped) return;
    // Wywołanie API obsługiwanego w procesie nadrzędnym resetuje licznik
    // bezczynności event page (storage.local tego nie robi).
    browser.runtime.getPlatformInfo().catch(() => {});
  };
  ping();
  const timer = setInterval(ping, KEEPALIVE_INTERVAL_MS);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

function setBadge(tabId, text, color) {
  browser.action.setBadgeText({ tabId, text }).catch(() => {});
  if (color) {
    browser.action.setBadgeBackgroundColor({ tabId, color }).catch(() => {});
  }
}

function notify(title, message) {
  browser.notifications
    .create({
      type: "basic",
      iconUrl: browser.runtime.getURL("icons/icon-96.png"),
      title,
      message,
    })
    .catch(() => {});
}

function isSupportedUrl(url) {
  if (!url) return false;
  return /^(https?|file|ftp):/i.test(url);
}

function buildFilename(metrics, format) {
  let base = "strona";
  try {
    const u = new URL(metrics.url);
    if (u.protocol === "file:") {
      base = (u.pathname.split("/").pop() || "plik").replace(/\.[^.]+$/, "");
    } else if (u.hostname) {
      base = u.hostname.replace(/^www\./, "");
    }
  } catch (_) {}
  base = (base || "strona").replace(/[^a-z0-9._-]+/gi, "_").slice(0, 60) || "strona";

  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  const ts =
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
  const ext = format === "jpeg" ? "jpg" : "png";
  return `zrzuty-www/${base}_${ts}.${ext}`;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Nie udało się wczytać fragmentu zrzutu."));
    img.src = src;
  });
}

/* ------------------------------------------------------------------ *
 * Leniwe wczytywanie
 * ------------------------------------------------------------------ */

async function lazyLoadPass(tabId, metrics) {
  const viewport = Math.max(200, Math.round(metrics.viewportHeight || 800));
  const step = Math.max(200, Math.round(viewport * 0.9));
  const positions = [];
  const maxSteps = 200;
  for (let y = 0; y + viewport < metrics.fullHeight && positions.length < maxSteps; y += step) {
    positions.push(y);
  }
  positions.push(Math.max(0, metrics.fullHeight - viewport));

  for (const y of positions) {
    try {
      await browser.scripting.executeScript({
        target: { tabId },
        func: scrollToPos,
        args: [0, y],
      });
    } catch (e) {
      break;
    }
    await delay(120);
  }
  await delay(150);
}

async function restoreScroll(tabId, metrics) {
  try {
    await browser.scripting.executeScript({
      target: { tabId },
      func: scrollToPos,
      args: [metrics.scrollX || 0, metrics.scrollY || 0],
    });
    await browser.scripting.executeScript({
      target: { tabId },
      func: restoreScrollBehavior,
    });
  } catch (e) {
    /* ignorujemy */
  }
}

// Przewija stronę na samą górę i czeka, aż naprawdę osiągnie y=0.
// Dzięki temu elementy position: fixed / sticky (przyklejone menu boczne,
// paski nawigacji) zostaną uchwycone u góry dokumentu, a nie na wysokości
// bieżącego przewinięcia (co je wypacza w zrzucie całej strony).
async function scrollToTop(tabId) {
  try {
    await browser.scripting.executeScript({
      target: { tabId },
      func: scrollToTopAndFreeze,
    });
    for (let i = 0; i < 20; i++) {
      await delay(50);
      const results = await browser.scripting.executeScript({
        target: { tabId },
        func: getScrollPos,
      });
      const pos = results && results[0] && results[0].result;
      if (pos && pos.x === 0 && pos.y === 0) break;
    }
    // Chwila dla kompozytora, aby elementy sticky/fixed "usiadły" u góry.
    await delay(200);
  } catch (e) {
    /* ignorujemy */
  }
}

/* ------------------------------------------------------------------ *
 * Robienie zrzutu
 * ------------------------------------------------------------------ */

function computeScale(metrics, settings) {
  const W = Math.max(1, metrics.scrollWidth);
  const H = Math.max(1, metrics.fullHeight);
  const dpr = metrics.dpr || 1;
  let requested;
  if (settings.scaleMode === "auto") requested = dpr;
  else requested = parseFloat(settings.scaleMode) || 1;

  let scale = Math.min(
    requested,
    settings.maxDimension / W,
    settings.maxDimension / H,
    Math.sqrt(settings.maxPixels / (W * H))
  );
  if (!isFinite(scale) || scale <= 0) scale = 1;
  // Nigdy nie skalujemy w górę bardziej niż 4x.
  return Math.min(scale, 4);
}

async function captureFullPage(tabId, metrics, settings) {
  const W = Math.max(1, Math.round(metrics.scrollWidth));
  const H = Math.max(1, Math.round(metrics.fullHeight));
  const scale = computeScale({ ...metrics, scrollWidth: W, fullHeight: H }, settings);

  // Firefox renderuje zrzut w skali scale * zoom, gdzie zoom to bieżące
  // powiększenie strony. Dzielimy więc żądaną skalę przez zoom, aby wymiary
  // obrazu były niezależne od ustawionego powiększenia.
  let zoom = 1;
  try {
    zoom = await browser.tabs.getZoom(tabId);
  } catch (e) {
    /* brak informacji o zoomie — zakładamy 1 */
  }
  if (!zoom || !isFinite(zoom) || zoom <= 0) zoom = 1;

  const captureScale = scale / zoom;

  const options = {
    format: settings.format,
    quality: settings.quality,
    rect: { x: 0, y: 0, width: W, height: H },
    scale: captureScale,
  };

  const expectedW = Math.max(1, Math.round(W * scale));
  const expectedH = Math.max(1, Math.round(H * scale));
  let dataUrl = null;
  let error = null;

  try {
    dataUrl = await browser.tabs.captureTab(tabId, options);
  } catch (err) {
    error = err;
  }

  // Sprawdzamy, czy Firefox faktycznie uchwycił całą stronę. Gdyby przytnie
  // ją do widocznego viewportu (starsze wersje / ograniczenia rozmiaru),
  // wymiary obrazu nie zgodzą się z oczekiwanymi i przejdziemy na kafelki.
  if (dataUrl) {
    try {
      const img = await loadImage(dataUrl);
      const okW = Math.abs(img.naturalWidth - expectedW) <= 2;
      const okH = Math.abs(img.naturalHeight - expectedH) <= 2;
      if (okW && okH) return dataUrl;
      error = new Error("Zrzut nie objął całej strony — składam z kafelków.");
    } catch (e) {
      return dataUrl; // nie umiemy zweryfikować — ufamy wynikowi
    }
  }

  if (W <= 1 || H <= 1) {
    if (dataUrl) return dataUrl;
    throw error || new Error("Nie udało się wykonać zrzutu strony.");
  }
  return await captureTiled(tabId, W, H, scale, zoom, metrics, settings, error);
}

async function captureTiled(tabId, W, H, scale, zoom, metrics, settings, firstError) {
  const viewport = Math.max(200, Math.round(metrics.viewportHeight || 800));
  const tileH = Math.min(H, viewport);
  const captureScale = scale / (zoom || 1);

  const canvasW = Math.max(1, Math.round(W * scale));
  const canvasH = Math.max(1, Math.round(H * scale));
  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvasW, canvasH);

  let captured = 0;
  let lastError = firstError || null;

  for (let y = 0; y < H; y += tileH) {
    const h = Math.min(tileH, H - y);
    let dataUrl;
    try {
      dataUrl = await browser.tabs.captureTab(tabId, {
        format: "png",
        rect: { x: 0, y, width: W, height: h },
        scale: captureScale,
      });
    } catch (e) {
      lastError = e;
      continue;
    }
    const img = await loadImage(dataUrl);
    const dy = Math.round(y * scale);
    const dh = Math.round(h * scale);
    ctx.drawImage(img, 0, dy, canvasW, dh);
    captured++;
  }

  if (captured === 0) {
    throw lastError || new Error("Nie udało się wykonać zrzutu strony.");
  }

  const mime = settings.format === "jpeg" ? "image/jpeg" : "image/png";
  return canvas.toDataURL(mime, (settings.quality || 92) / 100);
}

/* ------------------------------------------------------------------ *
 * Zapis wyniku
 * ------------------------------------------------------------------ */

async function saveResult(dataUrl, metrics, settings) {
  const blob = await (await fetch(dataUrl)).blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    await browser.downloads.download({
      url: objectUrl,
      filename: buildFilename(metrics, settings.format),
      saveAs: !!settings.saveAs,
      conflictAction: "uniquify",
    });
    if (settings.openInTab) {
      await browser.tabs.create({ url: objectUrl });
      setTimeout(() => URL.revokeObjectURL(objectUrl), 5 * 60 * 1000);
    } else {
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60 * 1000);
    }
  } catch (e) {
    URL.revokeObjectURL(objectUrl);
    throw e;
  }
}

/* ------------------------------------------------------------------ *
 * Główny przebieg
 * ------------------------------------------------------------------ */

const inProgress = new Set();

async function runCapture(tab) {
  if (!tab || tab.id === undefined || tab.id === null) return;
  const tabId = tab.id;

  if (inProgress.has(tabId)) {
    setBadge(tabId, "…", "#666666");
    return;
  }
  if (!isSupportedUrl(tab.url)) {
    notify(
      "Nie można wykonać zrzutu",
      "Ten typ strony jest niedostępny dla wtyczki (np. about:, strony dodatków)."
    );
    return;
  }

  inProgress.add(tabId);
  setBadge(tabId, "…", "#0a7f5a");
  const stopKeepAlive = startKeepAlive();

  try {
    const settings = await getSettings();

    const results = await browser.scripting.executeScript({
      target: { tabId },
      func: pageMetrics,
    });
    const metrics = results && results[0] && results[0].result;
    if (!metrics) throw new Error("Nie udało się odczytać wymiarów strony.");

    if (settings.lazyLoad) {
      await lazyLoadPass(tabId, metrics);
    }

    // Przechodzimy na górę dokumentu na czas zrzutu (patrz scrollToTop),
    // a po zrzucie wracamy na pierwotną pozycję przewinięcia.
    await scrollToTop(tabId);
    let dataUrl;
    try {
      dataUrl = await captureFullPage(tabId, metrics, settings);
    } finally {
      await restoreScroll(tabId, metrics);
    }
    await saveResult(dataUrl, metrics, settings);

    setBadge(tabId, "✓", "#0a7f5a");
    setTimeout(() => setBadge(tabId, ""), 4000);

    if (settings.notify) {
      const w = Math.round(metrics.scrollWidth);
      const h = Math.round(metrics.fullHeight);
      notify("Zrzut zapisany", `${settings.format.toUpperCase()} • ${w}×${h} px`);
    }
  } catch (e) {
    setBadge(tabId, "!", "#c0392b");
    setTimeout(() => setBadge(tabId, ""), 5000);
    notify("Błąd zrzutu", String(e && e.message ? e.message : e));
  } finally {
    stopKeepAlive();
    inProgress.delete(tabId);
  }
}

/* ------------------------------------------------------------------ *
 * Zdarzenia
 * ------------------------------------------------------------------ */

browser.action.onClicked.addListener((tab) => {
  runCapture(tab);
});

browser.runtime.onInstalled.addListener(() => {
  browser.contextMenus.removeAll(() => {
    browser.contextMenus.create({
      id: "fullpage-shot",
      title: "Zrzut całej strony",
      contexts: ["page", "image", "link", "selection", "video", "audio", "frame"],
    });
  });
});

browser.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "fullpage-shot") {
    runCapture(tab);
  }
});
