import React from "react";
import App from "./app";
import "./global.less";
import "ant-design-draggable-modal/dist/index.css";
import { createRoot } from "react-dom/client";

// React 18에서 defaultProps 경고 억제 (Ant Design 4.x 호환성)
const originalError = console.error;
console.error = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('Support for defaultProps will be removed')) {
    return;
  }
  originalError.apply(console, args);
};

createRoot(document.getElementById("root")).render(<App />);
