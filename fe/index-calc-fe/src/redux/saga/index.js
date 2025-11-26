import { all } from "redux-saga/effects";
import UserSage from "./UserSage";
import MasterSaga from "./MasterSaga";

export default function* rootSaga() {
    yield all([...UserSage, ...MasterSaga]);
}
