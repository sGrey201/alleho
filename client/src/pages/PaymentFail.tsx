import { useLocation } from 'wouter';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { XCircle } from 'lucide-react';

export default function PaymentFail() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <Card className="max-w-md w-full">
        <CardContent className="p-8 text-center">
          <div className="mb-6 flex justify-center">
            <div className="rounded-full bg-red-500/10 p-6">
              <XCircle className="h-16 w-16 text-red-500" />
            </div>
          </div>
          
          <h1 className="text-3xl font-bold text-foreground mb-4">
            Оплата не прошла
          </h1>
          
          <p className="text-muted-foreground mb-6">
            К сожалению, платеж не был завершен. Возможно, произошла ошибка
            или оплата была отменена. Вы можете попробовать еще раз.
          </p>

          <div className="space-y-3">
            <Button 
              onClick={() => setLocation('/subscribe')} 
              className="w-full"
              data-testid="button-try-again"
            >
              Попробовать снова
            </Button>
            
            <Button 
              onClick={() => setLocation('/')} 
              variant="outline"
              className="w-full"
              data-testid="button-go-home"
            >
              Вернуться на главную
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
