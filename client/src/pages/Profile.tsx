import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, LogOut, Camera } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { t } from "@/lib/i18n";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useUpload } from "@/hooks/use-upload";

export type ProfileProps = {
  onSaveSuccess?: () => void;
};

export default function Profile({ onSaveSuccess }: ProfileProps = {}) {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [profileImageUrl, setProfileImageUrl] = useState<string>("");

  useEffect(() => {
    if (user) {
      setFirstName(user.firstName || "");
      setLastName(user.lastName || "");
      setProfileImageUrl(user.profileImageUrl || "");
    }
  }, [user]);

  const { uploadFile, isUploading } = useUpload({
    onError: (error) => {
      toast({
        title: error.message || "Не удалось загрузить аватар",
        variant: "destructive",
      });
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: { firstName: string; lastName: string; gender: string | null; birthMonth: number | null; birthYear: number | null; height: number | null; weight: number | null; city: string | null; profileImageUrl: string | null }) => {
      return apiRequest('PUT', '/api/user/profile', data);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      await queryClient.refetchQueries({ queryKey: ['/api/auth/user'], type: "active" });
    },
  });

  const handleSave = async () => {
    try {
      await updateProfileMutation.mutateAsync({
        firstName,
        lastName,
        gender: user?.gender || null,
        birthMonth: user?.birthMonth ?? null,
        birthYear: user?.birthYear ?? null,
        height: user?.height ?? null,
        weight: user?.weight ?? null,
        city: user?.city || null,
        profileImageUrl: profileImageUrl || null,
      });

      toast({
        title: t.profileSaved,
      });
      onSaveSuccess?.();
    } catch (error) {
      toast({
        title: t.profileSaveError,
        variant: "destructive",
      });
    }
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    queryClient.clear();
    window.location.href = "/";
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const uploadResponse = await uploadFile(file);
    if (uploadResponse?.objectPath) {
      const newAvatarPath = uploadResponse.objectPath;
      setProfileImageUrl(newAvatarPath);
      try {
        await updateProfileMutation.mutateAsync({
          firstName,
          lastName,
          gender: user?.gender || null,
          birthMonth: user?.birthMonth ?? null,
          birthYear: user?.birthYear ?? null,
          height: user?.height ?? null,
          weight: user?.weight ?? null,
          city: user?.city || null,
          profileImageUrl: newAvatarPath,
        });
        toast({ title: "Аватар сохранен" });
      } catch {
        toast({
          title: "Не удалось сохранить аватар",
          variant: "destructive",
        });
      }
    }
    e.target.value = "";
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const isSaving = updateProfileMutation.isPending;
  const initials = `${firstName?.[0] || ""}${lastName?.[0] || ""}`.trim() || "U";

  return (
    <div className="container max-w-2xl mx-auto py-8 px-4">
      <Card>
        <CardContent className="space-y-6 pt-6">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              {profileImageUrl ? <AvatarImage src={`${profileImageUrl}?size=thumb`} alt="avatar" /> : null}
              <AvatarFallback>{initials.toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  id="avatar-upload"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => document.getElementById("avatar-upload")?.click()}
                  disabled={isUploading}
                >
                  {isUploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Camera className="h-4 w-4 mr-2" />}
                  {isUploading ? t.loading : "Изменить фото"}
                </Button>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="firstName">{t.firstName}</Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder={t.firstName}
                data-testid="input-first-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">{t.lastName}</Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder={t.lastName}
                data-testid="input-last-name"
              />
            </div>
          </div>

          <Button type="button" variant="outline" asChild className="w-full">
            <Link href="/health-wall?questionnaire=1">{t.viewQuestionnaireFull}</Link>
          </Button>

          <Button
            onClick={handleSave}
            disabled={isSaving || isUploading}
            className="w-full"
            data-testid="button-save-profile"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                {t.loading}
              </>
            ) : (
              t.save
            )}
          </Button>

          <Button
            type="button"
            variant="outline"
            className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={handleLogout}
            data-testid="button-logout-profile"
          >
            <LogOut className="h-4 w-4 mr-2" />
            {t.logout}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
