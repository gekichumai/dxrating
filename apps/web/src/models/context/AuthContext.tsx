import { Session } from "@supabase/supabase-js";
import {
  FC,
  PropsWithChildren,
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { useFirstMountState } from "react-use";
import useSWR from "swr";

import { supabase } from "../supabase";

export interface Profile {
  display_name: string;
}

export interface DivingFishProfile {
  diving_fish_name: string;
  diving_fish_qq: string;
}

const getDivingFishProfileFromLocal = (userid:string|undefined) => {
  const divingFishProfileNameKey = `${userid}::diving_fish_name`;
  const divingFishProfileQQKey = `${userid}::diving_fish_qq`;
  // 创建一个DivingFishProfile变量并返回
  const divingFishProfile: DivingFishProfile = {
    diving_fish_name: localStorage.getItem(divingFishProfileNameKey)?? "",
    diving_fish_qq: localStorage.getItem(divingFishProfileQQKey)?? "",
  }
  return divingFishProfile;
}

interface AuthContext {
  session: Session | null;
  profile: Profile | null;
  divingFishProfile: DivingFishProfile | null;
  pending: boolean;
}

const AuthContext_ = createContext({
  session: null,
  profile: null,
  divingFishProfile : null,
  pending: true,
} as AuthContext);

export const AuthContextProvider: FC<PropsWithChildren<object>> = ({
  children,
}) => {
  const { t } = useTranslation(["auth"]);
  const [session, setSession] = useState<Session | null>(null);
  const [divingFishProfile, setDivingFishProfile] = useState<DivingFishProfile | null>(null);
  const [sessionPending, setSessionPending] = useState(true);
  const firstMount = useFirstMountState();
  const signedIn = !!session?.user.id;
  const { data: profile, isLoading: profilePending } = useSWR(
    session ? "supabase::profile::" + session?.user.id : false,
    async () => {
      const res = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", signedIn ? session?.user.id : "")
        .maybeSingle();
      return res.data;
    },
    {
      focusThrottleInterval: 1000 * 60 * 60,
    },
  );

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        setSession(session);
        setDivingFishProfile(getDivingFishProfileFromLocal(session?.user.id));
      })
      .finally(() => {
        setSessionPending(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setSessionPending(false);
    });

    return () => subscription.unsubscribe();
  }, [t]);

  useEffect(() => {
    console.debug("[Auth] session changed to", session);

    if (signedIn && !firstMount) {
      toast.success(t("auth:login.toast-success"), {
        id: "login-success",
      });
    }
  }, [signedIn]);

  return (
    <AuthContext_.Provider
      value={{
        session,
        pending: sessionPending || profilePending,
        divingFishProfile,
        profile: profile ?? null,
      }}
    >
      {children}
    </AuthContext_.Provider>
  );
};

export const useAuth = () => {
  return useContext(AuthContext_);
};
