"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { Panel } from "@/components/dashboard/ui";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { UsagePoint } from "@/lib/orchestrator/types";

export function UsageChart({
  metric = "connections",
  title = "Connections · last 24h",
  usage,
}: {
  metric?: "connections" | "messages";
  title?: string;
  usage: UsagePoint[];
}) {
  const chartData = buildUsageChartData(usage, metric);
  const chartConfig = {
    value: {
      label: metric === "connections" ? "Connections" : "Messages",
      color: "var(--primary)",
    },
  } satisfies ChartConfig;

  return (
    <Panel>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-xs text-muted-foreground">{metric}</span>
      </div>
      <div className="mt-5 h-56">
        {chartData.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-md border bg-muted/40 text-sm text-muted-foreground">
            Waiting for gateway usage reports
          </div>
        ) : (
          <ChartContainer
            className="h-full w-full"
            config={chartConfig}
            initialDimension={{ width: 640, height: 224 }}
          >
            <BarChart
              accessibilityLayer
              data={chartData}
              margin={{ left: 0, right: 0, top: 10 }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                axisLine={false}
                dataKey="label"
                interval="preserveStartEnd"
                minTickGap={20}
                tickLine={false}
                tickMargin={8}
              />
              <YAxis
                axisLine={false}
                tickFormatter={(value) => Number(value).toLocaleString()}
                tickLine={false}
                tickMargin={8}
                width={48}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(_, payload) =>
                      payload?.[0]?.payload?.tooltipLabel ?? ""
                    }
                  />
                }
              />
              <Bar
                dataKey="value"
                fill="var(--color-value)"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ChartContainer>
        )}
      </div>
    </Panel>
  );
}

function buildUsageChartData(
  usage: UsagePoint[],
  metric: "connections" | "messages",
) {
  const maxBars = usage.length > 240 ? 60 : usage.length > 72 ? 48 : 36;
  const bucketSize = Math.max(1, Math.ceil(usage.length / maxBars));
  const buckets: UsagePoint[][] = [];

  usage.forEach((point, index) => {
    const bucketIndex = Math.floor(index / bucketSize);
    buckets[bucketIndex] = buckets[bucketIndex] ?? [];
    buckets[bucketIndex].push(point);
  });

  return buckets.map((bucket) => {
    const first = bucket[0];
    const last = bucket[bucket.length - 1];
    const value = Math.round(
      bucket.reduce((sum, point) => sum + point[metric], 0) / bucket.length,
    );

    return {
      label: formatUsageHour(first.hour),
      tooltipLabel:
        first.hour === last.hour
          ? formatUsageTooltip(first.hour)
          : `${formatUsageTooltip(first.hour)} - ${formatUsageTooltip(last.hour)}`,
      value,
    };
  });
}

function formatUsageHour(hour: string) {
  const date = new Date(hour);
  if (Number.isNaN(date.getTime())) return hour;

  return `${String(date.getUTCHours()).padStart(2, "0")}:00`;
}

function formatUsageTooltip(hour: string) {
  const date = new Date(hour);
  if (Number.isNaN(date.getTime())) return hour;

  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  }).format(date);
}
