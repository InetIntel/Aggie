import {
  faCog,
  faKey,
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
        "Manage Tags": { to: "tags", icon: faTags },
        "API Credentials": { to: "credentials", icon: faKey },
        "Manage Sources": { to: "sources", icon: faCloudArrowDown },
      };
    case "monitor":
      return {
        "Manage Tags": { to: "tags", icon: faTags },
        "Manage Sources": { to: "sources", icon: faCloudArrowDown },
      };
    case "viewer":
      return {"Manage Sources": { to: "sources", icon: faCloudArrowDown }};
    default:
      return {};
  }
}

const Settings = () => {
  const location = useLocation();
  const { data: session } = useQuery(["session"], getSession);

  return (
    <section className='max-w-screen-xl mx-auto w-full grid grid-cols-5 gap-4'>
      <nav className='flex flex-col gap-2 mt-3 pr-3 border-r border-slate-300 min-h-[80vh]'>
        {Object.entries(menuLinks(session?.role)).map(([name, link]) => (
          <Link
            key={name}
            className={`px-3 py-2 grid grid-cols-[16px_1fr] gap-2 items-center font-medium whitespace-nowrap text-left rounded-lg w-full ${location.pathname.includes(link.to)
              ? "bg-lime-200 text-green-900 "
              : "hover:bg-lime-100 hover:text-green-900"
              }`}
            to={link.to}
          >
            <FontAwesomeIcon icon={link.icon} />
            {name}
          </Link>
        ))}
      </nav>
      <div className='col-span-4'>
        <Outlet />
      </div>
    </section>
  );
};

export default Settings;
