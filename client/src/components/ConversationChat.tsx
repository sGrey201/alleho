import { useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useConversationWs, type ConversationMessageWithAuthor } from "@/hooks/useConversationWs";
import { t } from "@/lib/i18n";
import { Loader2, Send, ArrowLeft, Users } from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import { ru } from "date-fns/locale";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

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
    mutationFn: async (data: { content?: string; messageType?: string }) => {
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

  const isGroup = conv.type === "group";
  const myRole = conv.participants?.find((p) => p.userId === user?.id)?.role;
  const participantIds = new Set((conv.participants ?? []).map((p) => p.userId));
  const candidates = (doctorSearchData?.doctors ?? []).filter((d) => !participantIds.has(d.userId));

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="border-b px-4 py-3 flex items-center gap-3 shrink-0">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        {(conv.type === "group" || conv.type === "channel") && (
          <Avatar
            className={`h-8 w-8 shrink-0 ${onTitleClick ? "cursor-pointer hover:opacity-80" : ""}`}
            onClick={onTitleClick}
          >
            <AvatarImage src={conv.avatarUrl || undefined} />
            <AvatarFallback>{(title || "?").charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>
        )}
        <h1
          className={`font-semibold truncate flex-1 ${onTitleClick ? "cursor-pointer hover:opacity-80" : ""}`}
          onClick={onTitleClick}
        >
          {title}
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
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

      <div className="border-t px-4 py-3 shrink-0 flex gap-2 items-end">
        <Textarea
          placeholder={t.writeMessage}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          rows={1}
          className="min-h-[40px] max-h-32 resize-none"
        />
        <Button
          size="icon"
          onClick={handleSend}
          disabled={!message.trim() || sendMutation.isPending}
          className="shrink-0 h-10 w-10"
        >
          {sendMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
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
    </div>
  );
}
