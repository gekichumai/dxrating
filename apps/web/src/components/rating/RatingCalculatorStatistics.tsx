import clsx from "clsx";
import * as d3 from "d3";
import { motion, useSpring } from "framer-motion";
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
  values: number[];
}> = ({ values }) => {
  const theme = useVersionTheme();
  const [containerRef, containerRect] = useMeasure<HTMLDivElement>();
  const id = useRef(makeId(12)).current;

  const draw = () => {
    // set the dimensions and margins of the graph
    const margin = { top: 20, right: 10, bottom: 20, left: 20 },
      width = containerRect.width - margin.left - margin.right,
      height = 300 - margin.top - margin.bottom;

    const avg = d3.mean(values) ?? 0;

    // append the svg object to the body of the page
    const svg = d3
      .select("#" + id)
      .append("svg")
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
      .append("g")
      .attr("transform", `translate(${margin.left}, ${margin.top})`);

    const min = d3.min(values) ?? 0;
    const max = d3.max(values) ?? 0;

    // X axis: scale and draw:
    const x = d3
      .scaleLinear()
      .domain([min, max + 1])
      .range([0, width]);
    svg
      .append("g")
      .attr("transform", `translate(0, ${height})`)
      .call(d3.axisBottom(x).ticks((max - min) / 3));

    // set the parameters for the histogram
    const histogram = d3
      .histogram()
      .value(function (d) {
        return d;
      }) // I need to give the vector of value
      .domain(x.domain() as [number, number]) // then the domain of the graphic
      .thresholds(x.ticks(max - min)); // then the numbers of bins

    // And apply this function to data to get the bins
    const bins = histogram(values) as d3.Bin<number, number>[];

    // Y axis: scale and draw:
    const y = d3.scaleLinear().range([height, 0]);
    y.domain([0, d3.max(bins, (d) => d.length) ?? 0]); // d3.hist has to be called before the Y axis obviously
    svg.append("g").call(d3.axisLeft(y));

    // append the bar rectangles to the svg element, and put label of values of each bar on top
    svg
      .selectAll("rect")
      .data(bins)
      .join("rect")
      .attr("x", 0.5)
      .attr("y", -1)
      .attr("transform", function (d) {
        return `translate(${x(d.x0 ?? 0)}, ${y(d.length) + 1.5})`;
      })
      .attr("width", function (d) {
        return Math.max(0, x(d.x1 ?? 0) - x(d.x0 ?? 0) - 1); // Ensure width is not negative
      })
      .attr("height", function (d) {
        return Math.max(0, height - y(d.length) - 1);
      })
      .style("fill", function (d) {
        if ((d.x0 ?? 0) < avg) {
          return "#3b82f6";
        } else {
          return theme.accentColor;
        }
      });

    // Adding labels on top of each bar
    svg
      .selectAll(".label")
      .data(bins)
      .join("text")
      .attr("class", "label")
      .attr("x", function (d) {
        return x(d.x0 ?? 0) + (x(d.x1 ?? 0) - x(d.x0 ?? 0)) / 2; // Center label within each bar
      })
      .attr("y", function (d) {
        return y(d.length) - 5; // Adjust the position to be a bit above the bar
      })
      .text(function (d) {
        if (d.length === 0) {
          return "";
        }
        return d.length; // The text is the count of elements in the bin
      })
      .attr("text-anchor", "middle") // Center the text horizontally
      .style("font-size", "12px")
      .style("fill", "black");

    // Append a vertical line to highlight the separation
    svg
      .append("line")
      .attr("x1", x(avg))
      .attr("x2", x(avg))
      .attr("y1", y(0))
      .attr("y2", y(1600))
      .attr("stroke", "grey")
      .attr("stroke-dasharray", "4");
    svg
      .append("text")
      .attr("x", x(avg))
      .attr("y", y(0))
      .text("avg: " + avg.toFixed(2))
      .style("font-size", "12px")
      .attr("transform", `rotate(-90, ${x(avg)}, ${y(0)}), translate(2, -1)`);
  };

  useEffect(() => {
    draw();

    return () => {
      d3.select("#" + id)
        .selectAll("*")
        .remove();
    };
  }, [id, containerRect, values]);

  return (
    <div className="flex flex-col gap-2" ref={containerRef}>
      <div className="text-lg font-semibold leading-none">Histogram</div>
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
        values={compact(
          [...b35Entries, ...b15Entries].map((i) => i.rating?.ratingAwardValue),
        )}
      />
    </div>
  );
});

export const RatingCalculatorStatistics: FC = () => {
  const [tab, setTab] = useState<"overview" | "details">("overview");
  const [containerRef, containerRect] = useMeasure<HTMLDivElement>();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [firstItemRef, firstItemRect] = useMeasure<HTMLDivElement>();
  const [lastItemRef, lastItemRect] = useMeasure<HTMLDivElement>();

  const height = useSpring(containerRect.height, {
    damping: 30,
    stiffness: 250,
  });

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
    height.set(
      (tab === "overview" ? firstItemRect.height : lastItemRect.height) + 10,
    );
  }, [tab, firstItemRect, lastItemRect]);

  return (
    <div className="w-full" ref={containerRef}>
      <motion.div
        ref={scrollContainerRef}
        className="flex items-start overflow-x-auto overflow-y-hidden w-full py-1 snap-x snap-mandatory"
        style={{
          width: containerRect.width,
          height,
          willChange: "height",
        }}
      >
        <RatingCalculatorStatisticsOverview
          ref={firstItemRef}
          className="shrink-0 snap-end"
          style={{ width: containerRect.width }}
        />
        <RatingCalculatorStatisticsDetails
          ref={lastItemRef}
          className="shrink-0 snap-end"
          style={{ width: containerRect.width }}
        />
      </motion.div>
    </div>
  );
};
