import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { User } from '@shared/schema';
import { t } from '@/lib/i18n';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Calendar as CalendarIcon } from 'lucide-react';
import { format, addDays, addMonths, addYears } from 'date-fns';

export default function AdminSubscriptions() {
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [expirationDate, setExpirationDate] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: ['/api/admin/users'],
    enabled: isAdmin,
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

  const getSubscriptionStatus = (user: User) => {
    if (!user.subscriptionExpiresAt) return 'expired';
    const expiresAt = new Date(user.subscriptionExpiresAt);
    const now = new Date();
    const daysUntilExpiration = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    if (expiresAt < now) return 'expired';
    if (daysUntilExpiration <= 7) return 'trial';
    return 'active';
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: any; label: string }> = {
      active: { variant: 'default' as const, label: t.activeStatus },
      trial: { variant: 'secondary' as const, label: t.trialStatus },
      expired: { variant: 'outline' as const, label: t.expiredStatus },
    };
    const config = variants[status] || variants.expired;
    return <Badge variant={config.variant}>{config.label}</Badge>;
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
                  <TableHead>{t.status}</TableHead>
                  <TableHead>{t.expiresAt}</TableHead>
                  <TableHead className="text-right">{t.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users && users.length > 0 ? (
                  users.map((user) => {
                    const status = getSubscriptionStatus(user);
                    return (
                      <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                        <TableCell className="font-medium">
                          <div>
                            <div className="font-medium">{user.email || 'No email'}</div>
                            {user.firstName && user.lastName && (
                              <div className="text-sm text-muted-foreground">
                                {user.firstName} {user.lastName}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(status)}</TableCell>
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
    </div>
  );
}
