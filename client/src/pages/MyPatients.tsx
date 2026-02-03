import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { t } from "@/lib/i18n";
import { Loader2, Users, ExternalLink } from "lucide-react";
import { format } from "date-fns";

interface Patient {
  id: string;
  userId: string;
  patientName: string;
  birthMonth?: number;
  birthYear?: number;
  gender?: string;
  email: string;
  updatedAt: string;
}

export default function MyPatients() {
  const { isAuthenticated, isLoading: authLoading, isAdmin } = useAuth();
  const [, setLocation] = useLocation();

  const { data: patients, isLoading } = useQuery<Patient[]>({
    queryKey: ['/api/my-patients'],
    enabled: isAuthenticated && isAdmin,
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

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" data-testid="text-my-patients-title">{t.myPatients}</h1>
      </div>

      {patients && patients.length > 0 ? (
        <div className="space-y-4">
          {patients.map((patient) => (
            <Card key={patient.id} className="hover-elevate" data-testid={`card-patient-${patient.id}`}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="text-lg">{patient.patientName}</CardTitle>
                    <CardDescription>
                      {patient.birthMonth && patient.birthYear && (
                        <span>{patient.birthMonth.toString().padStart(2, '0')}.{patient.birthYear}</span>
                      )}
                      {patient.birthMonth && patient.birthYear && patient.gender && ' • '}
                      {patient.gender && <span>{getGenderLabel(patient.gender)}</span>}
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setLocation(`/patient/${patient.userId}`)}
                    data-testid={`button-view-patient-${patient.id}`}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    {t.viewQuestionnaire}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>{patient.email}</span>
                  <span>•</span>
                  <span>{t.lastUpdated}: {format(new Date(patient.updatedAt), 'dd.MM.yyyy')}</span>
                </div>
              </CardContent>
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
