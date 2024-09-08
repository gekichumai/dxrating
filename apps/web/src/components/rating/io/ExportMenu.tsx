import { Button, Menu } from "@mantine/core";
import { FC } from "react";

import { ExportToJSONMenuItem } from "./export/ExportToJSONMenuItem";

export const ExportMenu: FC = () => {
  return (
    <Menu>
      <Menu.Target>
        <Button variant="light">Export...</Button>
      </Menu.Target>
      <Menu.Dropdown>
        <ExportToJSONMenuItem />
      </Menu.Dropdown>
    </Menu>
  );
};
