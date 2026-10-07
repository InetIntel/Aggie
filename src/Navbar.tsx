import { useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRightFromBracket, faBars } from "@fortawesome/free-solid-svg-icons";
import { Menu } from "@headlessui/react";
import { faUser } from "@fortawesome/free-regular-svg-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { logOut } from "./api/session";
import { Session } from "./api/session/types";
import AggieButton from "./components/AggieButton";
import ConfirmationDialog from "./components/ConfirmationDialog";
import { menuLinks } from "./pages/Settings";

interface LinkOptions {
  to: string;
  not?: string[];
}
const mainLinks: Record<string, LinkOptions> = {
  "Alerts": { to: "/alerts", not: ["batch", "search"] },
  "Social Media Posts": { to: "/mediaposts" },
  Incidents: { to: "/incidents" },
  Dashboard: { to: "/dashboard" },
};

// Both nav groups are shrink-0, so their widths are what they need, not what they got.
const navFits = (nav: HTMLElement) => {
  const [left, right] = Array.from(nav.children);
  const style = getComputedStyle(nav);
  const room =
    nav.clientWidth -
    parseFloat(style.paddingLeft) -
    parseFloat(style.paddingRight) -
    (parseFloat(style.columnGap) || 0);
  return left.getBoundingClientRect().width + right.getBoundingClientRect().width <= room;
};

const helpfulLinks = [
  {
    label: "What to Track and Investigate in Aggie",
    to: "https://docs.google.com/document/d/15rl3psnHGZYaxXS7CCIwRhqvNMMcyFr54z5I0N8Gub8/edit?usp=sharing",
  },
  {
    label: "Tracking Team Guide",
    to: "https://docs.google.com/document/d/1Krr1JaS0Wmh_SbBsnx1LKAAS42t868k2mpyPBztx3AQ/edit?usp=sharing",
  },
  {
    label: "Veracity Team Guide",
    to: "https://docs.google.com/document/d/1Q9nln1OGc5cqdw4BTE71xYhQMA3e_KE_JeEW_atq5Hk/edit?usp=sharing",
  },
];


