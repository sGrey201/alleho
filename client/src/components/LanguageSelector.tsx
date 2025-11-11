import { useLanguage } from '@/context/LanguageContext';
import { Language } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Globe } from 'lucide-react';

const languageFlags: Record<Language, string> = {
  ru: '🇷🇺',
  de: '🇩🇪',
  en: '🇬🇧',
};

const languageNames: Record<Language, string> = {
  ru: 'Русский',
  de: 'Deutsch',
  en: 'English',
};

export function LanguageSelector() {
  const { language, setLanguage, t } = useLanguage();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          data-testid="button-language-selector"
          className="hover-elevate active-elevate-2"
        >
          <Globe className="h-5 w-5" />
          <span className="sr-only">{t('selectLanguage')}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {(['ru', 'de', 'en'] as Language[]).map((lang) => (
          <DropdownMenuItem
            key={lang}
            onClick={() => setLanguage(lang)}
            data-testid={`option-language-${lang}`}
            className={language === lang ? 'bg-accent' : ''}
          >
            <span className="mr-3 text-lg">{languageFlags[lang]}</span>
            <span className="font-medium">{languageNames[lang]}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
