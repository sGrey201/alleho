import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useRoute, Link, Redirect } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import { Loader2, User, Users, MessageCircle, Radio, Search, Plus, Send } from "lucide-react";
import ConversationChat from "@/components/ConversationChat";
import Profile from "@/pages/Profile";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

function formatChatTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  const today = now.toDateString() === d.toDateString();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  if (today) return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  if (d >= weekAgo) return d.toLocaleDateString("ru-RU", { weekday: "short" });
  if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

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
  otherParticipantName?: string;
  otherParticipantId?: string;
  participantCount?: number;
  myRole?: string;
};

export type MessengerSearchDoctor = {
  userId: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  conversationId?: string;
};
export type MessengerSearchGroup = { id: string; name: string | null; participantCount: number; isMember: boolean };
export type MessengerSearchChannel = { id: string; name: string | null; isMember: boolean };
export type MessengerSearchResults = {
  doctors: MessengerSearchDoctor[];
  groups: MessengerSearchGroup[];
  channels: MessengerSearchChannel[];
};

export default function Messenger() {
  const { isAuthenticated, isLoading: authLoading, isAdmin } = useAuth();
  const [location, setLocation] = useLocation();
  const [, convParams] = useRoute("/messenger/conv/:conversationId");
  const conversationId = convParams?.conversationId;

  const isChatSelected = (chat: ChatItem) =>
    chat.source === "conversation" && !!conversationId && chat.conversationId === conversationId;
  const [showProfilePanel, setShowProfilePanel] = useState(false);
  const [showSearchBar, setShowSearchBar] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const isProfile = showProfilePanel;
  const { toast } = useToast();
  const qc = useQueryClient();

  useEffect(() => {
    if (!showSearchBar) return;
    const t = setTimeout(() => setDebouncedSearchQuery(searchQuery), 280);
    return () => clearTimeout(t);
  }, [showSearchBar, searchQuery]);

  const [folder, setFolder] = useState<"personal" | "groups" | "channels">("personal");
  const [createConversationType, setCreateConversationType] = useState<"group" | "channel" | null>(null);
  const [createConversationName, setCreateConversationName] = useState("");
  const [invitePatientOpen, setInvitePatientOpen] = useState(false);
  const [invitePatientEmail, setInvitePatientEmail] = useState("");

  const { data: chats, isLoading } = useQuery<ChatItem[]>({
    queryKey: ["/api/me/chats"],
    enabled: isAuthenticated && isAdmin,
  });

  const { data: searchResults, isLoading: searchLoading, isError: searchError, refetch: refetchSearch } = useQuery<MessengerSearchResults>({
    queryKey: ["/api/messenger/search", debouncedSearchQuery],
    queryFn: async () => {
      const url = `/api/messenger/search?q=${encodeURIComponent(debouncedSearchQuery)}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: isAuthenticated && isAdmin && showSearchBar,
  });

  const filtered = (chats ?? []).filter((c) => c.folder === folder);

  function filterChatsBySearch(items: ChatItem[], query: string): ChatItem[] {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    const words = q.split(/\s+/).filter(Boolean);
    return items.filter((chat) => {
      const searchable =
        chat.source === "health_wall"
          ? [chat.patientName, chat.patientEmail].filter(Boolean).join(" ")
          : chat.type === "direct"
            ? (chat.otherParticipantName ?? "")
            : (chat.name ?? "");
      const searchableNorm = searchable.toLowerCase();
      return words.every((w) => searchableNorm.includes(w));
    });
  }

  const searchFiltered =
    showSearchBar && searchQuery.trim()
      ? filterChatsBySearch(chats ?? [], searchQuery)
      : [];
  const listToShow =
    showSearchBar && searchQuery.trim() ? searchFiltered : filtered;

  const handleSelectChat = (chat: ChatItem) => {
    if (chat.source === "health_wall" && chat.patientUserId) {
      setLocation(`/health-wall/${chat.patientUserId}`);
      return;
    }
    if (chat.source === "conversation" && chat.type === "direct" && chat.otherParticipantId) {
      setLocation(`/health-wall/chat/${chat.otherParticipantId}`);
      setShowSearchBar(false);
      setSearchQuery("");
      return;
    }
    if (chat.source === "conversation" && chat.conversationId) {
      setLocation(`/messenger/conv/${chat.conversationId}`);
    }
  };

  const handleSelectDoctor = (doctor: MessengerSearchDoctor) => {
    setShowSearchBar(false);
    setSearchQuery("");
    setLocation(`/health-wall/chat/${doctor.userId}`);
  };

  const handleSelectGroup = async (group: MessengerSearchGroup) => {
    if (group.isMember) {
      setLocation(`/messenger/conv/${group.id}`);
      return;
    }
    try {
      await apiRequest("POST", `/api/conversations/${group.id}/join`);
      await qc.invalidateQueries({ queryKey: ["/api/me/chats"] });
      setLocation(`/messenger/conv/${group.id}`);
    } catch (e) {
      toast({ title: "Ошибка вступления в группу", variant: "destructive" });
    }
  };

  const invitePatientMutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await apiRequest("POST", "/api/invite-patient", { email });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: t.inviteSuccess,
        description: t.inviteSuccessDescription,
      });
      setInvitePatientEmail("");
      setInvitePatientOpen(false);
      qc.invalidateQueries({ queryKey: ["/api/my-patients"] });
      qc.invalidateQueries({ queryKey: ["/api/me/chats"] });
    },
    onError: (error: Error) => {
      const msg = error?.message || "";
      if (msg.includes("409")) {
        toast({ title: t.inviteUserExists, variant: "destructive" });
      } else {
        toast({ title: t.inviteError, variant: "destructive" });
      }
    },
  });

  const createConversationMutation = useMutation({
    mutationFn: async (payload: { type: "group" | "channel"; name: string }) => {
      const res = await apiRequest("POST", "/api/conversations", {
        type: payload.type,
        name: payload.name.trim(),
      });
      return res.json() as { id: string };
    },
    onSuccess: (data, variables) => {
      qc.invalidateQueries({ queryKey: ["/api/me/chats"] });
      setCreateConversationType(null);
      setCreateConversationName("");
      setFolder(variables.type === "channel" ? "channels" : "groups");
      setLocation(`/messenger/conv/${data.id}`);
    },
    onError: () => {
      toast({ title: t.messengerCreateFailed, variant: "destructive" });
    },
  });

  const handleSelectChannel = async (channel: MessengerSearchChannel) => {
    if (channel.isMember) {
      setLocation(`/messenger/conv/${channel.id}`);
      return;
    }
    try {
      await apiRequest("POST", `/api/conversations/${channel.id}/subscribe`);
      await qc.invalidateQueries({ queryKey: ["/api/me/chats"] });
      setLocation(`/messenger/conv/${channel.id}`);
    } catch (e) {
      toast({ title: "Ошибка подписки на канал", variant: "destructive" });
    }
  };

  if (authLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Redirect to="/auth" />;
  }
  if (!isAdmin) {
    setLocation("/");
    return null;
  }

  return (
    <div className="flex h-full flex-col md:flex-row pb-14 md:pb-0">
      {!showProfilePanel && (
      <div className={`w-full md:w-80 border-b md:border-b-0 flex flex-col shrink-0 bg-background ${showSearchBar ? "min-h-[50vh] md:min-h-0" : ""}`}>
        <Tabs value={folder} onValueChange={(v) => setFolder(v as typeof folder)} className="flex-1 flex flex-col min-h-0 bg-gray-50">
          {/* Floating top panel on mobile — Telegram-style */}
          <div className="mt-2 mx-3 md:mt-0 md:mx-0 flex items-center gap-1.5 shrink-0 z-10 md:border-b pt-1.5 pb-1 md:pt-0 md:pb-0">
            <div className="flex-1 min-w-0 rounded-2xl md:rounded-none shadow-md md:shadow-none bg-background px-1.5 md:px-0">
              <TabsList className="grid grid-cols-3 w-full rounded-none border-0 bg-transparent h-auto p-0 min-h-[36px] md:min-h-0">
                <TabsTrigger
                  value="personal"
                  className="rounded-md data-[state=active]:bg-muted/60 md:data-[state=active]:bg-background data-[state=active]:shadow-none py-1.5 md:py-1"
                >
                  <User className="h-4 w-4 mr-1" />
                  {t.folderPersonal}
                </TabsTrigger>
                <TabsTrigger
                  value="groups"
                  className="rounded-md data-[state=active]:bg-muted/60 md:data-[state=active]:bg-background data-[state=active]:shadow-none py-1.5 md:py-1"
                >
                  <Users className="h-4 w-4 mr-1" />
                  {t.folderGroups}
                </TabsTrigger>
                <TabsTrigger
                  value="channels"
                  className="rounded-md data-[state=active]:bg-muted/60 md:data-[state=active]:bg-background data-[state=active]:shadow-none py-1.5 md:py-1"
                >
                  <Radio className="h-4 w-4 mr-1" />
                  {t.folderChannels}
                </TabsTrigger>
              </TabsList>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0 rounded-full shadow-md md:shadow-none border-border"
                  aria-label={t.newChat}
                >
                  <Plus className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem
                  onSelect={() => {
                    setInvitePatientEmail("");
                    setInvitePatientOpen(true);
                  }}
                >
                  {t.messengerInvitePatient}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    setShowSearchBar(true);
                    setSearchQuery("");
                    setFolder("personal");
                  }}
                >
                  {t.messengerInviteHomeopath}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    setCreateConversationName("");
                    setCreateConversationType("group");
                  }}
                >
                  {t.createGroup}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    setCreateConversationName("");
                    setCreateConversationType("channel");
                  }}
                >
                  {t.createChannel}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {showSearchBar ? (
            <div className="hidden md:flex mx-0 px-3 py-2 gap-2 items-center border-b border-border/60 bg-background shrink-0">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t.searchMessengerPlaceholder}
                className="flex-1"
                autoFocus
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="shrink-0"
                onClick={() => {
                  setShowSearchBar(false);
                  setSearchQuery("");
                }}
              >
                {t.cancel}
              </Button>
            </div>
          ) : null}
          <TabsContent value={folder} className="flex-1 m-0 min-h-0 overflow-hidden bg-background">
            {showSearchBar ? (
              searchLoading && !searchResults ? (
                <div className="flex items-center justify-center p-4 min-h-[200px]">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : searchError ? (
                <div className="flex flex-col items-center justify-center p-4 min-h-[200px] text-center">
                  <p className="text-sm text-muted-foreground mb-2">{t.searchError}</p>
                  <Button variant="outline" size="sm" onClick={() => refetchSearch()}>
                    {t.retry}
                  </Button>
                </div>
              ) : (
                <ScrollArea className="h-full min-h-[200px]">
                  <div className="pt-1 pb-2">
                    {searchFiltered.length > 0 && (
                      <section className="mb-2">
                        <p className="px-4 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          {t.chatsTab}
                        </p>
                        {searchFiltered.map((chat) => {
                          const isSelected = isChatSelected(chat);
                          const label =
                            chat.source === "health_wall"
                              ? chat.patientName ?? chat.patientEmail ?? t.patient
                              : chat.type === "direct"
                                ? (chat.otherParticipantName ?? t.chatWithDoctor)
                                : chat.name ?? (chat.type === "consilium" ? t.chatConsilium : chat.type === "channel" ? (chat.myRole === "owner" ? t.channelOwn : t.channelSub) : t.chatGroup);
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
                              className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-border/50 hover:bg-muted/40 active:bg-muted/60 ${isSelected ? "bg-muted/70" : "bg-background"}`}
                            >
                              <div className="rounded-full bg-primary/10 p-2.5 shrink-0 size-11 flex items-center justify-center">
                                {chat.source === "health_wall" || chat.type === "direct" ? (
                                  <User className="h-5 w-5 text-primary" />
                                ) : chat.type === "channel" ? (
                                  <Radio className="h-5 w-5 text-primary" />
                                ) : (
                                  <Users className="h-5 w-5 text-primary" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-foreground truncate">{label}</p>
                                <p className="text-[13px] text-muted-foreground truncate mt-0.5">{badge}</p>
                              </div>
                            </button>
                          );
                        })}
                      </section>
                    )}
                    {searchResults && searchResults.doctors.length > 0 && (
                      <section className="mb-2">
                        <p className="px-4 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          {t.searchDoctors}
                        </p>
                        {searchResults.doctors.map((doctor) => {
                          const name = [doctor.firstName, doctor.lastName].filter(Boolean).join(" ") || doctor.email || t.chatWithDoctor;
                          return (
                            <button
                              key={doctor.userId}
                              type="button"
                              onClick={() => handleSelectDoctor(doctor)}
                              className="w-full flex items-center gap-3 px-4 py-3 text-left border-b border-border/50 hover:bg-muted/40 active:bg-muted/60 bg-background"
                            >
                              <div className="rounded-full bg-primary/10 p-2.5 shrink-0 size-11 flex items-center justify-center">
                                <User className="h-5 w-5 text-primary" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-foreground truncate">{name}</p>
                                <p className="text-[13px] text-muted-foreground truncate mt-0.5">
                                  {doctor.conversationId ? t.chatsTab : t.actionWrite}
                                </p>
                              </div>
                            </button>
                          );
                        })}
                      </section>
                    )}
                    {searchResults && searchResults.groups.length > 0 && (
                      <section className="mb-2">
                        <p className="px-4 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          {t.searchGroups}
                        </p>
                        {searchResults.groups.map((group) => (
                          <button
                            key={group.id}
                            type="button"
                            onClick={() => handleSelectGroup(group)}
                            className="w-full flex items-center gap-3 px-4 py-3 text-left border-b border-border/50 hover:bg-muted/40 active:bg-muted/60 bg-background"
                          >
                            <div className="rounded-full bg-primary/10 p-2.5 shrink-0 size-11 flex items-center justify-center">
                              <Users className="h-5 w-5 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-foreground truncate">{group.name || t.chatGroup}</p>
                              <p className="text-[13px] text-muted-foreground truncate mt-0.5">
                                {group.isMember ? t.chatsTab : t.actionJoin}
                              </p>
                            </div>
                          </button>
                        ))}
                      </section>
                    )}
                    {searchResults && searchResults.channels.length > 0 && (
                      <section className="mb-2">
                        <p className="px-4 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          {t.searchChannels}
                        </p>
                        {searchResults.channels.map((channel) => (
                          <button
                            key={channel.id}
                            type="button"
                            onClick={() => handleSelectChannel(channel)}
                            className="w-full flex items-center gap-3 px-4 py-3 text-left border-b border-border/50 hover:bg-muted/40 active:bg-muted/60 bg-background"
                          >
                            <div className="rounded-full bg-primary/10 p-2.5 shrink-0 size-11 flex items-center justify-center">
                              <Radio className="h-5 w-5 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-foreground truncate">{channel.name || t.channelSub}</p>
                              <p className="text-[13px] text-muted-foreground truncate mt-0.5">
                                {channel.isMember ? t.chatsTab : t.actionSubscribe}
                              </p>
                            </div>
                          </button>
                        ))}
                      </section>
                    )}
                    {showSearchBar && !searchLoading && searchResults && searchFiltered.length === 0 && searchResults.doctors.length === 0 && searchResults.groups.length === 0 && searchResults.channels.length === 0 && (
                      <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                        {debouncedSearchQuery.trim() ? t.noResults : t.searchEmptyHint}
                      </p>
                    )}
                  </div>
                </ScrollArea>
              )
            ) : isLoading ? (
              <div className="flex items-center justify-center p-4">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : listToShow.length === 0 ? null : (
              <ScrollArea className="h-full">
                <div className="pt-1">
                  {listToShow.map((chat) => {
                    const isSelected = isChatSelected(chat);
                    const label =
                      chat.source === "health_wall"
                        ? chat.patientName ?? chat.patientEmail ?? t.patient
                        : chat.type === "direct"
                          ? (chat.otherParticipantName ?? t.chatWithDoctor)
                          : chat.name ?? (chat.type === "consilium" ? t.chatConsilium : chat.type === "channel" ? (chat.myRole === "owner" ? t.channelOwn : t.channelSub) : t.chatGroup);
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
                        className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-border/50 hover:bg-muted/40 active:bg-muted/60 ${isSelected ? "bg-muted/70" : "bg-background"}`}
                      >
                        <div className="rounded-full bg-primary/10 p-2.5 shrink-0 size-11 flex items-center justify-center">
                          {chat.source === "health_wall" || chat.type === "direct" ? (
                            <User className="h-5 w-5 text-primary" />
                          ) : chat.type === "channel" ? (
                            <Radio className="h-5 w-5 text-primary" />
                          ) : (
                            <Users className="h-5 w-5 text-primary" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-foreground truncate">{label}</p>
                          <p className="text-[13px] text-muted-foreground truncate mt-0.5">{badge}</p>
                        </div>
                        <div className="shrink-0 flex flex-col items-end gap-0.5">
                          {chat.lastMessageAt && (
                            <span className="text-xs text-muted-foreground">{formatChatTime(chat.lastMessageAt)}</span>
                          )}
                          {chat.unreadCount != null && chat.unreadCount > 0 && (
                            <span className="rounded-full bg-primary text-primary-foreground text-xs font-medium min-w-5 h-5 flex items-center justify-center px-1.5">
                              {chat.unreadCount}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </TabsContent>
        </Tabs>
      </div>
      )}

      <div className={`flex-1 flex flex-col min-h-0 ${showProfilePanel ? "bg-background" : "bg-muted/20"}`}>
        {showProfilePanel ? (
          <div className="flex-1 min-h-0 overflow-auto">
            <Profile onSaveSuccess={() => setShowProfilePanel(false)} />
          </div>
        ) : conversationId ? (
          <div
            className="flex-1 flex flex-col min-h-0"
            style={{
              backgroundImage: "url(/messenger_chat_background.png)",
              backgroundSize: "cover",
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat",
            }}
          >
            <ConversationChat conversationId={conversationId} onBack={() => setLocation("/messenger")} />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground" style={{ backgroundColor: "rgba(249, 250, 251, 0)" }}>
            <div className="text-center">
              <MessageCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>{listToShow.length === 0 ? t.noChats : t.selectChat}</p>
            </div>
          </div>
        )}
      </div>

      <Dialog
        open={invitePatientOpen}
        onOpenChange={(open) => {
          setInvitePatientOpen(open);
          if (!open) setInvitePatientEmail("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.messengerInvitePatient}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (invitePatientEmail.trim()) {
                invitePatientMutation.mutate(invitePatientEmail.trim());
              }
            }}
            className="space-y-4"
          >
            <Input
              id="messenger-invite-email"
              type="email"
              autoComplete="email"
              placeholder={t.inviteEmailPlaceholder}
              aria-label={t.inviteEmailPlaceholder}
              value={invitePatientEmail}
              onChange={(e) => setInvitePatientEmail(e.target.value)}
              required
            />
            <DialogFooter className="flex flex-row justify-end gap-2">
              <Button type="submit" disabled={invitePatientMutation.isPending || !invitePatientEmail.trim()}>
                {invitePatientMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                {t.messengerInviteSend}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={createConversationType !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCreateConversationType(null);
            setCreateConversationName("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {createConversationType === "group" ? t.createGroup : createConversationType === "channel" ? t.createChannel : ""}
            </DialogTitle>
          </DialogHeader>
          <Input
            value={createConversationName}
            onChange={(e) => setCreateConversationName(e.target.value)}
            placeholder={t.messengerConversationNamePlaceholder}
            autoFocus
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                createConversationName.trim() &&
                createConversationType &&
                !createConversationMutation.isPending
              ) {
                e.preventDefault();
                createConversationMutation.mutate({
                  type: createConversationType,
                  name: createConversationName,
                });
              }
            }}
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setCreateConversationType(null);
                setCreateConversationName("");
              }}
            >
              {t.cancel}
            </Button>
            <Button
              type="button"
              disabled={!createConversationName.trim() || createConversationMutation.isPending}
              onClick={() => {
                if (!createConversationType || !createConversationName.trim()) return;
                createConversationMutation.mutate({
                  type: createConversationType,
                  name: createConversationName,
                });
              }}
            >
              {createConversationMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t.create
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Floating bottom nav or search bar (mobile only) */}
      <nav className="fixed bottom-0 left-0 right-0 md:hidden z-20 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] pt-1">
        {showSearchBar ? (
          <div className="rounded-2xl bg-background/95 backdrop-blur-md shadow-lg border border-border/50 flex items-center gap-2 py-2 px-3">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.searchMessengerPlaceholder}
              className="flex-1 min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              autoFocus
            />
            <button
              type="button"
              onClick={() => { setShowSearchBar(false); setSearchQuery(""); }}
              className="shrink-0 rounded-lg px-3 py-2 text-sm font-medium text-primary hover:bg-primary/10"
            >
              {t.cancel}
            </button>
          </div>
        ) : (
        <div className="rounded-2xl bg-background/95 backdrop-blur-md shadow-lg border border-border/50 flex items-center justify-center gap-0 py-1">
          <button
            type="button"
            onClick={() => setShowProfilePanel(true)}
            className={`flex-1 flex flex-col items-center justify-center gap-0 py-1 ${isProfile ? "text-primary" : "text-muted-foreground"}`}
          >
            <span className={`relative flex items-center justify-center size-8 rounded-full ${isProfile ? "bg-primary/10" : ""}`}>
              <User className="h-4 w-4" />
            </span>
            <span className="text-[9px] font-medium">{t.profile}</span>
          </button>
          {showProfilePanel ? (
            <button
              type="button"
              onClick={() => setShowProfilePanel(false)}
              className="flex-1 flex flex-col items-center justify-center gap-0 py-1 text-muted-foreground"
            >
              <span className="relative flex items-center justify-center size-8 rounded-full">
                <MessageCircle className="h-4 w-4" />
              </span>
              <span className="text-[9px] font-medium">{t.chatsTab}</span>
            </button>
          ) : (
            <Link
              href="/messenger"
              className="flex-1 flex flex-col items-center justify-center gap-0 py-1 text-primary"
            >
              <span className="relative flex items-center justify-center size-8 rounded-full bg-primary/10">
                <MessageCircle className="h-4 w-4" />
              </span>
              <span className="text-[9px] font-medium">{t.chatsTab}</span>
            </Link>
          )}
          <button
            type="button"
            onClick={() => setShowSearchBar(true)}
            className="flex-1 flex flex-col items-center justify-center gap-0 py-1 text-muted-foreground"
          >
            <span className="relative flex items-center justify-center size-8 rounded-full">
              <Search className="h-4 w-4" />
            </span>
            <span className="text-[9px] font-medium">{t.search}</span>
          </button>
        </div>
        )}
      </nav>
    </div>
  );
}
