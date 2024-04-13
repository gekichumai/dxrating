import clsx from "clsx";
import * as d3 from "d3";
import { motion } from "framer-motion";
import compact from "lodash-es/compact";
import {
  FC,
  HTMLAttributes,
  Ref,
  forwardRef,
  useEffect,
  useRef,
  useState,
} from "react";
import { useMeasure } from "react-use";
import IconMdiGestureSwipeLeft from "~icons/mdi/gesture-swipe-left";
import { deriveColor } from "../../utils/color";
import { makeId } from "../../utils/random";
import { useVersionTheme } from "../../utils/useVersionTheme";
import { useRatingEntries } from "./useRatingEntries";

const RatingCalculatorStatisticsFactItem: FC<{
  size: "lg" | "md";
  label: string;
  value: number | string;
  className?: string;
}> = ({ size, label, value, className }) => (
  <div className={clsx("flex flex-col items-start gap-2", className)}>
    <div
      className={clsx(
        "font-mono tabular-nums !leading-none -mt-1.5 tracking-tight",
        {
          "text-4xl": size === "lg",
          "text-3xl": size === "md",
        },
      )}
    >
      {value}
    </div>
    <div className="text-sm font-semibold leading-none text-gray-600 -mt-1">
      {label}
    </div>
  </div>
);

const formatNumber = (value: number) => {
  if (Number.isFinite(value)) {
    return value.toFixed(0);
  }
  return "—";
};

interface RatingCalculatorStatisticsOverviewProps {
  className?: string;
  style?: React.CSSProperties;
  ref?: Ref<HTMLDivElement>;
}

const RatingCalculatorStatisticsOverview: FC<RatingCalculatorStatisticsOverviewProps> =
  forwardRef<HTMLDivElement, RatingCalculatorStatisticsOverviewProps>(
    ({ className, style }, ref) => {
      const { b35Entries, b15Entries, statistics } = useRatingEntries();
      const {
        b15Average,
        b35Average,
        b15Min,
        b35Min,
        b15Max,
        b35Max,
        b15Sum,
        b35Sum,
        b50Sum,
      } = statistics;

      return (
        <div
          ref={ref}
          className={clsx(
            "flex flex-col justify-center gap-4 text-black py-2 w-full",
            className,
          )}
          style={style}
        >
          <RatingCalculatorStatisticsFactItem
            size="lg"
            label="Total"
            value={b50Sum}
          />

          <div className="flex flex-col items-start gap-2">
            <div className="flex items-baseline gap-1 leading-none">
              <span className="text-lg font-semibold">Best 15</span>
              <span className="text-sm text-gray-500">
                (Entries {b15Entries.length}/15)
              </span>
            </div>

            <div className="flex items-center w-full">
              <RatingCalculatorStatisticsFactItem
                size="md"
                label="Subtotal"
                value={formatNumber(b15Sum)}
                className="w-24"
              />

              <div className="h-12 w-px shrink-0 bg-gray-300 ml-2 mr-4" />

              <RatingCalculatorStatisticsFactItem
                size="md"
                label="Min"
                value={formatNumber(b15Min)}
                className="w-16"
              />
              <RatingCalculatorStatisticsFactItem
                size="md"
                label="Avg"
                value={formatNumber(b15Average)}
                className="w-16"
              />
              <RatingCalculatorStatisticsFactItem
                size="md"
                label="Max"
                value={formatNumber(b15Max)}
                className="w-16"
              />
            </div>
          </div>

          <div className="flex flex-col items-start gap-2">
            <div className="flex items-baseline gap-1 leading-none">
              <span className="text-lg font-semibold">Best 35</span>
              <span className="text-sm text-gray-500">
                (Entries {b35Entries.length}/35)
              </span>
            </div>

            <div className="flex items-center w-full">
              <RatingCalculatorStatisticsFactItem
                size="md"
                label="Subtotal"
                value={b35Sum}
                className="w-24"
              />

              <div className="h-12 w-px shrink-0 bg-gray-300 ml-2 mr-4" />

              <RatingCalculatorStatisticsFactItem
                size="md"
                label="Min"
                value={formatNumber(b35Min)}
                className="w-16"
              />
              <RatingCalculatorStatisticsFactItem
                size="md"
                label="Avg"
                value={formatNumber(b35Average)}
                className="w-16"
              />
              <RatingCalculatorStatisticsFactItem
                size="md"
                label="Max"
                value={formatNumber(b35Max)}
                className="w-16"
              />
            </div>
          </div>
        </div>
      );
    },
  );

