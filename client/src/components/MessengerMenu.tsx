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
import { LandingPanel } from "@/components/LandingPanel";
import { PwaInstallMenuFooter } from "@/components/PwaInstallMenuFooter";
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
      <Icon className="h-8 w-8 shrink-0 text-primary" aria-hidden />
      <span className="text-xs text-center leading-tight">{label}</span>
    </>
  );

  const tileClass = cn(
    "aspect-square w-full rounded-2xl border border-border/60 bg-muted/30 p-3",
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
  showInstallButtons: boolean;
  onInstallSafari: () => void;
  onInstallChrome: () => void;
  onInstallYandex: () => void;
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
  showInstallButtons,
  onInstallSafari,
  onInstallChrome,
  onInstallYandex,
  onLogin,
  onRegister,
  onLogout,
  onInvite,
  onCreateGroup,
  onCreateChannel,
  onClose,
}: MessengerMenuProps) {
  const installFooter = (
    <PwaInstallMenuFooter
      showInstallButtons={showInstallButtons}
      onSafariClick={onInstallSafari}
      onChromeClick={onInstallChrome}
      onYandexClick={onInstallYandex}
    />
  );

  if (isGuest) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-background">
        <div className="flex-1 min-h-0 overflow-y-auto">
          <LandingPanel
            compact
            className="min-h-full justify-center"
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
        {installFooter}
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

  const cols = 3;
  const remainder = items.length % cols;
  const headCount = remainder === 0 ? items.length : items.length - remainder;
  const headItems = items.slice(0, headCount);
  const tailItems = items.slice(headCount);
  const tileWidth = "w-[calc((100%-1.5rem)/3)]";

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex-1 overflow-y-auto p-4">
        {headItems.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            {headItems.map((item) => (
              <MessengerMenuTile
                key={item.id}
                icon={item.icon}
                label={item.label}
                href={item.href}
                onClick={item.onClick}
              />
            ))}
          </div>
        )}
        {tailItems.length > 0 && (
          <div className={cn("flex justify-center gap-3", headItems.length > 0 && "mt-3")}>
            {tailItems.map((item) => (
              <div key={item.id} className={tileWidth}>
                <MessengerMenuTile
                  icon={item.icon}
                  label={item.label}
                  href={item.href}
                  onClick={item.onClick}
                  className="w-full"
                />
              </div>
            ))}
          </div>
        )}
      </div>
      {installFooter}
    </div>
  );
}
