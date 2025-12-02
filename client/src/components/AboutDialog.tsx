import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import bannerVideo from '@assets/баннер_1764664948472.mp4';

interface AboutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AboutDialog({ open, onOpenChange }: AboutDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden">
        <VisuallyHidden>
          <DialogTitle>О проекте</DialogTitle>
        </VisuallyHidden>
        <div className="p-6 text-center">
          <div className="mb-6 rounded-lg overflow-hidden shadow-lg">
            <video
              autoPlay
              loop
              muted
              playsInline
              className="w-full"
            >
              <source src={bannerVideo} type="video/mp4" />
            </video>
          </div>
          
          <div className="mb-8 space-y-4 text-base leading-relaxed text-muted-foreground">
            <p className="text-justify">
              Добро пожаловать в уникальное пространство, где Materia Medica оживает в человеческих судьбах. Наш проект — это галерея живых портретов, инструмент развития интуитивного восприятия типажа с целью увидеть живой, узнаваемый образ за сухими рубриками реперториума. Каждая зарисовка — ключ к пониманию великой книги под названием Materia Medica.
            </p>
            <p className="text-justify">
              Мы будем регулярно публиковать новые портреты, исследуя как известные, так и редкие типажи в разных ситуациях.
            </p>
          </div>
          
          <Button
            size="lg"
            onClick={() => onOpenChange(false)}
            className="px-8"
            data-testid="button-close-about"
          >
            Закрыть
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
