# Minimal sandbox image for pi-container-sandbox (x86_64 version)
# Modified to remove SHA256 verification for local build convenience and set to x86_64.

FROM debian:13.4-slim

ARG DEBIAN_FRONTEND=noninteractive
ARG ARCH=x86_64

# ── Base system packages ────────────────────────────────────────────
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
        bash \
        ca-certificates \
        chromium \
        coreutils \
        curl \
        file \
        findutils \
        git \
        jq \
        less \
        libatomic1 \
        make \
        ripgrep \
        sed \
        tar \
        tini \
        unzip \
        xz-utils \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/*

# ── Helper: simplified download and install (no SHA check) ─────────────
RUN printf '#!/bin/sh\nset -e\nURL="$1" OUT="$2"\ncurl -fsSL "$URL" -o "$OUT"\nchmod +x "$OUT"\n' > /usr/local/bin/dl-install \
 && chmod +x /usr/local/bin/dl-install

# ── Modern CLI tools (x86_64) ──────────────────────────────────────

# bat
ARG BAT_VERSION=0.26.1
RUN curl -L https://github.com/sharkdp/bat/releases/download/v${BAT_VERSION}/bat-v${BAT_VERSION}-x86_64-unknown-linux-gnu.tar.gz | tar xz -C /tmp \
 && mv /tmp/bat-v${BAT_VERSION}-x86_64-unknown-linux-gnu/bat /usr/local/bin/bat \
 && rm -rf /tmp/bat*

# fd
ARG FD_VERSION=10.4.2
RUN curl -L https://github.com/sharkdp/fd/releases/download/v${FD_VERSION}/fd-v${FD_VERSION}-x86_64-unknown-linux-gnu.tar.gz | tar xz -C /tmp \
 && mv /tmp/fd-v${FD_VERSION}-x86_64-unknown-linux-gnu/fd /usr/local/bin/fd \
 && rm -rf /tmp/fd*

# eza
ARG EZA_VERSION=0.23.4
RUN curl -L https://github.com/eza-community/eza/releases/download/v${EZA_VERSION}/eza_x86_64-unknown-linux-gnu.tar.gz | tar xz -C /tmp \
 && mv /tmp/eza /usr/local/bin/eza \
 && rm -f /tmp/eza*

# yq
ARG YQ_VERSION=4.53.2
RUN /usr/local/bin/dl-install https://github.com/mikefarah/yq/releases/download/v${YQ_VERSION}/yq_linux_amd64 /usr/local/bin/yq

# ast-grep - FIX: renamed binary from app-x86_64... to ast-grep
ARG AST_GREP_VERSION=0.42.1
RUN curl -L https://github.com/ast-grep/ast-grep/releases/download/${AST_GREP_VERSION}/app-x86_64-unknown-linux-gnu.zip -o /tmp/ast-grep.zip \
 && unzip -o /tmp/ast-grep.zip -d /tmp/ast-grep-out \
 && mv /tmp/ast-grep-out/ast-grep /usr/local/bin/ast-grep \
 && chmod +x /usr/local/bin/ast-grep \
 && rm -rf /tmp/ast-grep.zip /tmp/ast-grep-out

# uv
ARG UV_VERSION=0.11.7
RUN curl -L https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/uv-x86_64-unknown-linux-gnu.tar.gz | tar xz -C /tmp \
 && mv /tmp/uv-x86_64-unknown-linux-gnu/uv /usr/local/bin/uv \
 && mv /tmp/uv-x86_64-unknown-linux-gnu/uvx /usr/local/bin/uvx \
 && rm -rf /tmp/uv*

# ── Python 3.13.9 via uv ──────────────────────────────────────────
ENV UV_PYTHON_DIR=/opt/uv-python
RUN uv python install 3.13.9 \
 && PYTHON_BIN=$(uv python find 3.13.9) \
 && ln -sf "$PYTHON_BIN" /usr/local/bin/python3 \
 && ln -sf "$PYTHON_BIN" /usr/local/bin/python

# ── Wrapper scripts ───────────────────────────────────────────────
RUN printf '#!/bin/sh\nexec bat --paging=never --style=plain "$@"\n' > /usr/local/bin/cat && chmod +x /usr/local/bin/cat
RUN printf '#!/bin/sh\nexec eza --icons "$@"\n' > /usr/local/bin/ls && chmod +x /usr/local/bin/ls
RUN printf '#!/bin/sh\nexec uv pip "$@"\n' > /usr/local/bin/pip && chmod +x /usr/local/bin/pip
RUN printf '#!/bin/sh\nexec uv pip "$@"\n' > /usr/local/bin/pip3 && chmod +x /usr/local/bin/pip3

# ── Runtime: bun ────────────────────────────────────────────────────
ARG BUN_VERSION=1.3.13
RUN curl -L https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/bun-linux-x64.zip -o /tmp/bun.zip \
 && unzip /tmp/bun.zip -d /tmp/bun-out \
 && mv /tmp/bun-out/bun-linux-x64/bun /usr/local/bin/bun \
 && chmod +x /usr/local/bin/bun \
 && ln -sf /usr/local/bin/bun /usr/local/bin/bunx \
 && rm -rf /tmp/bun.zip /tmp/bun-out

# Install prawl globally
RUN bun install -g @thegreataxios/prawl

# ── Node.js v25 (x86_64) ──────────────────────────────────────────
ARG NODE_VERSION=25.9.0
RUN curl -L https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz -o /tmp/node.tar.xz \
 && tar xf /tmp/node.tar.xz -C /usr/local --strip-components=1 \
 && ln -sf /usr/local/bin/node /usr/local/bin/nodejs \
 && rm -f /tmp/node.tar.xz

# ── Final Setup ───────────────────────────────────────────────────
RUN groupadd -g 1000 pi \
 && useradd  -m -u 1000 -g 1000 -s /bin/bash pi \
 && mkdir -p /workspace \
 && chown -R pi:pi /workspace /home/pi

USER pi
WORKDIR /workspace
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["sleep", "infinity"]
