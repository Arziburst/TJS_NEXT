## Getting Started

docker build -t tjs_next .

docker run -p 3000:3000 tjs_next

docker build -f ./Dockerfile.prod -t arziburst/tjs_next:latest .

docker run -p 3000:3000 tjs_next_prd

docker push arziburst/tjs_next:latest

docker pull arziburst/tjs_next:latest

dokku git:from-image dev arziburst/tjs_next:latest
