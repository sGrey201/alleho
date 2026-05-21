import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { t } from "@/lib/i18n";
import {
  Loader2,
  Send,
  FileText,
  Image,
  ArrowLeft,
  Pill,
  X,
  GripVertical,
  UserPlus,
  Trash2,
  MessageCircle,
  Menu,
  Copy,
  Share2,
  Reply,
  Pencil,
  Forward as ForwardIcon,
  Pin,
  PinOff,
  Check,
} from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import { ru } from "date-fns/locale";
import { useUpload } from "@/hooks/use-upload";
import { useHealthWallWs } from "@/hooks/useHealthWallWs";
import QuestionnairePanel from "@/components/QuestionnairePanel";
import { syncChatTextareaHeight } from "@/lib/chatTextareaAutosize";
import { scrollChatPaneToBottom } from "@/lib/chatScroll";
import { cn } from "@/lib/utils";

interface Author {
  id: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  isAdmin?: boolean | null;
}

interface HealthWallReplyTo {
  id: string;
  authorUserId: string;
  content?: string | null;
  imageUrl?: string | null;
  deletedAt?: string | null;
  author?: Author | null;
}

interface HealthWallMessage {
  id: string;
  patientUserId: string;
  authorUserId: string;
  messageType: 'message' | 'prescription' | 'followup';
  content?: string | null;
  imageUrl?: string | null;
  createdAt: string;
  editedAt?: string | null;
  deletedAt?: string | null;
  pinnedAt?: string | null;
  pinnedByUserId?: string | null;
  replyToMessageId?: string | null;
  forwardedFromMessageId?: string | null;
  forwardedFromUserId?: string | null;
  replyTo?: HealthWallReplyTo | null;
  forwardedFromAuthor?: Author | null;
  reactions?: Array<{ emoji: string; count: number; reactedByMe: boolean }>;
  author: Author;
}

interface PatientInfo {
  id: string;
  email?: string;
  patientName?: string;
  profileImageUrl?: string | null;
  birthMonth?: number;
  birthYear?: number;
  gender?: string;
  patientLastVisitedAt?: string;
}

interface ConnectedDoctor {
  id: string;
  doctorUserId: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  createdAt: string;
  lastVisitedAt?: string;
}

interface MyPatientListItem {
  id: string;
  patientUserId: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  unreadCount?: number;
  lastMessageAt?: string;
}

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

const STORAGE_KEY_DIVIDER = 'healthwall-divider-position';
const STORAGE_KEY_PANEL = 'healthwall-panel-open';
const MIN_PANEL_PERCENT = 33;

function formatDoctorLastVisit(lastVisitedAt?: string): string {
  if (!lastVisitedAt) {
    return t.neverVisited;
  }
  
  const date = new Date(lastVisitedAt);
  const time = format(date, 'HH:mm');
  
  if (isToday(date)) {
    return `${t.wasOnlineToday} ${time}`;
  }
  
  if (isYesterday(date)) {
    return `${t.wasOnlineYesterday} ${time}`;
  }
  
  const dateStr = format(date, 'dd.MM.yyyy', { locale: ru });
  return `${t.wasOnlineAt} ${dateStr} в ${time}`;
}
const MAX_PANEL_PERCENT = 66;
const DEFAULT_PANEL_PERCENT = 50;
const EDIT_WINDOW_MS = 48 * 60 * 60 * 1000;
const QUICK_REACTIONS = ["👍", "❤️", "🔥", "😂", "🙏", "😢"] as const;

/** Thumbnail URL for chat list; full image loads only when user clicks to enlarge. */
function getThumbUrl(url: string): string {
  return url + (url.includes("?") ? "&" : "?") + "size=thumb";
}

function getAuthorName(author: Author | null | undefined): string {
  if (!author) return "User";
  if (author.firstName && author.lastName) return `${author.firstName} ${author.lastName}`;
  if (author.firstName) return author.firstName;
  if (author.email) return author.email.split("@")[0];
  return "User";
}

function getReplySnippet(reply: HealthWallReplyTo): string {
  if (reply.deletedAt) return t.messageDeleted;
  if (reply.content?.trim()) {
    const text = reply.content.trim();
    return text.length > 80 ? `${text.slice(0, 80)}…` : text;
  }
  if (reply.imageUrl) return t.messagePhotoLabel;
  return t.messageDeleted;
}

function QuestionnaireViewModeSegment({
  mode,
  onChange,
}: {
  mode: "edit" | "view";
  onChange: (m: "edit" | "view") => void;
}) {
  return (
    <div
      className="flex min-h-9 min-w-0 flex-1 items-stretch rounded-[10px] bg-muted/70 p-0.5 dark:bg-muted/50"
      role="tablist"
      aria-label="Режим анкеты"
    >
      <button
        type="button"
        role="tab"
        aria-selected={mode === "edit"}
        className={cn(
          "flex min-w-0 flex-1 items-center justify-center rounded-[8px] px-1.5 py-1.5 text-center text-[10px] font-semibold leading-tight transition-colors sm:px-2 sm:text-xs",
          mode === "edit"
            ? "bg-white text-foreground shadow-sm dark:bg-background"
            : "text-muted-foreground",
        )}
        onClick={() => onChange("edit")}
        data-testid="segment-questionnaire-edit"
      >
        Редактирование
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === "view"}
        className={cn(
          "flex min-w-0 flex-1 items-center justify-center rounded-[8px] px-1.5 py-1.5 text-center text-[10px] font-semibold leading-tight transition-colors sm:px-2 sm:text-xs",
          mode === "view"
            ? "bg-white text-foreground shadow-sm dark:bg-background"
            : "text-muted-foreground",
        )}
        onClick={() => onChange("view")}
        data-testid="segment-questionnaire-view"
      >
        Просмотр
      </button>
    </div>
  );
}

