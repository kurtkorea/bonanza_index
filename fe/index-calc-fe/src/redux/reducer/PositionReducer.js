import { produce } from 'immer';

const initState = {
  positionList: [],
  orderList: [],
};

export default (state = initState, { type, payload }) => {
  switch (type) {
    case 'position/refresh':
      return produce(state, draft => {

      });      
    case 'positionList/init':
      return produce(state, draft => {
        draft.positionList = payload;
      });
    case 'orderList/init':
      return produce(state, draft => {
        draft.orderList = payload;        
      });      
    case 'orderList/update_real':
      return produce(state, draft => { 
        if ( payload.response.service_id == 2001 )  
        {
          //신규주문등록    
          draft.orderList.unshift ( payload.data );
        } else if ( payload.response.service_id == 2002 )  
        { 
          //체결주문
          const copy_arr = [];
          for ( let i=0; i<draft.orderList.length; i++ )
          {
            const item = draft.orderList[i];
            if ( payload.data.volume_unfill == 0 )
            {
              if ( item.order_id != payload.data.order_id )
              {
                copy_arr.push(item);
              }  
            } else {
              if ( item.order_id == payload.data.order_id )
              {
                item.volume = payload.data.volume;
                item.volume_fill = payload.data.volume_fill;
                item.volume_unfill = payload.data.volume_unfill;                
              }
              copy_arr.push(item);
            }
          }
          draft.orderList = copy_arr;
        } else if ( payload.response.service_id == 2003 )  
        { 
          //정정주문
          const copy_arr = [];
          for ( let i=0; i<draft.orderList.length; i++ )
          {
            const item = draft.orderList[i];
            if ( item.order_id == payload.data.order_id && payload.data.volume_unfill > 0 )
            {
              item.price = payload.data.price;
              item.volume = payload.data.volume;
              item.volume_fill = payload.data.volume_fill;
              item.volume_unfill = payload.data.volume_unfill;                 
            }
            copy_arr.push(item);
          }
          draft.orderList = copy_arr;          
        } else if ( payload.response.service_id == 2004 )  
        { 
          //취소주문
          const copy_arr = [];
          for ( let i=0; i<draft.orderList.length; i++ )
          {
            const item = draft.orderList[i];
            if ( item.order_id != payload.data.order_id )
            {
              copy_arr.push(item);
            }
          }
          draft.orderList = copy_arr;
        } else if ( payload.response.service_id == 2005 )  
        { 
          /*
          const copy_arr = [];
          for ( let i=0; i<draft.orderList.length; i++ )
          {
            const item = draft.orderList[i];
            if ( item.order_id != payload.data.order_id )
            {
              copy_arr.push(item);
            }
          }
          draft.orderList = copy_arr;          
          */
        }
      });        
    case 'position/update_real':
      return produce(state, draft => {

        let position = draft.positionList?.find((item) => item.symbol == payload.data.symbol && item.account == payload.data.account);        

        if ( payload.response.service_id == 3001 )  
        {
          //포지션신규        
          if ( position == null )
          {
            draft.positionList.push ( payload.data );
          }
        } else if ( payload.response.service_id == 3002 )  
        {
          //포지션갱신
          if ( position == null )
          {
            draft.positionList.push ( payload.data );
          } else {
            position.sell_volume = payload.data.sell_volume;
            position.volume = payload.data.volume;
            position.curr_price = payload.data.curr_price;
            position.price = payload.data.price;
            position.profit = payload.data.profit;
            position.created_at = payload.data.created_at;
            position.updated_at = payload.data.updated_at;
          }
        } else if ( payload.response.service_id == 3003 )  
        {
          //포지션삭제
          const copy_arr = [];
          for ( let i=0; i<draft.positionList.length; i++ )
          {
            const item = draft.positionList[i];
            if ( item.symbol != payload.data.symbol && item.account == payload.data.account )
            {
              copy_arr.push(item);
            }
          }
          draft.positionList = copy_arr;
        } else if ( payload.response.service_id == 3004 )  
        {
          //손익갱신
          if ( position == null )
          {
            draft.positionList.push ( payload.data );
          } else {
            position.profit = payload.data.profit;
            position.curr_price = payload.data.curr_price;
          }          
        }
      });
    default:
      return state;
  }
};
