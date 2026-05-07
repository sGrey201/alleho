import { useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useConversationWs, type ConversationMessageWithAuthor } from "@/hooks/useConversationWs";
import { t } from "@/lib/i18n";
import { Loader2, ArrowLeft, Users } from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import { ru } from "date-fns/locale";
import { useState } from "react";
import { useUpload } from "@/hooks/use-upload";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import ChatInputBar from "@/components/ChatInputBar";
import { scrollChatPaneToBottom } from "@/lib/chatScroll";

interface ConversationInfo {
  id: string;
  type: string;
  name?: string | null;
  avatarUrl?: string | null;
  patientUserId?: string | null;
  participants?: Array<{
    userId: string;
    role: string;
    lastSeenAt?: string | null;
    user?: {
      firstName?: string | null;
      lastName?: string | null;
      email?: string | null;
      profileImageUrl?: string | null;
    };
  }>;
}

type SearchDoctor = {
  userId: string;
  firstName?: string;
  lastName?: string;
  email?: string;
};

type SearchResponse = { doctors: SearchDoctor[]; groups: unknown[]; channels: unknown[] };

interface ConversationChatProps {
  conversationId: string;
  onBack: () => void;
  onTitleClick?: () => void;
}

export default function ConversationChat({ conversationId, onBack, onTitleClick }: ConversationChatProps) {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [message, setMessage] = useState("");
  const [addMembersOpen, setAddMembersOpen] = useState(false);
  const [doctorSearch, setDoctorSearch] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const messagesContentRef = useRef<HTMLDivElement>(null);

  const { data: conv, isLoading: convLoading } = useQuery<ConversationInfo>({
    queryKey: ["/api/conversations", conversationId],
    enabled: !!conversationId,
  });

  const { data: messages, isLoading: messagesLoading } = useQuery<ConversationMessageWithAuthor[]>({
    queryKey: ["/api/conversations", conversationId, "messages"],
    enabled: !!conversationId,
  });

  useConversationWs(conversationId, !!conversationId);

  const { data: doctorSearchData, isLoading: doctorSearchLoading } = useQuery<SearchResponse>({
    queryKey: ["/api/messenger/search", doctorSearch],
    queryFn: async () => {
      const url = `/api/messenger/search?q=${encodeURIComponent(doctorSearch.trim())}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: addMembersOpen,
  });

  const sendMutation = useMutation({
    mutationFn: async (data: { content?: string; imageUrl?: string; messageType?: string }) => {
      const res = await apiRequest("POST", `/api/conversations/${conversationId}/messages`, data);
      return res.json();
    },
    onSuccess: (newMessage: ConversationMessageWithAuthor) => {
      queryClient.setQueryData<ConversationMessageWithAuthor[]>(
        ["/api/conversations", conversationId, "messages"],
        (old) => {
          if (!old) return [newMessage];
          if (old.some((m) => m.id === newMessage.id)) return old;
          return [...old, newMessage];
        }
      );
      setMessage("");
    },
  });

  const { uploadFile, isUploading: isUploadingPhoto } = useUpload({
    onSuccess: async (response) => {
      await sendMutation.mutateAsync({
        content: "",
        imageUrl: response.objectPath,
        messageType: "message",
      });
    },
    onError: (error) => {
      toast({
        title: t.error,
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const addMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("PATCH", `/api/conversations/${conversationId}`, {
        addParticipantIds: [userId],
      });
      return res.json() as Promise<ConversationInfo>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/me/chats"] });
      toast({ title: t.userAddedToGroup });
    },
    onError: (error: Error) => {
      const msg = error?.message || "";
      if (msg.includes("only_owner_can_add_members")) {
        toast({ title: t.onlyOwnerCanAddMembers, variant: "destructive" });
      } else {
        toast({ title: t.inviteError, description: msg, variant: "destructive" });
      }
    },
  });

  useEffect(() => {
    const root = messagesScrollRef.current;
    if (!root) return;
    const scroll = () => scrollChatPaneToBottom(root);
    scroll();
    const raf = requestAnimationFrame(() => {
      scroll();
      requestAnimationFrame(scroll);
    });
    const t1 = window.setTimeout(scroll, 80);
    const t2 = window.setTimeout(scroll, 350);
    const contentEl = messagesContentRef.current;
    const ro =
      contentEl &&
      new ResizeObserver(() => {
        scrollChatPaneToBottom(root);
      });
    if (contentEl && ro) ro.observe(contentEl);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t1);
      clearTimeout(t2);
      ro?.disconnect();
    };
  }, [messages, conversationId]);

  const handleSend = () => {
    if (!message.trim()) return;
    sendMutation.mutate({ content: message.trim(), messageType: "message" });
  };

  const handleUploadImages = async (files: File[]) => {
    for (const file of files) {
      await uploadFile(file);
    }
  };

  /** Compact time in message bubble (no year) */
  const formatBubbleTime = (dateStr: string) => {
    const d = new Date(dateStr);
    if (isToday(d)) return format(d, "HH:mm", { locale: ru });
    if (isYesterday(d)) return `вч. ${format(d, "HH:mm", { locale: ru })}`;
    return format(d, "dd.MM. HH:mm", { locale: ru });
  };

  const formatLastSeen = (dateStr?: string | null) => {
    if (!dateStr) return t.neverVisited;
    const date = new Date(dateStr);
    const time = format(date, "HH:mm");
    if (isToday(date)) return `${t.wasOnlineToday} ${time}`;
    if (isYesterday(date)) return `${t.wasOnlineYesterday} ${time}`;
    return `${t.wasOnlineAt} ${format(date, "dd.MM.yyyy", { locale: ru })} в ${time}`;
  };

  const authorName = (msg: ConversationMessageWithAuthor) =>
    msg.author.firstName && msg.author.lastName
      ? `${msg.author.firstName} ${msg.author.lastName}`
      : msg.author.firstName || msg.author.email?.split("@")[0] || "User";

  if (convLoading || !conv) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const title = conv.name ?? (conv.type === "direct" ? t.chatWithDoctor : conv.type);
  const peerParticipant = conv.type === "direct"
    ? conv.participants?.find((p) => p.userId !== user?.id)
    : undefined;
  const directDisplayName = conv.type === "direct"
    ? [peerParticipant?.user?.firstName, peerParticipant?.user?.lastName].filter(Boolean).join(" ").trim() ||
      peerParticipant?.user?.email?.split("@")[0] ||
      t.chatWithDoctor
    : title;
  const headerAvatarUrl = conv.type === "direct"
    ? (peerParticipant?.user?.profileImageUrl ?? null)
    : (conv.avatarUrl ?? null);
  const directProfileUserId = conv.type === "direct" ? peerParticipant?.userId : undefined;
  const handleHeaderProfileClick = () => {
    if (directProfileUserId) {
      setLocation(`/profile/${directProfileUserId}`);
      return;
    }
    onTitleClick?.();
  };
  const canClickHeader = !!directProfileUserId || !!onTitleClick;
  const headerInitials = directDisplayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";

  const isGroup = conv.type === "group";
  const showMessageAuthorName = conv.type !== "direct";
  const myRole = conv.participants?.find((p) => p.userId === user?.id)?.role;
  const participantIds = new Set((conv.participants ?? []).map((p) => p.userId));
  const candidates = (doctorSearchData?.doctors ?? []).filter((d) => !participantIds.has(d.userId));

  return (
    <div className="relative flex flex-col h-full">
      <div className="absolute inset-x-0 top-0 z-30 px-3 py-3 pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto">
          <Button
            variant="secondary"
            size="icon"
            onClick={onBack}
            className="h-10 w-10 rounded-full border border-border/40 bg-background/55 text-black backdrop-blur-md"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <button
            type="button"
            onClick={handleHeaderProfileClick}
            disabled={!canClickHeader}
            className={`flex-1 rounded-full border border-border/40 bg-background/55 px-4 py-2 text-left backdrop-blur-md ${canClickHeader ? "cursor-pointer hover:opacity-90 transition-opacity" : ""}`}
          >
            <p className="text-sm font-semibold truncate">{directDisplayName}</p>
            {conv.type === "direct" && (
              <p className="text-xs text-muted-foreground truncate">{formatLastSeen(peerParticipant?.lastSeenAt)}</p>
            )}
          </button>
          <button
            type="button"
            onClick={handleHeaderProfileClick}
            disabled={!canClickHeader}
            className={`h-10 w-10 rounded-full border border-border/40 bg-background/55 p-0 backdrop-blur-md ${canClickHeader ? "cursor-pointer hover:opacity-90 transition-opacity" : ""}`}
          >
            <Avatar className="h-full w-full">
              <AvatarImage src={headerAvatarUrl || undefined} />
              <AvatarFallback className="text-xs font-semibold">{headerInitials}</AvatarFallback>
            </Avatar>
          </button>
        </div>
      </div>

      <div ref={messagesScrollRef} className="flex-1 overflow-y-auto px-4 pt-20 pb-32">
        <div ref={messagesContentRef} className="space-y-3">
          {messagesLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : messages && messages.length > 0 ? (
            [...messages]
              .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
              .map((msg) => {
                const isOwn = msg.authorUserId === user?.id;
                return (
              <div
                key={msg.id}
                className={`flex w-full ${isOwn ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`relative min-h-[2.75rem] min-w-28 max-w-[85%] rounded-2xl border pl-2 pr-1.5 pt-1 pb-3.5 ${
                    isOwn
                      ? "bg-emerald-100 dark:bg-emerald-900 border-emerald-200 dark:border-emerald-800 text-foreground"
                      : "border-transparent bg-muted"
                  }`}
                >
                  {!isOwn && showMessageAuthorName && (
                    <p className="text-[10px] leading-tight text-muted-foreground mb-0.5 pr-8">
                      {authorName(msg)}
                    </p>
                  )}
                  {msg.imageUrl && (
                    <a href={msg.imageUrl} target="_blank" rel="noopener noreferrer" className="block mb-0.5">
                      <img src={msg.imageUrl} alt="" className="max-w-full rounded max-h-48 object-contain" />
                    </a>
                  )}
                  {msg.content && (
                    <p className="whitespace-pre-wrap break-words text-sm leading-snug pr-7 pb-0.5">
                      {msg.content}
                    </p>
                  )}
                  <span className="pointer-events-none absolute bottom-0.5 right-1.5 text-[10px] leading-none text-muted-foreground tabular-nums select-none">
                    {formatBubbleTime(msg.createdAt)}
                  </span>
                </div>
              </div>
            );
            })
          ) : (
            <p className="text-center text-muted-foreground py-8">{t.noMessages}</p>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <ChatInputBar
        value={message}
        placeholder={t.writeMessage}
        onChange={setMessage}
        onSend={handleSend}
        isSending={sendMutation.isPending}
        onUploadImages={handleUploadImages}
        isUploadingImages={isUploadingPhoto}
        wrapperClassName="absolute inset-x-0 bottom-0 z-20 bg-transparent px-4 py-4"
      />

      <Dialog open={addMembersOpen} onOpenChange={setAddMembersOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.addToGroup}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={doctorSearch}
              onChange={(e) => setDoctorSearch(e.target.value)}
              placeholder={t.searchDoctorsToAdd}
              autoFocus
            />
            <div className="max-h-72 overflow-y-auto space-y-1">
              {doctorSearchLoading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
              ) : candidates.length === 0 ? (
                <p className="text-sm text-muted-foreground py-3 text-center">{t.noResults}</p>
              ) : (
                candidates.map((doctor) => {
                  const name =
                    [doctor.firstName, doctor.lastName].filter(Boolean).join(" ").trim() ||
                    doctor.email ||
                    t.chatWithDoctor;
                  return (
                    <button
                      key={doctor.userId}
                      type="button"
                      onClick={() => addMemberMutation.mutate(doctor.userId)}
                      disabled={addMemberMutation.isPending}
                      className="w-full text-left flex items-center gap-3 rounded-md border px-3 py-2 hover:bg-muted/40 disabled:opacity-60"
                    >
                      <Users className="h-4 w-4 text-primary shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{name}</p>
                        {doctor.email && <p className="text-xs text-muted-foreground truncate">{doctor.email}</p>}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
