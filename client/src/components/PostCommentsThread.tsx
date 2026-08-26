import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useConversationMessages } from "@/hooks/useConversationMessages";
import { useLocation } from "wouter";
import { Loader2, ArrowLeft, Reply, Pencil, Trash2, X, Forward as ForwardIcon, Copy, Link2, File as FileIcon } from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import { ru } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import ChatInputBar from "@/components/ChatInputBar";
import { SponsorAwareMessageText } from "@/components/SponsorAwareMessageText";
import { FormattedMessageText } from "@/components/FormattedMessageText";
import { stripMessageFormatting } from "@shared/messageFormatting";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { profileAvatarSrc } from "@/lib/utils";
import { normalizeChatImageFile } from "@/lib/normalizeImageFile";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useUpload } from "@/hooks/use-upload";
import { useToast } from "@/hooks/use-toast";
import { scrollChatPaneToBottom, scrollChatElementIntoView, focusChatBubble, blinkChatBubble } from "@/lib/chatScroll";
import { useConversationWs, type ConversationCommentWithAuthor, type ConversationMessageWithAuthor } from "@/hooks/useConversationWs";
import { liveConversationQueryOptions } from "@/lib/conversationQueryOptions";
import { useInboxUnreadMessages } from "@/hooks/useInboxUnreadMessages";
import { ChatBackUnreadBadge } from "@/components/ChatBackUnreadBadge";
import { postConversationSeen } from "@/lib/markConversationSeen";
import { ImageViewerDialog } from "@/components/ImageViewerDialog";
import { t } from "@/lib/i18n";
import { saveOrShareChatFile } from "@/lib/saveOrShareChatFile";
import { ChatVideoPlayer } from "@/components/ChatVideoPlayer";
import { parseVideoMessagePayload } from "@shared/videoMessagePayload";
import {
  clearMessageLongPress,
  handleMessagePointerDown,
  handleMessagePointerMove,
  handleMessageTouchMove,
  handleMessageTouchStart,
  layoutMessageActionLayer,
  type MessageLongPressRefs,
} from "@/lib/messageLongPress";

type PostCommentsThreadProps = {
  conversationId: string;
  messageId: string;
  currentUserId?: string;
  onBack: () => void;
};

const QUICK_REACTIONS = ["👍", "❤️", "🔥", "😂", "🙏", "😢"] as const;

function getThumbUrl(url: string): string {
  return url + (url.includes("?") ? "&" : "?") + "size=thumb";
}

function getAuthorName(author: { firstName?: string | null; lastName?: string | null; email?: string | null } | null | undefined): string {
  if (!author) return "User";
  if (author.firstName && author.lastName) return `${author.firstName} ${author.lastName}`;
  if (author.firstName) return author.firstName;
  if (author.email) return author.email.split("@")[0];
  return "User";
}

function formatBubbleTime(dateStr: string): string {
  const d = new Date(dateStr);
  if (isToday(d)) return format(d, "HH:mm", { locale: ru });
  if (isYesterday(d)) return `вч. ${format(d, "HH:mm", { locale: ru })}`;
  return format(d, "dd.MM. HH:mm", { locale: ru });
}

