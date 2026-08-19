export interface UpdaterLike {
  checkForUpdatesAndNotify(): Promise<unknown>;
}
