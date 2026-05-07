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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { t } from "@/lib/i18n";
import { Loader2, Send, FileText, Image, ArrowLeft, Pill, X, GripVertical, UserPlus, Trash2, MessageCircle, Menu, Copy, Share2 } from "lucide-react";
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
  email?: string;
  firstName?: string;
  lastName?: string;
  isAdmin?: boolean;
}

interface HealthWallMessage {
  id: string;
  patientUserId: string;
  authorUserId: string;
  messageType: 'message' | 'prescription' | 'followup';
  content?: string;
  imageUrl?: string;
  createdAt: string;
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

/** Thumbnail URL for chat list; full image loads only when user clicks to enlarge. */
function getThumbUrl(url: string): string {
  return url + (url.includes("?") ? "&" : "?") + "size=thumb";
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const messagesContentRef = useRef<HTMLDivElement>(null);
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
    mutationFn: async (data: { content?: string; imageUrl?: string; messageType: string }) => {
      if (!patientUserId) throw new Error("No patient");
      return apiRequest('POST', `/api/health-wall/${patientUserId}`, data);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/health-wall', patientUserId] });
      if (!variables.imageUrl) {
        setMessage('');
        setMessageMode('message');
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
    if (!message.trim()) return;
    sendMessageMutation.mutate({
      content: message.trim(),
      messageType: messageMode,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    syncChatTextareaHeight(e.target);
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

  const inputArea = (
    <div className="absolute inset-x-0 bottom-0 z-20 bg-transparent px-4 py-4">
        <div className="flex items-end gap-2">
          {!message.trim() && (
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
                messageMode === 'prescription' ? t.prescriptionPlaceholder : 
                messageMode === 'followup' ? t.followupPlaceholder : 
                t.writeMessage
              }
              value={message}
              onChange={handleTextareaInput}
              onKeyDown={handleKeyDown}
              rows={1}
              className={`min-h-[36px] resize-none overflow-y-auto rounded-[22px] ${
                messageMode === 'prescription' ? 'border-green-300 dark:border-green-700' : 
                messageMode === 'followup' ? 'border-purple-300 dark:border-purple-700' : 
                ''
              } ${canSelectMessageType ? 'pr-14' : ''}`}
              style={{ maxHeight: '144px' }}
              data-testid="input-message"
            />
            {canSelectMessageType && (
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
            disabled={!message.trim() || sendMessageMutation.isPending}
            size="icon"
            className="rounded-full shrink-0 h-10 w-10"
            data-testid="button-send-message"
          >
            {sendMessageMutation.isPending ? (
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
              <div
                ref={messagesScrollRef}
                className={`h-full overflow-y-auto px-4 pb-32 ${showQuestionnaire ? "pt-4" : "pt-20"}`}
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
                        const isImageOnly = msg.imageUrl && !msg.content && msg.messageType === 'message';
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
                              className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
                              data-testid={`message-group-${groupIndex}`}
                            >
                              <Card className={`max-w-[85%] min-w-28 ${isOwnMessage ? 'bg-emerald-100 dark:bg-emerald-900 border-emerald-200 dark:border-emerald-800' : ''}`}>
                                <CardContent className="relative min-h-[2.75rem] p-2 pb-3.5">
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
                        
                        return (
                          <div
                            key={msg.id}
                            className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
                            data-testid={`message-${msg.id}`}
                          >
                            <Card 
                              className={`max-w-[85%] min-w-28 ${
                                isPrescription 
                                  ? 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800' 
                                  : isFollowup
                                    ? 'bg-purple-50 dark:bg-purple-950 border-purple-200 dark:border-purple-800'
                                    : isOwnMessage 
                                      ? 'bg-emerald-100 dark:bg-emerald-900 border-emerald-200 dark:border-emerald-800' 
                                      : ''
                              }`}
                            >
                              <CardContent className="relative min-h-[2.75rem] p-2 pb-3.5">
                                {isPrescription && (
                                  <div className="mb-0.5">
                                    <Badge variant="secondary" className="bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 text-xs">
                                      <Pill className="h-3 w-3 mr-1" />
                                      {t.prescription}
                                    </Badge>
                                  </div>
                                )}
                                {isFollowup && (
                                  <div className="mb-0.5">
                                    <Badge variant="secondary" className="bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 text-xs">
                                      <FileText className="h-3 w-3 mr-1" />
                                      {t.followup}
                                    </Badge>
                                  </div>
                                )}
                                {msg.imageUrl && (
                                  <img 
                                    src={getThumbUrl(msg.imageUrl)} 
                                    alt="Uploaded" 
                                    className="rounded-md max-h-64 mb-0.5 cursor-pointer hover:opacity-90 transition-opacity"
                                    data-testid={`image-${msg.id}`}
                                    onClick={() => setSelectedImage(msg.imageUrl!)}
                                  />
                                )}
                                {msg.content && (
                                  <p className="text-sm whitespace-pre-wrap leading-snug pr-7 pb-0.5">
                                    {msg.content}
                                  </p>
                                )}
                                <span className="pointer-events-none absolute bottom-0.5 right-1.5 text-[10px] leading-none text-muted-foreground tabular-nums select-none">
                                  {formatMessageBubbleTime(msg.createdAt)}
                                </span>
                              </CardContent>
                            </Card>
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
    </div>
    </div>
  );
}
