import { useState, useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { useLocation, useRoute, Link, Redirect } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import { Loader2, User, Users, Radio, Copy, Share2, Menu, X } from "lucide-react";
import ConversationChat from "@/components/ConversationChat";
import GroupOrChannelSettings from "@/components/GroupOrChannelSettings";
import PostCommentsThread from "@/components/PostCommentsThread";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

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
  lastMessagePreview?: string | null;
  unreadCount?: number;
  chatKind?: "patient";
  conversationId?: string;
  type?: string;
  name?: string | null;
  avatarUrl?: string | null;
  otherParticipantName?: string;
  otherParticipantId?: string;
  participantCount?: number;
  myRole?: string;
  isMember?: boolean;
  lastVisitedAt?: string | null;
};

type PaginatedChatsResponse = {
  items: ChatItem[];
  hasMore: boolean;
  nextOffset: number | null;
  total: number;
};

export type MessengerSearchDoctor = {
  userId: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  conversationId?: string;
};
export type MessengerSearchGroup = { id: string; name: string | null; avatarUrl?: string | null; participantCount: number; isMember: boolean };
export type MessengerSearchChannel = { id: string; name: string | null; avatarUrl?: string | null; isMember: boolean };
export type MessengerSearchResults = {
  doctors: MessengerSearchDoctor[];
  groups: MessengerSearchGroup[];
  channels: MessengerSearchChannel[];
};
type MyPatientListItem = {
  patientUserId: string;
};

function chatInitial(label: string): string {
  return (label || "?").trim().charAt(0).toUpperCase() || "?";
}

const PAGE_SIZE = 20;

