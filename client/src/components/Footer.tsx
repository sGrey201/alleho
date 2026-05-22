import { t } from '@/lib/i18n';

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <p className="text-center text-sm text-muted-foreground">
          © {currentYear} hovial. {t.allRightsReserved}
        </p>
      </div>
    </footer>
  );
}
