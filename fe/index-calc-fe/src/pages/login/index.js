import React, { useState } from "react";
import PageLayout from "../../components/layout";
import LoginForm from "./form";

const LoginPage = () => {
  const [forgot, setForgot] = useState(false);
  return (
    <PageLayout>
      <section className="thbit-section thbit-section-form">
        <div className="thbit-wrapper">
          <div className="thbit-inner">
            {/* <LoginForm /> */}
            {!forgot && <LoginForm setForgot={setForgot} />}
          </div>
        </div>
      </section>
    </PageLayout>
  );
};

export default LoginPage;
