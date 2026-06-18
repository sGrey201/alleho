import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Check, Loader2, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ImageViewerDialog } from "@/components/ImageViewerDialog";
import { useToast } from "@/hooks/use-toast";
import { useUpload } from "@/hooks/use-upload";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { t } from "@/lib/i18n";
import { profileAvatarSrc, cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { normalizeTierAmountInput } from "@shared/sponsorTiers";

type DonationType = "content" | "content_thanks";

type SponsorTier = {
  type: DonationType;
  amount: string;
  durationDays: number;
};

type SponsorSettings = {
  enabled: boolean;
  paymentInstructions: string | null;
  tier1Amount: string | null;
  tier2Amount: string | null;
  durationDays: number;
  contentDurationDays?: number;
  sponsorDurationDays?: number;
  tiers: SponsorTier[];
  isSponsor: boolean;
  sponsorExpiresAt: string | null;
  hasContentAccess?: boolean;
  isChannelSponsor?: boolean;
  channelSponsorExpiresAt?: string | null;
  hasActiveSponsors?: boolean;
};

type SponsorPayment = {
  id: string;
  userId: string;
  receiptUrl: string;
  amount: string | null;
  donationType: DonationType;
  status: string;
  submittedAt: string | null;
  validUntil: string | null;
  disputeReason: string | null;
  user?: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
  };
};

type Props = {
  conversationId: string;
  isOwner: boolean;
  scrollOnMount?: boolean;
  embedded?: boolean;
};

function displayUserName(user?: SponsorPayment["user"]) {
  if (!user) return "—";
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name || user.email || user.id;
}

function paymentStatusLabel(status: string) {
  if (status === "approved") return t.sponsorPaymentApproved;
  if (status === "disputed") return t.sponsorPaymentDisputed;
  return t.sponsorPaymentPending;
}

function donationTypeLabel(type: DonationType) {
  return type === "content_thanks" ? t.sponsorDonationTypeContentThanks : t.sponsorDonationTypeContent;
}

function tierTitle(tier: SponsorTier) {
  if (tier.type === "content_thanks") {
    return t.sponsorTierChannelSponsorTitle(tier.durationDays);
  }
  return t.sponsorTierContentTitle(tier.durationDays);
}

function formatExpiryDate(iso: string) {
  return format(new Date(iso), "d MMMM yyyy", { locale: ru });
}

function isTierActive(settings: SponsorSettings, type: DonationType) {
  if (type === "content") {
    return settings.hasContentAccess ?? settings.isSponsor;
  }
  return settings.isChannelSponsor ?? false;
}

