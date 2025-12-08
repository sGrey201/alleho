import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

interface ShareButtonProps {
  articleSlug: string;
  variant?: 'compact' | 'full';
}

export function ShareButton({ articleSlug, variant = 'compact' }: ShareButtonProps) {
  const { toast } = useToast();

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const url = `${window.location.origin}/article/${articleSlug}`;

    if (navigator.share) {
      try {
        await navigator.share({
          url,
        });
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          await copyToClipboard(url);
        }
      }
    } else {
      await copyToClipboard(url);
    }
  };

  const copyToClipboard = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast({
        title: 'Ссылка скопирована',
        description: 'Ссылка на статью скопирована в буфер обмена',
      });
    } catch {
      toast({
        title: 'Ошибка',
        description: 'Не удалось скопировать ссылку',
        variant: 'destructive',
      });
    }
  };

  if (variant === 'full') {
    return (
      <Button
        variant="outline"
        size="default"
        onClick={handleClick}
        className="gap-2"
        data-testid={`button-share-${articleSlug}`}
      >
        <Send className="h-5 w-5" />
        <span>Поделиться</span>
      </Button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
      data-testid={`button-share-${articleSlug}`}
    >
      <Send className="h-4 w-4" />
    </button>
  );
}
