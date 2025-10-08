import React from "react";
import PageLayout from "../../components/layout";
import SignupForm from "./form";

const SignupPage = () => {
  return (
    <PageLayout>
      <section className="thbit-section thbit-section-form">
        <div className="thbit-wrapper">
          <div className="thbit-inner">
            <SignupForm />
          </div>
        </div>
      </section>
    </PageLayout>
  );
};

export default SignupPage;