export default function ChannelSponsorSection({
  conversationId,
  isOwner,
  scrollOnMount,
  embedded = false,
}: Props) {
  const { toast } = useToast();
  const sectionRef = useRef<HTMLDivElement>(null);
  const receiptInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile, isUploading } = useUpload();
  const [enabled, setEnabled] = useState(false);
  const [paymentInstructions, setPaymentInstructions] = useState("");
  const [tier1Amount, setTier1Amount] = useState("0");
  const [tier2Amount, setTier2Amount] = useState("0");
  const [contentDurationDays, setContentDurationDays] = useState("30");
  const [sponsorDurationDays, setSponsorDurationDays] = useState("30");
  const [selectedTier, setSelectedTier] = useState<DonationType | null>(null);
  const [settingsExpanded, setSettingsExpanded] = useState(false);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState<string | null>(null);
  const [disputePaymentId, setDisputePaymentId] = useState<string | null>(null);
  const [disputeReason, setDisputeReason] = useState("");
  const selectedTierRef = useRef<DonationType | null>(null);
  const receiptInputId = `receipt-input-${conversationId}`;

  useEffect(() => {
    selectedTierRef.current = selectedTier;
  }, [selectedTier]);

  const settingsKey = ["/api/conversations", conversationId, "sponsor-settings"] as const;
  const paymentsKey = ["/api/conversations", conversationId, "sponsor-payments"] as const;
  const sponsorsKey = ["/api/conversations", conversationId, "channel-sponsors"] as const;

  const { data: settings, isLoading } = useQuery<SponsorSettings>({
    queryKey: settingsKey,
    queryFn: async () => {
      const res = await fetch(`/api/conversations/${conversationId}/sponsor-settings`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!conversationId,
  });

  const { data: payments = [], refetch: refetchPayments } = useQuery<SponsorPayment[]>({
    queryKey: paymentsKey,
    queryFn: async () => {
      const res = await fetch(`/api/conversations/${conversationId}/sponsor-payments`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!conversationId && (isOwner || settings?.enabled),
  });

  useEffect(() => {
    if (!settings) return;
    setEnabled(settings.enabled);
    setPaymentInstructions(settings.paymentInstructions ?? "");
    setTier1Amount(normalizeTierAmountInput(settings.tier1Amount));
    setTier2Amount(normalizeTierAmountInput(settings.tier2Amount));
    setContentDurationDays(String(settings.contentDurationDays ?? settings.durationDays ?? 30));
    setSponsorDurationDays(String(settings.sponsorDurationDays ?? settings.durationDays ?? 30));
  }, [settings]);

  useEffect(() => {
    setSelectedTier(null);
  }, [conversationId]);

  useEffect(() => {
    if (scrollOnMount) setSettingsExpanded(true);
  }, [scrollOnMount]);

  useEffect(() => {
    if (!scrollOnMount || !sectionRef.current) return;
    sectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [scrollOnMount, isLoading]);

  const saveSettingsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/conversations/${conversationId}/sponsor-settings`, {
        enabled,
        paymentInstructions: paymentInstructions.trim() || null,
        tier1Amount: normalizeTierAmountInput(tier1Amount),
        tier2Amount: normalizeTierAmountInput(tier2Amount),
        contentDurationDays: Math.max(1, parseInt(contentDurationDays, 10) || 30),
        sponsorDurationDays: Math.max(1, parseInt(sponsorDurationDays, 10) || 30),
      });
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: settingsKey });
      await queryClient.invalidateQueries({ queryKey: sponsorsKey });
      await queryClient.invalidateQueries({ queryKey: ["/api/conversations", conversationId] });
      toast({ title: t.saved });
    },
    onError: () => toast({ title: t.error, variant: "destructive" }),
  });

  const submitReceiptMutation = useMutation({
    mutationFn: async ({ receiptUrl, donationType }: { receiptUrl: string; donationType: DonationType }) => {
      const res = await apiRequest("POST", `/api/conversations/${conversationId}/sponsor-payments`, {
        receiptUrl,
        donationType,
      });
      return res.json();
    },
    onSuccess: async () => {
      setSelectedTier(null);
      await queryClient.invalidateQueries({ queryKey: settingsKey });
      await queryClient.invalidateQueries({ queryKey: paymentsKey });
      await queryClient.invalidateQueries({ queryKey: sponsorsKey });
      await queryClient.invalidateQueries({ queryKey: ["/api/conversations", conversationId] });
      await queryClient.invalidateQueries({
        queryKey: ["/api/conversations", conversationId, "messages"],
      });
      toast({ title: t.sponsorPaymentSubmitted });
    },
    onError: (err: Error) =>
      toast({ title: t.error, description: err.message, variant: "destructive" }),
  });

  const approveMutation = useMutation({
    mutationFn: async (paymentId: string) => {
      await apiRequest(
        "POST",
        `/api/conversations/${conversationId}/sponsor-payments/${paymentId}/approve`,
        {}
      );
    },
    onSuccess: async () => {
      await refetchPayments();
      toast({ title: t.sponsorPaymentApproved });
    },
  });

  const disputeMutation = useMutation({
    mutationFn: async ({ paymentId, reason }: { paymentId: string; reason: string }) => {
      await apiRequest(
        "POST",
        `/api/conversations/${conversationId}/sponsor-payments/${paymentId}/dispute`,
        { reason: reason.trim() || null }
      );
    },
    onSuccess: async () => {
      setDisputePaymentId(null);
      setDisputeReason("");
      await queryClient.invalidateQueries({ queryKey: settingsKey });
      await queryClient.invalidateQueries({ queryKey: paymentsKey });
      await queryClient.invalidateQueries({ queryKey: sponsorsKey });
      await queryClient.invalidateQueries({ queryKey: ["/api/conversations", conversationId] });
      await queryClient.invalidateQueries({
        queryKey: ["/api/conversations", conversationId, "messages"],
      });
      toast({ title: t.sponsorPaymentDisputed });
    },
  });

  const handleReceiptChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    const tier = selectedTierRef.current;
    if (!file) return;
    if (!tier) {
      toast({ title: t.error, variant: "destructive" });
      input.value = "";
      return;
    }

    try {
      const uploadResponse = await uploadFile(file);
      if (!uploadResponse?.objectPath) {
        toast({ title: t.error, variant: "destructive" });
        return;
      }
      await submitReceiptMutation.mutateAsync({
        receiptUrl: uploadResponse.objectPath,
        donationType: tier,
      });
    } catch {
      // mutateAsync / upload errors surfaced via onError or toast above
    } finally {
      input.value = "";
    }
  };

  if (isLoading) {
    return (
      <div className={embedded ? "flex justify-center py-2" : "flex justify-center py-4"}>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isOwner && !settings?.enabled) {
    return null;
  }

  const tiers = settings?.tiers ?? [];
  const selectedTierAmount = tiers.find((tier) => tier.type === selectedTier)?.amount;
  const hasContentAccess = settings ? isTierActive(settings, "content") : false;
  const hasChannelSponsor = settings ? isTierActive(settings, "content_thanks") : false;
  const contentUntil = settings?.sponsorExpiresAt ? formatExpiryDate(settings.sponsorExpiresAt) : null;
  const channelSponsorUntil = settings?.channelSponsorExpiresAt
    ? formatExpiryDate(settings.channelSponsorExpiresAt)
    : null;
  const purchasableTiers = tiers.filter((tier) => !settings || !isTierActive(settings, tier.type));
  const pendingPaymentCount = payments.filter((p) => p.status === "granted").length;
  const sortedPayments = [...payments].sort((a, b) => {
    const aNeedsReview = a.status === "granted" ? 0 : 1;
    const bNeedsReview = b.status === "granted" ? 0 : 1;
    if (aNeedsReview !== bNeedsReview) return aNeedsReview - bNeedsReview;
    const aTime = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
    const bTime = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
    return bTime - aTime;
  });

  return (
    <div
      id={embedded ? undefined : "channel-sponsor-payment"}
      ref={sectionRef}
      className={
        embedded
          ? "space-y-3"
          : "space-y-4 rounded-lg border p-4"
      }
    >
      {isOwner ? (
        <>
          <div
            className="flex items-center justify-between gap-3 cursor-pointer select-none"
            onClick={() => setSettingsExpanded((value) => !value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setSettingsExpanded((value) => !value);
              }
            }}
            role="button"
            tabIndex={0}
            aria-expanded={settingsExpanded}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-medium">{t.channelSponsorEnable}</span>
              {pendingPaymentCount > 0 && (
                <Badge
                  variant="secondary"
                  className="h-5 min-w-5 shrink-0 justify-center px-1.5 text-xs tabular-nums"
                  title={t.sponsorPaymentPending}
                >
                  {pendingPaymentCount}
                </Badge>
              )}
            </div>
            <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
              <Switch
                id="sponsor-enabled"
                checked={enabled}
                disabled={settings?.hasActiveSponsors}
                onCheckedChange={(value) => {
                  setEnabled(value);
                  if (value) setSettingsExpanded(true);
                }}
              />
            </div>
          </div>
          {settingsExpanded && (
            <>
              <div className="space-y-2">
                <Label htmlFor="payment-instructions">{t.channelSponsorPaymentInstructions}</Label>
                <Textarea
                  id="payment-instructions"
                  value={paymentInstructions}
                  onChange={(e) => setPaymentInstructions(e.target.value)}
                  placeholder={t.channelSponsorPaymentInstructionsPlaceholder}
                  rows={4}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="tier1-amount">{t.channelSponsorTier1Amount}</Label>
                  <Input
                    id="tier1-amount"
                    type="number"
                    min={0}
                    value={tier1Amount}
                    onChange={(e) => setTier1Amount(e.target.value)}
                  />
                  <Label htmlFor="content-duration-days">{t.channelSponsorContentDurationDays}</Label>
                  <Input
                    id="content-duration-days"
                    type="number"
                    min={1}
                    value={contentDurationDays}
                    onChange={(e) => setContentDurationDays(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tier2-amount">{t.channelSponsorTier2Amount}</Label>
                  <Input
                    id="tier2-amount"
                    type="number"
                    min={0}
                    value={tier2Amount}
                    onChange={(e) => setTier2Amount(e.target.value)}
                  />
                  <Label htmlFor="sponsor-duration-days">{t.channelSponsorListingDurationDays}</Label>
                  <Input
                    id="sponsor-duration-days"
                    type="number"
                    min={1}
                    value={sponsorDurationDays}
                    onChange={(e) => setSponsorDurationDays(e.target.value)}
                  />
                </div>
              </div>
              <Button
                onClick={() => saveSettingsMutation.mutate()}
                disabled={saveSettingsMutation.isPending}
              >
                {saveSettingsMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {t.save}
              </Button>
              {enabled && payments.length > 0 && (
                <div className="space-y-2 border-t pt-4">
                  <p className="text-sm font-medium">{t.channelSponsorPaymentsTitle}</p>
                  {sortedPayments.map((payment) => (
                    <div key={payment.id} className="rounded-md border px-3 py-2 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{displayUserName(payment.user)}</p>
                          <p className="text-xs text-muted-foreground">
                            {payment.submittedAt
                              ? format(new Date(payment.submittedAt), "d MMM yyyy, HH:mm", { locale: ru })
                              : "—"}
                            {payment.amount ? ` · ${payment.amount}` : ""}
                          </p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            <Badge variant="outline">{paymentStatusLabel(payment.status)}</Badge>
                            {payment.donationType && (
                              <Badge variant="secondary">{donationTypeLabel(payment.donationType)}</Badge>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="shrink-0 cursor-pointer rounded border transition-opacity hover:opacity-90"
                          onClick={() =>
                            setReceiptPreviewUrl(profileAvatarSrc(payment.receiptUrl) ?? null)
                          }
                          aria-label={t.sponsorReceiptPreview}
                        >
                          <img
                            src={profileAvatarSrc(payment.receiptUrl)}
                            alt=""
                            className="h-14 w-14 rounded object-cover"
                          />
                        </button>
                      </div>
                      {payment.status === "granted" && (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={approveMutation.isPending}
                            onClick={() => approveMutation.mutate(payment.id)}
                          >
                            <Check className="mr-1 h-3.5 w-3.5" />
                            {t.sponsorPaymentApprove}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive"
                            onClick={() => {
                              setDisputePaymentId(payment.id);
                              setDisputeReason("");
                            }}
                          >
                            <X className="mr-1 h-3.5 w-3.5" />
                            {t.sponsorPaymentDispute}
                          </Button>
                        </div>
                      )}
                      {disputePaymentId === payment.id && (
                        <div className="space-y-2">
                          <Input
                            value={disputeReason}
                            onChange={(e) => setDisputeReason(e.target.value)}
                            placeholder={t.sponsorDisputeReasonPlaceholder}
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={disputeMutation.isPending}
                              onClick={() =>
                                disputeMutation.mutate({ paymentId: payment.id, reason: disputeReason })
                              }
                            >
                              {t.sponsorPaymentDispute}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setDisputePaymentId(null)}>
                              {t.cancel}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      ) : (
        settings?.enabled && (
          <div className="space-y-3">
            {(hasContentAccess || hasChannelSponsor) && (
              <div className="flex flex-wrap gap-2">
                {hasContentAccess && contentUntil && (
                  <Badge variant="secondary">{t.contentPaidUntil(contentUntil)}</Badge>
                )}
                {hasChannelSponsor && channelSponsorUntil && (
                  <Badge variant="secondary">{t.channelSponsorPaidUntil(channelSponsorUntil)}</Badge>
                )}
              </div>
            )}
            {selectedTier ? (
              <>
                <p className="text-sm font-medium">
                  {t.sponsorTransferInstructionsTitle(selectedTierAmount ?? "0")}
                </p>
                {settings?.paymentInstructions?.trim() ? (
                  <div className="rounded-md bg-muted/50 px-3 py-2 text-sm whitespace-pre-wrap">
                    {settings.paymentInstructions.trim()}
                  </div>
                ) : null}
                <input
                  id={receiptInputId}
                  ref={receiptInputRef}
                  type="file"
                  className="sr-only"
                  accept="image/*,application/pdf"
                  onChange={handleReceiptChange}
                />
                <div className="flex gap-2">
                  <label
                    htmlFor={receiptInputId}
                    className={cn(
                      buttonVariants({ variant: "outline" }),
                      "flex-1 cursor-pointer",
                      (isUploading || submitReceiptMutation.isPending) &&
                        "pointer-events-none opacity-50"
                    )}
                  >
                    {isUploading || submitReceiptMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Paperclip className="h-4 w-4" />
                    )}
                    {t.channelSponsorAttachReceipt}
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    disabled={isUploading || submitReceiptMutation.isPending}
                    onClick={() => setSelectedTier(null)}
                  >
                    {t.cancel}
                  </Button>
                </div>
              </>
            ) : (
              purchasableTiers.length > 0 && (
                <div className="space-y-2">
                  {purchasableTiers.map((tier) => (
                    <button
                      key={tier.type}
                      type="button"
                      className="flex w-full flex-col items-center gap-2 rounded-md border px-4 py-4 text-center hover:bg-muted/40 transition-colors"
                      onClick={() => setSelectedTier(tier.type)}
                    >
                      <span className="text-sm leading-snug text-muted-foreground">
                        {tierTitle(tier)}
                      </span>
                      <span className="text-lg font-semibold">{t.sponsorTierOpenFor(tier.amount)}</span>
                    </button>
                  ))}
                </div>
              )
            )}
          </div>
        )
      )}

      <ImageViewerDialog
        open={!!receiptPreviewUrl}
        imageUrl={receiptPreviewUrl}
        hasMultiple={false}
        allowZoom
        onClose={() => setReceiptPreviewUrl(null)}
        onPrevious={() => {}}
        onNext={() => {}}
      />
    </div>
  );
}
