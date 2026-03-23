FROM node:25-bookworm

# Install common dev tools and native build dependencies for sharp, canvas, bcrypt
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    wget \
    sudo \
    zsh \
    python3 \
    make \
    g++ \
    libcairo2-dev \
    libjpeg-dev \
    libpango1.0-dev \
    libgif-dev \
    && rm -rf /var/lib/apt/lists/*

# Create a non-root user matching devcontainer conventions
ARG USERNAME=node
RUN echo "$USERNAME ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers.d/$USERNAME

# Install pnpm at the exact version used by the project
RUN npm install -g pnpm@10.30.3

USER $USERNAME
