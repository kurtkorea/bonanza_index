#!/bin/bash
# MinIO 버킷 정책 설정 스크립트

set -e

NAMESPACE="bonanza-index"
JOB_NAME="minio-setup-bucket-policy"

echo "=========================================="
echo "MinIO 버킷 정책 설정"
echo "=========================================="

# Job이 이미 존재하는지 확인
if kubectl get job ${JOB_NAME} -n ${NAMESPACE} &> /dev/null; then
    echo "기존 Job 삭제 중..."
    kubectl delete job ${JOB_NAME} -n ${NAMESPACE}
    sleep 2
fi

# Job 생성
echo "Job 생성 중..."
kubectl apply -f k8s/minio/setup-bucket-policy.yaml

# Job 완료 대기
echo "Job 실행 대기 중..."
kubectl wait --for=condition=complete --timeout=60s job/${JOB_NAME} -n ${NAMESPACE} || {
    echo "Job 실행 실패. 로그 확인:"
    kubectl logs job/${JOB_NAME} -n ${NAMESPACE}
    exit 1
}

# 로그 출력
echo ""
echo "=========================================="
echo "Job 실행 로그:"
echo "=========================================="
kubectl logs job/${JOB_NAME} -n ${NAMESPACE}

echo ""
echo "=========================================="
echo "버킷 정책 설정 완료!"
echo "=========================================="
echo ""
echo "이제 외부에서 MinIO share link에 접근할 수 있습니다:"
echo "  http://<노드외부IP>:30193/bonanza-index/<파일경로>"
echo ""

