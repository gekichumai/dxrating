import { FC, ReactNode } from "react";

export const SheetFilterSection: FC<{
  title: ReactNode;
  children: ReactNode;
}> = ({ title, children }) => {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-lg font-semibold whitespace-nowrap flex items-center tracking-tight">
        {title}
      </h3>
      <div className="w-full flex flex-col md:flex-row gap-2">{children}</div>
    </div>
  );
};
