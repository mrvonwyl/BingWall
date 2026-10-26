export type StartupVisibilityInput = {
  startMinimized: boolean;
  openedAtLogin: boolean;
};

// The subset of Electron's login item settings BingWall registers and queries with.
export type LoginItemSettings = {
  openAtLogin: boolean;
  args: string[];
};
