import { invoke } from "@tauri-apps/api/core";

interface DashboardInfo {
  name: string;
  dashboard_dir: string;
  command: string[] | null;
  port: number | null;
  pid: number | null;
  status: string;
  started_at: string | null;
  created_at: string;
}

let activeDashboard: string | null = null;

// --- DOM helpers ---

const $ = (sel: string) => document.querySelector(sel);
const listEl = $("#dashboard-list") as HTMLElement;
const frameEl = $("#dashboard-frame") as HTMLIFrameElement;
const emptyEl = $("#empty-state") as HTMLElement;
const dialog = $("#register-dialog") as HTMLDialogElement;

function createElement(
  tag: string,
  attrs: Record<string, string> = {},
  text?: string
): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "className") el.className = v;
    else el.setAttribute(k, v);
  }
  if (text) el.textContent = text;
  return el;
}

// --- Render ---

function renderDashboard(d: DashboardInfo): HTMLElement {
  const isRunning = d.status === "running";

  const item = createElement("div", {
    className: `dashboard-item${d.name === activeDashboard ? " active" : ""}`,
    "data-name": d.name,
  });

  const dot = createElement("span", {
    className: `status-dot ${d.status}`,
  });

  const name = createElement("span", { className: "name" }, d.name);

  const actions = createElement("span", { className: "actions" });

  const btnToggle = createElement(
    "button",
    { className: "btn-toggle", title: isRunning ? "Stop" : "Start" },
    isRunning ? "\u25A0" : "\u25B6"
  );

  const btnRemove = createElement(
    "button",
    { className: "btn-remove", title: "Remove" },
    "\u2715"
  );

  actions.appendChild(btnToggle);
  actions.appendChild(btnRemove);
  item.appendChild(dot);
  item.appendChild(name);
  item.appendChild(actions);

  // Click to select and view
  item.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    if (target.closest(".actions")) return;
    selectDashboard(d);
  });

  // Toggle start/stop
  btnToggle.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (isRunning) {
      await invoke("stop_dashboard", { name: d.name });
    } else {
      await invoke("start_dashboard", { name: d.name });
    }
    await refreshList();
  });

  // Remove
  btnRemove.addEventListener("click", async (e) => {
    e.stopPropagation();
    await invoke("remove_dashboard", { name: d.name });
    if (activeDashboard === d.name) {
      activeDashboard = null;
      showEmpty();
    }
    await refreshList();
  });

  return item;
}

function showEmpty() {
  emptyEl.style.display = "flex";
  frameEl.style.display = "none";
}

function showFrame(url: string) {
  emptyEl.style.display = "none";
  frameEl.style.display = "block";
  frameEl.src = url;
}

async function selectDashboard(d: DashboardInfo) {
  activeDashboard = d.name;

  // Auto-start if stopped
  if (d.status !== "running") {
    const started: DashboardInfo = await invoke("start_dashboard", {
      name: d.name,
    });
    d = started;
    await refreshList();
    // Give the server a moment to bind
    await new Promise((r) => setTimeout(r, 1000));
  }

  if (d.port) {
    showFrame(`http://localhost:${d.port}`);
  }

  // Update active state in sidebar
  document.querySelectorAll(".dashboard-item").forEach((el) => {
    el.classList.toggle(
      "active",
      (el as HTMLElement).dataset.name === d.name
    );
  });
}

async function refreshList() {
  const dashboards: DashboardInfo[] = await invoke("list_dashboards");

  listEl.replaceChildren();
  for (const d of dashboards) {
    listEl.appendChild(renderDashboard(d));
  }

  // If active dashboard is gone, show empty
  if (
    activeDashboard &&
    !dashboards.find((d) => d.name === activeDashboard)
  ) {
    activeDashboard = null;
    showEmpty();
  }
}

// --- Events ---

window.addEventListener("DOMContentLoaded", async () => {
  // Start all dashboards on launch
  await invoke("start_all_dashboards");
  await refreshList();

  // Start All button
  $("#btn-start-all")!.addEventListener("click", async () => {
    await invoke("start_all_dashboards");
    await refreshList();
  });

  // Add button
  $("#btn-add")!.addEventListener("click", () => {
    dialog.showModal();
  });

  // Cancel register
  $("#btn-cancel-register")!.addEventListener("click", () => {
    dialog.close();
  });

  // Register form submit
  $("#register-form")!.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = ($("#reg-name") as HTMLInputElement).value.trim();
    const dir = ($("#reg-dir") as HTMLInputElement).value.trim();
    const cmdStr = ($("#reg-cmd") as HTMLInputElement).value.trim();
    const command = cmdStr ? cmdStr.split(/\s+/) : null;

    try {
      await invoke("register_dashboard", { name, dir, command });
      dialog.close();
      ($("#register-form") as HTMLFormElement).reset();
      await refreshList();
    } catch (err) {
      console.error("Register failed:", err);
    }
  });
});
