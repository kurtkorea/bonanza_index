import { produce } from 'immer';

const initState = {
  index_data: {},
};

export default (state = initState, { type, payload }) => {
  switch (type) {   
    case 'fkbrti/init':
      return produce(state, draft => {
        console.log("fkbrti/init", payload);
        draft.index_data = payload;
      });
    case 'fkbrti/update':
      return produce(state, draft => {
        // console.log("fkbrti/update", payload);
        if (Array.isArray(draft.index_data.datalist)) {
          payload = payload.filter(item => !draft.index_data.datalist.some(existingItem => existingItem.createdAt === item.createdAt));
          draft.index_data.datalist = [...payload, ...draft.index_data.datalist].slice(0, 500);
        }
      });
    default:
      return state;
  }
};
