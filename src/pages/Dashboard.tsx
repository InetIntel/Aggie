import { useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowTrendUp,
  faBell,
  faCircleExclamation,
  faLink,
  faPlus,
  faTriangleExclamation,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";

const metricItems = [
  { label: "Alerts today", value: 52, ring: true },
  { label: "Unread alerts", value: 11 },
  { label: "Ongoing events", value: 8 },
];

const trendSeries = [
  // {
  //   label: "Ooni",
  //   color: "#63C7F5",
  //   points: "52,102 124,110 196,106 268,90 340,72 412,74 484,96",
  // },
  {
    label: "IODA",
    color: "#F4C44E",
    points: "52,102 124,110 196,106 268,90 340,72 412,74 484,96",
  },
  // {
  //   label: "Content",
  //   color: "#B7C515",
  //   points: "12,110 88,96 164,84 240,78 316,86 392,80 468,64",
  // },
];

const notableActivities = [
  {
    severity: "High",
    time: "8:00 AM - 9:00 AM est",
    title: "QOM",
    platforms: ["Ioda", "Cloudflare"],
    sources: ["Active Probing", "BGP", "Telescope", "Cloudflare Traffic"],
  },
  {
    severity: "High",
    time: "8:00 AM - 9:00 AM est",
    title: "QOM",
    platforms: ["Ioda", "Cloudflare"],
    sources: ["Active Probing", "BGP", "Telescope", "Cloudflare Traffic"],
  },
  // {
  //   severity: "High",
  //   time: "10:00 AM - 11:00 AM est",
  //   title: "Regional latency spike",
  //   platforms: ["Ooni", "Cloudflare"],
  //   sources: ["BGP", "Cloudflare Traffic", "Social Posts"],
  // },
  // {
  //   severity: "Medium",
  //   time: "12:00 PM - 1:00 PM est",
  //   title: "Traffic anomaly review",
  //   platforms: ["Content", "Ioda"],
  //   sources: ["Active Probing", "Telescope", "Reporter notes"],
  // },
];

const sectionCardClass =
  "rounded-[2rem] border border-slate-200 bg-white p-5 shadow-[0_4px_12px_rgba(15,23,42,0.08)] dark:border-gray-700 dark:bg-gray-800";

const Dashboard = () => {
  useEffect(() => {
    document.title = "Dashboard - Aggie";
    document.getElementById("main_view")?.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }, []);

  return (
    <section className='mx-auto max-w-[1400px] px-4 py-6'>
      <div className='grid gap-4 xl:grid-cols-[1fr_1.15fr]'>
        <section className={`${sectionCardClass} flex h-full flex-col p-4`}>
          <h1 className='text-xl font-semibold text-slate-900 dark:text-white'>
            Metrics
          </h1>
          <div className='flex flex-1 flex-wrap content-center items-center justify-center gap-5 py-4'>
            {metricItems.map((item) => (
              <article
                key={item.label}
                className={[
                  "flex h-36 w-36 flex-col items-center justify-center rounded-full border bg-white px-3 text-center shadow-[0_6px_12px_rgba(15,23,42,0.12)] dark:bg-gray-800",
                  item.ring
                    ? "border-[14px] border-[#166534]"
                    : "border-slate-200 dark:border-gray-600",
                ].join(" ")}
              >
                <p className='max-w-[8rem] text-lg font-medium leading-tight text-slate-900 dark:text-white'>
                  {item.label}
                </p>
                <p className='mt-2 text-2xl font-semibold text-[#166534]'>
                  {item.value}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className={`${sectionCardClass} p-4`}>
          <div className='flex items-center justify-between gap-4'>
            <h2 className='text-xl font-semibold text-slate-900 dark:text-white'>
              Trends
            </h2>
            <div className='inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 dark:border-gray-600 dark:text-gray-200'>
              <span>Date range</span>
              <FontAwesomeIcon icon={faArrowTrendUp} className='text-slate-500' />
            </div>
          </div>

          <div className='mt-4 rounded-[1.5rem] border border-slate-200 px-4 py-4 dark:border-gray-700'>
            <div className='mb-3 flex items-center justify-between gap-3'>
              <h3 className='text-2xl font-medium text-sky-700'>Alert</h3>
              <div className='rounded-full bg-slate-50 p-2 text-slate-500 shadow-sm dark:bg-gray-700'>
                <FontAwesomeIcon icon={faBell} />
              </div>
            </div>

            <div className='overflow-x-auto'>
              <svg
                viewBox='0 0 520 240'
                className='h-[185px] min-w-[520px] w-full'
                role='img'
                aria-label='Alert trends placeholder chart'
              >
                <rect x='52' y='8' width='436' height='156' fill='transparent' />
                {[0, 1, 2, 3, 4, 5, 6].map((line) => (
                  <line
                    key={`v-${line}`}
                    x1={52 + line * 72.6}
                    y1='8'
                    x2={52 + line * 72.6}
                    y2='164'
                    stroke='#E5E7EB'
                  />
                ))}
                {[0, 1, 2, 3].map((line) => (
                  <line
                    key={`h-${line}`}
                    x1='52'
                    y1={8 + line * 39}
                    x2='488'
                    y2={8 + line * 39}
                    stroke='#E5E7EB'
                  />
                ))}

                {["24 hr", "18 hr", "12 hr", "6 hr", "0"].map((label, index) => (
                  <text
                    key={label}
                    x='8'
                    y={18 + index * 39}
                    fill='#475569'
                    fontSize='12'
                    fontWeight='500'
                  >
                    {label}
                  </text>
                ))}

                {trendSeries.map((series) => (
                  <g key={series.label}>
                    <polyline
                      fill='none'
                      stroke={series.color}
                      strokeWidth='2.5'
                      points={series.points}
                    />
                    {series.points.split(" ").map((point) => {
                      const [cx, cy] = point.split(",");
                      return (
                        <circle
                          key={`${series.label}-${point}`}
                          cx={cx}
                          cy={cy}
                          r='4'
                          fill={series.color}
                        />
                      );
                    })}
                  </g>
                ))}

                {[
                  "2/26 10:00 am",
                  "2/26 10:30 am",
                  "2/26 11:00 am",
                  "2/26 11:30 am",
                  "2/26 12:00 pm",
                  "2/26 12:30 pm",
                  "2/26 1:00 pm",
                ].map((label, index) => (
                  <text
                    key={label}
                    x={52 + index * 72.6}
                    y='188'
                    fill='#475569'
                    fontSize='10'
                    fontWeight='500'
                  >
                    <tspan x={52 + index * 72.6} dy='0'>
                      {label.split(" ").slice(0, 2).join(" ")}
                    </tspan>
                    <tspan x={52 + index * 72.6} dy='12'>
                      {label.split(" ").slice(2).join(" ")}
                    </tspan>
                  </text>
                ))}
              </svg>
            </div>

            <div className='mt-2 flex flex-wrap gap-3 text-xs font-medium text-slate-800 dark:text-gray-200'>
              {trendSeries.map((series) => (
                <div key={series.label} className='flex items-center gap-2'>
                  <span
                    className='h-3 w-3 rounded-full'
                    style={{ backgroundColor: series.color }}
                  />
                  <span>{series.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <section className={`${sectionCardClass} mt-5`}>
        <h2 className='text-xl font-semibold text-slate-900 dark:text-white'>
          Notable Activity
        </h2>

        <div className='mt-5 grid gap-4 xl:grid-cols-3'>
          {notableActivities.map((activity) => (
            <article
              key={`${activity.time}-${activity.title}`}
              className='rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800'
            >
              <div className='flex items-start justify-between gap-3'>
                <span className='inline-flex items-center rounded-full border border-red-300 bg-red-100 px-4 py-1 text-sm font-medium text-red-700'>
                  {activity.severity}
                </span>
                <button
                  type='button'
                  className='grid h-10 w-10 place-items-center rounded-full bg-white text-xl text-slate-700 shadow-[0_4px_10px_rgba(15,23,42,0.16)] dark:bg-gray-700 dark:text-gray-200'
                  aria-label='Dismiss activity card'
                >
                  <FontAwesomeIcon icon={faXmark} />
                </button>
              </div>

              <p className='mt-6 text-base font-semibold leading-tight text-slate-950 dark:text-white'>
                {activity.time}
              </p>
              <p className='mt-3 text-xl italic text-slate-700 dark:text-gray-300'>
                {activity.title}
              </p>

              <div className='my-5 h-px bg-slate-200 dark:bg-gray-700' />

              <div>
                <p className='text-lg font-medium text-slate-900 dark:text-white'>
                  Platforms:
                </p>
                <div className='mt-3 flex flex-wrap gap-2'>
                  {activity.platforms.map((platform) => (
                    <span
                      key={platform}
                      className='rounded-full border border-lime-400 bg-lime-100 px-3 py-1 text-sm text-slate-700'
                    >
                      {platform}
                    </span>
                  ))}
                </div>
              </div>

              <div className='my-5 h-px bg-slate-200 dark:bg-gray-700' />

              <div>
                <p className='text-lg font-medium text-slate-900 dark:text-white'>
                  Sources
                </p>
                <div className='mt-3 flex flex-wrap gap-2'>
                  {activity.sources.map((source, index) => (
                    <span
                      key={source}
                      className={[
                        "rounded-full px-3 py-1 text-sm",
                        index === 2
                          ? "bg-slate-100 text-slate-400 dark:bg-gray-700 dark:text-gray-500"
                          : "border border-lime-400 bg-lime-100 text-slate-700",
                      ].join(" ")}
                    >
                      {source}
                    </span>
                  ))}
                </div>
              </div>

              <div className='my-5 h-px bg-slate-200 dark:bg-gray-700' />

              <div className='flex items-center gap-3 text-sm text-slate-700 dark:text-gray-300'>
                <FontAwesomeIcon icon={faCircleExclamation} />
                <span>Impacted ASNS</span>
                {/* <FontAwesomeIcon icon={faTriangleExclamation} className='text-slate-500' /> */}
              </div>

              <div className='mt-5 flex flex-col gap-3'>
                <button
                  type='button'
                  className='flex w-full items-center justify-center gap-2 rounded-md bg-[#166534] px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-[#14532d]'
                >
                  <FontAwesomeIcon icon={faPlus} />
                  <span>Create New Incident</span>
                </button>
                <button
                  type='button'
                  className='flex w-full items-center justify-center gap-2 rounded-md bg-[#1683A3] px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-[#126b85]'
                >
                  <FontAwesomeIcon icon={faLink} />
                  <span>Link to incident</span>
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
};

export default Dashboard;
