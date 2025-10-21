import React from "react";
import ReactDOM from "react-dom";

import axios, { AxiosError } from "axios";
import reportWebVitals from "./reportWebVitals";

import "react-day-picker/style.css";

import "./index.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import TimeAgo from "javascript-time-ago";
import en from "javascript-time-ago/locale/en";
import SocketProvider from "./hooks/WebsocketProvider";
import AppRouter from "./AppRouter";
axios.defaults.withCredentials = true;
axios.defaults.baseURL = process.env.PUBLIC_URL || 'http://localhost:3000';

//locale for rendering relative time react
TimeAgo.addDefaultLocale(en);

// default queryClient stuff. will need to refactor as this is deprecated in v5
//https://dev-listener.medium.com/react-routes-nodejs-routes-2875f148065b
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10000,
      onError: (err) => {
        const error = err as AxiosError;
        // const path = window.location.pathname;
        if (error.response && error.response.status === 401) {
          window.location.reload();
          // const search = new URLSearchParams([['to', path + window.location.search]]).toString();
          // window.location.assign(`/login?${search}`);
        }
      },
    },
  },
});
const url = process.env.PUBLIC_URL && new URL(process.env.PUBLIC_URL).pathname;
ReactDOM.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={url}>
        <SocketProvider>
          <AppRouter />
        </SocketProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
  document.getElementById("root")
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
