import {
  useOutlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useSocketSubscribe } from "../../hooks/WebsocketProvider";

interface IProps {
  children: React.ReactNode
}

const Reports = ({ children }: IProps) => {
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const outlet = useOutlet();

  // List view uses a persistent 1/3 right detail panel (the selected report
  // renders in the outlet). The alerts-only table view shows detail inline, so
  // there it stays full-width and a deep link to /alerts/:id opens the
  // standalone detail in a slide-over drawer as a fallback.
  const hasOutlet = !!outlet && !!outlet.type;
  const isAlerts = location.pathname.startsWith("/alerts");
  const basePath = location.pathname.startsWith("/mediaposts")
    ? "/mediaposts"
    : "/alerts";
  const urlView = new URLSearchParams(location.search).get("view");
  const view = !isAlerts
    ? "list"
    : urlView === "table" || urlView === "list"
    ? urlView
    : localStorage.getItem("alerts:view") === "table"
    ? "table"
    : "list";
  const listView = view === "list";

  const handleSocketUpdate = () => {
    queryClient.invalidateQueries(["reports"]);
    queryClient.invalidateQueries(["batch"]);
  };
  useSocketSubscribe("reports:update", handleSocketUpdate);
  useSocketSubscribe("reports:create", handleSocketUpdate);
  useSocketSubscribe("reports:delete", handleSocketUpdate);
  useSocketSubscribe("reports:read", handleSocketUpdate);

  if (listView) {
    return (
      <section className='max-w-screen-2xl mx-auto px-4 grid grid-cols-3 gap-3'>
        <main className='col-span-2'>{children}</main>
        <aside className='col-span-1'>
          {!hasOutlet ? (
            <p className='grid w-full py-24 place-items-center font-medium sticky top-2 bg-slate-50 dark:bg-gray-900 rounded-lg mt-4'>
              Select a report to view in this window
            </p>
          ) : (
            outlet
          )}
        </aside>
      </section>
    );
  }

  return (
    <section className='max-w-screen-2xl mx-auto px-4'>
      <main>{children}</main>
      {hasOutlet && (
        <>
          <div
            className='fixed inset-0 bg-black/20 z-20'
            onClick={() =>
              navigate({ pathname: basePath, search: location.search })
            }
          />
          <aside className='fixed top-0 right-0 h-full w-full max-w-xl z-30 bg-slate-50 dark:bg-gray-900 shadow-xl overflow-y-auto p-4'>
            {outlet}
          </aside>
        </>
      )}
    </section>
  );
};

export default Reports;
