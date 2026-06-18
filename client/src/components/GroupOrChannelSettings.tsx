import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ArrowLeft, Loader2, Trash2, UserPlus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useUpload } from "@/hooks/use-upload";
import ChannelSponsorSection from "@/components/ChannelSponsorSection";
import ChannelSponsorThanks from "@/components/ChannelSponsorThanks";
import { ImageViewerDialog } from "@/components/ImageViewerDialog";
import { t } from "@/lib/i18n";
import { profileAvatarSrc } from "@/lib/utils";

type Participant = {
  userId: string;
  role: string;
  sponsorExpiresAt?: string | null;
  user?: { firstName?: string | null; lastName?: string | null; email?: string | null };
};

type ConversationInfo = {
  id: string;
  type: "group" | "channel" | "direct" | "consilium";
  name?: string | null;
  avatarUrl?: string | null;
  participantCount?: number;
  sponsorSettings?: { enabled: boolean } | null;
  isSponsor?: boolean;
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
  const [, setLocation] = useLocation();
  const scrollSponsorSection =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("section") === "sponsor";
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [search, setSearch] = useState("");
  const [avatarDraft, setAvatarDraft] = useState<string>("");
  const [isEditingName, setIsEditingName] = useState(false);
  const [avatarViewerOpen, setAvatarViewerOpen] = useState(false);

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
      toast({ title: t.saved });
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

  const unsubscribeMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/conversations/${conversationId}/subscribe`, {});
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/me/chats"] });
      await queryClient.removeQueries({ queryKey: ["/api/conversations", conversationId] });
      toast({ title: t.channelUnsubscribed });
      setLocation("/messenger");
    },
    onError: (err: Error) => {
      toast({ title: t.error, description: err.message, variant: "destructive" });
    },
  });

  const canUnsubscribeFromChannel = mode === "channel" && !!myRole && !isOwner;

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

  const displayName = nameDraft || conv.name || "—";
  const avatarSrc = avatarDraft ? profileAvatarSrc(avatarDraft) : undefined;
  const participantCount =
    mode === "channel"
      ? (conv.participantCount ?? conv.participants?.length ?? 0)
      : 0;
  const sponsorMonetizationEnabled = conv.sponsorSettings?.enabled ?? false;
  const channelOwner = conv.participants?.find((p) => p.role === "owner");
  const ownerDisplayName = channelOwner
    ? [channelOwner.user?.firstName, channelOwner.user?.lastName].filter(Boolean).join(" ").trim() ||
      channelOwner.user?.email ||
      channelOwner.userId
    : null;

  const openAvatarUpload = () => avatarInputRef.current?.click();

  const handleAvatarClick = () => {
    if (isOwner) {
      openAvatarUpload();
      return;
    }
    if (avatarSrc) {
      setAvatarViewerOpen(true);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="border-b px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" className="shrink-0" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>

        {mode === "channel" ? (
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="relative shrink-0">
              <button
                type="button"
                className={`relative block rounded-full ${
                  isOwner || avatarSrc ? "cursor-pointer" : "cursor-default"
                }`}
                onClick={handleAvatarClick}
                aria-label={isOwner ? t.edit : avatarSrc ? "Просмотр аватара" : undefined}
              >
                <Avatar className="h-10 w-10">
                  <AvatarImage src={avatarSrc} />
                  <AvatarFallback>{displayName.slice(0, 1).toUpperCase()}</AvatarFallback>
                </Avatar>
              </button>
              {isOwner && (
                <input
                  ref={avatarInputRef}
                  type="file"
                  className="hidden"
                  accept="image/*"
                  onChange={handleAvatarChange}
                />
              )}
            </div>

            <div className="min-w-0 flex-1">
              {!isEditingName ? (
                <>
                  <div className="flex items-center gap-1">
                    <h1 className="text-base font-semibold truncate">{displayName}</h1>
                    {isOwner && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        onClick={() => setIsEditingName(true)}
                        aria-label={t.edit}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {t.channelParticipantCount(participantCount)}
                  </p>
                </>
              ) : (
                <div className="space-y-2">
                  <Input
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    placeholder={t.messengerConversationNamePlaceholder}
                    autoFocus
                    className="h-8"
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      className="h-7"
                      onClick={() => {
                        saveMutation.mutate();
                        setIsEditingName(false);
                      }}
                      disabled={saveMutation.isPending || !nameDraft.trim()}
                    >
                      {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                      {t.save}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7"
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
          </div>
        ) : (
          <h1 className="font-semibold truncate">{t.searchGroups}</h1>
        )}
      </div>

      <ImageViewerDialog
        open={avatarViewerOpen}
        imageUrl={avatarSrc ?? null}
        hasMultiple={false}
        onClose={() => setAvatarViewerOpen(false)}
        onPrevious={() => {}}
        onNext={() => {}}
      />

      <div className="p-4 space-y-4 overflow-y-auto">
        {mode === "group" && (
          <div className="flex items-start gap-3">
            <div className="relative shrink-0">
              <button
                type="button"
                className={`relative block rounded-full ${
                  isOwner || avatarSrc ? "cursor-pointer" : "cursor-default"
                }`}
                onClick={handleAvatarClick}
                aria-label={isOwner ? t.edit : avatarSrc ? "Просмотр аватара" : undefined}
              >
                <Avatar className="h-16 w-16">
                  <AvatarImage src={avatarSrc} />
                  <AvatarFallback>{displayName.slice(0, 1).toUpperCase()}</AvatarFallback>
                </Avatar>
              </button>
              {isOwner && (
                <input
                  ref={avatarInputRef}
                  type="file"
                  className="hidden"
                  accept="image/*"
                  onChange={handleAvatarChange}
                />
              )}
            </div>

            <div className="min-w-0 flex-1 pt-1">
              {!isEditingName ? (
                <div className="flex items-center gap-1">
                  <p className="text-base font-semibold truncate">{displayName}</p>
                  {isOwner && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => setIsEditingName(true)}
                      aria-label={t.edit}
                    >
                      <Pencil className="h-4 w-4" />
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
                      size="sm"
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
                      size="sm"
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
          </div>
        )}

        {mode === "group" && (
          <div className="space-y-2">
            <p className="text-sm font-medium">{t.participants}</p>
            {(conv.participants ?? []).map((p) => {
              const memberDisplayName =
                [p.user?.firstName, p.user?.lastName].filter(Boolean).join(" ").trim() || p.user?.email || p.userId;
              const canRemove = isOwner && p.userId !== currentUserId;
              return (
                <div key={p.userId} className="flex items-center justify-between rounded-md border px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm truncate">{memberDisplayName}</p>
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
        )}

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

        {mode === "channel" && (
          <>
            {sponsorMonetizationEnabled && (
              <ChannelSponsorThanks
                conversationId={conversationId}
                monetizationEnabled={sponsorMonetizationEnabled}
              />
            )}
            {!isOwner && sponsorMonetizationEnabled && (
              <ChannelSponsorSection
                conversationId={conversationId}
                isOwner={false}
                embedded
                scrollOnMount={scrollSponsorSection}
              />
            )}
            {isOwner && (
              <ChannelSponsorSection
                conversationId={conversationId}
                isOwner
                scrollOnMount={scrollSponsorSection}
              />
            )}
          </>
        )}

        {mode === "channel" && channelOwner && ownerDisplayName && (
          <div className="rounded-lg border px-4 py-3">
            <p className="text-xs text-muted-foreground mb-1">{t.channelOwnerLabel}</p>
            <button
              type="button"
              className="text-sm font-medium text-primary hover:underline truncate max-w-full"
              onClick={() => setLocation(`/profile/${channelOwner.userId}`)}
            >
              {ownerDisplayName}
            </button>
          </div>
        )}

        {canUnsubscribeFromChannel && (
          <Button
            type="button"
            variant="outline"
            className="w-full text-destructive hover:text-destructive"
            disabled={unsubscribeMutation.isPending}
            onClick={() => unsubscribeMutation.mutate()}
          >
            {unsubscribeMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            {t.unsubscribeFromChannel}
          </Button>
        )}
      </div>
    </div>
  );
}
