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
let contextMenu: HTMLElement | null = null;

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

// --- Context menu ---

function dismissContextMenu() {
  if (contextMenu) {
    contextMenu.remove();
    contextMenu = null;
  }
}

function showContextMenu(d: DashboardInfo, x: number, y: number) {
  dismissContextMenu();

  const isRunning = d.status === "running";
  const menu = el("div", "context-menu fixed z-50 bg-[#222] border border-glass-border rounded-lg py-1 shadow-2xl min-w-[160px]");
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  const addItem = (label: string, className: string, handler: () => void) => {
    const item = el("div", `px-3 py-1.5 text-[13px] cursor-pointer hover:bg-white/[0.08] transition-colors ${className}`, label);
    item.addEventListener("click", async (e) => {
      e.stopPropagation();
      dismissContextMenu();
      await handler();
    });
    menu.appendChild(item);
  };

  const addSeparator = () => {
    menu.appendChild(el("div", "my-1 border-t border-glass-border"));
  };

  // Start / Stop
  addItem(
    isRunning ? "Stop" : "Start",
    "text-gray-300",
    async () => {
      if (isRunning) {
        await invoke("stop_dashboard", { name: d.name });
      } else {
        await invoke("start_dashboard", { name: d.name });
      }
      await refreshList();
    }
  );

  // Restart (only when running)
  if (isRunning) {
    addItem("Restart", "text-gray-300", async () => {
      await invoke("stop_dashboard", { name: d.name });
      await invoke("start_dashboard", { name: d.name });
      await refreshList();
      if (activeDashboard === d.name) {
        const dashboards: DashboardInfo[] = await invoke("list_dashboards");
        const updated = dashboards.find((dd) => dd.name === d.name);
        if (updated?.port) {
          showFrame(`http://localhost:${updated.port}`);
        }
      }
    });
  }

  addSeparator();

  // Remove (destructive)
  addItem("Remove", "text-red-400", async () => {
    await invoke("remove_dashboard", { name: d.name });
    if (activeDashboard === d.name) {
      activeDashboard = null;
      showEmpty();
    }
    await refreshList();
  });

  document.body.appendChild(menu);
  contextMenu = menu;

  // Clamp to viewport
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    menu.style.left = `${window.innerWidth - rect.width - 8}px`;
  }
  if (rect.bottom > window.innerHeight) {
    menu.style.top = `${window.innerHeight - rect.height - 8}px`;
  }
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

  // Ellipsis menu button (appears on hover, like ChatGPT sidebar)
  const btnMore = el(
    "button",
    "bg-transparent border-none text-dim cursor-pointer text-[15px] px-1 py-0.5 rounded leading-none hover:text-gray-200 hover:bg-white/10 transition-all opacity-0",
    "\u00B7\u00B7\u00B7"
  );
  btnMore.title = "More";

  item.appendChild(dot);
  item.appendChild(name);
  item.appendChild(btnMore);

  // Show ellipsis on hover
  item.addEventListener("mouseenter", () => btnMore.classList.replace("opacity-0", "opacity-100"));
  item.addEventListener("mouseleave", () => {
    // Keep visible if context menu is open for this item
    if (!contextMenu) btnMore.classList.replace("opacity-100", "opacity-0");
  });

  // Click row to select dashboard
  item.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest("button")) return;
    selectDashboard(d);
  });

  // Ellipsis button opens context menu
  btnMore.addEventListener("click", (e) => {
    e.stopPropagation();
    const rect = btnMore.getBoundingClientRect();
    showContextMenu(d, rect.left, rect.bottom + 4);
  });

  // Right-click opens same context menu
  item.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    showContextMenu(d, e.clientX, e.clientY);
  });

  return item;
}

// --- Views ---

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
  // Dismiss context menu on click/right-click anywhere else
  document.addEventListener("click", (e) => {
    if (contextMenu && !(e.target as HTMLElement).closest(".context-menu")) {
      dismissContextMenu();
    }
  });

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
