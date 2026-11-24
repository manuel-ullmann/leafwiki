FROM ubuntu:26.04

RUN apt-get update && apt-get install -y \
    git \
    curl \
    build-essential \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace
