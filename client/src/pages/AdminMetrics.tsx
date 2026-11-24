import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { messengerProfilePath } from "@/lib/messengerPaths";
import { t } from "@/lib/i18n";

type PlatformMetricsWeeklyPoint = {
  weekStart: string;
  activeDoctorPatientPairs: number;
};

type PlatformMetricsDoctorRow = {
  userId: string;
  displayName: string;
  email: string | null;
  activeSessions7d: number;
  activeSessions28d: number;
};

type PlatformMetricsConsiliumDay = {
  day: string;
  requests: number;
  finished: number;
  errors: number;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
};

type PlatformMetricsConsiliumRow = {
  id: string;
  conversationId: string;
  requestedAt: string;
  answeredAt: string | null;
  status: string;
  model: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  photoCount: number;
  photosSent: boolean;
  missingTranscripts: number;
  error: string | null;
  requesterUserId: string;
  requesterName: string;
  chatTitle: string;
  patientUserId: string | null;
};

type PlatformMetricsPhotoAnalysisRow = {
  id: string;
  conversationId: string;
  requestedAt: string;
  answeredAt: string | null;
  status: string;
  model: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  attemptCount: number;
  error: string | null;
  requesterUserId: string;
  requesterName: string;
  chatTitle: string;
  patientUserId: string | null;
};

type PlatformMetrics = {
  windowDays: number;
  activeDoctorPatientPairs: number;
  doctorWau: number;
  patientWau: number;
  patientInvitesCreated: number;
  patientInvitesAccepted: number;
  inviteAcceptRate: number | null;
  weeklyActivePairs: PlatformMetricsWeeklyPoint[];
  topDoctors: PlatformMetricsDoctorRow[];
  consiliumDays?: PlatformMetricsConsiliumDay[];
  recentConsiliums?: PlatformMetricsConsiliumRow[];
  photoAnalysisDays?: PlatformMetricsConsiliumDay[];
  recentPhotoAnalyses?: PlatformMetricsPhotoAnalysisRow[];
};

const chartConfig = {
  activeDoctorPatientPairs: {
    label: t.adminMetricsNorthStarHint,
    color: "hsl(var(--primary))",
  },
} satisfies ChartConfig;

const consiliumChartConfig = {
  requests: {
    label: t.adminMetricsConsiliumRequests,
    color: "hsl(var(--primary))",
  },
} satisfies ChartConfig;

const photoChartConfig = {
  requests: {
    label: t.adminMetricsConsiliumRequests,
    color: "hsl(var(--primary))",
  },
} satisfies ChartConfig;

const METRICS_PAGE_SIZE = 10;

function usePagedRows<T>(rows: T[], pageSize = METRICS_PAGE_SIZE) {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const visible = rows.slice(safePage * pageSize, safePage * pageSize + pageSize);
  return { page: safePage, pageCount, visible, setPage };
}

function TablePager({
  page,
  pageCount,
  onPage,
}: {
  page: number;
  pageCount: number;
  onPage: (page: number) => void;
}) {
  if (pageCount <= 1) return null;
  return (
    <div className="mt-3 flex items-center justify-between gap-3">
      <Button type="button" variant="outline" size="sm" disabled={page <= 0} onClick={() => onPage(page - 1)}>
        {t.adminMetricsPagePrev}
      </Button>
      <p className="text-xs tabular-nums text-muted-foreground">{t.adminMetricsPageStatus(page + 1, pageCount)}</p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={page + 1 >= pageCount}
        onClick={() => onPage(page + 1)}
      >
        {t.adminMetricsPageNext}
      </Button>
    </div>
  );
}

function formatRate(rate: number | null): string {
  if (rate === null) return "—";
  return `${Math.round(rate * 100)}%`;
}

