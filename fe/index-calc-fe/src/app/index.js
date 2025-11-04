import { ConfigProvider } from 'antd';
import en from 'antd/lib/locale/en_US';
import React from 'react';
import Interceptor from './Interceptor';
import Redux from './Redux';
import Router from './Router';
import WorkerLoader from './WorkerLoader';
import { QueryClient, QueryClientProvider } from 'react-query';
import SliderOption from '../common/sliderOption';
import index from '../common/index'


const queryClient = new QueryClient();
export default () => {

  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider locale={en}>
        <Redux>
          <WorkerLoader>
            <Interceptor>
              <Router />
            </Interceptor>
          </WorkerLoader>
        </Redux>
      </ConfigProvider>
    </QueryClientProvider>
  );
};
