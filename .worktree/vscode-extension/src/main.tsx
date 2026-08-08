import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ChatWindow } from "./components/ChatWindow";
import "./App.css";

const params = new URLSearchParams(window.location.search);
const chatAgentId = params.get("chat");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {chatAgentId ? <ChatWindow agentId={chatAgentId} /> : <App />}
  </React.StrictMode>,
);
