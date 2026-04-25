import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { t } from "@/lib/i18n";
import { Loader2, Send, FileText, Image, ArrowLeft, Pill, X, GripVertical, UserPlus, Trash2, MessageCircle } from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import { ru } from "date-fns/locale";
import { useUpload } from "@/hooks/use-upload";
import { useHealthWallWs } from "@/hooks/useHealthWallWs";
import { useConversationWs, type ConversationMessageWithAuthor } from "@/hooks/useConversationWs";
import QuestionnairePanel from "@/components/QuestionnairePanel";

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

export default function HealthWall() {
  const { isAuthenticated, isLoading: authLoading, isAdmin, user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [message, setMessage] = useState('');
  const [messageMode, setMessageMode] = useState<'message' | 'prescription' | 'followup'>('message');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [uploadQueue, setUploadQueue] = useState<File[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastHealthWallReadAtRef = useRef<number>(0);
  const lastMarkedMessageIdRef = useRef<string | null>(null);
  const markReadInFlightRef = useRef(false);
  
  const [showQuestionnaire, setShowQuestionnaire] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY_PANEL);
    return saved === 'true';
  });
  const [panelWidth, setPanelWidth] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY_DIVIDER);
    return saved ? parseInt(saved) : DEFAULT_PANEL_PERCENT;
  });
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const [, chatParams] = useRoute("/health-wall/chat/:userId");
  const [, patientParams] = useRoute("/health-wall/:patientUserId");
  const peerDoctorUserId = chatParams?.userId;
  const isDoctorChatMode = !!peerDoctorUserId;
  const patientUserId = isDoctorChatMode ? undefined : (patientParams?.patientUserId || user?.id);
  const isOwnWall = !isDoctorChatMode && !!patientUserId && patientUserId === user?.id;

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("questionnaire") === "1") {
      setShowQuestionnaire(true);
      localStorage.setItem(STORAGE_KEY_PANEL, "true");
    }
  }, []);

  const { data: directConversation, isError: directChatError } = useQuery<{ conversationId: string }>({
    queryKey: ["/api/messenger/direct", peerDoctorUserId],
    queryFn: async () => {
      const res = await fetch(`/api/messenger/direct/${peerDoctorUserId}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: isAuthenticated && isDoctorChatMode && !!peerDoctorUserId,
  });
  const doctorChatConversationId = directConversation?.conversationId;

  useEffect(() => {
    if (isDoctorChatMode && directChatError) {
      toast({ title: "Не удалось открыть чат", variant: "destructive" });
      setLocation("/messenger");
    }
  }, [isDoctorChatMode, directChatError, toast, setLocation]);

  const { data: doctorChatConv } = useQuery<{ id: string; participants: { userId: string; user?: { firstName?: string; lastName?: string; email?: string } }[] }>({
    queryKey: ["/api/conversations", doctorChatConversationId],
    enabled: !!doctorChatConversationId,
  });

  const { data: conversationMessages, isLoading: conversationMessagesLoading } = useQuery<ConversationMessageWithAuthor[]>({
    queryKey: ["/api/conversations", doctorChatConversationId, "messages"],
    enabled: !!doctorChatConversationId,
  });

  useConversationWs(doctorChatConversationId, !!doctorChatConversationId);

  const sendConversationMessageMutation = useMutation({
    mutationFn: async (data: { content?: string; imageUrl?: string; messageType?: string }) => {
      const res = await apiRequest("POST", `/api/conversations/${doctorChatConversationId}/messages`, data);
      return res.json();
    },
    onSuccess: (newMessage: ConversationMessageWithAuthor, variables) => {
      queryClient.setQueryData<ConversationMessageWithAuthor[]>(
        ["/api/conversations", doctorChatConversationId, "messages"],
        (old) => {
          if (!old) return [newMessage];
          if (old.some((m) => m.id === newMessage.id)) return old;
          return [...old, newMessage];
        }
      );
      if (!variables.imageUrl) {
        setMessage("");
        const textarea = document.querySelector('[data-testid="input-message"]') as HTMLTextAreaElement;
        if (textarea) {
          textarea.style.height = "auto";
          textarea.focus();
        }
      } else {
        focusMessageInput();
      }
    },
    onError: () => {
      toast({ title: t.error, description: t.somethingWrong, variant: "destructive" });
    },
  });

  const { uploadFile, isUploading: uploadingPhoto } = useUpload({
    onSuccess: async (response) => {
      if (isDoctorChatMode && doctorChatConversationId) {
        await sendConversationMessageMutation.mutateAsync({
          content: "",
          imageUrl: response.objectPath,
          messageType: "message",
        });
      } else {
        await sendMessageMutation.mutateAsync({
          content: '',
          imageUrl: response.objectPath,
          messageType: 'message',
        });
      }
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
    enabled: isAuthenticated && !!patientUserId && !isDoctorChatMode,
  });

  useHealthWallWs(patientUserId, isAuthenticated && !!patientUserId && !isDoctorChatMode);

  const isDoctorViewingPatientWall = isAuthenticated && isAdmin && !isDoctorChatMode && !!patientUserId && !isOwnWall;

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

  const { data: connectedDoctors } = useQuery<ConnectedDoctor[]>({
    queryKey: ['/api/health-wall/my/doctors'],
    enabled: isAuthenticated && isOwnWall,
  });

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
        const textarea = document.querySelector('[data-testid="input-message"]') as HTMLTextAreaElement;
        if (textarea) {
          textarea.style.height = 'auto';
          textarea.focus();
        }
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
    if (!authLoading && !isAuthenticated) {
      setLocation('/auth');
    }
  }, [authLoading, isAuthenticated, setLocation]);

  const displayMessages: HealthWallMessage[] = useMemo(() => {
    const raw = isDoctorChatMode
      ? (conversationMessages ?? []).map((m) => ({
          id: m.id,
          patientUserId: "",
          authorUserId: m.authorUserId,
          messageType: (m.messageType || "message") as "message" | "prescription" | "followup",
          content: m.content ?? undefined,
          imageUrl: m.imageUrl ?? undefined,
          createdAt: m.createdAt,
          author: {
            id: m.author.id,
            email: m.author.email ?? undefined,
            firstName: m.author.firstName ?? undefined,
            lastName: m.author.lastName ?? undefined,
            isAdmin: m.author.isAdmin ?? undefined,
          },
        }))
      : (messages ?? []);
    return [...raw].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [isDoctorChatMode, conversationMessages, messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [displayMessages]);

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

  const toggleQuestionnaire = () => {
    setShowQuestionnaire(prev => {
      if (prev) focusMessageInput();
      return !prev;
    });
  };

  const isLoadingMessages = isDoctorChatMode
    ? (!doctorChatConversationId || conversationMessagesLoading)
    : messagesLoading;

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
    if (isDoctorChatMode) {
      sendConversationMessageMutation.mutate({
        content: message.trim(),
        messageType: "message",
      });
    } else {
      sendMessageMutation.mutate({
        content: message.trim(),
        messageType: messageMode,
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    const lineHeight = 24;
    const maxHeight = lineHeight * 6;
    el.style.height = Math.min(el.scrollHeight, maxHeight) + 'px';
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

  const formatMessageDate = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isToday(date)) {
      return `${t.today}, ${format(date, 'HH:mm')}`;
    }
    if (isYesterday(date)) {
      return `${t.yesterday}, ${format(date, 'HH:mm')}`;
    }
    return format(date, 'd MMMM, HH:mm', { locale: ru });
  };

  const getAuthorName = (author: Author) => {
    if (author.firstName) {
      return author.firstName;
    }
    return author.email?.split('@')[0] || 'User';
  };

  const peerDoctorName = isDoctorChatMode && doctorChatConv?.participants
    ? (() => {
        const other = doctorChatConv.participants.find((p) => p.userId !== user?.id);
        if (!other?.user) return t.chatWithDoctor;
        const parts = [other.user.firstName, other.user.lastName].filter(Boolean);
        return parts.length > 0 ? parts.join(" ").trim() : other.user.email?.split("@")[0] || t.chatWithDoctor;
      })()
    : null;

  const displayName = isDoctorChatMode
    ? (peerDoctorName ?? t.chatWithDoctor)
    : isOwnWall
      ? t.healthWall
      : patientInfo?.patientName || patientInfo?.email?.split('@')[0] || t.patient;
  const profileTargetUserId = isDoctorChatMode ? peerDoctorUserId : (!isOwnWall ? patientUserId : null);
  const canSelectMessageType = isAdmin && !isOwnWall && !isDoctorChatMode;
  const messageTypeConfig: Record<'message' | 'prescription' | 'followup', { label: string; icon: typeof MessageCircle; activeClass: string }> = {
    message: { label: "Сообщение", icon: MessageCircle, activeClass: "" },
    prescription: { label: t.prescription, icon: Pill, activeClass: "bg-green-600 hover:bg-green-700 text-white" },
    followup: { label: t.followup, icon: FileText, activeClass: "bg-purple-600 hover:bg-purple-700 text-white" },
  };
  const selectedMode = messageTypeConfig[messageMode];

  const handleBackClick = () => {
    if (isDoctorChatMode) {
      setLocation("/messenger");
      return;
    }
    if (isOwnWall) {
      setLocation('/');
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
              placeholder={
                messageMode === 'prescription' ? t.prescriptionPlaceholder : 
                messageMode === 'followup' ? t.followupPlaceholder : 
                t.writeMessage
              }
              value={message}
              onChange={handleTextareaInput}
              onKeyDown={handleKeyDown}
              rows={1}
              className={`min-h-[36px] resize-none overflow-y-auto rounded-full ${
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
            disabled={!message.trim() || (isDoctorChatMode ? sendConversationMessageMutation.isPending : sendMessageMutation.isPending)}
            size="icon"
            className="rounded-full shrink-0 h-10 w-10"
            data-testid="button-send-message"
          >
            {(isDoctorChatMode ? sendConversationMessageMutation.isPending : sendMessageMutation.isPending) ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
  );

  return (
    <div className="flex flex-col h-full" ref={containerRef}>
      <div className="border-b px-4 py-3 flex items-center gap-3 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleBackClick}
          data-testid="button-back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          {isDoctorChatMode ? (
            <h1
              className={`text-lg font-bold ${profileTargetUserId ? "cursor-pointer hover:opacity-80" : ""}`}
              data-testid="text-health-wall-title"
              onClick={() => profileTargetUserId && setLocation(`/profile/${profileTargetUserId}`)}
            >
              {displayName}
            </h1>
          ) : isOwnWall ? (
            <>
              {connectedDoctors && connectedDoctors.length > 0 ? (
                <button
                  onClick={() => setShowDoctorsDialog(true)}
                  className="text-left hover:opacity-80 transition-opacity"
                  data-testid="button-manage-doctors"
                >
                  <p className="text-lg font-bold" data-testid="text-health-wall-title">
                    {connectedDoctors.map(d => 
                      d.firstName && d.lastName 
                        ? `${d.firstName} ${d.lastName}`
                        : d.email
                    ).join(', ')}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {connectedDoctors.length === 1 
                      ? formatDoctorLastVisit(connectedDoctors[0].lastVisitedAt)
                      : connectedDoctors.map(d => {
                          const name = d.firstName || d.email?.split('@')[0] || '';
                          return `${name}: ${formatDoctorLastVisit(d.lastVisitedAt)}`;
                        }).join(' | ')
                    }
                  </p>
                </button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDoctorsDialog(true)}
                  data-testid="button-connect-doctor"
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  {t.connectDoctor}
                </Button>
              )}
            </>
          ) : (
            <>
              <h1
                className={`text-lg font-bold ${profileTargetUserId ? "cursor-pointer hover:opacity-80" : ""}`}
                data-testid="text-health-wall-title"
                onClick={() => profileTargetUserId && setLocation(`/profile/${profileTargetUserId}`)}
              >
                {displayName}
              </h1>
              {patientInfo && (
                <p className="text-sm text-muted-foreground">
                  {formatDoctorLastVisit(patientInfo.patientLastVisitedAt)}
                </p>
              )}
            </>
          )}
        </div>
        {!isDoctorChatMode && (
          <Button
            variant={showQuestionnaire ? "default" : "outline"}
            size="icon"
            onClick={toggleQuestionnaire}
            data-testid="button-toggle-questionnaire"
          >
            {showQuestionnaire ? <MessageCircle className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
          </Button>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        {showQuestionnaire && !isMobile && !isDoctorChatMode && (
          <>
            <div 
              className="h-full overflow-hidden border-r bg-background"
              style={{ width: `${panelWidth}%` }}
            >
              <QuestionnairePanel 
                patientUserId={patientUserId!} 
                isOwnQuestionnaire={isOwnWall}
                initialViewMode="view"
              />
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

        <div className={`relative flex flex-col ${showQuestionnaire && !isMobile && !isDoctorChatMode ? '' : 'flex-1'}`} style={showQuestionnaire && !isMobile && !isDoctorChatMode ? { width: `${100 - panelWidth}%` } : {}}>
          <div className="flex-1 relative min-h-0">
            {isMobile && showQuestionnaire && !isDoctorChatMode ? (
              <div className="absolute inset-0 z-10 bg-background overflow-y-auto">
                <QuestionnairePanel 
                  patientUserId={patientUserId!} 
                  isOwnQuestionnaire={isOwnWall}
                  initialViewMode="view"
                />
              </div>
            ) : (
              <div className="h-full overflow-y-auto px-4 py-4 pb-32 space-y-3">
                {displayMessages.length > 0 ? (
                  <>
                    {(() => {
                      const filteredMessages = isDoctorChatMode
                        ? displayMessages
                        : isOwnWall 
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
                              <Card className={`max-w-[85%] ${isOwnMessage ? 'bg-primary/10' : ''}`}>
                                <CardContent className="p-3">
                                  <div className={`grid gap-1 mb-2 ${
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
                                  <p className="text-xs text-muted-foreground">
                                    {formatMessageDate(lastMsg.createdAt)}
                                  </p>
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
                              className={`max-w-[85%] ${
                                isPrescription 
                                  ? 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800' 
                                  : isFollowup
                                    ? 'bg-purple-50 dark:bg-purple-950 border-purple-200 dark:border-purple-800'
                                    : isOwnMessage 
                                      ? 'bg-primary/10' 
                                      : ''
                              }`}
                            >
                              <CardContent className="p-3">
                                {isPrescription && (
                                  <div className="mb-1">
                                    <Badge variant="secondary" className="bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 text-xs">
                                      <Pill className="h-3 w-3 mr-1" />
                                      {t.prescription}
                                    </Badge>
                                  </div>
                                )}
                                {isFollowup && (
                                  <div className="mb-1">
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
                                    className="rounded-md max-h-64 mb-2 cursor-pointer hover:opacity-90 transition-opacity"
                                    data-testid={`image-${msg.id}`}
                                    onClick={() => setSelectedImage(msg.imageUrl!)}
                                  />
                                )}
                                {msg.content && (
                                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                                )}
                                <p className="text-xs text-muted-foreground mt-1">
                                  {formatMessageDate(msg.createdAt)}
                                </p>
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
    </div>
  );
}
