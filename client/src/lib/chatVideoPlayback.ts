/** Keeps at most one chat `<video>` playing at a time. */
let activeVideo: HTMLVideoElement | null = null;

export function onChatVideoPlay(video: HTMLVideoElement): void {
  if (activeVideo && activeVideo !== video && !activeVideo.paused) {
    activeVideo.pause();
  }
  activeVideo = video;
}

export function onChatVideoUnmount(video: HTMLVideoElement): void {
  if (activeVideo === video) {
    activeVideo = null;
  }
}
