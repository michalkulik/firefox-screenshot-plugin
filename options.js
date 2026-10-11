"use strict";

const DEFAULT_SETTINGS = {
  format: "png",
  quality: 92,
  scaleMode: "auto",
  lazyLoad: true,
  saveAs: false,
  openInTab: false,
  notify: true,
};

const els = {
  format: document.getElementById("format"),
  quality: document.getElementById("quality"),
  qualityValue: document.getElementById("qualityValue"),
  qualityRow: document.getElementById("qualityRow"),
  scaleMode: document.getElementById("scaleMode"),
  lazyLoad: document.getElementById("lazyLoad"),
  saveAs: document.getElementById("saveAs"),
  openInTab: document.getElementById("openInTab"),
  notify: document.getElementById("notify"),
  status: document.getElementById("status"),
};

function toggleQualityRow() {
  els.qualityRow.hidden = els.format.value !== "jpeg";
}

function showStatus(text) {
  els.status.textContent = text;
  if (text) setTimeout(() => { els.status.textContent = ""; }, 1500);
}

function readForm() {
  return {
    format: els.format.value,
    quality: Number(els.quality.value),
    scaleMode: els.scaleMode.value,
    lazyLoad: els.lazyLoad.checked,
    saveAs: els.saveAs.checked,
    openInTab: els.openInTab.checked,
    notify: els.notify.checked,
  };
}

function applyToForm(s) {
  els.format.value = s.format;
  els.quality.value = s.quality;
  els.qualityValue.textContent = s.quality;
  els.scaleMode.value = s.scaleMode;
  els.lazyLoad.checked = s.lazyLoad;
  els.saveAs.checked = s.saveAs;
  els.openInTab.checked = s.openInTab;
  els.notify.checked = s.notify;
  toggleQualityRow();
}

async function save() {
  const settings = readForm();
  try {
    await browser.storage.sync.set(settings);
  } catch (e) {
    await browser.storage.local.set(settings);
  }
  showStatus("Zapisano");
}

async function load() {
  let s = {};
  try {
    s = await browser.storage.sync.get(DEFAULT_SETTINGS);
  } catch (e) {
    s = await browser.storage.local.get(DEFAULT_SETTINGS);
  }
  applyToForm({ ...DEFAULT_SETTINGS, ...s });
}

els.quality.addEventListener("input", () => {
  els.qualityValue.textContent = els.quality.value;
});

for (const el of Object.values(els)) {
  if (el && el.addEventListener) {
    el.addEventListener("change", save);
  }
}

load();
