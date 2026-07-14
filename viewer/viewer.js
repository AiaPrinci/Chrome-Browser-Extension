import {
  getDocument,
  GlobalWorkerOptions,
  TextLayer
} from "../lib/pdfjs/pdf.min.mjs";

GlobalWorkerOptions.workerSrc = chrome.runtime.getURL(
  "lib/pdfjs/pdf.worker.min.mjs"
);

const CMAP_URL = chrome.runtime.getURL("lib/pdfjs/cmaps/");
const STANDARD_FONT_DATA_URL = chrome.runtime.getURL(
  "lib/pdfjs/standard_fonts/"
);

const statusEl = document.getElementById("status");
const titleEl = document.getElementById("doc-title");
const counterEl = document.getElementById("sentence-counter");
const container = document.getElementById("viewer-container");

const PAGE_SCALE = 1.4;

function splitSentences(text) {
  const ranges = [];
  const re = /[^.!?…]+[.!?…]+(?:["')\]»]+)?/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    if (match[0].trim().length > 0) {
      ranges.push({ start: match.index, end: match.index + match[0].length });
    }
  }
  const lastEnd = ranges.length ? ranges[ranges.length - 1].end : 0;
  if (lastEnd < text.length) {
    const rest = text.slice(lastEnd);
    if (rest.trim().length > 0) {
      ranges.push({ start: lastEnd, end: text.length });
    }
  }
  return ranges;
}

async function renderPage(pdf, pageNum, allSentences) {
  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale: PAGE_SCALE });

  const pageDiv = document.createElement("div");
  pageDiv.className = "page";
  pageDiv.style.width = `${viewport.width}px`;
  pageDiv.style.height = `${viewport.height}px`;

  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d");
  pageDiv.appendChild(canvas);

  const textLayerDiv = document.createElement("div");
  textLayerDiv.className = "textLayer";
  pageDiv.appendChild(textLayerDiv);

  container.appendChild(pageDiv);

  await page.render({ canvasContext: ctx, viewport }).promise;

  const textContent = await page.getTextContent();
  const textLayer = new TextLayer({
    textContentSource: textContent,
    container: textLayerDiv,
    viewport
  });
  await textLayer.render();

  const spans = Array.from(textLayerDiv.querySelectorAll("span"));

  let text = "";
  const spanRanges = [];
  spans.forEach((span) => {
    const str = span.textContent || "";
    const start = text.length;
    text += str;
    spanRanges.push({ start, end: text.length, span });
    text += " ";
  });

  const sentenceRanges = splitSentences(text);
  sentenceRanges.forEach(({ start, end }) => {
    const spansForSentence = spanRanges
      .filter((r) => r.end > start && r.start < end)
      .map((r) => r.span);
    if (spansForSentence.length > 0) {
      allSentences.push({ spans: spansForSentence, pageNum });
    }
  });
}

function setupNavigation(allSentences) {
  let currentIndex = -1;

  function activate(idx) {
    if (allSentences.length === 0) return;
    if (idx < 0) idx = allSentences.length - 1;
    if (idx >= allSentences.length) idx = 0;

    if (currentIndex >= 0) {
      allSentences[currentIndex].spans.forEach((s) =>
        s.classList.remove("active-sentence")
      );
    }

    currentIndex = idx;
    const entry = allSentences[currentIndex];
    entry.spans.forEach((s) => s.classList.add("active-sentence"));
    entry.spans[0].scrollIntoView({ behavior: "smooth", block: "center" });

    counterEl.textContent = `წინადადება ${currentIndex + 1} / ${allSentences.length} (გვ. ${entry.pageNum})`;
  }

  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Tab") return;
      e.preventDefault();
      if (e.shiftKey) activate(currentIndex - 1);
      else activate(currentIndex + 1);
    },
    true
  );
}

async function loadPdf(data, title) {
  titleEl.textContent = title || "PDF დოკუმენტი";
  statusEl.textContent = "PDF მუშავდება...";
  try {
    const loadingTask = getDocument({
      data,
      cMapUrl: CMAP_URL,
      cMapPacked: true,
      standardFontDataUrl: STANDARD_FONT_DATA_URL
    });
    const pdf = await loadingTask.promise;

    const allSentences = [];
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      await renderPage(pdf, pageNum, allSentences);
    }

    statusEl.textContent = `გვერდები: ${pdf.numPages} • წინადადებები: ${allSentences.length}`;
    setupNavigation(allSentences);
  } catch (err) {
    console.error("PDF load error:", err);
    statusEl.textContent = "შეცდომა PDF-ის ჩატვირთვისას: " + err.message;
    statusEl.classList.add("error");
  }
}

function base64ToUint8Array(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function init() {
  const params = new URLSearchParams(location.search);
  const fileParam = params.get("file");
  const source = params.get("source");

  if (fileParam) {
    statusEl.textContent = "PDF იტვირთება ბმულიდან...";
    try {
      const resp = await fetch(fileParam);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const buf = await resp.arrayBuffer();
      let name = "დოკუმენტი.pdf";
      try {
        name = decodeURIComponent(fileParam.split("/").pop().split("?")[0]) || name;
      } catch (_) {}
      await loadPdf(new Uint8Array(buf), name);
    } catch (err) {
      statusEl.textContent = "ვერ ჩაიტვირთა PDF ბმულიდან: " + err.message;
      statusEl.classList.add("error");
    }
  } else if (source === "local") {
    const { pdfBase64, pdfName } = await chrome.storage.local.get([
      "pdfBase64",
      "pdfName"
    ]);
    if (!pdfBase64) {
      statusEl.textContent =
        "ფაილი ვერ მოიძებნა. გახსენით extension-ის popup და აირჩიეთ PDF ხელახლა.";
      statusEl.classList.add("error");
      return;
    }
    await loadPdf(base64ToUint8Array(pdfBase64), pdfName);
  } else {
    statusEl.textContent = "PDF მითითებული არ არის.";
    statusEl.classList.add("error");
  }
}

init();