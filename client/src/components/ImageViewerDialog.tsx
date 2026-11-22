import { useCallback, useEffect, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogOverlay, DialogPortal, DialogTitle } from "@/components/ui/dialog";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface ImageViewerDialogProps {
  open: boolean;
  imageUrl: string | null;
  hasMultiple: boolean;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
  allowZoom?: boolean;
}

const CONTROL_BUTTON_CLASS =
  "rounded-full border border-white/50 bg-black/55 text-white shadow-lg backdrop-blur-md hover:bg-black/70";

export function ImageViewerDialog({
  open,
  imageUrl,
  hasMultiple,
  onClose,
  onPrevious,
  onNext,
  allowZoom = false,
}: ImageViewerDialogProps) {
  const [nativeSize, setNativeSize] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(false);
  const controlsVisibleRef = useRef(false);
  const hideTimer = useRef<number | null>(null);

  const clearHideTimer = useCallback(() => {
    if (hideTimer.current != null) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  const hideControls = useCallback(() => {
    controlsVisibleRef.current = false;
    setControlsVisible(false);
  }, []);

  const revealControls = useCallback(() => {
    controlsVisibleRef.current = true;
    setControlsVisible(true);
    clearHideTimer();
    hideTimer.current = window.setTimeout(hideControls, 3000);
  }, [clearHideTimer, hideControls]);

  const toggleControls = useCallback(() => {
    if (controlsVisibleRef.current) {
      clearHideTimer();
      hideControls();
      return;
    }
    revealControls();
  }, [clearHideTimer, hideControls, revealControls]);

  useEffect(() => {
    if (!open) {
      setNativeSize(false);
      setControlsVisible(false);
      clearHideTimer();
      return;
    }
    revealControls();
    return () => clearHideTimer();
  }, [open, imageUrl, revealControls, clearHideTimer]);

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <DialogPortal>
        <DialogOverlay className="z-[130] bg-black/80" onClick={onClose} />
        <DialogPrimitive.Content
          className="fixed inset-0 z-[130] flex h-full w-full max-w-none translate-x-0 translate-y-0 flex-col border-0 bg-transparent p-0 shadow-none outline-none transform-none pointer-events-none focus:outline-none data-[state=open]:animate-none data-[state=closed]:animate-none"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogTitle className="sr-only">Просмотр фото</DialogTitle>

          <div
            className="pointer-events-auto relative min-h-0 flex-1 overflow-auto"
            onPointerMove={(e) => {
              if (e.pointerType === "mouse") revealControls();
            }}
            onClick={onClose}
          >
            <div className="flex min-h-full w-full flex-col">
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt=""
                  draggable={false}
                  className={
                    nativeSize
                      ? "mx-auto my-auto block h-auto max-w-none select-none"
                      : "mx-auto my-auto block h-auto w-full select-none"
                  }
                  onClick={(e) => e.stopPropagation()}
                  onPointerUp={(e) => {
                    if (e.pointerType === "mouse") return;
                    toggleControls();
                  }}
                />
              ) : null}
            </div>

            <div
              className={cn(
                "pointer-events-none absolute inset-0 z-20 transition-opacity duration-200",
                controlsVisible ? "opacity-100" : "opacity-0"
              )}
            >
              <div
                className="absolute z-20 flex gap-2"
                style={{
                  top: "max(1rem, env(safe-area-inset-top, 0px))",
                  right: "max(1rem, env(safe-area-inset-right, 0px))",
                }}
              >
                {allowZoom ? (
                  <Button
                    type="button"
                    variant="secondary"
                    className={cn(
                      "h-12 px-4",
                      CONTROL_BUTTON_CLASS,
                      controlsVisible ? "pointer-events-auto" : "pointer-events-none"
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      setNativeSize((value) => !value);
                      revealControls();
                    }}
                    aria-label={nativeSize ? t.imageViewerZoomFit : t.imageViewerZoom100}
                    data-testid="button-image-viewer-zoom"
                  >
                    {nativeSize ? (
                      <>
                        <ZoomOut className="mr-2 h-5 w-5" />
                        {t.imageViewerZoomFit}
                      </>
                    ) : (
                      <>
                        <ZoomIn className="mr-2 h-5 w-5" />
                        {t.imageViewerZoom100}
                      </>
                    )}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className={cn(
                    "h-12 w-12",
                    CONTROL_BUTTON_CLASS,
                    controlsVisible ? "pointer-events-auto" : "pointer-events-none"
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose();
                  }}
                  aria-label="Закрыть"
                  data-testid="button-close-image-viewer"
                >
                  <X className="h-7 w-7" />
                </Button>
              </div>

              {hasMultiple ? (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    className={cn(
                      "absolute top-1/2 h-12 w-12 -translate-y-1/2",
                      CONTROL_BUTTON_CLASS,
                      controlsVisible ? "pointer-events-auto" : "pointer-events-none"
                    )}
                    style={{ left: "max(0.75rem, env(safe-area-inset-left, 0px))" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onPrevious();
                      revealControls();
                    }}
                    aria-label="Предыдущее фото"
                    data-testid="button-image-gallery-prev"
                  >
                    <ChevronLeft className="h-7 w-7" />
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    className={cn(
                      "absolute top-1/2 h-12 w-12 -translate-y-1/2",
                      CONTROL_BUTTON_CLASS,
                      controlsVisible ? "pointer-events-auto" : "pointer-events-none"
                    )}
                    style={{ right: "max(0.75rem, env(safe-area-inset-right, 0px))" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onNext();
                      revealControls();
                    }}
                    aria-label="Следующее фото"
                    data-testid="button-image-gallery-next"
                  >
                    <ChevronRight className="h-7 w-7" />
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
