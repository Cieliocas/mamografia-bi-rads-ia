FROM nvidia/cuda:12.4.1-devel-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    curl \
    git \
    build-essential \
    pkg-config \
    python3.11 \
    python3.11-dev \
    python3.11-venv \
    python3-pip \
    ca-certificates \
    gnupg \
    lsb-release \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get update && apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://go.dev/dl/go1.22.8.linux-amd64.tar.gz -o /tmp/go.tar.gz && \
    rm -rf /usr/local/go && tar -C /usr/local -xzf /tmp/go.tar.gz && \
    rm /tmp/go.tar.gz

ENV PATH="/usr/local/go/bin:${PATH}"
WORKDIR /workspace

COPY . /workspace

RUN python3.11 -m venv /opt/venv && \
    /opt/venv/bin/pip install --upgrade pip && \
    /opt/venv/bin/pip install -r apps/ai-engine/requirements.txt

ENV PATH="/opt/venv/bin:${PATH}"
CMD ["bash"]
