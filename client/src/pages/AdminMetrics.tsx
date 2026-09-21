import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { t } from "@/lib/i18n";

type PlatformMetricsWeeklyPoint = {
  weekStart: string;
  activeDoctorPatientPairs: number;
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
};

const chartConfig = {
  activeDoctorPatientPairs: {
    label: t.adminMetricsNorthStarHint,
    color: "hsl(var(--primary))",
  },
} satisfies ChartConfig;

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
          <div className="mx-auto max-w-2xl space-y-6">
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
          </div>
        )}
      </div>
    </div>
  );
}
