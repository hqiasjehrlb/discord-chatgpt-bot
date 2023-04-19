FROM node:18.14.2-alpine3.16

WORKDIR /opt/chatbot
COPY ./ .
RUN npm i

CMD npm start
