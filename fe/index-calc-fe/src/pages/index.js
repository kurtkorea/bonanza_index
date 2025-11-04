import React from 'react';
import SliderOption from '../common/sliderOption';
import PageLayout from '../components/layout';

import Login from "./login/form"

import TradePage from './trade';

const MainPage = () => {
  SliderOption();
  return (
    <PageLayout>
      <TradePage />
    </PageLayout>
  );
};

export default MainPage;
