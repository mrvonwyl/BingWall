import "./index.models.js";
import type {
  HistoryItemPayload,
  RefreshResultPayload,
  StoredImageMetadata,
} from "./index.models.js";

// Gallery items in chronological order (oldest left, newest right).
let historyItems: HistoryItemPayload[] = [];
let selectedIndex = -1;
let applyRequestId = 0;

function byId<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function selectedItem(): HistoryItemPayload | undefined {
  return historyItems[selectedIndex];
}

let activeBackdropLayer = 0;
let backdropUrl: string | undefined;

function renderBackdrop(imageUrl: string): void {
  if (imageUrl === backdropUrl) {
    return;
  }
  backdropUrl = imageUrl;

  // Preload so the crossfade starts with a fully decoded image instead of a blank layer.
  const preload = new Image();
  preload.src = imageUrl;
  void preload
    .decode()
    .catch(() => undefined)
    .then(() => {
      if (backdropUrl !== imageUrl) {
        return;
      }

      const layers = document.querySelectorAll<HTMLElement>(".backdrop-layer");
      activeBackdropLayer = 1 - activeBackdropLayer;
      const incoming = layers[activeBackdropLayer];
      incoming.style.backgroundImage = `url("${imageUrl}")`;
      incoming.classList.add("visible");
      layers[1 - activeBackdropLayer].classList.remove("visible");
    });
}

function renderWallpaperInfo(
  metadata: StoredImageMetadata,
  imageUrl: string,
): void {
  const infoEl = byId("wallpaper-info");
  const copyrightEl = byId("wallpaper-copyright");

  renderBackdrop(imageUrl);
  byId("wallpaper-date").textContent = formatDate(metadata.date);
  byId("wallpaper-title").textContent = metadata.title;
  byId("wallpaper-description").textContent = metadata.description;

  copyrightEl.replaceChildren();
  if (metadata.copyrightlink) {
    const link = document.createElement("a");
    link.href = metadata.copyrightlink;
    link.textContent = metadata.copyright;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    copyrightEl.appendChild(link);
  } else {
    copyrightEl.textContent = metadata.copyright;
  }

  // Restart the fade-in animation for the new text.
  infoEl.classList.remove("changing");
  void infoEl.offsetWidth;
  infoEl.classList.add("changing");
}

function formatDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return date;
  }
  return parsed.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function renderEmptyState(isEmpty: boolean): void {
  byId("wallpaper").hidden = isEmpty;
  byId("empty-state").hidden = !isEmpty;
}

async function loadHistory(activeDate: string | undefined): Promise<void> {
  const historyEl = byId("history");
  const stripEl = byId("history-strip");
  const items = await window.bingwall.getHistory();

  historyItems = [...items].reverse();
  historyEl.hidden = historyItems.length === 0;
  stripEl.replaceChildren(
    ...historyItems.map((item, index) => buildThumbnail(item, index)),
  );

  const activeIndex = historyItems.findIndex(
    (item) => item.metadata.date === activeDate,
  );
  selectedIndex = activeIndex >= 0 ? activeIndex : historyItems.length - 1;

  renderSelection(false);
}

function buildThumbnail(
  item: HistoryItemPayload,
  index: number,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "history-thumbnail";
  button.tabIndex = -1;
  button.setAttribute("role", "option");
  button.setAttribute(
    "aria-label",
    `${item.metadata.title} (${item.metadata.date})`,
  );

  const img = document.createElement("img");
  img.src = item.imageUrl;
  img.alt = "";
  img.loading = "lazy";
  img.decoding = "async";

  const date = document.createElement("span");
  date.className = "thumb-date";
  date.textContent = item.metadata.date;

  button.append(img, date);
  button.addEventListener("click", () => {
    select(index);
  });

  return button;
}

function renderSelection(animate: boolean): void {
  const stripEl = byId("history-strip");
  const thumbnails = Array.from(stripEl.children) as HTMLElement[];

  thumbnails.forEach((thumb, index) => {
    const isActive = index === selectedIndex;
    thumb.classList.toggle("active", isActive);
    thumb.setAttribute("aria-selected", String(isActive));
  });

  byId<HTMLButtonElement>("history-prev").disabled = selectedIndex <= 0;
  byId<HTMLButtonElement>("history-next").disabled =
    selectedIndex >= historyItems.length - 1;

  const item = selectedItem();
  if (item) {
    renderWallpaperInfo(item.metadata, item.imageUrl);
  }

  centerSelection(animate);
}

