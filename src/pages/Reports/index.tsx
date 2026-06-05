import {
  useOutlet,
  useParams,
  useLocation,
  useSearchParams,
  useNavigate,
} from "react-router-dom";
import { useUpdateQueryData } from "../../hooks/useUpdateQueryData";
import { SocketEvent, useSocketSubscribe } from "../../hooks/WebsocketProvider";
import type { Report, Reports as IReports } from "../../api/reports/types";
import { updateByIds } from "../../utils/immutable";

interface IProps {
  children: React.ReactNode
}

const Reports = ({ children }: IProps) => {
  const queryData = useUpdateQueryData();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { id: pageId } = useParams();
  const outlet = useOutlet();

  // Alerts table view goes full-width; the report detail becomes a slide-over
  // drawer instead of the permanent right column. (Mirrors the `view` param
  // resolution in AllReportsList — URL → localStorage → default list.)
  const isAlerts = location.pathname.startsWith("/alerts");
  const urlView = searchParams.get("view");
  const isTableView =
    isAlerts &&
    (urlView === "table" ||
      (urlView !== "list" &&
        localStorage.getItem("alerts:view") === "table"));
  const hasOutlet = !!outlet && !!outlet.type;

  interface ReportUpdateEvent extends SocketEvent {
    data: {
      ids: string[];
      update: Record<string, any>;
    };
  }

  // update local data on websocket update
  const handleSocketUpdate = (message: ReportUpdateEvent) => {
    if (message.event !== "reports:update") return;
    console.log("sockets", message);
    const key = location.pathname.includes("batch") ? ["batch"] : ["reports"];
    if (key.includes("batch")) {
      queryData.update<IReports>(key, (data) => {
        const updateData = updateByIds(
          message.data.ids,
          data.results,
          message.data.update
        );
        return {
          results: updateData,
        };
      });
    } else {
      const reportListQueries = queryData.queryClient.getQueriesData<IReports>({
        queryKey: ["reports"],
      });
      reportListQueries.forEach(([queryKey, data]) => {
        if (!data || !Array.isArray(queryKey) || queryKey.length !== 3) return;

        const updateData = updateByIds(
          message.data.ids,
          data.results,
          message.data.update
        );
        queryData.queryClient.setQueryData(queryKey, {
          ...data,
          results: updateData,
        });
      });
    }
    // update single report
    if (pageId) {
      queryData.update<Report>(["reports", pageId], (data) => {
        return message.data.update;
      });
    }
  };
  useSocketSubscribe("reports:update", handleSocketUpdate);

  if (isTableView) {
    return (
      <section className='max-w-screen-2xl mx-auto px-4'>
        <main>{children}</main>
        {hasOutlet && (
          <>
            <div
              className='fixed inset-0 bg-black/20 z-20'
              onClick={() =>
                navigate({ pathname: "/alerts", search: location.search })
              }
            />
            <aside className='fixed top-0 right-0 h-full w-full max-w-xl z-30 bg-slate-50 dark:bg-gray-900 shadow-xl overflow-y-auto p-4'>
              {outlet}
            </aside>
          </>
        )}
      </section>
    );
  }

  return (
    <section className='max-w-screen-2xl mx-auto px-4 grid grid-cols-3 gap-3'>
      <main className='col-span-2 '>{children}</main>
      <aside className='col-span-1'>
        {!hasOutlet ? (
          <p className='grid w-full py-24 place-items-center font-medium sticky top-2 bg-slate-50 dark:bg-gray-900  rounded-lg mt-4'>
            Select a report to view in this window
          </p>
        ) : (
          outlet
        )}
      </aside>
    </section>
  );
};

export default Reports;
