import {
  faCog,
  faKey,
  faUsersCog,
  faTags,
  faCloudArrowDown,

} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, Outlet, useLocation } from "react-router-dom";

export const menuLinks = {
  Config: { to: "config", icon: faCog },
  "Manage Users": { to: "users", icon: faUsersCog },
  "Manage Tags": { to: "tags", icon: faTags },
  "API Credentials": { to: "credentials", icon: faKey },
  "Manage Sources": { to: "sources", icon: faCloudArrowDown },
};

const Settings = () => {
  const location = useLocation();
  return (
    <section className='max-w-screen-xl mx-auto w-full grid grid-cols-5 gap-4'>
      <nav className='flex flex-col gap-2 mt-3 pr-3 border-r border-slate-300 min-h-[80vh]'>
        {Object.entries(menuLinks).map(([name, link]) => (
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