function formatWeekLabel(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

function formatCount(value: number): string {
  return value.toLocaleString("ru-RU");
}

function formatTokens(value: number | null): string {
  if (value == null) return "—";
  return value.toLocaleString("ru-RU");
}

function formatMoscowDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(requestedAt: string, answeredAt: string | null): string {
  if (!answeredAt) return "—";
  const ms = new Date(answeredAt).getTime() - new Date(requestedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} с`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes} мин` : `${minutes} мин ${rest} с`;
}

function consiliumStatusLabel(status: string): string {
  return t.adminMetricsConsiliumStatus[status] ?? status;
}

export default function AdminMetrics() {
  const [, setLocation] = useLocation();
  const { data, isLoading, isError } = useQuery<PlatformMetrics>({
    queryKey: ["/api/admin/metrics"],
  });

  const chartData = useMemo(
    () =>
      (data?.weeklyActivePairs ?? []).map((point) => ({
        ...point,
        label: formatWeekLabel(point.weekStart),
      })),
    [data?.weeklyActivePairs]
  );

  const consiliumDays = data?.consiliumDays ?? [];
  const consiliumChartData = useMemo(
    () =>
      consiliumDays.map((point) => ({
        ...point,
        label: formatWeekLabel(point.day),
      })),
    [consiliumDays]
  );
  const consiliumTotals = useMemo(
    () =>
      consiliumDays.reduce(
        (sum, point) => ({
          requests: sum.requests + point.requests,
          finished: sum.finished + point.finished,
          errors: sum.errors + point.errors,
          totalTokens: sum.totalTokens + point.totalTokens,
        }),
        { requests: 0, finished: 0, errors: 0, totalTokens: 0 }
      ),
    [consiliumDays]
  );
  const recentConsiliums = data?.recentConsiliums ?? [];
  const consiliumPage = usePagedRows(recentConsiliums);
  const photoDays = data?.photoAnalysisDays ?? [];
  const photoChartData = useMemo(
    () =>
      photoDays.map((point) => ({
        ...point,
        label: formatWeekLabel(point.day),
      })),
    [photoDays]
  );
  const photoTotals = useMemo(
    () =>
      photoDays.reduce(
        (sum, point) => ({
          requests: sum.requests + point.requests,
          finished: sum.finished + point.finished,
          errors: sum.errors + point.errors,
          totalTokens: sum.totalTokens + point.totalTokens,
        }),
        { requests: 0, finished: 0, errors: 0, totalTokens: 0 }
      ),
    [photoDays]
  );
  const recentPhotoAnalyses = data?.recentPhotoAnalyses ?? [];
  const photoPage = usePagedRows(recentPhotoAnalyses);

  const topDoctors = data?.topDoctors ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-3">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0"
          onClick={() => setLocation("/messenger")}
          aria-label={t.backToHealthWall}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">{t.adminMetricsTitle}</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : isError || !data ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t.error}</p>
        ) : (
          <div className="mx-auto max-w-6xl space-y-6">
            <p className="text-sm text-muted-foreground">
              {t.adminMetricsWindow(data.windowDays)}
            </p>

            <div className="rounded-2xl border border-border/60 bg-card px-5 py-6 text-center">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t.adminMetricsNorthStarLabel}
              </p>
              <p className="mt-2 text-5xl font-semibold tabular-nums tracking-tight">
                {data.activeDoctorPatientPairs}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {t.adminMetricsNorthStarHint}
              </p>
            </div>

            <div className="rounded-2xl border border-border/60 bg-card px-4 py-4">
              <div className="mb-3">
                <p className="text-sm font-medium">{t.adminMetricsWeeklyChartTitle}</p>
                <p className="text-xs text-muted-foreground">{t.adminMetricsWeeklyChartHint}</p>
              </div>
              <ChartContainer config={chartConfig} className="aspect-[2/1] w-full">
                <BarChart data={chartData} margin={{ left: 4, right: 4, top: 8, bottom: 0 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                    minTickGap={16}
                  />
                  <YAxis
                    allowDecimals={false}
                    width={28}
                    tickLine={false}
                    axisLine={false}
                  />
                  <ChartTooltip
                    cursor={{ fill: "hsl(var(--muted))" }}
                    content={<ChartTooltipContent />}
                  />
                  <Bar
                    dataKey="activeDoctorPatientPairs"
                    fill="var(--color-activeDoctorPatientPairs)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ChartContainer>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-border/60 bg-card px-4 py-4">
                <p className="text-xs text-muted-foreground">{t.adminMetricsDoctorWau}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{data.doctorWau}</p>
              </div>
              <div className="rounded-xl border border-border/60 bg-card px-4 py-4">
                <p className="text-xs text-muted-foreground">{t.adminMetricsPatientWau}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{data.patientWau}</p>
              </div>
              <div className="rounded-xl border border-border/60 bg-card px-4 py-4">
                <p className="text-xs text-muted-foreground">{t.adminMetricsInviteAcceptRate}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {formatRate(data.inviteAcceptRate)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t.adminMetricsInviteAcceptDetail(
                    data.patientInvitesAccepted,
                    data.patientInvitesCreated
                  )}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-border/60 bg-card px-4 py-4">
              <div className="mb-3">
                <p className="text-sm font-medium">{t.adminMetricsConsiliumTitle}</p>
                <p className="text-xs text-muted-foreground">{t.adminMetricsConsiliumHint}</p>
              </div>
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <p className="text-xs text-muted-foreground">{t.adminMetricsConsiliumRequests}</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">
                    {formatCount(consiliumTotals.requests)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t.adminMetricsConsiliumTokens}</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">
                    {formatCount(consiliumTotals.totalTokens)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t.adminMetricsConsiliumFinished}</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">
                    {formatCount(consiliumTotals.finished)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t.adminMetricsConsiliumErrors}</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">
                    {formatCount(consiliumTotals.errors)}
                  </p>
                </div>
              </div>
              <p className="mb-2 text-sm font-medium">{t.adminMetricsConsiliumChartTitle}</p>
              <ChartContainer config={consiliumChartConfig} className="aspect-[2/1] w-full">
                <BarChart data={consiliumChartData} margin={{ left: 4, right: 4, top: 8, bottom: 0 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                    minTickGap={16}
                  />
                  <YAxis allowDecimals={false} width={28} tickLine={false} axisLine={false} />
                  <ChartTooltip
                    cursor={{ fill: "hsl(var(--muted))" }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const point = payload[0]?.payload as
                        | (PlatformMetricsConsiliumDay & { label: string })
                        | undefined;
                      if (!point) return null;
                      return (
                        <div className="grid min-w-[10rem] gap-1 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
                          <p className="font-medium">{point.label}</p>
                          <p>
                            {t.adminMetricsConsiliumRequests}: {formatCount(point.requests)}
                          </p>
                          <p>
                            {t.adminMetricsConsiliumFinished}: {formatCount(point.finished)}
                          </p>
                          <p>
                            {t.adminMetricsConsiliumErrors}: {formatCount(point.errors)}
                          </p>
                          <p>
                            {t.adminMetricsConsiliumTokens}: {formatCount(point.totalTokens)}
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Bar
                    dataKey="requests"
                    fill="var(--color-requests)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ChartContainer>

              <div className="mt-5">
                <p className="text-sm font-medium">{t.adminMetricsConsiliumRecentTitle}</p>
              </div>
              {recentConsiliums.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  {t.adminMetricsConsiliumEmpty}
                </p>
              ) : (
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[44rem] text-left text-sm">
                    <thead>
                      <tr className="border-b border-border/60 text-xs text-muted-foreground">
                        <th className="pb-2 pr-3 font-medium">{t.adminMetricsConsiliumWhenCol}</th>
                        <th className="pb-2 pr-3 font-medium">{t.adminMetricsConsiliumUserCol}</th>
                        <th className="pb-2 pr-3 font-medium">{t.adminMetricsConsiliumChatCol}</th>
                        <th className="pb-2 pr-3 font-medium">{t.adminMetricsConsiliumStatusCol}</th>
                        <th className="pb-2 pr-3 text-right font-medium">{t.adminMetricsConsiliumTokensCol}</th>
                        <th className="pb-2 font-medium">{t.adminMetricsConsiliumModelCol}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {consiliumPage.visible.map((row) => (
                        <tr key={row.id} className="border-b border-border/40 align-top last:border-0">
                          <td className="py-2.5 pr-3">
                            <p className="whitespace-nowrap tabular-nums">
                              {formatMoscowDateTime(row.requestedAt)}
                            </p>
                            <p className="mt-0.5 whitespace-nowrap text-xs text-muted-foreground">
                              {formatDuration(row.requestedAt, row.answeredAt)}
                            </p>
                          </td>
                          <td className="py-2.5 pr-3">
                            <Link
                              href={messengerProfilePath(row.requesterUserId, "/admin/metrics")}
                              className="font-medium leading-snug text-primary hover:underline"
                            >
                              {row.requesterName}
                            </Link>
                          </td>
                          <td className="py-2.5 pr-3">
                            <Link
                              href={`/messenger/chat/${row.conversationId}`}
                              className="leading-snug text-primary hover:underline"
                            >
                              {row.chatTitle}
                            </Link>
                          </td>
                          <td className="py-2.5 pr-3">
                            <p
                              className={
                                row.status === "error"
                                  ? "text-destructive"
                                  : row.status === "finished"
                                    ? "text-foreground"
                                    : "text-muted-foreground"
                              }
                            >
                              {consiliumStatusLabel(row.status)}
                            </p>
                            {row.error ? (
                              <p className="mt-0.5 max-w-[14rem] text-xs text-muted-foreground">
                                {row.error}
                              </p>
                            ) : null}
                            {row.missingTranscripts > 0 ? (
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {t.adminMetricsConsiliumMissingTranscripts(row.missingTranscripts)}
                              </p>
                            ) : null}
                          </td>
                          <td className="py-2.5 pr-3 text-right tabular-nums">
                            <p className="font-medium">{formatTokens(row.totalTokens)}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {t.adminMetricsConsiliumPrompt} {formatTokens(row.promptTokens)}
                              {" · "}
                              {t.adminMetricsConsiliumCompletion} {formatTokens(row.completionTokens)}
                            </p>
                          </td>
                          <td className="py-2.5">
                            <p className="whitespace-nowrap">{row.model ?? "—"}</p>
                            {row.photoCount > 0 ? (
                              <p className="mt-0.5 whitespace-nowrap text-xs text-muted-foreground">
                                {t.adminMetricsConsiliumPhotos(row.photoCount)}
                                {row.photosSent ? "" : `, ${t.adminMetricsConsiliumPhotosTextOnly}`}
                              </p>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <TablePager
                    page={consiliumPage.page}
                    pageCount={consiliumPage.pageCount}
                    onPage={consiliumPage.setPage}
                  />
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-border/60 bg-card px-4 py-4">
              <div className="mb-3">
                <p className="text-sm font-medium">{t.adminMetricsPhotoTitle}</p>
                <p className="text-xs text-muted-foreground">{t.adminMetricsPhotoHint}</p>
              </div>
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <p className="text-xs text-muted-foreground">{t.adminMetricsConsiliumRequests}</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">{formatCount(photoTotals.requests)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t.adminMetricsConsiliumTokens}</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">{formatCount(photoTotals.totalTokens)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t.adminMetricsConsiliumFinished}</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">{formatCount(photoTotals.finished)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t.adminMetricsConsiliumErrors}</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">{formatCount(photoTotals.errors)}</p>
                </div>
              </div>
              <p className="mb-2 text-sm font-medium">{t.adminMetricsPhotoChartTitle}</p>
              <ChartContainer config={photoChartConfig} className="aspect-[2/1] w-full">
                <BarChart data={photoChartData} margin={{ left: 4, right: 4, top: 8, bottom: 0 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                    minTickGap={16}
                  />
                  <YAxis allowDecimals={false} width={28} tickLine={false} axisLine={false} />
                  <ChartTooltip
                    cursor={{ fill: "hsl(var(--muted))" }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const point = payload[0]?.payload as
                        | (PlatformMetricsConsiliumDay & { label: string })
                        | undefined;
                      if (!point) return null;
                      return (
                        <div className="grid min-w-[10rem] gap-1 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
                          <p className="font-medium">{point.label}</p>
                          <p>
                            {t.adminMetricsConsiliumRequests}: {formatCount(point.requests)}
                          </p>
                          <p>
                            {t.adminMetricsConsiliumFinished}: {formatCount(point.finished)}
                          </p>
                          <p>
                            {t.adminMetricsConsiliumErrors}: {formatCount(point.errors)}
                          </p>
                          <p>
                            {t.adminMetricsConsiliumTokens}: {formatCount(point.totalTokens)}
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="requests" fill="var(--color-requests)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>

              <div className="mt-5">
                <p className="text-sm font-medium">{t.adminMetricsPhotoRecentTitle}</p>
              </div>
              {recentPhotoAnalyses.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">{t.adminMetricsPhotoEmpty}</p>
              ) : (
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[44rem] text-left text-sm">
                    <thead>
                      <tr className="border-b border-border/60 text-xs text-muted-foreground">
                        <th className="pb-2 pr-3 font-medium">{t.adminMetricsConsiliumWhenCol}</th>
                        <th className="pb-2 pr-3 font-medium">{t.adminMetricsConsiliumUserCol}</th>
                        <th className="pb-2 pr-3 font-medium">{t.adminMetricsConsiliumChatCol}</th>
                        <th className="pb-2 pr-3 font-medium">{t.adminMetricsConsiliumStatusCol}</th>
                        <th className="pb-2 pr-3 text-right font-medium">{t.adminMetricsConsiliumTokensCol}</th>
                        <th className="pb-2 font-medium">{t.adminMetricsConsiliumModelCol}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {photoPage.visible.map((row) => (
                        <tr key={row.id} className="border-b border-border/40 align-top last:border-0">
                          <td className="py-2.5 pr-3">
                            <p className="whitespace-nowrap tabular-nums">{formatMoscowDateTime(row.requestedAt)}</p>
                            <p className="mt-0.5 whitespace-nowrap text-xs text-muted-foreground">
                              {formatDuration(row.requestedAt, row.answeredAt)}
                            </p>
                          </td>
                          <td className="py-2.5 pr-3">
                            <Link
                              href={messengerProfilePath(row.requesterUserId, "/admin/metrics")}
                              className="font-medium leading-snug text-primary hover:underline"
                            >
                              {row.requesterName}
                            </Link>
                          </td>
                          <td className="py-2.5 pr-3">
                            <Link
                              href={`/messenger/chat/${row.conversationId}`}
                              className="leading-snug text-primary hover:underline"
                            >
                              {row.chatTitle}
                            </Link>
                          </td>
                          <td className="py-2.5 pr-3">
                            <p
                              className={
                                row.status === "error"
                                  ? "text-destructive"
                                  : row.status === "finished"
                                    ? "text-foreground"
                                    : "text-muted-foreground"
                              }
                            >
                              {consiliumStatusLabel(row.status)}
                            </p>
                            {row.error ? (
                              <p className="mt-0.5 max-w-[14rem] text-xs text-muted-foreground">{row.error}</p>
                            ) : null}
                          </td>
                          <td className="py-2.5 pr-3 text-right tabular-nums">
                            <p className="font-medium">{formatTokens(row.totalTokens)}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {t.adminMetricsConsiliumPrompt} {formatTokens(row.promptTokens)}
                              {" · "}
                              {t.adminMetricsConsiliumCompletion} {formatTokens(row.completionTokens)}
                            </p>
                          </td>
                          <td className="py-2.5">
                            <p className="whitespace-nowrap">{row.model ?? "—"}</p>
                            {row.attemptCount > 1 ? (
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {t.adminMetricsPhotoAttempts(row.attemptCount)}
                              </p>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <TablePager page={photoPage.page} pageCount={photoPage.pageCount} onPage={photoPage.setPage} />
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-border/60 bg-card px-4 py-4">
              <div className="mb-3">
                <p className="text-sm font-medium">{t.adminMetricsTopDoctorsTitle}</p>
                <p className="text-xs text-muted-foreground">{t.adminMetricsTopDoctorsHint}</p>
              </div>
              {topDoctors.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  {t.adminMetricsTopDoctorsEmpty}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[20rem] text-left text-sm">
                    <thead>
                      <tr className="border-b border-border/60 text-xs text-muted-foreground">
                        <th className="pb-2 pr-3 font-medium">{t.adminMetricsDoctorCol}</th>
                        <th className="pb-2 pl-2 text-right font-medium tabular-nums">
                          {t.adminMetricsSessions7dCol}
                        </th>
                        <th className="pb-2 pl-2 text-right font-medium tabular-nums">
                          {t.adminMetricsSessions28dCol}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {topDoctors.map((doctor) => {
                        const showEmail =
                          !!doctor.email &&
                          doctor.displayName !== doctor.email &&
                          !doctor.displayName.includes(doctor.email);
                        return (
                          <tr
                            key={doctor.userId}
                            className="border-b border-border/40 last:border-0"
                          >
                            <td className="py-2.5 pr-3 align-top">
                              <Link
                                href={messengerProfilePath(doctor.userId, "/admin/metrics")}
                                className="font-medium leading-snug text-primary hover:underline"
                              >
                                {doctor.displayName}
                              </Link>
                              {showEmail ? (
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                  {doctor.email}
                                </p>
                              ) : null}
                            </td>
                            <td className="py-2.5 pl-2 text-right align-top tabular-nums font-medium">
                              {doctor.activeSessions7d}
                            </td>
                            <td className="py-2.5 pl-2 text-right align-top tabular-nums text-muted-foreground">
                              {doctor.activeSessions28d}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