export default function PostCommentsThread({
  conversationId,
  messageId,
  currentUserId,
  onBack,
}: PostCommentsThreadProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const inboxUnreadMessages = useInboxUnreadMessages();
  const [message, setMessage] = useState("");
  const [replyTo, setReplyTo] = useState<ConversationCommentWithAuthor | null>(null);
  const [editing, setEditing] = useState<ConversationCommentWithAuthor | null>(null);
  const [forwarding, setForwarding] = useState<ConversationCommentWithAuthor | null>(null);
  const [forwardSearch, setForwardSearch] = useState("");
  const [messageLayer, setMessageLayer] = useState<{
    comment: ConversationCommentWithAuthor;
    rect: { top: number; left: number; width: number; height: number };
  } | null>(null);
  const [inlineContentPaymentSegment, setInlineContentPaymentSegment] = useState<number | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const paymentSegmentRef = useRef<HTMLDivElement | null>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const commentRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const longPressRefs = useRef<MessageLongPressRefs>({
    timer: null,
    guardTimer: null,
    start: null,
  });
  const deepLinkHandledRef = useRef<string | null>(null);

  useConversationWs(conversationId, true);

  useEffect(() => {
    if (!conversationId) return;
    postConversationSeen(conversationId);
  }, [conversationId]);

  const { data: conv } = useQuery<{
    type: string;
    sponsorSettings?: { enabled: boolean } | null;
    isSponsor?: boolean;
  }>({
    queryKey: ["/api/conversations", conversationId],
    enabled: !!conversationId,
  });

  const channelMonetizationEnabled = conv?.type === "channel" && !!conv.sponsorSettings?.enabled;
  const canViewSponsorContent = conv?.type !== "channel" || !!conv.isSponsor;

  useEffect(() => {
    if (canViewSponsorContent) setInlineContentPaymentSegment(null);
  }, [canViewSponsorContent]);

  useEffect(() => {
    if (inlineContentPaymentSegment == null) return;
    scrollChatElementIntoView(paymentSegmentRef.current);
  }, [inlineContentPaymentSegment]);

  const { messages: conversationMessages } = useConversationMessages(conversationId);

  const anchorPost = useMemo(
    () => conversationMessages.find((item) => item.id === messageId) ?? null,
    [conversationMessages, messageId]
  );

  const commentsQueryKey = useMemo(
    () => ["/api/conversations", conversationId, "messages", messageId, "comments"],
    [conversationId, messageId]
  );

  const { data: comments = [], isLoading } = useQuery<ConversationCommentWithAuthor[]>({
    queryKey: commentsQueryKey,
    enabled: !!conversationId && !!messageId,
    ...liveConversationQueryOptions,
  });

  const sortedComments = useMemo(
    () => [...comments].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [comments]
  );

  const galleryImages = useMemo(() => {
    const urls: string[] = [];
    if (
      anchorPost?.imageUrl &&
      !anchorPost.deletedAt &&
      anchorPost.messageType !== "voice" &&
      anchorPost.messageType !== "video" &&
      anchorPost.messageType !== "file"
    ) {
      urls.push(anchorPost.imageUrl);
    }
    for (const comment of sortedComments) {
      if (comment.imageUrl && !comment.deletedAt) {
        urls.push(comment.imageUrl);
      }
    }
    return urls;
  }, [anchorPost, sortedComments]);

  const goToPrevGalleryImage = useCallback(() => {
    if (!selectedImage || galleryImages.length < 2) return;
    const index = galleryImages.indexOf(selectedImage);
    const prevIndex = index <= 0 ? galleryImages.length - 1 : index - 1;
    setSelectedImage(galleryImages[prevIndex]);
  }, [galleryImages, selectedImage]);

  const goToNextGalleryImage = useCallback(() => {
    if (!selectedImage || galleryImages.length < 2) return;
    const index = galleryImages.indexOf(selectedImage);
    const nextIndex = index < 0 || index >= galleryImages.length - 1 ? 0 : index + 1;
    setSelectedImage(galleryImages[nextIndex]);
  }, [galleryImages, selectedImage]);

  useEffect(() => {
    if (!selectedImage) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goToPrevGalleryImage();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goToNextGalleryImage();
      } else if (e.key === "Escape") {
        setSelectedImage(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedImage, goToPrevGalleryImage, goToNextGalleryImage]);

  const setCommentRef = (id: string) => (el: HTMLDivElement | null) => {
    if (el) commentRefs.current.set(id, el);
    else commentRefs.current.delete(id);
  };

  const scrollToComment = useCallback((commentId: string, options?: { onScrolled?: () => void }) => {
    focusChatBubble(
      () => messagesScrollRef.current,
      () => commentRefs.current.get(commentId) ?? null,
      () => {
        const el = commentRefs.current.get(commentId);
        if (el) blinkChatBubble(el);
        options?.onScrolled?.();
      }
    );
  }, []);

  useEffect(() => {
    deepLinkHandledRef.current = null;
  }, [conversationId, messageId]);

  type MyChatItem = {
    source: "conversation";
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

  const { data: forwardChats = [], isLoading: forwardChatsLoading } = useQuery<MyChatItem[]>({
    queryKey: ["/api/me/chats", "forward-targets", "comments-thread"],
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

  const filteredForwardChats = useMemo(() => {
    const q = forwardSearch.trim().toLowerCase();
    if (!q) return forwardChats;
    return forwardChats.filter((chat) => {
      const chatTitle = chat.name || chat.otherParticipantName || "Чат";
      return chatTitle.toLowerCase().includes(q);
    });
  }, [forwardChats, forwardSearch]);

  const createCommentMutation = useMutation({
    mutationFn: async (data: { content?: string; imageUrl?: string; replyToCommentId?: string }) => {
      const res = await apiRequest(
        "POST",
        `/api/conversations/${conversationId}/messages/${messageId}/comments`,
        data
      );
      return (await res.json()) as ConversationCommentWithAuthor;
    },
    onSuccess: (created) => {
      queryClient.setQueryData<ConversationCommentWithAuthor[]>(commentsQueryKey, (old) => {
        if (!old) return [created];
        if (old.some((comment) => comment.id === created.id)) return old;
        return [...old, created];
      });
      setMessage("");
      setReplyTo(null);
    },
    onError: (error: Error) => {
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
    },
  });

  const editCommentMutation = useMutation({
    mutationFn: async ({ commentId, content }: { commentId: string; content: string }) => {
      await apiRequest(
        "PATCH",
        `/api/conversations/${conversationId}/messages/${messageId}/comments/${commentId}`,
        { content }
      );
      return { commentId, content };
    },
    onSuccess: ({ commentId, content }) => {
      queryClient.setQueryData<ConversationCommentWithAuthor[]>(commentsQueryKey, (old) =>
        old?.map((comment) =>
          comment.id === commentId ? { ...comment, content, editedAt: new Date().toISOString() } : comment
        )
      );
      setEditing(null);
      setMessage("");
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: string) => {
      await apiRequest(
        "DELETE",
        `/api/conversations/${conversationId}/messages/${messageId}/comments/${commentId}`
      );
      return commentId;
    },
    onSuccess: (commentId) => {
      queryClient.setQueryData<ConversationCommentWithAuthor[]>(commentsQueryKey, (old) =>
        old?.map((comment) =>
          comment.id === commentId
            ? { ...comment, deletedAt: new Date().toISOString(), content: null, imageUrl: null }
            : comment
        )
      );
    },
  });

  const reactionMutation = useMutation({
    mutationFn: async ({ commentId, emoji }: { commentId: string; emoji: string }) => {
      const res = await apiRequest(
        "POST",
        `/api/conversations/${conversationId}/messages/${messageId}/comments/${commentId}/reactions`,
        { emoji }
      );
      return (await res.json()) as { commentId: string; reactions: ConversationCommentWithAuthor["reactions"] };
    },
    onSuccess: ({ commentId, reactions }) => {
      queryClient.setQueryData<ConversationCommentWithAuthor[]>(commentsQueryKey, (old) =>
        old?.map((comment) => (comment.id === commentId ? { ...comment, reactions: reactions ?? [] } : comment))
      );
    },
  });

  const forwardMutation = useMutation({
    mutationFn: async ({
      targetConversationId,
      sourceComment,
      targetTitle,
      targetType,
    }: {
      targetConversationId: string;
      sourceComment: ConversationCommentWithAuthor;
      targetTitle: string;
      targetType: "direct" | "group" | "channel";
    }) => {
      await apiRequest("POST", `/api/conversations/${targetConversationId}/messages`, {
        content: sourceComment.content ?? "",
        imageUrl: sourceComment.imageUrl ?? undefined,
        messageType: "message",
      });
      return { targetTitle, targetConversationId, targetType };
    },
    onSuccess: ({ targetTitle, targetConversationId, targetType }) => {
      const targetPath =
        targetType === "group"
          ? `/messenger/group/${targetConversationId}`
          : targetType === "channel"
          ? `/messenger/channel/${targetConversationId}`
          : `/messenger/direct/${targetConversationId}`;
      toast({
        title: "Переслано",
        description: (
          <span>
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
      setForwarding(null);
      setForwardSearch("");
    },
    onError: (err: Error) => {
      toast({ title: "Ошибка", description: err.message, variant: "destructive" });
    },
  });

  const { uploadFile, isUploading } = useUpload({
    onSuccess: async (response) => {
      await createCommentMutation.mutateAsync({
        content: "",
        imageUrl: response.objectPath,
        replyToCommentId: replyTo?.id,
      });
    },
    onError: (error) => {
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("commentId")) return;

    const root = messagesScrollRef.current;
    if (!root) return;
    scrollChatPaneToBottom(root);
  }, [comments.length, anchorPost?.id]);

  useEffect(() => {
    const commentId = new URLSearchParams(window.location.search).get("commentId");
    if (!commentId) return;
    if (!sortedComments.some((c) => c.id === commentId)) return;
    const key = `${conversationId}:${messageId}:${commentId}`;
    if (deepLinkHandledRef.current === key) return;
    scrollToComment(commentId, {
      onScrolled: () => {
        deepLinkHandledRef.current = key;
      },
    });
  }, [conversationId, messageId, sortedComments.length, scrollToComment]);

  const composerValue = editing ? message : message;
  const canSend = !!composerValue.trim() && !createCommentMutation.isPending && !editCommentMutation.isPending;

  const handleSend = () => {
    const content = composerValue.trim();
    if (!content) return;
    if (editing) {
      editCommentMutation.mutate({ commentId: editing.id, content });
      return;
    }
    createCommentMutation.mutate({
      content,
      replyToCommentId: replyTo?.id,
    });
  };

  const clearLongPress = () => clearMessageLongPress(longPressRefs.current);

  const openCommentLayer = (comment: ConversationCommentWithAuthor, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    setMessageLayer({
      comment,
      rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
    });
  };

  const handleBubbleContextMenu = (
    e: React.MouseEvent<HTMLElement>,
    comment: ConversationCommentWithAuthor
  ) => {
    if (comment.deletedAt) return;
    e.preventDefault();
    openCommentLayer(comment, e.currentTarget);
  };

  const handleBubblePointerDown = (
    e: React.PointerEvent<HTMLElement>,
    comment: ConversationCommentWithAuthor
  ) => {
    if (comment.deletedAt) return;
    const targetEl = e.currentTarget;
    handleMessagePointerDown(
      e,
      longPressRefs.current,
      () => openCommentLayer(comment, targetEl),
      true
    );
  };

  const handleBubbleTouchStart = (
    e: React.TouchEvent<HTMLElement>,
    comment: ConversationCommentWithAuthor
  ) => {
    if (comment.deletedAt) return;
    const targetEl = e.currentTarget;
    handleMessageTouchStart(
      e,
      longPressRefs.current,
      () => openCommentLayer(comment, targetEl),
      true
    );
  };

  const handleBubbleTouchMove = (e: React.TouchEvent<HTMLElement>) => {
    handleMessageTouchMove(e, longPressRefs.current);
  };

  const handleBubblePointerMove = (e: React.PointerEvent<HTMLElement>) => {
    handleMessagePointerMove(e, longPressRefs.current);
  };

  const renderReactionPills = (comment: ConversationCommentWithAuthor) => {
    if (!comment.reactions || comment.reactions.length === 0) return null;
    return (
      <div className="flex flex-wrap gap-1">
        {comment.reactions.map((reaction) => (
          <button
            key={reaction.emoji}
            type="button"
            onClick={() => reactionMutation.mutate({ commentId: comment.id, emoji: reaction.emoji })}
            className={`px-1.5 py-0 text-sm leading-none ${reaction.reactedByMe ? "font-semibold" : ""}`}
          >
            {reaction.emoji} {reaction.count}
          </button>
        ))}
      </div>
    );
  };

  const renderCommentActionItems = (comment: ConversationCommentWithAuthor, onDone?: () => void) => {
    const isOwn = comment.authorUserId === currentUserId;
    const commentLink =
      typeof window !== "undefined"
        ? `${window.location.origin}/messenger/channel/${conversationId}/post/${messageId}/comments?commentId=${comment.id}`
        : "";
    return (
      <>
        <button
          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
          onClick={() => {
            setForwarding(comment);
            onDone?.();
          }}
        >
          <ForwardIcon className="mr-2 h-4 w-4" />
          Переслать
        </button>
        <button
          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
          onClick={() => {
            setReplyTo(comment);
            setEditing(null);
            onDone?.();
          }}
        >
          <Reply className="mr-2 h-4 w-4" />
          Ответить
        </button>
        {!!comment.content && (
          <button
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
            onClick={async () => {
              await navigator.clipboard.writeText(comment.content ?? "");
              onDone?.();
            }}
          >
            <Copy className="mr-2 h-4 w-4" />
            Копировать
          </button>
        )}
        <button
          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
          onClick={async () => {
            if (!commentLink) return;
            await navigator.clipboard.writeText(commentLink);
            onDone?.();
          }}
        >
          <Link2 className="mr-2 h-4 w-4" />
          Копировать ссылку
        </button>
        {isOwn && (
          <button
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
            onClick={() => {
              setEditing(comment);
              setReplyTo(null);
              setMessage(comment.content ?? "");
              onDone?.();
            }}
          >
            <Pencil className="mr-2 h-4 w-4" />
            Изменить
          </button>
        )}
        {isOwn && (
          <button
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-destructive hover:bg-muted"
            onClick={() => {
              deleteCommentMutation.mutate(comment.id);
              onDone?.();
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Удалить
          </button>
        )}
      </>
    );
  };

  return (
    <div className="relative flex h-full flex-col">
      <div className="chat-header-panel absolute inset-x-0 top-0 z-30 px-3 pb-3">
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="icon"
            onClick={onBack}
            className="relative h-10 w-10 rounded-full border border-border/40 bg-background/55 text-black backdrop-blur-md"
          >
            <ArrowLeft className="h-5 w-5" />
            <ChatBackUnreadBadge count={inboxUnreadMessages} />
          </Button>
          <div className="flex-1 rounded-full border border-border/40 bg-background/55 px-4 py-2 backdrop-blur-md">
            <p className="text-sm font-semibold truncate">Комментарии</p>
          </div>
        </div>
      </div>

      <div ref={messagesScrollRef} className="chat-messages-pane flex-1 overflow-y-auto px-4">
        <div className="space-y-3">
          {anchorPost && (
            <div className="flex w-full justify-start">
              <div className="relative min-h-[2.75rem] min-w-28 max-w-[85%] rounded-2xl border bg-background px-2 pt-1 pb-1.5">
                <p className="mb-0.5 text-[10px] text-muted-foreground">Публикация</p>
                {anchorPost.imageUrl && anchorPost.messageType === "video" && (
                  <ChatVideoPlayer
                    src={anchorPost.imageUrl}
                    posterUrl={parseVideoMessagePayload(anchorPost.content)?.posterUrl}
                  />
                )}
                {anchorPost.imageUrl && anchorPost.messageType === "file" && (() => {
                  let name = "Файл";
                  try {
                    const parsed = anchorPost.content ? JSON.parse(anchorPost.content) : null;
                    if (typeof parsed?.name === "string" && parsed.name.trim()) name = parsed.name.trim();
                  } catch {
                    // ignore
                  }
                  return (
                    <a
                      href={anchorPost.imageUrl}
                      download={name}
                      rel="noopener noreferrer"
                      className="mb-0.5 flex max-w-full items-center gap-2 rounded-xl bg-muted/80 px-2.5 py-2 text-sm no-underline hover:bg-muted"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        let dismissLoading: (() => void) | undefined;
                        let knownSize: number | undefined;
                        try {
                          const parsed = anchorPost.content ? JSON.parse(anchorPost.content) : null;
                          if (typeof parsed?.size === "number" && Number.isFinite(parsed.size)) {
                            knownSize = parsed.size;
                          }
                        } catch {
                          // ignore
                        }
                        void saveOrShareChatFile(anchorPost.imageUrl!, name, {
                          knownSize,
                          onStatus: (status) => {
                            if (status === "loading" && !dismissLoading) {
                              const result = toast({ title: t.messageFileDownloading });
                              dismissLoading = result.dismiss;
                            }
                          },
                        })
                          .catch(() => {
                            toast({
                              title: t.error,
                              description: t.messageFileOpenError,
                              variant: "destructive",
                            });
                          })
                          .finally(() => {
                            dismissLoading?.();
                          });
                      }}
                    >
                      <FileIcon className="h-5 w-5 shrink-0" />
                      <span className="truncate font-medium">{name}</span>
                    </a>
                  );
                })()}
                {anchorPost.imageUrl &&
                  anchorPost.messageType !== "voice" &&
                  anchorPost.messageType !== "video" &&
                  anchorPost.messageType !== "file" && (
                  <img
                    src={getThumbUrl(anchorPost.imageUrl)}
                    alt=""
                    loading="lazy"
                    className="mb-0.5 max-h-48 max-w-full cursor-pointer rounded object-contain transition-opacity hover:opacity-90"
                    onClick={() => setSelectedImage(anchorPost.imageUrl!)}
                  />
                )}
                {anchorPost.content &&
                anchorPost.messageType !== "file" &&
                anchorPost.messageType !== "voice" ? (
                  <SponsorAwareMessageText
                    text={anchorPost.content}
                    canViewSponsorContent={canViewSponsorContent}
                    monetizationEnabled={channelMonetizationEnabled}
                    isContentTruncated={anchorPost.isContentTruncated}
                    conversationId={conversationId}
                    activePaymentSegmentIndex={inlineContentPaymentSegment}
                    onPaymentSegmentOpen={setInlineContentPaymentSegment}
                    onPaymentFlowClose={() => setInlineContentPaymentSegment(null)}
                    onPaymentSegmentRef={(_segmentIndex, el) => {
                      paymentSegmentRef.current = el;
                    }}
                  />
                ) : null}
                <span className="mt-1 block text-right text-[10px] leading-none text-muted-foreground">
                  {formatBubbleTime(anchorPost.createdAt)}
                </span>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : sortedComments.length > 0 ? (
            sortedComments.map((comment) => {
              const isOwn = comment.authorUserId === currentUserId;
              const isDeleted = !!comment.deletedAt;
              return (
                <div key={comment.id} className={`group flex w-full ${isOwn ? "justify-end" : "justify-start"}`}>
                  <div
                    ref={setCommentRef(comment.id)}
                    onContextMenu={(e) => handleBubbleContextMenu(e, comment)}
                    onPointerDown={(e) => handleBubblePointerDown(e, comment)}
                    onPointerMove={handleBubblePointerMove}
                    onPointerUp={clearLongPress}
                    onPointerCancel={clearLongPress}
                    onPointerLeave={clearLongPress}
                    onTouchStart={(e) => handleBubbleTouchStart(e, comment)}
                    onTouchMove={handleBubbleTouchMove}
                    onTouchEnd={clearLongPress}
                    onTouchCancel={clearLongPress}
                    className={`message relative min-h-[2.75rem] min-w-28 max-w-[85%] rounded-2xl border px-2 pt-1 pb-1.5 select-none ${
                      isOwn
                        ? "bg-emerald-100 dark:bg-emerald-900 border-emerald-200 dark:border-emerald-800 text-foreground"
                        : "border-border/50 bg-stone-50 text-foreground shadow-sm dark:bg-stone-900/80"
                    }`}
                    style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" }}
                  >
                    {!isOwn && (
                      <p className="mb-0.5 pr-8 text-[10px] leading-tight text-muted-foreground">
                        {getAuthorName(comment.author)}
                      </p>
                    )}
                    {comment.replyTo && (
                      <div className="mb-1 rounded-lg border-l-2 border-primary/70 bg-stone-50 px-2 py-1 text-[11px] text-muted-foreground dark:bg-stone-900/80">
                        <span className="font-semibold">{getAuthorName(comment.replyTo.author)}</span>{" "}
                        {comment.replyTo.content || "Сообщение"}
                      </div>
                    )}
                    {isDeleted ? (
                      <p className="whitespace-pre-wrap break-words pb-0.5 text-sm italic leading-snug text-muted-foreground">
                        Комментарий удалён
                      </p>
                    ) : (
                      <>
                        {comment.imageUrl && (
                          <img
                            src={getThumbUrl(comment.imageUrl)}
                            alt=""
                            loading="lazy"
                            className="mb-0.5 max-h-48 max-w-full cursor-pointer rounded object-contain transition-opacity hover:opacity-90"
                            onClick={() => {
                              setMessageLayer(null);
                              setSelectedImage(comment.imageUrl!);
                            }}
                          />
                        )}
                        {comment.content ? (
                          <FormattedMessageText text={comment.content} />
                        ) : null}
                      </>
                    )}

                    {!isDeleted ? (
                      <div className="mt-1 flex items-end justify-between gap-2">
                        <div className="min-w-0">{renderReactionPills(comment)}</div>
                        <span className="shrink-0 text-right text-[10px] leading-none text-muted-foreground">
                          {comment.editedAt && <span className="mr-1 italic">изм.</span>}
                          {formatBubbleTime(comment.createdAt)}
                        </span>
                      </div>
                    ) : (
                      <span className="mt-1 block text-right text-[10px] leading-none text-muted-foreground">
                        {comment.editedAt && <span className="mr-1 italic">изм.</span>}
                        {formatBubbleTime(comment.createdAt)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <p className="text-center text-muted-foreground py-8">Пока нет комментариев</p>
          )}
        </div>
      </div>

      <div className="chat-composer-panel absolute inset-x-0 bottom-0 z-20 bg-transparent px-4 pt-2 space-y-2">
        {(replyTo || editing) && (
          <div className="flex items-start gap-2 rounded-xl border border-border/60 bg-background/95 px-3 py-2 shadow-sm backdrop-blur-md">
            {editing ? <Pencil className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> : <Reply className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold text-primary">
                {editing ? "Редактирование" : "Ответ"}
                {!editing && replyTo && <span className="ml-1 text-muted-foreground">{getAuthorName(replyTo.author)}</span>}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {editing
                  ? editing.content
                    ? stripMessageFormatting(editing.content)
                    : ""
                  : replyTo?.content
                  ? stripMessageFormatting(replyTo.content)
                  : replyTo?.imageUrl
                  ? "Изображение"
                  : ""}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={() => {
                setReplyTo(null);
                setEditing(null);
                setMessage("");
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
        <ChatInputBar
          value={composerValue}
          placeholder={editing ? "Редактирование комментария" : "Написать комментарий"}
          onChange={setMessage}
          onSend={handleSend}
          isSending={createCommentMutation.isPending || editCommentMutation.isPending}
          onUploadMedia={editing ? undefined : async (files: File[]) => {
            for (const file of files) {
              if (!file.type.startsWith("image/") && !/\.(jpe?g|png|gif|webp|heic|heif|bmp)$/i.test(file.name)) {
                continue;
              }
              const normalizedFile = await normalizeChatImageFile(file);
              await uploadFile(normalizedFile);
            }
          }}
          isUploadingMedia={isUploading}
          mediaAccept="image/*"
          wrapperClassName=""
        />
      </div>

      <Dialog open={!!messageLayer} onOpenChange={(open) => !open && setMessageLayer(null)}>
        <DialogContent
          hideCloseButton
          className="message-action-layer !left-0 !top-0 !z-[120] !h-screen !w-screen !max-w-none !translate-x-0 !translate-y-0 !border-none !bg-transparent !p-0 !shadow-none"
        >
          {messageLayer && (
            <>
              <button
                type="button"
                className="animate-in fade-in duration-200 absolute inset-0 bg-[rgba(245,232,210,0.45)]"
                onClick={() => setMessageLayer(null)}
                aria-label="Close comment actions"
              />
              {(() => {
                const vw = typeof window !== "undefined" ? window.innerWidth : 0;
                const vh = typeof window !== "undefined" ? window.innerHeight : 0;
                const menuWidth = 280;
                const reactionsBarMinWidth = QUICK_REACTIONS.length * 40 + 24;
                const bubbleWidth = Math.min(Math.max(messageLayer.rect.width, reactionsBarMinWidth), vw - 24);
                const left = Math.max(12, Math.min(messageLayer.rect.left, vw - bubbleWidth - 12));
                const { bubbleTop, bubbleHeight, menuTop, reactionsTop } = layoutMessageActionLayer(
                  messageLayer.rect,
                  vh,
                  { menuHeight: 220 },
                );
                const isOwn = messageLayer.comment.authorUserId === currentUserId;
                return (
                  <>
                    <div
                      className="absolute animate-in fade-in zoom-in-95 duration-200"
                      style={{ top: reactionsTop, left, width: bubbleWidth }}
                    >
                      <div className="mb-2 flex flex-nowrap items-center justify-center gap-1 whitespace-nowrap rounded-full bg-background/95 px-2 py-1 shadow-lg">
                        {QUICK_REACTIONS.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            className="rounded-full px-1.5 py-0.5 text-xl hover:bg-muted"
                            onClick={() => {
                              reactionMutation.mutate({ commentId: messageLayer.comment.id, emoji });
                              setMessageLayer(null);
                            }}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div
                      className="message-action-bubble absolute rounded-2xl border border-border/60 bg-background/95 p-2 shadow-xl animate-in fade-in zoom-in-95 duration-200"
                      style={{ top: bubbleTop, left, width: bubbleWidth }}
                    >
                      {renderReactionPills(messageLayer.comment)}
                      <p className="whitespace-pre-wrap break-words text-sm leading-snug">
                        {messageLayer.comment.deletedAt ? "Комментарий удалён" : messageLayer.comment.content}
                      </p>
                    </div>
                    <div
                      className="absolute w-[280px] rounded-xl border border-border bg-background p-2 shadow-2xl animate-in fade-in slide-in-from-top-1 duration-200"
                      style={{ top: menuTop, left: Math.max(12, Math.min(left, vw - menuWidth - 12)) }}
                    >
                      {renderCommentActionItems(messageLayer.comment, () => setMessageLayer(null))}
                    </div>
                  </>
                );
              })()}
            </>
          )}
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
          <div className="space-y-3">
            <p className="text-lg font-semibold">Переслать комментарий</p>
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
                <p className="text-sm text-muted-foreground py-3 text-center">Нет подходящих чатов</p>
              ) : (
                filteredForwardChats.map((chat) => {
                  if (!chat.conversationId || !forwarding) return null;
                  const chatTitle = chat.name || chat.otherParticipantName || "Чат";
                  const targetType: "direct" | "group" | "channel" =
                    chat.type === "group" || chat.type === "channel" ? chat.type : "direct";
                  return (
                    <button
                      key={chat.conversationId}
                      type="button"
                      onClick={() =>
                        forwardMutation.mutate({
                          targetConversationId: chat.conversationId!,
                          sourceComment: forwarding,
                          targetTitle: chatTitle,
                          targetType,
                        })
                      }
                      disabled={forwardMutation.isPending}
                      className="w-full text-left flex items-center gap-3 rounded-md border px-3 py-2 hover:bg-muted/40 disabled:opacity-60"
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={profileAvatarSrc(chat.avatarUrl, "avatar")} />
                        <AvatarFallback className="text-xs">{chatTitle.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{chatTitle}</p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ImageViewerDialog
        open={!!selectedImage}
        imageUrl={selectedImage}
        hasMultiple={galleryImages.length > 1}
        onClose={() => setSelectedImage(null)}
        onPrevious={goToPrevGalleryImage}
        onNext={goToNextGalleryImage}
      />
    </div>
  );
}
