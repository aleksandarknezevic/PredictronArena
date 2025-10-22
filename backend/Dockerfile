FROM node:24.3.0-slim


RUN apt-get update && \
    apt-get install -y --no-install-recommends postgresql-client && \
    rm -rf /var/lib/apt/lists/*

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN npm install -g pnpm@9.7.1

WORKDIR /envio-indexer

COPY ./package.json ./package.json
COPY ./pnpm-lock.yaml ./pnpm-lock.yaml

RUN pnpm install --frozen-lockfile

COPY ./config.yaml ./config.yaml
COPY ./schema.graphql ./schema.graphql

RUN pnpm envio codegen

COPY ./ ./

CMD pnpm envio start