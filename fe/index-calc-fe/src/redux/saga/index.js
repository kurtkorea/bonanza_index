import { all } from "redux-saga/effects";
import UserSage from "./UserSage";
import TradeSaga from "./TradeSaga";
import PositionSaga from "./PositionSaga";
import BalanceSaga from "./BalanceSaga";

export default function* rootSaga() {
    yield all([...UserSage, ...TradeSaga, ...PositionSaga, ...BalanceSaga]);
}
