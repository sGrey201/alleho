import { useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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

interface ConversationInfo {
  id: string;
  type: string;
  name?: string | null;
  avatarUrl?: string | null;
  patientUserId?: string | null;
  participants?: Array<{
    userId: string;
    role: string;
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
  const { toast } = useToast();
  const [message, setMessage] = useState("");
  const [addMembersOpen, setAddMembersOpen] = useState(false);
  const [doctorSearch, setDoctorSearch] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (!message.trim()) return;
    sendMutation.mutate({ content: message.trim(), messageType: "message" });
  };

  const handleUploadImages = async (files: File[]) => {
    for (const file of files) {
      await uploadFile(file);
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    if (isToday(d)) return format(d, "HH:mm", { locale: ru });
    if (isYesterday(d)) return `${t.yesterday} ${format(d, "HH:mm", { locale: ru })}`;
    return format(d, "dd.MM.yyyy HH:mm", { locale: ru });
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
  const headerAvatarUrl = conv.type === "direct"
    ? (peerParticipant?.user?.profileImageUrl ?? null)
    : (conv.avatarUrl ?? null);
  const headerInitials = title
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";

  const isGroup = conv.type === "group";
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
            className="h-10 w-10 rounded-full border border-border/40 bg-background/55 backdrop-blur-md"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <button
            type="button"
            onClick={onTitleClick}
            disabled={!onTitleClick}
            className={`flex-1 rounded-full border border-border/40 bg-background/55 px-4 py-2 text-left backdrop-blur-md ${onTitleClick ? "cursor-pointer hover:opacity-90 transition-opacity" : ""}`}
          >
            <p className="text-sm font-semibold truncate">{title}</p>
          </button>
          <button
            type="button"
            onClick={onTitleClick}
            disabled={!onTitleClick}
            className={`h-10 w-10 rounded-full border border-border/40 bg-background/55 p-0 backdrop-blur-md ${onTitleClick ? "cursor-pointer hover:opacity-90 transition-opacity" : ""}`}
          >
            <Avatar className="h-full w-full">
              <AvatarImage src={headerAvatarUrl || undefined} />
              <AvatarFallback className="text-xs font-semibold">{headerInitials}</AvatarFallback>
            </Avatar>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pt-20 pb-32 space-y-3">
        {messagesLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : messages && messages.length > 0 ? (
          [...messages]
            .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
            .map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col max-w-[85%] ${msg.authorUserId === user?.id ? "ml-auto items-end" : "mr-auto items-start"}`}
            >
              {msg.authorUserId !== user?.id && (
                <p className="text-xs text-muted-foreground mb-0.5">{authorName(msg)}</p>
              )}
              <div
                className={`rounded-2xl px-4 py-2 ${
                  msg.authorUserId === user?.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}
              >
                {msg.imageUrl && (
                  <a href={msg.imageUrl} target="_blank" rel="noopener noreferrer" className="block mb-1">
                    <img src={msg.imageUrl} alt="" className="max-w-full rounded max-h-48 object-contain" />
                  </a>
                )}
                {msg.content && <p className="whitespace-pre-wrap break-words">{msg.content}</p>}
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">{formatDate(msg.createdAt)}</p>
            </div>
          ))
        ) : (
          <p className="text-center text-muted-foreground py-8">{t.noMessages}</p>
        )}
        <div ref={messagesEndRef} />
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
