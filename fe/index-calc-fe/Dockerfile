FROM nginx:alpine

# 빌드된 정적 파일을 Nginx 웹 루트로 복사
# public_prod에는 webpack으로 빌드된 파일이 있고, public에는 정적 리소스(css, lib 등)가 있음
COPY public/ /usr/share/nginx/html/
COPY public/css/ /usr/share/nginx/html/css/
COPY public/lib/ /usr/share/nginx/html/lib/
COPY public/images/ /usr/share/nginx/html/images/
COPY public/js/ /usr/share/nginx/html/js/
COPY public/worker/ /usr/share/nginx/html/worker/
COPY public/charting_library/ /usr/share/nginx/html/charting_library/

# Nginx 설정 파일 (선택사항)
# COPY nginx.conf /etc/nginx/conf.d/default.conf

# 포트 노출
EXPOSE 80

# Nginx 시작
CMD ["nginx", "-g", "daemon off;"]

