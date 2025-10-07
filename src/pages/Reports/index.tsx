import { useOutlet, useParams, useLocation } from "react-router-dom";
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
  const { id: pageId } = useParams();
  const outlet = useOutlet();

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
    // update single report
    if (pageId) {
      queryData.update<Report>([...key, pageId], (data) => {
        return message.data.update;
      });
    }
  };
  useSocketSubscribe("reports:update", handleSocketUpdate);

  return (
    <section className='max-w-screen-2xl mx-auto px-4 grid grid-cols-3 gap-3'>
      <main className='col-span-2 '>{children}</main>
      <aside className='col-span-1'>
        {!outlet || !outlet.type ? (
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
