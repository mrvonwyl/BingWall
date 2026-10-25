// Shared contract between main (applierHost) and the applier child (applierChild/applierCore).
// Both sides import these types so the compiler keeps them in step.

export type ApplyRequest = { id: number; op: 'apply'; path: string };
export type CapabilitiesRequest = { id: number; op: 'capabilities' };
export type ApplierRequest = ApplyRequest | CapabilitiesRequest;

// os-rejected: the OS refused the wallpaper (code = GetLastError()).
// malformed-request: the child got a message it can't parse.
// backend-failed: the backend threw unexpectedly.
// applier-unavailable: the child kept dying, or the host is capped after repeated deaths (host side).
// timeout: the child didn't answer within the watchdog and was killed (host side).
export type ApplierErrorKind = 'os-rejected' | 'malformed-request' | 'backend-failed' | 'applier-unavailable' | 'timeout';

export type ApplierError = { kind: 'error'; error: ApplierErrorKind; code?: number; message?: string };

// What a backend reports for one apply.
export type BackendApplyResult = { kind: 'applied' } | ApplierError;

// The outcome of one apply request as seen by its caller.
export type ApplyOutcome = { kind: 'applied' } | { kind: 'superseded' } | ApplierError;

export type ApplierCapabilities = {
  backend: string;
  perMonitor: boolean;
  coversAllWorkspaces: boolean;
  persistsWithoutApp: boolean;
};

export type ApplierReply =
  | ({ id: number } & ApplyOutcome)
  | { id: number; kind: 'capabilities'; capabilities: ApplierCapabilities };

export interface ApplierBackend {
  apply(path: string): Promise<BackendApplyResult>;
  capabilities(): ApplierCapabilities;
}
