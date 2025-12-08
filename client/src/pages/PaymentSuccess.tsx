import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle } from 'lucide-react';
import { queryClient } from '@/lib/queryClient';

export default function PaymentSuccess() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Invalidate user cache to refresh subscription info in header
    queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
    
    const timer = setTimeout(() => {
      setLocation('/');
    }, 5000);

    return () => clearTimeout(timer);
  }, [setLocation]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <Card className="max-w-md w-full">
        <CardContent className="p-8 text-center">
          <div className="mb-6 flex justify-center">
            <div className="rounded-full bg-green-500/10 p-6">
              <CheckCircle className="h-16 w-16 text-green-500" />
            </div>
          </div>
          
          <h1 className="text-3xl font-bold text-foreground mb-4">
            Оплата прошла успешно!
          </h1>
          
          <p className="text-muted-foreground mb-6">
            Спасибо за покупку! Ваша подписка активирована на 6 месяцев.
            Теперь у вас есть полный доступ ко всем материалам платформы.
          </p>

          <div className="space-y-3">
            <Button 
              onClick={() => setLocation('/')} 
              className="w-full"
              data-testid="button-go-home"
            >
              Перейти к статьям
            </Button>
            
            <p className="text-sm text-muted-foreground">
              Автоматический переход через 5 секунд...
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
