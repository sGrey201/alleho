import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { ArrowLeft, Copy, Loader2, Share2, Trash2, UserPlus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useUpload } from "@/hooks/use-upload";
import ChannelSponsorSection from "@/components/ChannelSponsorSection";
import ChannelSponsorsList from "@/components/ChannelSponsorsList";
import ChannelSubscribersList from "@/components/ChannelSubscribersList";
import { ImageViewerDialog } from "@/components/ImageViewerDialog";
import { normalizeImageFile } from "@/lib/normalizeImageFile";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { t } from "@/lib/i18n";
import { messengerProfilePath, messengerConversationUrl, shareMessengerConversation } from "@/lib/messengerPaths";
import { cn, profileAvatarSrc } from "@/lib/utils";

function generateDeleteConfirmationCode(): number {
  return Math.floor(100 + Math.random() * 900);
}

type Participant = {
  userId: string;
  role: string;
  sponsorExpiresAt?: string | null;
  sponsorListingExpiresAt?: string | null;
  user?: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    isAdmin?: boolean;
  };
};

type ConversationInfo = {
  id: string;
  type: "group" | "channel" | "direct" | "consilium";
  name?: string | null;
  avatarUrl?: string | null;
  participantCount?: number;
  patientAvailable?: boolean;
  isClosed?: boolean;
  sponsorSettings?: { enabled: boolean } | null;
  isSponsor?: boolean;
  hasContentAccess?: boolean;
  sponsorExpiresAt?: string | null;
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
  const [patientAvailable, setPatientAvailable] = useState(false);
  const [isClosed, setIsClosed] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmationCode, setDeleteConfirmationCode] = useState<number | null>(null);
  const [deleteCodeInput, setDeleteCodeInput] = useState("");
  const [contentRenewalOpen, setContentRenewalOpen] = useState(false);
  const contentRenewalRef = useRef<HTMLDivElement | null>(null);
  const [groupInviteLinkDialog, setGroupInviteLinkDialog] = useState<{
    open: boolean;
    inviteUrl: string;
  }>({ open: false, inviteUrl: "" });

  const { uploadFile, isUploading } = useUpload();

  const { data: conv, isLoading } = useQuery<ConversationInfo>({
    queryKey: ["/api/conversations", conversationId],
    enabled: !!conversationId,
  });

  useEffect(() => {
    if (!conv) return;
    setNameDraft(conv.name ?? "");
    setAvatarDraft(conv.avatarUrl ?? "");
    setPatientAvailable(!!conv.patientAvailable);
    setIsClosed(conv.isClosed ?? true);
  }, [conv?.id, conv?.name, conv?.avatarUrl, conv?.patientAvailable, conv?.isClosed]);

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

  const issueGroupInviteLinkMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/conversations/${conversationId}/group-invite-link`);
      return res.json() as Promise<{ inviteUrl: string; expiresAt: string }>;
    },
    onSuccess: (data) => {
      setGroupInviteLinkDialog({ open: true, inviteUrl: data.inviteUrl });
    },
    onError: () => toast({ title: t.inviteError, variant: "destructive" }),
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

  const saveVisibilityMutation = useMutation({
    mutationFn: async (flags: { patientAvailable?: boolean; isClosed?: boolean }) => {
      const res = await apiRequest("PATCH", `/api/conversations/${conversationId}`, flags);
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/conversations", conversationId] });
      await queryClient.invalidateQueries({ queryKey: ["/api/me/chats"] });
      toast({ title: t.saved });
    },
    onError: () => toast({ title: t.error, variant: "destructive" }),
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

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/conversations/${conversationId}`, {});
    },
    onSuccess: async () => {
      setDeleteDialogOpen(false);
      setDeleteConfirmationCode(null);
      setDeleteCodeInput("");
      await queryClient.invalidateQueries({ queryKey: ["/api/me/chats"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/messenger/search"] });
      await queryClient.removeQueries({ queryKey: ["/api/conversations", conversationId] });
      toast({ title: t.conversationDeleted });
      setLocation("/messenger");
    },
    onError: (err: Error) => {
      toast({ title: t.error, description: err.message, variant: "destructive" });
    },
  });

  const canUnsubscribeFromChannel = mode === "channel" && !!myRole && !isOwner;
  const isPublicProfile = !isClosed;

  const openDeleteDialog = () => {
    setDeleteConfirmationCode(generateDeleteConfirmationCode());
    setDeleteCodeInput("");
    setDeleteDialogOpen(true);
  };

  const handleDeleteDialogOpenChange = (open: boolean) => {
    setDeleteDialogOpen(open);
    if (!open) {
      setDeleteConfirmationCode(null);
      setDeleteCodeInput("");
    }
  };

  const deleteCodeMatches =
    deleteConfirmationCode !== null && deleteCodeInput.trim() === String(deleteConfirmationCode);

  const handleAvatarChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const normalizedFile = await normalizeImageFile(file);
    const uploadResponse = await uploadFile(normalizedFile);
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
  const avatarFullSrc = avatarDraft ? profileAvatarSrc(avatarDraft) : undefined;
  const avatarThumbSrc = avatarDraft ? profileAvatarSrc(avatarDraft, "avatar") : undefined;
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
  const contentExpiresAtIso =
    mode === "channel" && sponsorMonetizationEnabled && !isOwner ? conv.sponsorExpiresAt : null;
  const contentPaidUntilFormatted = contentExpiresAtIso
    ? format(new Date(contentExpiresAtIso), "d MMMM yyyy", { locale: ru })
    : null;
  const isContentSubscriptionActive = contentExpiresAtIso
    ? new Date(contentExpiresAtIso).getTime() > Date.now()
    : false;
  const showContentPaidBlock = !!contentPaidUntilFormatted;
  const profileReturnTo = `/messenger/${mode}/${conversationId}/settings`;
  const groupConversationPath = `/messenger/group/${conversationId}`;
  const groupConversationUrl = messengerConversationUrl("group", conversationId);

  const handleRenewContent = () => {
    setContentRenewalOpen(true);
    window.setTimeout(() => {
      contentRenewalRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  };

  const openAvatarUpload = () => avatarInputRef.current?.click();

  const handleAvatarClick = () => {
    if (isOwner) {
      openAvatarUpload();
      return;
    }
    if (avatarFullSrc) {
      setAvatarViewerOpen(true);
    }
  };

  const handleShareConversation = async () => {
    const title = displayName || (mode === "group" ? t.chatGroup : t.channelSub);
    const result = await shareMessengerConversation({
      mode,
      conversationId,
      title,
    });
    if (result === "copied") {
      toast({ title: t.conversationLinkCopied });
    }
  };

  const renderShareButton = (className?: string) =>
    isPublicProfile ? (
      <Button
        type="button"
        variant="outline"
        className={cn("w-full", className)}
        onClick={() => void handleShareConversation()}
      >
        <Share2 className="mr-2 h-4 w-4" />
        {t.shareConversation}
      </Button>
    ) : null;

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
                  isOwner || avatarFullSrc ? "cursor-pointer" : "cursor-default"
                }`}
                onClick={handleAvatarClick}
                aria-label={isOwner ? t.edit : avatarFullSrc ? "Просмотр аватара" : undefined}
              >
                <Avatar className="h-10 w-10">
                  <AvatarImage src={avatarThumbSrc} />
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
        imageUrl={avatarFullSrc ?? null}
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
                  isOwner || avatarFullSrc ? "cursor-pointer" : "cursor-default"
                }`}
                onClick={handleAvatarClick}
                aria-label={isOwner ? t.edit : avatarFullSrc ? "Просмотр аватара" : undefined}
              >
                <Avatar className="h-16 w-16">
                  <AvatarImage src={avatarThumbSrc} />
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

        {mode === "group" && isPublicProfile && (
          <div className="rounded-lg border px-4 py-3">
            <p className="text-xs text-muted-foreground mb-1">{t.groupPublicLinkLabel}</p>
            <a
              href={groupConversationPath}
              className="text-sm font-medium text-primary hover:underline break-all"
              onClick={(e) => {
                e.preventDefault();
                setLocation(groupConversationPath);
              }}
            >
              {groupConversationUrl}
            </a>
          </div>
        )}

        {mode === "group" && !isPublicProfile && isOwner && (
          <div className="rounded-lg border px-4 py-3">
            <p className="text-sm text-muted-foreground mb-3">{t.groupInviteLinkHint}</p>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={issueGroupInviteLinkMutation.isPending}
              onClick={() => issueGroupInviteLinkMutation.mutate()}
            >
              {issueGroupInviteLinkMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {t.groupInviteGenerateLink}
            </Button>
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

        {mode === "group" && isOwner && (
          <div className="space-y-3 rounded-lg border px-4 py-3">
            <p className="text-sm font-medium">{t.groupVisibilityTitle}</p>
            <RadioGroup
              value={isClosed ? "closed" : "public"}
              onValueChange={(value) => {
                const nextIsClosed = value === "closed";
                setIsClosed(nextIsClosed);
                saveVisibilityMutation.mutate({ isClosed: nextIsClosed });
              }}
              disabled={saveVisibilityMutation.isPending}
              className="space-y-2"
            >
              <div className="flex items-start gap-2">
                <RadioGroupItem value="public" id="group-visibility-public" className="mt-0.5" />
                <div>
                  <Label htmlFor="group-visibility-public" className="cursor-pointer font-normal">
                    {t.groupVisibilityPublic}
                  </Label>
                  <p className="text-xs text-muted-foreground">{t.groupVisibilityPublicHint}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <RadioGroupItem value="closed" id="group-visibility-closed" className="mt-0.5" />
                <div>
                  <Label htmlFor="group-visibility-closed" className="cursor-pointer font-normal">
                    {t.groupVisibilityClosed}
                  </Label>
                  <p className="text-xs text-muted-foreground">{t.groupVisibilityClosedHint}</p>
                </div>
              </div>
            </RadioGroup>
          </div>
        )}

        {mode === "channel" && isOwner && (
          <div className="space-y-3 rounded-lg border px-4 py-3">
            <p className="text-sm font-medium">{t.channelVisibilityTitle}</p>
            <div className="flex items-center gap-2">
              <Checkbox
                id="channel-homeopath-only"
                checked={!patientAvailable}
                onCheckedChange={(checked) => {
                  const nextPatientAvailable = checked !== true;
                  setPatientAvailable(nextPatientAvailable);
                  saveVisibilityMutation.mutate({ patientAvailable: nextPatientAvailable });
                }}
                disabled={saveVisibilityMutation.isPending}
              />
              <Label htmlFor="channel-homeopath-only" className="text-sm font-normal cursor-pointer">
                {t.channelHomeopathOnly}
              </Label>
            </div>
          </div>
        )}

        {mode === "channel" && (
          <>
            {sponsorMonetizationEnabled && (
              <ChannelSponsorsList
                conversationId={conversationId}
                monetizationEnabled={sponsorMonetizationEnabled}
                isOwner={isOwner}
                scrollPaymentOnMount={scrollSponsorSection}
                profileReturnTo={profileReturnTo}
              />
            )}
            {isOwner && (
              <ChannelSponsorSection
                conversationId={conversationId}
                isOwner
                scrollOnMount={scrollSponsorSection}
                profileReturnTo={profileReturnTo}
              />
            )}
            {isOwner && (
              <ChannelSubscribersList
                participants={conv.participants ?? []}
                profileReturnTo={profileReturnTo}
              />
            )}
          </>
        )}

        {showContentPaidBlock && (
          <div
            className={cn(
              "rounded-xl border-2 px-4 py-3",
              isContentSubscriptionActive
                ? "border-green-600 bg-green-500/10 dark:border-green-500"
                : "border-destructive bg-destructive/10"
            )}
          >
            <p className="text-xs text-muted-foreground mb-1">{t.contentPaidUntilLabel}</p>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="text-sm font-medium">{contentPaidUntilFormatted}</p>
              <button
                type="button"
                className="text-sm font-medium text-primary hover:underline"
                onClick={handleRenewContent}
              >
                {t.extendContent}
              </button>
            </div>
          </div>
        )}

        {contentRenewalOpen && !isOwner && sponsorMonetizationEnabled && (
          <div ref={contentRenewalRef}>
            <ChannelSponsorSection
              conversationId={conversationId}
              isOwner={false}
              embedded
              tierTypes={["content"]}
              initialSelectedTier="content"
              profileReturnTo={profileReturnTo}
            />
          </div>
        )}

        {mode === "channel" && channelOwner && ownerDisplayName && (
          <div className="rounded-lg border px-4 py-3">
            <p className="text-xs text-muted-foreground mb-1">{t.channelOwnerLabel}</p>
            <button
              type="button"
              className="text-sm font-medium text-primary hover:underline truncate max-w-full"
              onClick={() =>
                setLocation(
                  messengerProfilePath(
                    channelOwner.userId,
                    `/messenger/${mode}/${conversationId}/settings`
                  )
                )
              }
            >
              {ownerDisplayName}
            </button>
          </div>
        )}

        {mode === "channel" && (isPublicProfile || canUnsubscribeFromChannel) && (
          <div className="flex gap-2">
            {isPublicProfile && renderShareButton("w-auto flex-1 min-w-0")}
            {canUnsubscribeFromChannel && (
              <Button
                type="button"
                variant="outline"
                className="flex-1 min-w-0 text-destructive hover:text-destructive"
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
        )}

        {isOwner && (
          <Button
            type="button"
            variant="outline"
            className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
            disabled={deleteMutation.isPending}
            onClick={openDeleteDialog}
          >
            {deleteMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="mr-2 h-4 w-4" />
            )}
            {mode === "group" ? t.deleteGroup : t.deleteChannel}
          </Button>
        )}
      </div>

      <Dialog
        open={groupInviteLinkDialog.open}
        onOpenChange={(open) => setGroupInviteLinkDialog((prev) => ({ ...prev, open }))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.inviteLinkForGroup}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border bg-muted/40 p-3">
              <p className="break-all text-sm">{groupInviteLinkDialog.inviteUrl}</p>
            </div>
            <p className="text-sm text-muted-foreground">{t.inviteLinkValid24h}</p>
            <DialogFooter className="flex flex-row justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  if (!groupInviteLinkDialog.inviteUrl) return;
                  await navigator.clipboard.writeText(groupInviteLinkDialog.inviteUrl);
                  toast({ title: t.patientInviteLinkCopied });
                }}
              >
                <Copy className="mr-2 h-4 w-4" />
                {t.patientInviteCopyLink}
              </Button>
              <Button
                type="button"
                onClick={async () => {
                  if (!groupInviteLinkDialog.inviteUrl) return;
                  if (navigator.share) {
                    try {
                      await navigator.share({
                        title: displayName,
                        text: t.inviteLinkForGroup,
                        url: groupInviteLinkDialog.inviteUrl,
                      });
                      return;
                    } catch {
                      // cancelled
                    }
                  }
                  await navigator.clipboard.writeText(groupInviteLinkDialog.inviteUrl);
                  toast({ title: t.patientInviteLinkCopied });
                }}
              >
                <Share2 className="mr-2 h-4 w-4" />
                {t.patientInviteShareLink}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={handleDeleteDialogOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {mode === "group" ? t.deleteGroupConfirmTitle : t.deleteChannelConfirmTitle}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {mode === "group"
                ? t.deleteGroupConfirmDescription(displayName)
                : t.deleteChannelConfirmDescription(displayName)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteConfirmationCode !== null && (
            <div className="space-y-2">
              <Label htmlFor="delete-conversation-code">
                {t.deleteConfirmationCodePrompt(deleteConfirmationCode)}
              </Label>
              <Input
                id="delete-conversation-code"
                inputMode="numeric"
                autoComplete="off"
                value={deleteCodeInput}
                onChange={(e) => setDeleteCodeInput(e.target.value.replace(/\D/g, "").slice(0, 3))}
                placeholder="000"
              />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={!deleteCodeMatches || deleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (!deleteCodeMatches) return;
                deleteMutation.mutate();
              }}
            >
              {deleteMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {mode === "group" ? t.deleteGroup : t.deleteChannel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
