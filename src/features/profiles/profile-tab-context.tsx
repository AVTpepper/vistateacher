"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ProfileTab = "about" | "resources" | "posts";

interface ProfileTabContextValue {
  activeTab: ProfileTab;
  selectTab: (tab: ProfileTab) => void;
}

const ProfileTabContext = createContext<ProfileTabContextValue | null>(null);

function tabFromLocation(): ProfileTab {
  const tab = new URLSearchParams(window.location.search).get("tab");
  return tab === "resources" || tab === "posts" ? tab : "about";
}

export function ProfileTabProvider({
  initialTab,
  children,
}: {
  initialTab: ProfileTab;
  children: ReactNode;
}) {
  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    const syncTab = () => setActiveTab(tabFromLocation());
    window.addEventListener("popstate", syncTab);
    return () => window.removeEventListener("popstate", syncTab);
  }, []);

  const selectTab = useCallback((tab: ProfileTab) => {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    url.hash = "";
    window.history.pushState(null, "", url);
  }, []);

  const value = useMemo(
    () => ({ activeTab, selectTab }),
    [activeTab, selectTab],
  );

  return (
    <ProfileTabContext.Provider value={value}>
      {children}
    </ProfileTabContext.Provider>
  );
}

export function useProfileTabs(): ProfileTabContextValue {
  const context = useContext(ProfileTabContext);
  if (!context) {
    throw new Error("useProfileTabs must be used inside ProfileTabProvider");
  }
  return context;
}

export function ProfileTabButton({
  tab,
  children,
  className,
  ariaLabel,
  ariaCurrent,
}: {
  tab: ProfileTab;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
  ariaCurrent?: "page";
}) {
  const { selectTab } = useProfileTabs();
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-current={ariaCurrent}
      className={className}
      onClick={() => selectTab(tab)}
    >
      {children}
    </button>
  );
}
