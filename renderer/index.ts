import './index.models.js';

async function render(): Promise<void> {
  const wallpaperEl = document.getElementById('wallpaper') as HTMLElement;
  const emptyEl = document.getElementById('empty-state') as HTMLElement;
  const current = await window.bingwall.getCurrentWallpaper();

  if (!current) {
    wallpaperEl.hidden = true;
    emptyEl.hidden = false;
    return;
  }

  wallpaperEl.hidden = false;
  emptyEl.hidden = true;

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

void render();
