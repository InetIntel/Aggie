import { useState } from "react";
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
  return (
    <nav className='w-full bg-white dark:bg-gray-800 text-black dark:text-gray-300 flex justify-between items-center gap-2 px-2 sm:px-3 md:px-4 border-b border-gray-200 py-1.5 md:py-2'>
      {/* shrink-0, not min-w-0: the links are whitespace-nowrap, so letting this
          box shrink would make them overflow it and paint over the user button.
          The username on the right is the only thing that gives. */}
      <div className='flex gap-1 sm:gap-2 items-center shrink-0'>

        <div>
          <svg
            fill='none'
            viewBox='0 0 62 62'
            className='w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10 bg-[#416B34] text-white dark:text-gray-300 px-1.5 md:px-2 rounded-lg'
          >
            <path
              d='M31 39a7 7 0 1 1-14 0 7 7 0 0 1 14 0Zm15-15a7 7 0 1 1-14 0 7 7 0 0 1 14 0Zm-4-14a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm0 29a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm13 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm-43 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm30 13a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm14-28a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm-43 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm16 0a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z'
              fill='currentColor'
            />
          </svg>
        </div>
        <div className='hidden lg:flex whitespace-nowrap rounded-lg font-medium text-base gap-1 mx-2 '>
          {Object.entries(mainLinks).map(([name, path]) => (
            <Link
              key={name}
              to={path.to}
              className={`px-1 sm:px-2 focus-theme hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-[#416B34] dark:text-gray-300 hover:text-[#416B34] ${isActive(path.to, path.not) ? "" : ""
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
      <div className='flex gap-1 sm:gap-2 items-center min-w-0'>
        {session && (
          <div className='flex items-center gap-1 sm:gap-2 min-w-0'>
            <Link
              to={"/settings/user/" + session._id}
              className='focus-theme min-w-0 rounded-full hover:underline  hover:bg-slate-100 dark:hover:bg-gray-700 '
            >
              {/* min-w-0 has to run the whole way down: `truncate` is inert on a
                  flex item whose min-width is auto, which would floor the name at
                  its 8rem cap and let it spill out over the hamburger. */}
              <div className='px-2 sm:px-3 py-1 flex gap-1.5 sm:gap-2 h-full min-w-0 items-center border border-slate-200 rounded-lg font-medium text-[11px] sm:text-xs '>
                <FontAwesomeIcon icon={faUser} className='shrink-0' />
                <span className='truncate min-w-0 max-w-[8rem] md:max-w-[14rem]'>
                  {session.username}
                </span>
              </div>
            </Link>
          </div>
        )}

        <Menu as='div' className='relative shrink-0'>
          <Menu.Button className='focus-theme px-2 sm:px-3 py-1 rounded-lg border-y border border-slate-300 hover:bg-slate-200 dark:hover:bg-gray-600 ui-open:bg-slate-300 dark:ui-open:bg-gray-500 disabled:opacity-70 disabled:pointer-events-none'>
            <FontAwesomeIcon icon={faBars} />
          </Menu.Button>
          <Menu.Items className='absolute top-full right-0 mt-1 shadow-md overflow-y-auto max-h-[calc(100svh-4rem)] rounded-lg bg-white dark:bg-gray-800 border border-slate-200 z-30 text-sm font-medium'>
            <div className='lg:hidden border-b border-slate-200 dark:border-gray-600'>
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