export default function Messenger() {
  const { isAuthenticated, isLoading: authLoading, isAdmin, user } = useAuth();
  const [location, setLocation] = useLocation();
  const [, groupParams] = useRoute("/messenger/group/:conversationId");
  const [, channelParams] = useRoute("/messenger/channel/:conversationId");
  const [, directParams] = useRoute("/messenger/direct/:conversationId");
  const [, commentThreadParams] = useRoute("/messenger/channel/:conversationId/post/:messageId/comments");
  const [, groupSettingsParams] = useRoute("/messenger/group/:conversationId/settings");
  const [, channelSettingsParams] = useRoute("/messenger/channel/:conversationId/settings");
  const conversationId =
    commentThreadParams?.conversationId ||
    groupParams?.conversationId ||
    channelParams?.conversationId ||
    directParams?.conversationId ||
    groupSettingsParams?.conversationId ||
    channelSettingsParams?.conversationId;
  const threadMessageId = commentThreadParams?.messageId;
  const isGroupChat = !!groupParams?.conversationId;
  const isChannelChat = !!channelParams?.conversationId;
  const isDirectChat = !!directParams?.conversationId;
  const isCommentThread = !!commentThreadParams?.conversationId && !!commentThreadParams?.messageId;
  const isGroupSettings = !!groupSettingsParams?.conversationId;
  const isChannelSettings = !!channelSettingsParams?.conversationId;
  const [isMobileView, setIsMobileView] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 767px)").matches : false
  );
  const isMobileConversationOpen = !!conversationId && isMobileView;

  const isChatSelected = (chat: ChatItem) =>
    chat.source === "conversation" && !!conversationId && chat.conversationId === conversationId;
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();

  useEffect(() => {
    if (!searchQuery.trim()) {
      setDebouncedSearchQuery("");
      return;
    }
    const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery), 280);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const onChange = (event: MediaQueryListEvent) => setIsMobileView(event.matches);
    setIsMobileView(mediaQuery.matches);
    mediaQuery.addEventListener("change", onChange);
    return () => mediaQuery.removeEventListener("change", onChange);
  }, []);

  const isSearching = searchQuery.trim().length > 0;

  const [folder, setFolder] = useState<"doctors" | "groups" | "channels">("doctors");
  const [searchScope, setSearchScope] = useState<"all" | "doctors" | "groups" | "channels">("all");
  const [createConversationType, setCreateConversationType] = useState<"group" | "channel" | null>(null);
  const [createConversationName, setCreateConversationName] = useState("");
  const [inviteLinkData, setInviteLinkData] = useState<{
    open: boolean;
    inviteType: "patient" | "homeopath";
    inviteUrl: string;
    expiresAt: string;
  }>({ open: false, inviteType: "patient", inviteUrl: "", expiresAt: "" });

  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const apiFolder = folder === "doctors" ? "personal" : folder;

  const { data: chatsPages, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } = useInfiniteQuery<PaginatedChatsResponse>({
    queryKey: ["/api/me/chats", apiFolder, folder],
    queryFn: async ({ pageParam = 0 }) => {
      const url = `/api/me/chats?folder=${apiFolder}&limit=${PAGE_SIZE}&offset=${pageParam}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextOffset : undefined),
    enabled: isAuthenticated && isAdmin,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
  const { data: myPatientsData } = useQuery<MyPatientListItem[]>({
    queryKey: ["/api/health-wall/my/patients"],
    enabled: isAuthenticated && isAdmin,
  });

  const chats = useMemo(() => chatsPages?.pages.flatMap((page) => page.items) ?? [], [chatsPages]);
  const firstPatientId = myPatientsData?.[0]?.patientUserId;
  const homeopathCabinetHref = isMobileView ? "/health-wall" : (firstPatientId ? `/health-wall/${firstPatientId}` : "/health-wall");
  const unreadPatientsCount = useMemo(
    () => chats.filter((chat) => chat.source === "health_wall" && (chat.unreadCount ?? 0) > 0).length,
    [chats]
  );
  const unreadChatsByFolder = useMemo(() => {
    const hasUnread = (chat: ChatItem) => (chat.unreadCount ?? 0) > 0;
    return {
      doctors: chats.filter((chat) => chat.source === "conversation" && chat.type === "direct" && hasUnread(chat)).length,
      groups: chats.filter((chat) => chat.source === "conversation" && chat.type === "group" && hasUnread(chat)).length,
      channels: chats.filter((chat) => chat.source === "conversation" && chat.type === "channel" && hasUnread(chat)).length,
    };
  }, [chats]);
  const chatsByFolder = useMemo(() => {
    if (folder === "doctors") {
      return chats.filter((chat) => chat.source === "conversation" && chat.type === "direct");
    }
    return chats;
  }, [chats, folder]);

  const { data: searchResults, isLoading: searchLoading, isError: searchError, refetch: refetchSearch } = useQuery<MessengerSearchResults>({
    queryKey: ["/api/messenger/search", debouncedSearchQuery],
    queryFn: async () => {
      const url = `/api/messenger/search?q=${encodeURIComponent(debouncedSearchQuery)}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: isAuthenticated && isAdmin && searchQuery.trim().length > 0,
  });

  useEffect(() => {
    if (!isAuthenticated || !isAdmin) return;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as { type?: string };
        if (data.type !== "doctor_chats_updated") return;
        void qc.invalidateQueries({ queryKey: ["/api/me/chats"] });
      } catch {
        // ignore malformed ws payloads
      }
    };

    return () => {
      ws.close();
    };
  }, [isAuthenticated, isAdmin, qc]);

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

  useEffect(() => {
    if (!isSearching) {
      setSearchScope("all");
    }
  }, [isSearching]);

  const activeSearchScope = isSearching ? searchScope : folder;
  const searchChatsSource = activeSearchScope === "all" ? chats.filter((chat) => chat.source !== "health_wall") : chatsByFolder;
  const searchFiltered =
    isSearching && searchQuery.trim()
      ? filterChatsBySearch(searchChatsSource, searchQuery)
      : [];
  const doctorSearchResults =
    activeSearchScope === "all" || activeSearchScope === "doctors" ? (searchResults?.doctors ?? []) : [];
  const groupSearchResults =
    activeSearchScope === "all" || activeSearchScope === "groups" ? (searchResults?.groups ?? []) : [];
  const channelSearchResults =
    activeSearchScope === "all" || activeSearchScope === "channels" ? (searchResults?.channels ?? []) : [];
  const hasSearchResults =
    searchFiltered.length > 0 ||
    doctorSearchResults.length > 0 ||
    groupSearchResults.length > 0 ||
    channelSearchResults.length > 0;
  const noResultsByFolder =
    activeSearchScope === "all"
      ? t.noResults
      : activeSearchScope === "doctors"
        ? "Врачи не найдены"
        : activeSearchScope === "groups"
          ? "Группы не найдены"
          : "Каналы не найдены";
  const listToShow =
    isSearching && searchQuery.trim() ? searchFiltered : chatsByFolder;

  useEffect(() => {
    if (isSearching || !hasNextPage || isFetchingNextPage) return;
    const root = listScrollRef.current?.querySelector("[data-radix-scroll-area-viewport]");
    const target = loadMoreRef.current;
    if (!root || !target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting) fetchNextPage();
      },
      { root, rootMargin: "0px 0px 200px 0px", threshold: 0.1 }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [isSearching, hasNextPage, isFetchingNextPage, fetchNextPage, chats.length, folder]);

  const openDirectChat = async (params: { userId?: string; conversationId?: string }) => {
    let targetConversationId = params.conversationId;

    if (!targetConversationId && params.userId) {
      try {
        const res = await fetch(`/api/messenger/direct/${params.userId}`, { credentials: "include" });
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as { conversationId: string };
        targetConversationId = data.conversationId;
      } catch (error) {
        toast({ title: t.error, description: t.somethingWrong, variant: "destructive" });
        return;
      }
    }

    if (!targetConversationId) {
      toast({ title: t.error, description: t.somethingWrong, variant: "destructive" });
      return;
    }

    setLocation(`/messenger/direct/${targetConversationId}`);
    setSearchQuery("");
  };

  const handleSelectChat = async (chat: ChatItem) => {
    if (chat.source === "health_wall" && chat.patientUserId) {
      setLocation(`/health-wall/${chat.patientUserId}`);
      return;
    }
    if (chat.source === "conversation" && chat.type === "direct") {
      await openDirectChat({ userId: chat.otherParticipantId, conversationId: chat.conversationId });
      return;
    }
    if (chat.source === "conversation" && chat.conversationId) {
      if (chat.type === "group") setLocation(`/messenger/group/${chat.conversationId}`);
      else if (chat.type === "channel") setLocation(`/messenger/channel/${chat.conversationId}`);
      else setLocation(`/messenger/channel/${chat.conversationId}`);
    }
  };

  const handleSelectDoctor = (doctor: MessengerSearchDoctor) => {
    setSearchQuery("");
    void openDirectChat({ userId: doctor.userId, conversationId: doctor.conversationId });
  };

  const handleSelectGroup = async (group: MessengerSearchGroup) => {
    if (group.isMember) {
      setLocation(`/messenger/group/${group.id}`);
      return;
    }
    toast({ title: t.onlyOwnerCanAddMembers, variant: "destructive" });
  };

  const createInviteLinkMutation = useMutation({
    mutationFn: async (inviteType: "patient" | "homeopath") => {
      const res = await apiRequest("POST", "/api/invites", { inviteType });
      return res.json();
    },
    onSuccess: (data, inviteType) => {
      setInviteLinkData({
        open: true,
        inviteType,
        inviteUrl: data.inviteUrl,
        expiresAt: data.expiresAt,
      });
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
      return (await res.json()) as { id: string };
    },
    onSuccess: (data, variables) => {
      qc.invalidateQueries({ queryKey: ["/api/me/chats"] });
      setCreateConversationType(null);
      setCreateConversationName("");
      setFolder(variables.type === "channel" ? "channels" : "groups");
      setLocation(variables.type === "channel" ? `/messenger/channel/${data.id}` : `/messenger/group/${data.id}`);
    },
    onError: () => {
      toast({ title: t.messengerCreateFailed, variant: "destructive" });
    },
  });

  const handleSelectChannel = async (channel: MessengerSearchChannel) => {
    if (channel.isMember) {
      setLocation(`/messenger/channel/${channel.id}`);
      return;
    }
    try {
      await apiRequest("POST", `/api/conversations/${channel.id}/subscribe`);
      await qc.invalidateQueries({ queryKey: ["/api/me/chats"] });
      setLocation(`/messenger/channel/${channel.id}`);
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
    <div className="flex h-full flex-col md:flex-row">
      {!isMobileConversationOpen && (
      <div className="w-full md:w-80 border-b md:border-b-0 flex flex-col shrink-0 bg-background pb-20 md:pb-0">
        <Tabs
          value={isSearching && searchScope === "all" ? "" : folder}
          onValueChange={(v) => {
            const nextFolder = v as typeof folder;
            setFolder(nextFolder);
            if (isSearching) {
              setSearchScope(nextFolder);
            }
          }}
          className="flex-1 flex flex-col min-h-0 bg-gray-50"
        >
          <div className="flex items-center gap-2 shrink-0 border-b border-border/60 bg-background px-3 py-2">
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
                <DropdownMenuItem asChild>
                  <Link href="/profile" className="cursor-pointer flex items-center">
                    <User className="h-4 w-4 mr-2" />
                    {t.profile}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    createInviteLinkMutation.mutate("homeopath");
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
            <div className="relative flex-1">
              <Input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t.searchMessengerPlaceholder}
                className="h-9 pr-9"
              />
              {searchQuery.length > 0 && (
                <button
                  type="button"
                  aria-label={t.clear}
                  onClick={() => {
                    setSearchQuery("");
                    searchInputRef.current?.focus();
                  }}
                  className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
          {/* Floating top panel on mobile — Telegram-style */}
          <div className="mt-2 mx-3 md:mt-0 md:mx-0 flex items-center shrink-0 z-10 md:border-b pt-1.5 pb-1 md:pt-0 md:pb-0">
            <div className="flex-1 min-w-0 rounded-2xl md:rounded-none shadow-md md:shadow-none bg-background px-1.5 md:px-0">
              <TabsList className="grid grid-cols-3 w-full rounded-none border-0 bg-transparent h-auto p-0 min-h-[36px] md:min-h-0">
                <TabsTrigger
                  value="doctors"
                  className="rounded-full data-[state=active]:bg-muted/60 md:data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none py-1.5 md:py-1"
                >
                  <span>Личка</span>
                  {unreadChatsByFolder.doctors > 0 && (
                    <span className="ml-1 inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-blue-500 px-1.5 text-[11px] font-medium text-white">
                      {unreadChatsByFolder.doctors}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger
                  value="groups"
                  className="rounded-full data-[state=active]:bg-muted/60 md:data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none py-1.5 md:py-1"
                >
                  <span>{t.folderGroups}</span>
                  {unreadChatsByFolder.groups > 0 && (
                    <span className="ml-1 inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-blue-500 px-1.5 text-[11px] font-medium text-white">
                      {unreadChatsByFolder.groups}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger
                  value="channels"
                  className="rounded-full data-[state=active]:bg-muted/60 md:data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none py-1.5 md:py-1"
                >
                  <span>{t.folderChannels}</span>
                  {unreadChatsByFolder.channels > 0 && (
                    <span className="ml-1 inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-blue-500 px-1.5 text-[11px] font-medium text-white">
                      {unreadChatsByFolder.channels}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>
            </div>
          </div>
          <TabsContent value={isSearching && searchScope === "all" ? "" : folder} className="flex-1 m-0 min-h-0 overflow-hidden bg-background">
            {isSearching ? (
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
                        <p className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
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
                          const isHw = chat.source === "health_wall";
                          const hasMsgPreview = !!chat.lastMessagePreview?.trim();
                          const alignTop = isHw || hasMsgPreview;
                          const subtitleText = chat.lastMessagePreview?.trim() || badge;
                          return (
                            <button
                              key={chat.source === "health_wall" ? chat.patientUserId! : `${chat.conversationId ?? "direct"}-${chat.otherParticipantId ?? ""}`}
                              type="button"
                              onClick={() => {
                                if (chat.type === "channel" && !chat.isMember && chat.conversationId) {
                                  void handleSelectChannel({
                                    id: chat.conversationId,
                                    name: chat.name ?? null,
                                    avatarUrl: chat.avatarUrl ?? null,
                                    isMember: false,
                                  });
                                  return;
                                }
                                void handleSelectChat(chat);
                              }}
                              className={cn(
                                "w-full flex gap-2.5 px-3 py-2 text-left border-b border-border/50 hover:bg-muted/40 active:bg-muted/60",
                                alignTop ? "items-start" : "items-center",
                                isSelected ? "bg-muted/70" : "bg-background"
                              )}
                            >
                              {chat.source === "conversation" && (chat.type === "group" || chat.type === "channel" || chat.type === "direct") ? (
                                <Avatar className="shrink-0 size-11">
                                  <AvatarImage src={chat.avatarUrl || undefined} />
                                  <AvatarFallback>{chatInitial(label)}</AvatarFallback>
                                </Avatar>
                              ) : (
                                <div
                                  className={cn(
                                    "rounded-full bg-primary/10 flex shrink-0 items-center justify-center",
                                    isHw ? "size-[3.3rem] p-3" : "size-11 p-2.5"
                                  )}
                                >
                                  {chat.source === "health_wall" || chat.type === "direct" ? (
                                    <User className={cn("text-primary", isHw ? "h-6 w-6" : "h-5 w-5")} />
                                  ) : chat.type === "channel" ? (
                                    <Radio className="h-5 w-5 text-primary" />
                                  ) : (
                                    <Users className="h-5 w-5 text-primary" />
                                  )}
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-foreground truncate">{label}</p>
                                {hasMsgPreview ? (
                                  <p className="text-[13px] text-muted-foreground mt-0.5 line-clamp-2 break-words leading-snug">
                                    {subtitleText}
                                  </p>
                                ) : (
                                  <p className="text-[13px] text-muted-foreground truncate mt-0.5">{subtitleText}</p>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </section>
                    )}
                    {doctorSearchResults.length > 0 && (
                      <section className="mb-2">
                        <p className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          {t.searchDoctors}
                        </p>
                        {doctorSearchResults.map((doctor) => {
                          const name = [doctor.firstName, doctor.lastName].filter(Boolean).join(" ") || doctor.email || t.chatWithDoctor;
                          return (
                            <button
                              key={doctor.userId}
                              type="button"
                              onClick={() => handleSelectDoctor(doctor)}
                              className="w-full flex items-center gap-2.5 px-3 py-2 text-left border-b border-border/50 hover:bg-muted/40 active:bg-muted/60 bg-background"
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
                    {groupSearchResults.length > 0 && (
                      <section className="mb-2">
                        <p className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          {t.searchGroups}
                        </p>
                        {groupSearchResults.map((group) => (
                          <button
                            key={group.id}
                            type="button"
                            onClick={() => handleSelectGroup(group)}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-left border-b border-border/50 hover:bg-muted/40 active:bg-muted/60 bg-background"
                          >
                            <Avatar className="shrink-0 size-11">
                              <AvatarImage src={group.avatarUrl || undefined} />
                              <AvatarFallback>{chatInitial(group.name || t.chatGroup)}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-foreground truncate">{group.name || t.chatGroup}</p>
                              <p className="text-[13px] text-muted-foreground truncate mt-0.5">
                                {group.isMember ? t.chatsTab : t.onlyOwnerCanAddMembers}
                              </p>
                            </div>
                          </button>
                        ))}
                      </section>
                    )}
                    {channelSearchResults.length > 0 && (
                      <section className="mb-2">
                        <p className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          {t.searchChannels}
                        </p>
                        {channelSearchResults.map((channel) => (
                          <button
                            key={channel.id}
                            type="button"
                            onClick={() => handleSelectChannel(channel)}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-left border-b border-border/50 hover:bg-muted/40 active:bg-muted/60 bg-background"
                          >
                            <Avatar className="shrink-0 size-11">
                              <AvatarImage src={channel.avatarUrl || undefined} />
                              <AvatarFallback>{chatInitial(channel.name || t.channelSub)}</AvatarFallback>
                            </Avatar>
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
                    {isSearching && !searchLoading && searchResults && !hasSearchResults && (
                      <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                        {debouncedSearchQuery.trim() ? noResultsByFolder : t.searchEmptyHint}
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
              <ScrollArea ref={listScrollRef} className="h-full">
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
                    const isHw = chat.source === "health_wall";
                    const hasMsgPreview = !!chat.lastMessagePreview?.trim();
                    const alignTop = isHw || hasMsgPreview;
                    const subtitleText = chat.lastMessagePreview?.trim() || badge;
                    return (
                      <button
                        key={chat.source === "health_wall" ? chat.patientUserId! : `${chat.conversationId ?? "direct"}-${chat.otherParticipantId ?? ""}`}
                        type="button"
                        onClick={() => {
                          if (chat.type === "channel" && !chat.isMember && chat.conversationId) {
                            void handleSelectChannel({
                              id: chat.conversationId,
                              name: chat.name ?? null,
                              avatarUrl: chat.avatarUrl ?? null,
                              isMember: false,
                            });
                            return;
                          }
                          void handleSelectChat(chat);
                        }}
                        className={cn(
                          "w-full flex gap-2.5 px-3 py-2 text-left border-b border-border/50 hover:bg-muted/40 active:bg-muted/60",
                          alignTop ? "items-start" : "items-center",
                          isSelected ? "bg-muted/70" : "bg-background"
                        )}
                      >
                        {chat.source === "conversation" && (chat.type === "group" || chat.type === "channel" || chat.type === "direct") ? (
                          <Avatar className="shrink-0 size-11">
                            <AvatarImage src={chat.avatarUrl || undefined} />
                            <AvatarFallback>{chatInitial(label)}</AvatarFallback>
                          </Avatar>
                        ) : (
                          <div
                            className={cn(
                              "rounded-full bg-primary/10 flex shrink-0 items-center justify-center",
                              isHw ? "size-[3.3rem] p-3" : "size-11 p-2.5"
                            )}
                          >
                            {chat.source === "health_wall" || chat.type === "direct" ? (
                              <User className={cn("text-primary", isHw ? "h-6 w-6" : "h-5 w-5")} />
                            ) : chat.type === "channel" ? (
                              <Radio className="h-5 w-5 text-primary" />
                            ) : (
                              <Users className="h-5 w-5 text-primary" />
                            )}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-foreground truncate">{label}</p>
                          {hasMsgPreview ? (
                            <p className="text-[13px] text-muted-foreground mt-0.5 line-clamp-2 break-words leading-snug">
                              {subtitleText}
                            </p>
                          ) : (
                            <p className="text-[13px] text-muted-foreground truncate mt-0.5">{subtitleText}</p>
                          )}
                        </div>
                        <div className={cn("shrink-0 flex flex-col items-end gap-0.5", alignTop && "pt-0.5")}>
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
                  {!isSearching && hasNextPage && <div ref={loadMoreRef} className="h-4" />}
                  {!isSearching && isFetchingNextPage && (
                    <div className="flex items-center justify-center py-3">
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    </div>
                  )}
                </div>
              </ScrollArea>
            )}
          </TabsContent>
        </Tabs>
        <div className="hidden md:block shrink-0 border-t border-border/60 bg-background px-3 py-2">
          <Button
            asChild
            variant="outline"
            className="relative h-10 w-full justify-center rounded-full border-0 bg-primary text-primary-foreground hover:bg-primary/90"
            data-testid="button-homeopath-cabinet"
          >
            <Link href={homeopathCabinetHref}>
              <span>{t.homeopathCabinet}</span>
              {unreadPatientsCount > 0 && (
                <span className="absolute right-3 inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-blue-500 px-1.5 text-[11px] font-medium text-white">
                  {unreadPatientsCount}
                </span>
              )}
            </Link>
          </Button>
        </div>
        <div className="fixed bottom-0 left-0 right-0 md:hidden z-30 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
          <div className="border-t border-border/60 bg-background px-0 py-2">
            <Button
              asChild
              variant="outline"
              className="relative h-10 w-full justify-center rounded-full border-0 bg-primary text-primary-foreground hover:bg-primary/90"
              data-testid="button-homeopath-cabinet"
            >
              <Link href={homeopathCabinetHref}>
                <span>{t.homeopathCabinet}</span>
                {unreadPatientsCount > 0 && (
                  <span className="absolute right-3 inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-blue-500 px-1.5 text-[11px] font-medium text-white">
                    {unreadPatientsCount}
                  </span>
                )}
              </Link>
            </Button>
          </div>
        </div>
      </div>
      )}

      <div className="flex-1 flex flex-col min-h-0 bg-muted/20">
        {(isGroupSettings || isChannelSettings) && conversationId ? (
          <div className="flex-1 flex flex-col min-h-0">
            <GroupOrChannelSettings
              conversationId={conversationId}
              mode={isGroupSettings ? "group" : "channel"}
              currentUserId={user?.id}
              onBack={() => setLocation(isGroupSettings ? `/messenger/group/${conversationId}` : `/messenger/channel/${conversationId}`)}
            />
          </div>
        ) : isCommentThread && conversationId && threadMessageId ? (
          <div className="flex-1 flex flex-col min-h-0 chat-panel-bg">
            <PostCommentsThread
              conversationId={conversationId}
              messageId={threadMessageId}
              currentUserId={user?.id}
              onBack={() => setLocation(`/messenger/channel/${conversationId}`)}
            />
          </div>
        ) : conversationId ? (
          <div className="flex-1 flex flex-col min-h-0 chat-panel-bg">
            <ConversationChat
              conversationId={conversationId}
              onBack={() => setLocation("/messenger")}
              onTitleClick={() => {
                if (isGroupChat) setLocation(`/messenger/group/${conversationId}/settings`);
                if (isChannelChat) setLocation(`/messenger/channel/${conversationId}/settings`);
                if (isDirectChat) return;
              }}
            />
          </div>
        ) : null}

      </div>

      <Dialog open={inviteLinkData.open} onOpenChange={(open) => setInviteLinkData((prev) => ({ ...prev, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {inviteLinkData.inviteType === "homeopath" ? t.messengerInviteHomeopath : t.messengerInvitePatient}
            </DialogTitle>
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
                        title: "Приглашение в hovial",
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

    </div>
  );
}
