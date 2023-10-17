import imageBackground from "./assets/images/background.png";
import { SheetList } from "./components/SheetList";

export const App = () => {
  return (
    <div className="h-full w-full">
      <img
        src={imageBackground}
        className="fixed h-full w-full z-[-1] object-cover object-center opacity-30"
      />
      <div className="h-full w-full">
        <SheetList />
      </div>
    </div>
  );
};
