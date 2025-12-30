"use strict";

/**
 * 리더십 상태 관리 모듈
 * 순환 참조를 방지하기 위해 별도 모듈로 분리
 */

let leaderElection = null;
let leaderElectionEnabled = false; // 리더 선출 활성화 여부

/**
 * 리더십 상태 확인
 * @returns {boolean} 리더인지 여부
 */
function isLeader() {
	// 리더 선출이 비활성화된 경우 항상 true (기존 동작)
	if (!leaderElectionEnabled) {
		return true;
	}
	
	// 리더 선출이 활성화되었지만 초기화되지 않은 경우 false 반환
	// (초기화 전에 ZMQ 전송을 방지하기 위함)
	if (!leaderElection) {
		return false;
	}
	
	return leaderElection.isLeader;
}

/**
 * 리더 선출 활성화 여부 설정
 * @param {boolean} enabled - 리더 선출 활성화 여부
 */
function setLeaderElectionEnabled(enabled) {
	leaderElectionEnabled = enabled;
}

/**
 * 리더 선출 인스턴스 설정
 * @param {LeaderElection} election - 리더 선출 인스턴스
 */
function setLeaderElection(election) {
	leaderElection = election;
}

/**
 * 리더 선출 인스턴스 가져오기
 * @returns {LeaderElection|null} 리더 선출 인스턴스
 */
function getLeaderElection() {
	return leaderElection;
}

module.exports = {
	isLeader,
	setLeaderElection,
	getLeaderElection,
	setLeaderElectionEnabled
};

