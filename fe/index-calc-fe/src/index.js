import React from "react";
import App from "./app";
import "./global.less";
import "ant-design-draggable-modal/dist/index.css";
import { createRoot } from "react-dom/client";

// Vite 환경 변수를 process.env 형식으로 매핑 (하위 호환성)
if (typeof window !== 'undefined') {
  window.process = window.process || {};
  window.process.env = {
    SERVICE: import.meta.env.VITE_SERVICE || '/proxy/rest',
    SERVICENAME: import.meta.env.VITE_SERVICENAME || 'TWDMA',
    IS_DEBUG: import.meta.env.VITE_IS_DEBUG || 'false',
    ORDERSERVERURL: import.meta.env.VITE_ORDERSERVERURL || '',
    CHATSERVERURL: import.meta.env.VITE_CHATSERVERURL || '',
    NODE_ENV: import.meta.env.MODE || 'development',
  };
}

// React 18에서 defaultProps 경고 억제 (Ant Design 4.x 호환성)
const originalError = console.error;
console.error = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('Support for defaultProps will be removed')) {
    return;
  }
  originalError.apply(console, args);
};

createRoot(document.getElementById("root")).render(<App />);
