import { useEffect, useState } from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { getSession } from "./api/session";

import type { AxiosError } from "axios";
import type { Session } from "./api/session/types";

import Navbar from "./Navbar";
import SourcesIndex from "./pages/Settings/source/SourcesIndex";
import SourceDetails from "./pages/Settings/source/SourceDetails";
import UsersIndex from "./pages/Settings/user/UsersIndex";
import UserProfile from "./pages/Settings/user/UserProfile";
import TeamsIndex from "./pages/Settings/team/TeamsIndex";
import TagsIndex from "./pages/Settings/tag/TagsIndex";
import CredentialsIndex from "./pages/Settings/Credentials/CredentialsIndex";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import Incidents from "./pages/incidents";
import Incident from "./pages/incidents/Incident";
import Reports from "./pages/Reports";
import Report from "./pages/Reports/Report";
import NewIncident from "./pages/incidents/NewIncident";
import FetchIndicator from "./components/FetchIndicator";
import Settings from "./pages/Settings";
import { useQueryClient } from "@tanstack/react-query";
import AllReportsList from "./pages/Reports/AllReportsList";
import Style from "./pages/Style";

const RerouteToLogin = () => {
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const searchParam = new URLSearchParams([
      ["to", location.pathname + location.search],
    ]);
    navigate({ pathname: "/login", search: searchParam.toString() });
  }, []);
  return <>Rerouting to login...</>;
};
// routes accessible for logged out users
const PublicRoutes = () => {
  return (
    <Routes>
      <Route path='/login' element={<Login />} />
      <Route path='/*' element={<RerouteToLogin />} />
    </Routes>
  );
};

const defaultRoute = "/alerts";

interface IPrivateRouteProps {
  sessionData: Session | undefined;
}

// routes accessible to logged in users
const PrivateRoutes = ({ sessionData }: IPrivateRouteProps) => {
  return (
    <Routes>
      <Route path='/login' element={<Navigate to={defaultRoute} />} />
      {/* <Route path='*' element={<Navigate replace to='login' />} /> */}

      <Route index element={<Navigate to={defaultRoute} />} />
      <Route
        path='/alerts'
        element={
          <Reports><AllReportsList alerts={true} key='alerts' /></Reports>
        }
      >
        <Route path=':id' element={<Report />}></Route>
      </Route>

      <Route
        path='/mediaposts'
        element={
          <Reports><AllReportsList alerts={false} key='mediaposts' /></Reports>
        }
      >
        <Route path=':id' element={<Report />}></Route>
      </Route>

      <Route path='/incidents' element={<Incidents />} />
      <Route path='/incidents/:id' element={<Incident />} />
      <Route path='/incidents/new' element={<NewIncident />} />
      <Route path='/settings' element={<Settings />}>
        <Route path='sources' element={<SourcesIndex />} />
        <Route path='source/:id' element={<SourceDetails />} />
        <Route path='tags' element={<TagsIndex />} />
        <Route
          path='user/:id'
          element={<UserProfile session={sessionData} />}
        />
        { (sessionData?.role === "admin" || sessionData?.role === "team_lead" ) &&
          <>
            <Route path='users' element={<UsersIndex session={sessionData} />} />
            <Route path='credentials' element={<CredentialsIndex />} />
          </>
        }
        {sessionData?.role === "admin" && (
            <Route path='teams' element={<TeamsIndex />} />
         )
        }
      </Route>
      { sessionData?.role === "admin"
        && (process.env.ENVIRONMENT === "development" || process.env.NODE_ENV === "development")
        && <Route path='/style' element={<Style />} />
      }
      <Route path='/*' element={<NotFound />} />
    </Routes>
  );
};

const AppRouter = () => {
  const [hydrating, setHydrating] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userData, setUserData] = useState<Session | undefined>(undefined);

  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  // check if user is authorized
  // we just wanna check session once, no need for react query.
  useEffect(() => {
    let cancelled = false;
    getSession()
      .then((data: Session) => {
        if(cancelled) return;
        // did log in
        setIsLoggedIn(true);
        if (data) {
          setUserData(data);
          queryClient.setQueryData(["session"], data);
        }
        if (location.pathname === "/login") {
          navigate(defaultRoute);
        }
      })
      .catch((err: AxiosError) => {
        if(cancelled) return;
        setIsLoggedIn(false);
        if (location.pathname !== "/login") {
          const searchParam = new URLSearchParams([
            ["to", location.pathname + location.search],
          ]);
          navigate({ pathname: "/login", search: searchParam.toString() }, { replace: true });
        }
      })
      .finally(() => {
        if (!cancelled) setHydrating(false);
      });
      return () => {cancelled = true;};
  }, []);


  return (
    <div className='flex flex-col h-[100svh]'>
      <Navbar isAuthenticated={isLoggedIn} session={userData} />
      <FetchIndicator className='sticky top-0 z-20' />
      <main id='main_view' className='h-full overflow-y-auto flex-1'>
        {hydrating ? null : isLoggedIn ? (
          <PrivateRoutes
            sessionData={userData}
          />
        ) : (
          <PublicRoutes />
        )}
      </main>
    </div>
  );
};

export default AppRouter;
