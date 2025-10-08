import { produce } from 'immer';
import { constant, isUndefined } from 'lodash';

const initState = {
  program_chart_data : [],
  program_chart_data_1636_ksp : [],

  chart_1636_ksp : [],
  chart_1636_ksp_max_price : 0,
  chart_1636_ksp_min_price : 0,
};

function get_color_by_ranking(ranking){		
	if ( ranking == 1 )
		return "red";
	else if ( ranking == 2 )
		return "blue" ;
	else if ( ranking == 3 )
		return "green" ;	
	else if ( ranking == 4 )
		return "brown" ;		
	else if ( ranking == 5 )
		return "purple" ;		
	else if ( ranking == 6 )
		return "orange" ;		
	else if ( ranking == 7 )
		return "yellow" ;		
	else if ( ranking == 8 )
		return "gray" ;		
	else if ( ranking == 9 )
		return "black" ;		
	else if ( ranking == 10 )
		return "#666666" ;		
}  

export default (state = initState, { type, payload }) => {
  switch (type) {

    case 'trade/program_chart_data':
      return produce(state, draft => {
        draft.program_chart_data = payload;
    }); 

    case 'trade/program_chart_data_1636_ksp':
      return produce(state, draft => {
        draft.program_chart_data_1636_ksp = payload;

        let last_series_arr = new Map();
        let series_map = new Map();
        for ( let i = 0; i < 10; i++ )
        {
          const item = payload?.datalist[i];
          last_series_arr.set( item.symbol, item );
        }

        for ( let i = 0; i < payload?.datalist?.length; i++ )
        {
          const item = payload?.datalist[i];
          item.time = item.time.substring(0, 2) + ":" + item.time.substring(2, 4) + ":" + item.time.substring(4, 6);

          if ( last_series_arr.has( item.symbol ) )
          {         
            const last_item = last_series_arr.get( item.symbol );
            if ( series_map.has( item.symbol ) )
            {              
              let series_item = series_map.get( item.symbol );
              series_item.color = get_color_by_ranking( last_item.ranking )
              series_item["data"].unshift( item );
            }
            else
            {
              let series_item = {
                name : item.symbol_name,
                symbol : item.symbol,
                ranking : last_item.ranking,
                color : get_color_by_ranking( last_item.ranking ),
                data : new Array(),
              }
              series_item.data.unshift( item );
              series_map.set( item.symbol, series_item );
            }
          }
        }

        draft.chart_1636_ksp = Array.from(series_map.values());
        draft.chart_1636_ksp = Array.from(series_map.values()).slice(0, 5);

        console.log("chart_1636_ksp", draft.chart_1636_ksp[0]);
    }); 

    default:
      return state;
  }
};
