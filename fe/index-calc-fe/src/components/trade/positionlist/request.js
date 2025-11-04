import { DatePicker } from "antd";
import axios from "axios";
import moment from "moment";
import React, { useState } from "react";
import { useQuery, useQueryClient } from "react-query";
import { useSelector } from "react-redux";
import common from "../../../common";
const { RangePicker } = DatePicker;
import Lang from "../../lang";

const defaultRange = [moment().add(-7, "day"), moment()];

const RequestTable = () => {
  const [searchOption, setSearchOption] = useState({ select: "ALL", range: defaultRange });
  return (
    <>
      <RequestTableSearchbar setSearchOption={setSearchOption} />
      <div className="thbit-trade-table-container" data-simplebar>
        <table className="thbit-trade-table">
        <thead className="sticky head">
						<tr>
							<th><Lang lang_no={33}></Lang></th>
							<th><Lang lang_no={36}></Lang> <em>USDT</em></th>
							<th><Lang lang_no={95}></Lang></th>
							<th><Lang lang_no={98}></Lang></th>
							<th><Lang lang_no={99}></Lang></th>
						</tr>
					</thead>
					<tbody>
						<RequestTableBody searchOption={searchOption} />
					</tbody>
        </table>
      </div>
    </>
  );
};

const RequestTableBody = ({ searchOption }) => {
	const { username, login } = useSelector((store) => store.UserReducer);
	const { data } = useQuery(
		["request", searchOption.select, searchOption.range[0].format("YYYY-MM-DD"), searchOption.range[1].format("YYYY-MM-DD")],
		async () => {
			const { data } = await axios.get(
				process.env.ORDERSERVERURL + "/v1/get_banking_history?id=" + username + "&from_date=" + searchOption.range[0].format("YYYY-MM-DD")
				 + "&to_date=" + searchOption.range[1].format("YYYY-MM-DD"),
			);
			return data;
		},
		{ staleTime: 1000, cacheTime: 1000, enabled: login, refetchOnMount: false, placeholderData: { datalist: [] } },
	);

	return data.datalist.map((item, index) => (
		<tr key={item.time + " + " + index}>
			<td className="center">{item.status_eng}</td>
			<td className="align-r">{common.pricisionFormat(item.amount)}</td>
			<td className="center">{item.status == "1" ? "Complete" : ""}</td>
			<td className="center">{common.convertDate(item.dateRequest)}</td>
			<td className="center">{common.convertDate(item.dateConfirm)}</td>
		</tr>
	));
};

const RequestTableSearchbar = ({ setSearchOption }) => {
	const queryClient = useQueryClient();
	const [range, setRange] = useState(defaultRange);
	const onClickSearch = () => {
		let diff_day = range[1].diff(range[0], 'days');
		if ( diff_day > 30 )
		{
			alert ( " Maximum query days must be under 30days.")
		} else {
			queryClient.invalidateQueries("request")
			setSearchOption({ range });
		}		
	};
  return (
    <div className="thbit-trade-inlineform antd-style">
      <label htmlFor="date_from" className="label" style={{ marginRight: '5px' }}>
      <Lang lang_no={56}></Lang>
      </label>
      <RangePicker className="inp date" defaultValue={range} inputreadOnly={true} onCalendarChange={setRange} />
      <button type="button" onClick={onClickSearch} className="btn">
      <Lang lang_no={69}></Lang>
      </button>
    </div>
  );
};

export default RequestTable;
