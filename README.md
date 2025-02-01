## Getting Started

docker build -t tjs_next .

docker run -p 3000:3000 tjs_next

docker build -f ./Dockerfile.prod -t tjs_next_prd .

docker run -p 3000:3000 tjs_next_prd
