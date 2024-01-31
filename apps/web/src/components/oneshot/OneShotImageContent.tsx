import clsx from "clsx";
import { FC } from "react";
import { match } from "ts-pattern";
import { Entry } from "../../pages/RatingCalculator";
import { DIFFICULTIES } from "../SheetListItem";

export const OneShotImageContent: FC<{
  calculatedEntries: Entry[];
}> = ({ calculatedEntries }) => {
  return (
    <section
      tw="flex flex-col w-full h-full items-center justify-center bg-white p-8 font-sans gap-2"
      style={{
        fontFamily: "SourceHanSansJP, sans-serif",
        boxSizing: "border-box",
      }}
    >
      {/* <div tw="flex flex-col p-8 gap-2 w-full">
        <h1 tw="text-3xl font-bold text-center">Rating Calculator</h1>
        <h2 tw="text-center text-gray-500 text-xl">
          Calculate your rating from your chart history
        </h2>
      </div> */}

      {/* ((1500-96*2)-32*4)/5 */}
      <div tw="flex gap-4 flex-wrap">
        {calculatedEntries.map((entry, i) => (
          <div
            tw={clsx(
              "flex items-start justify-start p-2 bg-gray-100 rounded-lg w-[268px] h-[108px] overflow-hidden text-white shadow",
              (i + 1) % 5 !== 0 && "mr-[24px]",
              i >= 5 && "mt-[24px]",
            )}
            key={entry.sheet.id}
            style={{
              background: DIFFICULTIES[entry.sheet.difficulty].color,
            }}
          >
            <img
              tw="w-[92px] h-[92px] rounded-md flex-shrink-0 mr-4"
              src={
                "https://shama.dxrating.net/images/cover/v2/" +
                entry.sheet.imageName
              }
              width={32}
              height={32}
            />

            <div tw="flex flex-col items-start justify-between flex-shrink h-full w-full">
              {/* title should take at maximum two rows */}
              <h3
                tw={clsx(
                  "block self-start mt-0 pr-2",
                  match(entry.sheet.title.length)
                    .when(
                      (n) => n < 5,
                      () => "text-2xl leading-[1.25]",
                    )
                    .when(
                      (n) => n > 10,
                      () => "text-sm leading-[1.125]",
                    )
                    .when(
                      (n) => n > 20,
                      () => "text-xs leading-none",
                    )
                    .otherwise(() => "text-base leading-tight"),
                )}
                // style={{ textOverflow: "ellipsis" }}
              >
                {entry.sheet.title}
              </h3>

              <div tw="block flex justify-between items-center text-base font-bold leading-none w-full">
                <span>{entry.sheet.internalLevelValue.toFixed(1)}</span>
                <span tw="flex-1"></span>
                <span>{entry.achievementRate.toFixed(4)}%</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
