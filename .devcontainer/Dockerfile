FROM debian:latest

ENV DEBIAN_FRONTEND=noninteractive
ENV PROTOC_VERSION="24.2"
ENV PROTOC_GEN_JS_VERSION="3.21.4"
ENV PROTOC_GEN_GRPC_WEB_VERSION="1.5.0"

ARG USERNAME=dev
ARG USER_UID=1000
ARG USER_GID=$USER_UID

# install requirements
RUN apt-get update && apt-get install --assume-yes \
    curl \
    unzip \
    npm \
    nodejs

# install protoc
RUN curl -OL "https://github.com/protocolbuffers/protobuf/releases/download/v${PROTOC_VERSION}/protoc-${PROTOC_VERSION}-linux-x86_64.zip" && \
    unzip -o "./protoc-${PROTOC_VERSION}-linux-x86_64.zip" -d ./proto && \
    chmod 755 -R ./proto/bin && \
    cp ./proto/bin/protoc /usr/bin/ && \
    protoc --version

# install protoc-gen-js
RUN curl -OL "https://github.com/protocolbuffers/protobuf-javascript/releases/download/v${PROTOC_GEN_JS_VERSION}/protobuf-javascript-${PROTOC_GEN_JS_VERSION}-linux-x86_64.zip" && \
    unzip -o "protobuf-javascript-${PROTOC_GEN_JS_VERSION}-linux-x86_64.zip" -d ./protoc-gen-js && \
    chmod 755 -R ./protoc-gen-js/bin && \
    cp ./protoc-gen-js/bin/protoc-gen-js /usr/bin/ 

# install protoc-gen-grpc-web
RUN curl -OL "https://github.com/grpc/grpc-web/releases/download/${PROTOC_GEN_GRPC_WEB_VERSION}/protoc-gen-grpc-web-${PROTOC_GEN_GRPC_WEB_VERSION}-linux-x86_64" && \
    chmod 755 protoc-gen-grpc-web-${PROTOC_GEN_GRPC_WEB_VERSION}-linux-x86_64 && \
    mv protoc-gen-grpc-web-${PROTOC_GEN_GRPC_WEB_VERSION}-linux-x86_64 /usr/bin/protoc-gen-grpc-web 

# cleanup
RUN apt-get clean && \
    rm -rf /var/lib/apt/lists/* && \
    rm -rf ./proto ./protobuf-js

# set up user
RUN groupadd --gid $USER_GID $USERNAME && \
    useradd --shell /bin/bash --uid $USER_UID --gid $USER_GID -m $USERNAME

USER dev
