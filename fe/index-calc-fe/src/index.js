import React from "react";
import App from "./app";
import "./global.less";
import "ant-design-draggable-modal/dist/index.css";
import { createRoot } from "react-dom/client";

// Vite 환경 변수를 process.env 형식으로 매핑 (하위 호환성)
if (typeof window !== 'undefined') {
  window.process = window.process || {};
  // 환경 변수 값이 undefined이거나 빈 문자열인 경우 기본값 사용
  const getEnv = (key, defaultValue) => {
    const value = import.meta.env[key];
    return (value && value !== 'undefined' && value.trim() !== '') ? value.trim() : defaultValue;
  };
  
  window.process.env = {
    SERVICE: getEnv('VITE_SERVICE', '/proxy/rest'),
    SERVICENAME: getEnv('VITE_SERVICENAME', 'TWDMA'),
    IS_DEBUG: getEnv('VITE_IS_DEBUG', 'false'),
    ORDERSERVERURL: getEnv('VITE_ORDERSERVERURL', ''),
    CHATSERVERURL: getEnv('VITE_CHATSERVERURL', ''),
    NODE_ENV: import.meta.env.MODE || 'development',
  };
  
  // 디버깅용 - 프로덕션에서도 환경 변수 확인 가능하도록 로깅
  console.log('[Environment Check]', {
    'import.meta.env.VITE_SERVICE': import.meta.env.VITE_SERVICE,
    'window.process.env.SERVICE': window.process.env.SERVICE,
    'import.meta.env.MODE': import.meta.env.MODE,
    'All env vars': window.process.env,
  });
}

// React 18에서 defaultProps 경고 억제 (Ant Design 4.x 호환성)
// Vite WebSocket 프록시 에러 억제
const originalError = console.error;
console.error = (...args) => {
  const errorMessage = args.join(' ');
  
  // React defaultProps 경고 억제
  if (typeof args[0] === 'string' && args[0].includes('Support for defaultProps will be removed')) {
    return;
  }
  
  // Vite WebSocket 프록시 에러 억제
  if (errorMessage.includes('ws proxy socket error') || 
      errorMessage.includes('ECONNABORTED') ||
      errorMessage.includes('ECONNRESET') ||
      errorMessage.includes('EPIPE') ||
      errorMessage.includes('ECONNREFUSED')) {
    return;
  }
  
  originalError.apply(console, args);
};

createRoot(document.getElementById("root")).render(<App />);
