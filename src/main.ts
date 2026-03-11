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

function el(
  tag: string,
  className: string,
  text?: string
): HTMLElement {
  const e = document.createElement(tag);
  e.className = className;
  if (text) e.textContent = text;
  return e;
}

// --- Render ---

function renderDashboard(d: DashboardInfo): HTMLElement {
  const isRunning = d.status === "running";
  const isActive = d.name === activeDashboard;

  const item = el(
    "div",
    `dashboard-item relative flex items-center gap-2.5 py-1.5 px-3 my-px rounded-md cursor-pointer text-[13px] font-[450] transition-all ${
      isActive
        ? "active bg-surface-active text-gray-200"
        : "text-muted hover:bg-surface-hover hover:text-gray-200"
    }`
  );
  item.dataset.name = d.name;

  const dot = el(
    "span",
    `status-dot shrink-0 w-1.5 h-1.5 rounded-full ${
      isRunning
        ? "running bg-status-green shadow-[0_0_5px_var(--color-status-glow)]"
        : "stopped bg-dim opacity-50"
    }`
  );

  const name = el(
    "span",
    "flex-1 overflow-hidden text-ellipsis whitespace-nowrap tracking-tight",
    d.name
  );

  const actions = el(
    "span",
    "flex gap-0.5 opacity-0 transition-opacity group-item"
  );

  const btnToggle = el(
    "button",
    "bg-transparent border-none text-dim cursor-pointer text-[13px] px-1.5 py-0.5 rounded leading-none hover:text-gray-200 hover:bg-white/10 transition-all",
    isRunning ? "\u25A0" : "\u25B6"
  );
  btnToggle.title = isRunning ? "Stop" : "Start";

  const btnRemove = el(
    "button",
    "bg-transparent border-none text-dim cursor-pointer text-[13px] px-1.5 py-0.5 rounded leading-none hover:text-gray-200 hover:bg-white/10 transition-all",
    "\u2715"
  );
  btnRemove.title = "Remove";

  actions.appendChild(btnToggle);
  actions.appendChild(btnRemove);
  item.appendChild(dot);
  item.appendChild(name);
  item.appendChild(actions);

  // Show actions on hover
  item.addEventListener("mouseenter", () => actions.classList.replace("opacity-0", "opacity-100"));
  item.addEventListener("mouseleave", () => actions.classList.replace("opacity-100", "opacity-0"));

  // Click to select
  item.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest("button")) return;
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

  if (d.status !== "running") {
    const started: DashboardInfo = await invoke("start_dashboard", {
      name: d.name,
    });
    d = started;
    await refreshList();
    await new Promise((r) => setTimeout(r, 1000));
  }

  if (d.port) {
    showFrame(`http://localhost:${d.port}`);
  }

  // Update active state
  document.querySelectorAll(".dashboard-item").forEach((el) => {
    const isActive = (el as HTMLElement).dataset.name === d.name;
    el.classList.toggle("active", isActive);
    el.classList.toggle("bg-surface-active", isActive);
    el.classList.toggle("text-gray-200", isActive);
    el.classList.toggle("text-muted", !isActive);
  });
}

async function refreshList() {
  const dashboards: DashboardInfo[] = await invoke("list_dashboards");

  listEl.replaceChildren();
  for (const d of dashboards) {
    listEl.appendChild(renderDashboard(d));
  }

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
  await invoke("start_all_dashboards");
  await refreshList();

  $("#btn-start-all")!.addEventListener("click", async () => {
    await invoke("start_all_dashboards");
    await refreshList();
  });

  $("#btn-add")!.addEventListener("click", () => {
    dialog.showModal();
  });

  $("#btn-cancel-register")!.addEventListener("click", () => {
    dialog.close();
  });

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
