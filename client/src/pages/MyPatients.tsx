import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { t } from "@/lib/i18n";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, Users, MessageCircle, UserPlus, Send } from "lucide-react";

interface Patient {
  id: string;
  userId: string;
  patientName: string;
  birthMonth?: number;
  birthYear?: number;
  gender?: string;
  email: string;
  updatedAt: string;
  unreadCount: number;
  lastMessageAt: string | null;
}

export default function MyPatients() {
  const { isAuthenticated, isLoading: authLoading, isAdmin } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');

  const { data: patients, isLoading } = useQuery<Patient[]>({
    queryKey: ['/api/my-patients'],
    enabled: isAuthenticated && isAdmin,
  });

  const inviteMutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await apiRequest('POST', '/api/invite-patient', { email });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: t.inviteSuccess,
        description: t.inviteSuccessDescription,
      });
      setInviteEmail('');
      setShowInviteForm(false);
      queryClient.invalidateQueries({ queryKey: ['/api/my-patients'] });
    },
    onError: (error: any) => {
      const msg = error?.message || '';
      if (msg.includes('409')) {
        toast({
          title: t.inviteUserExists,
          variant: 'destructive',
        });
      } else {
        toast({
          title: t.inviteError,
          variant: 'destructive',
        });
      }
    },
  });

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation('/auth');
    } else if (!authLoading && isAuthenticated && !isAdmin) {
      setLocation('/');
    }
  }, [authLoading, isAuthenticated, isAdmin, setLocation]);

  if (authLoading || isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated || !isAdmin) {
    return null;
  }

  const getGenderLabel = (gender?: string) => {
    switch (gender) {
      case 'male': return t.genderMale;
      case 'female': return t.genderFemale;
      case 'other': return t.genderOther;
      default: return '';
    }
  };

  const handleInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inviteEmail.trim()) {
      inviteMutation.mutate(inviteEmail.trim());
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold" data-testid="text-my-patients-title">{t.myPatients}</h1>
        <Button
          data-testid="button-invite-patient"
          onClick={() => setShowInviteForm(!showInviteForm)}
          variant={showInviteForm ? "secondary" : "default"}
        >
          <UserPlus className="h-4 w-4 mr-2" />
          {t.invitePatient}
        </Button>
      </div>

      {showInviteForm && (
        <Card className="mb-6">
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-muted-foreground mb-3">{t.invitePatientDescription}</p>
            <form onSubmit={handleInviteSubmit} className="flex gap-2 flex-wrap">
              <Input
                data-testid="input-invite-email"
                type="email"
                placeholder={t.inviteEmailPlaceholder}
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
                className="flex-1 min-w-[200px]"
              />
              <Button
                data-testid="button-send-invite"
                type="submit"
                disabled={inviteMutation.isPending || !inviteEmail.trim()}
              >
                {inviteMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                {t.sendInvite}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {patients && patients.length > 0 ? (
        <div className="space-y-4">
          {patients.map((patient) => (
            <Card 
              key={patient.id} 
              className="hover-elevate cursor-pointer" 
              data-testid={`card-patient-${patient.id}`}
              onClick={() => setLocation(`/health-wall/${patient.userId}`)}
            >
              <CardHeader className="pt-3 pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="text-lg">{patient.patientName}</CardTitle>
                    <CardDescription>
                      {patient.birthMonth && patient.birthYear && (
                        <span>{patient.birthMonth.toString().padStart(2, '0')}.{patient.birthYear}</span>
                      )}
                      {patient.birthMonth && patient.birthYear && patient.email && ' • '}
                      {patient.email && <span>{patient.email}</span>}
                    </CardDescription>
                  </div>
                  {patient.unreadCount > 0 && (
                    <Badge variant="default" className="shrink-0 bg-primary" data-testid={`badge-unread-${patient.id}`}>
                      <MessageCircle className="h-3 w-3 mr-1" />
                      {patient.unreadCount}
                    </Badge>
                  )}
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">{t.noPatientsYet}</h3>
            <p className="text-sm text-muted-foreground text-center max-w-md">
              {t.noPatientsDescription}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
