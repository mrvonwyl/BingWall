import './index.models.js';
import type { HistoryItemPayload, RefreshResultPayload } from './index.models.js';

function renderWallpaperInfo(current: NonNullable<Awaited<ReturnType<typeof window.bingwall.getCurrentWallpaper>>>): void {
  const imageEl = document.getElementById('wallpaper-image') as HTMLImageElement;
  const dateEl = document.getElementById('wallpaper-date') as HTMLElement;
  const titleEl = document.getElementById('wallpaper-title') as HTMLElement;
  const descriptionEl = document.getElementById('wallpaper-description') as HTMLElement;
  const copyrightEl = document.getElementById('wallpaper-copyright') as HTMLElement;

  imageEl.src = current.imageUrl;
  imageEl.alt = current.metadata.title;
  dateEl.textContent = current.metadata.date;
  titleEl.textContent = current.metadata.title;
  descriptionEl.textContent = current.metadata.description;

  copyrightEl.replaceChildren();
  if (current.metadata.copyrightlink) {
    const link = document.createElement('a');
    link.href = current.metadata.copyrightlink;
    link.textContent = current.metadata.copyright;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    copyrightEl.appendChild(link);
  } else {
    copyrightEl.textContent = current.metadata.copyright;
  }
}

async function renderHistory(activeDate: string | undefined): Promise<void> {
  const historyEl = document.getElementById('history') as HTMLElement;
  const stripEl = document.getElementById('history-strip') as HTMLElement;
  const items = await window.bingwall.getHistory();

  historyEl.hidden = items.length === 0;
  stripEl.replaceChildren();

  for (const item of items) {
    stripEl.appendChild(buildThumbnail(item, item.metadata.date === activeDate));
  }
}

function buildThumbnail(item: HistoryItemPayload, isActive: boolean): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'history-thumbnail';
  button.classList.toggle('active', isActive);
  button.setAttribute('aria-label', `${item.metadata.title} (${item.metadata.date})`);

  const img = document.createElement('img');
  img.src = item.imageUrl;
  img.alt = '';
  button.appendChild(img);

  button.addEventListener('click', () => {
    void handleThumbnailClick(item.metadata.date);
  });

  return button;
}

async function handleThumbnailClick(date: string): Promise<void> {
  const selected = await window.bingwall.selectWallpaper(date);
  if (!selected) {
    return;
  }

  renderWallpaperInfo(selected);
  await renderHistory(selected.metadata.date);
}

function showError(message: string): void {
  const banner = document.getElementById('error-banner') as HTMLElement;
  banner.textContent = message;
  banner.hidden = false;
}

function clearError(): void {
  const banner = document.getElementById('error-banner') as HTMLElement;
  banner.hidden = true;
  banner.textContent = '';
}

async function handleRefreshResult(result: RefreshResultPayload): Promise<void> {
  if (!result.ok) {
    showError(result.error);
    return;
  }

  clearError();

  const wallpaperEl = document.getElementById('wallpaper') as HTMLElement;
  const emptyEl = document.getElementById('empty-state') as HTMLElement;

  if (!result.current) {
    wallpaperEl.hidden = true;
    emptyEl.hidden = false;
  } else {
    wallpaperEl.hidden = false;
    emptyEl.hidden = true;
    renderWallpaperInfo(result.current);
  }

  await renderHistory(result.current?.metadata.date);
}

function renderRefreshButton(): void {
  const button = document.getElementById('refresh-button') as HTMLButtonElement;

  button.addEventListener('click', () => {
    void (async () => {
      button.disabled = true;
      try {
        await window.bingwall.refresh();
      } finally {
        button.disabled = false;
      }
    })();
  });
}

async function renderSettings(): Promise<void> {
  const checkbox = document.getElementById('auto-refresh-checkbox') as HTMLInputElement;
  const settings = await window.bingwall.getSettings();
  checkbox.checked = settings.dailyAutoRefresh;

  checkbox.addEventListener('change', () => {
    void window.bingwall.updateSettings({ dailyAutoRefresh: checkbox.checked });
  });
}

async function render(): Promise<void> {
  const wallpaperEl = document.getElementById('wallpaper') as HTMLElement;
  const emptyEl = document.getElementById('empty-state') as HTMLElement;
  const current = await window.bingwall.getCurrentWallpaper();

  if (!current) {
    wallpaperEl.hidden = true;
    emptyEl.hidden = false;
  } else {
    wallpaperEl.hidden = false;
    emptyEl.hidden = true;
    renderWallpaperInfo(current);
  }

  await renderHistory(current?.metadata.date);
  await renderSettings();
  renderRefreshButton();
  window.bingwall.onRefreshResult((result) => {
    void handleRefreshResult(result);
  });
}

void render();
