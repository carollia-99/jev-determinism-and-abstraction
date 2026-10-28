import "./styles.css";
import { mountGenerativeRenderer } from "./generative-renderer.js";
import { mountComposer } from "./composer-ui.js";

const canvasRoot = document.querySelector("#canvas-root");

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
