import { produce } from 'immer';

const initState = {
  symbols: [],
  master_info: [],
};

export default (state = initState, { type, payload }) => {
  switch (type) {
    case 'master/set':
      return produce(state, draft => {
        draft.master_info = payload.master_info || [];
        draft.symbols = payload.symbols || [];
        console.log("master_info=", draft.master_info);
        console.log("symbols=", draft.symbols);
      });
    default:
      return state;
  }
};
