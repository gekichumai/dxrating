import { Button, Menu } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { FC } from "react";
import { ListActions } from "react-use/lib/useList";

import { PlayEntry } from "../RatingCalculatorAddEntryForm";

import { ImportFromAquaSQLiteListItem } from "./import/ImportFromAquaSQLiteListItem";
import { ImportFromJSONButtonListItem } from "./import/ImportFromJSONButtonListItem";
import { ImportFromNETRecordsListItem } from "./import/ImportFromNETRecordsListItem";

export const ImportMenu: FC<{
  modifyEntries: ListActions<PlayEntry>;
}> = ({ modifyEntries }) => {
  const [opened, { open, close }] = useDisclosure();

  return (
    <>
      <Menu opened={opened} onClose={close} width="24rem">
        <Menu.Target>
          <Button
            variant="light"
            onClick={() => {
              open();
            }}
          >
            Import...
          </Button>
        </Menu.Target>

        <Menu.Dropdown>
          <ImportFromNETRecordsListItem
            modifyEntries={modifyEntries}
            onClose={close}
          />

          <Menu.Divider />

          <ImportFromJSONButtonListItem
            modifyEntries={modifyEntries}
            onClose={close}
          />
          <ImportFromAquaSQLiteListItem
            modifyEntries={modifyEntries}
            onClose={close}
          />
        </Menu.Dropdown>
      </Menu>
    </>
  );
};
