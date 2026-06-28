import { useRef, useEffect, useLayoutEffect, useMemo, useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useConversationWs, type ConversationMessageWithAuthor } from "@/hooks/useConversationWs";
import { useConversationMessages } from "@/hooks/useConversationMessages";
import {
  appendConversationMessage,
  conversationMessagesQueryKey,
  updateConversationMessagesList,
  type ConversationMessagesInfiniteData,
} from "@/lib/conversationMessagesCache";
import { liveConversationQueryOptions } from "@/lib/conversationQueryOptions";
import { useInboxUnreadMessages } from "@/hooks/useInboxUnreadMessages";
import { ChatBackUnreadBadge } from "@/components/ChatBackUnreadBadge";
import { MessageReceiptIcons } from "@/components/MessageReceiptIcons";
import { getMessageReceiptStatus } from "@/lib/messageReceipt";
import { postConversationSeen } from "@/lib/markConversationSeen";
import { messengerProfilePath } from "@/lib/messengerPaths";
import { t } from "@/lib/i18n";
import { navigateToAuth } from "@/lib/authReturnTo";
import { cn } from "@/lib/utils";
import {
  Loader2,
  ArrowLeft,
  Users,
  Reply,
  Pencil,
  Trash2,
  Forward as ForwardIcon,
  Pin,
  PinOff,
  X,
  Check,
  Copy,
  Link2,
  Pill,
  FileText,
  ClipboardList,
  Search,
  ListOrdered,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import DynamicQuestionnaireForm from "@/components/DynamicQuestionnaireForm";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { format, isToday, isYesterday } from "date-fns";
import { ru } from "date-fns/locale";
import { useUpload } from "@/hooks/use-upload";
import { useIsMobile } from "@/hooks/use-mobile";
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
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import ChatInputBar, { type ChatInputBarHandle } from "@/components/ChatInputBar";
import { SponsorAwareMessageText } from "@/components/SponsorAwareMessageText";
import { CollapsibleMessageText } from "@/components/CollapsibleMessageText";
import { ChatMessageBubble } from "@/components/ChatMessageBubble";
import { shouldShowDeletedMessagePlaque } from "@/lib/deletedMessageVisibility";
import { flattenSponsorMarkersForDisplay, hasSponsorSections, stripMessageFormatting } from "@shared/messageFormatting";
import { PinnedMessageBanner } from "@/components/PinnedMessageBanner";
import { useVoiceCall } from "@/hooks/useVoiceCall";
import { VoiceCallBanner } from "@/components/VoiceCallBanner";
import { VoiceCallRoom } from "@/components/VoiceCallRoom";
import {
  CHAT_COMPOSER_INSET_EVENT,
  scrollChatPaneToBottom,
  scrollChatPaneToBottomForKeyboard,
  anchorChatToBottom,
  isChatScrolledToBottom,
  scrollChatElementIntoView,
  focusChatBubble,
  blinkChatBubble,
} from "@/lib/chatScroll";
import { profileAvatarSrc } from "@/lib/utils";
import { normalizeChatImageFile } from "@/lib/normalizeImageFile";
import {
  clearMessageLongPress,
  handleMessagePointerDown,
  handleMessagePointerMove,
  handleMessageTouchMove,
  handleMessageTouchStart,
  layoutMessageActionLayer,
  type MessageLongPressRefs,
} from "@/lib/messageLongPress";
import {
  clearChatComposerDraft,
  getChatComposerDraft,
  setChatComposerDraft,
} from "@/lib/chatComposerDrafts";
import { ImageViewerDialog } from "@/components/ImageViewerDialog";
import { VoiceMessagePlayer } from "@/components/VoiceMessagePlayer";
import type { RecordedVoice } from "@/hooks/useVoiceRecorder";
import { pollPayloadSchema, voicePayloadSchema } from "@shared/schema";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface ConversationInfo {
  id: string;
  type: string;
  name?: string | null;
  myDisplayName?: string | null;
  avatarUrl?: string | null;
  patientUserId?: string | null;
  sponsorSettings?: {
    enabled: boolean;
    paymentInstructions?: string | null;
    tier1Amount?: string | null;
    tier2Amount?: string | null;
    durationDays?: number;
  } | null;
  isSponsor?: boolean;
  sponsorExpiresAt?: string | null;
  participantCount?: number;
  sponsorCount?: number;
  participants?: Array<{
    userId: string;
    role: string;
    displayName?: string | null;
    sponsorExpiresAt?: string | null;
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

function getThumbUrl(url: string): string {
  return url + (url.includes("?") ? "&" : "?") + "size=thumb";
}

type MyChatItem = {
  source: "conversation";
  folder: "personal" | "groups" | "channels";
  type?: string;
  conversationId?: string;
  myRole?: "owner" | "admin" | "member";
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
const QUICK_REACTIONS = ["👍", "❤️", "🔥", "😂", "🙏", "😢"] as const;
/** User must scroll near the top before older pages load via the sentinel. */
const LOAD_OLDER_NEAR_TOP_PX = 80;

interface ConversationChatProps {
  conversationId: string;
  onBack: () => void;
  onTitleClick?: () => void;
  guestPreviewMode?: boolean;
}

function getMessageDisplayName(author: ConversationMessageWithAuthor["author"] | null | undefined): string {
  if (!author) return "User";
  if (author.firstName && author.lastName) return `${author.firstName} ${author.lastName}`;
  if (author.firstName) return author.firstName;
  if (author.email) return author.email.split("@")[0];
  return "User";
}

function parsePollPayload(
  content: string | null | undefined
): { question: string; options: string[]; allowMultiple: boolean } | null {
  if (!content?.trim()) return null;
  try {
    return pollPayloadSchema.parse(JSON.parse(content));
  } catch {
    return null;
  }
}

function parseVoiceDurationSec(content: string | null | undefined): number {
  if (!content?.trim()) return 0;
  try {
    return voicePayloadSchema.parse(JSON.parse(content)).durationSec;
  } catch {
    return 0;
  }
}

function parseQuestionnaireMessageContent(content: string | null | undefined): { instanceId: string; templateName: string } | null {
  if (!content?.trim()) return null;
  try {
    const parsed = JSON.parse(content) as { instanceId?: string; templateName?: string };
    if (parsed.instanceId && parsed.templateName) return { instanceId: parsed.instanceId, templateName: parsed.templateName };
    return null;
  } catch {
    return null;
  }
}

function parseQuestionnaireTemplateMessageContent(
  content: string | null | undefined
): {
  templateId: string;
  templateName: string;
  snapshot?: { root: unknown[] };
  hintsMode?: import("@shared/questionnaireTypes").QuestionnaireHintsMode;
} | null {
  if (!content?.trim()) return null;
  try {
    const parsed = JSON.parse(content) as {
      templateId?: string;
      templateName?: string;
      snapshot?: { root: unknown[] };
      hintsMode?: import("@shared/questionnaireTypes").QuestionnaireHintsMode;
    };
    if (parsed.templateId && parsed.templateName) {
      return {
        templateId: parsed.templateId,
        templateName: parsed.templateName,
        snapshot: parsed.snapshot,
        hintsMode: parsed.hintsMode,
      };
    }
    return null;
  } catch {
    return null;
  }
}

function getReplySnippet(reply: NonNullable<ConversationMessageWithAuthor["replyTo"]>): string {
  if (reply.deletedAt) {
    return shouldShowDeletedMessagePlaque(reply.deletedAt) ? t.messageDeleted : "";
  }
  if (reply.messageType === "voice") return t.voiceMessageLabel;
  const poll = parsePollPayload(reply.content ?? undefined);
  if (poll) {
    const q = poll.question.trim();
    return q.length > 80 ? `${q.slice(0, 80)}…` : q;
  }
  if (reply.content && reply.content.trim().length > 0) {
    const text = stripMessageFormatting(reply.content.trim());
    return text.length > 80 ? `${text.slice(0, 80)}…` : text;
  }
  if (reply.imageUrl) return t.messagePhotoLabel;
  return t.messageDeleted;
}

function PollMessageBlock({
  msg,
  disabled,
  onVote,
  isSubmitting,
}: {
  msg: ConversationMessageWithAuthor;
  disabled: boolean;
  onVote: (indices: number[]) => void;
  isSubmitting: boolean;
}) {
  const parsed = parsePollPayload(msg.content);
  const pollResults = msg.pollResults;
  const [draftMulti, setDraftMulti] = useState<number[]>(() => pollResults?.selectedOptionIndices ?? []);

  useEffect(() => {
    setDraftMulti(pollResults?.selectedOptionIndices ?? []);
  }, [msg.id, (pollResults?.selectedOptionIndices ?? []).join(",")]);

  if (!parsed) {
    return <p className="text-sm text-muted-foreground">{t.pollLabel}</p>;
  }

  const counts =
    pollResults?.voteCounts?.length === parsed.options.length
      ? pollResults.voteCounts
      : parsed.options.map((_, i) => pollResults?.voteCounts?.[i] ?? 0);
  const total = pollResults?.totalVotes ?? counts.reduce((a, b) => a + b, 0);
  const pct = (i: number) => (total > 0 ? Math.round(((counts[i] ?? 0) / total) * 100) : 0);

  return (
    <div className="space-y-2 pb-0.5 min-w-[200px] max-w-full">
      <p className="text-sm font-medium whitespace-pre-wrap break-words">{parsed.question}</p>
      {parsed.options.map((label, i) => {
        const selectedSingle = !parsed.allowMultiple && pollResults?.selectedOptionIndices?.includes(i);
        const selectedMulti = parsed.allowMultiple && draftMulti.includes(i);
        return (
          <div key={i} className="space-y-0.5">
            <button
              type="button"
              disabled={disabled || isSubmitting}
              onClick={() => {
                if (parsed.allowMultiple) {
                  setDraftMulti((prev) =>
                    prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i].sort((a, b) => a - b)
                  );
                } else {
                  const cur = pollResults?.selectedOptionIndices?.[0];
                  if (cur === i) onVote([]);
                  else onVote([i]);
                }
              }}
              className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-sm transition-colors ${
                selectedSingle || selectedMulti
                  ? "border-primary bg-primary/10"
                  : "border-border/60 bg-background/50 hover:bg-muted/50"
              }`}
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                {parsed.allowMultiple ? (
                  selectedMulti ? (
                    <Check className="h-4 w-4 text-primary" />
                  ) : (
                    <span className="h-3.5 w-3.5 rounded border border-muted-foreground/50" />
                  )
                ) : selectedSingle ? (
                  <span className="h-2.5 w-2.5 rounded-full bg-primary" />
                ) : (
                  <span className="h-3.5 w-3.5 rounded-full border border-muted-foreground/50" />
                )}
              </span>
              <span className="min-w-0 flex-1 break-words">{label}</span>
            </button>
            <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary/80 transition-all" style={{ width: `${pct(i)}%` }} />
            </div>
            <p className="text-[10px] text-muted-foreground tabular-nums">
              {pct(i)}% · {counts[i] ?? 0}
            </p>
          </div>
        );
      })}
      {parsed.allowMultiple && (
        <Button
          type="button"
          size="sm"
          className="mt-1"
          disabled={disabled || isSubmitting}
          onClick={() => onVote(draftMulti)}
        >
          {t.pollVote}
        </Button>
      )}
      <p className="text-[10px] text-muted-foreground">
        {total} {t.pollVotes}
      </p>
    </div>
  );
}

export default function ConversationChat({
  conversationId,
  onBack,
  onTitleClick,
  guestPreviewMode = false,
}: ConversationChatProps) {
  const { user, hasActiveSubscription } = useAuth();
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [message, setMessage] = useState(() =>
    conversationId ? getChatComposerDraft(conversationId) : ""
  );
  const [addMembersOpen, setAddMembersOpen] = useState(false);
  const [doctorSearch, setDoctorSearch] = useState("");
  const [forwardSearch, setForwardSearch] = useState("");
  const [replyTo, setReplyTo] = useState<ConversationMessageWithAuthor | null>(null);
  const [editing, setEditing] = useState<ConversationMessageWithAuthor | null>(null);
  const [editText, setEditText] = useState("");
  const [forwarding, setForwarding] = useState<ConversationMessageWithAuthor | null>(null);
  const [hideSubscribeButton, setHideSubscribeButton] = useState(false);
  const [hideJoinButton, setHideJoinButton] = useState(false);
  const [inlineContentPayment, setInlineContentPayment] = useState<{
    messageId: string;
    segmentIndex: number;
  } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ConversationMessageWithAuthor | null>(null);
  const [activePinnedIndex, setActivePinnedIndex] = useState(-1);
  const [messageLayer, setMessageLayer] = useState<{
    message: ConversationMessageWithAuthor;
    rect: { top: number; left: number; width: number; height: number };
  } | null>(null);
  const [pollDialogOpen, setPollDialogOpen] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [pollAllowMultiple, setPollAllowMultiple] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [messageMode, setMessageMode] = useState<"message" | "prescription" | "followup">("message");
  const [openQuestionnaireInstanceId, setOpenQuestionnaireInstanceId] = useState<string | null>(null);
  const [openQuestionnaireTemplateName, setOpenQuestionnaireTemplateName] = useState<string | null>(null);
  const [isChatSearchOpen, setIsChatSearchOpen] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState("");
  const [chatSearchMatchIndex, setChatSearchMatchIndex] = useState(0);
  const [templatePreview, setTemplatePreview] = useState<{
    templateId: string;
    templateName: string;
    snapshot: { root: import("@shared/questionnaireTypes").QuestionnaireNode[] };
    hintsMode?: import("@shared/questionnaireTypes").QuestionnaireHintsMode;
  } | null>(null);
  const [questionnairePickerOpen, setQuestionnairePickerOpen] = useState(false);

  useEffect(() => {
    setOpenQuestionnaireInstanceId(null);
    setOpenQuestionnaireTemplateName(null);
    setTemplatePreview(null);
    setQuestionnairePickerOpen(false);
    setIsChatSearchOpen(false);
    setChatSearchQuery("");
    setChatSearchMatchIndex(0);
    if (conversationId) {
      setMessage(getChatComposerDraft(conversationId));
    } else {
      setMessage("");
    }
  }, [conversationId]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const messagesContentRef = useRef<HTMLDivElement>(null);
  const loadOlderRef = useRef<HTMLDivElement>(null);
  const pendingScrollRestoreRef = useRef<{ height: number; top: number } | null>(null);
  const deepLinkFetchAttemptsRef = useRef(0);
  const suppressAutoScrollUntilRef = useRef(0);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const paymentSegmentRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const inlineContentPaymentRef = useRef(inlineContentPayment);
  const longPressRefs = useRef<MessageLongPressRefs>({
    timer: null,
    guardTimer: null,
    start: null,
  });
  const deepLinkHandledRef = useRef<string | null>(null);
  /** While true, keep the viewport pinned to the latest message as content grows. */
  const stickToBottomRef = useRef(true);
  /** True after the user scrolls the pane (blocks pagination at open on short threads). */
  const userHasScrolledRef = useRef(false);
  const needsInitialPinRef = useRef(true);
  const ignoreScrollRef = useRef(false);
  const chatInputRef = useRef<ChatInputBarHandle | null>(null);
  const chatSearchInputRef = useRef<HTMLInputElement | null>(null);

  const setMessageRef = (id: string) => (el: HTMLDivElement | null) => {
    if (el) {
      messageRefs.current.set(id, el);
    } else {
      messageRefs.current.delete(id);
    }
  };

  const scrollToMessage = useCallback(
    (id: string, options?: { onScrolled?: () => void }) => {
      ignoreScrollRef.current = true;
      focusChatBubble(
        () => messagesScrollRef.current,
        () => messageRefs.current.get(id) ?? null,
        () => {
          const el = messageRefs.current.get(id);
          if (el) blinkChatBubble(el);
          options?.onScrolled?.();
          requestAnimationFrame(() => {
            ignoreScrollRef.current = false;
          });
        }
      );
    },
    []
  );

  const paymentSegmentKey = (messageId: string, segmentIndex: number) =>
    `${messageId}:${segmentIndex}`;

  const scrollToInlinePayment = useCallback(
    (target: { messageId: string; segmentIndex: number }) => {
      const el =
        paymentSegmentRefs.current.get(
          paymentSegmentKey(target.messageId, target.segmentIndex)
        ) ?? messageRefs.current.get(target.messageId) ?? null;
      scrollChatElementIntoView(el);
    },
    []
  );

  const setPaymentSegmentRef = useCallback(
    (messageId: string) => (segmentIndex: number, el: HTMLDivElement | null) => {
      const key = paymentSegmentKey(messageId, segmentIndex);
      if (el) paymentSegmentRefs.current.set(key, el);
      else paymentSegmentRefs.current.delete(key);
    },
    []
  );

  inlineContentPaymentRef.current = inlineContentPayment;

  const scrollMessagesForKeyboard = useCallback(() => {
    scrollChatPaneToBottomForKeyboard(messagesScrollRef.current);
  }, []);

  const [scrollToBottomTick, setScrollToBottomTick] = useState(0);

  const requestScrollToBottom = useCallback(() => {
    setScrollToBottomTick((tick) => tick + 1);
  }, []);

  const blockAutoScrollBriefly = useCallback(() => {
    suppressAutoScrollUntilRef.current = Date.now() + 800;
  }, []);

  const { data: conv, isLoading: convLoading } = useQuery<ConversationInfo>({
    queryKey: guestPreviewMode
      ? ["/api/public/conversations", conversationId]
      : ["/api/conversations", conversationId],
    queryFn: async () => {
      const base = guestPreviewMode ? "/api/public/conversations" : "/api/conversations";
      const res = await fetch(`${base}/${conversationId}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!conversationId,
    ...liveConversationQueryOptions,
  });

  const {
    messages,
    isLoading: messagesLoading,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useConversationMessages(conversationId, { guestPreviewMode });

  const redirectGuestToAuth = useCallback(() => {
    navigateToAuth(setLocation, location);
  }, [location, setLocation]);

  const handlePaymentSegmentOpen = useCallback(
    (messageId: string, segmentIndex: number) => {
      if (guestPreviewMode) {
        redirectGuestToAuth();
        return;
      }
      setInlineContentPayment({ messageId, segmentIndex });
    },
    [guestPreviewMode, redirectGuestToAuth]
  );

  const [canLoadOlderMessages, setCanLoadOlderMessages] = useState(false);

  const myChannelRole = conv?.participants?.find((p) => p.userId === user?.id)?.role;
  const canPostToChannel =
    (conv?.type === "group" && !myChannelRole)
      ? false
      : conv?.type !== "channel" || myChannelRole === "owner" || myChannelRole === "admin";
  const canReplyToChannel =
    conv?.type === "channel"
      ? myChannelRole === "owner" || myChannelRole === "admin"
      : conv?.type === "group"
        ? !!myChannelRole
        : true;
  const canInteractWithChannel =
    conv?.type === "channel" || conv?.type === "group" ? !!myChannelRole : true;

  const channelMonetizationEnabled = conv?.type === "channel" && !!conv.sponsorSettings?.enabled;
  const canViewSponsorContent = conv?.type !== "channel" || !!conv.isSponsor;
  const canUseChatSearch =
    conv?.type === "channel"
      ? !!conv.isSponsor ||
        myChannelRole === "owner" ||
        myChannelRole === "admin" ||
        (!channelMonetizationEnabled && !!myChannelRole)
      : hasActiveSubscription;

  useEffect(() => {
    if (canViewSponsorContent) setInlineContentPayment(null);
  }, [canViewSponsorContent]);

  useEffect(() => {
    if (!inlineContentPayment) return;
    scrollToInlinePayment(inlineContentPayment);
  }, [inlineContentPayment, scrollToInlinePayment]);

  const voiceCall = useVoiceCall(conversationId, user?.id);
  const inboxUnreadMessages = useInboxUnreadMessages();

  useConversationWs(conversationId, !!conversationId && !guestPreviewMode, user?.id, voiceCall.handleCallWsEvent, {
    refetchMessagesOnNewMessage:
      conv?.type === "channel" && channelMonetizationEnabled && !canViewSponsorContent,
  });

  useEffect(() => {
    if (!conversationId || !user?.id) return;
    postConversationSeen(conversationId);
  }, [conversationId, user?.id]);

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

  const { data: myQuestionnaireTemplates = [] } = useQuery<
    Array<{ id: string; name: string }>
  >({
    queryKey: ["/api/questionnaire-templates"],
    enabled: questionnairePickerOpen && !!user?.isAdmin,
  });

  const copyTemplateMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const res = await apiRequest("POST", `/api/questionnaire-templates/${templateId}/copy`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t.questionnaireSaved });
      void queryClient.invalidateQueries({ queryKey: ["/api/questionnaire-templates"] });
    },
  });

  const sendQuestionnaireMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const res = await apiRequest("POST", `/api/conversations/${conversationId}/messages`, {
        messageType: conv?.type === "patient" ? "questionnaire" : "questionnaire_template",
        templateId,
      });
      return res.json() as Promise<ConversationMessageWithAuthor>;
    },
    onSuccess: (newMessage) => {
      if (!conversationId) return;
      requestScrollToBottom();
      queryClient.setQueryData<ConversationMessagesInfiniteData>(
        conversationMessagesQueryKey(conversationId),
        (old) => appendConversationMessage(old, newMessage)
      );
      setQuestionnairePickerOpen(false);
    },
  });

  const sendMutation = useMutation({
    mutationFn: async (data: {
      content?: string;
      imageUrl?: string;
      messageType?: string;
      templateId?: string;
      replyToMessageId?: string;
      voiceDurationSec?: number;
      poll?: { question: string; options: string[]; allowMultiple: boolean };
    }) => {
      const body =
        data.poll != null
          ? {
              messageType: "poll" as const,
              poll: data.poll,
              replyToMessageId: data.replyToMessageId,
            }
          : {
              content: data.content,
              imageUrl: data.imageUrl,
              messageType: data.messageType ?? "message",
              templateId: data.templateId,
              replyToMessageId: data.replyToMessageId,
              voiceDurationSec: data.voiceDurationSec,
            };
      const res = await apiRequest("POST", `/api/conversations/${conversationId}/messages`, body);
      return res.json();
    },
    onSuccess: (newMessage: ConversationMessageWithAuthor) => {
      if (!conversationId) return;
      queryClient.setQueryData<ConversationMessagesInfiniteData>(
        conversationMessagesQueryKey(conversationId),
        (old) => appendConversationMessage(old, newMessage)
      );
      setMessage("");
      if (conversationId) clearChatComposerDraft(conversationId);
      setReplyTo(null);
      setPollDialogOpen(false);
      setPollQuestion("");
      setPollOptions(["", ""]);
      setPollAllowMultiple(false);
      requestScrollToBottom();
      requestAnimationFrame(() => chatInputRef.current?.focusInput());
    },
  });

  const pollVoteMutation = useMutation({
    mutationFn: async ({
      messageId,
      selectedOptionIndices,
    }: {
      messageId: string;
      selectedOptionIndices: number[];
    }) => {
      const res = await apiRequest(
        "PUT",
        `/api/conversations/${conversationId}/messages/${messageId}/poll-vote`,
        { selectedOptionIndices }
      );
      return res.json() as Promise<{
        pollResults: ConversationMessageWithAuthor["pollResults"];
      }>;
    },
    onSuccess: (data, variables) => {
      queryClient.setQueryData<ConversationMessagesInfiniteData>(
        conversationMessagesQueryKey(conversationId),
        (old) =>
          updateConversationMessagesList(old, (list) =>
            list.map((m) =>
              m.id === variables.messageId ? { ...m, pollResults: data.pollResults ?? m.pollResults } : m
            )
          )
      );
    },
    onError: (err: Error) => {
      toast({ title: t.error, description: err.message, variant: "destructive" });
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
      queryClient.setQueryData<ConversationMessagesInfiniteData>(
        conversationMessagesQueryKey(conversationId),
        (old) =>
          updateConversationMessagesList(old, (list) =>
            list.map((m) =>
              m.id === variables.messageId
                ? { ...m, content: variables.content, editedAt: new Date().toISOString() }
                : m
            )
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
      queryClient.setQueryData<ConversationMessagesInfiniteData>(
        conversationMessagesQueryKey(conversationId),
        (old) =>
          updateConversationMessagesList(old, (list) =>
            list.map((m) =>
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
      queryClient.setQueryData<ConversationMessagesInfiniteData>(
        conversationMessagesQueryKey(conversationId),
        (old) =>
          updateConversationMessagesList(old, (list) =>
            list.map((m) =>
              m.id === messageId
                ? {
                    ...m,
                    pinnedAt: pin ? new Date().toISOString() : null,
                    pinnedByUserId: pin ? user?.id ?? null : null,
                  }
                : m
            )
          )
      );
    },
    onError: (err: Error) => {
      toast({ title: t.error, description: err.message, variant: "destructive" });
    },
  });

  const joinGroupMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/conversations/${conversationId}/join`, {});
    },
    onSuccess: () => {
      setHideJoinButton(true);
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", conversationId, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/me/chats"] });
      toast({ title: t.joinGroup });
    },
    onError: (err: Error) => {
      setHideJoinButton(false);
      toast({ title: t.error, description: err.message, variant: "destructive" });
    },
  });

  const subscribeMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/conversations/${conversationId}/subscribe`, {});
    },
    onSuccess: () => {
      setHideSubscribeButton(true);
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", conversationId, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/me/chats"] });
      toast({ title: "Вы подписались на канал" });
    },
    onError: (err: Error) => {
      setHideSubscribeButton(false);
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
      queryClient.setQueryData<ConversationMessagesInfiniteData>(
        conversationMessagesQueryKey(targetConversationId),
        (old) => appendConversationMessage(old, newMessage)
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
    },
    onError: (err: Error) => {
      toast({ title: t.error, description: err.message, variant: "destructive" });
    },
  });

  const reactionMutation = useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      const res = await apiRequest(
        "POST",
        `/api/conversations/${conversationId}/messages/${messageId}/reactions`,
        { emoji }
      );
      return (await res.json()) as { messageId: string; reactions: ConversationMessageWithAuthor["reactions"] };
    },
    onMutate: async ({ messageId, emoji }) => {
      queryClient.setQueryData<ConversationMessagesInfiniteData>(
        conversationMessagesQueryKey(conversationId),
        (old) =>
          updateConversationMessagesList(old, (list) =>
            list.map((m) => {
              if (m.id !== messageId) return m;
              const prev = m.reactions ?? [];
              const existing = prev.find((r) => r.emoji === emoji);
              let next = prev;
              if (existing?.reactedByMe) {
                next = prev
                  .map((r) =>
                    r.emoji === emoji ? { ...r, count: Math.max(0, r.count - 1), reactedByMe: false } : r
                  )
                  .filter((r) => r.count > 0);
              } else if (existing) {
                next = prev.map((r) =>
                  r.emoji === emoji ? { ...r, count: r.count + 1, reactedByMe: true } : r
                );
              } else {
                next = [...prev, { emoji, count: 1, reactedByMe: true }];
              }
              return { ...m, reactions: next };
            })
          )
      );
    },
    onSuccess: ({ messageId, reactions }) => {
      queryClient.setQueryData<ConversationMessagesInfiniteData>(
        conversationMessagesQueryKey(conversationId),
        (old) =>
          updateConversationMessagesList(old, (list) =>
            list.map((m) => (m.id === messageId ? { ...m, reactions: reactions ?? [] } : m))
          )
      );
    },
  });

  const filteredForwardChats = useMemo(() => {
    if (!forwardChats) return [];
    const q = forwardSearch.trim().toLowerCase();
    const allowedChats = forwardChats.filter((chat) => {
      if (chat.type === "channel") {
        return chat.myRole === "owner" || chat.myRole === "admin";
      }
      if (chat.type === "group") return true;
      return chat.type === "direct" || chat.type === "patient";
    });
    if (!q) return allowedChats;
    return allowedChats.filter((chat) => {
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

  const { uploadFile: uploadVoiceFile, isUploading: isUploadingVoice } = useUpload({
    onError: (error) => {
      toast({ title: t.error, description: error.message, variant: "destructive" });
    },
  });

  const handleSendVoice = async (clip: RecordedVoice) => {
    if (!canPostToChannel) return;
    const file = new File([clip.blob], `voice-${Date.now()}.${clip.ext}`, {
      type: clip.mimeType,
    });
    const uploaded = await uploadVoiceFile(file);
    if (!uploaded) return;
    await sendMutation.mutateAsync({
      imageUrl: uploaded.objectPath,
      messageType: "voice",
      voiceDurationSec: clip.durationSec,
      replyToMessageId: replyTo?.id,
    });
  };

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

  // Keep the latest messages visible while the iOS keyboard and composer resize.
  useEffect(() => {
    const shouldStickToBottom = () =>
      !!document.activeElement?.closest(".chat-composer-panel");

    const onViewportResize = () => {
      if (!shouldStickToBottom()) return;
      scrollMessagesForKeyboard();
    };

    const onComposerInset = () => {
      if (!shouldStickToBottom()) return;
      scrollMessagesForKeyboard();
    };

    const vv = window.visualViewport;
    vv?.addEventListener("resize", onViewportResize);
    window.addEventListener(CHAT_COMPOSER_INSET_EVENT, onComposerInset);
    return () => {
      vv?.removeEventListener("resize", onViewportResize);
      window.removeEventListener(CHAT_COMPOSER_INSET_EVENT, onComposerInset);
    };
  }, [conversationId, scrollMessagesForKeyboard]);

  useEffect(() => {
    setHideSubscribeButton(false);
    setHideJoinButton(false);
  }, [conversationId]);

  const handleSend = () => {
    if (!canPostToChannel) return;
    if (editing) {
      const text = editText.trim();
      if (!text) return;
      editMutation.mutate({ messageId: editing.id, content: text });
      return;
    }
    if (!message.trim()) return;
    sendMutation.mutate({
      content: message.trim(),
      messageType: messageMode,
      replyToMessageId: replyTo?.id,
    });
    if (messageMode !== "message") setMessageMode("message");
  };

  const handleUploadImages = async (files: File[]) => {
    if (!canPostToChannel) return;
    for (const file of files) {
      const normalizedFile = await normalizeChatImageFile(file);
      await uploadFile(normalizedFile);
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

  const sortedMessages = useMemo(() => messages, [messages]);

  const isPatientConv = conv?.type === "patient";
  const displayMessages = useMemo(() => {
    const visible = sortedMessages.filter(
      (m) => !m.deletedAt || shouldShowDeletedMessagePlaque(m.deletedAt)
    );
    if (!isPatientConv || user?.isAdmin) return visible;
    return visible.filter((m) => m.messageType !== "followup");
  }, [sortedMessages, isPatientConv, user?.isAdmin]);

  useEffect(() => {
    deepLinkFetchAttemptsRef.current = 0;
    deepLinkHandledRef.current = null;
    stickToBottomRef.current = true;
    userHasScrolledRef.current = false;
    needsInitialPinRef.current = true;
    setCanLoadOlderMessages(false);
  }, [conversationId]);

  const pinToBottomIfNeeded = useCallback(() => {
    if (new URLSearchParams(window.location.search).get("messageId")) return;

    if (!stickToBottomRef.current) return;
    if (Date.now() < suppressAutoScrollUntilRef.current) return;

    const root = messagesScrollRef.current;
    if (!root) return;

    const inlinePayment = inlineContentPaymentRef.current;
    if (inlinePayment) {
      scrollToInlinePayment(inlinePayment);
      return;
    }

    ignoreScrollRef.current = true;
    anchorChatToBottom(root);
    requestAnimationFrame(() => {
      anchorChatToBottom(root);
      ignoreScrollRef.current = false;
      stickToBottomRef.current = isChatScrolledToBottom(root);
    });
  }, [scrollToInlinePayment]);

  const isDeepLinkPending = useCallback(() => {
    const messageId = new URLSearchParams(window.location.search).get("messageId");
    if (!messageId) return false;
    const key = `${conversationId}:${messageId}`;
    return deepLinkHandledRef.current !== key;
  }, [conversationId]);

  useEffect(() => {
    if (convLoading || !conv) return;
    const root = messagesScrollRef.current;
    const sentinel = loadOlderRef.current;
    if (!root || !sentinel || !hasNextPage || isFetchingNextPage) return;
    if (isDeepLinkPending()) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        if (isDeepLinkPending()) return;
        if (!userHasScrolledRef.current) return;
        if (root.scrollTop > LOAD_OLDER_NEAR_TOP_PX) return;
        pendingScrollRestoreRef.current = {
          height: root.scrollHeight,
          top: root.scrollTop,
        };
        stickToBottomRef.current = false;
        void fetchNextPage();
      },
      { root, threshold: 0.1 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [convLoading, conv, hasNextPage, isFetchingNextPage, fetchNextPage, sortedMessages.length, isDeepLinkPending]);

  useLayoutEffect(() => {
    if (isDeepLinkPending()) return;
    const restore = pendingScrollRestoreRef.current;
    if (!restore || isFetchingNextPage) return;
    const root = messagesScrollRef.current;
    if (!root) return;
    const applyRestore = () => {
      const pending = pendingScrollRestoreRef.current;
      if (!pending) return;
      const newHeight = root.scrollHeight;
      root.scrollTop = pending.top + (newHeight - pending.height);
      pendingScrollRestoreRef.current = null;
      stickToBottomRef.current = isChatScrolledToBottom(root);
    };
    applyRestore();
    requestAnimationFrame(() => {
      applyRestore();
      requestAnimationFrame(applyRestore);
    });
  }, [sortedMessages.length, isFetchingNextPage, isDeepLinkPending]);

  useEffect(() => {
    const messageId = new URLSearchParams(window.location.search).get("messageId");
    if (!messageId || displayMessages.length === 0) return;
    if (displayMessages.some((msg) => msg.id === messageId)) return;
    if (!hasNextPage || isFetchingNextPage) return;
    if (deepLinkFetchAttemptsRef.current >= 5) return;
    deepLinkFetchAttemptsRef.current += 1;
    void fetchNextPage();
  }, [displayMessages.length, hasNextPage, isFetchingNextPage, fetchNextPage, conversationId]);

  useLayoutEffect(() => {
    if (convLoading || !conv || messagesLoading || displayMessages.length === 0) return;
    if (!needsInitialPinRef.current) return;
    needsInitialPinRef.current = false;
    pinToBottomIfNeeded();
  }, [convLoading, conv, messagesLoading, displayMessages.length, conversationId, pinToBottomIfNeeded]);

  useEffect(() => {
    if (convLoading || !conv || messagesLoading || displayMessages.length === 0) return;

    const root = messagesScrollRef.current;
    const contentEl = messagesContentRef.current;
    if (!root || !contentEl) return;

    const ro = new ResizeObserver(() => {
      if (!stickToBottomRef.current) return;
      pinToBottomIfNeeded();
    });
    ro.observe(contentEl);

    const onComposerInset = () => {
      if (!stickToBottomRef.current) return;
      pinToBottomIfNeeded();
    };
    window.addEventListener(CHAT_COMPOSER_INSET_EVENT, onComposerInset);

    return () => {
      ro.disconnect();
      window.removeEventListener(CHAT_COMPOSER_INSET_EVENT, onComposerInset);
    };
  }, [
    convLoading,
    conv,
    conversationId,
    messagesLoading,
    displayMessages.length,
    pinToBottomIfNeeded,
  ]);

  useEffect(() => {
    if (convLoading || !conv) return;
    const root = messagesScrollRef.current;
    if (!root) return;

    const onScroll = () => {
      if (ignoreScrollRef.current) return;
      userHasScrolledRef.current = true;
      const atBottom = isChatScrolledToBottom(root);
      stickToBottomRef.current = atBottom;
      if (pendingScrollRestoreRef.current) return;
      if (root.scrollTop <= LOAD_OLDER_NEAR_TOP_PX) {
        setCanLoadOlderMessages(true);
      }
    };

    root.addEventListener("scroll", onScroll, { passive: true });
    return () => root.removeEventListener("scroll", onScroll);
  }, [conversationId, convLoading, conv]);

  useLayoutEffect(() => {
    if (scrollToBottomTick === 0) return;
    stickToBottomRef.current = true;
    const root = messagesScrollRef.current;
    if (!root) return;
    anchorChatToBottom(root);
    scrollChatPaneToBottomForKeyboard(root);
  }, [scrollToBottomTick]);

  const chatSearchMatches = useMemo(() => {
    const q = chatSearchQuery.trim().toLowerCase();
    if (!q) return [];
    return displayMessages.filter(
      (m) => !m.deletedAt && m.content?.toLowerCase().includes(q)
    );
  }, [displayMessages, chatSearchQuery]);

  const closeChatSearch = useCallback(() => {
    setIsChatSearchOpen(false);
    setChatSearchQuery("");
    setChatSearchMatchIndex(0);
  }, []);

  const openChatSearch = useCallback((initialQuery = "") => {
    if (!canUseChatSearch) return;
    setIsChatSearchOpen(true);
    setChatSearchQuery(initialQuery);
    setChatSearchMatchIndex(0);
    window.setTimeout(() => chatSearchInputRef.current?.focus(), 50);
  }, [canUseChatSearch]);

  const handleTagClick = useCallback(
    (tag: string) => {
      openChatSearch(tag);
    },
    [openChatSearch]
  );

  const goToChatSearchMatch = useCallback(
    (delta: number) => {
      if (chatSearchMatches.length === 0) return;
      setChatSearchMatchIndex((prev) => {
        const next = prev + delta;
        if (next < 0) return chatSearchMatches.length - 1;
        if (next >= chatSearchMatches.length) return 0;
        return next;
      });
    },
    [chatSearchMatches.length]
  );

  useEffect(() => {
    setChatSearchMatchIndex(0);
  }, [chatSearchQuery]);

  useEffect(() => {
    if (!isChatSearchOpen || !chatSearchQuery.trim() || chatSearchMatches.length === 0) return;
    const idx = Math.min(chatSearchMatchIndex, chatSearchMatches.length - 1);
    const matchId = chatSearchMatches[idx]?.id;
    if (!matchId) return;
    scrollToMessage(matchId);
  }, [isChatSearchOpen, chatSearchQuery, chatSearchMatchIndex, chatSearchMatches, scrollToMessage]);

  useEffect(() => {
    if (!isChatSearchOpen) return;
    window.setTimeout(() => chatSearchInputRef.current?.focus(), 50);
  }, [isChatSearchOpen]);

  useEffect(() => {
    const messageId = new URLSearchParams(window.location.search).get("messageId");
    if (!messageId) return;
    if (!displayMessages.some((msg) => msg.id === messageId)) return;
    const key = `${conversationId}:${messageId}`;
    if (deepLinkHandledRef.current === key) return;
    stickToBottomRef.current = false;
    scrollToMessage(messageId, {
      onScrolled: () => {
        deepLinkHandledRef.current = key;
      },
    });
  }, [conversationId, displayMessages.length, scrollToMessage]);

  const galleryImages = useMemo(
    () =>
      sortedMessages
        .filter((m) => m.imageUrl && !m.deletedAt && m.messageType !== "voice")
        .map((m) => m.imageUrl!),
    [sortedMessages]
  );

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

  const title =
    conv.name ??
    (conv.type === "direct" ? t.chatWithDoctor : conv.type === "patient" ? t.patient : conv.type);
  const peerParticipant =
    conv.type === "direct" || conv.type === "patient"
      ? conv.participants?.find((p) => p.userId !== user?.id)
      : undefined;
  const directDisplayName = conv.type === "direct" || conv.type === "patient"
    ? [peerParticipant?.user?.firstName, peerParticipant?.user?.lastName].filter(Boolean).join(" ").trim() ||
      peerParticipant?.user?.email?.split("@")[0] ||
      t.chatWithDoctor
    : title;
  const chatName = conv.myDisplayName?.trim() || conv.name?.trim() || null;
  const headerTitle = isPatientConv
    ? chatName || t.patient
    : conv.type === "direct"
      ? directDisplayName
      : title;
  const headerAvatarUrl = isPatientConv
    ? (conv.avatarUrl ?? null)
    : conv.type === "direct"
      ? (peerParticipant?.user?.profileImageUrl ?? null)
      : (conv.avatarUrl ?? null);
  const directProfileUserId =
    conv.type === "direct" ? peerParticipant?.userId : undefined;
  const handleHeaderProfileClick = () => {
    if (guestPreviewMode) {
      redirectGuestToAuth();
      return;
    }
    if (conv.type === "patient") {
      onTitleClick?.();
      return;
    }
    if (conv.type === "direct" && directProfileUserId) {
      setLocation(messengerProfilePath(directProfileUserId, location));
      return;
    }
    onTitleClick?.();
  };
  const canClickHeader =
    guestPreviewMode ||
    (conv.type === "patient" ? !!onTitleClick : !!directProfileUserId || !!onTitleClick);
  const headerInitials = directDisplayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";

  const showMessageAuthorName = conv.type !== "direct";
  const showReceiptIcons = conv.type === "direct" || conv.type === "patient";
  const peerLastReadAt =
    conv.type === "direct" || conv.type === "patient"
      ? (peerParticipant?.lastSeenAt ?? null)
      : null;
  const myRole = myChannelRole;
  const isOwner = myRole === "owner";
  const isChannelMemberReadOnly = conv.type === "channel" && myRole === "member";
  const isChannelReadOnly = conv.type === "channel" && !myRole;
  const isGroupReadOnly = conv.type === "group" && !myRole;
  const showGuestAction = guestPreviewMode
    ? conv.type === "channel"
    : isChannelReadOnly || isGroupReadOnly;
  const showChannelComposer = !isChannelMemberReadOnly;
  const participantIds = new Set((conv.participants ?? []).map((p) => p.userId));
  const candidates = (doctorSearchData?.doctors ?? []).filter((d) => !participantIds.has(d.userId));

  const startReply = (msg: ConversationMessageWithAuthor) => {
    if (!canReplyToChannel) return;
    setEditing(null);
    setReplyTo(msg);
    chatInputRef.current?.focusInput();
  };

  const startEdit = (msg: ConversationMessageWithAuthor) => {
    if (!canInteractWithChannel) return;
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
    const poll = msg.messageType === "poll" ? parsePollPayload(msg.content) : null;
    const text = poll?.question ?? msg.content;
    if (!text?.trim()) return;
    try {
      await navigator.clipboard.writeText(text.trim());
    } catch {
      // ignore
    }
  };

  const clearLongPress = () => clearMessageLongPress(longPressRefs.current);

  const openMessageLayer = (msg: ConversationMessageWithAuthor, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    setMessageLayer({
      message: msg,
      rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
    });
  };

  const handleBubbleContextMenu = (
    e: React.MouseEvent<HTMLElement>,
    msg: ConversationMessageWithAuthor
  ) => {
    if (msg.deletedAt || !canInteractWithChannel) return;
    e.preventDefault();
    openMessageLayer(msg, e.currentTarget);
  };

  const handleBubblePointerDown = (
    e: React.PointerEvent<HTMLElement>,
    msg: ConversationMessageWithAuthor
  ) => {
    if (msg.deletedAt || !canInteractWithChannel) return;
    const targetEl = e.currentTarget;
    handleMessagePointerDown(
      e,
      longPressRefs.current,
      () => openMessageLayer(msg, targetEl),
      true
    );
  };

  const handleBubbleTouchStart = (
    e: React.TouchEvent<HTMLElement>,
    msg: ConversationMessageWithAuthor
  ) => {
    if (msg.deletedAt || !canInteractWithChannel) return;
    const targetEl = e.currentTarget;
    handleMessageTouchStart(
      e,
      longPressRefs.current,
      () => openMessageLayer(msg, targetEl),
      true
    );
  };

  const handleBubbleTouchMove = (e: React.TouchEvent<HTMLElement>) => {
    handleMessageTouchMove(e, longPressRefs.current);
  };

  const handleBubblePointerMove = (e: React.PointerEvent<HTMLElement>) => {
    handleMessagePointerMove(e, longPressRefs.current);
  };

  const renderMessageActionItems = (msg: ConversationMessageWithAuthor, onDone?: () => void) => {
    if (msg.deletedAt || !canInteractWithChannel) return null;
    const isOwn = msg.authorUserId === user?.id;
    const createdAt = new Date(msg.createdAt).getTime();
    const withinEditWindow = Date.now() - createdAt < EDIT_WINDOW_MS;
    const canEdit =
      isOwn &&
      !!msg.content &&
      msg.messageType !== "poll" &&
      msg.messageType !== "voice" &&
      (conv.type === "channel" || withinEditWindow);
    const canDelete = isOwn || isOwner;
    const isPinned = !!msg.pinnedAt;
    const routeType =
      conv.type === "group" || conv.type === "channel"
        ? conv.type
        : conv.type === "patient"
          ? "chat"
          : "direct";
    const messageLink =
      typeof window !== "undefined"
        ? `${window.location.origin}/messenger/${routeType}/${conversationId}?messageId=${msg.id}`
        : "";

    return (
      <>
          {canReplyToChannel && (
            <button className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted" onClick={() => { startReply(msg); onDone?.(); }}>
              <Reply className="mr-2 h-4 w-4" />
              {t.messageActionReply}
            </button>
          )}
          <button className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted" onClick={() => { setForwarding(msg); onDone?.(); }}>
            <ForwardIcon className="mr-2 h-4 w-4" />
            {t.messageActionForward}
          </button>
          <button
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
            onClick={() => {
              pinMutation.mutate({ messageId: msg.id, pin: !isPinned });
              onDone?.();
            }}
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
          </button>
          {((msg.content && msg.messageType !== "voice") || msg.messageType === "poll") && (
            <button className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted" onClick={() => { void copyMessageContent(msg); onDone?.(); }}>
              <Copy className="mr-2 h-4 w-4" />
              {t.messageActionCopy}
            </button>
          )}
          {conv.type !== "direct" && (
            <button
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
              onClick={async () => {
                if (!messageLink) return;
                await navigator.clipboard.writeText(messageLink);
                onDone?.();
              }}
            >
              <Link2 className="mr-2 h-4 w-4" />
              Копировать ссылку
            </button>
          )}
          {(canEdit || canDelete) && <div className="my-1 h-px bg-border" />}
          {canEdit && (
            <button className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted" onClick={() => { startEdit(msg); onDone?.(); }}>
              <Pencil className="mr-2 h-4 w-4" />
              {t.messageActionEdit}
            </button>
          )}
          {canDelete && (
            <button
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-destructive hover:bg-muted"
              onClick={() => { setPendingDelete(msg); onDone?.(); }}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {t.messageActionDelete}
            </button>
          )}
      </>
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
          : "border-primary/70 bg-stone-50 dark:bg-stone-900/80"
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

  const renderReactionPills = (msg: ConversationMessageWithAuthor) => {
    if (!msg.reactions || msg.reactions.length === 0) return null;
    return (
      <div className="flex flex-wrap gap-1">
        {msg.reactions.map((reaction) => (
          <button
            key={reaction.emoji}
            type="button"
            onClick={() => {
              if (!canInteractWithChannel) return;
              reactionMutation.mutate({ messageId: msg.id, emoji: reaction.emoji });
            }}
            className={`px-1.5 py-0 text-sm leading-none ${
              reaction.reactedByMe ? "font-semibold" : ""
            }`}
          >
            {reaction.emoji} {reaction.count}
          </button>
        ))}
      </div>
    );
  };

  const openQuestionnaireFromMessage = (msg: ConversationMessageWithAuthor) => {
    if (msg.messageType === "questionnaire") {
      const payload = parseQuestionnaireMessageContent(msg.content);
      if (payload) {
        setOpenQuestionnaireInstanceId(payload.instanceId);
        setOpenQuestionnaireTemplateName(payload.templateName);
      }
      return;
    }
    if (msg.messageType === "questionnaire_template") {
      const payload = parseQuestionnaireTemplateMessageContent(msg.content);
      if (payload?.snapshot) {
        setTemplatePreview({
          templateId: payload.templateId,
          templateName: payload.templateName,
          snapshot: payload.snapshot as { root: import("@shared/questionnaireTypes").QuestionnaireNode[] },
          hintsMode: payload.hintsMode,
        });
      }
    }
  };

  const renderMessageBody = (msg: ConversationMessageWithAuthor, isOwn: boolean) => {
    const sponsorTextPad = msg.hasSponsorContent ? "pr-5" : undefined;

    return (
    <>
      {!isOwn && showMessageAuthorName && (
        <p className="mb-0.5 pr-8 text-[10px] leading-tight text-muted-foreground">
          {getMessageDisplayName(msg.author)}
        </p>
      )}
      {msg.replyTo && renderReplyPreviewInsideBubble(msg.replyTo, isOwn)}
      {renderForwardedHeader(msg)}
      {msg.imageUrl && msg.messageType !== "voice" && (
        <img
          src={getThumbUrl(msg.imageUrl)}
          alt=""
          loading="lazy"
          className="mb-0.5 max-h-48 max-w-full cursor-pointer rounded object-contain transition-opacity hover:opacity-90"
          data-testid={`image-${msg.id}`}
          onClick={() => {
            setMessageLayer(null);
            setSelectedImage(msg.imageUrl!);
          }}
        />
      )}
      {msg.messageType === "voice" ? (
        <VoiceMessagePlayer
          src={msg.imageUrl ?? ""}
          durationSec={parseVoiceDurationSec(msg.content)}
          isOwn={isOwn}
        />
      ) : msg.messageType === "poll" ? (
        <PollMessageBlock
          msg={msg}
          disabled={!!msg.deletedAt || !canInteractWithChannel}
          onVote={(indices) =>
            pollVoteMutation.mutate({ messageId: msg.id, selectedOptionIndices: indices })
          }
          isSubmitting={
            pollVoteMutation.isPending && pollVoteMutation.variables?.messageId === msg.id
          }
        />
      ) : msg.messageType === "questionnaire" || msg.messageType === "questionnaire_template" ? (
        (() => {
          const qPayload =
            msg.messageType === "questionnaire"
              ? parseQuestionnaireMessageContent(msg.content)
              : parseQuestionnaireTemplateMessageContent(msg.content);
          const name = qPayload?.templateName ?? t.questionnaire;
          return (
            <button
              type="button"
              className="mb-1 w-full rounded-md border border-primary/20 bg-primary/5 p-3 text-left transition-colors hover:bg-primary/10"
              onClick={() => openQuestionnaireFromMessage(msg)}
            >
              <Badge variant="secondary" className="mb-1 bg-blue-100 text-xs text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                <ClipboardList className="mr-1 h-3 w-3" />
                {t.questionnaireMessageLabel}
              </Badge>
              <p className="text-sm font-medium">{name}</p>
            </button>
          );
        })()
      ) : (
        <>
          {msg.messageType === "prescription" && (
            <div className="mb-0.5 pr-8">
              <Badge variant="secondary" className="bg-green-100 text-xs text-green-800 dark:bg-green-900 dark:text-green-200">
                <Pill className="mr-1 h-3 w-3" />
                {t.prescription}
              </Badge>
            </div>
          )}
          {msg.messageType === "followup" && (
            <div className="mb-0.5 pr-8">
              <Badge variant="secondary" className="bg-purple-100 text-xs text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                <FileText className="mr-1 h-3 w-3" />
                {t.followup}
              </Badge>
            </div>
          )}
          {msg.content ? (
            conv?.type === "channel" ? (
              (() => {
                const postHasSponsorMarkers =
                  msg.hasSponsorContent || hasSponsorSections(msg.content);
                const hasLockedSponsorContent =
                  channelMonetizationEnabled &&
                  !canViewSponsorContent &&
                  postHasSponsorMarkers;
                const channelCollapseText =
                  canViewSponsorContent && hasSponsorSections(msg.content)
                    ? flattenSponsorMarkersForDisplay(msg.content)
                    : msg.content;

                return (
              <CollapsibleMessageText
                text={hasLockedSponsorContent ? msg.content : channelCollapseText}
                enabled={!hasLockedSponsorContent}
                className={sponsorTextPad}
                onToggleExpand={blockAutoScrollBriefly}
              >
                {(displayText) => (
                  <SponsorAwareMessageText
                    text={displayText}
                    canViewSponsorContent={canViewSponsorContent}
                    monetizationEnabled={channelMonetizationEnabled}
                    isContentTruncated={msg.isContentTruncated}
                    conversationId={conversationId}
                    activePaymentSegmentIndex={
                      inlineContentPayment?.messageId === msg.id
                        ? inlineContentPayment.segmentIndex
                        : null
                    }
                    onPaymentSegmentOpen={(segmentIndex) =>
                      handlePaymentSegmentOpen(msg.id, segmentIndex)
                    }
                    onPaymentFlowClose={() => setInlineContentPayment(null)}
                    onPaymentSegmentRef={setPaymentSegmentRef(msg.id)}
                    onTagClick={handleTagClick}
                    highlightQuery={isChatSearchOpen ? chatSearchQuery.trim() : undefined}
                  />
                )}
              </CollapsibleMessageText>
                );
              })()
            ) : (
              <SponsorAwareMessageText
                text={msg.content}
                className={sponsorTextPad}
                canViewSponsorContent={canViewSponsorContent}
                monetizationEnabled={channelMonetizationEnabled}
                isContentTruncated={msg.isContentTruncated}
                conversationId={conversationId}
                activePaymentSegmentIndex={
                  inlineContentPayment?.messageId === msg.id
                    ? inlineContentPayment.segmentIndex
                    : null
                }
                onPaymentSegmentOpen={(segmentIndex) =>
                  handlePaymentSegmentOpen(msg.id, segmentIndex)
                }
                onPaymentFlowClose={() => setInlineContentPayment(null)}
                onPaymentSegmentRef={setPaymentSegmentRef(msg.id)}
                onTagClick={handleTagClick}
                highlightQuery={isChatSearchOpen ? chatSearchQuery.trim() : undefined}
              />
            )
          ) : null}
        </>
      )}
      {msg.pinnedAt && <Pin className="absolute -left-1 -top-1 h-3.5 w-3.5 text-primary" />}
      <div className="mt-1 flex items-end justify-between gap-2">
        <div className="min-w-0">{renderReactionPills(msg)}</div>
        <span className="flex shrink-0 items-center gap-0.5 select-none text-right tabular-nums text-[10px] leading-none">
          <span className="text-muted-foreground">
            {msg.editedAt && <span className="mr-1 italic">{t.messageEdited}</span>}
            {formatBubbleTime(msg.createdAt)}
          </span>
          {isOwn && showReceiptIcons && (
            <MessageReceiptIcons
              status={getMessageReceiptStatus({
                createdAt: msg.createdAt,
                peerLastReadAt,
              })}
            />
          )}
        </span>
      </div>
    </>
    );
  };

  const isComposerInEditMode = !!editing;
  const composerValue = isComposerInEditMode ? editText : message;
  const handleComposerChange = (v: string) => {
    if (isComposerInEditMode) setEditText(v);
    else {
      setMessage(v);
      if (conversationId) setChatComposerDraft(conversationId, v);
    }
  };
  const isComposerSending = sendMutation.isPending || editMutation.isPending;

  const questionnairePanelOpen = !!openQuestionnaireInstanceId || !!templatePreview;
  const closeQuestionnairePanel = () => {
    setOpenQuestionnaireInstanceId(null);
    setOpenQuestionnaireTemplateName(null);
    setTemplatePreview(null);
  };
  const questionnairePanelTitle = openQuestionnaireInstanceId
    ? openQuestionnaireTemplateName ?? t.questionnaireTitle
    : templatePreview?.templateName ?? t.questionnaireTitle;

  const questionnairePanelHeader = (
    <div className="flex shrink-0 items-center gap-2 border-b px-3 py-3">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="shrink-0"
        onClick={closeQuestionnairePanel}
        aria-label={t.backToHealthWall}
        data-testid="button-questionnaire-panel-back"
      >
        <ArrowLeft className="h-5 w-5" />
      </Button>
      <h2 className="min-w-0 flex-1 truncate text-lg font-semibold">{questionnairePanelTitle}</h2>
    </div>
  );

  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-col md:flex-row">
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="chat-header-panel pointer-events-none absolute inset-x-0 top-0 z-30 flex w-full min-w-0 max-w-full flex-col gap-1.5 px-3">
        {isChatSearchOpen ? (
          <div className="pointer-events-auto flex h-12 min-w-0 items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={chatSearchInputRef}
                value={chatSearchQuery}
                onChange={(e) => setChatSearchQuery(e.target.value)}
                placeholder={t.chatSearchPlaceholder}
                className="h-10 w-full rounded-full border-border bg-card pl-9 pr-9 shadow-sm"
                data-testid="input-chat-search"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    goToChatSearchMatch(e.shiftKey ? -1 : 1);
                  }
                }}
              />
              {chatSearchQuery.length > 0 && (
                <button
                  type="button"
                  aria-label={t.clear}
                  onClick={() => {
                    setChatSearchQuery("");
                    chatSearchInputRef.current?.focus();
                  }}
                  className="absolute right-1 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                  data-testid="button-chat-search-clear"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <Button
              variant="secondary"
              size="icon"
              onClick={closeChatSearch}
              className="h-12 w-12 shrink-0 rounded-full border border-border bg-card text-foreground shadow-sm hover:bg-muted/50"
              aria-label={t.search}
              data-testid="button-chat-search-close"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        ) : (
        <div className="flex h-12 items-center gap-2.5 pointer-events-auto">
          <Button
            variant="secondary"
            size="icon"
            onClick={onBack}
            className={cn(
              "relative h-12 w-12 shrink-0 rounded-full border border-border bg-card text-foreground shadow-sm hover:bg-muted/50",
              user?.isAdmin && "md:hidden",
            )}
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
            <ChatBackUnreadBadge count={inboxUnreadMessages} />
          </Button>
          <button
            type="button"
            onClick={handleHeaderProfileClick}
            disabled={!canClickHeader}
            className={`flex h-12 min-w-0 flex-1 flex-col justify-center rounded-full border border-border bg-card px-4 text-left shadow-sm ${canClickHeader ? "cursor-pointer" : ""}`}
            data-testid="header-pill"
          >
            <p className="truncate text-sm font-semibold leading-tight">{headerTitle}</p>
            {(conv.type === "direct" || conv.type === "patient") && (
              <p className="truncate text-xs leading-tight text-muted-foreground">
                {formatLastSeen(peerParticipant?.lastSeenAt)}
              </p>
            )}
            {conv.type === "channel" && (
              <p className="truncate text-xs leading-tight text-muted-foreground">
                {t.channelHeaderStats(conv.participantCount ?? conv.participants?.length ?? 0)}
              </p>
            )}
          </button>
          {canUseChatSearch && (
          <Button
            variant="secondary"
            size="icon"
            onClick={() => openChatSearch()}
            className="h-12 w-12 shrink-0 rounded-full border border-border bg-card text-foreground shadow-sm hover:bg-muted/50"
            aria-label={t.search}
            data-testid="button-chat-search-open"
          >
            <Search className="h-5 w-5" />
          </Button>
          )}
          <button
            type="button"
            onClick={handleHeaderProfileClick}
            disabled={!canClickHeader}
            className={`h-12 w-12 shrink-0 rounded-full border border-border bg-card p-0 shadow-sm ${canClickHeader ? "cursor-pointer" : ""}`}
            data-testid="button-header-avatar"
          >
            <Avatar className="h-full w-full">
              <AvatarImage src={profileAvatarSrc(headerAvatarUrl, "avatar")} />
              <AvatarFallback className="text-sm font-semibold">{headerInitials}</AvatarFallback>
            </Avatar>
          </button>
        </div>
        )}
        {activePinnedMessage && !isChatSearchOpen && (
          <div className="pointer-events-auto w-full min-w-0 max-w-full overflow-hidden">
            <PinnedMessageBanner
              title={t.messagePinnedTitle}
              preview={
                activePinnedMessage.messageType === "voice"
                  ? t.voiceMessageLabel
                  : activePinnedMessage.messageType === "poll"
                  ? parsePollPayload(activePinnedMessage.content)?.question ?? t.pollLabel
                  : activePinnedMessage.messageType === "questionnaire" ||
                      activePinnedMessage.messageType === "questionnaire_template"
                    ? (parseQuestionnaireMessageContent(activePinnedMessage.content)?.templateName ??
                        parseQuestionnaireTemplateMessageContent(activePinnedMessage.content)?.templateName ??
                        t.questionnaire)
                    : activePinnedMessage.content
                      ? stripMessageFormatting(activePinnedMessage.content)
                      : activePinnedMessage.imageUrl
                        ? t.messagePhotoLabel
                        : t.messageDeleted
              }
              activeIndex={activePinnedIndex}
              totalCount={pinnedMessages.length}
              onClick={handlePinnedBannerClick}
              testId="banner-pinned-message"
            />
          </div>
        )}
        {(() => {
          const vc = voiceCall.call;
          if (!vc) return null;
          if (voiceCall.isInRoom || voiceCall.isConnecting) {
            return (
              <div className="pointer-events-auto w-full min-w-0 max-w-full overflow-hidden">
                <VoiceCallRoom
                  call={vc}
                  currentUserId={user?.id}
                  connectedUserIds={voiceCall.connectedUserIds}
                  speakingUserIds={voiceCall.speakingUserIds}
                  micEnabled={voiceCall.micEnabled}
                  isConnecting={voiceCall.isConnecting}
                  isInitiator={vc.initiatedByUserId === user?.id}
                  onToggleMic={() => voiceCall.toggleMic()}
                  onLeave={() => voiceCall.leaveCall()}
                  onEnd={() => voiceCall.endCall()}
                />
              </div>
            );
          }
          const myStatus = vc.participants.find((p) => p.userId === user?.id)?.status;
          if (myStatus === "declined" || myStatus === "left") return null;
          const initiator = vc.participants.find((p) => p.userId === vc.initiatedByUserId)?.user;
          const initiatorName = initiator
            ? [initiator.firstName, initiator.lastName].filter(Boolean).join(" ").trim() ||
              initiator.email?.split("@")[0] ||
              t.doctor
            : t.doctor;
          return (
            <div className="pointer-events-auto w-full min-w-0 max-w-full overflow-hidden">
              <VoiceCallBanner
                initiatorName={initiatorName}
                isActive={vc.status === "active"}
                onAccept={() => voiceCall.acceptCall()}
                onDecline={() => voiceCall.declineCall()}
              />
            </div>
          );
        })()}
      </div>

      <div
        ref={messagesScrollRef}
        className={cn(
          "chat-messages-pane min-h-0 flex-1 overflow-y-auto px-4",
          activePinnedMessage && !isChatSearchOpen && "chat-messages-pane--pinned",
        )}
      >
        <div ref={messagesContentRef} className="space-y-3">
          {(hasNextPage || isFetchingNextPage) && (
            <div
              ref={loadOlderRef}
              className={cn(
                "flex justify-center",
                canLoadOlderMessages || isFetchingNextPage ? "py-2" : "h-px",
              )}
              aria-hidden={!canLoadOlderMessages && !isFetchingNextPage}
            >
              {canLoadOlderMessages || isFetchingNextPage ? (
                isFetchingNextPage ? (
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                ) : (
                  <span className="text-xs text-muted-foreground">Загрузка…</span>
                )
              ) : null}
            </div>
          )}
          {messagesLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : displayMessages.length > 0 ? (
            displayMessages.map((msg) => {
              const isOwn = msg.authorUserId === user?.id;
              return (
                <ChatMessageBubble
                  key={msg.id}
                  msg={msg}
                  isOwn={isOwn}
                  isChannel={conv.type === "channel"}
                  canInteractWithChannel={guestPreviewMode || canInteractWithChannel}
                  showReceiptIcons={showReceiptIcons}
                  peerLastReadAt={peerLastReadAt}
                  onCommentsClick={() =>
                    guestPreviewMode
                      ? redirectGuestToAuth()
                      : setLocation(`/messenger/channel/${conversationId}/post/${msg.id}/comments`)
                  }
                  setMessageRef={setMessageRef}
                  onContextMenu={handleBubbleContextMenu}
                  onPointerDown={handleBubblePointerDown}
                  onPointerMove={handleBubblePointerMove}
                  onPointerUp={clearLongPress}
                  onPointerCancel={clearLongPress}
                  onPointerLeave={clearLongPress}
                  onTouchStart={handleBubbleTouchStart}
                  onTouchMove={handleBubbleTouchMove}
                  onTouchEnd={clearLongPress}
                  onTouchCancel={clearLongPress}
                  formatBubbleTime={formatBubbleTime}
                  highlightQuery={isChatSearchOpen ? chatSearchQuery.trim() : undefined}
                  inlinePaymentSegmentIndex={
                    inlineContentPayment?.messageId === msg.id
                      ? inlineContentPayment.segmentIndex
                      : null
                  }
                >
                  {renderMessageBody(msg, isOwn)}
                </ChatMessageBubble>
              );
            })
          ) : (
            <p className="text-center text-muted-foreground py-8">{t.noMessages}</p>
          )}
          <div ref={messagesEndRef} />
        </div>
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
                aria-label="Close message actions"
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
                );
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
                              if (!canInteractWithChannel) return;
                              reactionMutation.mutate({ messageId: messageLayer.message.id, emoji });
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
                      {renderMessageBody(
                        messageLayer.message,
                        messageLayer.message.authorUserId === user?.id
                      )}
                    </div>
                    <div
                      className="absolute w-[280px] rounded-xl border border-border bg-background p-2 shadow-2xl animate-in fade-in slide-in-from-top-1 duration-200"
                      style={{ top: menuTop, left: Math.max(12, Math.min(left, vw - menuWidth - 12)) }}
                    >
                      {renderMessageActionItems(messageLayer.message, () => setMessageLayer(null))}
                    </div>
                  </>
                );
              })()}
            </>
          )}
        </DialogContent>
      </Dialog>

      {showChannelComposer && (
      <div className="chat-composer-panel absolute inset-x-0 bottom-0 z-20 bg-transparent px-4 pt-2 space-y-2">
          {!isChatSearchOpen && !showGuestAction && (replyTo || editing) && (
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
                    ? editing.messageType === "poll"
                      ? parsePollPayload(editing.content)?.question ?? t.pollLabel
                      : editing.content
                        ? stripMessageFormatting(editing.content)
                        : ""
                    : replyTo
                      ? replyTo.messageType === "voice"
                        ? t.voiceMessageLabel
                        : replyTo.messageType === "poll"
                        ? parsePollPayload(replyTo.content)?.question ?? t.pollLabel
                        : replyTo.content
                          ? stripMessageFormatting(replyTo.content)
                          : replyTo.imageUrl
                            ? t.messagePhotoLabel
                            : ""
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

          {showGuestAction ? (
            isChannelReadOnly && !hideSubscribeButton ? (
              <Button
                type="button"
                className="w-full"
                onClick={() =>
                  guestPreviewMode ? redirectGuestToAuth() : subscribeMutation.mutate()
                }
                disabled={!guestPreviewMode && subscribeMutation.isPending}
              >
                {!guestPreviewMode && subscribeMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t.actionSubscribe}
                  </>
                ) : (
                  t.subscribeToChannel
                )}
              </Button>
            ) : isGroupReadOnly && !hideJoinButton ? (
              <Button
                type="button"
                className="w-full"
                onClick={() => joinGroupMutation.mutate()}
                disabled={joinGroupMutation.isPending}
              >
                {joinGroupMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t.actionJoinGroup}
                  </>
                ) : (
                  t.joinGroup
                )}
              </Button>
            ) : null
          ) : (
            <div className="pt-1">
              {isChatSearchOpen ? (
                chatSearchQuery.trim() ? (
                <div className="border-0 px-0 py-0">
                  <div className="flex items-end gap-2">
                    <div
                      className="flex h-10 w-fit shrink-0 items-center gap-1.5 rounded-[22px] bg-background/90 px-3 text-sm font-medium shadow-sm backdrop-blur-md"
                      data-testid="text-chat-search-count"
                    >
                      <ListOrdered className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="whitespace-nowrap tabular-nums leading-none">
                        {chatSearchMatches.length > 0
                          ? `${chatSearchMatchIndex + 1} ${t.chatSearchOf} ${chatSearchMatches.length}`
                          : t.chatSearchFoundNone}
                      </span>
                    </div>
                    <div className="ml-auto flex shrink-0 items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => goToChatSearchMatch(-1)}
                      disabled={chatSearchMatches.length === 0}
                      className="h-10 w-10 shrink-0 rounded-full border-border bg-[#e8ecf1] text-[#28292c] hover:bg-muted/80 [&_svg]:!size-4"
                      aria-label={t.search}
                      data-testid="button-chat-search-prev"
                    >
                      <ChevronUp className="stroke-[2.5]" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => goToChatSearchMatch(1)}
                      disabled={chatSearchMatches.length === 0}
                      className="h-10 w-10 shrink-0 rounded-full border-border bg-[#e8ecf1] text-[#28292c] hover:bg-muted/80 [&_svg]:!size-4"
                      aria-label={t.search}
                      data-testid="button-chat-search-next"
                    >
                      <ChevronDown className="stroke-[2.5]" />
                    </Button>
                    </div>
                  </div>
                </div>
                ) : null
              ) : (
              <ChatInputBar
                ref={chatInputRef}
                value={composerValue}
                placeholder={editing ? t.messageEditingTitle : t.writeMessage}
                onChange={handleComposerChange}
                onSend={handleSend}
                isSending={isComposerSending}
                disabled={!canPostToChannel}
                onUploadImages={editing || !canPostToChannel ? undefined : handleUploadImages}
                isUploadingImages={isUploadingPhoto}
                onSendVoice={editing || !canPostToChannel ? undefined : handleSendVoice}
                isSendingVoice={isUploadingVoice || sendMutation.isPending}
                wrapperClassName="border-0 px-0 py-0"
                showQuestionnaireAttach={!!user?.isAdmin && !editing && canPostToChannel}
                onSendQuestionnaire={
                  user?.isAdmin && !editing && canPostToChannel
                    ? () => setQuestionnairePickerOpen(true)
                    : undefined
                }
                onCreatePoll={
                  !editing && canPostToChannel && !isPatientConv
                    ? () => setPollDialogOpen(true)
                    : undefined
                }
                onStartVoiceCall={
                  !editing && canPostToChannel && conv.type !== "channel" && !voiceCall.call
                    ? () => voiceCall.startCall()
                    : undefined
                }
                showSponsorFormat={conv.type === "channel" && channelMonetizationEnabled && canPostToChannel}
                showMessageModeSelector={isPatientConv && !!user?.isAdmin && !editing}
                messageMode={messageMode}
                onMessageModeChange={setMessageMode}
                onInputFocus={scrollMessagesForKeyboard}
              />
              )}
            </div>
          )}
        </div>
      )}

      </div>

      {!isMobile && questionnairePanelOpen && (
        <aside className="flex h-full min-h-0 w-full shrink-0 flex-col border-l border-border bg-background md:w-[min(32rem,45%)] md:max-w-lg">
          {questionnairePanelHeader}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {openQuestionnaireInstanceId && (
              <DynamicQuestionnaireForm hideTitle mode="instance" instanceId={openQuestionnaireInstanceId} />
            )}
            {templatePreview && !openQuestionnaireInstanceId && (
              <DynamicQuestionnaireForm
                hideTitle
                mode="preview"
                structure={templatePreview.snapshot}
                templateName={templatePreview.templateName}
                templateId={templatePreview.templateId}
                hintsMode={templatePreview.hintsMode}
                onCopy={() => copyTemplateMutation.mutate(templatePreview.templateId)}
                isCopying={copyTemplateMutation.isPending}
              />
            )}
          </div>
        </aside>
      )}

      <Dialog open={pollDialogOpen} onOpenChange={setPollDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t.pollCreateTitle}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor="poll-q">{t.pollQuestionLabel}</Label>
              <Input
                id="poll-q"
                value={pollQuestion}
                onChange={(e) => setPollQuestion(e.target.value)}
                placeholder={t.pollQuestionLabel}
              />
            </div>
            <div className="space-y-2">
              <Label>{t.pollOptionsLabel}</Label>
              {pollOptions.map((opt, i) => (
                <Input
                  key={i}
                  value={opt}
                  onChange={(e) => {
                    const next = [...pollOptions];
                    next[i] = e.target.value;
                    setPollOptions(next);
                  }}
                  placeholder={`${t.pollOptionsLabel} ${i + 1}`}
                />
              ))}
              {pollOptions.length < 10 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPollOptions([...pollOptions, ""])}
                >
                  {t.pollAddOption}
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="poll-multi"
                checked={pollAllowMultiple}
                onCheckedChange={setPollAllowMultiple}
              />
              <Label htmlFor="poll-multi" className="cursor-pointer">
                {t.pollAllowMultiple}
              </Label>
            </div>
            <Button
              type="button"
              className="w-full"
              disabled={sendMutation.isPending}
              onClick={() => {
                const opts = pollOptions.map((o) => o.trim()).filter(Boolean);
                const parsed = pollPayloadSchema.safeParse({
                  question: pollQuestion,
                  options: opts,
                  allowMultiple: pollAllowMultiple,
                });
                if (!parsed.success) {
                  toast({
                    title: t.error,
                    description: "Укажите вопрос и минимум два варианта.",
                    variant: "destructive",
                  });
                  return;
                }
                sendMutation.mutate({
                  poll: parsed.data,
                  replyToMessageId: replyTo?.id,
                });
              }}
            >
              {t.pollSend}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
                        <AvatarImage src={profileAvatarSrc(chat.avatarUrl, "avatar")} />
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

      <ImageViewerDialog
        open={!!selectedImage}
        imageUrl={selectedImage}
        hasMultiple={galleryImages.length > 1}
        onClose={() => setSelectedImage(null)}
        onPrevious={goToPrevGalleryImage}
        onNext={goToNextGalleryImage}
      />

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

      <Dialog open={questionnairePickerOpen} onOpenChange={setQuestionnairePickerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.selectQuestionnaireToSend}</DialogTitle>
          </DialogHeader>
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {myQuestionnaireTemplates.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.noDataAvailable}</p>
            ) : (
              myQuestionnaireTemplates.map((tpl) => (
                <Button
                  key={tpl.id}
                  variant="outline"
                  className="w-full justify-start"
                  disabled={sendQuestionnaireMutation.isPending}
                  onClick={() => sendQuestionnaireMutation.mutate(tpl.id)}
                >
                  {tpl.name}
                </Button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {isMobile && (
        <Sheet open={questionnairePanelOpen} onOpenChange={(open) => !open && closeQuestionnairePanel()}>
          <SheetContent side="right" hideCloseButton className="flex w-full flex-col p-0 sm:max-w-lg">
            {questionnairePanelHeader}
            <div className="min-h-0 flex-1 overflow-y-auto">
              {openQuestionnaireInstanceId && (
                <DynamicQuestionnaireForm hideTitle mode="instance" instanceId={openQuestionnaireInstanceId} />
              )}
              {templatePreview && !openQuestionnaireInstanceId && (
                <DynamicQuestionnaireForm
                  hideTitle
                  mode="preview"
                  structure={templatePreview.snapshot}
                  templateName={templatePreview.templateName}
                  templateId={templatePreview.templateId}
                  hintsMode={templatePreview.hintsMode}
                  onCopy={() => copyTemplateMutation.mutate(templatePreview.templateId)}
                  isCopying={copyTemplateMutation.isPending}
                />
              )}
            </div>
          </SheetContent>
        </Sheet>
      )}

    </div>
  );
}
