import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { RoundGoals, StandingsRow } from "@livescore/types";
import { useChartTheme } from "@/hooks/useChartTheme";
import { useMediaQuery } from "@/hooks/useMediaQuery";

/**
 * All three charts are single-series, so colour carries no identity — it is
 * just ink. One validated hue does the whole job; many hues would encode
 * nothing and fail colourblind separation. Values come from CSS custom
 * properties so light and dark share one source of truth.
 */

function useTooltipStyle() {
  const t = useChartTheme();
  return {
    background: t.surface,
    border: `1px solid ${t.border}`,
    borderRadius: 8,
    fontSize: 12,
    // Text wears text tokens, never the series colour.
    color: t.text,
  };
}

/** Every chart needs a text alternative; SVG alone is opaque to AT. */
function describe(pairs: { label: string; value: number }[], unit: string) {
  return pairs.map((p) => `${p.label}: ${p.value} ${unit}`).join(", ");
}

export function PointsChart({ rows }: { rows: StandingsRow[] }) {
  const t = useChartTheme();
  const tooltip = useTooltipStyle();
  const wide = useMediaQuery("(min-width: 640px)");
  const data = rows.map((r) => ({
    name: r.team.shortName ?? r.team.name,
    points: r.points,
  }));

  return (
    <div
      role="img"
      aria-label={`Points per team. ${describe(
        data.map((d) => ({ label: d.name, value: d.points })),
        "points",
      )}`}
    >
      <ResponsiveContainer width="100%" height={Math.max(220, data.length * 26)}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ left: 4, right: 16 }}
          barCategoryGap={2}
        >
          <CartesianGrid horizontal={false} stroke={t.grid} />
          <XAxis
            type="number"
            stroke={t.ink}
            fontSize={11}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            /* 110px of a 343px phone was a third of the plot area. */
            width={wide ? 120 : 74}
            stroke={t.ink}
            fontSize={11}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip contentStyle={tooltip} cursor={{ fill: t.grid }} />
          {/* Rounded only at the data end; the baseline end stays square. */}
          <Bar
            dataKey="points"
            fill={t.data}
            radius={[0, 4, 4, 0]}
            maxBarSize={18}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Goals per matchday, from scores — the reliable series. */
export function GoalsPerRoundChart({ perRound }: { perRound: RoundGoals[] }) {
  const t = useChartTheme();
  const tooltip = useTooltipStyle();
  const data = perRound.map((r) => ({ label: `R${r.round}`, goals: r.goals }));

  return (
    <div
      role="img"
      aria-label={`Goals per matchday. ${describe(
        data.map((d) => ({ label: d.label, value: d.goals })),
        "goals",
      )}`}
    >
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ left: 0, right: 8 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} stroke={t.grid} />
          <XAxis
            dataKey="label"
            stroke={t.ink}
            fontSize={11}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            stroke={t.ink}
            fontSize={11}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            width={32}
          />
          <Tooltip contentStyle={tooltip} cursor={{ fill: t.grid }} />
          <Bar
            dataKey="goals"
            fill={t.data}
            radius={[4, 4, 0, 0]}
            maxBarSize={56}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

