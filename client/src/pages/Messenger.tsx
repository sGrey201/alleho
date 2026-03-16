import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { t } from "@/lib/i18n";
import { Loader2, ArrowLeft, User, Users, MessageCircle, Radio } from "lucide-react";
import ConversationChat from "@/components/ConversationChat";

export type ChatItem = {
  source: "health_wall" | "conversation";
  folder: "personal" | "groups" | "channels";
  patientUserId?: string;
  patientName?: string;
  patientEmail?: string;
  lastMessageAt?: string | null;
  unreadCount?: number;
  chatKind?: "patient";
  conversationId?: string;
  type?: string;
  name?: string | null;
  participantCount?: number;
  myRole?: string;
};

export default function Messenger() {
  const { isAuthenticated, isLoading: authLoading, isAdmin } = useAuth();
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/messenger/conv/:conversationId");
  const conversationId = params?.conversationId;

  const [folder, setFolder] = useState<"personal" | "groups" | "channels">("personal");

  const { data: chats, isLoading } = useQuery<ChatItem[]>({
    queryKey: ["/api/me/chats"],
    enabled: isAuthenticated && isAdmin,
  });

  const filtered = (chats ?? []).filter((c) => c.folder === folder);

  const handleSelectChat = (chat: ChatItem) => {
    if (chat.source === "health_wall" && chat.patientUserId) {
      setLocation(`/health-wall/${chat.patientUserId}`);
      return;
    }
    if (chat.source === "conversation" && chat.conversationId) {
      setLocation(`/messenger/conv/${chat.conversationId}`);
    }
  };

  if (authLoading || !isAuthenticated) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!isAdmin) {
    setLocation("/");
    return null;
  }

  return (
    <div className="flex h-full flex-col md:flex-row">
      <div className="w-full md:w-80 border-b md:border-b-0 md:border-r flex flex-col shrink-0 bg-background">
        <div className="p-3 border-b flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="font-semibold">{t.messenger}</h1>
        </div>
        <Tabs value={folder} onValueChange={(v) => setFolder(v as typeof folder)} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid grid-cols-3 w-full rounded-none border-b h-auto p-0">
            <TabsTrigger value="personal" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none">
              <User className="h-4 w-4 mr-1" />
              {t.folderPersonal}
            </TabsTrigger>
            <TabsTrigger value="groups" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none">
              <Users className="h-4 w-4 mr-1" />
              {t.folderGroups}
            </TabsTrigger>
            <TabsTrigger value="channels" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none">
              <Radio className="h-4 w-4 mr-1" />
              {t.folderChannels}
            </TabsTrigger>
          </TabsList>
          <TabsContent value={folder} className="flex-1 m-0 min-h-0 overflow-hidden">
            {isLoading ? (
              <div className="flex items-center justify-center p-4">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="p-4 text-muted-foreground text-sm">{t.noChats}</p>
            ) : (
              <ScrollArea className="h-full">
                {filtered.map((chat) => {
                  const isSelected = chat.source === "conversation" && chat.conversationId === conversationId;
                  const label =
                    chat.source === "health_wall"
                      ? chat.patientName ?? chat.patientEmail ?? t.patient
                      : chat.name ?? (chat.type === "direct" ? t.chatWithDoctor : chat.type === "consilium" ? t.chatConsilium : chat.type === "channel" ? (chat.myRole === "owner" ? t.channelOwn : t.channelSub) : t.chatGroup);
                  const badge =
                    chat.source === "health_wall"
                      ? t.chatWithPatient
                      : chat.type === "direct"
                        ? t.chatWithDoctor
                        : chat.type === "consilium"
                          ? t.chatConsilium
                          : chat.type === "channel"
                            ? (chat.myRole === "owner" ? t.channelOwn : t.channelSub)
                            : t.chatGroup;
                  return (
                    <button
                      key={chat.source === "health_wall" ? chat.patientUserId! : chat.conversationId!}
                      type="button"
                      onClick={() => handleSelectChat(chat)}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b hover:bg-muted/50 ${isSelected ? "bg-muted" : ""}`}
                    >
                      <div className="rounded-full bg-primary/10 p-2">
                        {chat.source === "health_wall" || chat.type === "direct" ? (
                          <User className="h-4 w-4 text-primary" />
                        ) : chat.type === "channel" ? (
                          <Radio className="h-4 w-4 text-primary" />
                        ) : (
                          <Users className="h-4 w-4 text-primary" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{label}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Badge variant="secondary" className="text-[10px] px-1 py-0">
                            {badge}
                          </Badge>
                          {chat.lastMessageAt && (
                            <span>
                              {new Date(chat.lastMessageAt).toLocaleDateString()}
                            </span>
                          )}
                        </p>
                      </div>
                      {chat.unreadCount != null && chat.unreadCount > 0 && (
                        <Badge variant="default" className="rounded-full h-5 min-w-5">
                          {chat.unreadCount}
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </ScrollArea>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <div className="flex-1 flex flex-col min-h-0 bg-muted/20">
        {conversationId ? (
          <ConversationChat conversationId={conversationId} onBack={() => setLocation("/messenger")} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <MessageCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>{t.selectChat}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
