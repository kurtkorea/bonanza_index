import React from "react";
import Footer from "./footer";
import Header from "./header";
import "./style.less";
import { DraggableModalProvider } from "ant-design-draggable-modal";

const PageLayout = ({ children }) => {
  return (
    <DraggableModalProvider>
      {/* <Header /> */}
      {children}
      {/* <Footer /> */}
    </DraggableModalProvider>
  );
};

export default PageLayout;
