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
  isFree?: boolean;
  initialLikesCount?: number;
  initialUserLiked?: boolean;
}

export function LikeButton({ 
  articleId, 
  variant = 'compact', 
  isFree = false,
  initialLikesCount,
  initialUserLiked 
}: LikeButtonProps) {
  const { isAuthenticated, hasActiveSubscription } = useAuth();
  const { toast } = useToast();

  // Use query only if initial data not provided (e.g., in ArticleReader)
  const { data: likesInfo, isLoading } = useQuery<LikesInfo>({
    queryKey: ['/api/articles', articleId, 'likes'],
    enabled: initialLikesCount === undefined,
    initialData: initialLikesCount !== undefined ? {
      likesCount: initialLikesCount,
      userLiked: initialUserLiked ?? false
    } : undefined,
  });

  const likeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/articles/${articleId}/like`);
      return response.json();
    },
    onSuccess: (data: { liked: boolean; likesCount: number }) => {
      // Update individual like cache
      queryClient.setQueryData<LikesInfo>(['/api/articles', articleId, 'likes'], {
        likesCount: data.likesCount,
        userLiked: data.liked,
      });
      // Invalidate articles list to refresh likes counts
      queryClient.invalidateQueries({ queryKey: ['/api/articles'] });
    },
    onError: () => {
      toast({
        title: 'Ошибка',
        description: 'Не удалось поставить лайк',
        variant: 'destructive',
      });
    },
  });

  const canLike = isFree || hasActiveSubscription;

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

    if (!canLike) {
      toast({
        title: 'Требуется подписка',
        description: 'Чтобы поставить лайк на эту статью, необходима подписка',
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
        className="gap-2"
        data-testid={`button-like-${articleId}`}
      >
        <Heart 
          className={cn(
            'h-5 w-5 transition-all',
            userLiked && 'fill-current',
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
        userLiked && 'text-foreground',
        !isLoading && !likeMutation.isPending && 'hover:text-foreground'
      )}
      data-testid={`button-like-${articleId}`}
    >
      <Heart 
        className={cn(
          'h-4 w-4 transition-all',
          userLiked && 'fill-current',
          likeMutation.isPending && 'animate-pulse'
        )} 
      />
      <span className="text-sm">{likesCount}</span>
    </button>
  );
}
