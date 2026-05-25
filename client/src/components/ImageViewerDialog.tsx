import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogOverlay, DialogPortal, DialogTitle } from "@/components/ui/dialog";

interface ImageViewerDialogProps {
  open: boolean;
  imageUrl: string | null;
  hasMultiple: boolean;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
}

export function ImageViewerDialog({
  open,
  imageUrl,
  hasMultiple,
  onClose,
  onPrevious,
  onNext,
}: ImageViewerDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <DialogPortal>
        <DialogOverlay className="z-[110] bg-black/80" />
        <DialogPrimitive.Content
          className="fixed inset-0 z-[110] flex h-full w-full max-w-none translate-x-0 translate-y-0 flex-col border-0 bg-transparent p-0 shadow-none outline-none transform-none focus:outline-none data-[state=open]:animate-none data-[state=closed]:animate-none"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogTitle className="sr-only">Просмотр фото</DialogTitle>

          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Закрыть"
            tabIndex={-1}
            onClick={onClose}
          />

          <div className="relative z-10 flex h-full w-full flex-col pointer-events-none">
            <div className="flex shrink-0 justify-end p-4 pointer-events-auto">
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

            <div className="flex min-h-0 flex-1 items-center justify-center gap-2 px-2 sm:gap-4 sm:px-4 pointer-events-auto">
              {hasMultiple ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="h-11 w-11 shrink-0 rounded-full border border-white/20 bg-white/95 text-foreground shadow-lg hover:bg-white"
                  onClick={onPrevious}
                  aria-label="Предыдущее фото"
                  data-testid="button-image-gallery-prev"
                >
                  <ChevronLeft className="h-7 w-7" />
                </Button>
              ) : (
                <div className="w-11 shrink-0 sm:w-11" aria-hidden />
              )}

              <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center">
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt="Full size"
                    className="max-h-[calc(100vh-8rem)] max-w-full object-contain select-none"
                    draggable={false}
                  />
                ) : null}
              </div>

              {hasMultiple ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="h-11 w-11 shrink-0 rounded-full border border-white/20 bg-white/95 text-foreground shadow-lg hover:bg-white"
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
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
