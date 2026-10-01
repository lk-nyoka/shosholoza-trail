import { KimberleyDebugDirector } from "./KimberleyDebugDirector.js";

export interface DevPanelOptions {
  title?: string;
  initiallyOpen?: boolean;
}

/**
 * Optional development-only panel.
 * Mount this only when import.meta.env.DEV / your own debug flag is enabled.
 */
export function mountKimberleyDevPanel(
  director: KimberleyDebugDirector,
  root: HTMLElement = document.body,
  options: DevPanelOptions = {},
): () => void {
  const panel = document.createElement("section");
  panel.dataset.kimberleyDevPanel = "true";
  panel.style.cssText = [
    "position:absolute",
    "right:16px",
    "bottom:16px",
    "z-index:9999",
    "width:min(340px,calc(100% - 32px))",
    "padding:12px",
    "border:1px solid rgba(255,255,255,.18)",
    "border-radius:14px",
    "background:rgba(15,15,15,.88)",
    "backdrop-filter:blur(14px)",
    "color:white",
    "font:13px/1.35 system-ui,sans-serif",
  ].join(";");

  const heading = document.createElement("button");
  heading.type = "button";
  heading.textContent = options.title ?? "Kimberley Director";
  heading.style.cssText = "width:100%;text-align:left;background:none;color:white;border:0;font-weight:800;padding:4px;cursor:pointer";

  const body = document.createElement("div");
  body.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px";
  let open = options.initiallyOpen ?? true;
  body.hidden = !open;

  const status = document.createElement("div");
  status.style.cssText = "grid-column:1/-1;opacity:.7;min-height:18px;padding:4px";
  status.textContent = "Ready";

  function addButton(label: string, action: () => Promise<void>) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.style.cssText = "padding:9px;border-radius:10px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.08);color:white;cursor:pointer";
    button.addEventListener("click", async () => {
      const buttons = Array.from(body.querySelectorAll("button"));
      buttons.forEach((item) => (item.disabled = true));
      status.textContent = `Running: ${label}`;
      try {
        await action();
        status.textContent = `Complete: ${label}`;
      } catch (error) {
        status.textContent = `Error: ${error instanceof Error ? error.message : String(error)}`;
      } finally {
        buttons.forEach((item) => (item.disabled = false));
      }
    });
    body.append(button);
  }

  addButton("Heritage", () => director.previewHeritage());
  addButton("Tram", () => director.previewTram());
  addButton("Big Hole", () => director.previewBigHole(false));
  addButton("Fallback", () => director.previewBigHole(true));
  addButton("Reset", () => director.reset());
  body.append(status);

  heading.addEventListener("click", () => {
    open = !open;
    body.hidden = !open;
  });

  panel.append(heading, body);
  root.append(panel);

  return () => panel.remove();
}
