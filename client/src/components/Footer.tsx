import { t } from '@/lib/i18n';
import { Link } from 'wouter';

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
          <div>
            <h3 className="mb-4 text-sm font-semibold text-foreground">Alle Homöopathen</h3>
            <p className="text-sm text-muted-foreground">Профессиональная платформа для гомеопатов</p>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-semibold text-foreground">Каталог</h3>
            <div className="space-y-2">
              <Link 
                href="/remedies"
                className="block text-sm text-muted-foreground hover:text-primary transition-colors"
                data-testid="link-footer-remedies"
              >
                Все препараты
              </Link>
              <Link 
                href="/situations"
                className="block text-sm text-muted-foreground hover:text-primary transition-colors"
                data-testid="link-footer-situations"
              >
                Все случаи
              </Link>
            </div>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-semibold text-foreground">{t.contacts}</h3>
            <div className="space-y-2">
              <a 
                href="https://t.me/vorobevaEM" 
                target="_blank" 
                rel="noopener noreferrer"
                className="block text-sm text-muted-foreground hover:text-primary transition-colors"
                data-testid="link-footer-telegram"
              >Личка: @vorobevaEM</a>
              <a 
                href="https://t.me/homeopathy_for_professionals" 
                target="_blank" 
                rel="noopener noreferrer"
                className="block text-sm text-muted-foreground hover:text-primary transition-colors"
                data-testid="link-footer-telegram-channel"
              >
                Канал: @homeopathy_for_professionals
              </a>
            </div>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-semibold text-foreground">Информация</h3>
            <div className="space-y-2">
              <Link 
                href="/about"
                className="block text-sm text-muted-foreground hover:text-primary transition-colors"
                data-testid="link-footer-about"
              >
                О проекте
              </Link>
              <Link 
                href="/terms"
                className="block text-sm text-muted-foreground hover:text-primary transition-colors"
                data-testid="link-footer-terms"
              >
                {t.termsAndRefund}
              </Link>
              <Link 
                href="/oferta"
                className="block text-sm text-muted-foreground hover:text-primary transition-colors"
                data-testid="link-footer-oferta"
              >
                {t.oferta}
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-8 border-t pt-8">
          <p className="text-center text-sm text-muted-foreground">
            © {currentYear} MateriaMedica. {t.allRightsReserved}
          </p>
        </div>
      </div>
    </footer>
  );
}