const Histogram: FC<{
  b15Values: number[];
  b35Values: number[];
}> = ({ b15Values, b35Values }) => {
  const theme = useVersionTheme();
  const [containerRef, containerRect] = useMeasure<HTMLDivElement>();
  const id = useRef(makeId(12)).current;

  const draw = () => {
    // set the dimensions and margins of the graph
    const margin = { top: 20, right: 10, bottom: 20, left: 25 },
      width = containerRect.width - margin.left - margin.right,
      height = 300 - margin.top - margin.bottom;

    const b15Avg = d3.mean(b15Values) ?? 0;
    const b35Avg = d3.mean(b35Values) ?? 0;

    const ticksIntervalRatio = width > 500 ? 1 : 2;

    // append the svg object to the body of the page
    const svg = d3
      .select("#" + id)
      .append("svg")
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
      .append("g")
      .attr("transform", `translate(${margin.left}, ${margin.top})`);

    const min = Math.min(d3.min(b15Values) ?? 0, d3.min(b35Values) ?? 0) ?? 0;
    const max = Math.max(d3.max(b15Values) ?? 0, d3.max(b35Values) ?? 0) ?? 0;

    // snap xDomain to the interval of ticks, calculated from the min, max and ticksIntervalRatio values
    const xDomain = [
      (Math.floor(min / ticksIntervalRatio) - 1) * ticksIntervalRatio,
      (Math.ceil(max / ticksIntervalRatio) + 1) * ticksIntervalRatio,
    ];

    // X axis: scale and draw:
    const x = d3.scaleLinear().domain(xDomain).range([0, width]);
    svg
      .append("g")
      .attr("transform", `translate(0, ${height})`)
      .call(d3.axisBottom(x).ticks((max - min) / ticksIntervalRatio));

    // Create the histogram bins for both datasets
    const histogram = d3
      .histogram()
      .domain(x.domain() as [number, number])
      .thresholds(x.ticks((max - min) / ticksIntervalRatio));

    const bins1 = histogram(b15Values);
    const bins2 = histogram(b35Values);

    // Prepare bins for stacking
    const bins = bins1.map((bin, i) => ({
      x0: bin?.x0 ?? 0,
      x1: bin?.x1 ?? 0,
      y1: bin?.length ?? 0, // Count for b15Values
      y2: (bin?.length ?? 0) + (bins2[i]?.length ?? 0), // Stack count of b35Values on top of b15Values
    }));

    // Y axis: scale and draw:
    const y = d3
      .scaleLinear()
      .range([height, 0])
      .domain([0, d3.max(bins, (d) => d.y2) ?? 0]); // Use the max of y2 to include stacked height
    svg.append("g").call(
      d3.axisLeft(y).tickFormat((d) => {
        if (typeof d !== "number") return "";
        if (d % 1 == 0) {
          return (d as number).toFixed(0);
        } else {
          return "";
        }
      }),
    );

    // Draw bars for b15Values
    svg
      .selectAll(".bar1")
      .data(bins)
      .join("rect")
      .attr("class", "bar1")
      .attr(
        "x",
        (d) => x(d.x0 ?? 0) - Math.max(0, x(d.x1 ?? 0) - x(d.x0 ?? 0) - 1) / 2,
      )
      .attr("y", (d) => y(d.y1))
      .attr("width", (d) => Math.max(0, x(d.x1 ?? 0) - x(d.x0 ?? 0) - 1))
      .attr("height", (d) => Math.max(0, height - y(d.y1)))
      .style("fill", "#3b82f6");

    // Draw bars for b35Values stacked on top of b15Values
    svg
      .selectAll(".bar2")
      .data(bins)
      .join("rect")
      .attr("class", "bar2")
      .attr(
        "x",
        (d) => x(d.x0 ?? 0) - Math.max(0, x(d.x1 ?? 0) - x(d.x0 ?? 0) - 1) / 2,
      )
      .attr("y", (d) => y(d.y2))
      .attr("width", (d) => Math.max(0, x(d.x1 ?? 0) - x(d.x0 ?? 0) - 1))
      .attr("height", (d) => Math.max(0, y(d.y1) - y(d.y2)))
      .style("fill", theme.accentColor);

    // Add labels on the top center of the bars
    svg
      .selectAll(".label")
      .data(bins)
      .join("text")
      .attr("class", "label")
      .attr(
        "x",
        (d) =>
          x((d.x1 + d.x0) / 2) -
          Math.max(0, x(d.x1 ?? 0) - x(d.x0 ?? 0) - 1) / 2,
      )
      .attr("y", (d) => y(d.y2) - 5)
      .text((d) => (d.y2 === 0 ? "" : d.y2))
      .style("text-anchor", "middle")
      .style("font-size", "12px");

    // Append a vertical line to highlight the average
    const drawAverageLine = (avg: number, text: string, color: string) => {
      svg
        .append("line")
        .attr("x1", x(avg))
        .attr("x2", x(avg))
        .attr("y1", y(0) + 6)
        .attr("y2", -10000)
        .attr("stroke", color)
        .attr("stroke-dasharray", "2");
      svg
        .append("text")
        .attr("x", x(avg))
        .attr("y", y(0))
        .text(text)
        .style("font-size", "12px")
        .attr("transform", `rotate(-90, ${x(avg)}, ${y(0)}), translate(2, -2)`);
    };

    drawAverageLine(
      b15Avg,
      `B15 AVG: ${b15Avg.toFixed(2)}`,
      deriveColor("#3b82f6", "overlay"),
    );
    drawAverageLine(
      b35Avg,
      `B35 AVG: ${b35Avg.toFixed(2)}`,
      deriveColor(theme.accentColor, "overlay"),
    );
  };

  useEffect(() => {
    draw();

    return () => {
      d3.select("#" + id)
        .selectAll("*")
        .remove();
    };
  }, [id, containerRect, b15Values, b35Values]);

  return (
    <div className="flex flex-col gap-2" ref={containerRef}>
      <div className="relative w-full select-none" id={id} />
    </div>
  );
};