export default function HealthWall() {
  const { isAuthenticated, isLoading: authLoading, isAdmin, user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [message, setMessage] = useState('');
  const [messageMode, setMessageMode] = useState<'message' | 'prescription' | 'followup'>('message');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [uploadQueue, setUploadQueue] = useState<File[]>([]);
  const [replyTo, setReplyTo] = useState<HealthWallMessage | null>(null);
  const [editing, setEditing] = useState<HealthWallMessage | null>(null);
  const [editText, setEditText] = useState('');
  const [forwarding, setForwarding] = useState<HealthWallMessage | null>(null);
  const [forwardSearch, setForwardSearch] = useState('');
  const [pendingDelete, setPendingDelete] = useState<HealthWallMessage | null>(null);
  const [activePinnedIndex, setActivePinnedIndex] = useState(-1);
  const [messageLayer, setMessageLayer] = useState<{
    message: HealthWallMessage;
    rect: { top: number; left: number; width: number; height: number };
  } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const messagesContentRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const longPressTimerRef = useRef<number | null>(null);
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null);
  const lastHealthWallReadAtRef = useRef<number>(0);
  const lastMarkedMessageIdRef = useRef<string | null>(null);
  const markReadInFlightRef = useRef(false);
  
  const [showQuestionnaire, setShowQuestionnaire] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY_PANEL);
    return saved === 'true';
  });
  const [questionnaireViewMode, setQuestionnaireViewMode] = useState<"edit" | "view">("view");
  const [panelWidth, setPanelWidth] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY_DIVIDER);
    return saved ? parseInt(saved) : DEFAULT_PANEL_PERCENT;
  });
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const messageTextareaRef = useRef<HTMLTextAreaElement>(null);

  const [, patientParams] = useRoute("/health-wall/:patientUserId");
  const patientUserId = patientParams?.patientUserId ?? (isAdmin ? undefined : user?.id);
  const isOwnWall = !!patientUserId && patientUserId === user?.id;

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("questionnaire") === "1") {
      setShowQuestionnaire(true);
      localStorage.setItem(STORAGE_KEY_PANEL, "true");
    }
  }, []);

  const { uploadFile, isUploading: uploadingPhoto } = useUpload({
    onSuccess: async (response) => {
      await sendMessageMutation.mutateAsync({
        content: '',
        imageUrl: response.objectPath,
        messageType: 'message',
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

  const { data: messages, isLoading: messagesLoading } = useQuery<HealthWallMessage[]>({
    queryKey: ['/api/health-wall', patientUserId],
    enabled: isAuthenticated && !!patientUserId,
  });

  useHealthWallWs(patientUserId, isAuthenticated && !!patientUserId);

  const isDoctorViewingPatientWall = isAuthenticated && isAdmin && !!patientUserId && !isOwnWall;

  const markCurrentHealthWallAsRead = useCallback(async (reason: 'enter' | 'leave' | 'incoming') => {
    if (!isDoctorViewingPatientWall || !patientUserId) return;
    if (markReadInFlightRef.current) return;
    const now = Date.now();
    if (reason === 'incoming' && now - lastHealthWallReadAtRef.current < 1200) return;
    lastHealthWallReadAtRef.current = now;
    markReadInFlightRef.current = true;
    try {
      await apiRequest('POST', `/api/health-wall/${patientUserId}/read`);
      queryClient.invalidateQueries({ queryKey: ['/api/me/chats'] });
    } catch {
      // keep silent: mark-read failures should not interrupt chat UX
    } finally {
      markReadInFlightRef.current = false;
    }
  }, [isDoctorViewingPatientWall, patientUserId]);

  const { data: patientInfo } = useQuery<PatientInfo>({
    queryKey: ['/api/health-wall', patientUserId, 'info'],
    enabled: isAuthenticated && !!patientUserId && !isOwnWall,
  });

  // Connected doctors for own health wall
  const [showDoctorsDialog, setShowDoctorsDialog] = useState(false);
  const [newDoctorEmail, setNewDoctorEmail] = useState('');
  const [patientSearchQuery, setPatientSearchQuery] = useState('');
  const [inviteLinkData, setInviteLinkData] = useState<{
    open: boolean;
    inviteUrl: string;
  }>({ open: false, inviteUrl: '' });

  const { data: connectedDoctors } = useQuery<ConnectedDoctor[]>({
    queryKey: ['/api/health-wall/my/doctors'],
    enabled: isAuthenticated && isOwnWall,
  });
  const { data: myPatients } = useQuery<MyPatientListItem[]>({
    queryKey: ['/api/health-wall/my/patients'],
    enabled: isAuthenticated && isAdmin,
  });
  const filteredMyPatients = useMemo(() => {
    const q = patientSearchQuery.trim().toLowerCase();
    if (!q) return myPatients ?? [];
    return (myPatients ?? []).filter((patient) => {
      const fullName = [patient.firstName, patient.lastName].filter(Boolean).join(' ').toLowerCase();
      const email = (patient.email ?? '').toLowerCase();
      return fullName.includes(q) || email.includes(q);
    });
  }, [myPatients, patientSearchQuery]);

  const { data: forwardChats, isLoading: forwardChatsLoading } = useQuery<MyChatItem[]>({
    queryKey: ["/api/me/chats", "health-wall-forward-targets"],
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

  const filteredForwardTargets = useMemo(() => {
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

  const setMessageRef = (id: string) => (el: HTMLDivElement | null) => {
    if (el) messageRefs.current.set(id, el);
    else messageRefs.current.delete(id);
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

  const createPatientInviteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/invites', { inviteType: 'patient' });
      return res.json() as Promise<{ inviteUrl: string }>;
    },
    onSuccess: ({ inviteUrl }) => {
      setInviteLinkData({ open: true, inviteUrl });
    },
    onError: () => {
      toast({ title: t.inviteError, variant: "destructive" });
    },
  });

  const invitePatientLinkDialog = (
    <Dialog open={inviteLinkData.open} onOpenChange={(open) => setInviteLinkData((prev) => ({ ...prev, open }))}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.messengerInvitePatient}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-md border bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground mb-1">Ссылка-приглашение</p>
            <p className="break-all text-sm">{inviteLinkData.inviteUrl}</p>
          </div>
          <p className="text-sm text-muted-foreground">Ссылка действительна 24 часа.</p>
          <DialogFooter className="flex flex-row justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                if (!inviteLinkData.inviteUrl) return;
                await navigator.clipboard.writeText(inviteLinkData.inviteUrl);
                toast({ title: "Ссылка скопирована" });
              }}
            >
              <Copy className="h-4 w-4 mr-2" />
              Скопировать
            </Button>
            <Button
              type="button"
              onClick={async () => {
                if (!inviteLinkData.inviteUrl) return;
                if (navigator.share) {
                  try {
                    await navigator.share({
                      title: "Приглашение в Alleho",
                      text: "Присоединяйтесь по ссылке:",
                      url: inviteLinkData.inviteUrl,
                    });
                  } catch {
                    // ignore user cancel
                  }
                } else {
                  await navigator.clipboard.writeText(inviteLinkData.inviteUrl);
                  toast({ title: "Ссылка скопирована" });
                }
              }}
            >
              <Share2 className="h-4 w-4 mr-2" />
              Поделиться
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );

  useEffect(() => {
    if (!isAuthenticated || !isAdmin || isMobile) return;
    if (patientUserId || !(myPatients && myPatients.length > 0)) return;
    setLocation(`/health-wall/${myPatients[0].patientUserId}`);
  }, [isAuthenticated, isAdmin, isMobile, patientUserId, myPatients, setLocation]);

  const addDoctorMutation = useMutation({
    mutationFn: async (email: string) => {
      return apiRequest('POST', '/api/health-wall/my/doctors', { email });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/health-wall/my/doctors'] });
      setNewDoctorEmail('');
      setShowDoctorsDialog(false);
      toast({ title: t.doctorAdded });
    },
    onError: (error: any) => {
      const message = error?.message || t.doctorAddError;
      toast({ title: message, variant: "destructive" });
    },
  });

  const removeDoctorMutation = useMutation({
    mutationFn: async (doctorUserId: string) => {
      return apiRequest('DELETE', `/api/health-wall/my/doctors/${doctorUserId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/health-wall/my/doctors'] });
      toast({ title: t.doctorRemoved });
    },
    onError: () => {
      toast({ title: t.doctorRemoveError, variant: "destructive" });
    },
  });

  const handleAddDoctor = () => {
    if (!newDoctorEmail.trim()) return;
    addDoctorMutation.mutate(newDoctorEmail.trim());
  };

  const sendMessageMutation = useMutation({
    mutationFn: async (data: {
      content?: string;
      imageUrl?: string;
      messageType: string;
      replyToMessageId?: string;
      forwardSource?: { patientUserId: string; messageId: string };
    }) => {
      if (!patientUserId) throw new Error("No patient");
      const res = await apiRequest('POST', `/api/health-wall/${patientUserId}`, data);
      return res.json() as Promise<HealthWallMessage>;
    },
    onSuccess: (newMessage, variables) => {
      queryClient.setQueryData<HealthWallMessage[]>(['/api/health-wall', patientUserId], (old) => {
        if (!old) return [newMessage];
        if (old.some((m) => m.id === newMessage.id)) return old;
        return [...old, newMessage];
      });
      if (!variables.imageUrl) {
        setMessage('');
        setMessageMode('message');
        setReplyTo(null);
        setTimeout(() => messageTextareaRef.current?.focus(), 0);
      } else {
        focusMessageInput();
      }
    },
    onError: () => {
      toast({
        title: t.error,
        description: t.somethingWrong,
        variant: "destructive",
      });
    },
  });

  const editMessageMutation = useMutation({
    mutationFn: async ({ messageId, content }: { messageId: string; content: string }) => {
      if (!patientUserId) throw new Error("No patient");
      const res = await apiRequest('PATCH', `/api/health-wall/${patientUserId}/messages/${messageId}`, { content });
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.setQueryData<HealthWallMessage[]>(['/api/health-wall', patientUserId], (old) =>
        old?.map((m) =>
          m.id === variables.messageId
            ? { ...m, content: variables.content, editedAt: new Date().toISOString() }
            : m
        )
      );
      setEditing(null);
      setEditText('');
    },
    onError: (error: Error) => {
      toast({ title: t.error, description: error.message, variant: "destructive" });
    },
  });

  const deleteMessageMutation = useMutation({
    mutationFn: async (messageId: string) => {
      if (!patientUserId) throw new Error("No patient");
      await apiRequest('DELETE', `/api/health-wall/${patientUserId}/messages/${messageId}`);
    },
    onSuccess: (_data, messageId) => {
      queryClient.setQueryData<HealthWallMessage[]>(['/api/health-wall', patientUserId], (old) =>
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
    onError: (error: Error) => {
      toast({ title: t.error, description: error.message, variant: "destructive" });
    },
  });

  const pinMessageMutation = useMutation({
    mutationFn: async ({ messageId, pin }: { messageId: string; pin: boolean }) => {
      if (!patientUserId) throw new Error("No patient");
      await apiRequest('POST', `/api/health-wall/${patientUserId}/messages/${messageId}/${pin ? 'pin' : 'unpin'}`, {});
    },
    onSuccess: (_data, variables) => {
      queryClient.setQueryData<HealthWallMessage[]>(['/api/health-wall', patientUserId], (old) =>
        old?.map((m) =>
          m.id === variables.messageId
            ? {
                ...m,
                pinnedAt: variables.pin ? new Date().toISOString() : null,
                pinnedByUserId: variables.pin ? user?.id ?? null : null,
              }
            : m
        )
      );
    },
    onError: (error: Error) => {
      toast({ title: t.error, description: error.message, variant: "destructive" });
    },
  });

  const forwardMessageMutation = useMutation({
    mutationFn: async ({
      targetConversationId,
      sourceMessageId,
      targetTitle,
      targetType,
    }: {
      targetConversationId: string;
      sourceMessageId: string;
      targetTitle: string;
      targetType: "direct" | "group" | "channel";
    }) => {
      if (!patientUserId) throw new Error("No patient");
      const res = await apiRequest("POST", `/api/conversations/${targetConversationId}/messages`, {
        forwardSource: { patientUserId, messageId: sourceMessageId },
      });
      return {
        targetConversationId,
        targetTitle,
        targetType,
        newMessage: (await res.json()) as HealthWallMessage,
      };
    },
    onSuccess: ({ targetConversationId, targetTitle, targetType }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/me/chats'] });
      setForwarding(null);
      setForwardSearch('');
      const targetPath =
        targetType === "group"
          ? `/messenger/group/${targetConversationId}`
          : targetType === "channel"
            ? `/messenger/channel/${targetConversationId}`
            : `/messenger/direct/${targetConversationId}`;
      const forwardToast = toast({
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
      window.setTimeout(() => forwardToast.dismiss(), 3000);
    },
    onError: (error: Error) => {
      toast({ title: t.error, description: error.message, variant: "destructive" });
    },
  });

  const reactionMutation = useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      if (!patientUserId) throw new Error("No patient");
      const res = await apiRequest(
        "POST",
        `/api/health-wall/${patientUserId}/messages/${messageId}/reactions`,
        { emoji }
      );
      return (await res.json()) as { messageId: string; reactions: HealthWallMessage["reactions"] };
    },
    onMutate: async ({ messageId, emoji }) => {
      queryClient.setQueryData<HealthWallMessage[]>(["/api/health-wall", patientUserId], (old) =>
        old?.map((m) => {
          if (m.id !== messageId) return m;
          const prev = m.reactions ?? [];
          const existing = prev.find((r) => r.emoji === emoji);
          let next = prev;
          if (existing?.reactedByMe) {
            next = prev
              .map((r) => (r.emoji === emoji ? { ...r, count: Math.max(0, r.count - 1), reactedByMe: false } : r))
              .filter((r) => r.count > 0);
          } else if (existing) {
            next = prev.map((r) => (r.emoji === emoji ? { ...r, count: r.count + 1, reactedByMe: true } : r));
          } else {
            next = [...prev, { emoji, count: 1, reactedByMe: true }];
          }
          return { ...m, reactions: next };
        })
      );
    },
    onSuccess: ({ messageId, reactions }) => {
      queryClient.setQueryData<HealthWallMessage[]>(["/api/health-wall", patientUserId], (old) =>
        old?.map((m) => (m.id === messageId ? { ...m, reactions: reactions ?? [] } : m))
      );
    },
  });

  useEffect(() => {
    if (message !== "") return;
    const el = messageTextareaRef.current;
    if (el) syncChatTextareaHeight(el);
  }, [message]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation('/auth');
    }
  }, [authLoading, isAuthenticated, setLocation]);

  const displayMessages: HealthWallMessage[] = useMemo(() => {
    return [...(messages ?? [])].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [messages]);

  const pinnedMessages = useMemo(
    () => displayMessages.filter((msg) => msg.pinnedAt && !msg.deletedAt),
    [displayMessages]
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

  const handlePinnedBannerClick = useCallback(() => {
    if (pinnedMessages.length === 0) return;
    setActivePinnedIndex((prev) => {
      const baseIndex = prev >= 0 ? prev : pinnedMessages.length - 1;
      const nextIndex = (baseIndex + 1) % pinnedMessages.length;
      const nextPinnedMessage = pinnedMessages[nextIndex];
      if (nextPinnedMessage) {
        scrollToMessage(nextPinnedMessage.id);
      }
      return nextIndex;
    });
  }, [pinnedMessages]);

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
  }, [displayMessages, patientUserId]);

  useEffect(() => {
    if (!isDoctorViewingPatientWall || !patientUserId) return;
    void markCurrentHealthWallAsRead('enter');
    return () => {
      void markCurrentHealthWallAsRead('leave');
    };
  }, [isDoctorViewingPatientWall, patientUserId, markCurrentHealthWallAsRead]);

  useEffect(() => {
    if (!isDoctorViewingPatientWall || displayMessages.length === 0) return;
    const lastMessage = displayMessages[displayMessages.length - 1];
    if (!lastMessage?.id || lastMarkedMessageIdRef.current === lastMessage.id) return;
    lastMarkedMessageIdRef.current = lastMessage.id;
    void markCurrentHealthWallAsRead('incoming');
  }, [displayMessages, isDoctorViewingPatientWall, markCurrentHealthWallAsRead]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PANEL, showQuestionnaire.toString());
  }, [showQuestionnaire]);

  useEffect(() => {
    if (!showQuestionnaire) setQuestionnaireViewMode("view");
  }, [showQuestionnaire]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_DIVIDER, panelWidth.toString());
  }, [panelWidth]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const newPercent = ((e.clientX - rect.left) / rect.width) * 100;
    const clampedPercent = Math.min(MAX_PANEL_PERCENT, Math.max(MIN_PANEL_PERCENT, newPercent));
    setPanelWidth(clampedPercent);
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const focusMessageInput = () => {
    setTimeout(() => {
      const textarea = document.querySelector('[data-testid="input-message"]') as HTMLTextAreaElement;
      if (textarea) textarea.focus();
    }, 100);
  };

  const closeQuestionnaire = () => {
    setShowQuestionnaire(false);
    focusMessageInput();
  };

  const openQuestionnaire = () => setShowQuestionnaire(true);

  const isLoadingMessages = messagesLoading;

  if (authLoading || isLoadingMessages) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const handleSendMessage = () => {
    if (editing) {
      const text = editText.trim();
      if (!text) return;
      editMessageMutation.mutate({ messageId: editing.id, content: text });
      return;
    }
    if (!message.trim()) return;
    sendMessageMutation.mutate({
      content: message.trim(),
      messageType: messageMode,
      replyToMessageId: replyTo?.id,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (editing) setEditText(e.target.value);
    else setMessage(e.target.value);
    syncChatTextareaHeight(e.target);
  };

  const startReply = (msg: HealthWallMessage) => {
    setEditing(null);
    setEditText('');
    setReplyTo(msg);
    setTimeout(() => messageTextareaRef.current?.focus(), 0);
  };

  const startEdit = (msg: HealthWallMessage) => {
    setReplyTo(null);
    setEditing(msg);
    setEditText(msg.content ?? '');
    setTimeout(() => messageTextareaRef.current?.focus(), 0);
  };

  const cancelComposerContext = () => {
    setReplyTo(null);
    setEditing(null);
    setEditText('');
  };

  const copyMessageContent = async (msg: HealthWallMessage) => {
    if (!msg.content) return;
    try {
      await navigator.clipboard.writeText(msg.content);
      toast({ title: "Скопировано" });
    } catch {
      // ignore clipboard failures
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    const fileArray = Array.from(files);
    for (const file of fileArray) {
      await uploadFile(file);
    }
    e.target.value = '';
  };

  /** Short time in bubble — no year */
  const formatMessageBubbleTime = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isToday(date)) return format(date, "HH:mm", { locale: ru });
    if (isYesterday(date)) return `вч. ${format(date, "HH:mm", { locale: ru })}`;
    return format(date, "dd.MM. HH:mm", { locale: ru });
  };

  const displayName = isOwnWall
    ? t.healthWall
    : patientInfo?.patientName || patientInfo?.email?.split('@')[0] || t.patient;
  const profileTargetUserId = !isOwnWall ? patientUserId : null;
  const canSelectMessageType = isAdmin && !isOwnWall;
  const messageTypeConfig: Record<'message' | 'prescription' | 'followup', { label: string; icon: typeof MessageCircle; activeClass: string }> = {
    message: { label: "Сообщение", icon: MessageCircle, activeClass: "" },
    prescription: { label: t.prescription, icon: Pill, activeClass: "bg-green-600 hover:bg-green-700 text-white" },
    followup: { label: t.followup, icon: FileText, activeClass: "bg-purple-600 hover:bg-purple-700 text-white" },
  };
  const selectedMode = messageTypeConfig[messageMode];
  const composerValue = editing ? editText : message;
  const isComposerPending = sendMessageMutation.isPending || editMessageMutation.isPending;
  const headerAvatarUrl = isOwnWall
    ? (user?.profileImageUrl ?? null)
    : (patientInfo?.profileImageUrl ?? null);
  const headerInitials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "U";

  const handleBackClick = () => {
    if (isOwnWall) {
      setLocation('/');
    } else if (isAdmin && isMobile) {
      setLocation('/health-wall');
    } else {
      setLocation('/messenger');
    }
  };

  const renderMessageActions = (msg: HealthWallMessage) => {
    const isSupportedType =
      msg.messageType === "message" ||
      msg.messageType === "prescription" ||
      msg.messageType === "followup";
    if (msg.deletedAt || !isSupportedType) return null;
    const isOwnMessage = msg.authorUserId === user?.id;
    const canEdit =
      isOwnMessage &&
      !!msg.content &&
      Date.now() - new Date(msg.createdAt).getTime() < EDIT_WINDOW_MS;
    const isPinned = !!msg.pinnedAt;

    return (
      <>
          <button className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted" onClick={() => { startReply(msg); setMessageLayer(null); }}>
            <Reply className="mr-2 h-4 w-4" />
            {t.messageActionReply}
          </button>
          <button className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted" onClick={() => { setForwarding(msg); setMessageLayer(null); }}>
            <ForwardIcon className="mr-2 h-4 w-4" />
            {t.messageActionForward}
          </button>
          <button className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted" onClick={() => { pinMessageMutation.mutate({ messageId: msg.id, pin: !isPinned }); setMessageLayer(null); }}>
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
          {msg.content && (
            <button className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted" onClick={() => { void copyMessageContent(msg); setMessageLayer(null); }}>
              <Copy className="mr-2 h-4 w-4" />
              {t.messageActionCopy}
            </button>
          )}
          {isOwnMessage && <div className="my-1 h-px bg-border" />}
          {canEdit && (
            <button className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted" onClick={() => { startEdit(msg); setMessageLayer(null); }}>
              <Pencil className="mr-2 h-4 w-4" />
              {t.messageActionEdit}
            </button>
          )}
          {isOwnMessage && (
            <button
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-destructive hover:bg-muted"
              onClick={() => { setPendingDelete(msg); setMessageLayer(null); }}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {t.messageActionDelete}
            </button>
          )}
      </>
    );
  };

  const clearLongPress = () => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressStartRef.current = null;
  };

  const openMessageLayer = (msg: HealthWallMessage, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    setMessageLayer({ message: msg, rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height } });
  };

  const handleBubbleContextMenu = (e: React.MouseEvent<HTMLElement>, msg: HealthWallMessage) => {
    if (msg.deletedAt) return;
    e.preventDefault();
    openMessageLayer(msg, e.currentTarget);
  };

  const handleBubblePointerDown = (e: React.PointerEvent<HTMLElement>, msg: HealthWallMessage) => {
    if (msg.deletedAt || e.pointerType === "mouse") return;
    const targetEl = e.currentTarget;
    const target = e.target as HTMLElement;
    if (target.closest("a,button,input,textarea")) return;
    clearLongPress();
    longPressStartRef.current = { x: e.clientX, y: e.clientY };
    longPressTimerRef.current = window.setTimeout(() => {
      openMessageLayer(msg, targetEl);
      clearLongPress();
    }, 450);
  };

  const handleBubbleTouchStart = (e: React.TouchEvent<HTMLElement>, msg: HealthWallMessage) => {
    if (msg.deletedAt) return;
    const targetEl = e.currentTarget;
    const target = e.target as HTMLElement;
    if (target.closest("a,button,input,textarea")) return;
    const touch = e.touches[0];
    if (!touch) return;
    clearLongPress();
    longPressStartRef.current = { x: touch.clientX, y: touch.clientY };
    longPressTimerRef.current = window.setTimeout(() => {
      openMessageLayer(msg, targetEl);
      clearLongPress();
    }, 450);
  };

  const handleBubbleTouchMove = (e: React.TouchEvent<HTMLElement>) => {
    if (!longPressStartRef.current) return;
    const touch = e.touches[0];
    if (!touch) return;
    const dx = Math.abs(touch.clientX - longPressStartRef.current.x);
    const dy = Math.abs(touch.clientY - longPressStartRef.current.y);
    if (dx > 8 || dy > 8) clearLongPress();
  };

  const handleBubblePointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (!longPressStartRef.current) return;
    const dx = Math.abs(e.clientX - longPressStartRef.current.x);
    const dy = Math.abs(e.clientY - longPressStartRef.current.y);
    if (dx > 8 || dy > 8) clearLongPress();
  };

  const renderReplyPreview = (reply: HealthWallReplyTo, isOwnMessage: boolean) => (
    <button
      type="button"
      onClick={() => scrollToMessage(reply.id)}
      className={`mb-1 block w-full rounded-lg border-l-2 px-2 py-1 pr-8 text-left text-[11px] leading-tight ${
        isOwnMessage
          ? "border-emerald-500/70 bg-emerald-50/70 dark:bg-emerald-950/40"
          : "border-primary/70 bg-background/60"
      }`}
    >
      <span className="block truncate text-[10px] font-semibold text-muted-foreground">
        {getAuthorName(reply.author)}
      </span>
      <span className="block truncate text-muted-foreground">{getReplySnippet(reply)}</span>
    </button>
  );

  const renderForwardedHeader = (msg: HealthWallMessage) => {
    if (!msg.forwardedFromMessageId && !msg.forwardedFromUserId) return null;
    return (
      <p className="mb-0.5 text-[10px] italic leading-tight text-muted-foreground">
        ↪ {t.messageForwardedFrom} {getAuthorName(msg.forwardedFromAuthor)}
      </p>
    );
  };

  const renderReactionPills = (msg: HealthWallMessage, isOwnMessage: boolean) => {
    if (!msg.reactions || msg.reactions.length === 0) return null;
    return (
      <div className={`flex flex-col items-start gap-1 ${isOwnMessage ? "items-end" : "items-start"}`}>
        {msg.reactions.map((reaction) => (
          <button
            key={reaction.emoji}
            type="button"
            onClick={() => reactionMutation.mutate({ messageId: msg.id, emoji: reaction.emoji })}
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

  const renderMessageBubbleContent = (msg: HealthWallMessage, isOwnMessage: boolean) => {
    const isPrescription = msg.messageType === "prescription";
    const isFollowup = msg.messageType === "followup";
    return (
      <>
        {isPrescription && (
          <div className="mb-0.5 pr-8">
            <Badge variant="secondary" className="bg-green-100 text-xs text-green-800 dark:bg-green-900 dark:text-green-200">
              <Pill className="mr-1 h-3 w-3" />
              {t.prescription}
            </Badge>
          </div>
        )}
        {isFollowup && (
          <div className="mb-0.5 pr-8">
            <Badge variant="secondary" className="bg-purple-100 text-xs text-purple-800 dark:bg-purple-900 dark:text-purple-200">
              <FileText className="mr-1 h-3 w-3" />
              {t.followup}
            </Badge>
          </div>
        )}
        {msg.replyTo && renderReplyPreview(msg.replyTo, isOwnMessage)}
        {renderForwardedHeader(msg)}
        {msg.imageUrl && (
          <img
            src={getThumbUrl(msg.imageUrl)}
            alt="Uploaded"
            className="mb-0.5 max-h-64 cursor-pointer rounded-md transition-opacity hover:opacity-90"
            data-testid={`image-${msg.id}`}
            onClick={() => setSelectedImage(msg.imageUrl!)}
          />
        )}
        {msg.content && <p className="whitespace-pre-wrap pb-0.5 pr-7 text-sm leading-snug">{msg.content}</p>}
        {msg.pinnedAt && <Pin className="absolute -left-1 -top-1 h-3.5 w-3.5 text-primary" />}
        <span className="pointer-events-none absolute bottom-0.5 right-1.5 select-none tabular-nums text-[10px] leading-none text-muted-foreground">
          {msg.editedAt && <span className="mr-1 italic">{t.messageEdited}</span>}
          {formatMessageBubbleTime(msg.createdAt)}
        </span>
      </>
    );
  };

  const inputArea = (
    <div className="absolute inset-x-0 bottom-0 z-20 space-y-2 bg-transparent px-4 py-4">
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
                  <span className="ml-1 text-muted-foreground">{getAuthorName(replyTo.author)}</span>
                )}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {editing
                  ? editing.content ?? ''
                  : replyTo?.content
                    ? replyTo.content
                    : replyTo?.imageUrl
                      ? t.messagePhotoLabel
                      : ''}
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
        <div className="flex items-end gap-2">
          {!composerValue.trim() && !editing && (
            <Button
              variant="outline"
              size="icon"
              disabled={uploadingPhoto}
              onClick={() => document.getElementById('photo-upload')?.click()}
              className="rounded-full shrink-0 bg-[#e8ecf1] text-[#28292c] h-10 w-10"
              data-testid="button-upload-photo"
            >
              {uploadingPhoto ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Image className="h-4 w-4" />
              )}
            </Button>
          )}
          <input
            id="photo-upload"
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handlePhotoUpload}
          />
          <div className="relative flex-1">
            <Textarea
              ref={messageTextareaRef}
              placeholder={
                editing ? t.messageEditingTitle :
                messageMode === 'prescription' ? t.prescriptionPlaceholder :
                messageMode === 'followup' ? t.followupPlaceholder :
                t.writeMessage
              }
              value={composerValue}
              onChange={handleTextareaInput}
              onKeyDown={handleKeyDown}
              rows={1}
              className={`min-h-[36px] resize-none overflow-y-auto rounded-[22px] ${
                messageMode === 'prescription' ? 'border-green-300 dark:border-green-700' : 
                messageMode === 'followup' ? 'border-purple-300 dark:border-purple-700' : 
                ''
              } ${canSelectMessageType && !editing ? 'pr-14' : ''}`}
              style={{ maxHeight: '144px' }}
              data-testid="input-message"
            />
            {canSelectMessageType && !editing && (
              <div className="absolute inset-y-1.5 right-1.5 flex items-center">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant={messageMode === "message" ? "outline" : "default"}
                      size="icon"
                      className={`rounded-full !h-8 !w-8 min-h-0 p-0 shadow-sm ${messageMode === "message" ? "bg-background" : selectedMode.activeClass}`}
                      data-testid="button-message-type-trigger"
                    >
                      <selectedMode.icon className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onSelect={() => setMessageMode("message")} data-testid="menu-item-message-type-message">
                      <MessageCircle className="h-4 w-4 mr-2" />
                      Сообщение
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setMessageMode("prescription")} data-testid="menu-item-message-type-prescription">
                      <Pill className="h-4 w-4 mr-2" />
                      {t.prescription}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setMessageMode("followup")} data-testid="menu-item-message-type-followup">
                      <FileText className="h-4 w-4 mr-2" />
                      {t.followup}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>
          <Button
            onClick={handleSendMessage}
            disabled={!composerValue.trim() || isComposerPending}
            size="icon"
            className="rounded-full shrink-0 h-10 w-10"
            data-testid="button-send-message"
          >
            {isComposerPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
  );

  if (isAdmin && isMobile && !patientUserId) {
    return (
      <>
      <div className="flex h-full flex-col bg-background pb-20">
        <div className="shrink-0 border-b border-border/60 bg-background px-3 py-2">
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  aria-label={t.menu}
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuItem
                  onSelect={() => {
                    createPatientInviteMutation.mutate();
                  }}
                >
                  {t.messengerInvitePatient}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="relative flex-1">
              <Input
                value={patientSearchQuery}
                onChange={(e) => setPatientSearchQuery(e.target.value)}
                placeholder="Поиск пациентов"
                className="h-9"
              />
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredMyPatients.map((patient) => {
            const patientName =
              [patient.firstName, patient.lastName].filter(Boolean).join(" ").trim() ||
              patient.email ||
              t.patient;
            return (
              <button
                key={patient.patientUserId}
                type="button"
                onClick={() => setLocation(`/health-wall/${patient.patientUserId}`)}
                className="w-full px-3 py-2.5 border-b border-border/50 text-left hover:bg-muted/50 flex items-center gap-2 bg-background"
              >
                <Avatar className="h-9 w-9 shrink-0">
                  <AvatarFallback>{(patientName[0] || "?").toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{patientName}</p>
                  <p className="truncate text-xs text-muted-foreground">{patient.email || ""}</p>
                </div>
                {(patient.unreadCount ?? 0) > 0 && (
                  <span className="inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-blue-500 px-1.5 text-[11px] font-medium text-white">
                    {patient.unreadCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="fixed bottom-0 left-0 right-0 z-30 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
          <div className="border-t border-border/60 bg-background px-0 py-2">
            <Button
              type="button"
              variant="outline"
              className="h-10 w-full justify-center rounded-full border-0 bg-primary text-primary-foreground hover:bg-primary/90"
              data-testid="button-to-communities-mobile"
              onClick={() => setLocation("/messenger")}
            >
              В сообщества
            </Button>
          </div>
        </div>
      </div>
      {invitePatientLinkDialog}
      </>
    );
  }

  return (
    <div className="flex h-full flex-col md:flex-row">
      {!isOwnWall && isAdmin && (
        <aside className="hidden md:flex w-80 shrink-0 border-r border-border/60 bg-background flex-col">
          <div className="shrink-0 border-b border-border/60 bg-background px-3 py-2">
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    aria-label={t.menu}
                  >
                    <Menu className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuItem
                    onSelect={() => {
                      createPatientInviteMutation.mutate();
                    }}
                  >
                    {t.messengerInvitePatient}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <div className="relative flex-1">
                <Input
                  value={patientSearchQuery}
                  onChange={(e) => setPatientSearchQuery(e.target.value)}
                  placeholder="Поиск пациентов"
                  className="h-9"
                />
              </div>
            </div>
            <div className="mt-2 rounded-xl bg-muted/60 px-3 py-2">
              <p className="text-sm font-semibold">{t.patient}</p>
              <p className="text-xs text-muted-foreground">Стена здоровья</p>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredMyPatients.map((patient) => {
              const patientName =
                [patient.firstName, patient.lastName].filter(Boolean).join(" ").trim() ||
                patient.email ||
                t.patient;
              const isActive = patient.patientUserId === patientUserId;
              return (
                <button
                  key={patient.patientUserId}
                  type="button"
                  onClick={() => setLocation(`/health-wall/${patient.patientUserId}`)}
                  className={cn(
                    "w-full px-3 py-2.5 border-b border-border/50 text-left hover:bg-muted/50 flex items-center gap-2",
                    isActive ? "bg-muted/70" : "bg-background"
                  )}
                >
                  <Avatar className="h-9 w-9 shrink-0">
                    <AvatarFallback>{(patientName[0] || "?").toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{patientName}</p>
                    <p className="truncate text-xs text-muted-foreground">{patient.email || ""}</p>
                  </div>
                  {(patient.unreadCount ?? 0) > 0 && (
                    <span className="inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-blue-500 px-1.5 text-[11px] font-medium text-white">
                      {patient.unreadCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="shrink-0 border-t border-border/60 bg-background px-3 py-2">
            <Button
              type="button"
              variant="outline"
              className="h-10 w-full justify-center rounded-full border-0 bg-primary text-primary-foreground hover:bg-primary/90"
              data-testid="button-to-communities-desktop"
              onClick={() => setLocation("/messenger")}
            >
              В сообщества
            </Button>
          </div>
        </aside>
      )}
      <div className="relative flex flex-col h-full flex-1" ref={containerRef}>
      {!showQuestionnaire && (
      <div className="absolute inset-x-0 top-0 z-30 px-3 py-3 pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto">
        <Button
          variant="secondary"
          size="icon"
          onClick={handleBackClick}
          className="h-10 w-10 rounded-full border border-border/40 bg-background/55 text-black backdrop-blur-md"
          data-testid="button-back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div
          className={`flex-1 rounded-full border border-border/40 bg-background/55 px-4 py-2 backdrop-blur-md ${profileTargetUserId || isOwnWall ? "cursor-pointer hover:opacity-90 transition-opacity" : ""}`}
          data-testid="header-pill"
          onClick={() => {
            if (profileTargetUserId) {
              setLocation(`/profile/${profileTargetUserId}`);
              return;
            }
            if (isOwnWall) {
              setShowDoctorsDialog(true);
            }
          }}
        >
          {isOwnWall ? (
            <>
              {connectedDoctors && connectedDoctors.length > 0 ? (
                <div data-testid="button-manage-doctors">
                  <p className="text-sm font-semibold truncate" data-testid="text-health-wall-title">
                    {connectedDoctors.map(d => 
                      d.firstName && d.lastName 
                        ? `${d.firstName} ${d.lastName}`
                        : d.email
                    ).join(', ')}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {connectedDoctors.length === 1 
                      ? formatDoctorLastVisit(connectedDoctors[0].lastVisitedAt)
                      : connectedDoctors.map(d => {
                          const name = d.firstName || d.email?.split('@')[0] || '';
                          return `${name}: ${formatDoctorLastVisit(d.lastVisitedAt)}`;
                        }).join(' | ')
                    }
                  </p>
                </div>
              ) : (
                <p className="text-sm font-semibold" data-testid="button-connect-doctor">{t.connectDoctor}</p>
              )}
            </>
          ) : (
            <>
              <p className="text-sm font-semibold truncate" data-testid="text-health-wall-title">{displayName}</p>
              {patientInfo && (
                <p className="text-xs text-muted-foreground truncate">
                  {formatDoctorLastVisit(patientInfo.patientLastVisitedAt)}
                </p>
              )}
            </>
          )}
        </div>
        <Button
          variant="secondary"
          size="icon"
          onClick={openQuestionnaire}
          className="h-10 w-10 rounded-full border border-border/40 bg-background/55 backdrop-blur-md !text-black [&_svg]:!text-black hover:bg-background/70"
          data-testid="button-open-questionnaire"
        >
          <FileText className="h-4 w-4" />
        </Button>
        <button
          type="button"
          onClick={() => profileTargetUserId && setLocation(`/profile/${profileTargetUserId}`)}
          disabled={!profileTargetUserId}
          className={`h-10 w-10 rounded-full border border-border/40 bg-background/55 p-0 backdrop-blur-md ${profileTargetUserId ? "hover:opacity-90 transition-opacity" : ""}`}
          data-testid="button-header-avatar"
        >
          <Avatar className="h-full w-full">
            <AvatarImage src={headerAvatarUrl || undefined} alt={displayName} />
            <AvatarFallback className="text-xs font-semibold">{headerInitials}</AvatarFallback>
          </Avatar>
        </button>
        </div>
      </div>
      )}

      <div className="flex-1 flex overflow-hidden relative">
        {showQuestionnaire && !isMobile && (
          <>
            <div
              className="flex h-full min-h-0 flex-col border-r bg-white dark:bg-background"
              style={{ width: `${panelWidth}%` }}
            >
              <div className="flex shrink-0 items-center gap-2 border-b border-border/50 bg-white px-3 py-3 dark:bg-background md:px-4">
                <Button
                  variant="secondary"
                  size="icon"
                  onClick={closeQuestionnaire}
                  className="h-10 w-10 shrink-0 rounded-full border border-border/40 bg-white text-black dark:bg-background"
                  data-testid="button-questionnaire-back"
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <QuestionnaireViewModeSegment
                  mode={questionnaireViewMode}
                  onChange={setQuestionnaireViewMode}
                />
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto bg-white px-3 pb-6 dark:bg-background md:px-4">
                <QuestionnairePanel
                  patientUserId={patientUserId!}
                  isOwnQuestionnaire={isOwnWall}
                  initialViewMode="view"
                  viewMode={questionnaireViewMode}
                  onViewModeChange={setQuestionnaireViewMode}
                  hideViewModeToggle
                />
              </div>
            </div>
            <div
              className="w-2 h-full cursor-col-resize flex items-center justify-center bg-border hover:bg-primary/20 transition-colors shrink-0"
              onMouseDown={handleMouseDown}
              data-testid="resize-divider"
            >
              <GripVertical className="h-4 w-4 text-muted-foreground" />
            </div>
          </>
        )}

        <div
          className={`relative flex flex-col ${showQuestionnaire && !isMobile ? '' : 'flex-1'}`}
          style={{
            ...(showQuestionnaire && !isMobile ? { width: `${100 - panelWidth}%` } : {}),
            backgroundImage: "url(/chat_bg_pattern.png)",
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
          }}
        >
          <div className="flex-1 relative min-h-0">
            {isMobile && showQuestionnaire ? (
              <div
                className="absolute inset-0 z-10 flex flex-col overflow-hidden bg-white pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] dark:bg-background"
              >
                <div className="flex shrink-0 items-center gap-2 border-b border-border/40 bg-white px-4 py-3 dark:bg-background">
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={closeQuestionnaire}
                    className="h-10 w-10 shrink-0 rounded-full border border-border/40 bg-white text-black dark:bg-background"
                    data-testid="button-questionnaire-back"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </Button>
                  <QuestionnaireViewModeSegment
                    mode={questionnaireViewMode}
                    onChange={setQuestionnaireViewMode}
                  />
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto bg-white px-4 dark:bg-background">
                  <QuestionnairePanel
                    patientUserId={patientUserId!}
                    isOwnQuestionnaire={isOwnWall}
                    initialViewMode="view"
                    viewMode={questionnaireViewMode}
                    onViewModeChange={setQuestionnaireViewMode}
                    hideViewModeToggle
                  />
                </div>
              </div>
            ) : (
              <>
              {activePinnedMessage && (
                <button
                  type="button"
                  onClick={handlePinnedBannerClick}
                  className="absolute inset-x-0 top-[68px] z-20 mx-3 flex items-start gap-2 rounded-xl border border-border/40 bg-background/85 px-3 py-2 text-left shadow-sm backdrop-blur-md"
                  data-testid="banner-health-wall-pinned-message"
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
                className={`h-full overflow-y-auto px-4 pb-32 ${
                  showQuestionnaire ? "pt-4" : activePinnedMessage ? "pt-32" : "pt-20"
                }`}
              >
                <div ref={messagesContentRef} className="space-y-3">
                {displayMessages.length > 0 ? (
                  <>
                    {(() => {
                      const filteredMessages = isOwnWall 
                        ? displayMessages.filter(msg => msg.messageType !== 'followup')
                        : displayMessages;
                      const groupedMessages: Array<{ messages: HealthWallMessage[], isImageGroup: boolean }> = [];
                      
                      filteredMessages.forEach((msg, index) => {
                        const isImageOnly =
                          msg.imageUrl &&
                          !msg.content &&
                          !msg.deletedAt &&
                          !msg.replyTo &&
                          !msg.forwardedFromMessageId &&
                          !msg.pinnedAt &&
                          msg.messageType === 'message';
                        const prevGroup = groupedMessages[groupedMessages.length - 1];
                        
                        if (isImageOnly && prevGroup?.isImageGroup) {
                          const lastMsgInGroup = prevGroup.messages[prevGroup.messages.length - 1];
                          if (lastMsgInGroup.authorUserId === msg.authorUserId) {
                            prevGroup.messages.push(msg);
                            return;
                          }
                        }
                        
                        groupedMessages.push({
                          messages: [msg],
                          isImageGroup: !!isImageOnly,
                        });
                      });
                      
                      return groupedMessages.map((group, groupIndex) => {
                        const lastMsg = group.messages[group.messages.length - 1];
                        const isOwnMessage = lastMsg.authorUserId === user?.id;
                        
                        if (group.isImageGroup && group.messages.length > 1) {
                          return (
                            <div
                              key={`group-${groupIndex}`}
                              ref={setMessageRef(lastMsg.id)}
                              className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
                              data-testid={`message-group-${groupIndex}`}
                            >
                              <Card className={`max-w-[85%] min-w-28 ${isOwnMessage ? 'bg-emerald-100 dark:bg-emerald-900 border-emerald-200 dark:border-emerald-800' : ''}`}>
                                    <CardContent
                                      className="message relative min-h-[2.75rem] p-2 pb-3.5 select-none"
                                      onContextMenu={(e) => handleBubbleContextMenu(e, lastMsg)}
                                      onPointerDown={(e) => handleBubblePointerDown(e, lastMsg)}
                                      onPointerMove={handleBubblePointerMove}
                                      onPointerUp={clearLongPress}
                                      onPointerCancel={clearLongPress}
                                      onPointerLeave={clearLongPress}
                                      onTouchStart={(e) => handleBubbleTouchStart(e, lastMsg)}
                                      onTouchMove={handleBubbleTouchMove}
                                      onTouchEnd={clearLongPress}
                                      onTouchCancel={clearLongPress}
                                      style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" }}
                                    >
                                      <div className={`grid gap-1 ${
                                        group.messages.length === 1 ? 'grid-cols-1' :
                                        group.messages.length === 2 ? 'grid-cols-2' :
                                        'grid-cols-3'
                                      }`}>
                                        {group.messages.map((msg) => (
                                          <img 
                                            key={msg.id}
                                            src={getThumbUrl(msg.imageUrl!)} 
                                            alt="Uploaded" 
                                            className="rounded-md w-full h-32 object-cover cursor-pointer hover:opacity-90 transition-opacity"
                                            data-testid={`image-${msg.id}`}
                                            onClick={() => setSelectedImage(msg.imageUrl!)}
                                          />
                                        ))}
                                      </div>
                                      <span className="pointer-events-none absolute bottom-0.5 right-1.5 text-[10px] leading-none text-muted-foreground tabular-nums select-none">
                                        {formatMessageBubbleTime(lastMsg.createdAt)}
                                      </span>
                                    </CardContent>
                              </Card>
                            </div>
                          );
                        }
                        
                        const msg = group.messages[0];
                        const isPrescription = msg.messageType === 'prescription';
                        const isFollowup = msg.messageType === 'followup';
                        const isDeleted = !!msg.deletedAt;
                        
                        return (
                          <div
                            key={msg.id}
                            ref={setMessageRef(msg.id)}
                            className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
                            data-testid={`message-${msg.id}`}
                          >
                            <div className={`flex items-end gap-1 ${isOwnMessage ? "flex-row-reverse" : "flex-row"}`}>
                            {!!msg.reactions?.length && (
                              <div className="shrink-0 pb-1">
                                {renderReactionPills(msg, isOwnMessage)}
                              </div>
                            )}
                            <Card 
                              className={`max-w-[85%] min-w-28 ${
                                isDeleted
                                  ? 'border-dashed border-border/60 bg-muted/40 text-muted-foreground italic'
                                  : isPrescription
                                  ? 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800' 
                                  : isFollowup
                                    ? 'bg-purple-50 dark:bg-purple-950 border-purple-200 dark:border-purple-800'
                                    : isOwnMessage 
                                      ? 'bg-emerald-100 dark:bg-emerald-900 border-emerald-200 dark:border-emerald-800' 
                                      : ''
                              }`}
                            >
                              {!isDeleted ? (
                                    <CardContent
                                      className="message relative min-h-[2.75rem] p-2 pb-3.5 select-none"
                                      onContextMenu={(e) => handleBubbleContextMenu(e, msg)}
                                      onPointerDown={(e) => handleBubblePointerDown(e, msg)}
                                      onPointerMove={handleBubblePointerMove}
                                      onPointerUp={clearLongPress}
                                      onPointerCancel={clearLongPress}
                                      onPointerLeave={clearLongPress}
                                      onTouchStart={(e) => handleBubbleTouchStart(e, msg)}
                                      onTouchMove={handleBubbleTouchMove}
                                      onTouchEnd={clearLongPress}
                                      onTouchCancel={clearLongPress}
                                      style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" }}
                                    >
                                      {renderMessageBubbleContent(msg, isOwnMessage)}
                                    </CardContent>
                              ) : (
                                <CardContent className="relative min-h-[2.75rem] p-2 pb-3.5">
                                  <p className="text-sm whitespace-pre-wrap leading-snug pr-7 pb-0.5">
                                    {t.messageDeleted}
                                  </p>
                                  <span className="pointer-events-none absolute bottom-0.5 right-1.5 text-[10px] leading-none text-muted-foreground tabular-nums select-none">
                                    {formatMessageBubbleTime(msg.createdAt)}
                                  </span>
                                </CardContent>
                              )}
                            </Card>
                            </div>
                          </div>
                        );
                      });
                    })()}
                    <div ref={messagesEndRef} />
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <p className="text-muted-foreground mb-2">{t.noMessages}</p>
                    <p className="text-sm text-muted-foreground">{t.noMessagesDescription}</p>
                  </div>
                )}
                </div>
              </div>
              </>
            )}
          </div>
          {inputArea}
        </div>
      </div>

      <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 border-none bg-transparent">
          <div className="relative flex items-center justify-center">
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 text-white z-10"
              onClick={() => setSelectedImage(null)}
            >
              <X className="h-5 w-5" />
            </Button>
            {selectedImage && (
              <img 
                src={selectedImage} 
                alt="Full size" 
                className="max-w-full max-h-[90vh] object-contain rounded-lg"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!messageLayer} onOpenChange={(open) => !open && setMessageLayer(null)}>
        <DialogContent
          hideCloseButton
          className="!left-0 !top-0 !z-[120] !h-screen !w-screen !max-w-none !translate-x-0 !translate-y-0 !border-none !bg-transparent !p-0 !shadow-none"
        >
          {messageLayer && (
            <>
              <button
                type="button"
                className="absolute inset-0 animate-in fade-in bg-[rgba(245,232,210,0.45)] duration-200"
                onClick={() => setMessageLayer(null)}
                aria-label="Close message actions"
              />
              {(() => {
                const vw = typeof window !== "undefined" ? window.innerWidth : 0;
                const vh = typeof window !== "undefined" ? window.innerHeight : 0;
                const menuWidth = 280;
                const menuHeight = 280;
                const bubbleToMenuGap = 8;
                const reactionsBarMinWidth = QUICK_REACTIONS.length * 40 + 24;
                const bubbleWidth = Math.min(Math.max(messageLayer.rect.width, reactionsBarMinWidth), vw - 24);
                const left = Math.max(12, Math.min(messageLayer.rect.left, vw - bubbleWidth - 12));
                const bubbleHeight = messageLayer.rect.height;
                let bubbleTop = messageLayer.rect.top;
                let menuTop = bubbleTop + bubbleHeight + bubbleToMenuGap;
                if (menuTop + menuHeight > vh - 12) {
                  const overflow = menuTop + menuHeight - (vh - 12);
                  bubbleTop = Math.max(54, bubbleTop - overflow);
                  menuTop = bubbleTop + bubbleHeight + bubbleToMenuGap;
                }
                return (
                  <>
                    <div
                      className="absolute animate-in fade-in zoom-in-95 duration-200"
                      style={{ top: Math.max(12, bubbleTop - 42), left, width: bubbleWidth }}
                    >
                      <div className="mb-2 flex flex-nowrap items-center justify-center gap-1 whitespace-nowrap rounded-full bg-background/95 px-2 py-1 shadow-lg">
                        {QUICK_REACTIONS.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            className="rounded-full px-1.5 py-0.5 text-xl hover:bg-muted"
                            onClick={() => {
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
                      className="absolute rounded-2xl border border-border/60 bg-background/95 p-2 shadow-xl animate-in fade-in zoom-in-95 duration-200"
                      style={{ top: bubbleTop, left, width: bubbleWidth }}
                    >
                      {renderReactionPills(
                        messageLayer.message,
                        messageLayer.message.authorUserId === user?.id
                      )}
                      {renderMessageBubbleContent(
                        messageLayer.message,
                        messageLayer.message.authorUserId === user?.id
                      )}
                    </div>
                    <div
                      className="absolute w-[280px] rounded-xl border border-border bg-background p-2 shadow-2xl animate-in fade-in slide-in-from-top-1 duration-200"
                      style={{ top: menuTop, left: Math.max(12, Math.min(left, vw - menuWidth - 12)) }}
                    >
                      {renderMessageActions(messageLayer.message)}
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
            setForwardSearch('');
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
              ) : filteredForwardTargets.length === 0 ? (
                <p className="py-3 text-center text-sm text-muted-foreground">{t.messageForwardEmpty}</p>
              ) : (
                filteredForwardTargets.map((chat) => {
                  const targetConversationId = chat.conversationId;
                  if (!targetConversationId) return null;
                  const chatTitle =
                    chat.name ||
                    chat.otherParticipantName ||
                    (chat.type === "channel" ? t.searchChannels : t.chatWithDoctor);
                  const targetType: "direct" | "group" | "channel" =
                    chat.type === "group" || chat.type === "channel" ? chat.type : "direct";
                  return (
                    <button
                      key={targetConversationId}
                      type="button"
                      onClick={() =>
                        forwarding &&
                        forwardMessageMutation.mutate({
                          sourceMessageId: forwarding.id,
                          targetConversationId,
                          targetTitle: chatTitle,
                          targetType,
                        })
                      }
                      disabled={forwardMessageMutation.isPending}
                      className="flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left hover:bg-muted/40 disabled:opacity-60"
                      data-testid={`button-health-wall-forward-target-${targetConversationId}`}
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={chat.avatarUrl ?? undefined} />
                        <AvatarFallback className="text-xs">
                          {chatTitle.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{chatTitle}</p>
                      </div>
                      {forwardMessageMutation.isPending && (
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

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
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
              onClick={() => pendingDelete && deleteMessageMutation.mutate(pendingDelete.id)}
              disabled={deleteMessageMutation.isPending}
            >
              {deleteMessageMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-2 h-4 w-4" />
              )}
              {t.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showDoctorsDialog} onOpenChange={setShowDoctorsDialog}>
        <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t.manageDoctors}</DialogTitle>
            <DialogDescription>{t.addDoctorByEmail}</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder={t.doctorEmail}
                value={newDoctorEmail}
                onChange={(e) => setNewDoctorEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddDoctor()}
                data-testid="input-doctor-email"
              />
              <Button
                onClick={handleAddDoctor}
                disabled={addDoctorMutation.isPending || !newDoctorEmail.trim()}
                data-testid="button-add-doctor"
              >
                {addDoctorMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="h-4 w-4" />
                )}
              </Button>
            </div>

            {connectedDoctors && connectedDoctors.length > 0 ? (
              <div className="space-y-2">
                {connectedDoctors.map((doctor) => (
                  <div
                    key={doctor.id}
                    className="flex items-center justify-between p-3 border rounded-md"
                    data-testid={`doctor-item-${doctor.doctorUserId}`}
                  >
                    <div>
                      <p className="font-medium">
                        {doctor.firstName && doctor.lastName
                          ? `${doctor.firstName} ${doctor.lastName}`
                          : doctor.email}
                      </p>
                      {doctor.firstName && doctor.lastName && (
                        <p className="text-sm text-muted-foreground">{doctor.email}</p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeDoctorMutation.mutate(doctor.doctorUserId)}
                      disabled={removeDoctorMutation.isPending}
                      data-testid={`button-remove-doctor-${doctor.doctorUserId}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-4">
                {t.noDoctorsConnected}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {invitePatientLinkDialog}
    </div>
    </div>
  );
}