// Slides the strip so the selected thumbnail sits in the middle of the viewport,
// clamped at both ends so the strip never leaves empty space beside it.
function centerSelection(animate: boolean): void {
  const viewportEl = byId("history-viewport");
  const stripEl = byId("history-strip");
  const active = stripEl.children[selectedIndex] as HTMLElement | undefined;

  const viewportWidth = viewportEl.clientWidth;
  const stripWidth = stripEl.scrollWidth;
  let offset: number;

  if (stripWidth <= viewportWidth || !active) {
    offset = (viewportWidth - stripWidth) / 2;
  } else {
    const centered =
      viewportWidth / 2 - (active.offsetLeft + active.offsetWidth / 2);
    offset = Math.min(0, Math.max(viewportWidth - stripWidth, centered));
  }

  stripEl.style.transition = animate ? "" : "none";
  stripEl.style.transform = `translateX(${offset}px)`;
  if (!animate) {
    void stripEl.offsetWidth;
    stripEl.style.transition = "";
  }
}

// Updates the in-app preview and requests the desktop wallpaper at once. Rapid arrow-key
// navigation is coalesced by the applier (latest wins), so there's no debounce here.
function select(index: number): void {
  const clamped = Math.max(0, Math.min(historyItems.length - 1, index));
  if (clamped === selectedIndex || historyItems.length === 0) {
    return;
  }

  selectedIndex = clamped;
  renderSelection(true);
  void applySelection();
}

async function applySelection(): Promise<void> {
  const item = selectedItem();
  if (!item) {
    return;
  }

  const requestId = ++applyRequestId;
  const reply = await window.bingwall.selectWallpaper(item.metadata.date);
  // Stale replies and superseded requests change nothing: a newer request owns the outcome.
  if (!reply || requestId !== applyRequestId || reply.status === "superseded") {
    return;
  }

  if (reply.status === "error") {
    showError(reply.message);
    // The previous wallpaper and selection stay in place, so move the highlight back to it.
    const current = await window.bingwall.getCurrentWallpaper();
    if (requestId === applyRequestId) {
      await loadHistory(current?.metadata.date);
    }
    return;
  }

  renderEmptyState(false);
}

function renderGalleryControls(): void {
  const viewportEl = byId("history-viewport");

  byId("history-prev").addEventListener("click", () =>
    select(selectedIndex - 1),
  );
  byId("history-next").addEventListener("click", () =>
    select(selectedIndex + 1),
  );

  viewportEl.addEventListener("keydown", (event) => {
    const targets: Record<string, number> = {
      ArrowLeft: selectedIndex - 1,
      ArrowRight: selectedIndex + 1,
      Home: 0,
      End: historyItems.length - 1,
    };
    const target = targets[event.key];
    if (target === undefined) {
      return;
    }

    event.preventDefault();
    select(target);
  });

  new ResizeObserver(() => centerSelection(false)).observe(viewportEl);
}

function renderSettingsPane(): void {
  const pane = byId("settings");
  const overlay = byId("settings-overlay");
  const openButton = byId("settings-button");
  const closeButton = byId("settings-close-button");

  const setOpen = (open: boolean): void => {
    pane.classList.toggle("open", open);
    pane.inert = !open;
    pane.setAttribute("aria-hidden", String(!open));
    overlay.hidden = !open;
    openButton.setAttribute("aria-expanded", String(open));

    if (open) {
      closeButton.focus({ preventScroll: true });
    } else if (
      pane.contains(document.activeElement) ||
      document.activeElement === document.body
    ) {
      openButton.focus({ preventScroll: true });
    }
  };

  openButton.addEventListener("click", () =>
    setOpen(!pane.classList.contains("open")),
  );
  closeButton.addEventListener("click", () => setOpen(false));
  overlay.addEventListener("click", () => setOpen(false));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && pane.classList.contains("open")) {
      setOpen(false);
    }
  });
}

function showError(message: string): void {
  const banner = byId("error-banner");
  banner.textContent = message;
  banner.hidden = false;
}

function clearError(): void {
  const banner = byId("error-banner");
  banner.hidden = true;
  banner.textContent = "";
}