const RatingCalculatorStatisticsDetails = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...rest }, ref) => {
  const { b35Entries, b15Entries } = useRatingEntries();

  return (
    <div
      ref={ref}
      className={clsx(
        "flex flex-col justify-center gap-4 text-black w-full",
        className,
      )}
      {...rest}
    >
      <Histogram
        b35Values={compact(b35Entries.map((i) => i.rating?.ratingAwardValue))}
        b15Values={compact(b15Entries.map((i) => i.rating?.ratingAwardValue))}
      />
      <span className="text-gray-500 text-xs text-center select-none">
        Histogram buckets are visualized in shape of (min, max] to better
        represent the data distribution.
      </span>
    </div>
  );
});

export const RatingCalculatorStatistics: FC = () => {
  const firstHeightSet = useRef(false);
  const [tab, setTab] = useState<"overview" | "details">("overview");
  const [containerRef, containerRect] = useMeasure<HTMLDivElement>();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [firstItemRef, firstItemRect] = useMeasure<HTMLDivElement>();
  const [lastItemRef, lastItemRect] = useMeasure<HTMLDivElement>();

  const [containerRectHeight, setContainerRectHeight] = useState(
    containerRect.height,
  );

  useEffect(() => {
    const listener = () => {
      const scrollX = scrollContainerRef.current?.scrollLeft ?? 0;
      const scrollPercentage = scrollX / containerRect.width;

      if (scrollPercentage < 0.01) {
        setTab("overview");
        scrollContainerRef.current?.scrollTo({
          left: 0,
          behavior: "instant",
        });
      } else if (scrollPercentage > 0.99) {
        setTab("details");
        scrollContainerRef.current?.scrollTo({
          left: containerRect.width,
          behavior: "instant",
        });
      }
    };
    scrollContainerRef.current?.addEventListener("scroll", listener);
    const scrollContainer = scrollContainerRef.current;

    return () => {
      scrollContainer?.removeEventListener("scroll", listener);
    };
  }, [containerRect, firstItemRect, lastItemRect]);

  useEffect(() => {
    if (!firstHeightSet.current) {
      setContainerRectHeight(firstItemRect.height + 10);
      firstHeightSet.current = true;
    } else {
      setContainerRectHeight(
        (tab === "overview" ? firstItemRect.height : lastItemRect.height) + 10,
      );
    }
  }, [tab, firstItemRect, lastItemRect]);

  return (
    <div className="w-full" ref={containerRef}>
      <motion.div
        ref={scrollContainerRef}
        className={clsx(
          "flex items-start overflow-x-auto overflow-y-hidden w-full py-1 will-change-height transition-height duration-300 relative",
          containerRect.width && "snap-x snap-mandatory",
        )}
        style={{
          width: containerRect.width,
          height: containerRectHeight,
        }}
      >
        <div className="flex gap-1 items-center absolute top-2 right-0 rounded-full bg-blue-100 text-gray-500 px-2 py-1 font-bold select-none">
          <IconMdiGestureSwipeLeft className="w-3 h-3" />
          <div className="leading-none text-xs">Histogram Available</div>
        </div>
        <RatingCalculatorStatisticsOverview
          ref={firstItemRef}
          className="shrink-0 snap-end overflow-hidden"
          style={{ width: containerRect.width }}
        />
        <RatingCalculatorStatisticsDetails
          ref={lastItemRef}
          className="shrink-0 snap-end overflow-hidden"
          style={{ width: containerRect.width }}
        />
      </motion.div>
    </div>
  );
};
