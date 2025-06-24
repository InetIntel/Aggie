import React, { useContext, useEffect, useRef } from "react";
import { io } from "socket.io-client";
// https://aravindballa.com/writings/custom-hook-to-listen-websockets/

export const SocketContext = React.createContext<{ socket: any }>({
  socket: null,
});

export interface SocketEvent {
  event: string;
  data: unknown;
}
/**
 * register websockets 
 * @param param0 
 * @returns 
 */
const SocketProvider: React.FC = ({ children }) => {
  const SocketURL =
    process.env.NODE_ENV === "production"
      ? process.env.REACT_APP_BASE_URL
      : "ws://localhost:3000";

  // we use a ref to store the socket as it won't be updated frequently
  const socket = useRef(
    io(SocketURL + "/reports", {
      autoConnect: true,
    })
  );

  // When the Provider mounts, initialize it 👆
  // and register a few listeners 👇

  useEffect(() => {
    socket.current.on("connect", () => {
      console.log("SocketIO: Connected and authenticated");
    });

    socket.current.on("error", (msg: string) => {
      console.error("SocketIO: Error", msg);
    });

    // Remove all the listeners and
    // close the socket when it unmounts
    return () => {
      if (socket && socket.current) {
        socket.current.removeAllListeners();
        socket.current.close();
      }
    };
  }, []);

  return (
    <SocketContext.Provider value={{ socket: socket.current }}>
      {children}
    </SocketContext.Provider>
  );
};

export default SocketProvider;

/**
 * hook to websocket
 * @param eventName 
 * @param eventHandler 
 */
export const useSocketSubscribe = (eventName: any, eventHandler: any) => {
  // Get the socket instance
  const { socket } = useContext(SocketContext);

  // when the component, *which uses this hook* mounts,
  // add a listener.
  useEffect(() => {
    console.log("SocketIO: adding listener", eventName);
    socket.on(eventName, eventHandler);

    // Remove when it unmounts
    return () => {
      console.log("SocketIO: removing listener", eventName);
      socket?.off(eventName, eventHandler);
    };

    // Sometimes the handler function gets redefined
    // when the component using this hook updates (or rerenders)
    // So adding a dependency makes sure the handler is
    // up to date!
  }, [eventHandler]);
};
