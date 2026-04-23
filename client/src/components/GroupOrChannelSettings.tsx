import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Trash2, UserPlus, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useUpload } from "@/hooks/use-upload";
import { t } from "@/lib/i18n";

type Participant = {
  userId: string;
  role: string;
  user?: { firstName?: string | null; lastName?: string | null; email?: string | null };
};

type ConversationInfo = {
  id: string;
  type: "group" | "channel" | "direct" | "consilium";
  name?: string | null;
  avatarUrl?: string | null;
  participants?: Participant[];
};

type SearchDoctor = {
  userId: string;
  firstName?: string;
  lastName?: string;
  email?: string;
};

type SearchResponse = { doctors: SearchDoctor[]; groups: unknown[]; channels: unknown[] };

interface Props {
  conversationId: string;
  mode: "group" | "channel";
  currentUserId?: string;
  onBack: () => void;
}

export default function GroupOrChannelSettings({ conversationId, mode, currentUserId, onBack }: Props) {
  const { toast } = useToast();
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [search, setSearch] = useState("");
  const [avatarDraft, setAvatarDraft] = useState<string>("");
  const [isEditingName, setIsEditingName] = useState(false);

  const { uploadFile, isUploading } = useUpload();

  const { data: conv, isLoading } = useQuery<ConversationInfo>({
    queryKey: ["/api/conversations", conversationId],
    enabled: !!conversationId,
  });

  useEffect(() => {
    if (!conv) return;
    setNameDraft(conv.name ?? "");
    setAvatarDraft(conv.avatarUrl ?? "");
  }, [conv?.id, conv?.name, conv?.avatarUrl]);

  const myRole = conv?.participants?.find((p) => p.userId === currentUserId)?.role;
  const isOwner = myRole === "owner";

  const { data: searchData } = useQuery<SearchResponse>({
    queryKey: ["/api/messenger/search", search],
    queryFn: async () => {
      const res = await fetch(`/api/messenger/search?q=${encodeURIComponent(search.trim())}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: mode === "group" && !!conv && isOwner,
  });

  const participantIds = useMemo(() => new Set((conv?.participants ?? []).map((p) => p.userId)), [conv?.participants]);
  const candidates = useMemo(
    () => (searchData?.doctors ?? []).filter((d) => !participantIds.has(d.userId)),
    [searchData, participantIds]
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/conversations/${conversationId}`, {
        name: nameDraft.trim(),
        avatarUrl: avatarDraft || null,
      });
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/conversations", conversationId] });
      await queryClient.invalidateQueries({ queryKey: ["/api/me/chats"] });
      toast({ title: t.save });
    },
    onError: () => toast({ title: t.onlyOwnerCanAddMembers, variant: "destructive" }),
  });

  const addMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("PATCH", `/api/conversations/${conversationId}`, { addParticipantIds: [userId] });
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/conversations", conversationId] });
      await queryClient.invalidateQueries({ queryKey: ["/api/me/chats"] });
      toast({ title: t.userAddedToGroup });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("DELETE", `/api/conversations/${conversationId}/participants/${userId}`);
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/conversations", conversationId] });
      await queryClient.invalidateQueries({ queryKey: ["/api/me/chats"] });
    },
  });

  const handleAvatarChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const uploadResponse = await uploadFile(file);
    if (uploadResponse?.objectPath) {
      const newAvatarPath = uploadResponse.objectPath;
      setAvatarDraft(newAvatarPath);
      try {
        await apiRequest("PATCH", `/api/conversations/${conversationId}`, {
          name: (nameDraft || conv?.name || "").trim(),
          avatarUrl: newAvatarPath,
        });
        await queryClient.invalidateQueries({ queryKey: ["/api/conversations", conversationId] });
        await queryClient.invalidateQueries({ queryKey: ["/api/me/chats"] });
        await queryClient.refetchQueries({ queryKey: ["/api/conversations", conversationId], type: "active" });
        await queryClient.refetchQueries({ queryKey: ["/api/me/chats"], type: "active" });
        toast({ title: "Аватар сохранен" });
      } catch (error) {
        toast({
          title: "Не удалось сохранить аватар",
          description: error instanceof Error ? error.message : String(error),
          variant: "destructive",
        });
      }
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

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="border-b px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="font-semibold truncate">
          {mode === "group" ? t.searchGroups : t.searchChannels}
        </h1>
      </div>

      <div className="p-4 space-y-4 overflow-y-auto">
        <div className="flex items-center gap-3">
          <Avatar className="h-16 w-16">
            <AvatarImage src={avatarDraft || undefined} />
            <AvatarFallback>{(nameDraft || conv.name || "?").slice(0, 1).toUpperCase()}</AvatarFallback>
          </Avatar>
          {isOwner && (
            <>
              <input ref={avatarInputRef} type="file" className="hidden" accept="image/*" onChange={handleAvatarChange} />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isUploading}
                onClick={() => avatarInputRef.current?.click()}
              >
                {isUploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Camera className="h-4 w-4 mr-2" />}
                {t.edit}
              </Button>
            </>
          )}
        </div>

        <div className="space-y-2">
          {!isEditingName ? (
            <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
              <p className="text-sm font-medium truncate">{nameDraft || conv.name || "—"}</p>
              {isOwner && (
                <Button type="button" variant="outline" size="sm" onClick={() => setIsEditingName(true)}>
                  {t.edit}
                </Button>
              )}
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
                  onClick={() => {
                    saveMutation.mutate();
                    setIsEditingName(false);
                  }}
                  disabled={saveMutation.isPending || !nameDraft.trim()}
                >
                  {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
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

        <div className="space-y-2">
          <p className="text-sm font-medium">{t.participants}</p>
          {(conv.participants ?? []).map((p) => {
            const displayName =
              [p.user?.firstName, p.user?.lastName].filter(Boolean).join(" ").trim() || p.user?.email || p.userId;
            const canRemove = isOwner && p.userId !== currentUserId && mode === "group";
            return (
              <div key={p.userId} className="flex items-center justify-between rounded-md border px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm truncate">{displayName}</p>
                  <p className="text-xs text-muted-foreground">{p.role}</p>
                </div>
                {canRemove && (
                  <Button size="icon" variant="ghost" onClick={() => removeMemberMutation.mutate(p.userId)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        {mode === "group" && isOwner && (
          <div className="space-y-2">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t.searchDoctorsToAdd} />
            {candidates.map((doctor) => {
              const displayName =
                [doctor.firstName, doctor.lastName].filter(Boolean).join(" ").trim() || doctor.email || doctor.userId;
              return (
                <button
                  key={doctor.userId}
                  type="button"
                  onClick={() => addMemberMutation.mutate(doctor.userId)}
                  className="w-full text-left flex items-center justify-between rounded-md border px-3 py-2 hover:bg-muted/40"
                >
                  <span className="truncate">{displayName}</span>
                  <UserPlus className="h-4 w-4 text-primary" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
