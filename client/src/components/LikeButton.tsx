import { Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface LikesInfo {
  likesCount: number;
  userLiked: boolean;
}

interface LikeButtonProps {
  articleId: string;
  variant?: 'compact' | 'full';
}

export function LikeButton({ articleId, variant = 'compact' }: LikeButtonProps) {
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();

  const { data: likesInfo, isLoading } = useQuery<LikesInfo>({
    queryKey: ['/api/articles', articleId, 'likes'],
  });

  const likeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/articles/${articleId}/like`);
      return response.json();
    },
    onSuccess: (data: { liked: boolean; likesCount: number }) => {
      queryClient.setQueryData<LikesInfo>(['/api/articles', articleId, 'likes'], {
        likesCount: data.likesCount,
        userLiked: data.liked,
      });
    },
    onError: () => {
      toast({
        title: 'Ошибка',
        description: 'Не удалось поставить лайк',
        variant: 'destructive',
      });
    },
  });

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isAuthenticated) {
      toast({
        title: 'Войдите в систему',
        description: 'Чтобы поставить лайк, необходимо войти в систему',
      });
      return;
    }

    likeMutation.mutate();
  };

  const likesCount = likesInfo?.likesCount ?? 0;
  const userLiked = likesInfo?.userLiked ?? false;

  if (variant === 'full') {
    return (
      <Button
        variant="outline"
        size="default"
        onClick={handleClick}
        disabled={likeMutation.isPending}
        className={cn(
          'gap-2',
          userLiked && 'text-red-500 border-red-200 dark:border-red-900'
        )}
        data-testid={`button-like-${articleId}`}
      >
        <Heart 
          className={cn(
            'h-5 w-5 transition-all',
            userLiked && 'fill-red-500 text-red-500',
            likeMutation.isPending && 'animate-pulse'
          )} 
        />
        <span>{likesCount}</span>
        <span className="text-muted-foreground">
          {userLiked ? 'Вам понравилось' : 'Нравится'}
        </span>
      </Button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={likeMutation.isPending}
      className={cn(
        'flex items-center gap-1.5 text-muted-foreground transition-colors',
        userLiked && 'text-red-500',
        !isLoading && !likeMutation.isPending && 'hover:text-red-500'
      )}
      data-testid={`button-like-${articleId}`}
    >
      <Heart 
        className={cn(
          'h-4 w-4 transition-all',
          userLiked && 'fill-red-500',
          likeMutation.isPending && 'animate-pulse'
        )} 
      />
      <span className="text-sm">{likesCount}</span>
    </button>
  );
}