const SUCCESS_BANNER_DURATION_MS = 4000;
let successBannerTimeout: ReturnType<typeof setTimeout> | undefined;

function showSuccess(message: string): void {
  const banner = byId("success-banner");
  banner.textContent = message;
  banner.hidden = false;

  clearTimeout(successBannerTimeout);
  successBannerTimeout = setTimeout(() => {
    banner.hidden = true;
    banner.textContent = "";
  }, SUCCESS_BANNER_DURATION_MS);
}

async function handleRefreshResult(
  result: RefreshResultPayload,
): Promise<void> {
  // A newer refresh owns the outcome: no message, no banner change.
  if ("superseded" in result) {
    return;
  }

  if (!result.ok) {
    showError(result.error);
    return;
  }

  if (result.warning) {
    showError(result.warning);
  } else {
    clearError();
    showSuccess("Wallpaper updated.");
  }

  renderEmptyState(!result.current);
  await loadHistory(result.current?.metadata.date);
}

function renderRefreshButton(): void {
  const button = byId<HTMLButtonElement>("refresh-button");

  button.addEventListener("click", () => {
    void (async () => {
      button.disabled = true;
      button.classList.add("loading");
      try {
        await window.bingwall.refresh();
      } finally {
        button.disabled = false;
        button.classList.remove("loading");
      }
    })();
  });
}

function renderDownloadButton(): void {
  const button = byId<HTMLButtonElement>("download-button");

  button.addEventListener("click", () => {
    void (async () => {
      const date = selectedItem()?.metadata.date;
      if (!date) {
        return;
      }

      button.disabled = true;
      try {
        const savedTo = await window.bingwall.downloadWallpaper(date);
        if (savedTo) {
          showSuccess("Saved to Downloads.");
        }
      } finally {
        button.disabled = false;
      }
    })();
  });
}

async function renderSettings(): Promise<void> {
  const checkbox = byId<HTMLInputElement>("auto-refresh-checkbox");
  const resolutionSelect = byId<HTMLSelectElement>("resolution-select");
  const marketSelect = byId<HTMLSelectElement>("market-select");
  let settings = await window.bingwall.getSettings();
  checkbox.checked = settings.dailyAutoRefresh;
  resolutionSelect.value = settings.resolutionOverride ?? "";
  marketSelect.value = settings.market;

  marketSelect.addEventListener("change", () => {
    void (async () => {
      settings = await window.bingwall.updateSettings({
        ...settings,
        market: marketSelect.value as typeof settings.market,
      });
    })();
  });

  checkbox.addEventListener("change", () => {
    void (async () => {
      settings = await window.bingwall.updateSettings({
        ...settings,
        dailyAutoRefresh: checkbox.checked,
      });
    })();
  });

  resolutionSelect.addEventListener("change", () => {
    void (async () => {
      const resolutionOverride =
        resolutionSelect.value === ""
          ? null
          : (resolutionSelect.value as NonNullable<
              typeof settings.resolutionOverride
            >);
      settings = await window.bingwall.updateSettings({
        ...settings,
        resolutionOverride,
      });
    })();
  });
}

async function renderDataFolder(): Promise<void> {
  const pathEl = byId("data-folder-path");
  const changeButton = byId<HTMLButtonElement>("data-folder-change-button");

  pathEl.textContent = await window.bingwall.getDataFolder();

  changeButton.addEventListener("click", () => {
    void (async () => {
      const chosen = await window.bingwall.chooseDataFolder();
      if (!chosen) {
        return;
      }

      changeButton.disabled = true;
      try {
        const newFolder = await window.bingwall.relocateDataFolder(chosen);
        pathEl.textContent = newFolder;
      } finally {
        changeButton.disabled = false;
      }
    })();
  });
}

async function render(): Promise<void> {
  const current = await window.bingwall.getCurrentWallpaper();

  renderEmptyState(!current);
  if (current) {
    renderWallpaperInfo(current.metadata, current.imageUrl);
  }

  renderGalleryControls();
  renderSettingsPane();
  await loadHistory(current?.metadata.date);
  await renderSettings();
  await renderDataFolder();
  renderRefreshButton();
  renderDownloadButton();
  window.bingwall.onRefreshResult((result) => {
    void handleRefreshResult(result);
  });

  byId("history-viewport").focus({ preventScroll: true });
}

void render();
