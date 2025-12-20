import { t } from '@/lib/i18n';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, CreditCard, Building2, RefreshCw, Mail } from 'lucide-react';

export default function Terms() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <div className="mb-8">
        <h1 className="mb-4 text-3xl md:text-4xl font-bold text-foreground">
          {t.termsPageTitle}
        </h1>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              {t.serviceDescription}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-foreground leading-relaxed">
              {t.serviceDescriptionText}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              {t.pricingTitle}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-3">
              <span className="text-primary mt-1">•</span>
              <p className="text-foreground font-medium">{t.initialSubscription}</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-primary mt-1">•</span>
              <p className="text-foreground font-medium">{t.renewalSubscription}</p>
            </div>
            <div className="mt-4 pt-4 border-t">
              <p className="text-sm font-semibold text-foreground mb-2">{t.paymentMethods}</p>
              <p className="text-sm text-muted-foreground">{t.paymentMethodsText}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              {t.requisitesTitle}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p className="text-foreground font-semibold">
                Воробьева Евгения Михайловна
              </p>
              <p className="text-foreground">
                <span className="font-semibold">{t.selfEmployed}</span>
              </p>
              <p className="text-muted-foreground">
                {t.inn}: <span className="font-mono font-semibold text-foreground">025301343170</span>
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-primary" />
              {t.refundPolicy}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-foreground font-medium">
              {t.noRefund}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              {t.contactUs}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-3">
              По всем вопросам обращайтесь:
            </p>
            <div className="space-y-2">
              <a 
                href="https://t.me/vorobevaEM" 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-primary hover-elevate active-elevate-2 font-medium"
                data-testid="link-telegram-contact"
              >
                <span>Telegram: @vorobevaEM</span>
              </a>
              <a 
                href="https://t.me/homeopathy_for_professionals" 
                target="_blank" 
                rel="noopener noreferrer"
                className="block text-primary hover-elevate active-elevate-2 font-medium"
                data-testid="link-telegram-channel"
              >
                Канал: @homeopathy_for_professionals
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
