import {
  CircularProgress,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
} from "@mui/material";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import { Session, User } from "@supabase/supabase-js";
import { FC, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAsync } from "react-use";
import MdiLogin from "~icons/mdi/login";
import MdiLogout from "~icons/mdi/logout";
import { supabase } from "../../models/supabase";
import { useVersionTheme } from "../../utils/useVersionTheme";
import { ResponsiveDialog } from "../global/ResponsiveDialog";

const ThemedAuth = () => {
  const { t } = useTranslation(["auth"]);
  const theme = useVersionTheme();
  return (
    <Auth
      supabaseClient={supabase}
      appearance={{
        theme: ThemeSupa,
        variables: {
          default: {
            fontSizes: {
              baseBodySize: "16px",
              baseButtonSize: "16px",
              baseInputSize: "16px",
            },
            fonts: {
              bodyFontFamily:
                "Torus, system-ui, Avenir, Helvetica, Arial, sans-serif",
              buttonFontFamily:
                "Torus, system-ui, Avenir, Helvetica, Arial, sans-serif",
              inputFontFamily:
                "Torus, system-ui, Avenir, Helvetica, Arial, sans-serif",
              labelFontFamily:
                "Torus, system-ui, Avenir, Helvetica, Arial, sans-serif",
            },
            radii: {
              borderRadiusButton: "12px",
              buttonBorderRadius: "12px",
              inputBorderRadius: "12px",
            },
            colors: {
              brand: theme.accentColor + "99",
              brandAccent: theme.accentColor,
              brandButtonText: "black",
            },
            borderWidths: {
              inputBorderWidth: "2px",
            },
          },
        },
      }}
      providers={["github"]}
      magicLink
      localization={{
        variables: {},
      }}
    />
  );
};

async function sha256(message: string) {
  // encode as UTF-8
  const msgBuffer = new TextEncoder().encode(message);

  // hash the message
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);

  // convert ArrayBuffer to Array
  const hashArray = Array.from(new Uint8Array(hashBuffer));

  // convert bytes to hex string
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hashHex;
}

const Profile: FC<{
  user: User;
}> = ({ user }) => {
  return (
    <div className="flex items-center gap-4 px-4">
      <ProfileImage email={user.email} />
      <div className="flex flex-col gap-1 mb-2 mt-1">
        <div className="text-lg font-bold">{user.email}</div>
        <div className="text-xs text-slate-500">
          #<span className="font-mono">{user.id}</span>
        </div>
      </div>
    </div>
  );
};

const ProfileImage: FC<{
  email?: string;
  size?: string;
}> = ({ email, size = "1.5rem" }) => {
  const gravatarEmailHash = useAsync(async () => {
    const e = email?.trim().toLowerCase();
    if (!e) return "";
    return await sha256(e);
  }, [email]);

  return gravatarEmailHash.loading ? (
    <div
      className="shrink-0 rounded-full bg-gray-4"
      style={{ width: size, height: size }}
    />
  ) : (
    <img
      src={`https://gravatar.com/avatar/${gravatarEmailHash.value}?s=48&d=identicon`}
      srcSet={`https://gravatar.com/avatar/${gravatarEmailHash.value}?s=96&d=identicon 2x`}
      alt="Gravatar"
      className="shrink-0 rounded-full bg-gray-4"
      style={{
        width: size,
        height: size,
      }}
    />
  );
};

export const UserChip: FC = () => {
  const [pending, setPending] = useState(true);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        setSession(session);
      })
      .finally(() => {
        setPending(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setPending(false);
    });

    return () => subscription.unsubscribe();
  }, [setSession]);

  useEffect(() => {
    console.debug("Session changed to", session);
  }, [session]);

  const logout = async () => {
    setPending(true);
    await supabase.auth.signOut();
  };
  const { t } = useTranslation(["auth"]);

  const [open, setOpen] = useState<"auth" | "profile" | null>(null);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  return (
    <>
      <ResponsiveDialog
        open={open === "auth"}
        setOpen={(opened) => setOpen(opened ? "auth" : null)}
      >
        {() => <>{!session && <ThemedAuth />}</>}
      </ResponsiveDialog>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => {
          setOpen(null);
          setAnchorEl(null);
        }}
      >
        {session && <Profile user={session.user} />}
        <MenuItem
          onClick={() => {
            logout();
            setOpen(null);
            setAnchorEl(null);
          }}
          color="error"
        >
          <ListItemIcon>
            <MdiLogout />
          </ListItemIcon>
          <ListItemText>{t("auth:logout")}</ListItemText>
        </MenuItem>
      </Menu>

      {pending ? (
        <div className="p-2 text-[1.5rem]">
          <div className="h-[1.2em] w-[1.2em] px-[0.1em] -mt-[0.1em] text-black/54">
            <CircularProgress disableShrink size="1em" color="inherit" />
          </div>
        </div>
      ) : (
        <IconButton
          onClick={(e) => {
            setOpen(session ? "profile" : "auth");
            if (session) {
              setAnchorEl(e.currentTarget);
            }
          }}
        >
          {session ? (
            <ProfileImage email={session.user.email} size="1.2em" />
          ) : (
            <MdiLogin />
          )}
        </IconButton>
      )}
    </>
  );
};
