import "./styles.css";
import { mountGenerativeRenderer } from "./generative-renderer.js";
import { mountComposer } from "./composer-ui.js";

const canvasRoot = document.querySelector("#canvas-root");
const sandboxPreview = document.querySelector("#sandbox-preview");
const imagePreview = document.querySelector("#image-preview");
const downloadButton = document.querySelector("[data-download-art]");
const howDialog = document.querySelector("#how-it-works");
const howTrigger = document.querySelector("[data-how-open]");
let pendingSandboxDownload = null;

function downloadHref(href) {
  const link = document.createElement("a");
  link.href = href;
  link.download = `model-canvas-${new Date().toISOString().replaceAll(":", "-").replace(".", "-")}.png`;
  document.body.append(link);
  link.click();
  link.remove();
}

function setDownloadPending(pending) {
  downloadButton.disabled = pending;
  downloadButton.querySelector("span").textContent = pending ? "Preparing…" : "Download";
}

downloadButton.addEventListener("click", () => {
  if (!imagePreview.hidden && imagePreview.src) {
    setDownloadPending(true);
    downloadHref(imagePreview.src);
    setDownloadPending(false);
    return;
  }

  if (!sandboxPreview.hidden && sandboxPreview.contentWindow) {
    const requestId = crypto.randomUUID();
    pendingSandboxDownload = requestId;
    setDownloadPending(true);
    sandboxPreview.contentWindow.postMessage({ type: "decision-canvas:download", requestId }, "*");
    window.setTimeout(() => {
      if (pendingSandboxDownload !== requestId) return;
      pendingSandboxDownload = null;
      setDownloadPending(false);
    }, 5_000);
    return;
  }

  const canvas = canvasRoot.querySelector("canvas");
  if (!canvas) return;
  setDownloadPending(true);
  canvas.toBlob((blob) => {
    if (blob) {
      const url = URL.createObjectURL(blob);
      downloadHref(url);
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    }
    setDownloadPending(false);
  }, "image/png");
});

window.addEventListener("message", (event) => {
  if (event.source !== sandboxPreview.contentWindow) return;
  const message = event.data;
  if (message?.type !== "decision-canvas:download-result" || message.requestId !== pendingSandboxDownload) return;
  pendingSandboxDownload = null;
  setDownloadPending(false);
  if (typeof message.dataUrl === "string" && message.dataUrl.startsWith("data:image/png")) downloadHref(message.dataUrl);
});

howTrigger.addEventListener("click", () => howDialog.showModal());
howDialog.querySelectorAll("[data-how-close]").forEach((button) => {
  button.addEventListener("click", () => howDialog.close());
});
howDialog.addEventListener("click", (event) => {
  if (event.target === howDialog) howDialog.close();
});

mountComposer({
  promptForm: document.querySelector("#prompt-form"),
  promptInput: document.querySelector("#prompt-input"),
  promptMessage: document.querySelector("#prompt-message"),
  status: document.querySelector("#art-status"),
  trace: document.querySelector("#model-trace"),
  sessionLedger: document.querySelector("#session-ledger"),
  examples: document.querySelector("#example-prompts"),
});
mountGenerativeRenderer(canvasRoot);
