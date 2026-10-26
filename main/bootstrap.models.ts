export type BootstrapPointer = {
  dataFolder: string;
};

// `firstStart` is true only when no pointer file exists yet: every start writes one, so its absence
// means BingWall has never run on this account.
export type BootstrapRead = {
  pointer: BootstrapPointer;
  firstStart: boolean;
};
