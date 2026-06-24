import { useState, useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { useLocation, useRoute, Link, Redirect, useSearch } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import { profileAvatarSrc } from "@/lib/utils";
import { messengerProfileReturnPath } from "@/lib/messengerPaths";
import { Loader2, User, Users, Radio, Copy, Share2, Menu, X, LogOut, ClipboardList, Phone } from "lucide-react";
import ConversationChat from "@/components/ConversationChat";
import GroupOrChannelSettings from "@/components/GroupOrChannelSettings";
import PatientChatSettings from "@/components/PatientChatSettings";
import PostCommentsThread from "@/components/PostCommentsThread";
import Profile from "@/pages/Profile";
import ChatListMessagePreview from "@/components/ChatListMessagePreview";
import { normalizeMessengerListPreview } from "@shared/messengerMessagePreview";
import { RouteSeo } from "@/components/RouteSeo";
import { pageMeta } from "@/lib/pageMeta";
import { apiRequest } from "@/lib/queryClient";
import { offlineMessengerQueryOptions } from "@/lib/offlineQueryOptions";
import { useToast } from "@/hooks/use-toast";
import { useDoctorChatsWs } from "@/hooks/useDoctorChatsWs";
import { useAppShellTheme } from "@/hooks/useAppShellTheme";
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
import {
  readMessengerUiState,
  writeMessengerUiState,
  type MessengerFolder,
} from "@/lib/messengerUiState";

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
  source: "conversation";
  folder: "personal" | "groups" | "channels";
  section?: "subscriptions" | "discover";
  dividerKey?: string;
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
  hasActiveCall?: boolean;
};

type PaginatedChatsResponse = {
  items: ChatItem[];
  hasMore: boolean;
  nextOffset: number | null;
  total: number;
};

type MessengerUnreadSummary = {
  patients: number;
  doctors: number;
  groups: number;
  channels: number;
  inboxUnreadMessages: number;
};

export type MessengerSearchDoctor = {
  userId: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  conversationId?: string;
};
export type MessengerSearchGroup = {
  id: string;
  name: string | null;
  avatarUrl?: string | null;
  participantCount: number;
  isMember: boolean;
  lastMessagePreview?: string | null;
  lastMessageAt?: string | null;
};
export type MessengerSearchChannel = {
  id: string;
  name: string | null;
  avatarUrl?: string | null;
  isMember: boolean;
  lastMessagePreview?: string | null;
  lastMessageAt?: string | null;
};
export type MessengerSearchResults = {
  doctors: MessengerSearchDoctor[];
  groups: MessengerSearchGroup[];
  channels: MessengerSearchChannel[];
};

function chatInitial(label: string): string {
  return getPersonInitials(null, null, label);
}

function renderDiscoverSearchSubtitle(
  item: { isMember: boolean; lastMessagePreview?: string | null },
  memberFallback: string,
  nonMemberFallback: string,
) {
  if (!item.isMember) {
    return (
      <p className="text-[13px] text-muted-foreground truncate mt-0.5">{nonMemberFallback}</p>
    );
  }
  const rawMsgPreview = item.lastMessagePreview?.trim() ?? "";
  const displayMsgPreview = normalizeMessengerListPreview(rawMsgPreview);
  if (displayMsgPreview) {
    return <ChatListMessagePreview preview={rawMsgPreview} />;
  }
  return (
    <p className="text-[13px] text-muted-foreground truncate mt-0.5">{memberFallback}</p>
  );
}

function getChatListLabel(chat: ChatItem, isAdminUser: boolean): string {
  if (chat.type === "patient") {
    if (!isAdminUser) {
      return chat.name ?? chat.patientName ?? t.chatWithDoctor;
    }
    return chat.name ?? chat.patientName ?? chat.patientEmail ?? t.patient;
  }
  if (chat.type === "direct") {
    return chat.otherParticipantName ?? t.chatWithDoctor;
  }
  return (
    chat.name ??
    (chat.type === "consilium"
      ? t.chatConsilium
      : chat.type === "channel"
        ? chat.myRole === "owner"
          ? t.channelOwn
          : t.channelSub
        : t.chatGroup)
  );
}

