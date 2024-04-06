import clsx from "clsx";
import MdiBeta from "~icons/mdi/beta";

export const BetaBadge = ({ className }: { className?: string }) => (
  <div
    className={clsx(
      "bg-gray-200 rounded-full px-2 py-1 text-xs flex items-center gap-1 select-none leading-none",
      className,
    )}
  >
    <MdiBeta />
    <span>Beta</span>
  </div>
);
