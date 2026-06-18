import { useEffect, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogOverlay, DialogPortal, DialogTitle } from "@/components/ui/dialog";
import { t } from "@/lib/i18n";

interface ImageViewerDialogProps {
  open: boolean;
  imageUrl: string | null;
  hasMultiple: boolean;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
  allowZoom?: boolean;
}

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

  useEffect(() => {
    if (!open) setNativeSize(false);
  }, [open]);

  useEffect(() => {
    setNativeSize(false);
  }, [imageUrl]);

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <DialogPortal>
        {/* Above message-action-layer (z-120) and chat chrome; overlay receives backdrop clicks. */}
        <DialogOverlay className="z-[130] bg-black/80" onClick={onClose} />
        <DialogPrimitive.Content
          className="fixed inset-0 z-[130] flex h-full w-full max-w-none translate-x-0 translate-y-0 flex-col border-0 bg-transparent p-0 shadow-none outline-none transform-none pointer-events-none focus:outline-none data-[state=open]:animate-none data-[state=closed]:animate-none"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogTitle className="sr-only">Просмотр фото</DialogTitle>

          <div
            className="pointer-events-auto absolute right-4 z-20 flex gap-2"
            style={{ top: "max(1rem, env(safe-area-inset-top, 0px))" }}
          >
            {allowZoom ? (
              <Button
                type="button"
                variant="secondary"
                className="h-11 rounded-full border border-white/20 bg-white px-4 text-foreground shadow-lg hover:bg-white/90"
                onClick={() => setNativeSize((value) => !value)}
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
              className="h-11 w-11 rounded-full border border-white/20 bg-white text-foreground shadow-lg hover:bg-white/90"
              onClick={onClose}
              aria-label="Закрыть"
              data-testid="button-close-image-viewer"
            >
              <X className="h-6 w-6" />
            </Button>
          </div>

          <div className="flex min-h-0 flex-1 items-center justify-center gap-2 px-2 sm:gap-4 sm:px-4">
            {hasMultiple ? (
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="pointer-events-auto h-11 w-11 shrink-0 rounded-full border border-white/20 bg-white/95 text-foreground shadow-lg hover:bg-white"
                onClick={onPrevious}
                aria-label="Предыдущее фото"
                data-testid="button-image-gallery-prev"
              >
                <ChevronLeft className="h-7 w-7" />
              </Button>
            ) : (
              <div className="w-11 shrink-0 sm:w-11" aria-hidden />
            )}

            <div
              className={
                nativeSize
                  ? "pointer-events-auto flex min-h-0 min-w-0 flex-1 overflow-auto p-4 sm:p-8"
                  : "flex min-h-0 min-w-0 flex-1 items-center justify-center"
              }
            >
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt=""
                  className={
                    nativeSize
                      ? "mx-auto block max-h-none max-w-none select-none"
                      : "pointer-events-auto max-h-[calc(100vh-8rem)] max-w-full object-contain select-none"
                  }
                  draggable={false}
                />
              ) : null}
            </div>

            {hasMultiple ? (
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="pointer-events-auto h-11 w-11 shrink-0 rounded-full border border-white/20 bg-white/95 text-foreground shadow-lg hover:bg-white"
                onClick={onNext}
                aria-label="Следующее фото"
                data-testid="button-image-gallery-next"
              >
                <ChevronRight className="h-7 w-7" />
              </Button>
            ) : (
              <div className="w-11 shrink-0 sm:w-11" aria-hidden />
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