function getPersonInitials(
  firstName?: string | null,
  lastName?: string | null,
  fallbackLabel?: string | null,
): string {
  const fromNames = `${firstName?.trim()?.[0] ?? ""}${lastName?.trim()?.[0] ?? ""}`.toUpperCase();
  if (fromNames) return fromNames;
  if (fallbackLabel) {
    const parts = fallbackLabel.trim().split(/\s+/).filter(Boolean).slice(0, 2);
    const fromParts = parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
    if (fromParts) return fromParts;
    const first = fallbackLabel.trim()[0];
    if (first) return first.toUpperCase();
  }
  return "?";
}

function ChatListAvatar({ chat, label }: { chat: ChatItem; label: string }) {
  const isPatientChat = chat.type === "patient";
  const useAvatar =
    isPatientChat ||
    chat.type === "group" ||
    chat.type === "channel" ||
    chat.type === "direct";

  if (useAvatar) {
    return (
      <Avatar className={cn("shrink-0", isPatientChat ? "size-[3.3rem]" : "size-11")}>
        <AvatarImage src={profileAvatarSrc(chat.avatarUrl)} alt={label} />
        <AvatarFallback className={isPatientChat ? "text-sm font-semibold" : undefined}>
          {getPersonInitials(null, null, label)}
        </AvatarFallback>
      </Avatar>
    );
  }

  return (
    <div className="rounded-full bg-primary/10 flex shrink-0 items-center justify-center size-11 p-2.5">
      {chat.type === "channel" ? (
        <Radio className="h-5 w-5 text-primary" />
      ) : (
        <Users className="h-5 w-5 text-primary" />
      )}
    </div>
  );
}

const PAGE_SIZE = 20;

type MessengerFolderAction = {
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  actionPending?: boolean;
};

function MessengerFolderPanel({
  folder,
  isAdmin,
  variant,
  invitePending,
  createPending,
  onInvitePatient,
  onInviteHomeopath,
  onCreateGroup,
  onCreateChannel,
}: {
  folder: MessengerFolder;
  isAdmin: boolean;
  variant: "empty" | "footer";
  invitePending: boolean;
  createPending: boolean;
  onInvitePatient: () => void;
  onInviteHomeopath: () => void;
  onCreateGroup: () => void;
  onCreateChannel: () => void;
}) {
  let config: MessengerFolderAction | null = null;

  if (isAdmin) {
    if (folder === "patients") {
      config = {
        description: t.messengerEmptyPatientsDescription,
        actionLabel: t.messengerInvitePatient,
        onAction: onInvitePatient,
        actionPending: invitePending,
      };
    } else if (folder === "doctors") {
      config = {
        description: t.messengerEmptyDoctorsDescription,
        actionLabel: t.messengerInviteHomeopath,
        onAction: onInviteHomeopath,
        actionPending: invitePending,
      };
    } else if (folder === "groups") {
      config = {
        description: t.messengerEmptyGroupsDescription,
        actionLabel: t.createGroup,
        onAction: onCreateGroup,
        actionPending: createPending,
      };
    } else if (folder === "channels") {
      config = {
        description: t.messengerEmptyChannelsDescription,
        actionLabel: t.createChannel,
        onAction: onCreateChannel,
        actionPending: createPending,
      };
    }
  } else if (folder === "patients") {
    config = { description: t.messengerEmptyCommunityDescription };
  } else if (folder === "channels") {
    config = {
      description: t.messengerEmptyChannelsPatientDescription,
    };
  }

  if (!config) return null;

  if (variant === "empty") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center min-h-[240px]">
        <p className="text-sm text-muted-foreground leading-relaxed max-w-[280px]">{config.description}</p>
        {config.actionLabel && config.onAction && (
          <Button
            type="button"
            className="mt-5"
            onClick={config.onAction}
            disabled={config.actionPending}
          >
            {config.actionPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {config.actionLabel}
          </Button>
        )}
      </div>
    );
  }

  if (!config.actionLabel || !config.onAction) return null;

  return (
    <div className="px-3 py-3 border-t border-border/50 bg-background shrink-0">
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={config.onAction}
        disabled={config.actionPending}
      >
        {config.actionPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        {config.actionLabel}
      </Button>
    </div>
  );
}

const messengerFolderTabClass =
  "relative !flex w-full min-w-0 items-center justify-center rounded-none border-b-2 border-transparent bg-transparent px-0 py-2 text-sm font-medium text-muted-foreground shadow-none transition-colors hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none";

const folderUnreadBadgeClass =
  "inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-blue-500 px-1.5 text-xs font-semibold leading-none text-white";

