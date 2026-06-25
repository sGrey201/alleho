import type { LucideIcon } from "lucide-react";
import {
  User,
  LogOut,
  ClipboardList,
  UserPlus,
  Users,
  Radio,
} from "lucide-react";
import { Link } from "wouter";
import { AuthLogoLink } from "@/components/AuthLogoLink";
import { LandingPanel } from "@/components/LandingPanel";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

type MessengerMenuTileProps = {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  href?: string;
  className?: string;
};

function MessengerMenuTile({ icon: Icon, label, onClick, href, className }: MessengerMenuTileProps) {
  const content = (
    <>
      <Icon className="h-10 w-10 shrink-0 text-primary" aria-hidden />
      <span className="text-sm text-center leading-tight">{label}</span>
    </>
  );

  const tileClass = cn(
    "aspect-square w-full rounded-2xl border border-border/60 bg-muted/30 p-4",
    "flex flex-col items-center justify-center gap-2",
    "hover:bg-muted/50 active:bg-muted/60 transition-colors",
    className
  );

  if (href) {
    return (
      <Link href={href} className={tileClass} onClick={onClick}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" className={tileClass} onClick={onClick}>
      {content}
    </button>
  );
}

type MenuItem = {
  id: string;
  icon: LucideIcon;
  label: string;
  href?: string;
  onClick?: () => void;
};

type MessengerMenuProps = {
  isGuest: boolean;
  isAdmin: boolean;
  onLogin: () => void;
  onRegister: () => void;
  onLogout: () => void;
  onInvite: () => void;
  onCreateGroup: () => void;
  onCreateChannel: () => void;
  onClose: () => void;
};

export function MessengerMenu({
  isGuest,
  isAdmin,
  onLogin,
  onRegister,
  onLogout,
  onInvite,
  onCreateGroup,
  onCreateChannel,
  onClose,
}: MessengerMenuProps) {
  if (isGuest) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-y-auto">
        <LandingPanel
          compact
          className="flex-1 justify-center"
          onLogin={() => {
            onClose();
            onLogin();
          }}
          onRegister={() => {
            onClose();
            onRegister();
          }}
        />
      </div>
    );
  }

  const items: MenuItem[] = [
    { id: "profile", icon: User, label: t.profile, href: "/messenger/profile", onClick: onClose },
  ];

  if (isAdmin) {
    items.push(
      { id: "questionnaires", icon: ClipboardList, label: t.questionnaires, href: "/questionnaires", onClick: onClose },
      { id: "invite", icon: UserPlus, label: t.messengerSendInvite, onClick: () => { onClose(); onInvite(); } },
      { id: "createGroup", icon: Users, label: t.createGroup, onClick: () => { onClose(); onCreateGroup(); } },
      { id: "createChannel", icon: Radio, label: t.createChannel, onClick: () => { onClose(); onCreateChannel(); } },
    );
  } else {
    items.push({
      id: "logout",
      icon: LogOut,
      label: t.logout,
      onClick: () => { onClose(); onLogout(); },
    });
  }

  const lastOdd = items.length % 2 === 1;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-2 gap-3">
          {items.map((item, index) => {
            const isLastCentered = lastOdd && index === items.length - 1;
            return (
              <div
                key={item.id}
                className={cn(isLastCentered && "col-span-2 flex justify-center")}
              >
                <MessengerMenuTile
                  icon={item.icon}
                  label={item.label}
                  href={item.href}
                  onClick={item.onClick}
                  className={isLastCentered ? "w-[calc(50%-0.375rem)]" : undefined}
                />
              </div>
            );
          })}
        </div>
      </div>
      <div className="shrink-0 px-4 pt-2 pb-6">
        <AuthLogoLink href="/messenger" className="max-w-[200px] mx-auto" />
      </div>
    </div>
  );
}
