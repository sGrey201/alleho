import { useLanguage } from '@/context/LanguageContext';
import { Link, useLocation } from 'wouter';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';
import { FileText, Users, Home, Tags } from 'lucide-react';

export function AppSidebar() {
  const { t } = useLanguage();
  const [location] = useLocation();

  const menuItems = [
    {
      title: t('home'),
      url: '/',
      icon: Home,
    },
    {
      title: t('manageArticles'),
      url: '/admin/articles',
      icon: FileText,
    },
    {
      title: t('manageTags'),
      url: '/admin/tags',
      icon: Tags,
    },
    {
      title: t('manageSubscriptions'),
      url: '/admin/subscriptions',
      icon: Users,
    },
  ];

  return (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t('adminPanel')}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    asChild
                    className={location === item.url ? 'bg-sidebar-accent' : ''}
                    data-testid={`link-sidebar-${item.url}`}
                  >
                    <Link href={item.url}>
                      <a className="flex items-center gap-3 w-full">
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </a>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
