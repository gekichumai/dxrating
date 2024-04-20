import {
  CircularProgress,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
} from "@mui/material";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa, ViewType } from "@supabase/auth-ui-shared";
import { Session, User } from "@supabase/supabase-js";
import { FC, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { useAsync, useSearchParam } from "react-use";

import { supabase } from "../../../models/supabase";
import { useVersionTheme } from "../../../utils/useVersionTheme";
import { Logo } from "../Logo";
import { ResponsiveDialog } from "../ResponsiveDialog";

import MdiAccountKey from "~icons/mdi/account-key";
import MdiLogin from "~icons/mdi/login";
import MdiLogout from "~icons/mdi/logout";

const ThemedAuth: FC<{
  view?: ViewType;
}> = ({ view = "sign_in" }) => {
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
      view={view}
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
        <div className="text-xs text-slate-500 tracking-tighter">
          #<span className="font-mono">{user.id}</span>
        </div>
      </div>
    </div>
  );
};

const ProfileImage: FC<{
  email?: string;
  size?: string;
}> = ({ email, size = "2rem" }) => {
  const gravatarEmailHash = useAsync(async () => {
    const e = email?.trim().toLowerCase();
    if (!e) return "";
    return await sha256(e);
  }, [email]);

  return gravatarEmailHash.loading ? (
    <div
      className="shrink-0 rounded-full bg-gray-4 shadow"
      style={{ width: size, height: size }}
    />
  ) : (
    <img
      src={`https://gravatar.com/avatar/${gravatarEmailHash.value}?s=48&d=identicon`}
      srcSet={`https://gravatar.com/avatar/${gravatarEmailHash.value}?s=96&d=identicon 2x`}
      alt="Gravatar"
      className="shrink-0 rounded-full bg-gray-4 shadow"
      style={{
        width: size,
        height: size,
      }}
    />
  );
};

export const UpdatePasswordMenuItem: FC = () => {
  const { t } = useTranslation(["auth"]);
  const [open, setOpen] = useState(false);
  return (
    <>
      <ResponsiveDialog open={open} setOpen={(opened) => setOpen(opened)}>
        {() => <ThemedAuth view="update_password" />}
      </ResponsiveDialog>

      <MenuItem
        onClick={() => {
          setOpen(true);
        }}
      >
        <ListItemIcon>
          <MdiAccountKey />
        </ListItemIcon>
        <ListItemText>{t("auth:update-password.label")}</ListItemText>
      </MenuItem>
    </>
  );
};

export const UserChip: FC = () => {
  const DISABLE_EXPLICIT_AUTH = useSearchParam("enableAuth") !== "true";

  const [pending, setPending] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const { t } = useTranslation(["auth"]);
  const [open, setOpen] = useState<"auth" | "profile" | null>(null);
  const [profileMenuAnchorEl, setProfileMenuAnchorEl] =
    useState<HTMLElement | null>(null);

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
      if (session) {
        setOpen(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [t]);

  useEffect(() => {
    console.debug("[Auth] session changed to", session);

    if (session) {
      toast.success(t("auth:login.toast-success"), {
        id: "login-success",
      });
    }
  }, [session]);

  const logout = async () => {
    setPending(true);
    await supabase.auth.signOut();
    toast.success(t("auth:logout.toast-success"), {
      id: "logout-success",
    });
  };

  return (
    <>
      <ResponsiveDialog
        open={open === "auth"}
        setOpen={(opened) => setOpen(opened ? "auth" : null)}
      >
        {() => (
          <>
            <div className="flex flex-col items-start justify-center gap-1">
              <Logo />
              <span className="text-sm text-zinc-5">Authentication</span>
              <div className="h-px w-full bg-gray-2 mb-1.5 mt-4" />
            </div>
            <ThemedAuth />
          </>
        )}
      </ResponsiveDialog>

      <Menu
        anchorEl={profileMenuAnchorEl}
        open={Boolean(profileMenuAnchorEl)}
        onClose={() => {
          setOpen(null);
          setProfileMenuAnchorEl(null);
        }}
      >
        {session && <Profile user={session.user} />}
        <UpdatePasswordMenuItem />
        <MenuItem
          onClick={() => {
            logout();
            setOpen(null);
            setProfileMenuAnchorEl(null);
          }}
          color="error"
        >
          <ListItemIcon>
            <MdiLogout />
          </ListItemIcon>
          <ListItemText>{t("auth:logout.label")}</ListItemText>
        </MenuItem>
      </Menu>

      {!DISABLE_EXPLICIT_AUTH && pending ? (
        <div className="p-2 text-[1.5rem]">
          <div className="h-[1.2em] w-[1.2em] px-[0.1em] -mt-[0.1em] text-black/54">
            <CircularProgress disableShrink size="1em" color="inherit" />
          </div>
        </div>
      ) : (
        (!DISABLE_EXPLICIT_AUTH || session) && (
          <IconButton
            onClick={(e) => {
              setOpen(session ? "profile" : "auth");
              if (session) {
                setProfileMenuAnchorEl(e.currentTarget);
              }
            }}
          >
            {session ? (
              <ProfileImage email={session.user.email} size="1.2em" />
            ) : (
              <MdiLogin />
            )}
          </IconButton>
        )
      )}
    </>
  );
};
