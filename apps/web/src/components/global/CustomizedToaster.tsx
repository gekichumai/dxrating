import { FC } from "react";
import { Toaster } from "react-hot-toast";

export const CustomizedToaster: FC = () => {
  return (
    <Toaster
      toastOptions={{
        className: "font-bold pr-1 py-2 rounded-xl",
        error: {
          duration: 10e3,
        },
        success: {
          duration: 5e3,
        },
      }}
      containerStyle={{
        marginTop: "calc(env(safe-area-inset-top) + 1rem)",
      }}
    />
  );
};
