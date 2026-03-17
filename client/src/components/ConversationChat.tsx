import { useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useConversationWs, type ConversationMessageWithAuthor } from "@/hooks/useConversationWs";
import { t } from "@/lib/i18n";
import { Loader2, Send, ArrowLeft } from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import { ru } from "date-fns/locale";
import { useState } from "react";

interface ConversationInfo {
  id: string;
  type: string;
  name?: string | null;
  patientUserId?: string | null;
  participants?: unknown[];
}

interface ConversationChatProps {
  conversationId: string;
  onBack: () => void;
}

export default function ConversationChat({ conversationId, onBack }: ConversationChatProps) {
  const { user } = useAuth();
  const [message, setMessage] = useState("");
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

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="border-b px-4 py-3 flex items-center gap-3 shrink-0">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="font-semibold truncate flex-1">{conv.name ?? (conv.type === "direct" ? t.chatWithDoctor : conv.type)}</h1>
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
    </div>
  );
}
