"use client";

import type { ComponentProps } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { Panel } from "@/components/dashboard/ui";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { UsagePoint, UsageRange } from "@/lib/orchestrator/types";

export function UsageChart({
  metric = "connections",
  observabilityConfigured = true,
  range = "24h",
  title = "Connections · last 24h",
  usage,
}: {
  metric?: "connections" | "messages";
  observabilityConfigured?: boolean;
  range?: UsageRange;
  title?: string;
  usage: UsagePoint[];
}) {
  const chartData = buildUsageChartData(usage, metric, range);
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
            {observabilityConfigured
              ? "Waiting for Axiom telemetry"
              : "Connect Axiom to enable observability"}
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
                cursor={false}
                content={<UsageTooltipContent />}
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
  range: UsageRange,
) {
  const buckets = buildRangeBuckets(range, usage);

  usage.forEach((point) => {
    const pointTime = new Date(point.hour).getTime();
    if (Number.isNaN(pointTime)) return;

    const bucket = buckets.find(
      (candidate) => pointTime >= candidate.start && pointTime < candidate.end,
    );
    bucket?.points.push(point);
  });

  return buckets.map((bucket) => {
    const value = bucket.points.length
      ? aggregateBucketValue(bucket.points, metric)
      : 0;

    return {
      hasData: bucket.points.length > 0,
      label: formatBucketLabel(bucket.start, range),
      tooltipLabel: formatUsageTooltipRange(bucket.start, bucket.end, range),
      value,
    };
  });
}

function buildRangeBuckets(range: UsageRange, usage: UsagePoint[]) {
  const { bucketCount, bucketMs } = rangeBucketConfig(range);
  const latestUsageTime = Math.max(
    ...usage
      .map((point) => new Date(point.hour).getTime())
      .filter((time) => !Number.isNaN(time)),
  );
  const anchor = Number.isFinite(latestUsageTime)
    ? latestUsageTime
    : Date.now();
  const end = alignRangeEnd(anchor, range, bucketMs);
  const start = end - bucketCount * bucketMs;

  return Array.from({ length: bucketCount }, (_, index) => ({
    end: start + (index + 1) * bucketMs,
    points: [] as UsagePoint[],
    start: start + index * bucketMs,
  }));
}

function rangeBucketConfig(range: UsageRange) {
  switch (range) {
    case "1h":
      return { bucketCount: 60, bucketMs: 60 * 1000 };
    case "7d":
      return { bucketCount: 7, bucketMs: 24 * 60 * 60 * 1000 };
    case "30d":
      return { bucketCount: 30, bucketMs: 24 * 60 * 60 * 1000 };
    case "24h":
    default:
      return { bucketCount: 24, bucketMs: 60 * 60 * 1000 };
  }
}

function alignRangeEnd(anchor: number, range: UsageRange, bucketMs: number) {
  const date = new Date(anchor);

  if (range === "1h") {
    date.setUTCSeconds(0, 0);
    date.setUTCMinutes(date.getUTCMinutes() + 1);
    return date.getTime();
  }

  return Math.floor(anchor / bucketMs) * bucketMs + bucketMs;
}

function aggregateBucketValue(
  points: UsagePoint[],
  metric: "connections" | "messages",
) {
  const sum = points.reduce((total, point) => total + point[metric], 0);
  return sum;
}

function formatBucketLabel(time: number, range: UsageRange) {
  const date = new Date(time);

  if (range === "7d" || range === "30d") {
    return new Intl.DateTimeFormat("en", {
      day: "2-digit",
      month: "short",
      timeZone: "UTC",
    }).format(date);
  }

  return [
    String(date.getUTCHours()).padStart(2, "0"),
    String(date.getUTCMinutes()).padStart(2, "0"),
  ].join(":");
}

function formatUsageTooltipRange(start: number, end: number, range: UsageRange) {
  if (range === "7d" || range === "30d") {
    return formatUsageDay(start);
  }

  return `${formatUsageTooltip(start)} - ${formatUsageTooltip(end)}`;
}

function formatUsageDay(time: number) {
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(time));
}

function formatUsageTooltip(time: number) {
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(time));
}

function UsageTooltipContent(props: ComponentProps<typeof ChartTooltipContent>) {
  const hasData = props.payload?.[0]?.payload?.hasData;

  if (!hasData) {
    return null;
  }

  return (
    <ChartTooltipContent
      {...props}
      labelFormatter={(_, payload) =>
        payload?.[0]?.payload?.tooltipLabel ?? ""
      }
    />
  );
}
