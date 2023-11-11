import { FC } from "react";
import { Entry } from "../pages/RatingCalculator";

export const OneShotImageContent: FC<{
  calculatedEntries: Entry[];
}> = () => {
  return (
    <div tw="flex flex-col w-full h-full items-center justify-center bg-white">
      <div tw="bg-gray-50 flex w-full h-full">
        <div tw="flex flex-col md:flex-row w-full py-12 px-4 md:items-center justify-between p-8">
          <h2 tw="flex flex-col text-3xl sm:text-4xl font-bold tracking-tight text-gray-900 text-left">
            <span>Ready to dive in?</span>
            <span tw="text-indigo-600">Start your free trial today.</span>
          </h2>
          <div tw="mt-8 flex md:mt-0">
            <div tw="flex rounded-md shadow">
              <a tw="flex items-center justify-center rounded-md border border-transparent bg-indigo-100 px-5 py-3 text-base font-medium text-white">
                Get started
              </a>
            </div>
            <div tw="ml-3 flex rounded-md shadow">
              <a tw="flex items-center justify-center rounded-md border border-transparent bg-white px-5 py-3 text-base font-medium text-indigo-600">
                Learn more
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
