import { useEffect } from "react";
import {
  faCog,
  faUsersCog,
  faTags,
  faCloudArrowDown,

} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";
import { Link, Outlet, useLocation } from "react-router-dom";

import { getSession } from "../../api/session";

export function menuLinks(role: string | undefined) {
  switch (role) {
    case "admin":
      return {
        "Manage Users": { to: "users", icon: faUsersCog },
        "Teams": { to: "teams", icon: faUsersCog },
        // "Manage Tags": { to: "tags", icon: faTags },
        "Providers and Feeds": { to: "connections", icon: faCloudArrowDown },
      };
    case "team_lead":
      return {
        "Manage Users": { to: "users", icon: faUsersCog },
        "Teams": { to: "teams", icon: faUsersCog },
        // "Manage Tags": { to: "tags", icon: faTags },
        "Providers and Feeds": { to: "connections", icon: faCloudArrowDown },
      };
    case "monitor":
    case "viewer":
      return {
        "Tags": { to: "tags", icon: faTags },
        "Providers and Feeds": { to: "sources", icon: faCloudArrowDown },
      };
    default:
      return {};
  }
}

const Settings = () => {
  const location = useLocation();
  const { data: session } = useQuery(["session"], getSession);

  useEffect(() => {document.title = "Settings - Aggie"}, []);

  return (
    <section className='max-w-screen-xl mx-auto w-full px-4 flex flex-col min-[1080px]:flex-row gap-4'>
      <nav className='flex flex-wrap min-[1080px]:flex-col gap-2 mt-3 min-[1080px]:pr-3 min-[1080px]:border-r border-slate-300 min-[1080px]:w-[300px] min-[1080px]:shrink-0 min-[1080px]:min-h-[80vh]'>
        {Object.entries(menuLinks(session?.role)).map(([name, link]) => (
          <Link
            key={name}
            className={`px-3 py-2 flex items-center gap-3 font-medium text-left rounded-lg min-[1080px]:w-full ${location.pathname.includes(link.to)
              ? "bg-lime-200 text-green-900 "
              : "hover:bg-lime-100 hover:text-green-900"
              }`}
            to={link.to}
          >
            <FontAwesomeIcon icon={link.icon} className='shrink-0' />
            <span className='min-w-0 break-words'>{name}</span>
          </Link>
        ))}
      </nav>
      <div className='w-full min-[1080px]:flex-1 min-w-0'>
        <Outlet />
      </div>
    </section>
  );
};

export default Settings;
