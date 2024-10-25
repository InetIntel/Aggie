import React, { useEffect, useState } from "react";
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

//import "@yaireo/tagify/dist/tagify.css";

import AggieNavbar from "./AggieNavbar";
import AlertService, { AlertContent } from "./components/AlertService";
import SourcesIndex from "./pages/Settings/source/SourcesIndex";
import SourceDetails from "./pages/Settings/source/SourceDetails";
import UsersIndex from "./pages/Settings/user/UsersIndex";
import UserProfile from "./pages/Settings/user/UserProfile";
import TagsIndex from "./pages/Settings/tag/TagsIndex";
import Configuration from "./pages/Settings/Configuration";
import CredentialsIndex from "./pages/Settings/Credentials/CredentialsIndex";
import Login from "./pages/Login";
import Analysis from "./pages/Analysis_old";
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
import BatchReportList from "./pages/Reports/BatchReportsList";
import FlaggedReportsList from "./pages/Reports/FlaggedReportsList";

// im currently working on this
//TODO: Also BIG TODO is to ensure EVERY API call has a way of surfacing an error message. I want readble UI alerts but at least console.errors.
const isSafari = () =>
  /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

const RerouteToLogin = () => {
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const searchParam = new URLSearchParams([["to", location.pathname]]);
    navigate({ pathname: "/login", search: searchParam.toString() });
  }, []);
  return <>Rerouting to login...</>;
};

const PublicRoutes = () => {
  return (
    <Routes>
      <Route path='/login' element={<Login />} />
      <Route path='/*' element={<RerouteToLogin />} />
    </Routes>
  );
};

const defaultRoute = "/rpt/batch";

interface IPrivateRouteProps {
  sessionData: Session | undefined;
  setGlobalAlert: React.Dispatch<AlertContent>;
}

const PrivateRoutes = ({ sessionData, setGlobalAlert }: IPrivateRouteProps) => {
  return (
    <Routes>
      <Route path='/login' element={<Navigate to={defaultRoute} />} />
      {/* <Route path='*' element={<Navigate replace to='login' />} /> */}

      <Route index element={<Navigate to={defaultRoute} />} />
      <Route
        path='/rpt'
        element={
          <Reports>
            <AllReportsList />
          </Reports>
        }
      >
        <Route path=':id' element={<Report />}></Route>
      </Route>

      <Route
        path='/rpt/batch'
        element={
          <Reports>
            <BatchReportList />
          </Reports>
        }
      >
        <Route path=':id' element={<Report />}></Route>
      </Route>
      <Route
        path='/rpt/search'
        element={
          <Reports>
            <FlaggedReportsList />
          </Reports>
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
        <Route path='users' element={<UsersIndex session={sessionData} />} />
        <Route
          path='user/:id'
          element={<UserProfile session={sessionData} />}
        />
        <Route path='tags' element={<TagsIndex />} />
        <Route path='config' element={<Configuration />} />
        <Route path='credentials' element={<CredentialsIndex />} />
      </Route>
      <Route path='/analysis' element={<Analysis />} />
      <Route path='/*' element={<NotFound />} />
    </Routes>
  );
};
const AppRouter = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(true);
  const [userData, setUserData] = useState<Session | undefined>(undefined);

  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  // we just wanna check session once, no need for react query.
  useEffect(() => {
    getSession()
      .then((data: Session) => {
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
        // didn't log in
        if (err.response && err.response.status === 401) {
        }
        setIsLoggedIn(false);
      });
  }, []);

  //queryClient.prefetchQuery("all-groups", getAllGroups);
  // This is how we "globalize" an alert. This is only for alerts that should remain over multiple views
  // replace with recoil
  const [globalAlert, setGlobalAlert] = useState<AlertContent>({
    heading: "",
    message: "",
    variant: "primary",
  });
  const InitialApp = (
    <div className='grid grid-rows-[auto_auto_1fr] h-[100svh]'>
      <div>
        <AggieNavbar isAuthenticated={isLoggedIn} session={userData} />
        <AlertService
          globalAlert={globalAlert}
          setGlobalAlert={setGlobalAlert}
        />
      </div>
      <FetchIndicator className='sticky top-0 z-20 ' />
      <div className='h-full overflow-y-auto'>
        {isLoggedIn ? (
          <PrivateRoutes
            sessionData={userData}
            setGlobalAlert={setGlobalAlert}
          />
        ) : (
          <PublicRoutes />
        )}
      </div>
    </div>
  );

  const WrongBrowser = (
    <div className='grid place-items-center'>
      <p>
        Hi, unfortunately Aggie does not support Safari yet. Please use Google
        Chrome, Firefox or Edge browser to run Aggie.
      </p>
    </div>
  );

  const AppToRender = isSafari() ? WrongBrowser : InitialApp;

  return InitialApp;
};

export default AppRouter;
