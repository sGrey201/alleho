import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { User, Payment } from '@shared/schema';

type UserWithPayment = User & { lastPaymentDate?: string | Date | null };
import { t } from '@/lib/i18n';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Calendar as CalendarIcon, Check, AlertTriangle, X, CreditCard } from 'lucide-react';
import { format, addDays, addMonths, addYears } from 'date-fns';

export default function AdminSubscriptions() {
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [expirationDate, setExpirationDate] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [paymentsDialogUser, setPaymentsDialogUser] = useState<UserWithPayment | null>(null);

  const { data: users, isLoading } = useQuery<UserWithPayment[]>({
    queryKey: ['/api/admin/users'],
    enabled: isAdmin,
  });

  const { data: userPayments, isLoading: paymentsLoading } = useQuery<Payment[]>({
    queryKey: [`/api/admin/users/${paymentsDialogUser?.id}/payments`],
    enabled: !!paymentsDialogUser,
  });

  const updateSubscriptionMutation = useMutation({
    mutationFn: async ({ userId, expiresAt }: { userId: string; expiresAt: Date | null }) => {
      return await apiRequest('PUT', `/api/admin/users/${userId}/subscription`, {
        subscriptionExpiresAt: expiresAt?.toISOString() || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      toast({
        title: t.subscriptionUpdated,
        variant: 'default',
      });
      setIsDialogOpen(false);
      setEditingUser(null);
    },
    onError: () => {
      toast({
        title: t.error,
        description: t.somethingWrong,
        variant: 'destructive',
      });
    },
  });

  const handleQuickExtend = (user: User, days: number) => {
    const currentExpiration = user.subscriptionExpiresAt
      ? new Date(user.subscriptionExpiresAt)
      : new Date();
    const newExpiration = addDays(currentExpiration > new Date() ? currentExpiration : new Date(), days);
    updateSubscriptionMutation.mutate({ userId: user.id, expiresAt: newExpiration });
  };

  const handleSetExpiration = () => {
    if (!editingUser || !expirationDate) return;
    const date = new Date(expirationDate);
    updateSubscriptionMutation.mutate({ userId: editingUser.id, expiresAt: date });
  };

  type SubscriptionStatus = 'active' | 'expiring' | 'expired';

  const getSubscriptionStatus = (user: User): SubscriptionStatus => {
    if (!user.subscriptionExpiresAt) return 'expired';
    const expiresAt = new Date(user.subscriptionExpiresAt);
    const now = new Date();
    const daysUntilExpiration = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    if (expiresAt < now) return 'expired';
    if (daysUntilExpiration <= 30) return 'expiring';
    return 'active';
  };

  const getStatusBgColor = (status: SubscriptionStatus) => {
    switch (status) {
      case 'active': return 'bg-green-600';
      case 'expiring': return 'bg-yellow-600';
      case 'expired': return 'bg-red-600';
    }
  };

  const getStatusIcon = (status: SubscriptionStatus) => {
    switch (status) {
      case 'active': return Check;
      case 'expiring': return AlertTriangle;
      case 'expired': return X;
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center">
          <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto"></div>
          <p className="text-muted-foreground">{t.loading}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">{t.manageSubscriptions}</h1>
        <p className="text-muted-foreground mt-1">
          {users?.length || 0} {t.allUsers.toLowerCase()}
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[200px]">{t.email}</TableHead>
                  <TableHead>Посл. оплата</TableHead>
                  <TableHead>{t.expiresAt}</TableHead>
                  <TableHead className="text-right">{t.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users && users.length > 0 ? (
                  users.map((user) => {
                    const status = getSubscriptionStatus(user);
                    return (
                      <TableRow 
                        key={user.id} 
                        data-testid={`row-user-${user.id}`}
                        className="cursor-pointer hover-elevate"
                        onClick={() => setPaymentsDialogUser(user)}
                      >
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <span 
                              className={`flex h-5 w-5 items-center justify-center rounded-full ${getStatusBgColor(status)}`}
                              data-testid={`subscription-indicator-${status}-${user.id}`}
                            >
                              {(() => {
                                const StatusIcon = getStatusIcon(status);
                                return <StatusIcon className="h-3 w-3 text-white" />;
                              })()}
                            </span>
                            <div>
                              <div className="font-medium">{user.email || 'No email'}</div>
                              {user.firstName && user.lastName && (
                                <div className="text-sm text-muted-foreground">
                                  {user.firstName} {user.lastName}
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {user.lastPaymentDate
                            ? format(new Date(user.lastPaymentDate), 'MMM d, yyyy')
                            : '—'}
                        </TableCell>
                        <TableCell>
                          {user.subscriptionExpiresAt
                            ? format(new Date(user.subscriptionExpiresAt), 'MMM d, yyyy')
                            : t.never}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleQuickExtend(user, 30)}
                              disabled={updateSubscriptionMutation.isPending}
                              data-testid={`button-extend-30-${user.id}`}
                            >
                              {t.extend30Days}
                            </Button>
                            <Dialog
                              open={isDialogOpen && editingUser?.id === user.id}
                              onOpenChange={(open) => {
                                setIsDialogOpen(open);
                                if (open) {
                                  setEditingUser(user);
                                  setExpirationDate(
                                    user.subscriptionExpiresAt
                                      ? format(new Date(user.subscriptionExpiresAt), 'yyyy-MM-dd')
                                      : format(addDays(new Date(), 7), 'yyyy-MM-dd')
                                  );
                                } else {
                                  setEditingUser(null);
                                }
                              }}
                            >
                              <DialogTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  data-testid={`button-set-expiration-${user.id}`}
                                >
                                  <CalendarIcon className="h-4 w-4" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>{t.setExpiration}</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4">
                                  <div>
                                    <Label htmlFor="expirationDate">
                                      {t.expiresAt}
                                    </Label>
                                    <Input
                                      id="expirationDate"
                                      type="date"
                                      value={expirationDate}
                                      onChange={(e) => setExpirationDate(e.target.value)}
                                      data-testid="input-expiration-date"
                                    />
                                  </div>
                                  <div className="flex justify-end gap-2">
                                    <Button
                                      variant="outline"
                                      onClick={() => setIsDialogOpen(false)}
                                      data-testid="button-cancel-expiration"
                                    >
                                      {t.cancel}
                                    </Button>
                                    <Button
                                      onClick={handleSetExpiration}
                                      disabled={updateSubscriptionMutation.isPending}
                                      data-testid="button-save-expiration"
                                    >
                                      {t.save}
                                    </Button>
                                  </div>
                                </div>
                              </DialogContent>
                            </Dialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-12 text-muted-foreground">
                      {t.noResults}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!paymentsDialogUser} onOpenChange={(open) => !open && setPaymentsDialogUser(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              История оплат: {paymentsDialogUser?.email}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[400px]">
            {paymentsLoading ? (
              <div className="flex justify-center py-8">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
              </div>
            ) : userPayments && userPayments.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Дата</TableHead>
                    <TableHead>Сумма</TableHead>
                    <TableHead>Описание</TableHead>
                    <TableHead>Статус</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {userPayments.map((payment) => (
                    <TableRow key={payment.id} data-testid={`payment-row-${payment.id}`}>
                      <TableCell>
                        {payment.createdAt 
                          ? format(new Date(payment.createdAt), 'dd.MM.yyyy HH:mm')
                          : '—'}
                      </TableCell>
                      <TableCell className="font-medium">{payment.amount} ₽</TableCell>
                      <TableCell className="max-w-[200px] truncate">{payment.description}</TableCell>
                      <TableCell>
                        <Badge 
                          variant={payment.status === 'completed' ? 'default' : payment.status === 'pending' ? 'secondary' : 'destructive'}
                        >
                          {payment.status === 'completed' ? 'Оплачено' : payment.status === 'pending' ? 'Ожидание' : 'Ошибка'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                Нет платежей
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
