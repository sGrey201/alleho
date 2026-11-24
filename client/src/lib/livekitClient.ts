export type LiveKitModule = typeof import("livekit-client");

let loading: Promise<LiveKitModule> | null = null;

/** Loads livekit-client on the first outgoing call or accepted incoming call. */
export function loadLiveKit(): Promise<LiveKitModule> {
  loading ??= import("livekit-client");
  return loading;
}
