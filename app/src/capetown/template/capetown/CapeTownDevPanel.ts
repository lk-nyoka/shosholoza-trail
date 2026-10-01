import { CapeTownDebugDirector } from "./CapeTownDebugDirector.js";

export function mountCapeTownDevPanel(
  director: CapeTownDebugDirector,
  parent: HTMLElement = document.body,
): () => void {
  const panel = document.createElement("section");
  panel.dataset.capeTownDevPanel = "true";
  Object.assign(panel.style, {
    position: "fixed",
    right: "12px",
    bottom: "12px",
    zIndex: "9999",
    background: "rgba(12, 18, 24, .88)",
    color: "white",
    padding: "12px",
    borderRadius: "14px",
    fontFamily: "system-ui, sans-serif",
    width: "260px",
    backdropFilter: "blur(12px)",
  });

  const title = document.createElement("strong");
  title.textContent = "Cape Town Director";
  panel.append(title);

  const grid = document.createElement("div");
  Object.assign(grid.style, {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "7px",
    marginTop: "10px",
  });

  const actions: Array<[string, () => Promise<unknown> | unknown]> = [
    ["Station", () => director.station()],
    ["Bo-Kaap", () => director.boKaap()],
    ["Cableway", () => director.cableway()],
    ["Summit", () => director.summit()],
    ["Waterfront", () => director.waterfront()],
    ["Recap", () => director.recap()],
    ["Fallback", () => director.fallbackMountain()],
    ["Reset", () => director.reset()],
  ];

  for (const [label, action] of actions) {
    const button = document.createElement("button");
    button.textContent = label;
    button.type = "button";
    button.style.padding = "8px";
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await action();
      } catch (error) {
        console.error(`[Cape Town Director] ${label} failed`, error);
      } finally {
        button.disabled = false;
      }
    });
    grid.append(button);
  }

  panel.append(grid);
  parent.append(panel);

  return () => panel.remove();
}