function FolderTabLabel({ label, unread }: { label: string; unread: number }) {
  return (
    <span className="flex min-w-0 items-center justify-center gap-1.5 px-1">
      <span className="truncate">{label}</span>
      {unread > 0 && <span className={folderUnreadBadgeClass}>{unread}</span>}
    </span>
  );
}

export default function Messenger() {
  const { isAuthenticated, isLoading: authLoading, isAdmin, user } = useAuth();
  const [location, setLocation] = useLocation();
  const profileSearch = useSearch();
  const [, groupParams] = useRoute("/messenger/group/:conversationId");
  const [, channelParams] = useRoute("/messenger/channel/:conversationId");
  const [, directParams] = useRoute("/messenger/direct/:conversationId");
  const [, commentThreadParams] = useRoute("/messenger/channel/:conversationId/post/:messageId/comments");
  const [, groupSettingsParams] = useRoute("/messenger/group/:conversationId/settings");
  const [, channelSettingsParams] = useRoute("/messenger/channel/:conversationId/settings");
  const [, patientChatSettingsParams] = useRoute("/messenger/chat/:conversationId/settings");
  const [, patientChatParams] = useRoute("/messenger/chat/:conversationId");
  const [, profileUserParams] = useRoute("/messenger/profile/:userId");
  const [, ownProfileRoute] = useRoute("/messenger/profile");
  const profileUserId = profileUserParams?.userId;
  const isProfileOpen = !!ownProfileRoute || !!profileUserParams;
  const conversationId =
    commentThreadParams?.conversationId ||
    groupParams?.conversationId ||
    channelParams?.conversationId ||
    directParams?.conversationId ||
    patientChatSettingsParams?.conversationId ||
    patientChatParams?.conversationId ||
    groupSettingsParams?.conversationId ||
    channelSettingsParams?.conversationId;
  const threadMessageId = commentThreadParams?.messageId;
  const isGroupChat = !!groupParams?.conversationId;
  const isChannelChat = !!channelParams?.conversationId;
  const isDirectChat = !!directParams?.conversationId;
  const isPatientChatSettings = !!patientChatSettingsParams?.conversationId;
  const isPatientChat = !!patientChatParams?.conversationId && !isPatientChatSettings;
  const isCommentThread = !!commentThreadParams?.conversationId && !!commentThreadParams?.messageId;
  const isGroupSettings = !!groupSettingsParams?.conversationId;
  const isChannelSettings = !!channelSettingsParams?.conversationId;
  const [isMobileView, setIsMobileView] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 767px)").matches : false
  );
  const isMobileConversationOpen = (!!conversationId || isProfileOpen) && isMobileView;
  const isMessengerSettings =
    isGroupSettings || isChannelSettings || isPatientChatSettings;
  const useChatShell =
    isMobileConversationOpen && !isMessengerSettings;

  useAppShellTheme(useChatShell ? "chat" : "default");

  useEffect(() => {
    const isChatConversationOpen = !!conversationId && !isMessengerSettings;
    document.documentElement.classList.toggle("app-chat-conversation-open", isChatConversationOpen);
    return () => {
      document.documentElement.classList.remove("app-chat-conversation-open");
    };
  }, [conversationId, isMessengerSettings]);

  const isChatSelected = (chat: ChatItem) =>
    !!conversationId && !!chat.conversationId && chat.conversationId === conversationId;
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

  const [folder, setFolder] = useState<MessengerFolder>(
    () => readMessengerUiState()?.folder ?? "patients"
  );
  const [searchScope, setSearchScope] = useState<"all" | "doctors" | "patients" | "groups" | "channels">("all");
  const [createConversationType, setCreateConversationType] = useState<"group" | "channel" | null>(null);
  const [createConversationName, setCreateConversationName] = useState("");
  const [inviteRolePickerOpen, setInviteRolePickerOpen] = useState(false);
  const [inviteLinkData, setInviteLinkData] = useState<{
    open: boolean;
    inviteUrl: string;
    expiresAt: string;
    inviteType: "patient" | "homeopath" | null;
  }>({ open: false, inviteUrl: "", expiresAt: "", inviteType: null });

  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const prevLocationRef = useRef(location);

  const activeFolder = isAdmin ? folder : folder === "channels" ? "channels" : "patients";
  const apiFolder =
    activeFolder === "doctors" || activeFolder === "patients"
      ? "personal"
      : activeFolder === "channels"
        ? "channels"
        : activeFolder;

  const { data: chatsPages, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } = useInfiniteQuery<PaginatedChatsResponse>({
    queryKey: ["/api/me/chats", apiFolder, activeFolder],
    queryFn: async ({ pageParam = 0 }) => {
      const url = `/api/me/chats?folder=${apiFolder}&limit=${PAGE_SIZE}&offset=${pageParam}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextOffset : undefined),
    enabled: isAuthenticated,
    ...offlineMessengerQueryOptions,
  });
  const chats = useMemo(() => chatsPages?.pages.flatMap((page) => page.items) ?? [], [chatsPages]);

  const { data: unreadSummary } = useQuery<MessengerUnreadSummary>({
    queryKey: ["/api/me/chats/unread-summary"],
    queryFn: async () => {
      const res = await fetch("/api/me/chats/unread-summary", { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: isAuthenticated,
    ...offlineMessengerQueryOptions,
  });

  const unreadChatsByFolder = useMemo(() => {
    if (unreadSummary) {
      return unreadSummary;
    }
    const hasUnread = (chat: ChatItem) => (chat.unreadCount ?? 0) > 0;
    return {
      doctors: chats.filter((chat) => chat.source === "conversation" && chat.type === "direct" && hasUnread(chat)).length,
      patients: chats.filter((chat) => chat.type === "patient" && hasUnread(chat)).length,
      groups: chats.filter((chat) => chat.source === "conversation" && chat.type === "group" && hasUnread(chat)).length,
      channels: chats.filter((chat) => chat.source === "conversation" && chat.type === "channel" && hasUnread(chat)).length,
    };
  }, [chats, unreadSummary]);
  const chatsByFolder = useMemo(() => {
    if (!isAdmin) {
      if (activeFolder === "channels") {
        return chats.filter((chat) => chat.type === "channel" || chat.type === "divider");
      }
      return chats.filter((chat) => chat.type === "patient");
    }
    if (activeFolder === "patients") {
      return chats.filter((chat) => chat.type === "patient");
    }
    if (activeFolder === "doctors") {
      return chats.filter((chat) => chat.source === "conversation" && chat.type === "direct");
    }
    if (activeFolder === "channels") {
      return chats.filter((chat) => chat.type === "channel" || chat.type === "divider");
    }
    if (activeFolder === "groups") {
      return chats.filter((chat) => chat.type === "group" || chat.type === "divider");
    }
    return chats;
  }, [chats, activeFolder, isAdmin]);

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

  useDoctorChatsWs(isAuthenticated);

  function filterChatsBySearch(items: ChatItem[], query: string): ChatItem[] {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    const words = q.split(/\s+/).filter(Boolean);
    return items.filter((chat) => {
      const searchable =
        chat.type === "patient"
          ? [chat.name, chat.patientName, chat.patientEmail].filter(Boolean).join(" ")
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

  const activeSearchScope = isSearching ? searchScope : activeFolder;
  const searchChatsSource = activeSearchScope === "all" ? chats.filter((chat) => chat.type !== "patient") : chatsByFolder;
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
  const showChannelDiscoverSection =
    activeSearchScope === "all" || activeSearchScope === "channels";
  // Channels are listed in the dedicated «Каналы» section — keep them out of «Чаты».
  const searchChatResults = showChannelDiscoverSection
    ? searchFiltered.filter((chat) => chat.type !== "channel")
    : searchFiltered;
  const hasSearchResults =
    searchChatResults.length > 0 ||
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

  const listChats = useMemo(
    () => listToShow.filter((chat) => chat.type !== "divider"),
    [listToShow]
  );

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

  useEffect(() => {
    if (!isAuthenticated || authLoading || isAdmin) return;
    if (folder !== "channels" && folder !== "patients") {
      setFolder("patients");
    }
  }, [isAuthenticated, authLoading, isAdmin, folder]);

  useEffect(() => {
    if (isPatientChat) setFolder("patients");
    else if (isDirectChat) setFolder("doctors");
    else if (isGroupChat || isGroupSettings) setFolder("groups");
    else if (isChannelChat || isChannelSettings || isCommentThread) setFolder("channels");
  }, [isPatientChat, isDirectChat, isGroupChat, isGroupSettings, isChannelChat, isChannelSettings, isCommentThread, isAdmin]);

  useEffect(() => {
    if (!isAuthenticated || authLoading) return;
    const effectiveFolder = isAdmin ? folder : folder === "channels" ? "channels" : "patients";
    writeMessengerUiState({ folder: effectiveFolder, path: location });
  }, [location, folder, isAuthenticated, authLoading, isAdmin]);

  useEffect(() => {
    const prev = prevLocationRef.current;
    prevLocationRef.current = location;
    if (!isAuthenticated || authLoading) return;
    if (location !== "/messenger") return;
    if (prev.startsWith("/messenger") && prev !== "/messenger") return;

    const saved = readMessengerUiState();
    if (isAdmin && saved?.folder) setFolder(saved.folder);
    if (saved?.path && saved.path !== "/messenger") {
      setLocation(saved.path);
    }
  }, [location, isAuthenticated, authLoading, isAdmin, setLocation]);

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
    if (chat.type === "patient" && chat.conversationId) {
      setFolder("patients");
      setLocation(`/messenger/chat/${chat.conversationId}`);
      return;
    }
    if (chat.type === "direct") {
      setFolder("doctors");
      await openDirectChat({ userId: chat.otherParticipantId, conversationId: chat.conversationId });
      return;
    }
    if (chat.conversationId) {
      if (chat.type === "group") {
        setFolder("groups");
        setLocation(`/messenger/group/${chat.conversationId}`);
      } else if (chat.type === "channel") {
        setFolder("channels");
        setLocation(`/messenger/channel/${chat.conversationId}`);
      } else {
        setFolder("channels");
        setLocation(`/messenger/channel/${chat.conversationId}`);
      }
    }
  };

  const handleSelectDoctor = (doctor: MessengerSearchDoctor) => {
    setSearchQuery("");
    setFolder("doctors");
    void openDirectChat({ userId: doctor.userId, conversationId: doctor.conversationId });
  };

  const handleSelectGroup = (group: MessengerSearchGroup) => {
    setSearchQuery("");
    setFolder("groups");
    setLocation(`/messenger/group/${group.id}`);
  };

  const createInviteLinkMutation = useMutation({
    mutationFn: async (inviteType: "patient" | "homeopath") => {
      const res = await apiRequest("POST", "/api/invites", { inviteType });
      return res.json() as Promise<{
        inviteUrl: string;
        expiresAt: string;
        inviteType: "patient" | "homeopath";
      }>;
    },
    onSuccess: (data) => {
      setInviteRolePickerOpen(false);
      setInviteLinkData({
        open: true,
        inviteUrl: data.inviteUrl,
        expiresAt: data.expiresAt,
        inviteType: data.inviteType,
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
      if (!isAdmin) {
        throw new Error("Forbidden");
      }
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

  const handleSelectChannel = (channel: MessengerSearchChannel) => {
    setFolder("channels");
    setLocation(`/messenger/channel/${channel.id}`);
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
  return (
    <>
      <RouteSeo {...pageMeta.messenger} />
    <div className="flex h-full flex-col md:flex-row">
      {!isMobileConversationOpen && (
      <div className="w-full md:w-80 border-b md:border-b-0 flex flex-col shrink-0 bg-background">
        <Tabs
          value={isAdmin && isSearching && searchScope === "all" ? "" : activeFolder}
          onValueChange={(v) => {
            const nextFolder = v as typeof folder;
            setFolder(nextFolder);
            if (isAdmin && isSearching) {
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
                  <Link href="/messenger/profile" className="cursor-pointer flex items-center">
                    <User className="h-4 w-4 mr-2" />
                    {t.profile}
                  </Link>
                </DropdownMenuItem>
                {isAdmin && (
                  <DropdownMenuItem asChild>
                    <Link href="/questionnaires" className="cursor-pointer flex items-center">
                      <ClipboardList className="h-4 w-4 mr-2" />
                      {t.questionnaires}
                    </Link>
                  </DropdownMenuItem>
                )}
                {!isAdmin && (
                  <DropdownMenuItem
                    onSelect={async () => {
                      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
                      qc.clear();
                      window.location.href = "/";
                    }}
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    {t.logout}
                  </DropdownMenuItem>
                )}
                {isAdmin && (
                  <>
                    <DropdownMenuItem
                      onSelect={() => {
                        setInviteRolePickerOpen(true);
                      }}
                    >
                      {t.messengerSendInvite}
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
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            {!isAdmin && (
              <h1 className="flex-1 truncate text-base font-semibold">{t.messenger}</h1>
            )}
            {isAdmin && (
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
            )}
          </div>
          {isAdmin && (
          <div className="mt-2 mx-3 md:mt-0 md:mx-0 flex items-center shrink-0 z-10 md:border-b pt-1.5 pb-1 md:pt-0 md:pb-0">
            <div className="flex-1 min-w-0 rounded-2xl md:rounded-none shadow-md md:shadow-none bg-background px-1.5 md:px-0">
              <TabsList className="!grid h-10 w-full grid-cols-4 gap-0 rounded-none border-0 border-b border-border bg-transparent p-0">
                <TabsTrigger value="patients" className={messengerFolderTabClass}>
                  <FolderTabLabel label={t.folderPatients} unread={unreadChatsByFolder.patients} />
                </TabsTrigger>
                <TabsTrigger value="doctors" className={messengerFolderTabClass}>
                  <FolderTabLabel label={t.folderCommunity} unread={unreadChatsByFolder.doctors} />
                </TabsTrigger>
                <TabsTrigger value="groups" className={messengerFolderTabClass}>
                  <FolderTabLabel label={t.folderGroups} unread={unreadChatsByFolder.groups} />
                </TabsTrigger>
                <TabsTrigger value="channels" className={messengerFolderTabClass}>
                  <FolderTabLabel label={t.folderChannels} unread={unreadChatsByFolder.channels} />
                </TabsTrigger>
              </TabsList>
            </div>
          </div>
          )}
          {!isAdmin && (
          <div className="mt-2 mx-3 md:mt-0 md:mx-0 flex items-center shrink-0 z-10 md:border-b pt-1.5 pb-1 md:pt-0 md:pb-0">
            <div className="flex-1 min-w-0 rounded-2xl md:rounded-none shadow-md md:shadow-none bg-background px-1.5 md:px-0">
              <TabsList className="!grid h-10 w-full grid-cols-2 gap-0 rounded-none border-0 border-b border-border bg-transparent p-0">
                <TabsTrigger value="patients" className={messengerFolderTabClass}>
                  <FolderTabLabel label={t.folderCommunity} unread={unreadChatsByFolder.patients} />
                </TabsTrigger>
                <TabsTrigger value="channels" className={messengerFolderTabClass}>
                  <FolderTabLabel label={t.folderChannels} unread={unreadChatsByFolder.channels} />
                </TabsTrigger>
              </TabsList>
            </div>
          </div>
          )}
          <TabsContent
            value={isAdmin && isSearching && searchScope === "all" ? "" : activeFolder}
            className="flex-1 m-0 min-h-0 overflow-hidden bg-background"
          >
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
                    {searchChatResults.length > 0 && (
                      <section className="mb-2">
                        <p className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          {t.chatsTab}
                        </p>
                        {searchChatResults.map((chat) => {
                          const isSelected = isChatSelected(chat);
                          const label = getChatListLabel(chat, !!isAdmin);
                          const badge =
                            chat.type === "patient"
                              ? isAdmin
                                ? t.chatWithPatient
                                : (chat.otherParticipantName ?? t.chatWithDoctor)
                              : chat.type === "direct"
                                ? t.chatWithHomeopath
                                : chat.type === "consilium"
                                  ? t.chatConsilium
                                  : chat.type === "channel"
                                    ? (chat.myRole === "owner" ? t.channelOwn : t.channelSub)
                                    : t.chatGroup;
                          const isPatientRow = chat.type === "patient";
                          const rawMsgPreview = chat.lastMessagePreview?.trim() ?? "";
                          const displayMsgPreview = normalizeMessengerListPreview(rawMsgPreview);
                          const hasMsgPreview = !!displayMsgPreview;
                          const alignTop = isPatientRow || hasMsgPreview;
                          return (
                            <button
                              key={chat.conversationId ?? `${chat.type}-${chat.otherParticipantId ?? ""}`}
                              type="button"
                              onClick={() => {
                                if (chat.type === "channel" && chat.conversationId) {
                                  handleSelectChannel({
                                    id: chat.conversationId,
                                    name: chat.name ?? null,
                                    avatarUrl: chat.avatarUrl ?? null,
                                    isMember: chat.isMember ?? true,
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
                              <ChatListAvatar chat={chat} label={label} />
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-foreground truncate">{label}</p>
                                {hasMsgPreview ? (
                                  <ChatListMessagePreview preview={rawMsgPreview} multiline={alignTop} />
                                ) : (
                                  <p className="text-[13px] text-muted-foreground truncate mt-0.5">{badge}</p>
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
                              <AvatarImage src={profileAvatarSrc(group.avatarUrl)} />
                              <AvatarFallback>{chatInitial(group.name || t.chatGroup)}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-foreground truncate">{group.name || t.chatGroup}</p>
                              {renderDiscoverSearchSubtitle(group, t.chatGroup, t.actionJoinGroup)}
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
                              <AvatarImage src={profileAvatarSrc(channel.avatarUrl)} />
                              <AvatarFallback>{chatInitial(channel.name || t.channelSub)}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-foreground truncate">{channel.name || t.channelSub}</p>
                              {renderDiscoverSearchSubtitle(channel, t.channelSub, t.actionSubscribe)}
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
            ) : isLoading && listChats.length === 0 ? (
              <div className="flex items-center justify-center p-4">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (
              <ScrollArea ref={listScrollRef} className="h-full">
                <div className="flex min-h-full flex-col pt-1">
                  {listChats.length === 0 ? (
                    <MessengerFolderPanel
                      folder={activeFolder}
                      isAdmin={!!isAdmin}
                      variant="empty"
                      invitePending={createInviteLinkMutation.isPending}
                      createPending={createConversationMutation.isPending}
                      onInvitePatient={() => createInviteLinkMutation.mutate("patient")}
                      onInviteHomeopath={() => createInviteLinkMutation.mutate("homeopath")}
                      onCreateGroup={() => {
                        setCreateConversationName("");
                        setCreateConversationType("group");
                      }}
                      onCreateChannel={() => {
                        setCreateConversationName("");
                        setCreateConversationType("channel");
                      }}
                    />
                  ) : (
                    <>
                      {listToShow.map((chat) => {
                    if (chat.type === "divider") {
                      const isGroupsDivider = chat.dividerKey === "groups-split";
                      return (
                        <div
                          key={chat.dividerKey ?? "channels-split"}
                          className="px-3 py-2 text-center text-xs text-muted-foreground border-y border-border/60 bg-muted/20"
                        >
                          {isGroupsDivider ? (
                            <>
                              <span>{t.groupMyDivider}</span>
                              <span className="mx-1.5">|</span>
                              <span>{t.groupPublicDivider}</span>
                            </>
                          ) : (
                            <>
                              <span>{t.channelSubscriptionsDivider}</span>
                              <span className="mx-1.5">|</span>
                              <span>{t.channelAllDivider}</span>
                            </>
                          )}
                        </div>
                      );
                    }
                    const isSelected = isChatSelected(chat);
                    const label = getChatListLabel(chat, !!isAdmin);
                    const isDiscoverChannel =
                      chat.type === "channel" && (chat.section === "discover" || chat.isMember === false);
                    const isDiscoverGroup =
                      chat.type === "group" && (chat.section === "discover" || chat.isMember === false);
                    const badge =
                      chat.type === "patient"
                        ? isAdmin
                          ? t.chatWithPatient
                          : (chat.otherParticipantName ?? t.chatWithDoctor)
                        : chat.type === "direct"
                          ? t.chatWithHomeopath
                          : chat.type === "consilium"
                            ? t.chatConsilium
                            : chat.type === "channel"
                              ? isDiscoverChannel && !chat.isMember
                                ? t.actionSubscribe
                                : chat.myRole === "owner"
                                  ? t.channelOwn
                                  : t.channelSub
                              : chat.type === "group"
                                ? isDiscoverGroup && !chat.isMember
                                  ? t.actionJoinGroup
                                  : t.chatGroup
                                : t.chatGroup;
                    const isPatientRow = chat.type === "patient";
                    const rawMsgPreview = chat.lastMessagePreview?.trim() ?? "";
                    const displayMsgPreview = normalizeMessengerListPreview(rawMsgPreview);
                    const hasMsgPreview = !!displayMsgPreview;
                    const alignTop = isPatientRow || hasMsgPreview;
                    return (
                      <button
                        key={chat.conversationId ?? `${chat.type}-${chat.otherParticipantId ?? ""}`}
                        type="button"
                        onClick={() => {
                          if (chat.type === "channel" && chat.conversationId) {
                            handleSelectChannel({
                              id: chat.conversationId,
                              name: chat.name ?? null,
                              avatarUrl: chat.avatarUrl ?? null,
                              isMember: chat.isMember ?? chat.section !== "discover",
                            });
                            return;
                          }
                          if (chat.type === "group" && chat.conversationId) {
                            handleSelectGroup({
                              id: chat.conversationId,
                              name: chat.name ?? null,
                              avatarUrl: chat.avatarUrl ?? null,
                              participantCount: chat.participantCount ?? 0,
                              isMember: chat.isMember ?? chat.section !== "discover",
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
                        <ChatListAvatar chat={chat} label={label} />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-foreground truncate">{label}</p>
                          {hasMsgPreview ? (
                            <ChatListMessagePreview preview={rawMsgPreview} multiline={alignTop} />
                          ) : (
                            <p className="text-[13px] text-muted-foreground truncate mt-0.5">{badge}</p>
                          )}
                        </div>
                        <div className={cn("shrink-0 flex flex-col items-end gap-0.5", alignTop && "pt-0.5")}>
                          {chat.lastMessageAt && (
                            <span className="text-xs text-muted-foreground">{formatChatTime(chat.lastMessageAt)}</span>
                          )}
                          {chat.hasActiveCall && (
                            <span
                              className="flex h-5 w-5 items-center justify-center rounded-full bg-green-600 text-white"
                              title={t.voiceCallOngoing}
                              data-testid="chat-list-active-call"
                            >
                              <Phone className="h-3 w-3 animate-pulse" />
                            </span>
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
                  {isAdmin && (
                    <MessengerFolderPanel
                      folder={activeFolder}
                      isAdmin
                      variant="footer"
                      invitePending={createInviteLinkMutation.isPending}
                      createPending={createConversationMutation.isPending}
                      onInvitePatient={() => createInviteLinkMutation.mutate("patient")}
                      onInviteHomeopath={() => createInviteLinkMutation.mutate("homeopath")}
                      onCreateGroup={() => {
                        setCreateConversationName("");
                        setCreateConversationType("group");
                      }}
                      onCreateChannel={() => {
                        setCreateConversationName("");
                        setCreateConversationType("channel");
                      }}
                    />
                  )}
                    </>
                  )}
                </div>
              </ScrollArea>
            )}
          </TabsContent>
        </Tabs>
      </div>
      )}

      <div className="flex-1 flex flex-col min-h-0 bg-muted/20">
        {isProfileOpen ? (
          <div className="app-profile-panel-scroll flex min-h-0 min-w-0 flex-1 flex-col bg-background">
            <Profile
              embedded={!isMobileView}
              profileUserId={profileUserId}
              onBack={() => setLocation(messengerProfileReturnPath(profileSearch))}
            />
          </div>
        ) : (isGroupSettings || isChannelSettings) && conversationId ? (
          <div className="flex-1 flex flex-col min-h-0">
            <GroupOrChannelSettings
              conversationId={conversationId}
              mode={isGroupSettings ? "group" : "channel"}
              currentUserId={user?.id}
              onBack={() => setLocation(isGroupSettings ? `/messenger/group/${conversationId}` : `/messenger/channel/${conversationId}`)}
            />
          </div>
        ) : isPatientChatSettings && conversationId ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <PatientChatSettings
              conversationId={conversationId}
              onBack={() => setLocation(`/messenger/chat/${conversationId}`)}
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
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden chat-panel-bg">
            <ConversationChat
              conversationId={conversationId}
              onBack={() => setLocation("/messenger")}
              onTitleClick={() => {
                if (isGroupChat) setLocation(`/messenger/group/${conversationId}/settings`);
                if (isChannelChat) setLocation(`/messenger/channel/${conversationId}/settings`);
                if (isPatientChat) setLocation(`/messenger/chat/${conversationId}/settings`);
              }}
            />
          </div>
        ) : null}

      </div>

      <Dialog open={inviteRolePickerOpen} onOpenChange={setInviteRolePickerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.inviteChooseRoleTitle}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t.inviteChooseRoleHint}</p>
          <DialogFooter className="flex flex-col gap-2 sm:flex-col sm:space-x-0">
            <Button
              type="button"
              className="w-full"
              disabled={createInviteLinkMutation.isPending}
              onClick={() => createInviteLinkMutation.mutate("patient")}
            >
              {createInviteLinkMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {t.messengerInvitePatient}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={createInviteLinkMutation.isPending}
              onClick={() => createInviteLinkMutation.mutate("homeopath")}
            >
              {t.messengerInviteHomeopath}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={inviteLinkData.open} onOpenChange={(open) => setInviteLinkData((prev) => ({ ...prev, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {inviteLinkData.inviteType === "homeopath"
                ? t.inviteLinkForHomeopath
                : t.inviteLinkForPatient}
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
        open={isAdmin && createConversationType !== null}
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
    </>
  );
}