interface IProps {
  isAuthenticated: boolean;
  session: Session | undefined;
}
const AggieNavbar = ({ isAuthenticated, session }: IProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const isActive = (to: string, not: string[] | undefined) => {
    const doesNotHave = !!not
      ? !not.some((n) => location.pathname.includes(n))
      : true;
    return location.pathname.includes(to) && doesNotHave;
  };

  const [logoutModal, setLogoutModal] = useState(false);

  // How much the bar has given up to fit, in order: 0 shows everything, 1 hides the
  // username, 2 drops the links to text-sm, 3 moves the links into the hamburger.
  // Measured rather than tied to breakpoints, so each step happens only once the bar
  // is actually out of room, whatever the window width or browser font size.
  const navRef = useRef<HTMLElement>(null);
  const [fit, setFit] = useState({ squeeze: 0, pass: 0 });

  // Whenever the room or the content may have changed, start again from 0...
  useLayoutEffect(() => {
    if (!isAuthenticated) return;
    let live = true;
    const refit = () => {
      if (live) setFit(({ pass }) => ({ squeeze: 0, pass: pass + 1 }));
    };
    refit();
    window.addEventListener("resize", refit);
    document.fonts?.ready.then(refit);
    return () => {
      live = false;
      window.removeEventListener("resize", refit);
    };
  }, [isAuthenticated, session?.username]);

  // ...then give up one step per render until it fits. Layout effects run before
  // paint, so the intermediate steps are never seen.
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (nav && fit.squeeze < 3 && !navFits(nav)) {
      setFit(({ squeeze, pass }) => ({ squeeze: squeeze + 1, pass }));
    }
  }, [fit]);

  const doLogout = useMutation({
    mutationFn: logOut,
    onSuccess: () => {
      setLogoutModal(false);
      // Synchronously mark the session logged-out so AppRouter's ["session"]
      // query flips the gate to PublicRoutes in the same render (no refetch
      // race that could bounce /login back into the app), then go to /login.
      queryClient.setQueryData(["session"], null);
      navigate({ pathname: "/login" }, { replace: true });
    },
  });

  if (!isAuthenticated) return <></>;
  // The smaller phone sizing below sm/md only kicks in once the links are in the menu.
  // Before that, every width in the bar has to depend on the squeeze step alone: a
  // breakpoint that shrank the logo would free room and bring a hidden step back.
  const linksInMenu = fit.squeeze >= 3;
  return (
    <nav
      ref={navRef}
      className={`w-full bg-white dark:bg-gray-800 text-black dark:text-gray-300 flex justify-between items-center gap-2 border-b border-gray-200 py-1.5 md:py-2 ${linksInMenu ? "px-2 sm:px-3 md:px-4" : "px-4"}`}>
      {/* Both groups are shrink-0 so navFits can read their natural widths; nothing
          in the bar squeezes, the squeeze steps above make it fit instead. */}
      <div className={`flex items-center shrink-0 ${linksInMenu ? "gap-1 sm:gap-2" : "gap-2"}`}>

        <div>
          <svg
            fill='none'
            viewBox='0 0 62 62'
            className={`bg-[#416B34] text-white dark:text-gray-300 rounded-lg ${linksInMenu ? "w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10 px-1.5 md:px-2" : "w-10 h-10 px-2"}`}
          >
            <path
              d='M31 39a7 7 0 1 1-14 0 7 7 0 0 1 14 0Zm15-15a7 7 0 1 1-14 0 7 7 0 0 1 14 0Zm-4-14a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm0 29a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm13 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm-43 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm30 13a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm14-28a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm-43 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm16 0a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z'
              fill='currentColor'
            />
          </svg>
        </div>
        <div className={`${fit.squeeze >= 3 ? "hidden" : "flex"} whitespace-nowrap rounded-lg font-medium ${fit.squeeze >= 2 ? "text-sm" : "text-base"} gap-1 mx-2`}>
          {Object.entries(mainLinks).map(([name, path]) => (
            <Link
              key={name}
              to={path.to}
              className={`px-2 focus-theme hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-[#416B34] dark:text-gray-300 hover:text-[#416B34] ${isActive(path.to, path.not) ? "" : ""
                }`}
            >
              <p
                className={`py-1 border-b-2  ${isActive(path.to, path.not)
                  ? " border-[#416B34]"
                  : "border-transparent"
                  }`}
              >
                <span>{name}</span>
              </p>
            </Link>
          ))}
        </div>
      </div>
      <div className={`flex items-center shrink-0 ${linksInMenu ? "gap-1 sm:gap-2" : "gap-2"}`}>
        {session && (
          <div className={fit.squeeze >= 1 ? "hidden" : "flex items-center"}>
            <Link
              to={"/settings/user/" + session._id}
              className='focus-theme rounded-full hover:underline  hover:bg-slate-100 dark:hover:bg-gray-700 '
            >
              {/* The 14rem cap only stops a very long name from crowding out the
                  links; past that it is hidden whole, never squeezed. */}
              <div className='px-3 py-1 flex gap-2 h-full items-center border border-slate-200 rounded-lg font-medium text-xs'>
                <FontAwesomeIcon icon={faUser} className='shrink-0' />
                <span className='truncate max-w-[14rem]'>
                  {session.username}
                </span>
              </div>
            </Link>
          </div>
        )}

        <Menu as='div' className='relative shrink-0'>
          <Menu.Button className={`focus-theme py-1 rounded-lg ${linksInMenu ? "px-2 sm:px-3" : "px-3"} border-y border border-slate-300 hover:bg-slate-200 dark:hover:bg-gray-600 ui-open:bg-slate-300 dark:ui-open:bg-gray-500 disabled:opacity-70 disabled:pointer-events-none`}>
            <FontAwesomeIcon icon={faBars} />
          </Menu.Button>
          <Menu.Items className='absolute top-full right-0 mt-1 shadow-md overflow-y-auto max-h-[calc(100svh-4rem)] rounded-lg bg-white dark:bg-gray-800 border border-slate-200 z-30 text-sm font-medium'>
            <div className={`${fit.squeeze >= 3 ? "" : "hidden"} border-b border-slate-200 dark:border-gray-600`}>
              {Object.entries(mainLinks).map(([name, path]) => (
                <Menu.Item key={name}>
                  <Link
                    className={`px-3 py-2 hover:bg-slate-200 dark:hover:bg-gray-600 grid grid-cols-[16px_1fr] gap-2 items-center whitespace-nowrap text-left ${
                      isActive(path.to, path.not)
                        ? "text-[#416B34] dark:text-gray-100 font-semibold"
                        : ""
                    }`}
                    to={path.to}
                  >
                    <span
                      className={`place-self-center w-1.5 h-1.5 rounded-full ${
                        isActive(path.to, path.not)
                          ? "bg-[#416B34] dark:bg-gray-100"
                          : "bg-transparent"
                      }`}
                    />
                    {name}
                  </Link>
                </Menu.Item>
              ))}
            </div>
            {Object.entries(menuLinks(session?.role, session?.isTeamLead, session?._id)).map(([name, link]) => (
              <Menu.Item key={name}>
                {({ active }) => (
                  <Link
                    className='px-3 py-2  hover:bg-slate-200 dark:hover:bg-gray-600 grid grid-cols-[16px_1fr] gap-2 items-center whitespace-nowrap text-left'
                    to={'/settings/' + link.to}
                  >
                    <FontAwesomeIcon
                      icon={link.icon}
                      className='place-self-center'
                    />
                    {name}
                  </Link>
                )}
              </Menu.Item>
            ))}
            <Menu.Item>
              <span>
                <AggieButton
                  className='px-3 py-2 hover:bg-red-200 dark:hover:bg-red-200 dark:saturate-[0.7] hover:text-red-800 grid grid-cols-[16px_1fr] gap-2 items-center whitespace-nowrap text-left w-full'
                  onClick={() => setLogoutModal(true)}
                >
                  <FontAwesomeIcon
                    icon={faRightFromBracket}
                    className='place-self-center'
                  />
                  Logout
                </AggieButton>
              </span>
            </Menu.Item>
          </Menu.Items>
        </Menu>

        <ConfirmationDialog
          isOpen={logoutModal}
          onClose={() => setLogoutModal(false)}
          onConfirm={() => doLogout.mutate()}
          disabled={doLogout.isLoading}
          title='Logout?'
          variant='warning'
          description='Are you sure you want to log out of this account?'
          className='max-w-md w-full'
          confirmText={"Logout"}
          icon={faRightFromBracket}
        ></ConfirmationDialog>
      </div>
    </nav>
  );
};

export default AggieNavbar;
