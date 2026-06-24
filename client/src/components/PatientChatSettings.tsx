import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { postConversationSeen } from "@/lib/markConversationSeen";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, Camera, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useUpload } from "@/hooks/use-upload";
import { profileAvatarSrc } from "@/lib/utils";
import { messengerProfilePath } from "@/lib/messengerPaths";
import { normalizeImageFile } from "@/lib/normalizeImageFile";
import { t } from "@/lib/i18n";

type ConversationInfo = {
  id: string;
  type: string;
  name?: string | null;
  avatarUrl?: string | null;
  patientUserId?: string | null;
  participants?: Array<{
    userId: string;
    user?: {
      firstName?: string | null;
      lastName?: string | null;
      email?: string | null;
    };
  }>;
};

function formatContactFullName(user?: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}): string {
  if (!user) return "—";
  const fullName = [user.lastName, user.firstName].filter(Boolean).join(" ").trim();
  return fullName || user.email || "—";
}

type Props = {
  conversationId: string;
  onBack: () => void;
};

export default function PatientChatSettings({ conversationId, onBack }: Props) {
  const { toast } = useToast();
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [avatarDraft, setAvatarDraft] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);
  const { uploadFile, isUploading } = useUpload();

  const { data: conv, isLoading } = useQuery<ConversationInfo>({
    queryKey: ["/api/conversations", conversationId],
    enabled: !!conversationId,
  });

  useEffect(() => {
    if (!conversationId) return;
    postConversationSeen(conversationId);
  }, [conversationId]);

  useEffect(() => {
    if (!conv) return;
    setNameDraft(conv.name ?? "");
    setAvatarDraft(conv.avatarUrl ?? "");
  }, [conv?.id, conv?.name, conv?.avatarUrl]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/conversations/${conversationId}/patient-settings`, {
        name: nameDraft.trim(),
        avatarUrl: avatarDraft || null,
      });
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/conversations", conversationId] });
      await queryClient.invalidateQueries({ queryKey: ["/api/me/chats"] });
      setIsEditingName(false);
      toast({ title: t.saved });
    },
    onError: () => toast({ title: t.error, variant: "destructive" }),
  });

  const handleAvatarChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const normalizedFile = await normalizeImageFile(file);
    const uploadResponse = await uploadFile(normalizedFile);
    if (!uploadResponse?.objectPath) return;
    const newAvatarPath = uploadResponse.objectPath;
    setAvatarDraft(newAvatarPath);
    try {
      await apiRequest("PATCH", `/api/conversations/${conversationId}/patient-settings`, {
        name: (nameDraft || conv?.name || "").trim(),
        avatarUrl: newAvatarPath,
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/conversations", conversationId] });
      await queryClient.invalidateQueries({ queryKey: ["/api/me/chats"] });
      toast({ title: t.profileSaved });
    } catch (error) {
      toast({
        title: t.error,
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    }
    e.target.value = "";
  };

  if (isLoading || !conv) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const displayName = nameDraft || conv.name || "—";
  const patientProfileId = conv.patientUserId;
  const patientUser = conv.participants?.find((p) => p.userId === patientProfileId)?.user;
  const contactFullName = formatContactFullName(patientUser);

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <Button type="button" variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="truncate font-semibold">{t.patientChatSettings}</h1>
      </div>

      <div className="space-y-6 overflow-y-auto p-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-16 w-16">
            <AvatarImage src={profileAvatarSrc(avatarDraft || conv.avatarUrl, "avatar")} />
            <AvatarFallback>{displayName.charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div>
            <input
              ref={avatarInputRef}
              type="file"
              className="hidden"
              accept="image/*"
              onChange={handleAvatarChange}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isUploading}
              onClick={() => avatarInputRef.current?.click()}
            >
              {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
              {t.changeChatPhoto}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label>{t.chatNameLabel}</Label>
          {!isEditingName ? (
            <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
              <p className="truncate text-sm font-medium">{displayName}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => setIsEditingName(true)}>
                {t.edit}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                placeholder={t.messengerConversationNamePlaceholder}
                autoFocus
              />
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending || !nameDraft.trim()}
                >
                  {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {t.save}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setNameDraft(conv.name ?? "");
                    setIsEditingName(false);
                  }}
                >
                  {t.cancel}
                </Button>
              </div>
            </div>
          )}
        </div>

        {patientProfileId && (
          <div className="rounded-xl border border-border/60 bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground mb-1">{t.contactPersonLabel}</p>
            <Link
              href={messengerProfilePath(
                patientProfileId,
                `/messenger/chat/${conversationId}/settings`
              )}
              className="text-base font-medium text-primary hover:underline"
              data-testid="link-contact-person-profile"
            >
              {contactFullName}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
