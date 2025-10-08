import { produce } from 'immer';

const initState = { 
  평가담보금 : 0,
  로스컷 : 0,
  평가손익합 : 0,
  실시간손익합 : 0,
  실현손익 : 0,
  USD_KRW : 0,
  국선오버증거금 : 0,
  해선오버증거금 : 0,
  만기일 : "",
  틱가치 : 0,
  오버나잇가능 : 0,
  거래소 : "",

  종목마스터일자 : "",
  종목마스터버젼 : "",

};

export default (state = initState, { type, payload }) => {
  switch (type) {
    case 'balance/master':
      return produce(state, draft => {
        
      });       

    case 'balance/overnight':
      return produce(state, draft => {
        draft.오버나잇가능 = payload.오버나잇가능;  
      });                    
    case 'user/logout': {
      return {
        ...state,
        ...initState,
      };
    }
    default:
      return state;
  }
};
