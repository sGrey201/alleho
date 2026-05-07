import { useRef, useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useConversationWs, type ConversationMessageWithAuthor } from "@/hooks/useConversationWs";
import { t } from "@/lib/i18n";
import {
  Loader2,
  ArrowLeft,
  Users,
  MoreVertical,
  Reply,
  Pencil,
  Trash2,
  Forward as ForwardIcon,
  Pin,
  PinOff,
  X,
  Check,
  Copy,
} from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import { ru } from "date-fns/locale";
import { useUpload } from "@/hooks/use-upload";
import {
  Dialog,
  DialogContent,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

type MyChatItem = {
  source: "conversation" | "health_wall";
  folder: "personal" | "groups" | "channels";
  type?: string;
  conversationId?: string;
  otherParticipantName?: string;
  name?: string;
  avatarUrl?: string | null;
};

type MyChatsPage = {
  items: MyChatItem[];
  hasMore: boolean;
  nextOffset: number | null;
  total: number;
};

const EDIT_WINDOW_MS = 48 * 60 * 60 * 1000;

interface ConversationChatProps {
  conversationId: string;
  onBack: () => void;
  onTitleClick?: () => void;
}

function getMessageDisplayName(author: ConversationMessageWithAuthor["author"] | null | undefined): string {
  if (!author) return "User";
  if (author.firstName && author.lastName) return `${author.firstName} ${author.lastName}`;
  if (author.firstName) return author.firstName;
  if (author.email) return author.email.split("@")[0];
  return "User";
}

function getReplySnippet(reply: NonNullable<ConversationMessageWithAuthor["replyTo"]>): string {
  if (reply.deletedAt) return t.messageDeleted;
  if (reply.content && reply.content.trim().length > 0) {
    const text = reply.content.trim();
    return text.length > 80 ? `${text.slice(0, 80)}…` : text;
  }
  if (reply.imageUrl) return t.messagePhotoLabel;
  return t.messageDeleted;
}

export default function ConversationChat({ conversationId, onBack, onTitleClick }: ConversationChatProps) {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [message, setMessage] = useState("");
  const [addMembersOpen, setAddMembersOpen] = useState(false);
  const [doctorSearch, setDoctorSearch] = useState("");
  const [forwardSearch, setForwardSearch] = useState("");
  const [replyTo, setReplyTo] = useState<ConversationMessageWithAuthor | null>(null);
  const [editing, setEditing] = useState<ConversationMessageWithAuthor | null>(null);
  const [editText, setEditText] = useState("");
  const [forwarding, setForwarding] = useState<ConversationMessageWithAuthor | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ConversationMessageWithAuthor | null>(null);
  const [activePinnedIndex, setActivePinnedIndex] = useState(-1);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const messagesContentRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const setMessageRef = (id: string) => (el: HTMLDivElement | null) => {
    if (el) {
      messageRefs.current.set(id, el);
    } else {
      messageRefs.current.delete(id);
    }
  };

  const scrollToMessage = (id: string) => {
    const el = messageRefs.current.get(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("ring-2", "ring-primary/60");
    window.setTimeout(() => {
      el.classList.remove("ring-2", "ring-primary/60");
    }, 1500);
  };

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

  const { data: forwardChats, isLoading: forwardChatsLoading } = useQuery<MyChatItem[]>({
    queryKey: ["/api/me/chats", "forward-targets"],
    enabled: !!forwarding,
    queryFn: async () => {
      const folders: Array<"personal" | "groups" | "channels"> = ["personal", "groups", "channels"];
      const results = await Promise.all(
        folders.map(async (folder) => {
          const res = await fetch(`/api/me/chats?folder=${folder}&limit=50&offset=0`, {
            credentials: "include",
          });
          if (!res.ok) return [] as MyChatItem[];
          const json = (await res.json()) as MyChatsPage;
          return json.items;
        })
      );
      const merged = results.flat();
      return merged.filter(
        (item): item is MyChatItem & { conversationId: string } =>
          item.source === "conversation" && typeof item.conversationId === "string" && item.conversationId.length > 0
      );
    },
  });

  const sendMutation = useMutation({
    mutationFn: async (data: {
      content?: string;
      imageUrl?: string;
      messageType?: string;
      replyToMessageId?: string;
    }) => {
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
      setReplyTo(null);
    },
  });

  const editMutation = useMutation({
    mutationFn: async ({ messageId, content }: { messageId: string; content: string }) => {
      const res = await apiRequest(
        "PATCH",
        `/api/conversations/${conversationId}/messages/${messageId}`,
        { content }
      );
      return res.json();
    },
    onSuccess: (_resp, variables) => {
      queryClient.setQueryData<ConversationMessageWithAuthor[]>(
        ["/api/conversations", conversationId, "messages"],
        (old) =>
          old?.map((m) =>
            m.id === variables.messageId
              ? { ...m, content: variables.content, editedAt: new Date().toISOString() }
              : m
          )
      );
      setEditing(null);
      setEditText("");
    },
    onError: (err: Error) => {
      toast({ title: t.error, description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (messageId: string) => {
      await apiRequest("DELETE", `/api/conversations/${conversationId}/messages/${messageId}`);
    },
    onSuccess: (_resp, messageId) => {
      queryClient.setQueryData<ConversationMessageWithAuthor[]>(
        ["/api/conversations", conversationId, "messages"],
        (old) =>
          old?.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  deletedAt: new Date().toISOString(),
                  content: null,
                  imageUrl: null,
                  pinnedAt: null,
                  pinnedByUserId: null,
                }
              : m
          )
      );
      setPendingDelete(null);
    },
    onError: (err: Error) => {
      toast({ title: t.error, description: err.message, variant: "destructive" });
    },
  });

  const pinMutation = useMutation({
    mutationFn: async ({ messageId, pin }: { messageId: string; pin: boolean }) => {
      await apiRequest(
        "POST",
        `/api/conversations/${conversationId}/messages/${messageId}/${pin ? "pin" : "unpin"}`,
        {}
      );
    },
    onSuccess: (_resp, { messageId, pin }) => {
      queryClient.setQueryData<ConversationMessageWithAuthor[]>(
        ["/api/conversations", conversationId, "messages"],
        (old) =>
          old?.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  pinnedAt: pin ? new Date().toISOString() : null,
                  pinnedByUserId: pin ? user?.id ?? null : null,
                }
              : m
          )
      );
    },
    onError: (err: Error) => {
      toast({ title: t.error, description: err.message, variant: "destructive" });
    },
  });

  const forwardMutation = useMutation({
    mutationFn: async ({
      sourceMessageId,
      targetConversationId,
      targetTitle,
      targetType,
    }: {
      sourceMessageId: string;
      targetConversationId: string;
      targetTitle: string;
      targetType: "direct" | "group" | "channel";
    }) => {
      const res = await apiRequest(
        "POST",
        `/api/conversations/${targetConversationId}/messages`,
        {
          forwardSource: { conversationId, messageId: sourceMessageId },
        }
      );
      return {
        newMessage: (await res.json()) as ConversationMessageWithAuthor,
        targetConversationId,
        targetTitle,
        targetType,
      };
    },
    onSuccess: ({ newMessage, targetConversationId, targetTitle, targetType }) => {
      queryClient.setQueryData<ConversationMessageWithAuthor[]>(
        ["/api/conversations", targetConversationId, "messages"],
        (old) => {
          if (!old) return old;
          if (old.some((m) => m.id === newMessage.id)) return old;
          return [...old, newMessage];
        }
      );
      queryClient.invalidateQueries({ queryKey: ["/api/me/chats"] });
      setForwarding(null);
      setForwardSearch("");
      const targetPath =
        targetType === "group"
          ? `/messenger/group/${targetConversationId}`
          : targetType === "channel"
            ? `/messenger/channel/${targetConversationId}`
            : `/messenger/direct/${targetConversationId}`;
      const forwardToast = toast({
        title: (
          <span>
            Переслано{" "}
            <button
              type="button"
              className="underline underline-offset-2"
              onClick={() => setLocation(targetPath)}
            >
              {targetTitle}
            </button>
          </span>
        ),
      });
      window.setTimeout(() => forwardToast.dismiss(), 3000);
    },
    onError: (err: Error) => {
      toast({ title: t.error, description: err.message, variant: "destructive" });
    },
  });

  const filteredForwardChats = useMemo(() => {
    if (!forwardChats) return [];
    const q = forwardSearch.trim().toLowerCase();
    if (!q) return forwardChats;
    return forwardChats.filter((chat) => {
      const chatTitle =
        chat.name ||
        chat.otherParticipantName ||
        (chat.type === "channel" ? t.searchChannels : t.chatWithDoctor);
      return chatTitle.toLowerCase().includes(q);
    });
  }, [forwardChats, forwardSearch]);

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
    if (editing) {
      const text = editText.trim();
      if (!text) return;
      editMutation.mutate({ messageId: editing.id, content: text });
      return;
    }
    if (!message.trim()) return;
    sendMutation.mutate({
      content: message.trim(),
      messageType: "message",
      replyToMessageId: replyTo?.id,
    });
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

  const sortedMessages = useMemo(() => {
    if (!messages) return [];
    return [...messages].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }, [messages]);

  const pinnedMessages = useMemo(
    () =>
      sortedMessages.filter(
        (m) => m.pinnedAt && !m.deletedAt
      ),
    [sortedMessages]
  );
  const activePinnedMessage =
    activePinnedIndex >= 0 && activePinnedIndex < pinnedMessages.length
      ? pinnedMessages[activePinnedIndex]
      : null;

  useEffect(() => {
    if (pinnedMessages.length === 0) {
      setActivePinnedIndex(-1);
      return;
    }
    setActivePinnedIndex((prev) => {
      if (prev < 0) return pinnedMessages.length - 1;
      return Math.min(prev, pinnedMessages.length - 1);
    });
  }, [pinnedMessages]);

  const handlePinnedBannerClick = () => {
    if (pinnedMessages.length === 0) return;
    setActivePinnedIndex((prev) => {
      const baseIndex = prev >= 0 ? prev : pinnedMessages.length - 1;
      const nextIndex = (baseIndex + 1) % pinnedMessages.length;
      const nextMessage = pinnedMessages[nextIndex];
      if (nextMessage) scrollToMessage(nextMessage.id);
      return nextIndex;
    });
  };

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

  const showMessageAuthorName = conv.type !== "direct";
  const myRole = conv.participants?.find((p) => p.userId === user?.id)?.role;
  const isOwner = myRole === "owner";
  const participantIds = new Set((conv.participants ?? []).map((p) => p.userId));
  const candidates = (doctorSearchData?.doctors ?? []).filter((d) => !participantIds.has(d.userId));

  const startReply = (msg: ConversationMessageWithAuthor) => {
    setEditing(null);
    setReplyTo(msg);
  };

  const startEdit = (msg: ConversationMessageWithAuthor) => {
    setReplyTo(null);
    setEditing(msg);
    setEditText(msg.content ?? "");
  };

  const cancelComposerContext = () => {
    setReplyTo(null);
    setEditing(null);
    setEditText("");
  };

  const copyMessageContent = async (msg: ConversationMessageWithAuthor) => {
    if (!msg.content) return;
    try {
      await navigator.clipboard.writeText(msg.content);
      toast({ title: "Скопировано" });
    } catch {
      // ignore
    }
  };

  const renderMessageActions = (msg: ConversationMessageWithAuthor) => {
    if (msg.deletedAt) return null;
    const isOwn = msg.authorUserId === user?.id;
    const hasTopTag = !!msg.replyTo || !!msg.forwardedFromMessageId || !!msg.forwardedFromUserId;
    const createdAt = new Date(msg.createdAt).getTime();
    const canEdit = isOwn && !!msg.content && Date.now() - createdAt < EDIT_WINDOW_MS;
    const canDelete = isOwn || isOwner;
    const isPinned = !!msg.pinnedAt;

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Message actions"
            data-testid={`button-message-actions-${msg.id}`}
            className={`absolute right-1 z-10 flex h-6 w-6 items-center justify-center bg-transparent text-muted-foreground opacity-70 hover:opacity-100 ${
              hasTopTag ? "top-8" : "top-2"
            }`}
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={isOwn ? "end" : "start"} className="w-48">
          <DropdownMenuItem onSelect={() => startReply(msg)}>
            <Reply className="mr-2 h-4 w-4" />
            {t.messageActionReply}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setForwarding(msg)}>
            <ForwardIcon className="mr-2 h-4 w-4" />
            {t.messageActionForward}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => pinMutation.mutate({ messageId: msg.id, pin: !isPinned })}
          >
            {isPinned ? (
              <>
                <PinOff className="mr-2 h-4 w-4" />
                {t.messageActionUnpin}
              </>
            ) : (
              <>
                <Pin className="mr-2 h-4 w-4" />
                {t.messageActionPin}
              </>
            )}
          </DropdownMenuItem>
          {msg.content && (
            <DropdownMenuItem onSelect={() => copyMessageContent(msg)}>
              <Copy className="mr-2 h-4 w-4" />
              {t.messageActionCopy}
            </DropdownMenuItem>
          )}
          {(canEdit || canDelete) && <DropdownMenuSeparator />}
          {canEdit && (
            <DropdownMenuItem onSelect={() => startEdit(msg)}>
              <Pencil className="mr-2 h-4 w-4" />
              {t.messageActionEdit}
            </DropdownMenuItem>
          )}
          {canDelete && (
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => setPendingDelete(msg)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {t.messageActionDelete}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const renderReplyPreviewInsideBubble = (
    reply: NonNullable<ConversationMessageWithAuthor["replyTo"]>,
    isOwn: boolean
  ) => (
    <button
      type="button"
      onClick={() => scrollToMessage(reply.id)}
      className={`mb-1 block w-full rounded-lg border-l-2 px-2 py-1 pr-8 text-left text-[11px] leading-tight ${
        isOwn
          ? "border-emerald-500/70 bg-emerald-50/70 dark:bg-emerald-950/40"
          : "border-primary/70 bg-background/60"
      }`}
    >
      <span className="block font-semibold text-[10px] text-muted-foreground truncate">
        {getMessageDisplayName(reply.author)}
      </span>
      <span className="block text-muted-foreground truncate">
        {getReplySnippet(reply)}
      </span>
    </button>
  );

  const renderForwardedHeader = (msg: ConversationMessageWithAuthor) => {
    if (!msg.forwardedFromMessageId && !msg.forwardedFromUserId) return null;
    const author = msg.forwardedFromAuthor;
    return (
      <p className="text-[10px] leading-tight text-muted-foreground italic mb-0.5">
        ↪ {t.messageForwardedFrom} {getMessageDisplayName(author)}
      </p>
    );
  };

  const isComposerInEditMode = !!editing;
  const composerValue = isComposerInEditMode ? editText : message;
  const handleComposerChange = (v: string) => {
    if (isComposerInEditMode) setEditText(v);
    else setMessage(v);
  };
  const isComposerSending = sendMutation.isPending || editMutation.isPending;

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

      {activePinnedMessage && (
        <button
          type="button"
          onClick={handlePinnedBannerClick}
          className="absolute inset-x-0 top-[68px] z-20 mx-3 flex items-start gap-2 rounded-xl border border-border/40 bg-background/85 px-3 py-2 text-left shadow-sm backdrop-blur-md"
          data-testid="banner-pinned-message"
        >
          <Pin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-primary">
              {t.messagePinnedTitle}
              {pinnedMessages.length > 1 && (
                <span className="ml-1 text-muted-foreground">({pinnedMessages.length})</span>
              )}
            </p>
            <p className="truncate text-xs text-foreground/80">
              {activePinnedMessage.content
                ? activePinnedMessage.content
                : activePinnedMessage.imageUrl
                ? t.messagePhotoLabel
                : t.messageDeleted}
            </p>
          </div>
        </button>
      )}

      <div
        ref={messagesScrollRef}
        className={`flex-1 overflow-y-auto px-4 ${activePinnedMessage ? "pt-32" : "pt-20"} pb-32`}
      >
        <div ref={messagesContentRef} className="space-y-3">
          {messagesLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : sortedMessages.length > 0 ? (
            sortedMessages.map((msg) => {
              const isOwn = msg.authorUserId === user?.id;
              const isDeleted = !!msg.deletedAt;
              return (
                <div
                  key={msg.id}
                  ref={setMessageRef(msg.id)}
                  className={`group flex w-full transition-shadow duration-300 ${
                    isOwn ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`relative min-h-[2.75rem] min-w-28 max-w-[85%] rounded-2xl border pl-2 pr-1.5 pt-1 pb-3.5 ${
                      isDeleted
                        ? "border-dashed border-border/60 bg-muted/40 text-muted-foreground italic"
                        : isOwn
                        ? "bg-emerald-100 dark:bg-emerald-900 border-emerald-200 dark:border-emerald-800 text-foreground"
                        : "border-transparent bg-muted"
                    }`}
                  >
                    {!isDeleted && renderMessageActions(msg)}
                    {!isOwn && !isDeleted && showMessageAuthorName && (
                      <p className="text-[10px] leading-tight text-muted-foreground mb-0.5 pr-8">
                        {getMessageDisplayName(msg.author)}
                      </p>
                    )}
                    {!isDeleted && msg.replyTo && renderReplyPreviewInsideBubble(msg.replyTo, isOwn)}
                    {!isDeleted && renderForwardedHeader(msg)}
                    {!isDeleted && msg.imageUrl && (
                      <a
                        href={msg.imageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block mb-0.5"
                      >
                        <img
                          src={msg.imageUrl}
                          alt=""
                          className="max-w-full rounded max-h-48 object-contain"
                        />
                      </a>
                    )}
                    {isDeleted ? (
                      <p className="whitespace-pre-wrap break-words text-sm leading-snug pr-7 pb-0.5">
                        {t.messageDeleted}
                      </p>
                    ) : msg.content ? (
                      <p className="whitespace-pre-wrap break-words text-sm leading-snug pr-7 pb-0.5">
                        {msg.content}
                      </p>
                    ) : null}
                    {!isDeleted && msg.pinnedAt && (
                      <Pin className="absolute -top-1 -left-1 h-3.5 w-3.5 text-primary" />
                    )}
                    <span className="pointer-events-none absolute bottom-0.5 right-1.5 text-[10px] leading-none text-muted-foreground tabular-nums select-none">
                      {!isDeleted && msg.editedAt && (
                        <span className="mr-1 italic">{t.messageEdited}</span>
                      )}
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

      <div className="absolute inset-x-0 bottom-0 z-20 bg-transparent px-4 py-4 space-y-2">
        {(replyTo || editing) && (
          <div className="flex items-start gap-2 rounded-xl border border-border/60 bg-background/95 px-3 py-2 shadow-sm backdrop-blur-md">
            {editing ? (
              <Pencil className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            ) : (
              <Reply className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold text-primary">
                {editing ? t.messageEditingTitle : t.messageReplyingTo}
                {!editing && replyTo && (
                  <span className="ml-1 text-muted-foreground">
                    {getMessageDisplayName(replyTo.author)}
                  </span>
                )}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {editing
                  ? editing.content ?? ""
                  : replyTo?.content
                  ? replyTo.content
                  : replyTo?.imageUrl
                  ? t.messagePhotoLabel
                  : ""}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={cancelComposerContext}
              data-testid="button-cancel-composer-context"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        <ChatInputBar
          value={composerValue}
          placeholder={editing ? t.messageEditingTitle : t.writeMessage}
          onChange={handleComposerChange}
          onSend={handleSend}
          isSending={isComposerSending}
          onUploadImages={editing ? undefined : handleUploadImages}
          isUploadingImages={isUploadingPhoto}
          wrapperClassName=""
        />
      </div>

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

      <Dialog
        open={!!forwarding}
        onOpenChange={(open) => {
          if (!open) {
            setForwarding(null);
            setForwardSearch("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.messageForwardTitle}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t.messageForwardSelectChat}</p>
            <Input
              value={forwardSearch}
              onChange={(e) => setForwardSearch(e.target.value)}
              placeholder="Поиск чата"
            />
            <div className="max-h-72 overflow-y-auto space-y-1">
              {forwardChatsLoading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
              ) : filteredForwardChats.length === 0 ? (
                <p className="text-sm text-muted-foreground py-3 text-center">
                  {t.messageForwardEmpty}
                </p>
              ) : (
                filteredForwardChats.map((chat) => {
                  if (!chat.conversationId) return null;
                  const chatTitle =
                    chat.name ||
                    chat.otherParticipantName ||
                    (chat.type === "channel" ? t.searchChannels : t.chatWithDoctor);
                  const targetType: "direct" | "group" | "channel" =
                    chat.type === "group" || chat.type === "channel" ? chat.type : "direct";
                  return (
                    <button
                      key={chat.conversationId}
                      type="button"
                      onClick={() =>
                        chat.conversationId &&
                        forwarding &&
                        forwardMutation.mutate({
                          sourceMessageId: forwarding.id,
                          targetConversationId: chat.conversationId,
                          targetTitle: chatTitle,
                          targetType,
                        })
                      }
                      disabled={forwardMutation.isPending}
                      className="w-full text-left flex items-center gap-3 rounded-md border px-3 py-2 hover:bg-muted/40 disabled:opacity-60"
                      data-testid={`button-forward-target-${chat.conversationId}`}
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={chat.avatarUrl ?? undefined} />
                        <AvatarFallback className="text-xs">
                          {chatTitle.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{chatTitle}</p>
                      </div>
                      {forwardMutation.isPending && (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.messageDeleteConfirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.messageDeleteConfirmDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => pendingDelete && deleteMutation.mutate(pendingDelete.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-2 h-4 w-4" />
              )}
              {t.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
