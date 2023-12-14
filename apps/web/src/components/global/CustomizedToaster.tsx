import { FC } from "react";
import { Toaster } from "react-hot-toast";

export const CustomizedToaster: FC = () => {
  return (
    <Toaster
      toastOptions={{
        className: "!rounded-full font-bold pr-1 pb-2",
        duration: 5e3,
        error: {
          duration: 10e3,
        },
      }}
      containerStyle={{
        marginTop: "calc(env(safe-area-inset-top) + 1rem)",
      }}
    />
  );
};
